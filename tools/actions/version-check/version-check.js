"use strict";

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

function parseVersion(value) {
  if (typeof value !== "string") {
    throw new Error(`Version must be a string; received ${String(value)}.`);
  }
  const match = SEMVER_PATTERN.exec(value);
  if (!match || match[0] !== value) {
    throw new Error(`Invalid SemVer version: ${value}.`);
  }
  return {
    raw: value,
    major: BigInt(match[1]),
    minor: BigInt(match[2]),
    patch: BigInt(match[3]),
    prerelease: match[4] ? match[4].split(".") : [],
  };
}

function compareIdentifiers(left, right) {
  const leftNumeric = /^\d+$/.test(left);
  const rightNumeric = /^\d+$/.test(right);
  if (leftNumeric && rightNumeric) {
    const leftValue = BigInt(left);
    const rightValue = BigInt(right);
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  }
  if (leftNumeric !== rightNumeric) {
    return leftNumeric ? -1 : 1;
  }
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareVersions(left, right) {
  for (const part of ["major", "minor", "patch"]) {
    if (left[part] !== right[part]) {
      return left[part] < right[part] ? -1 : 1;
    }
  }

  if (!left.prerelease.length || !right.prerelease.length) {
    if (left.prerelease.length === right.prerelease.length) {
      return 0;
    }
    return left.prerelease.length ? -1 : 1;
  }

  const sharedLength = Math.min(
    left.prerelease.length,
    right.prerelease.length
  );
  for (let index = 0; index < sharedLength; index += 1) {
    const result = compareIdentifiers(
      left.prerelease[index],
      right.prerelease[index]
    );
    if (result !== 0) {
      return result;
    }
  }
  return Math.sign(left.prerelease.length - right.prerelease.length);
}

function getVersionChange(previous, current) {
  if (current.major !== previous.major) {
    return current.prerelease.length ? "premajor" : "major";
  }
  if (current.minor !== previous.minor) {
    return current.prerelease.length ? "preminor" : "minor";
  }
  if (current.patch !== previous.patch) {
    return current.prerelease.length ? "prepatch" : "patch";
  }
  if (previous.prerelease.length && !current.prerelease.length) {
    if (previous.patch !== 0n) {
      return "patch";
    }
    return previous.minor !== 0n ? "minor" : "major";
  }
  return "prerelease";
}

function assertVersionIncrease(previousVersion, currentVersion) {
  const previous = parseVersion(previousVersion);
  const current = parseVersion(currentVersion);
  if (compareVersions(current, previous) <= 0) {
    throw new Error(
      `package.json version ${currentVersion} must be greater than target version ${previousVersion}.`
    );
  }
  return { previous, current, semver: getVersionChange(previous, current) };
}

function getBaseVersion({ eventName, event, runGit }) {
  let target;
  if (eventName === "pull_request") {
    target = event?.pull_request?.base?.sha;
    if (typeof target !== "string" || !/^[0-9a-f]{40}$/i.test(target)) {
      throw new Error(
        "Pull request payload is missing a valid base commit SHA."
      );
    }
  } else if (eventName === "workflow_dispatch") {
    target = "refs/heads/master";
  } else {
    throw new Error(`Unsupported GitHub event: ${String(eventName)}.`);
  }

  try {
    runGit(["fetch", "--no-tags", "--depth=1", "origin", target]);
    const packageJson = runGit(["show", "FETCH_HEAD:package.json"]);
    const parsed = JSON.parse(packageJson);
    if (typeof parsed.version !== "string") {
      throw new Error("Target package.json is missing a string version.");
    }
    return parsed.version;
  } catch (error) {
    throw new Error(
      `Could not read target package.json version: ${error.message}`
    );
  }
}

module.exports = {
  assertVersionIncrease,
  compareVersions,
  getBaseVersion,
  getVersionChange,
  parseVersion,
};
