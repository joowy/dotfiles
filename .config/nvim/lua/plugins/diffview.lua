return {
  "sindrets/diffview.nvim",
  cmd = { "DiffviewOpen", "DiffviewClose", "DiffviewFileHistory" },
  keys = {
    { "<leader>gd", "<cmd>DiffviewOpen<cr>", desc = "Diffview Open" },
    { "<leader>gq", "<cmd>DiffviewClose<cr>", desc = "Diffview Close" },
    { "<leader>gh", "<cmd>DiffviewFileHistory %<cr>", desc = "File History" },
  },
  opts = {},
}
