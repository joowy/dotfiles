---
name: leetcode-scene-writer
description: Author a LeetCode scene after a solution is accepted. Use when a problem's locked tests pass and it needs a scene module, panel choices, and a manifest scene path so its problem page shows phases instead of a raw trace.
---

# Write a LeetCode scene

A scene picks the few lines of an accepted solution that explain its algorithm,
gives each line a phase and one sentence of prose, and chooses the values to
draw beside it. The scene is data; the panel registry draws.

## Read first

Read all of these before writing anything:

- The solution file for the problem in `/home/joey/repos/LeetCode/Python/`,
  matched as `{number}.*.py`. Read the whole file; the quotes must come from the
  exact current text.
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

## See it in the browser

From `/home/joey/repos/leetcode-visualization`, start the server:

```bash
uv run viz serve --port 8123
```

Open `http://127.0.0.1:8123/problem/{number}?case=N` for a case that reaches
every phase. Confirm the phase rail lists them all, each panel draws a real
value for its kind, no core container disappears between phases, each prose line
describes the state on entry, and no missing-phase note appears.

## Fix only the scene

If the page shows a loader error, read the message: it names the scene file and
the quote. Fix the quote, the phase, the panel name, or the log template in the
scene. Never edit the accepted solution to make a scene fit, and never ignore a
missing panel or a missing phase silently. Re-run the scene check until the page
renders cleanly.

Stop the server when finished.
