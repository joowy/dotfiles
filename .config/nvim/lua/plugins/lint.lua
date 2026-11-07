return {
  "mfussenegger/nvim-lint",
  optional = true,
  opts = {
    linters = {
      ["markdownlint-cli2"] = {
        prepend_args = { "--config", os.getenv("HOME") .. "/.config/markdownlint-cli2/markdownlint-cli2.yaml", "--" },
      },
    },
  },
}
