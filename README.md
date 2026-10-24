# joey's dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Prerequisites

### pacman

```bash
# Core CLI tools
sudo pacman -S --needed git stow zsh neovim ghostty lazygit eza fzf git-delta zoxide mise yazi jq docker bubblewrap

# System monitoring
sudo pacman -S --needed btop htop nvtop

# Languages & runtimes (compilers / build tools; versioned toolchains come from mise below)
sudo pacman -S --needed go cmake nodejs npm python uv rustup

# Desktop (KDE Plasma + apps)
sudo pacman -S --needed dolphin obsidian keepass

# Cloud CLIs
sudo pacman -S --needed github-cli
```

### yay (AUR)

```bash
git clone https://aur.archlinux.org/yay.git /tmp/yay && cd /tmp/yay && makepkg -si
yay -S --needed naps2 colima lact konsave
```

## Setup

### 1. Zsh

Install Oh My Zsh first. Its installer writes a stock `~/.zshrc`; step 2 replaces that with the stowed one.

```bash
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
```

Then the theme and custom plugins (fzf + npm are OMZ builtins, no clone needed):

```bash
# Powerlevel10k theme (used by ZSH_THEME in .zshrc)
git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/themes/powerlevel10k

# Custom OMZ plugins
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
git clone https://github.com/zsh-users/zsh-completions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-completions
git clone https://github.com/Aloxaf/fzf-tab ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/fzf-tab
git clone https://github.com/MichaelAquilina/zsh-autoswitch-virtualenv ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/autoswitch_virtualenv
```

```bash
# Set zsh as default shell
chsh -s $(which zsh)
```

### 2. Clone & stow

```bash
git clone https://github.com/joowy/dotfiles ~/dotfiles
cd ~/dotfiles
rm ~/.zshrc  # stock OMZ template; stow links the repo's .zshrc in its place
stow .
```

Stowed files: `.zshrc`, `.zshenv` (mise shims on `PATH`), `.p10k.zsh`. `.zshrc` prepends `~/dotfiles/bin` to `PATH`, so every `bin/*` script is directly on `PATH`.

### 3. herdr

Stowed: `.config/herdr/config.toml`, `.config/herdr-nvim/config.toml`. Prefix is `Ctrl-a`.

#### herdr CLI

Install the `herdr` binary (stable channel) so it is on `PATH`:

```bash
curl -fsSL https://herdr.dev/install.sh | sh
```

Then install plugins from a plain shell:

```bash
herdr plugin install lmilojevicc/herdr-splits.nvim
```

#### herdr-nvim (local build)

`nvim` uses a local checkout (`lua/plugins/herdr-nvim.lua` points at `~/repos/herdr-nvim`) of your fork `joowy/herdr-nvim` (upstream `ChmaraX/herdr-nvim`):

```bash
git clone https://github.com/joowy/herdr-nvim.git ~/repos/herdr-nvim

# register the local checkout with herdr
herdr plugin link ~/repos/herdr-nvim

# build the plugin binary — `plugin link` never runs [[build]] hooks
bash ~/repos/herdr-nvim/herdr/install.sh
```

### 4. Pi.dev + Obsidian private guard

[Pi](https://pi.dev) is a coding agent; [obsidian-private-guard](https://github.com/joowy/pi-private-folder-guard) wraps every `pi` launch in a bubblewrap namespace that cuts the private folders of your Obsidian vault out of view.

Install Pi:

```bash
curl -fsSL https://pi.dev/install.sh | sh
```

Pi needs Node ≥ 22.19 — run step 6 first, or let the Pi installer fetch Node. Start Pi once and use `/login` to connect a provider.

```bash
git clone https://github.com/joowy/pi-private-folder-guard.git ~/repos/pi-private-folder-guard
cd ~/repos/pi-private-folder-guard
./install.sh
```

### 5. Neovim

```bash
nvim --headless "+Lazy! sync" +qa
```

Stowed: `.config/nvim/`. `herdr-splits.nvim` only loads when `HERDR_ENV=1`. `herdr-nvim` loads from `~/repos/herdr-nvim` (see step 3) — fresh clone without that dir will fail to start the sidebar.

### 6. Language toolchains (mise only)

`mise` owns the node/python/rust/angular toolchain versions. Do not install `nvm`, and do not use uv or rustup to install language runtimes — `uv` (from pacman) is for Python project/package management only.

```bash
# .config/mise/config.toml pins: node=lts, python=3.14, rust=stable, npm:@angular/cli=latest, npm:@googleworkspace/cli=latest
mise install
# shims already on PATH via .zshenv; verify with:
mise ls
```

### 7. Cloud & Docker

```bash
# colima profile is stowed at .config/colima/default/colima.yaml (cpu 4 / mem 8 / disk 100 / qemu / docker)
# On Arch bare metal: colima start
# On WSL2: nested virt may fail — prefer Docker Desktop passthrough or colima start with host-compatible vm-type; nvim clipboard already handles WSL via clip.exe
colima start
colima status
```

`bin/pi-docker` requires both `docker` and `colima` on `PATH` and auto-starts the daemon (up to 90s). It defaults to `~/repos/docker-images/Dockerfile.pi` which lives outside dotfiles — clone it before `--rebuild`.

### 8. Vulkan SDK

Download from <https://vulkan.lunarg.com/> and extract to `~/vulkan/`. `.zshrc` expects `~/vulkan/1.4.341.1/x86_64` — update `VULKAN_SDK` if you install a newer version.

### 9. Ghostty

Stowed: `.config/ghostty/config.ghostty` (launches plain `zsh`, run `herdr` manually).

### 10. Homebrew

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 11. KDE dynamic wallpaper (day/night)

Stowed: `wallpapers/lakeside-dynamic` (repo path used directly, `~/wallpapers`
from `stow .` is not involved).

```
wallpapers/lakeside-dynamic/
├── metadata.json
└── contents/
    ├── images/3840x2160.jpg       # day
    └── images_dark/3840x2160.jpg  # night
```

## Post-setup checks

- `echo $SHELL` should show `/bin/zsh`
- `nvim` should open with LazyVim; run `:Lazy` to check plugin status
- `herdr plugin list` should show `herdr-splits` and `chmarax.herdr-nvim` (as a local link); `~/repos/herdr-nvim/bin/herdr-nvim` must exist (step 3)
- `mise ls` should show node/python/rust/angular from `.config/mise/config.toml`
- `colima status` should show it running (after `colima start`; `bin/pi-docker` auto-starts it)

## TODO

- [ ] Remove the per-file `~/.local/bin` symlinks into `bin/*`
      (`herdr-sync-pane-labels`, `pi-docker`, `wt`) and put the directory on
      `PATH` instead — `stow .` already creates `~/bin -> ~/dotfiles/bin`, so a
      single `export PATH="$HOME/dotfiles/bin:$PATH"` in `.zshrc` replaces all
      of them (and any future `bin/*` scripts work without a new symlink).
