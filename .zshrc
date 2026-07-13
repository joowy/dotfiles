#--------------------------------------------------
# Powerlevel10k Instant Prompt
#--------------------------------------------------
if [[ -r "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh" ]]; then
  source "${XDG_CACHE_HOME:-$HOME/.cache}/p10k-instant-prompt-${(%):-%n}.zsh"
fi


#--------------------------------------------------
# Oh My Zsh Configuration
#--------------------------------------------------
export ZSH="$HOME/.oh-my-zsh"
ZSH_THEME="powerlevel10k/powerlevel10k"

zstyle ':omz:plugins:nvm' lazy yes
plugins=(git zsh-autosuggestions zsh-syntax-highlighting fzf fzf-tab nvm autoswitch_virtualenv)

fpath+=${ZSH_CUSTOM:-${ZSH:-~/.oh-my-zsh}/custom}/plugins/zsh-completions/src

#--------------------------------------------------
# Environment Variables & PATH
#--------------------------------------------------
export PATH=/opt/cuda/bin:$PATH
export PATH=/home/joey/.local/bin:$PATH
export VULKAN_SDK=~/vulkan/1.4.341.1/x86_64
export PATH=$VULKAN_SDK/bin:$PATH
export LD_LIBRARY_PATH=$VULKAN_SDK/lib${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}
export VK_ADD_LAYER_PATH=$VULKAN_SDK/share/vulkan/explicit_layer.d
export PKG_CONFIG_PATH=$VULKAN_SDK/share/pkgconfig:$VULKAN_SDK/lib/pkgconfig${PKG_CONFIG_PATH:+:$PKG_CONFIG_PATH}

#--------------------------------------------------
# Google Cloud SDK
#--------------------------------------------------
if [ -f '/home/joey/Downloads/google-cloud-sdk/path.zsh.inc' ]; then . '/home/joey/Downloads/google-cloud-sdk/path.zsh.inc'; fi
if [ -f '/home/joey/Downloads/google-cloud-sdk/completion.zsh.inc' ]; then . '/home/joey/Downloads/google-cloud-sdk/completion.zsh.inc'; fi


#--------------------------------------------------
# Editor 
#--------------------------------------------------
export VISUAL=nvim
export EDITOR=nvim

#--------------------------------------------------
# History Configuration
#--------------------------------------------------
HISTSIZE=100000
SAVEHIST=100000
HISTFILE=~/.zsh_history
HISTDUP=erase
setopt appendhistory
setopt sharehistory
setopt hist_ignore_space
setopt hist_ignore_all_dups
setopt hist_save_no_dups
setopt hist_ignore_dups
setopt hist_find_no_dups

#--------------------------------------------------
# Aliases
#--------------------------------------------------
alias gs='git status'
alias c='clear'
alias n='nvim'
alias ls='ls --color'
alias pi='node -v && pi'
alias open='dolphin'
alias laz='lazygit'

#--------------------------------------------------
# Completion Styling & Zoxide
#--------------------------------------------------
zstyle ':completion:*' matcher-list 'm:{a-z}={A-Za-z}'
zstyle ':completion:*' list-colors "${(s.:.)LS_COLORS}"
zstyle ':completion:*' menu no
zstyle ':fzf-tab:complete:cd:*' fzf-preview 'eza -1h --tree --level=2 --icons --color=always $realpath'
zstyle ':fzf-tab:complete:z:*' fzf-preview 'eza -1h --tree --level=2 --icons --color=always $realpath'

eval "$(zoxide init zsh)"
source $ZSH/oh-my-zsh.sh
[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh
