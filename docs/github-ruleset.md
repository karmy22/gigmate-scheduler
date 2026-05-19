# GitHub Ruleset Setup

Use this after merging the CI workflow in this branch.

## Main branch ruleset

Create a repository ruleset in GitHub at:

`Settings -> Rules -> Rulesets -> New ruleset -> New branch ruleset`

Recommended settings:

- Name: `Protect main`
- Enforcement status: `Active`
- Target branches: include default branch, or include by pattern `main`
- Restrict deletions: enabled
- Block force pushes: enabled
- Require a pull request before merging: enabled
- Required approvals: `1`
- Dismiss stale pull request approvals when new commits are pushed: enabled
- Require conversation resolution before merging: enabled
- Require status checks to pass: enabled
- Required check: `Build and lint`
- Require branches to be up to date before merging: enabled
- Require linear history: optional; enable only if you want squash/rebase-only merges

## Notes

Do not enable the required `Build and lint` check until `.github/workflows/ci.yml` is merged into `main` and the check has run at least once. Otherwise, GitHub can block merges while waiting for a check that has not appeared on the default branch yet.

For a solo-maintained repo, requiring one approval can make emergency fixes slower. If that is too strict, keep pull requests and required checks enabled, but set approvals to `0` until another reviewer is available.
