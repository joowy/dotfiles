#!/usr/bin/env python3
"""Validate Obsidian note frontmatter against the vault tag rules.

Rules enforced (per AGENTS.md):
- Every in-scope .md note must have a frontmatter block that parses as a YAML mapping.
- Daily notes (01-personal/daily/) are exempt: the daily-note template has no frontmatter.
- Excalidraw files (in ``98-excalidraw/`` or carrying ``excalidraw-plugin`` / ``excalidraw`` frontmatter) are exempt from ``type/`` and ``context/`` tags, but must be suffixed with ``.excalidraw.md``.
- ``tags`` must contain exactly one ``type/`` tag from the closed set:
  study, reference, project, tool, subscription, moc, credit-card, loan,
  bank-account, task, tracking, meeting.
- ``tags`` must contain exactly one ``context/`` tag from the closed set:
  work, personal.
- ``status/`` is optional, but when present it must come from the closed set:
  draft, in-progress, need-work, done.

Works both as a pre-commit hook entry point (filenames on argv) and standalone
(no arguments = validate every in-scope note in the vault).

Run manually with:
    uv run python .scripts/validate_frontmatter.py
    uv run python .scripts/validate_frontmatter.py path/to/note.md

Pre-commit passes one batch of filenames per job, so a run with arguments
validates that batch only and says so in the summary. A run with no arguments
walks the whole vault.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import yaml

VAULT_ROOT = Path(__file__).resolve().parent.parent

TYPE_TAGS = {
    "type/study",
    "type/reference",
    "type/project",
    "type/tool",
    "type/subscription",
    "type/moc",
    "type/credit-card",
    "type/loan",
    "type/bank-account",
    "type/task",
    "type/tracking",
    "type/meeting",
}
CONTEXT_TAGS = {"context/work", "context/personal"}
STATUS_TAGS = {"status/draft", "status/in-progress", "status/need-work", "status/done"}

# Folders excluded from validation, expressed as excludes rather than includes:
# - raw is the inbox (promotion into topic folders is the user's call)
# - 99-meta holds templates with intentionally different frontmatter plus meta prose
# - 01-personal/daily holds daily notes; the daily template has no frontmatter
# - hidden directories (.pi, .agents, .venv, ...) are always skipped
# - directories the OS refuses to list (private folders) are skipped gracefully
EXCLUDED_DIRECTORIES = ("raw", "99-meta", "01-personal/daily")
EXCLUDED_ROOT_FILES = ("AGENTS.md",)
EXCALIDRAW_DIRECTORY = "98-excalidraw"
EXCALIDRAW_REQUIRED_SUFFIX = ".excalidraw.md"


def find_markdown_files() -> list[Path]:
    """Return every in-scope markdown file in the vault."""
    markdown_files = []
    for root, directories, files in os.walk(VAULT_ROOT, onerror=lambda os_error: None):
        root_path = Path(root)
        relative_root = root_path.relative_to(VAULT_ROOT)
        directories[:] = [
            directory
            for directory in directories
            if not directory.startswith(".")
            and str(relative_root / directory) not in EXCLUDED_DIRECTORIES
            and relative_root / directory not in EXCLUDED_DIRECTORIES
        ]
        for filename in files:
            if not filename.endswith(".md"):
                continue
            markdown_file = root_path / filename
            if len(relative_root.parts) == 0 and filename in EXCLUDED_ROOT_FILES:
                continue
            markdown_files.append(markdown_file)
    return sorted(markdown_files)


def parse_frontmatter(note_text: str) -> dict | None:
    """Parse the YAML frontmatter block, returning None when absent or invalid."""
    if not note_text.startswith("---\n"):
        return None
    closing_marker_index = note_text.find("\n---", 4)
    if closing_marker_index == -1:
        return None
    frontmatter_text = note_text[4:closing_marker_index]
    try:
        parsed = yaml.safe_load(frontmatter_text)
    except yaml.YAMLError:
        return None
    return parsed if isinstance(parsed, dict) else None


def collect_note_tags(frontmatter: dict) -> list[str]:
    """Return all tags from the tags property, ignoring malformed shapes."""
    tags_property = frontmatter.get("tags")
    if isinstance(tags_property, list):
        return [str(tag) for tag in tags_property]
    if isinstance(tags_property, str):
        return tags_property.split()
    return []


def is_in_excalidraw_directory(markdown_file: Path) -> bool:
    """Return True when the file sits inside ``98-excalidraw/``."""
    try:
        relative_path = markdown_file.resolve().relative_to(VAULT_ROOT.resolve())
    except ValueError:
        return False
    return bool(relative_path.parts) and relative_path.parts[0] == EXCALIDRAW_DIRECTORY


def validation_errors_for_file(markdown_file: Path) -> list[str]:
    """Return a list of validation errors for one note (empty list = valid)."""
    note_text = markdown_file.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(note_text)
    in_excalidraw_folder = is_in_excalidraw_directory(markdown_file)

    if frontmatter is None:
        if in_excalidraw_folder and not markdown_file.name.endswith(
            EXCALIDRAW_REQUIRED_SUFFIX
        ):
            suggested_name = f"{markdown_file.stem}{EXCALIDRAW_REQUIRED_SUFFIX}"
            return [
                f"Excalidraw file must end with {EXCALIDRAW_REQUIRED_SUFFIX!r} "
                f"(rename to {suggested_name!r})"
            ]
        return ["frontmatter block is missing, unparseable, or not a mapping"]

    errors = []
    note_tags = collect_note_tags(frontmatter)
    is_excalidraw_note = (
        in_excalidraw_folder
        or "excalidraw-plugin" in frontmatter
        or "excalidraw" in note_tags
    )
    if is_excalidraw_note:
        if not markdown_file.name.endswith(EXCALIDRAW_REQUIRED_SUFFIX):
            suggested_name = f"{markdown_file.stem}{EXCALIDRAW_REQUIRED_SUFFIX}"
            errors.append(
                f"Excalidraw file must end with {EXCALIDRAW_REQUIRED_SUFFIX!r} "
                f"(rename to {suggested_name!r})"
            )
        return errors

    type_tags = [tag for tag in note_tags if tag.startswith("type/")]
    if len(type_tags) == 0:
        errors.append("missing a type/ tag (need exactly one)")
    elif len(type_tags) > 1:
        errors.append(f"multiple type/ tags: {type_tags}")
    elif type_tags[0] not in TYPE_TAGS:
        errors.append(f"unknown type/ tag: {type_tags[0]!r} (allowed: {sorted(TYPE_TAGS)})")

    context_tags = [tag for tag in note_tags if tag.startswith("context/")]
    if len(context_tags) == 0:
        errors.append("missing a context/ tag (need exactly one)")
    elif len(context_tags) > 1:
        errors.append(f"multiple context/ tags: {context_tags}")
    elif context_tags[0] not in CONTEXT_TAGS:
        errors.append(f"unknown context/ tag: {context_tags[0]!r} (allowed: {sorted(CONTEXT_TAGS)})")

    status_tags = [tag for tag in note_tags if tag.startswith("status/")]
    for status_tag in status_tags:
        if status_tag not in STATUS_TAGS:
            errors.append(
                f"unknown status/ tag: {status_tag!r} (allowed: {sorted(STATUS_TAGS)})"
            )
    return errors


def main() -> int:
    running_with_file_arguments = len(sys.argv) > 1
    if running_with_file_arguments:
        markdown_files = [Path(argument) for argument in sys.argv[1:]]
    else:
        markdown_files = find_markdown_files()

    checked_file_count = len(markdown_files)
    failure_count = 0
    for markdown_file in markdown_files:
        try:
            errors = validation_errors_for_file(markdown_file)
        except OSError:
            # Unreadable files (e.g. private folders enforced by the OS) are skipped.
            continue
        if errors:
            failure_count += 1
            try:
                display_path = markdown_file.relative_to(VAULT_ROOT)
            except ValueError:
                display_path = markdown_file
            for error in errors:
                print(f"{display_path}: {error}")

    if failure_count:
        if running_with_file_arguments:
            print(
                f"\n{failure_count} of {checked_file_count} files in this batch "
                "failed frontmatter validation."
            )
            print("This covers this batch only. Pre-commit splits the file list into batches.")
        else:
            print(
                f"\n{failure_count} of {checked_file_count} in-scope vault files "
                "failed frontmatter validation."
            )
        return 1
    if running_with_file_arguments:
        print(
            f"All {checked_file_count} files in this batch passed frontmatter validation."
        )
    else:
        print(
            f"All {checked_file_count} in-scope vault files passed frontmatter validation."
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
