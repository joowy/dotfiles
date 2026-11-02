---
description: Parallel subagents research
---

Launch parallel research agents to build a grounded answer to the current question or decision.

Use the `Agent` tool with `Explore` agents. Agents run with fresh context, so they must inspect sources directly instead of relying on the main conversation history. Give each agent the full question, scope, and any needed background in its prompt.

Use `Explore` agents for local codebase context: existing implementation patterns, repo constraints, and files that would be affected. Gather external evidence yourself with the `ketch` skill and direct fetches; you have no research agent.

Give each angle a distinct owner. Unless I specify angles, use these three:

1. External evidence
   Do this yourself, not in an agent. Use the `ketch` skill to find current, authoritative sources: official docs, specs, release notes, benchmarks, issue threads, or primary explanations.

2. Local code context
   Use an `Explore` agent to inspect the repository for relevant files, existing patterns, constraints, tests, and likely integration points.

3. Practical tradeoffs
   Use an `Explore` agent for local cost and risk, and reason about the rest yourself. Compare options, risks, edge cases, maintenance cost, and what would be easiest to validate.

Adapt the angles when the question calls for it:
- Library/API questions: include official docs and recent examples.
- Architecture decisions: include local module boundaries, dependency direction, and migration cost.
- Debugging questions: include likely failure modes, local call paths, and exact error evidence.
- UI/product questions: include user flow, accessibility, design precedent, and implementation constraints.
- Time-sensitive topics: include a recent-developments angle and prefer recent sources.

Prefer two or three strong angles over many vague ones. The parent agent should frame the question and assign angles; child agents should explore, not invent broad plans.

Ask each agent to return concise findings with evidence:
- file paths and line ranges for local findings
- confidence level and gaps
- recommended next step or decision implication

Do not ask agents to edit files. This is a research pass only unless I explicitly ask for implementation.

After the agents return, synthesize your own findings and theirs into:
- what we know
- what the local codebase implies
- tradeoffs and risks
- gaps or assumptions
- the recommended next move

If findings disagree, call out the disagreement instead of smoothing it over.

$@
