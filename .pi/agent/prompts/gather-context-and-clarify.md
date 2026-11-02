---
description: Use subagents to gather context, then ask clarifying questions
---

Based on our discussion and my intent, launch focused context-gathering agents before planning or implementing.

Use the `Agent` tool with `Explore` agents to inspect the relevant local files, existing patterns, constraints, tests, and likely integration points. When external docs, recent sources, ecosystem context, or primary evidence would improve the answer, gather it yourself using the `ketch` skill and direct fetches.

Give each agent a specific meta prompt. Ask them to return concise findings plus the remaining clarification questions that matter for implementation confidence.

After they return, synthesize what we know and use the `ask_user_question` tool to ask me the unresolved questions needed to reach a shared understanding.

$@
