---
name: capture-raw-note
description: Distill the current conversation into a markdown note in the Obsidian vault's raw/ inbox. Use when the user asks to capture, save, or distill the current conversation, chat, discussion, or session into a note — even phrases like "save this chat", "capture what we talked about", or "put this in my notes".
---

# Conversation Capture

The user wants the current conversation saved into the vault. Distill it, do not transcribe it. The goal is a note the user can find later and act on.

The vault root is `~/repos/Obsidian`. This skill can be invoked from any directory, so resolve every vault path from the vault root, not the current working directory.

## Workflow

1. Run `date +%F` to get today's date. Never trust your internal clock for the date.
2. Pick a topic slug from the conversation's main subject: 2 to 5 lowercase words, words joined by dashes (for example `skill-creation`, `llm-moats`, `meal-prep-plan`).
3. Build the filename `YYYY-MM-DD-<topic-slug>.md`. Check if it exists in the vault's `raw/` folder (`~/repos/Obsidian/raw/`). If it does, append a numeric suffix before the extension: `-1`, then `-2`, then `-3`. Use the first free number.
4. Distill the conversation into the note format below.
5. Write the file to `~/repos/Obsidian/raw/`.
6. Tell the user the final file path.

## Distilling

A good capture passes the "would I find this later" test. Include:

- **Decisions & Conclusions.** What got decided or concluded. Name who or what decided it when that matters.
- **Open Questions.** Unresolved questions and follow-up items. If there are none, write `None` so the reader knows the section was not skipped.
- **Key Details.** Facts, links, file paths, commands, and specific identifiers mentioned. Copy these verbatim. A URL, a file path, or a version number is more useful exact than paraphrased.
- **Retrievability.** Anything the user would want to find later: names of things discussed, distinctive phrases to search for, and context that would be lost without this note.
- **Note Linking.** Wikilinks `[[like this]]` to related existing vault notes. Search the vault for related notes first with `rg` or the file listing. Link only to notes that exist. If nothing applies, say so instead of forcing links.

Write in plain simple English per the vault's style rules: short sentences, active voice, name the actor, concrete over abstract,

Keep the note tight. One bullet per point. Cut pleasantries, tool output, dead ends, and process narration unless a dead end itself is the lesson worth keeping.

## Note Format

```markdown
---
title: { Human-readable title }
tags:
  - raw
  - type/{study|reference|project|tool|task...}
  - context/{work|personal}
  - theme/{dev|fitness|finance...}
  - status/draft
created: { YYYY-MM-DD }
updated: { YYYY-MM-DD }
topic: { short topic name }
---

# {Human-readable Title}

Captured {YYYY-MM-DD} from a conversation about {topic}.

## Decisions & Conclusions

- ...

## Open Questions

- ...

## Key Details

- ...

## Retrievability

- ...

## Note Linking

- [[Related Note]]
```

## Rules

- One capture per request. Do not capture the same conversation twice on request; update the existing note instead, and set its `updated` date.
- Promotion from `raw/` into a topic folder is the user's call, never the skill's.
- File paths and identifiers stay verbatim. Do not normalize, shorten, or "fix" them.
- If the conversation was about creating or editing notes in this vault, link to those notes.
