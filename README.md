# joey's dotfiles

Personal dotfiles and machine setup, driven by [mise](https://mise.jdx.dev).
This repository **is** the global mise config: `mise bootstrap --adopt` clones
it to `~/.config/mise` on every machine.

- `config.toml` — global mise config: `[tools]`, `[bootstrap.packages]`,
  `[bootstrap.repos]`, and the `[dotfile_groups.home]` group that deploys the
  checkout into `$HOME`.
- `config.workstation.toml` — desktop applications, selected by default.
- `config.wsl2.toml` — WSL2 overlay, empty until that machine exists.
- `miserc.toml` — tracked default environment selection (`workstation`).
- `tasks/bootstrap` — the `bootstrap` task that runs installers mise cannot
  express declaratively.
- Everything else is a dotfile, deployed at the same path under `$HOME`.

## New machine

```bash
sudo pacman -S --needed mise git
mise bootstrap --adopt 'joowy/dotfiles?ref=main'
```

Adoption clones this repository into `~/.config/mise` and then runs bootstrap
in its fixed order: packages, repositories, dotfiles, login shell, tools, then
the `bootstrap` task. Preview it first with `--dry-run`.

## Refresh a machine

```bash
mise bootstrap --update     # fast-forward the checkout, then apply
mise bootstrap status       # what still differs from the config
mise bootstrap plan         # resource-level changes
```

`--update` only fast-forwards. Commit and pull inside `~/.config/mise` like any
other checkout.

## Dotfiles

The `home` group deploys every file in the git index at the same path under
`$HOME`. Run these from `~/.config/mise`:

```bash
mise dot status     # deployed, orphaned, and differing files
mise dot diff       # what apply would change
mise dot apply      # deploy
```

Modes:

- One symlink per file (`symlink-each`), relative, so the checkout can move with
  `$HOME`.
- `~/bin`, `~/images`, and `~/wallpapers` are whole-tree links.
- `~/.config/obsidian-private-guard/config.json` is rendered from
  `config.json.tera` because JSON cannot expand `$HOME`.

`manifest = "git"` means only committed files deploy. A new file is deployed by
committing it in the checkout; `mise dot add` refuses to capture into a
git-manifest group. Generated state never enters the repository:

| Generated in place             | Written by             |
| ------------------------------ | ---------------------- |
| `~/.zfunc/_herdr`              | `herdr completion zsh` |
| `~/.agents/.skill-lock.json`   | the skills CLI         |
| `~/.config/kglobalshortcutsrc` | Plasma                 |
| `~/.config/plasma-welcomerc`   | Plasma                 |

## Working repositories between machines

Notes and practice work live in separate repositories, not in this checkout:

| Repository                       | Branch   | Hosted at                       |
| -------------------------------- | -------- | ------------------------------- |
| `~/repos/Obsidian`               | `main`   | `joowy/Obsidian` (private)      |
| `~/repos/LeetCode`               | `master` | `joowy/LeetCode`                |
| `~/repos/leetcode-visualization` | `main`   | `joowy/leetcode-visualization`  |

`save` is the whole round trip for all of them. Run it when you sit down at a
machine and again when you leave it. Per repository it commits pending work,
fetches, rebases onto the remote with `--autostash`, and pushes. It reports
every step and exits non-zero if any repository needs a human.

```bash
save              # commit, pull, push every repository
save status       # branch, uncommitted count, behind, ahead
save --dry-run    # print the plan, change nothing
```

`bin/save` is a two-line wrapper around `tasks/save`, so `~/bin` on `PATH`
provides the command. To add a repository, extend `DEFAULT_REPOSITORIES` in
`tasks/save`, or set a colon-separated `SAVE_REPOSITORIES` for a one-off run.
Commit messages read `save from laptop 2026-11-08 21:40`; the machine label
comes from battery presence, and `SAVE_MACHINE_NAME` overrides it.

One catch: `obsidian-private-guard` mounts the vault read-only and hides its
`.git` inside a pi session, so `save` reports the vault as read-only when you
run it from pi. Run it from a normal terminal.

## Per-machine settings

`miserc.toml` selects the `workstation` environment, which loads
`config.workstation.toml`. A machine that wants something else creates
`~/.config/mise/miserc.local.toml` (untracked, gitignored):

```toml
# WSL2 machine
env = ["wsl2"]
```

`miserc.local.toml` sits at the checkout root, so the `home` group excludes it
and it never deploys to `$HOME`.

## What the bootstrap task does

`mise run bootstrap` runs after packages, repositories, and dotfiles, and is
safe to repeat:

1. Oh My Zsh with `--keep-zshrc`, then the p10k theme and the custom plugin
   clones. The flag matters: dotfiles are already in place, so the installer
   must not overwrite `~/.zshrc`.
2. `herdr` from herdr.dev, its plugins, the local `herdr-nvim` build, and the
   zsh completion.
3. Pi, then `~/repos/pi-private-folder-guard/install.sh`, which wraps every
   `pi` launch in a bubblewrap namespace that hides the private folders of the
   Obsidian vault.
4. The Neovim plugin sync (`nvim --headless "+Lazy! sync" +qa`).
5. `mise prune`, which removes tool versions nothing selects.

Steps that stay manual because no package manager covers them:

- **Vulkan SDK**: download from <https://vulkan.lunarg.com/> and extract to
  `~/vulkan/1.4.341.1/x86_64`. `.zshrc` points `VULKAN_SDK` there.
- **Homebrew**: `/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"`.
  `.zshrc` sources `brew shellenv` when it exists.

## Language toolchains

mise owns `node`, `python`, `rust`, `uv`, `@angular/cli`,
`@googleworkspace/cli`, and `tuicr` from `[tools]`. Do not install `nodejs`,
`npm`, `python`, `rustup`, or `uv` from pacman.

```bash
mise install --locked    # install from the committed mise.lock
mise lock --global       # refresh the lockfile after a tool change
mise prune               # drop versions nothing selects
```

`~/.zshenv` puts the mise shims first on `PATH`, so GUI-launched applications
resolve the same tool versions as the terminal.

## Post-setup checks

- `echo $SHELL` shows `/bin/zsh`
- `mise bootstrap status` shows no drift
- `nvim` opens with LazyVim
- `herdr plugin list` shows `herdr-splits` and `chmarax.herdr-nvim`, and
  `~/repos/herdr-nvim/bin/herdr-nvim` exists
- `colima status` shows it running (desktop machines only)

## Docker

`.config/colima/default/colima.yaml` is deployed: 4 CPU, 8 GiB RAM, 100 GiB
disk, qemu, docker. `bin/pi-docker` auto-starts the daemon (up to 90 seconds)
and defaults to `~/repos/docker-images/Dockerfile.pi`, which
`[bootstrap.repos]` clones.

On WSL2, nested virtualization usually fails under colima. Use the host Docker
daemon instead; the nvim config already detects WSL and installs the `clip.exe`
clipboard provider.

## Ghostty

`.config/ghostty/config.ghostty` is deployed and launches plain `zsh`. Run
`herdr` yourself.

## KDE dynamic wallpaper

`wallpapers/lakeside-dynamic` is deployed through the whole-tree link:

```
wallpapers/lakeside-dynamic/
├── metadata.json
└── contents/
    ├── images/3840x2160.jpg       # day
    └── images_dark/3840x2160.jpg  # night
```

The KDE wallpaper and layout state (`kdynamicwallpaperrc`,
`plasma-org.kde.plasma.desktop-appletsrc`) is tracked and linked, with absolute
paths on purpose. A wallpaper or panel change made in the GUI shows up as a git
diff: commit it or revert it.

## Rollback

mise keeps a link ledger in `~/.local/state/mise`. To undo a deployment,
`mise dot unapply` the entries listed by `mise dot status`. A full return to the
previous stow-based setup needs the archived `~/dotfiles` checkout and its
`stow .` run.

## History

This repository used GNU Stow and a README-as-installer until mise 2026.11
gained `[dotfiles]`, `[dotfile_groups]`, and `[bootstrap]`.
