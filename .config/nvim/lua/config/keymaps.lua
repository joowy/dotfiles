-- Keymaps are automatically loaded on the VeryLazy event
-- Default keymaps that are always set: https://github.com/LazyVim/LazyVim/blob/main/lua/lazyvim/config/keymaps.lua
-- Add any additional keymaps here

vim.keymap.set("t", "<esc><esc>", "<C-\\><C-n>")

-- Copy relative path to system clipboard with notification
vim.keymap.set("n", "<leader>cF", function()
  local path = vim.fn.expand("%")
  vim.fn.setreg("+", path)
  vim.notify("Copied relative path: " .. path, vim.log.levels.INFO)
end, { silent = true, desc = "Copy relative path to clipboard" })

-- Copy absolute path to system clipboard with notification
vim.keymap.set("n", "<leader>cf", function()
  local path = vim.fn.expand("%:p")
  vim.fn.setreg("+", path)
  vim.notify("Copied absolute path: " .. path, vim.log.levels.INFO)
end, { silent = true, desc = "Copy absolute path to clipboard" })

vim.keymap.set("i", "<M-h>", "<Left>", { noremap = true, silent = true })
vim.keymap.set("i", "<M-l>", "<Right>", { noremap = true, silent = true })
