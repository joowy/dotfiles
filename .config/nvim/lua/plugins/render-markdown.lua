return {
  "MeanderingProgrammer/render-markdown.nvim",
  opts = {
    heading = {
      -- Useful context to have when evaluating values.
      -- | level    | the number of '#' in the heading marker         |
      -- | sections | for each level how deeply nested the heading is |

      -- Turn on / off heading icon & background rendering.
      enabled = true,
      -- Additional modes to render headings.
      render_modes = false,
      -- Turn on / off atx heading rendering.
      atx = true,
      -- Turn on / off setext heading rendering.
      setext = true,
      -- Turn on / off sign column related rendering.
      sign = true,
      -- Replaces '#+' of 'atx_h._marker'.
      -- Output is evaluated depending on the type.
      -- | function | `value(context)`              |
      -- | string[] | `cycle(value, context.level)` |
      icons = { "󰲡 ", "󰲣 ", "󰲥 ", "󰲧 ", "󰲩 ", "󰲫 " },
      -- Determines how icons fill the available space.
      -- | eol     | '#'s are concealed and icon is placed at right most column   |
      -- | right   | '#'s are concealed and icon is appended to right side        |
      -- | inline  | '#'s are concealed and icon is inlined on left side          |
      -- | overlay | icon is left padded with spaces and overlayed hiding all '#' |
      position = "overlay",
      -- Added to the sign column if enabled.
      -- Output is evaluated by `cycle(value, context.level)`.
      signs = { "󰫎 " },
      -- Width of the heading background.
      -- | block | width of the heading text |
      -- | full  | full width of the window  |
      -- Can also be a list of the above values evaluated by `clamp(value, context.level)`.
      width = "full",
      -- Amount of margin to add to the left of headings.
      -- Margin available space is computed after accounting for padding.
      -- If a float < 1 is provided it is treated as a percentage of available window space.
      -- Can also be a list of numbers evaluated by `clamp(value, context.level)`.
      left_margin = 0,
      -- Amount of padding to add to the left of headings.
      -- Output is evaluated using the same logic as 'left_margin'.
      left_pad = 0,
      -- Amount of padding to add to the right of headings when width is 'block'.
      -- Output is evaluated using the same logic as 'left_margin'.
      right_pad = 0,
      -- Minimum width to use for headings when width is 'block'.
      -- Can also be a list of integers evaluated by `clamp(value, context.level)`.
      min_width = 0,
      -- Determines if a border is added above and below headings.
      -- Can also be a list of booleans evaluated by `clamp(value, context.level)`.
      border = false,
      -- Always use virtual lines for heading borders instead of attempting to use empty lines.
      border_virtual = false,
      -- Highlight the start of the border using the foreground highlight.
      border_prefix = false,
      -- Used above heading for border.
      above = "▄",
      -- Used below heading for border.
      below = "▀",
      -- Highlight for the heading icon and extends through the entire line.
      -- Output is evaluated by `clamp(value, context.level)`.
      backgrounds = {},
      -- Highlight for the heading and sign icons.
      -- Output is evaluated using the same logic as 'backgrounds'.
      foregrounds = {
        "RenderMarkdownH1",
        "RenderMarkdownH2",
        "RenderMarkdownH3",
        "RenderMarkdownH4",
        "RenderMarkdownH5",
        "RenderMarkdownH6",
      },
    },
  },
}
