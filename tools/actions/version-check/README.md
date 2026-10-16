# Package version check action

This repository-local action requires the root `package.json` version to be a
valid SemVer version strictly greater than the version on the target commit.
It compares against the pull request's base commit, or against `master` when
run manually with `workflow_dispatch`. As a result, a manual run fails unless
the current package version is higher than `master`.

Equal versions, downgrades, build-metadata-only changes, and invalid versions
fail the workflow. Successful runs expose `version` and `semver` outputs; the
latter classifies the increase as `major`, `minor`, `patch`, `premajor`,
`preminor`, `prepatch`, or `prerelease`.
Promoting a prerelease to the stable version with the same numeric components
is classified as the corresponding release bump: for example,
`1.2.3-rc.1` to `1.2.3` is `patch`, while `0.1.0-rc` to `0.1.0` is `minor`.

The action fetches only the selected target commit with shallow depth, so it
also works with the workflow's shallow checkout. It uses Node.js built-ins and
does not require action inputs or additional packages.

Run the focused tests from the repository root with:

```sh
node --test tools/actions/version-check/test/*.test.js
```

This action is a dependency-free rewrite of the version-check behavior inspired
by [actions-project-version-check](https://github.com/thomastay/actions-project-version-check).
Upstream MIT notice: Copyright (c) 2020 AVIDES Media AG. See the repository
[LICENSE](../../../LICENSE).
