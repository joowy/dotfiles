# mise shims first, so GUI-launched shells resolve the same tools as the terminal.
# Sourced by every zsh invocation — keep this file minimal and fast.
case ":$PATH:" in
  *":$HOME/.local/share/mise/shims:"*) ;;
  *) export PATH="$HOME/.local/share/mise/shims:$PATH" ;;
esac
