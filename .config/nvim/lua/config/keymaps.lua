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

-- vim.keymap.set({ "n", "t" }, "<leader>t1", function()
--   Snacks.terminal.toggle(nil, { count = 1 })
-- end, { desc = "Toggle terminal 1" })
--
-- vim.keymap.set({ "n", "t" }, "<leader>t2", function()
--   Snacks.terminal.toggle(nil, { count = 2 })
-- end, { desc = "Toggle terminal 2" })
--
-- vim.keymap.set({ "n", "t" }, "<C-/>", function()
--   local t1 = Snacks.terminal.get(nil, { count = 1, create = false })
--   local t2 = Snacks.terminal.get(nil, { count = 2, create = false })
--   local any_visible = (t1 and t1:valid()) or (t2 and t2:valid())
--   if any_visible then
--     if t1 and t1:valid() then
--       t1:hide()
--     end
--
--     if t2 and t2:valid() then
--       t2:hide()
--     end
--   else
--     Snacks.terminal.toggle(nil, { count = 1 })
--
--     Snacks.terminal.toggle(nil, { count = 2 })
--   end
-- end, { desc = "Toggle both terminals" })
