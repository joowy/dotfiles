# joey's dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Prerequisites

### pacman

```bash
# Core CLI tools
sudo pacman -S --needed git stow zsh tmux neovim ghostty lazygit eza fzf delta zoxide mise yazi jq docker

# System monitoring
sudo pacman -S --needed btop htop nvtop

# Languages & runtimes (compilers / build tools; versioned toolchains come from mise below)
sudo pacman -S --needed go cmake nodejs npm python python-pip python-pipx rustup

# Desktop (KDE Plasma)
sudo pacman -S --needed dolphin

# Cloud CLIs
sudo pacman -S --needed github-cli
```

### yay (AUR)

```bash
git clone https://aur.archlinux.org/yay.git /tmp/yay && cd /tmp/yay && makepkg -si
yay -S --needed obsidian naps2 colima lact konsave
```

> `powerlevel10k` is not installed via AUR here — it is git-cloned into Oh-My-Zsh `custom/themes/` in step 2 below.

## Setup

### 1. Clone & stow

```bash
git clone https://github.com/joowy/dotfiles ~/dotfiles
cd ~/dotfiles
stow .
```

### 2. Zsh

Stowed files: `.zshrc`, `.zshenv` (mise shims on `PATH`), `.p10k.zsh`. `~/.local/bin` is on `PATH` — `~/bin` from `stow .` is not, use `~/.local/bin` symlinks for `bin/*`.

```bash
# Oh My Zsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Powerlevel10k theme (used by ZSH_THEME in .zshrc)
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/themes/powerlevel10k

# Custom OMZ plugins (fzf + npm are OMZ builtins, no clone needed)
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
git clone https://github.com/zsh-users/zsh-completions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-completions
git clone https://github.com/Aloxaf/fzf-tab ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/fzf-tab
git clone https://github.com/MichaelAquilina/zsh-autoswitch-virtualenv ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/autoswitch_virtualenv

# Set zsh as default shell
chsh -s $(which zsh)
```

### 3. tmux/herdr

Prefix is `Ctrl-a` (not default `Ctrl-b`). Stowed: `.tmux.conf`, `.config/herdr/config.toml`, `.config/herdr-nvim/config.toml`.

#### tmux

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
# Start tmux and run: Ctrl-a + Shift+I to install plugins
# Plugins: catppuccin/tmux, tmux-resurrect + continuum (auto-restore on), tmux-cpu, vim-tmux-navigator
```

#### herdr CLI

Install the `herdr` binary first (`herdr --version` currently `0.9.3`, channel `stable`) so it is on `PATH`, then install plugins from a plain shell:

```bash
herdr plugin install lmilojevicc/herdr-splits.nvim
```

#### herdr-nvim (local build)

`nvim` uses a local checkout (`lua/plugins/herdr-nvim.lua` points at `~/repos/herdr-nvim`), forked as `joowy/herdr-nvim` from upstream `ChmaraX/herdr-nvim`:

```bash
git clone https://github.com/joowy/herdr-nvim ~/repos/herdr-nvim
# register local build with herdr (replaces registry install)
herdr plugin install --local ~/repos/herdr-nvim
```

Keybindings from `.config/herdr/config.toml`: `ctrl+h/j/k/l` nav, `alt+h/j/k/l` resize (herdr-splits), `prefix+e` toggle / `prefix+o` pick-file (herdr-nvim), `prefix+alt+g/r/d` popups for lazygit/tuicr/lazydocker.

### 4. Neovim

```bash
nvim --headless "+Lazy! sync" +qa
```

Stowed: `.config/nvim/`. `herdr-splits.nvim` only loads when `HERDR_ENV=1`. `herdr-nvim` loads from `~/repos/herdr-nvim` (see step 3) — fresh clone without that dir will fail to start the sidebar.

### 5. Language toolchains (mise only)

`mise` owns node/python/rust/angular. Do not install `nvm` or standalone `uv`/`rustup` toolchains.

```bash
# .config/mise/config.toml pins: node=lts, python=3.14, rust=stable, npm:@angular/cli=latest, npm:@googleworkspace/cli=latest
mise install
# shims already on PATH via .zshenv; verify with:
mise ls
```

### 6. Cloud & Docker

```bash
# colima profile is stowed at .config/colima/default/colima.yaml (cpu 4 / mem 8 / disk 100 / qemu / docker)
# On Arch bare metal: colima start
# On WSL2: nested virt may fail — prefer Docker Desktop passthrough or colima start with host-compatible vm-type; nvim clipboard already handles WSL via clip.exe
colima start
colima status
```

`bin/pi-docker` requires both `docker` and `colima` on `PATH` and auto-starts the daemon (up to 90s). It defaults to `~/repos/docker-images/Dockerfile.pi` which lives outside dotfiles — clone it before `--rebuild`.

### 7. Vulkan SDK

Download from <https://vulkan.lunarg.com/> and extract to `~/vulkan/`. `.zshrc` expects `~/vulkan/1.4.341.1/x86_64` — update `VULKAN_SDK` if you install a newer version.

### Ghostty (optional)

Stowed: `.config/ghostty/config.ghostty`. `scripts/tmux-autostart.sh` (`SESSION_NAME=ghostty`) is not auto-wired — run it manually or set `command` in ghostty config if you want ghostty to attach to tmux on launch.

### 8. Homebrew (optional)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## Post-setup checks

- `echo $SHELL` should show `/bin/zsh`
- `tmux` should load with Catppuccin theme; run `Ctrl-a + Shift+I` if plugins aren't loaded
- `nvim` should open with LazyVim; run `:Lazy` to check plugin status
- `herdr plugin list` should show `herdr-splits` + `chmarax.herdr-nvim` enabled; inside herdr `nvim` sidebar toggles with `prefix+e`
- `mise ls` should show node/python/rust/angular from `.config/mise/config.toml`
- `gcloud auth list` should show your account
- `colima status` should show it running (after `colima start`; `bin/pi-docker` auto-starts it)
