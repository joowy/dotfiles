-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.api.nvim_create_user_command("TerminalSplit", function()
  vim.cmd("split | terminal")
  vim.cmd("vsplit | terminal")
end, { desc = "Create two terminals at the bottom" })
