-- Options are automatically loaded before lazy.nvim startup
-- Default options that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/options.lua
-- Add any additional options here

-- vim.opt.wrap = true
vim.opt.linebreak = true
vim.opt.breakindent = true
vim.opt.autoread = true
-- views can only be fully collapsed with the global statusline
vim.opt.laststatus = 3
-- Default splitting will cause your main splits to jump when opening an edgebar.
-- To prevent this, set `splitkeep` to either `screen` or `topline`.
vim.opt.splitkeep = "screen"
vim.g.lazyvim_python_lsp = "basedpyright"

vim.filetype.add({
  filename = {
    [".zshrc"] = "zsh",
  },
})
