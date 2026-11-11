#!/usr/bin/env bash
# 3-line Claude Code status line (Nerd Font glyphs). Reads JSON on stdin.
input=$(cat)
j() { echo "$input" | jq -r "$1 // empty"; }

I_MODEL=$'\U000F06A9'; I_EFFORT=$'\U000F0208'; I_CTX=$'\U000F035B'; I_COST=$'\U000F140B'
I_BRANCH=$''; I_RESET=$'↻'

fmt_tok() {
  awk -v n="${1:-0}" 'BEGIN{ if(n>=1000000) printf "%.1fm", n/1000000; else if(n>=1000) printf "%.0fk", n/1000; else printf "%d", n }'
}
fmt_left() {
  local s=$(( $1 - $(date +%s) )); [ "$s" -lt 0 ] && s=0
  local d=$((s/86400)) h=$(((s%86400)/3600)) m=$(((s%3600)/60))
  if [ $d -gt 0 ]; then echo "${d}d${h}h"
  elif [ $h -gt 0 ]; then echo "${h}h${m}m"
  else echo "${m}m"; fi
}

# Line 1
model=$(j .model.display_name); effort=$(j .effort.level)
used=$(j '.context_window.total_input_tokens'); size=$(j .context_window.context_window_size)
cost=$(j .cost.total_cost_usd)
l1="${I_MODEL} ${model:-?}"
[ -n "$effort" ] && l1+=" • ${I_EFFORT} ${effort}"
l1+=" • ${I_CTX} $(fmt_tok "${used:-0}") / ${I_CTX} $(fmt_tok "${size:-0}")"
l1+=" • ${I_COST} \$$(printf '%.4f' "${cost:-0}")"

# Line 2
dir=$(j .workspace.current_dir); [ -z "$dir" ] && dir=$(j .cwd)
disp="${dir/#$HOME/\~}"
l2="$disp"
if git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
  br=$(git -C "$dir" --no-optional-locks branch --show-current 2>/dev/null)
  [ -z "$br" ] && br=$(git -C "$dir" --no-optional-locks rev-parse --short HEAD 2>/dev/null)
  st=$(git -C "$dir" --no-optional-locks status --porcelain 2>/dev/null)
  staged=$(echo "$st" | grep -c '^[MADRC]')
  modified=$(echo "$st" | grep -c '^.[MD]')
  untracked=$(echo "$st" | grep -c '^??')
  l2+=" • ${I_BRANCH} ${br} • +${staged} ~${modified} ?${untracked}"
fi
added=$(j .cost.total_lines_added); removed=$(j .cost.total_lines_removed)
l2+=" (+${added:-0},-${removed:-0})"

# Line 3
l3=""
add_rl() {
  local label=$1 p r
  p=$(j ".rate_limits.$2.used_percentage"); r=$(j ".rate_limits.$2.resets_at")
  [ -z "$p" ] && return
  local seg="$label $(printf '%.0f' "$p")%"
  [ -n "$r" ] && seg+=" ${I_RESET} $(fmt_left "$r")"
  l3+="${l3:+ · }$seg"
}
add_rl 5h five_hour
add_rl 7d seven_day
add_rl spend spend_limit

echo "$l1"
echo "$l2"
[ -n "$l3" ] && echo "$l3"
