#!/usr/bin/env python3
"""Validate the vault's index notes against the index naming rule (R1 to R8).

An *index note* is a note named ``index.md``, starting with ``01-index-``
(the banned legacy shape), or ending with ``-index.md`` (the target shape).

Rules:

- R1: every index note is named ``01-{topic}-index.md``. The topic is read
  from the filename, so the filename chooses the spelling.
- R2: ``{topic}`` must appear inside the folder name as a whole-word phrase,
  compared loosely (case folded, ``-``, ``_`` and space all count as one
  space). ``01-personal-index.md`` is therefore valid inside ``01-personal/``,
  and a repeated sort number such as ``01-01-personal-index.md`` is not
  rejected: naming is the human's call, this rule only catches a topic that
  has nothing to do with its folder.
- R3: when two or more folders in the vault share a name, ``{topic}`` must be
  exactly parent + folder, for example ``LLMs-lessons``. Global finding.
  Containment for those folders is tested against ``parent folder``.
- R4: an index note's ``aliases`` must contain the topic taken from its
  filename. When the filename does not match R1, the number-free folder name
  is used instead, so a misnamed note reports one finding rather than two
  contradictory ones.
- R5: no two notes share an alias, and no alias equals another note's filename
  stem. Global finding.
- R6: every folder under the scoped roots that holds at least one ``.md`` note
  must hold exactly one index note. The reminder suggests the folder name with
  any leading sort number dropped, for example ``01-personal-index.md`` inside
  ``01-personal/``.
- R7: folder depth is at most 3, counted from the vault root.
- R8: an index note must ``[[wikilink]]`` every ``.md`` note directly in its
  folder, excluding itself and excluding subfolders.

The scanner walks the whole vault and works by exclusion, never by an
include list: it never follows symlinks and skips dot folders, ``assets/``,
``daily/``, ``raw/``, ``99-meta/`` and ``98-excalidraw/``. The vault root
itself is a map of topics and is not policed as a folder.

Run manually with:
    uv run python .scripts/validate_index_notes.py
    uv run python .scripts/validate_index_notes.py --only 02-knowledge/LLMs
    uv run python .scripts/validate_index_notes.py --json
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
from collections import Counter, defaultdict
from dataclasses import dataclass
from pathlib import Path, PurePosixPath

import yaml

VAULT_ROOT = Path(__file__).resolve().parent.parent

# The walk is exclusion based: everything under the vault root is policed
# except dot folders, assets/, daily/ and the exempt roots. raw/ is the
# inbox, 99-meta/ holds templates that intentionally break the schema, and
# 98-excalidraw/ holds drawings whose frontmatter the plugin owns.
# daily/ holds one note per day, so a folder index there would never be
# complete; it is skipped wherever it appears in the tree.
EXCLUDED_ROOT_DIRECTORIES = {"raw", "99-meta", "98-excalidraw"}
EXCLUDED_DIRECTORY_NAMES = {"assets", "daily"}

INDEX_FILENAME_PATTERN = re.compile(r"^01-(?P<topic>.+)-index$")
WORD_SPLIT_PATTERN = re.compile(r"[-_\s]+")
SORT_NUMBER_PREFIX_PATTERN = re.compile(r"^\d+-")
MAXIMUM_FOLDER_DEPTH = 3


@dataclass
class Finding:
    """One rule violation."""

    path: str
    rule: str
    scope: str  # "local" or "global"
    message: str


def normalize_name(value: str) -> str:
    """Fold case and treat ``-``, ``_`` and space as one space."""
    return WORD_SPLIT_PATTERN.sub(" ", value.strip().lower())


def is_index_note_path(note_path: Path) -> bool:
    """True for the index shapes: ``index``, ``01-index-*``, or ``*-index``.

    The middle shape is the banned legacy form the plan still lists as a
    rename, so it has to be detected as an index note rather than ignored.
    """
    stem = note_path.stem.lower()
    return stem == "index" or stem.startswith("01-index-") or stem.endswith("-index")


def read_text(note_path: Path) -> str:
    """Read a note, returning an empty string when the OS refuses."""
    try:
        return note_path.read_text(encoding="utf-8")
    except OSError:
        return ""


def parse_frontmatter(note_text: str) -> dict:
    """Parse the YAML frontmatter block, returning an empty dict when absent."""
    if not note_text.startswith("---\n"):
        return {}
    closing_marker_index = note_text.find("\n---", 4)
    if closing_marker_index == -1:
        return {}
    try:
        parsed = yaml.safe_load(note_text[4:closing_marker_index])
    except yaml.YAMLError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def collect_aliases(frontmatter: dict) -> list[str]:
    """Return the aliases property as a list of strings."""
    aliases_property = frontmatter.get("aliases")
    if isinstance(aliases_property, list):
        return [str(alias) for alias in aliases_property]
    if isinstance(aliases_property, str):
        return [aliases_property]
    return []


def collect_wikilink_targets(note_text: str) -> list[str]:
    """Return every wikilink target in the note, embed links included."""
    targets = []
    for match in re.finditer(r"!?\[\[([^\]\n]+)\]\]", note_text):
        raw_target = match.group(1)
        target = raw_target.split("|", 1)[0].split("#", 1)[0].strip()
        if target:
            targets.append(target)
    return targets


def relative_display(path: Path) -> str:
    """Path relative to the vault root, as a posix string."""
    try:
        return path.relative_to(VAULT_ROOT).as_posix()
    except ValueError:
        return path.as_posix()


def filter_directory_names(
    directory_path: str, directory_names: list[str]
) -> None:
    """Drop dot folders, ``assets/``, ``daily/``, symlinked folders and exempt roots.

    ``raw/`` and ``99-meta/`` are exempted only at the vault root; by the
    time the walk has descended, any further folder of those names is just
    a topic folder and gets policed.
    """
    at_vault_root = Path(directory_path) == VAULT_ROOT
    directory_names[:] = [
        name
        for name in directory_names
        if not name.startswith(".")
        and name not in EXCLUDED_DIRECTORY_NAMES
        and not (at_vault_root and name in EXCLUDED_ROOT_DIRECTORIES)
        and not (Path(directory_path) / name).is_symlink()
    ]


def scan_markdown_files() -> list[Path]:
    """Every in-scope ``.md`` note, without following symlinks."""
    markdown_files: list[Path] = []
    for directory_path, directory_names, file_names in os.walk(
        VAULT_ROOT, followlinks=False
    ):
        filter_directory_names(directory_path, directory_names)
        for file_name in file_names:
            if file_name.endswith(".md"):
                markdown_files.append(Path(directory_path) / file_name)
    return sorted(markdown_files)


def scan_folders() -> dict[Path, list[Path]]:
    """Map every in-scope folder that holds a note to its direct ``.md`` files."""
    folders: dict[Path, list[Path]] = {}
    for directory_path, directory_names, file_names in os.walk(
        VAULT_ROOT, followlinks=False
    ):
        filter_directory_names(directory_path, directory_names)
        if Path(directory_path) == VAULT_ROOT:
            # The vault root is a map of topics; notes sitting directly in it
            # are not policed as a folder, but they are still scanned as notes.
            continue
        direct_notes = sorted(
            Path(directory_path) / file_name
            for file_name in file_names
            if file_name.endswith(".md")
        )
        if direct_notes:
            folders[Path(directory_path)] = direct_notes
    return folders


def scan_all_folders() -> list[Path]:
    """Every in-scope folder, notes or not, for the depth and collision rules."""
    all_folders: list[Path] = []
    for directory_path, directory_names, _ in os.walk(VAULT_ROOT, followlinks=False):
        filter_directory_names(directory_path, directory_names)
        all_folders.append(Path(directory_path))
    return all_folders


def expected_topic_for_folder(folder: Path, name_counts: Counter) -> str:
    """The topic an index note in ``folder`` must carry."""
    if name_counts[normalize_name(folder.name)] > 1:
        return f"{folder.parent.name}-{folder.name}"
    return folder.name


def suggested_topic_for_folder(folder: Path, name_counts: Counter) -> str:
    """The friendly topic for reminders: the expected topic, number dropped."""
    if name_counts[normalize_name(folder.name)] > 1:
        parent = SORT_NUMBER_PREFIX_PATTERN.sub("", folder.parent.name)
        own_name = SORT_NUMBER_PREFIX_PATTERN.sub("", folder.name)
        return f"{parent}-{own_name}"
    return SORT_NUMBER_PREFIX_PATTERN.sub("", folder.name)


def topic_appears_in(topic: str, container: str) -> bool:
    """True when ``topic`` is a whole-word phrase inside ``container``."""
    normalized_topic = normalize_name(topic)
    if not normalized_topic:
        return False
    topic_pattern = re.compile(
        r"(^| )" + re.escape(normalized_topic) + r"( |$)"
    )
    return topic_pattern.search(normalize_name(container)) is not None


def link_matches_note(
    target: str, index_note: Path, candidate_note: Path
) -> bool:
    """True when a wikilink target resolves to ``candidate_note``.

    Handles bare stems, folder-relative paths and vault-relative paths.
    """
    target = target[:-3] if target.endswith(".md") else target
    target_parts = PurePosixPath(target).parts
    if not target_parts:
        return False

    candidate_stem = normalize_name(candidate_note.stem)
    if len(target_parts) == 1:
        return normalize_name(target_parts[0]) == candidate_stem

    candidate_relative = relative_display(candidate_note.with_suffix(""))
    normalized_target = normalize_name(target).replace(" ", "-")
    if normalize_name(candidate_relative).replace(" ", "-") == normalized_target:
        return True
    if normalize_name(candidate_relative).replace(" ", "-").endswith(
        "-" + normalized_target
    ):
        return True
    folder_relative = (index_note.parent / target).resolve()
    if folder_relative == candidate_note.resolve():
        return True
    return False


def collect_findings() -> list[Finding]:
    """Run R1 to R8 over the whole vault and return every finding."""
    findings: list[Finding] = []
    markdown_files = scan_markdown_files()
    folders = scan_folders()
    all_folders = scan_all_folders()

    # R3 speaks about folders in the vault, not only folders that hold notes:
    # an empty duplicate still makes the topic ambiguous.
    folder_name_counts = Counter(
        normalize_name(folder.name) for folder in all_folders
    )

    # R7: folder depth.
    for folder in all_folders:
        depth = len(folder.relative_to(VAULT_ROOT).parts)
        if depth > MAXIMUM_FOLDER_DEPTH:
            findings.append(
                Finding(
                    path=relative_display(folder),
                    rule="R7",
                    scope="local",
                    message=(
                        f"folder depth is {depth}, at most {MAXIMUM_FOLDER_DEPTH} "
                        "is allowed counted from the vault root"
                    ),
                )
            )

    # Load every note once.
    note_texts = {note: read_text(note) for note in markdown_files}
    note_frontmatter = {
        note: parse_frontmatter(note_texts[note]) for note in markdown_files
    }
    note_aliases = {
        note: collect_aliases(note_frontmatter[note]) for note in markdown_files
    }

    # R5: alias uniqueness and alias shadowing. Global by nature.
    alias_owners: dict[str, list[Path]] = defaultdict(list)
    for note in markdown_files:
        for alias in note_aliases[note]:
            alias_owners[normalize_name(alias)].append(note)
    stem_owners: dict[str, list[Path]] = defaultdict(list)
    for note in markdown_files:
        stem_owners[normalize_name(note.stem)].append(note)

    for note in markdown_files:
        for alias in note_aliases[note]:
            normalized_alias = normalize_name(alias)
            owners = [owner for owner in alias_owners[normalized_alias]]
            if len(owners) > 1:
                others = [relative_display(o) for o in owners if o != note]
                findings.append(
                    Finding(
                        path=relative_display(note),
                        rule="R5",
                        scope="global",
                        message=(
                            f"alias {alias!r} is also an alias on {', '.join(others)}"
                        ),
                    )
                )
            shadowers = [
                shadower
                for shadower in stem_owners[normalized_alias]
                if shadower != note
            ]
            if shadowers:
                findings.append(
                    Finding(
                        path=relative_display(note),
                        rule="R5",
                        scope="global",
                        message=(
                            f"alias {alias!r} is shadowed by the filename "
                            f"{relative_display(shadowers[0])}; Obsidian resolves "
                            "the file, not the alias"
                        ),
                    )
                )

    # R6: folder coverage.
    index_notes_by_folder: dict[Path, list[Path]] = defaultdict(list)
    for folder, direct_notes in folders.items():
        for note in direct_notes:
            if is_index_note_path(note):
                index_notes_by_folder[folder].append(note)
        index_notes = index_notes_by_folder[folder]
        if len(index_notes) == 0:
            findings.append(
                Finding(
                    path=relative_display(folder),
                    rule="R6",
                    scope="local",
                    message=(
                        "folder holds notes but no index note; add "
                        f"01-{suggested_topic_for_folder(folder, folder_name_counts)}-index.md"
                    ),
                )
            )
        elif len(index_notes) > 1:
            findings.append(
                Finding(
                    path=relative_display(folder),
                    rule="R6",
                    scope="local",
                    message=(
                        "folder holds more than one index note: "
                        + ", ".join(relative_display(note) for note in index_notes)
                    ),
                )
            )

    # R1 to R4 and R8, per index note.
    for folder in folders:
        expected_topic = expected_topic_for_folder(folder, folder_name_counts)
        name_collides = folder_name_counts[normalize_name(folder.name)] > 1
        direct_notes = folders[folder]
        for note in direct_notes:
            if not is_index_note_path(note):
                continue
            note_text = note_texts[note]

            # R1: filename shape. The topic is read back from the filename so
            # the human owns the spelling; R2 and R4 then follow that topic.
            filename_match = INDEX_FILENAME_PATTERN.match(note.stem)
            if filename_match is None:
                findings.append(
                    Finding(
                        path=relative_display(note),
                        rule="R1",
                        scope="local",
                        message=(
                            "index notes must be named 01-{topic}-index.md, got "
                            f"{note.name!r}"
                        ),
                    )
                )
                topic = suggested_topic_for_folder(folder, folder_name_counts)
            else:
                topic = filename_match.group("topic")
                container = (
                    f"{folder.parent.name} {folder.name}"
                    if name_collides
                    else folder.name
                )
                if name_collides and normalize_name(topic) != normalize_name(
                    expected_topic
                ):
                    findings.append(
                        Finding(
                            path=relative_display(note),
                            rule="R3",
                            scope="global",
                            message=(
                                f"folder name {folder.name!r} is used by "
                                f"{folder_name_counts[normalize_name(folder.name)]} "
                                "folders, so the topic must be "
                                f"{expected_topic!r}, got {topic!r}"
                            ),
                        )
                    )
                elif not topic_appears_in(topic, container):
                    findings.append(
                        Finding(
                            path=relative_display(note),
                            rule="R2",
                            scope="local",
                            message=(
                                "topic must appear inside the folder name "
                                f"{folder.name!r} (case and separators compared "
                                f"loosely), got {topic!r}"
                            ),
                        )
                    )

            # R4: the alias must carry the topic R1 produced, or the
            # number-free folder name when the filename was unusable.
            aliases = note_aliases[note]
            if not any(topic_appears_in(topic, alias) for alias in aliases):
                findings.append(
                    Finding(
                        path=relative_display(note),
                        rule="R4",
                        scope="local",
                        message=(
                            f"aliases must contain the topic {topic!r} "
                            f"(compare loosely); found {aliases!r}"
                        ),
                    )
                )

            # R8: every direct sibling note is linked.
            targets = collect_wikilink_targets(note_text)
            for sibling in direct_notes:
                if sibling == note:
                    continue
                if not any(
                    link_matches_note(target, note, sibling) for target in targets
                ):
                    findings.append(
                        Finding(
                            path=relative_display(note),
                            rule="R8",
                            scope="local",
                            message=(
                                "does not link its folder note "
                                f"[[{sibling.stem}]]"
                            ),
                        )
                    )

    return findings


def main() -> int:
    argument_parser = argparse.ArgumentParser(
        description="Validate index note naming, aliases, coverage and links."
    )
    argument_parser.add_argument(
        "--only",
        metavar="PREFIX",
        default=None,
        help="report only findings whose path starts with PREFIX",
    )
    argument_parser.add_argument(
        "--json",
        action="store_true",
        help="emit findings as JSON, each labelled local or global",
    )
    arguments = argument_parser.parse_args()

    findings = collect_findings()

    if arguments.only:
        prefix = arguments.only.rstrip("/")
        findings = [
            finding
            for finding in findings
            if finding.path == prefix or finding.path.startswith(prefix + "/")
        ]

    if arguments.json:
        print(
            json.dumps(
                [
                    {
                        "path": finding.path,
                        "rule": finding.rule,
                        "scope": finding.scope,
                        "message": finding.message,
                    }
                    for finding in findings
                ],
                indent=2,
            )
        )
    else:
        for finding in sorted(findings, key=lambda f: (f.path, f.rule)):
            print(f"{finding.path}: {finding.rule}: {finding.message}")
        if findings:
            global_count = sum(1 for f in findings if f.scope == "global")
            print(
                f"\n{len(findings)} findings "
                f"({global_count} global, {len(findings) - global_count} local)."
            )
        else:
            print("All index note rules passed.")

    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
