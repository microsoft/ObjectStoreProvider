"use strict";

const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { assertVersionIncrease, getBaseVersion } = require("./version-check");

function escapeWorkflowCommand(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function run() {
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd();
  const eventName = process.env.GITHUB_EVENT_NAME;
  const eventPath = process.env.GITHUB_EVENT_PATH;

  if (!eventPath) {
    throw new Error("GITHUB_EVENT_PATH is not set.");
  }

  let event;
  try {
    event = JSON.parse(fs.readFileSync(eventPath, "utf8"));
  } catch (error) {
    throw new Error(`Could not read GitHub event payload: ${error.message}`);
  }

  const runGit = (args) =>
    execFileSync("git", args, {
      cwd: workspace,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const baseVersion = getBaseVersion({ eventName, event, runGit });
  const currentPackage = JSON.parse(
    fs.readFileSync(path.join(workspace, "package.json"), "utf8")
  );
  const currentVersion = currentPackage.version;
  const { semver } = assertVersionIncrease(baseVersion, currentVersion);
  const outputPath = process.env.GITHUB_OUTPUT;
  if (!outputPath) {
    throw new Error("GITHUB_OUTPUT is not set.");
  }
  fs.appendFileSync(
    outputPath,
    `semver=${semver}\nversion=${currentVersion}\n`,
    "utf8"
  );
}

if (require.main === module) {
  try {
    run();
  } catch (error) {
    console.error(`::error::${escapeWorkflowCommand(error.message)}`);
    process.exitCode = 1;
  }
}

module.exports = { escapeWorkflowCommand, run };
