---
description: Run a bounded council of advisors and write a decision memo
argument-hint: "<question> [--advisors name,name] [--max-passes 2|3] [--scope ...] [--non-goals ...]"
---

Run a bounded, supervisor-mediated council on this question. You, the parent session, are the supervisor. You select the roster, curate cross-advisor packets, decide which feedback is valid, and write the final memo. Advisors do not talk directly or see peer transcripts by default. This is not free-form agent chat.

Parse the invocation yourself. The flags below are conventions, not runtime options. Record a brief with the question, scope, non-goals, evidence targets, roster, and pass cap. Default `--max-passes` to 2. Clamp it to 2 or 3. If the question is trivial or settled, answer directly instead of convening a council.

## Roster

- If `--advisors` is given, use exactly those agent names via the `Agent` tool. Fail clearly on an unknown agent. Do not require or invent per-advisor role labels.
- Otherwise prefer 2-3 executable advisor agents from the custom agent definitions in `~/.pi/agent/agents/`, especially any named with a `council-` prefix.
- If fewer than two advisor profiles are available, fill the roster with `oracle`, then `reviewer`, until it has two advisors. Note the fallback in the memo.
- Keep the roster at 2-3 and never exceed 4.

Profiles provide the model, tools, and advisor stance. The council question and scope provide the decision frame. If the user wants a specific lens, they should put it in the question, scope, or profile definition.

## Protocol

1. Frame the question. Write a brief with the question, scope, non-goals, evidence targets, roster, and pass cap.
2. Pass 1 - positions. Launch each advisor in parallel with the same brief. Ask each for: a position, the reasoning behind it, the strongest objection to their own position, and what evidence would change their mind. Advisors respond to you only; they never see peer answers.
3. Curate. Decide which feedback is valid, merge duplicates, and discard weak points. Build a cross-advisor packet for each advisor containing the anonymized positions and objections of the others.
4. Pass 2 - cross-examination. Launch each advisor again (fresh agent, same type) with the packet plus the original brief. Ask each to defend or revise their position against the strongest objections, and to name any point where they now agree or concede.
5. If a material disagreement remains and `--max-passes` allows a third pass, run one more focused round on only the disputed points. Otherwise stop at two passes.
6. Write the memo yourself. You are the only synthesizer and decision maker. Do not introduce a chair advisor, peer chat, or transcript sharing.

Advisors run as regular `Agent` calls with fresh context. Give each advisor the full brief in its prompt; do not rely on the parent conversation for their context.

## Final memo

Structure the memo with:
- Question and scope (including non-goals)
- Roster and passes run
- Points of agreement
- Disagreements that survived cross-examination, with the strongest argument on each side
- Decision or recommendation, with rationale
- Risks, unknowns, and what evidence would change the decision

Question and options from the slash command invocation:

$@
