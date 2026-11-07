return {
  {
    "neovim/nvim-lspconfig",
    opts = {
      -- Only refresh diagnostics when leaving insert mode, never mid-typing.
      diagnostics = { update_in_insert = false },
      servers = {
        bashls = {
          filetypes = { "bash", "sh", "zsh" },
        },
        basedpyright = {
          -- Neovim core debounces didChange notifications (default 150ms).
          -- 300ms keeps basedpyright from re-analyzing on every keystroke.
          flags = { debounce_text_changes = 1000 },
        },
      },
    },
  },

  {
    "stevearc/conform.nvim",
    opts = {
      formatters_by_ft = {
        zsh = { "shfmt_zsh" },
        rust = { "rustfmt" },
      },
      formatters = {
        shfmt_zsh = {
          inherit = "shfmt",
          prepend_args = { "-ln", "zsh" },
        },
      },
    },
  },

  {
    "mason-org/mason.nvim",
    opts = {
      ensure_installed = {
        "shfmt",
        "shellcheck",
      },
    },
  },
}
