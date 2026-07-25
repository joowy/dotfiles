# joey's dotfiles

Personal dotfiles managed with [GNU Stow](https://www.gnu.org/software/stow/).

## Prerequisites

### pacman

```bash
# Core CLI tools
sudo pacman -S --needed git stow zsh tmux neovim ghostty lazygit eza fzf delta zoxide git-delta

# System monitoring
sudo pacman -S --needed btop htop nvtop

# Languages & runtimes
sudo pacman -S --needed go cmake nodejs npm python python-pip python-pipx rustup

# Desktop (KDE Plasma)
sudo pacman -S --needed dolphin

# Cloud CLIs
sudo pacman -S --needed github-cli
```

### yay (AUR)

```bash
git clone https://aur.archlinux.org/yay.git /tmp/yay && cd /tmp/yay && makepkg -si
yay -S --needed obsidian naps2 colima lact konsave powerlevel10k
```

## Setup

### 1. Clone & stow

```bash
git clone https://github.com/joowy/dotfiles ~/dotfiles
cd ~/dotfiles
stow .
```

### 2. Zsh

```bash
# Oh My Zsh
sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"

# Custom OMZ plugins
git clone https://github.com/zsh-users/zsh-autosuggestions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-autosuggestions
git clone https://github.com/zsh-users/zsh-syntax-highlighting ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-syntax-highlighting
git clone https://github.com/zsh-users/zsh-completions ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/zsh-completions
git clone https://github.com/Aloxaf/fzf-tab ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/fzf-tab
git clone https://github.com/MichaelAquilina/zsh-autoswitch-virtualenv ${ZSH_CUSTOM:-~/.oh-my-zsh/custom}/plugins/autoswitch_virtualenv

# Set zsh as default shell
chsh -s $(which zsh)
```

### 3. tmux

```bash
git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
# Start tmux and run: prefix + I (capital i) to install plugins
```

### 4. Neovim

```bash
nvim --headless "+Lazy! sync" +qa
```

### 5. Language toolchains

```bash
# Node via nvm
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install --lts
npm install -g @angular/cli

# Python via uv
curl -LsSf https://astral.sh/uv/install.sh | sh

# Rust
rustup default stable
```

### 6. Cloud & Docker

```bash
gh auth login
```

### 7. Vulkan SDK

Download from <https://vulkan.lunarg.com/> and extract to `~/vulkan/`.

### 8. Homebrew (optional)

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

## Post-setup checks

- `echo $SHELL` should show `/bin/zsh`
- `tmux` should load with Catppuccin theme; run `prefix + I` if plugins aren't loaded
- `nvim` should open with LazyVim; run `:Lazy` to check plugin status
- `gcloud auth list` should show your account
- `colima status` should show it running
