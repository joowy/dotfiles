#!/usr/bin/env bash
set -euo pipefail

# herdr-split-3panes.sh
# Splits the current Herdr pane into 3:
#   [ A (original) ] [ B (top-right) ]
#                    [ C (bottom-right) ]
# Starts a `pi` coding agent in Pane B.
# Keeps focus on Pane A.
# All panes share the same working directory.

# ── Pre-flight checks ──────────────────────────────────────────────

if [[ "${HERDR_ENV:-}" != "1" ]]; then
  echo "Error: Not running inside Herdr (HERDR_ENV is not set to 1)." >&2
  exit 1
fi

if ! command -v jq &>/dev/null; then
  echo "Error: jq is required but not found in PATH." >&2
  exit 1
fi

# ── Gather current pane info ────────────────────────────────────────

PANES_JSON=$(herdr pane current --current 2>/dev/null) || {
  echo "Error: Could not retrieve current pane info. Is Herdr running?" >&2
  exit 1
}

CURRENT_PANE_ID=$(echo "$PANES_JSON" | jq -r '.result.pane.pane_id')
TERMINAL_TITLE=$(echo "$PANES_JSON" | jq -r '.result.pane.terminal_title_stripped')
WORK_DIR="${PWD}"

if [[ -z "$CURRENT_PANE_ID" || "$CURRENT_PANE_ID" == "null" ]]; then
  echo "Error: Could not determine current pane ID." >&2
  exit 1
fi

echo "Current pane: $CURRENT_PANE_ID | Title: '$TERMINAL_TITLE' | Dir: $WORK_DIR"

# ── Transliterate terminal title into a valid agent name ────────────

# Uses Python for reliable Unicode transliteration.
# Maps common symbols (π→pi, α→alpha, etc.) then falls back to
# unicodedata for remaining non-ASCII, then strips to [a-z0-9_-].
transliterate_title() {
  python3 -c '
import sys, unicodedata

title = sys.argv[1]

# Explicit mappings for common symbols
mapping = {
    "\u03c0": "pi", "\u03b1": "alpha", "\u03b2": "beta",
    "\u03b3": "gamma", "\u03b4": "delta", "\u0394": "Delta",
    "\u03a9": "Omega", "\u2192": "to", "\u2190": "from",
    "\u2192": "to", "\u2190": "from", "\u2194": "iff",
    "\u2264": "leq", "\u2265": "geq", "\u221e": "inf",
    "\u2014": "-", "\u2013": "-", "\u2012": "-",
    "\u2022": "*", "\u00b7": "*", "\u00d7": "*",
    "\u2200": "forall", "\u2203": "exists",
    "\u2227": "and", "\u2228": "or", "\u2229": "cap", "\u222a": "cup",
    "\u00a9": "(c)", "\u00ae": "(r)", "\u2122": "(tm)",
    "\u201c": "\"", "\u201d": "\"", "\u2018": "'", "\u2019": "'",
    "\u2026": "...", "\u00e9": "e", "\u00e8": "e",
    "\u00ea": "e", "\u00eb": "e", "\u00f1": "n",
    "\u00fc": "u", "\u00f6": "o", "\u00e4": "a",
    "\u00f0": "d", "\u00c7": "C", "\u00e7": "c",
}

result = ""
for ch in title:
    if ch in mapping:
        result += mapping[ch]
    elif ch.isascii():
        result += ch
    else:
        try:
            name = unicodedata.name(ch)
            # e.g. "GREEK SMALL LETTER PI" -> "pi"
            result += name.lower().replace(" ", "").replace("small", "").replace("letter", "").replace("capital", "")
        except ValueError:
            result += "u"

# Clean to valid agent name chars
import re
name = re.sub(r"[^a-zA-Z0-9_-]", "-", result)
name = re.sub(r"-+", "-", name)
name = name.strip("-")
# Must start with [a-z]
name = re.sub(r"^[^a-zA-Z]+", "", name)
# Truncate to 31 chars max (name field allows 32 total)
name = name[:31].rstrip("-")
print(name)
' "$1"
}

CLEAN_TITLE=$(transliterate_title "$TERMINAL_TITLE")
AGENT_NAME="${CLEAN_TITLE}-pi"

# Ensure name is valid and non-empty
if [[ -z "$AGENT_NAME" || "$AGENT_NAME" =~ ^[^a-zA-Z] || ! "$AGENT_NAME" =~ ^[a-z][a-z0-9_-]{0,31}$ ]]; then
  echo "Error: Generated agent name '$AGENT_NAME' is invalid. Title: '$TERMINAL_TITLE'" >&2
  exit 1
fi

echo "Agent name: $AGENT_NAME"

# ── Step 1: Split current pane to the right (creates Pane B) ───────

echo "Splitting current pane to the right..."
SPLIT_RIGHT_JSON=$(herdr pane split --current --direction right --cwd "$WORK_DIR" --no-focus 2>/dev/null) || {
  echo "Error: Failed to split pane to the right. Is the pane at an interactive prompt?" >&2
  exit 1
}

PANE_B_ID=$(echo "$SPLIT_RIGHT_JSON" | jq -r '.result.pane.pane_id')
if [[ -z "$PANE_B_ID" || "$PANE_B_ID" == "null" ]]; then
  echo "Error: Could not get new pane ID from split." >&2
  exit 1
fi
echo "Pane B (top-right): $PANE_B_ID"

# ── Step 2: Split Pane B down (creates Pane C below B) ─────────────

echo "Splitting Pane B down..."
SPLIT_DOWN_JSON=$(herdr pane split --pane "$PANE_B_ID" --direction down --cwd "$WORK_DIR" --no-focus 2>/dev/null) || {
  echo "Error: Failed to split Pane B down." >&2
  exit 1
}

PANE_C_ID=$(echo "$SPLIT_DOWN_JSON" | jq -r '.result.pane.pane_id')
if [[ -z "$PANE_C_ID" || "$PANE_C_ID" == "null" ]]; then
  echo "Error: Could not get new pane ID from second split." >&2
  exit 1
fi
echo "Pane C (bottom-right): $PANE_C_ID"

# ── Step 3: Start pi agent in Pane B ───────────────────────────────

echo "Starting pi agent '$AGENT_NAME' in Pane B..."
herdr agent start "$AGENT_NAME" --kind pi --pane "$PANE_B_ID" 2>/dev/null || {
  echo "Error: Failed to start pi agent in Pane B. Is the pane at an interactive prompt?" >&2
  exit 1
}
echo "Agent '$AGENT_NAME' started successfully."

# ── Summary ────────────────────────────────────────────────────────
# Focus remains on Pane A (all splits used --no-focus).

echo ""
echo "Done! Layout:"
echo "  [ A: $CURRENT_PANE_ID ] [ B: $PANE_B_ID ($AGENT_NAME) ]"
echo "                    [ C: $PANE_C_ID ]"
echo ""
echo "To give work to the agent: herdr agent prompt $AGENT_NAME \"your task\" --wait"
