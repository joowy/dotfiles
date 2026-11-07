-- bootstrap lazy.nvim, LazyVim and your plugins
require("config.lazy")

vim.opt.shell = "/bin/zsh"
-- vim.opt.autochdir = true
vim.opt.clipboard = "unnamedplus"
-- os dectection
vim.g.is_mac = vim.fn.has("macunix") == 1
vim.g.is_linux = vim.fn.has("unix") == 1 and vim.fn.has("macunix") == 0
local uv = vim.loop or vim.uv
local uname = uv.os_uname()
vim.g.is_wsl = vim.g.is_linux and string.find(uname.release:lower(), "microsoft") ~= nil
-- configure clipboard for WSL
if vim.g.is_wsl then
  vim.g.clipboard = {

    name = "WslClipboard",
    copy = {
      ["+"] = { "clip.exe" },
      ["*"] = { "clip.exe" },
    },
    paste = {
      ["+"] = {
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
        "-c",
        '[Console]::Out.Write($(Get-Clipboard -Raw).tostring().replace("`r", ""))',
      },
      ["*"] = {
        "/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe",
        "-c",
        '[Console]::Out.Write($(Get-Clipboard -Raw).tostring().replace("`r", ""))',
      },
    },
    cache_enabled = false,
  }
end
