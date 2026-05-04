return {
  {
    "mofiqul/vscode.nvim",
    lazy = false,
    priority = 1000,
    config = function()
      require("vscode").setup({})
    end,
    opts = {},
  },
}
