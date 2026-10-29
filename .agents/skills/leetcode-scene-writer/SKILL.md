---
name: leetcode-scene-writer
description: Author a LeetCode scene after a solution is accepted. Use when a problem's locked tests pass and it needs a scene module, panel choices, and a manifest scene path so its problem page shows phases instead of a raw trace.
---

# Write a LeetCode scene

A scene picks the few lines of an accepted solution that explain its algorithm,
gives each line a phase and one sentence of prose, and chooses the values to
draw beside it. The scene is data; the panel registry draws.

## Solutions carry no documentation

Strip the frozen copy down to code before writing a scene. Delete the module
docstring, any Intuition/Approach/Complexity block, any `@lc` header, the
TypedDict and helper docstrings, and every comment above the `tests` list. Keep
the `tests` list and the `VIZ_CASE` guard, which the runner requires.

The page draws the whole file in a code card that has no height cap and no
scroll-to-current-line, so the card scrolls the page instead of itself. Each
line above the algorithm is about 19px of that card. The 542 copy carried 93
lines of documentation above `class Solution`, which put its first traced line
roughly 1800px down the page, past the bottom of the window. A stripped copy
starts the same algorithm at line 12.

Stripping never changes the steps. The tracer emits a step only for a code line,
and every quote re-resolves from normalized text on each load, so a stripped
copy keeps its scenes as long as the quoted lines survive intact. Never quote a
comment line.

`tests/test_solution_style.py` enforces the rule. After stripping, recompute the
file's sha256 and set `stripped = true` on its row in
`viz/solutions/provenance.toml`; `tests/test_golden_solutions.py` pins the
digest.

## Read first

Read all of these before writing anything:

- The frozen solution copy at
  `/home/joey/repos/leetcode-visualization/viz/solutions/{number}.*.py`. Read the
  whole file; the quotes must come from the exact current text. The copy is
  pinned by a checksum: a quote that no longer resolves means the copy is stale,
  so re-copy the accepted file, strip its documentation, and update
  `viz/solutions/provenance.toml` — never reshape the copy's code to make a
  scene fit.
- The statement at
  `/home/joey/repos/leetcode-visualization/viz/statements/{number}.md`. If the
  file does not exist yet, continue and say so in your summary.
- The scene contract at
  `/home/joey/repos/leetcode-visualization/docs/scene-dsl.md`.
- The panel kinds and their value shapes at
  `/home/joey/repos/leetcode-visualization/web/src/panels/registry.tsx`.

The problem is ready for a scene when its manifest row in
`/home/joey/repos/leetcode-visualization/viz/manifest.py` has an `accepted` date.
That date means the solution's locked tests pass, so do not change the solution
to make a scene fit.

## Choose the steps

Pick 4 to 8 lines that mark the algorithm's decision points: setup, the loop
advance, a branch or jump, the main operation, a restore or undo, and the
return. Do not quote bookkeeping lines that no reader needs.

For each chosen line, note what is true on entry to it. A step fires on the line
event, before the line runs, so a name that the line assigns is not available
in that step's log or panels.

Make every quote a single source line. Copy the text from the file, and use the
optional `occurrence` when the same normalized line appears more than once.

## Write the scene

Create `/home/joey/repos/leetcode-visualization/viz/scenes/{number}.py` with one
`SCENE` dict, following the contract you read. Give every phase a panel entry,
and pick each panel's kind from the registry. A panel name and every log
placeholder must be held by a traced frame at every step that uses it — unless
the panel is listed in `persistent`, which is drawn only where its frame holds it
— so check the enclosing frames too.

Set the problem's manifest row: an `accepted` date, `"scene":
"viz/scenes/{number}.py"`, and the skip list for unwatchable cases.

Choose panels per idea, not per phase. The queue, heap, map, stack, or count array
the algorithm mutates goes in `SCENE["persistent"]`, with its `(name, kind)` pair
written once in the phase where it is introduced; every other phase then lists
only its own values. A static input such as `wordList` or `taskCounts` stays in
the phase that reads it, and a one-shot result belongs to its answer phase. A
persistent panel is drawn at every step whose frame holds it, so the reader
watches the container change instead of watching it disappear and come back.

In a tree recursion, put the reserved `@tree` panel in `persistent` and write its
`(name, kind)` pair in the first phase. It draws the case's input tree with the
node this step is about ringed, and the mark follows the innermost frame's `root`
or `node`, so a nested helper such as `dfs(node)` works too. Drop per-phase
subtree panels: keep `@tree`, the scalars each phase reads, and `@stack`. `@tree`
is the one reserved name a scene may mark persistent.

## See it in the browser

From `/home/joey/repos/leetcode-visualization`, start the server:

```bash
uv run viz serve --port 8123
```

Open `http://127.0.0.1:8123/problem/{number}?case=N` for a case that reaches
every phase. Confirm the phase rail lists them all, each panel draws a real
value for its kind, no core container disappears between phases, the tree keeps
one shape while its ring moves, each prose line describes the state on entry, no
missing-phase note appears, and the highlighted line sits near the top of the
code card rather than below the fold.

## Fix only the scene

If the page shows a loader error, read the message: it names the scene file and
the quote. Fix the quote, the phase, the panel name, or the log template in the
scene. Never change the copy's code to make a scene fit. Stripping documentation
is the one sanctioned edit to a copy, and it happens at freeze time, not to
rescue a scene. Never ignore a missing panel or a missing phase silently. Re-run
the scene check until the page renders cleanly.

Stop the server when finished.
