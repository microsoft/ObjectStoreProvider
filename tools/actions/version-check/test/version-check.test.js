"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
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
  for (const [packageJson, message] of [
    ["{", /Could not read target package.json version:/],
    ["{}", /missing a string version/],
    ['{"version":1}', /missing a string version/],
  ]) {
    assert.throws(
      () =>
        getBaseVersion({
          eventName: "workflow_dispatch",
          event: {},
          runGit(args) {
            return args[0] === "show" ? packageJson : "";
          },
        }),
      message
    );
  }
});

test("escapes workflow error annotation control characters", () => {
  assert.equal(escapeWorkflowCommand("a%b\r\nc"), "a%25b%0D%0Ac");
});
