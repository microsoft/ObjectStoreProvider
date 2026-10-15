"use strict";

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const {
  assertVersionIncrease,
  compareVersions,
  getBaseVersion,
  getVersionChange,
  parseVersion,
} = require("../version-check");
const { escapeWorkflowCommand } = require("../index");

test("compares SemVer core and prerelease identifiers", () => {
  const versions = [
    "1.0.0-alpha",
    "1.0.0-alpha.2",
    "1.0.0-alpha.10",
    "1.0.0-beta",
    "1.0.0",
  ].map(parseVersion);
  for (let index = 1; index < versions.length; index += 1) {
    assert.equal(compareVersions(versions[index], versions[index - 1]), 1);
  }
  assert.equal(
    compareVersions(parseVersion("1.0.0+first"), parseVersion("1.0.0+second")),
    0
  );
  assert.equal(
    compareVersions(
      parseVersion("999999999999999999999.0.0"),
      parseVersion("999999999999999999998.0.0")
    ),
    1
  );
});

test("rejects malformed SemVer, including leading zeroes", () => {
  for (const invalid of [
    "01.0.0",
    "1.0.0-01",
    "1.0",
    "v1.0.0",
    "1.0.0-",
    "1.2.4\n",
    "1.2.4\r",
    "1.2.4\r\n",
  ]) {
    assert.throws(() => parseVersion(invalid), /Invalid SemVer/);
  }
  assert.throws(() => parseVersion(null), /must be a string/);
});

test("classifies accepted version increases", () => {
  const cases = [
    ["1.2.3", "2.0.0", "major"],
    ["1.2.3", "1.3.0", "minor"],
    ["1.2.3", "1.2.4", "patch"],
    ["1.2.3", "2.0.0-rc.1", "premajor"],
    ["1.2.3", "1.3.0-beta", "preminor"],
    ["1.2.3", "1.2.4-beta", "prepatch"],
    ["1.2.3-alpha", "1.2.3-beta", "prerelease"],
    ["1.2.3-rc.1", "1.2.3", "patch"],
    ["1.0.0-rc", "1.0.0", "major"],
    ["0.1.0-rc", "0.1.0", "minor"],
  ];
  for (const [previous, current, expected] of cases) {
    assert.equal(
      getVersionChange(parseVersion(previous), parseVersion(current)),
      expected
    );
  }
});

test("requires a strict SemVer increase", () => {
  for (const version of ["1.2.3", "1.2.3+build.2", "1.2.2"]) {
    assert.throws(
      () => assertVersionIncrease("1.2.3+build.1", version),
      /must be greater than target version/
    );
  }
  assert.equal(assertVersionIncrease("1.2.3", "1.2.4").semver, "patch");
});

test("fetches the exact pull request base commit and reads its package version", () => {
  const calls = [];
  const version = getBaseVersion({
    eventName: "pull_request",
    event: { pull_request: { base: { sha: "a".repeat(40) } } },
    runGit(args) {
      calls.push(args);
      return args[0] === "show" ? '{"version":"1.2.3"}' : "";
    },
  });
  assert.equal(version, "1.2.3");
  assert.deepEqual(calls, [
    ["fetch", "--no-tags", "--depth=1", "origin", "a".repeat(40)],
    ["show", "FETCH_HEAD:package.json"],
  ]);
});

test("manual dispatch targets master and rejects invalid or unsupported context", () => {
  const calls = [];
  getBaseVersion({
    eventName: "workflow_dispatch",
    event: {},
    runGit(args) {
      calls.push(args);
      return args[0] === "show" ? '{"version":"1.0.0"}' : "";
    },
  });
  assert.equal(calls[0].at(-1), "refs/heads/master");
  assert.throws(
    () =>
      getBaseVersion({
        eventName: "pull_request",
        event: { pull_request: { base: { sha: "not-a-sha" } } },
        runGit() {},
      }),
    /valid base commit SHA/
  );
  assert.throws(
    () => getBaseVersion({ eventName: "push", event: {}, runGit() {} }),
    /Unsupported GitHub event/
  );
});

test("reports fetch and target package failures clearly", () => {
  assert.throws(
    () =>
      getBaseVersion({
        eventName: "workflow_dispatch",
        event: {},
        runGit() {
          throw new Error("fatal: could not fetch");
        },
      }),
    /Could not read target package.json version: fatal: could not fetch/
  );
  assert.throws(
    () =>
      getBaseVersion({
        eventName: "workflow_dispatch",
        event: {},
        runGit(args) {
          return args[0] === "show" ? '{"version":1}' : "";
        },
      }),
    /missing a string version/
  );
});

test("escapes workflow error annotation control characters", () => {
  assert.equal(escapeWorkflowCommand("a%b\r\nc"), "a%25b%0D%0Ac");
});

test("runs the action against a shallow local clone", (t) => {
  const root = fs.mkdtempSync(path.join(process.cwd(), ".version-check-e2e-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const origin = path.join(root, "origin.git");
  const source = path.join(root, "source");
  const workspace = path.join(root, "workspace");
  const eventPath = path.join(root, "event.json");
  const outputPath = path.join(root, "output.txt");
  const entrypoint = path.resolve(__dirname, "..", "index.js");
  const gitEnv = Object.fromEntries(
    Object.entries({
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SYSTEMROOT: process.env.SYSTEMROOT,
      ComSpec: process.env.ComSpec,
      PATHEXT: process.env.PATHEXT,
      TEMP: process.env.TEMP,
      TMP: process.env.TMP,
      HOME: root,
      USERPROFILE: root,
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: path.join(root, "gitconfig"),
    }).filter(([, value]) => value !== undefined)
  );
  const git = (args, cwd) =>
    execFileSync("git", args, {
      cwd,
      env: gitEnv,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commitPackage = (contents) => {
    fs.writeFileSync(path.join(source, "package.json"), contents);
    git(["add", "package.json"], source);
    git(["commit", "-m", "Set package version"], source);
    return git(["rev-parse", "HEAD"], source);
  };

  git(["init", "--bare", "--initial-branch=master", origin], root);
  git(["init", "--initial-branch=master", source], root);
  git(["config", "user.name", "Version Check Test"], source);
  git(["config", "user.email", "version-check@example.invalid"], source);
  const baseSha = commitPackage('{"version":"1.2.3"}\n');
  const malformedSha = commitPackage("{\n");
  const missingSha = commitPackage("{}\n");
  const nonStringSha = commitPackage('{"version":42}\n');
  commitPackage('{"version":"1.2.4"}\n');
  git(["remote", "add", "origin", pathToFileURL(origin).href], source);
  git(["push", "origin", "master"], source);
  git(
    [
      "clone",
      "--depth=1",
      "--single-branch",
      "--branch",
      "master",
      pathToFileURL(origin).href,
      workspace,
    ],
    root
  );

  const runAction = ({
    event = { pull_request: { base: { sha: baseSha } } },
    eventName = "pull_request",
  } = {}) => {
    fs.writeFileSync(
      eventPath,
      typeof event === "string" ? event : JSON.stringify(event)
    );
    fs.writeFileSync(outputPath, "");
    const env = {
      ...gitEnv,
      GITHUB_WORKSPACE: workspace,
      GITHUB_EVENT_NAME: eventName,
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_OUTPUT: outputPath,
    };
    try {
      execFileSync(process.execPath, [entrypoint], {
        cwd: workspace,
        env,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
      return { status: 0, stderr: "" };
    } catch (error) {
      return { status: error.status, stderr: error.stderr };
    }
  };
  const assertFailureWithoutOutput = (options, message) => {
    const result = runAction(options);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, message);
    assert.equal(fs.readFileSync(outputPath, "utf8"), "");
  };

  assert.throws(
    () => git(["cat-file", "-e", `${baseSha}^{commit}`], workspace),
    /(?:not a valid object name|could not get object info|bad object)/i
  );
  assert.deepEqual(runAction(), { status: 0, stderr: "" });
  assert.equal(
    fs.readFileSync(outputPath, "utf8"),
    "semver=patch\nversion=1.2.4\n"
  );
  assert.doesNotThrow(() =>
    git(["cat-file", "-e", `${baseSha}^{commit}`], workspace)
  );

  for (const version of ["1.2.3", "1.2.2"]) {
    fs.writeFileSync(
      path.join(workspace, "package.json"),
      JSON.stringify({ version })
    );
    assertFailureWithoutOutput(
      undefined,
      /must be greater than target version/
    );
  }
  fs.writeFileSync(
    path.join(workspace, "package.json"),
    '{"version":"1.2.4"}\n'
  );

  assertFailureWithoutOutput(
    { event: "{" },
    /Could not read GitHub event payload/
  );
  assertFailureWithoutOutput(
    { eventName: "push", event: {} },
    /Unsupported GitHub event/
  );
  assertFailureWithoutOutput(
    { event: { pull_request: { base: { sha: "f".repeat(40) } } } },
    /Could not read target package.json version/
  );
  for (const [sha, message] of [
    [malformedSha, /Could not read target package.json version:/],
    [missingSha, /missing a string version/],
    [nonStringSha, /missing a string version/],
  ]) {
    assertFailureWithoutOutput(
      { event: { pull_request: { base: { sha } } } },
      message
    );
  }
});
