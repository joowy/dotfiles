return {
  {
    "folke/snacks.nvim",
    opts = {
      picker = {
        image = { enabled = true },
        sources = {
          explorer = {
            hidden = true,
            ignored = true,
          },
          files = {
            hidden = true, -- show dotfiles in fuzzy finder
            -- ignored = true,
          },
        },
      },
    },
  },
}
