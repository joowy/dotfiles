# joey's dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Prerequisites

### pacman

```bash
# Core CLI tools
sudo pacman -S --needed git stow zsh neovim ghostty lazygit eza fzf delta zoxide mise yazi jq docker

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

Stowed files: `.zshrc`, `.zshenv` (mise shims on `PATH`), `.p10k.zsh`. `~/.local/bin` is on `PATH` — `~/bin` from `stow .` is not, so each `bin/*` is currently reached through a `~/.local/bin` symlink (see TODO).

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

### 3. herdr

Stowed: `.config/herdr/config.toml`, `.config/herdr-nvim/config.toml`. Prefix is `Ctrl-a`.

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

Stowed: `.config/ghostty/config.ghostty` (launches plain `zsh`, run `herdr` manually).

### 8. Homebrew (optional)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

### 9. KDE dynamic wallpaper (day/night)

Stowed: `wallpapers/lakeside-dynamic` (repo path used directly, `~/wallpapers`
from `stow .` is not involved).

Plasma 6.5+ supports day/night wallpapers natively — an `org.kde.image` package
with both `contents/images/` (light) and `contents/images_dark/` (dark) is
automatically treated as dynamic:

```
wallpapers/lakeside-dynamic/
├── metadata.json
└── contents/
    ├── images/3840x2160.jpg       # day
    └── images_dark/3840x2160.jpg  # night
```

Image filenames must be `WIDTHxHEIGHT`; Plasma picks the best match for each
screen's aspect ratio, so add e.g. `1200x1920.jpg` if a monitor needs its own
crop.

Point Plasma directly at the stowed package — no symlink into a wallpaper dir,
otherwise the package is listed twice (once from the wallpaper dir, once from
the configured path) and deleting one entry can take the repo copy with it:

```bash
plasma-apply-wallpaperimage ~/dotfiles/wallpapers/lakeside-dynamic
# -> writes Image=file:///home/joey/dotfiles/wallpapers/lakeside-dynamic
```

This sets it for all desktops and leaves no copy anywhere else. Pick the
day/night behaviour (Plasma style vs. sunrise/sunset) in System Settings →
Appearance → Wallpaper.

## Post-setup checks

- `echo $SHELL` should show `/bin/zsh`
- `nvim` should open with LazyVim; run `:Lazy` to check plugin status
- `herdr plugin list` should show `herdr-splits` + `chmarax.herdr-nvim` enabled; inside herdr `nvim` sidebar toggles with `prefix+e`
- `mise ls` should show node/python/rust/angular from `.config/mise/config.toml`
- `gcloud auth list` should show your account
- `colima status` should show it running (after `colima start`; `bin/pi-docker` auto-starts it)

## TODO

- [ ] Remove the per-file `~/.local/bin` symlinks into `bin/*`
      (`herdr-sync-pane-labels`, `pi-docker`, `wt`) and put the directory on
      `PATH` instead — `stow .` already creates `~/bin -> ~/dotfiles/bin`, so a
      single `export PATH="$HOME/dotfiles/bin:$PATH"` in `.zshrc` replaces all
      of them (and any future `bin/*` scripts work without a new symlink).
