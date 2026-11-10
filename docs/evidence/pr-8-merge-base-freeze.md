# PR-8 Merge-base Freeze

## Frozen base

PR-8 starts from the PR-7 merge commit:

```text
00790a5ae73a271f6424dee042c4f607de6939ce
```

Commit subject:

```text
Merge pull request #31 from devsecurelab/engine/i-batch-2026-10-pr-7
```

The branch for this work is:

```text
engine/i-batch-2026-10-pr-8
```

The intended base branch is `main`.

## Verification

At freeze time, `main` pointed to the commit above, the working tree was clean, and the PR-7 merge commit was an ancestor of the new PR-8 branch. The freeze can be rechecked with:

```bash
git show -s --format='%H%n%P%n%s' 00790a5

git merge-base --is-ancestor 00790a5 HEAD

git status --short --branch
```

## Scope guard

This commit only records the PR-8 starting point. It does not change strategy thresholds, R8 golden expectations, Gate 4 parity, or `v3_safety_invariants`.
