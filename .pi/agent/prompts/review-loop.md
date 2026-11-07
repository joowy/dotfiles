---
description: Review/fix loop until clean
---

Run a parent-orchestrated review loop for the requested work.

Use the `Agent` tool. Keep the parent session as the loop controller and final decision-maker. Child agents must receive concrete role-specific tasks; they must not spawn agents or manage the loop themselves.

Default to a maximum of 3 review rounds unless I specify a different cap. Count a review round each time fresh-context reviewers inspect the current diff after a worker pass. Stop early when reviewers find no P0 findings, no P1 fixes worth doing now, and no approved P2 notes that should be handled in this loop.

If the invocation includes an implementation request, first launch one background `worker` (`run_in_background: true`) to implement the approved scope, then continue with review rounds as its completion is delivered. If the current diff is already the target, start with review. Use only one writer against the active worktree at a time unless I explicitly ask for isolated worktrees via `worktree_path`.

As a conservative orchestration policy, do not cap implementation or fix workers with tight turn limits — a tight limit can abort delivery mid-edit. Give each writer a narrow delivery slice and an outer deadline with enough margin. Before that deadline, request a checkpoint with changed files, build/test state, remaining work, and commit or PR state. An elapsed timeout is not a mutation-safe boundary and must not be the checkpoint trigger.

For each review round, launch fresh-context `reviewer` agents in parallel. Reviewers must inspect the repository, relevant instructions, and current diff directly from files and commands. They must not rely on the main conversation history and must not edit files.

Tell reviewers to filter on evidence, not severity. They should report only concrete current issues caused or made reachable by the target diff, with source proof, a test or repro, or a contract contradiction. Ask them to label findings P0/P1/P2 and end with `Merge verdict: BLOCK`, `Merge verdict: OK`, or `Merge verdict: OK with notes`. P0 blocks merge. P1 should be fixed before release. P2 is report-only. Use `blockers only` only for final pre-merge re-checks after P1/P2 findings are already captured, or for explicit emergency hotfix lanes.

Choose review angles from the actual change. Common angles are correctness/regressions, tests/validation, and simplicity/maintainability. Add security, performance, docs/API contracts, or user-flow validation when the work calls for it. Prefer three strong reviewers over many vague reviewers.

After reviewers return, synthesize their feedback into:
- P0 blockers or scope/product/architecture decisions that need user approval;
- P1 fixes worth doing now;
- P2 report-only notes or optional improvements;
- feedback to ignore or defer, with a short reason.

Do not blindly apply every reviewer suggestion. If reviewers surface an unapproved product, scope, or architecture decision, pause and ask me before launching a fix worker.

When a background implementation worker completes, treat its handoff as the transition into review, not as final completion, unless I explicitly asked for worker-only work, review-only output, or to stop after implementation.

When there are fixes worth doing now and the work is implementation-authorized, launch one background `worker` without tight turn limits to apply only those synthesized fixes. Ask it to preserve the approved scope, run focused validation, and report changed files, commands run with exit codes, validation evidence, surprises, and anything left undone.

After a fix worker returns, run another review round only when it made material changes or addressed non-trivial findings. Do not keep looping for optional polish, speculative improvements, or findings already deferred by the parent.

For a targeted follow-up review, ask only three questions: whether the named finding was resolved, whether the fix introduced a new concrete defect in the fix blast radius, and whether prior P1/P2 notes still stand. End with a fix verdict and the merge verdict.

Stop and summarize when one of these is true:
- reviewers find no P0 blockers or P1 fixes worth doing now;
- remaining feedback is optional, speculative, or intentionally deferred;
- reviewers surface an unapproved decision that needs me;
- the max review-round cap is reached.

On completion, inspect the final diff yourself, run or confirm focused validation where appropriate, and summarize the loop: rounds run, fixes applied, validation, remaining deferred items, and why the loop stopped.

Additional target, implementation request, max-iteration cap, or review focus from the slash command invocation:

$@
