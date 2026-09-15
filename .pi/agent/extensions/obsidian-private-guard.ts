/**
 * obsidian-private-guard — in-session privacy barrier for the pi coding agent.
 *
 * Layer 2 of the guard (see README.md). The kernel-level barrier is applied by
 * the pi-safe launcher (bubblewrap mount namespace); this extension provides:
 *
 *   1. Fail-safe verification: at session start it independently verifies the
 *      kernel barrier via /proc/self/mountinfo. If the session is inside the
 *      vault but the barrier is absent, it enters LOCKDOWN: every tool call is
 *      denied with a clear error (refuse to operate rather than risk exposure).
 *   2. Clear error handling: any tool call that targets a blocked path is
 *      denied with an explicit "Permission denied" message instead of a
 *      silent failure or crash.
 *   3. Coverage of channels the kernel mask cannot reach: herdr panes (which
 *      run outside the namespace) and loopback ssh bypasses are blocked by
 *      command inspection.
 *
 * This extension never prompts. Everything outside the blocked paths works
 * exactly as before (no permission prompts, full access).
 *
 * Self-contained: only type imports from the pi package (erased at runtime),
 * so it also runs standalone under `node --experimental-strip-types` for tests.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";

/* ------------------------------- types ------------------------------------ */

interface GuardConfig {
  vault: string;
  privateFolders: string[];
  extraBlockedPaths: string[];
  maskVaultGit: boolean;
  maskVaultObsidian: boolean;
  maskObsidianAppData: boolean;
  obsidianAppDataPath: string;
  maskGhAuth: "never" | "vault" | "always";
  ghAuthPaths: string[];
  lockdownWithoutBarrier: boolean;
  realPiPath: string | null;
  /** providers whose models may read the private folders (default: llama.cpp) */
  localModelProviders: string[];
}

type LoadedConfig = { ok: true; config: GuardConfig } | { ok: false; error: string };

interface GuardState {
  configError: string | null;
  config: GuardConfig | null;
  vault: string | null;
  /** private folders + extras + worktree copies (realpath'd absolute) */
  blockedDirs: string[];
  /** relative privateFolders names — match ANY dir with that name (wildcard) */
  componentNames: string[];
  /** blockedDirs + optional .git/.obsidian/appdata masks — used for path-tool checks */
  pathPrefixes: string[];
  /** guard's own files — tamper-protected */
  guardPaths: string[];
  cwd: string | null;
  inVault: boolean;
  barrierVerified: boolean;
  lockdown: boolean;
  /** true when launched via `pi-safe --no-barrier` (intentional, no LOCKDOWN) */
  noBarrier: boolean;
  /** active model as {provider, id}, tracked for per-model enforcement */
  model: { provider: string; id: string } | null;
}

/* ------------------------------ constants --------------------------------- */

const STATUS_KEY = "priv-guard";
const BARRIER_WIDGET_KEY = "priv-guard-barrier";
const DENIED_PREFIX = "Permission denied:";

/* ------------------------------- helpers ---------------------------------- */

function expandTilde(p: string): string {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

function configPath(): string {
  return process.env.PI_SAFE_CONFIG || path.join(os.homedir(), ".config", "obsidian-private-guard", "config.json");
}

function stateDir(): string {
  return process.env.PI_SAFE_HOME || path.join(os.homedir(), ".local", "share", "obsidian-private-guard");
}

function selfPath(): string {
  // __filename under jiti / node type-stripping
  return (typeof __filename === "string" ? __filename : "") || "";
}

function realpathSyncOrNull(p: string): string | null {
  try {
    return fs.realpathSync(p);
  } catch {
    return null;
  }
}

/** realpath of the deepest existing ancestor; missing tail preserved. */
function realpathNearest(p: string): string {
  let cur = path.resolve(p);
  const tail: string[] = [];
  for (;;) {
    const r = realpathSyncOrNull(cur);
    if (r) return path.join(r, ...tail);
    const parent = path.dirname(cur);
    if (parent === cur) return cur;
    tail.unshift(path.basename(cur));
    cur = parent;
  }
}

function isDir(p: string): boolean {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

/** Unquote a git porcelain path (git C-quotes paths with special characters). */
function unquoteGitPath(p: string): string | null {
  if (p.startsWith('"') && p.endsWith('"') && p.length >= 2) {
    try {
      return JSON.parse(p) as string;
    } catch {
      return null;
    }
  }
  return p;
}

/**
 * Enumerate registered git worktrees of the vault repo (main worktree
 * included). Returns [] when git is unavailable or the vault is not a repo —
 * note that INSIDE the sandbox the vault .git is masked, so enumeration
 * fails there by design; the component-name match below covers that case.
 */
function findWorktrees(vault: string): string[] {
  try {
    const out = execFileSync("git", ["-C", vault, "worktree", "list", "--porcelain"], {
      encoding: "utf8",
      timeout: 10000,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const wts: string[] = [];
    for (const line of out.split("\n")) {
      if (!line.startsWith("worktree ")) continue;
      const p = unquoteGitPath(line.slice("worktree ".length));
      if (p) wts.push(path.resolve(p));
    }
    return wts;
  } catch {
    return [];
  }
}

/**
 * Resolve a user-supplied path argument to a canonical absolute path:
 * expand ~, resolve relative to cwd, resolve symlinks on the existing part.
 * On any uncertainty returns null → callers fail closed (block with a clear
 * reason) because the kernel barrier is the only thing that may fail open.
 */
function normalizeTarget(raw: string, cwd: string): string | null {
  try {
    if (!raw || typeof raw !== "string") return null;
    let p = expandTilde(raw.trim());
    if (!path.isAbsolute(p)) p = path.resolve(cwd, p);
    return realpathNearest(p);
  } catch {
    return null;
  }
}

function underPrefix(p: string, prefix: string): boolean {
  return p === prefix || p.startsWith(prefix + path.sep);
}

function inVaultPath(p: string, vault: string): boolean {
  return p === vault || p.startsWith(vault + path.sep);
}

function homeVariant(abs: string): string {
  const home = os.homedir();
  if (abs === home) return "~";
  if (abs.startsWith(home + path.sep)) return "~" + abs.slice(home.length);
  return abs;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * True when the active model belongs to a provider allowed to read the private
 * folders (config `localModelProviders`, default ["llama.cpp"]). Entries may be
 * a provider name ("llama.cpp"), a provider wildcard ("llama.cpp/*"), or an
 * exact "provider/model" pair. No model → not local (fail closed).
 */
function isLocalModel(model: { provider?: string; id?: string } | null | undefined): boolean {
  if (!model?.provider) return false;
  for (const raw of state.config?.localModelProviders ?? []) {
    const p = raw.trim();
    if (!p) continue;
    if (p.endsWith("/*")) {
      if (model.provider === p.slice(0, -2)) return true;
    } else if (p.includes("/")) {
      const slash = p.indexOf("/");
      if (model.provider === p.slice(0, slash) && model.id === p.slice(slash + 1)) return true;
    } else {
      if (model.provider === p) return true;
    }
  }
  return false;
}

/**
 * Path prefixes to enforce for the active model. Local models are allowed into
 * the private folders themselves (and anything nested under them); every other
 * mask (vault .git/.obsidian, app data, gh auth) still applies to everyone.
 */
function effectivePathPrefixes(local: boolean): string[] {
  if (!local) return state.pathPrefixes;
  return state.pathPrefixes.filter((p) => !state.blockedDirs.some((b) => underPrefix(p, b)));
}

/* ----------------------------- config load -------------------------------- */

function loadConfig(): LoadedConfig {
  const cp = configPath();
  let raw: string;
  try {
    raw = fs.readFileSync(cp, "utf8");
  } catch (e) {
    const err = e as NodeJS.ErrnoException;
    return { ok: false, error: `cannot read guard config ${cp} (${err.message})` };
  }
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return { ok: false, error: `guard config ${cp} is not valid JSON (${(e as Error).message})` };
  }
  const c: GuardConfig = {
    vault: expandTilde(String(parsed.vault || "")),
    privateFolders: Array.isArray(parsed.privateFolders) ? parsed.privateFolders.map(String) : [],
    extraBlockedPaths: Array.isArray(parsed.extraBlockedPaths) ? parsed.extraBlockedPaths.map(String) : [],
    maskVaultGit: parsed.maskVaultGit !== false,
    maskVaultObsidian: parsed.maskVaultObsidian !== false,
    maskObsidianAppData: parsed.maskObsidianAppData !== false,
    obsidianAppDataPath: expandTilde(String(parsed.obsidianAppDataPath || path.join(os.homedir(), ".config", "obsidian"))),
    maskGhAuth: ["never", "vault", "always"].includes(parsed.maskGhAuth) ? parsed.maskGhAuth : "vault",
    ghAuthPaths: Array.isArray(parsed.ghAuthPaths)
      ? parsed.ghAuthPaths.map((g: any) => expandTilde(String(g)))
      : [path.join(os.homedir(), ".config", "gh", "hosts.yml")],
      lockdownWithoutBarrier: parsed.lockdownWithoutBarrier !== false,
    realPiPath: parsed.realPiPath ? expandTilde(String(parsed.realPiPath)) : null,
    localModelProviders:
      Array.isArray(parsed.localModelProviders) && parsed.localModelProviders.length
        ? parsed.localModelProviders.map(String)
        : ["llama.cpp"],
  };
  return { ok: true, config: c };
}

/* ------------------------------ guard state -------------------------------- */

const state: GuardState = {
  configError: null,
  config: null,
  vault: null,
  blockedDirs: [],
  componentNames: [],
  pathPrefixes: [],
  guardPaths: [],
  cwd: null,
  inVault: false,
  barrierVerified: false,
  lockdown: false,
  noBarrier: false,
  model: null,
};

function computeGuardPaths(): string[] {
  const paths = [configPath(), stateDir()];
  const self = selfPath();
  if (self) paths.push(self);
  const bin = path.join(os.homedir(), ".pi", "agent", "bin");
  paths.push(path.join(bin, "pi"), path.join(bin, "pi-safe"));
  return paths.map(realpathNearest).filter((p) => p && p !== "/");
}

function refreshState(cwd: string): void {
  state.cwd = cwd;
  state.configError = null;
  state.blockedDirs = [];
  state.componentNames = [];
  state.pathPrefixes = [];
  state.guardPaths = computeGuardPaths();
  state.noBarrier = process.env.PI_SAFE_NO_BARRIER === "1";

  const loaded = loadConfig();
  if (!loaded.ok) {
    state.configError = loaded.error;
    state.config = null;
    state.vault = null;
    state.inVault = false;
    state.lockdown = true; // fail-safe: cannot know what to protect
    state.barrierVerified = false;
    return;
  }
  state.config = loaded.config;

  const vaultReal = realpathSyncOrNull(loaded.config.vault);
  if (!vaultReal || !isDir(vaultReal)) {
    state.configError = `vault directory does not exist: ${loaded.config.vault}`;
    state.vault = null;
    state.inVault = false;
    state.lockdown = true; // fail-safe
    state.barrierVerified = false;
    return;
  }
  state.vault = vaultReal;
  state.inVault = inVaultPath(realpathNearest(cwd), vaultReal);

  const blocked: string[] = [];
  for (const folder of loaded.config.privateFolders) {
    if (!folder) continue;
    const abs = path.isAbsolute(folder) ? expandTilde(folder) : path.join(vaultReal, folder);
    const real = realpathSyncOrNull(abs);
    if (real && isDir(real)) blocked.push(real);
  }
  for (const extra of loaded.config.extraBlockedPaths) {
    if (!extra) continue;
    const real = realpathSyncOrNull(expandTilde(extra));
    if (real) blocked.push(real);
  }
  // Wildcard names: a RELATIVE private folder name matches ANY directory with
  // that name, wherever it appears (git worktrees, other copies). Collect the
  // names for per-call component matching, and enumerate this vault's git
  // worktrees so their copies get concrete blocked prefixes. (Inside the
  // sandbox the enumeration fails — masked .git — and the component match
  // covers it.)
  state.componentNames = loaded.config.privateFolders.filter((f) => f && !path.isAbsolute(f));
  for (const wt of findWorktrees(vaultReal)) {
    if (wt === vaultReal) continue;
    for (const folder of loaded.config.privateFolders) {
      if (!folder || path.isAbsolute(folder)) continue;
      const real = realpathSyncOrNull(path.join(wt, folder));
      if (real && isDir(real) && !blocked.includes(real)) blocked.push(real);
    }
  }
  state.blockedDirs = blocked;

  const prefixes = [...blocked];
  if (loaded.config.maskObsidianAppData) {
    const od = realpathNearest(loaded.config.obsidianAppDataPath);
    if (isDir(od)) prefixes.push(od);
  }
  if (loaded.config.maskVaultGit) {
    const g = path.join(vaultReal, ".git");
    if (isDir(g)) prefixes.push(realpathNearest(g));
  }
  if (loaded.config.maskVaultObsidian) {
    const o = path.join(vaultReal, ".obsidian");
    if (isDir(o)) prefixes.push(realpathNearest(o));
  }
  state.pathPrefixes = prefixes;

  // Lockdown: inside the vault (or configured lockdown) without the kernel
  // barrier, or blocked dirs missing (they should always exist).
  const missingBlocked = loaded.config.privateFolders.some((f) => {
    if (!f) return false;
    const abs = path.isAbsolute(f) ? expandTilde(f) : path.join(vaultReal, f);
    const real = realpathSyncOrNull(abs);
    return !real || !isDir(real);
  });

  state.barrierVerified = verifyBarrier();
  // LOCKDOWN when the barrier should be there but isn't. A `pi-safe --no-barrier`
  // launch is an intentional opt-out: the extension then enforces the private
  // folders per model (local providers allowed, everything else blocked).
  const mustHaveBarrier = loaded.config.lockdownWithoutBarrier && state.inVault && !state.noBarrier;
  state.lockdown = missingBlocked || (mustHaveBarrier && !state.barrierVerified);
}

/* --------------------------- barrier verification -------------------------- */

function unescapeMountpoint(s: string): string {
  return s.replace(/\\(040|011|012|134)/g, (m) =>
    m === "\\040" ? " " : m === "\\011" ? "\t" : m === "\\012" ? "\n" : "\\",
  );
}

function mountPoints(): Set<string> | null {
  try {
    const miPath = process.env.PI_SAFE_MOUNTINFO || "/proc/self/mountinfo";
    const mi = fs.readFileSync(miPath, "utf8");
    const points = new Set<string>();
    for (const line of mi.split("\n")) {
      const parts = line.split(" ");
      if (parts.length > 4) points.add(unescapeMountpoint(parts[4]));
    }
    return points;
  } catch {
    return null;
  }
}

/**
 * Verify the kernel barrier for the current session cwd: every mask the
 * launcher would have applied must appear as a mount point. Mirrors
 * computeMasks() in the launcher's launch-config.js.
 */
function verifyBarrier(): boolean {
  if (!state.config || !state.vault) return false;
  const points = mountPoints();
  if (!points) return false;

  const targets: string[] = [...state.blockedDirs];
  if (state.config.maskObsidianAppData) {
    const od = realpathNearest(state.config.obsidianAppDataPath);
    if (isDir(od)) targets.push(od);
  }
  if (state.config.maskVaultGit) {
    const g = path.join(state.vault, ".git");
    if (isDir(g)) targets.push(realpathNearest(g));
  }
  if (state.config.maskVaultObsidian) {
    const o = path.join(state.vault, ".obsidian");
    if (isDir(o)) targets.push(realpathNearest(o));
  }
  const ghWanted = state.config.maskGhAuth === "always" || (state.config.maskGhAuth === "vault" && state.inVault);
  if (ghWanted) {
    for (const gp of state.config.ghAuthPaths) {
      try {
        if (fs.statSync(gp).isFile()) targets.push(realpathNearest(gp));
      } catch {
        /* nothing to mask */
      }
    }
  }
  if (targets.length === 0) return false;
  return targets.every((t) => points.has(t));
}

/* ------------------------------ blocking logic ----------------------------- */

function deny(reason: string): { block: true; reason: string } {
  return { block: true, reason: `${DENIED_PREFIX} ${reason}` };
}

function lockdownReason(): string {
  const why = state.configError
    ? `guard configuration problem: ${state.configError}`
    : "the kernel privacy barrier is not active in this session";
  return (
    `this session is in LOCKDOWN. ${why[0].toUpperCase()}${why.slice(1)}. ` +
    "No tool will be allowed to run. Exit and restart pi through the pi-safe launcher " +
    "(normally just run: pi) so the privacy barrier is applied, or run pi outside the vault."
  );
}

/** Path-bearing tools and the input fields that carry paths. */
const PATH_TOOL_FIELDS: Record<string, string[]> = {
  read: ["path"],
  write: ["path"],
  edit: ["path"],
  ls: ["path", "dir", "directory"],
  find: ["path", "dir", "root"],
  grep: ["path", "dir", "root"],
  herdr_layout: ["cwd"],
};

function checkPathTool(toolName: string, input: any, cwd: string, local: boolean): { block: true; reason: string } | undefined {
  const fields = PATH_TOOL_FIELDS[toolName];
  if (!fields) return undefined;
  for (const field of fields) {
    const raw = input?.[field];
    if (typeof raw !== "string" || !raw) continue;
    const abs = normalizeTarget(raw, cwd);
    if (abs === null) {
      return deny(`cannot resolve the path safely, so access is blocked (${toolName}.${field}="${raw}").`);
    }
    const hit = effectivePathPrefixes(local).find((p) => underPrefix(abs, p));
    if (hit) {
      return deny(
        `"${raw}" resolves to "${abs}", which is inside the private notes area (${hit}). ` +
          (local
            ? "This area is blocked by the obsidian-private-guard and cannot be read, searched, or modified. "
            : "This area is blocked by the obsidian-private-guard for cloud models and cannot be read, searched, or modified. ") +
          "Do not retry or attempt workarounds.",
      );
    }
    // Wildcard by folder name: any directory named like a relative private
    // folder (e.g. 01-personal inside a git worktree) is blocked too.
    if (!local && state.componentNames.length > 0) {
      const segs = abs.split(path.sep);
      const name = state.componentNames.find((n) => segs.includes(n));
      if (name) {
        return deny(
          `"${raw}" resolves to "${abs}", which contains a private folder ("${name}/"). ` +
            "The obsidian-private-guard blocks that folder name everywhere it appears " +
            "(including worktrees and copies of the vault). Do not retry or attempt workarounds.",
        );
      }
    }
    const guardHit = state.guardPaths.find((p) => underPrefix(abs, p));
    if (guardHit) {
      return deny(`"${raw}" is part of the privacy guard itself (${guardHit}) and is off-limits in AI sessions.`);
    }
  }
  return undefined;
}

function isLocalPathish(u: string): boolean {
  if (!u || typeof u !== "string") return false;
  let s = u.trim();
  if (s.startsWith("file://")) s = s.slice("file://".length);
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) return false; // http(s) etc.
  return s.startsWith("/") || s.startsWith("./") || s.startsWith("../") || s.startsWith("~") || s === "." || s === "..";
}

function checkFetchContent(input: any, cwd: string, local: boolean): { block: true; reason: string } | undefined {
  const urls: string[] = [];
  if (typeof input?.url === "string") urls.push(input.url);
  if (Array.isArray(input?.urls)) urls.push(...input.urls.filter((u: any) => typeof u === "string"));
  for (const u of urls) {
    if (!isLocalPathish(u)) continue;
    let s = u.trim();
    if (s.startsWith("file://")) s = s.slice("file://".length);
    const abs = normalizeTarget(s, cwd);
    if (abs === null) continue; // unverifiable local path: fetch itself will fail safely on bad paths
    const hit = effectivePathPrefixes(local).find((p) => underPrefix(abs, p));
    if (hit) {
      return deny(`local fetch of "${u}" targets the private notes area (${hit}).`);
    }
  }
  return undefined;
}

/** Build the token patterns used to scan shell/agent command text. */
function commandTokens(local: boolean): { token: string; label: string }[] {
  const tokens: { token: string; label: string }[] = [];
  const add = (abs: string, label: string) => {
    tokens.push({ token: abs, label });
    const hv = homeVariant(abs);
    if (hv !== abs) tokens.push({ token: hv, label });
  };
  if (!local) for (const b of state.blockedDirs) add(b, b);
  if (state.config && state.vault) {
    if (state.config.maskVaultGit) add(path.join(state.vault, ".git"), "vault git history");
    if (state.config.maskVaultObsidian) add(path.join(state.vault, ".obsidian"), "vault Obsidian config");
  }
  if (state.config?.maskObsidianAppData) add(realpathNearest(state.config.obsidianAppDataPath), "Obsidian app data");
  for (const g of state.guardPaths) add(g, "the privacy guard itself");
  return tokens;
}

const LOOPBACK_SSH_RE =
  /(^|[\s;|&])(ssh|scp|sftp|rsync)\b[^;|&]*(localhost|127\.0\.0\.1|127\.0\.1\.1|0\.0\.0\.0|\[::1\]|\$\(?HOSTNAME\)?|\bhostname\b)/i;

function scanCommandText(command: string, cwd: string, local: boolean): { block: true; reason: string } | undefined {
  if (typeof command !== "string" || !command) return undefined;

  for (const { token, label } of commandTokens(local)) {
    if (command.includes(token)) {
      return deny(
        `this command references ${label} ("${token}"), which is blocked by the obsidian-private-guard. ` +
          "Do not retry or attempt workarounds.",
      );
    }
  }

  // Vault-relative references (e.g. `cat 01-personal/x.md`) when cwd is the vault.
  if (state.inVault && state.config && state.vault) {
    const relTargets: { rel: string; label: string }[] = [];
    if (!local) {
      for (const b of state.blockedDirs) {
        const rel = path.relative(state.vault, b);
        if (rel && !rel.startsWith("..")) relTargets.push({ rel, label: b });
      }
    }
    if (state.config.maskVaultGit) relTargets.push({ rel: ".git", label: "vault git history" });
    if (state.config.maskVaultObsidian) relTargets.push({ rel: ".obsidian", label: "vault Obsidian config" });
    for (const { rel, label } of relTargets) {
      const re = new RegExp(`(^|[\\s'"=;|&(:])\\.?/?${escapeRegExp(rel)}(/|[\\s'"|)&;]|$)`);
      if (re.test(command)) {
        return deny(`this command references the vault-relative path "${rel}" (${label}), which is blocked.`);
      }
    }
  }

  // Wildcard folder names: a relative private folder name is blocked as a
  // path component in commands, wherever it appears (worktrees, copies).
  if (!local && state.componentNames.length > 0) {
    for (const name of state.componentNames) {
      const re = new RegExp(`(^|[\\s'"=;|&(:/])${escapeRegExp(name)}(/|[\\s'"|)&;:]|$)`);
      if (re.test(command)) {
        return deny(
          `this command references a private folder ("${name}/"), which is blocked by the ` +
            "obsidian-private-guard everywhere that name appears (including worktrees and copies " +
            "of the vault). Do not retry or attempt workarounds.",
        );
      }
    }
  }

  if (LOOPBACK_SSH_RE.test(command)) {
    return deny(
      "ssh/scp/rsync to this same machine would execute outside the privacy barrier's namespace " +
        "and is blocked (obsidian-private-guard).",
    );
  }
  return undefined;
}

function checkToolCall(
  toolName: string,
  input: any,
  cwd: string,
  model?: { provider?: string; id?: string } | null,
): { block: true; reason: string } | undefined {
  if (state.lockdown) return deny(lockdownReason());

  // Refresh state if the session cwd changed (cheap; mounts don't change mid-session).
  if (state.cwd !== cwd) refreshState(cwd);
  if (state.lockdown) return deny(lockdownReason());

  const local = isLocalModel(model ?? state.model);

  const pathBlock = checkPathTool(toolName, input, cwd, local);
  if (pathBlock) return pathBlock;

  if (toolName === "bash" || toolName === "powershell") {
    const b = scanCommandText(input?.command, cwd, local);
    if (b) return b;
    return undefined;
  }

  // herdr panes run OUTSIDE the pi sandbox — inspect everything that becomes
  // a command or prompt there.
  if (toolName === "herdr_pane" || toolName === "herdr_agent") {
    const texts: string[] = [];
    for (const field of ["command", "text", "prompt"]) {
      if (typeof input?.[field] === "string") texts.push(input[field]);
    }
    if (Array.isArray(input?.agentArgs)) texts.push(...input.agentArgs.filter((a: any) => typeof a === "string"));
    const joined = texts.join("\n");
    if (joined) {
      const b = scanCommandText(joined, cwd, local);
      if (b) {
        return {
          block: true,
          reason:
            b.reason +
            " (This herdr pane runs outside the privacy barrier's namespace, so such commands are blocked here.)",
        };
      }
    }
    return undefined;
  }

  if (toolName === "fetch_content") {
    return checkFetchContent(input, cwd, local);
  }

  return undefined;
}

/* --------------------------------- plugin ---------------------------------- */

export default function obsidianPrivateGuard(pi: ExtensionAPI): void {
  const folderNames = (): string => {
    if (state.config?.privateFolders?.length) return state.config.privateFolders.join(", ");
    return "(private folders)";
  };

  const syncModel = (ctx: any, event?: any): { provider: string; id: string } | null => {
    const m = event?.model ?? ctx?.model;
    if (m && typeof m.provider === "string" && typeof m.id === "string") {
      state.model = { provider: m.provider, id: m.id };
    }
    return state.model;
  };

  const statusText = (): string => {
    if (state.lockdown) return "🔒 LOCKDOWN (barrier inactive)";
    if (state.noBarrier) {
      const local = isLocalModel(state.model);
      return local
        ? `🔓 ${folderNames()} readable (local model, no-barrier launch)`
        : `🔒 ${folderNames()} blocked for cloud models (no-barrier launch)`;
    }
    if (state.inVault) return `🔒 ${folderNames()} (kernel barrier verified)`;
    if (state.barrierVerified) return `🔒 ${folderNames()} (barrier active)`;
    return "⚠ guard inactive (unprotected launch)";
  };

  // One-time launch notice, styled like pi's built-in [Skills]/[Extensions]
  // sections (mdHeading title + dim two-space-indented body). Cleared on the
  // first agent turn so it stays launch-only; LOCKDOWN keeps it visible.
  let barrierWidgetUp = false;
  const showBarrierWidget = async (ctx: any): Promise<void> => {
    if (!ctx?.hasUI || typeof ctx.ui?.setWidget !== "function") return;
    const heading = state.lockdown ? "[Folder Barrier] — LOCKDOWN" : "[Folder Barrier]";
    const headingColor = state.lockdown ? "error" : "mdHeading";
    try {
      const { Container, Text } = await import("@earendil-works/pi-tui");
      ctx.ui.setWidget(BARRIER_WIDGET_KEY, (_tui: unknown, theme: any) => {
        const box = new Container();
        box.addChild(new Text(theme.fg(headingColor, heading), 0, 0));
        box.addChild(new Text(theme.fg("dim", `  ${statusText()}`), 0, 0));
        return box;
      });
    } catch {
      // pi-tui components unavailable (e.g. test harness) — plain-text fallback
      ctx.ui.setWidget(BARRIER_WIDGET_KEY, [heading, `  ${statusText()}`]);
    }
    barrierWidgetUp = true;
  };

  pi.on("session_start", async (_event: any, ctx: any) => {
    try {
      refreshState(ctx.cwd);
      syncModel(ctx);
    } catch {
      state.lockdown = true;
      state.configError = "unexpected error while initializing the guard";
    }

    if (state.lockdown) {
      const msg = `obsidian-private-guard: LOCKDOWN — ${state.configError || "kernel privacy barrier not active"}. All tools are denied. Restart via the pi-safe launcher (usually: pi).`;
      if (ctx.hasUI) {
        ctx.ui.notify(msg, "error");
        ctx.ui.setStatus(STATUS_KEY, statusText());
        await showBarrierWidget(ctx);
      }
      return;
    }

    // Barrier status is a one-time launch section, not a persistent footer.
    await showBarrierWidget(ctx);
    if (state.noBarrier && ctx.hasUI) {
      ctx.ui.notify(
        "obsidian-private-guard: running WITHOUT the kernel privacy barrier (--no-barrier). " +
          `The private folder(s) ${folderNames()} are blocked for all providers except local models ` +
          "(default: llama.cpp/*). Cloud models must not attempt to access them.",
        "warning",
      );
    }
  });

  pi.on("model_select", async (event: any, ctx: any) => {
    syncModel(ctx, event);
    if (state.noBarrier && !state.lockdown && ctx.hasUI && state.model) {
      const local = isLocalModel(state.model);
      ctx.ui.notify(
        local
          ? `obsidian-private-guard: ${state.model.provider}/${state.model.id} is a local model — private folder(s) ${folderNames()} are readable in this no-barrier session.`
          : `obsidian-private-guard: ${state.model.provider}/${state.model.id} is a cloud model — private folder(s) ${folderNames()} are blocked.`,
        local ? "info" : "warning",
      );
    }
    return undefined;
  });

  pi.on("tool_call", async (event: any, ctx: any) => {
    const cwd = ctx?.cwd || state.cwd || process.cwd();
    syncModel(ctx);
    const decision = checkToolCall(event.toolName, event.input, cwd, ctx?.model);
    if (decision) return decision;
    return undefined;
  });

  pi.on("before_agent_start", async (event: any, ctx: any) => {
    if (barrierWidgetUp && !state.lockdown) {
      barrierWidgetUp = false;
      if (ctx.hasUI && typeof ctx.ui?.setWidget === "function") {
        ctx.ui.setWidget(BARRIER_WIDGET_KEY, undefined);
      }
    }
    if (!state.config || !state.vault) return undefined;
    const model = syncModel(ctx);

    if (state.noBarrier) {
      if (isLocalModel(model)) {
        const notice =
          `Privacy notice: this session runs WITHOUT the kernel barrier (pi-safe --no-barrier). ` +
          `The folder(s) ${folderNames()} are readable because the active model (${model?.provider ?? "?"}/${model?.id ?? "?"}) ` +
          "is a local model. Treat their contents as private to this machine: never send them to any cloud service " +
          "or include them in output intended for sharing. If the session switches to a cloud model, these folders become blocked again.";
        return { systemPrompt: `${event.systemPrompt}\n\n${notice}` };
      }
      const notice =
        `Privacy notice: the folder(s) ${folderNames()} in this vault are private and blocked for cloud models ` +
        "(this session runs without the kernel barrier, so the obsidian-private-guard extension enforces this itself). " +
        "Every read, search, or command targeting them will fail with 'Permission denied'. Do not attempt to access " +
        "them or devise workarounds. All other notes in the vault are fully accessible — work with those normally.";
      return { systemPrompt: `${event.systemPrompt}\n\n${notice}` };
    }

    if (!state.inVault) return undefined;
    const notice =
      `Privacy notice: the folder(s) ${folderNames()} in this vault are private and blocked by a ` +
      "mandatory OS-level barrier. Every read, search, git-history, or link-follow attempt targeting them " +
      "will fail with 'Permission denied'. Do not attempt to access them, search their contents, or devise " +
      "workarounds. All other notes in the vault are fully accessible — work with those normally.";
    return { systemPrompt: `${event.systemPrompt}\n\n${notice}` };
  });

  pi.registerCommand("guard-status", {
    description: "Show obsidian-private-guard status (blocked paths, barrier state)",
    handler: async (_args: string, ctx: any) => {
      refreshState(ctx.cwd);
      syncModel(ctx);
      const lines = [
        `config: ${configPath()}`,
        `vault: ${state.vault ?? "(unresolved)"}`,
        `blocked paths: ${state.blockedDirs.join(", ") || "(none)"}`,
        `wildcard folder names (blocked anywhere): ${state.componentNames.join(", ") || "(none)"}`,
        `local model providers (may read private folders): ${(state.config?.localModelProviders ?? []).join(", ")}`,
        `active model: ${state.model ? `${state.model.provider}/${state.model.id}` : "(none)"}${isLocalModel(state.model) ? " (LOCAL — private folders readable)" : ""}`,
        `masked extras: ${state.pathPrefixes.filter((p) => !state.blockedDirs.includes(p)).join(", ") || "(none)"}`,
        `session cwd: ${state.cwd ?? "?"} ${state.inVault ? "(inside vault)" : ""}`,
        `kernel barrier: ${state.barrierVerified ? "VERIFIED" : state.noBarrier ? "OFF (--no-barrier launch)" : "not active"}`,
        `mode: ${state.lockdown ? "LOCKDOWN (all tools denied)" : state.noBarrier ? "no-barrier (extension-only, per-model enforcement)" : "guarding"}`,
      ];
      if (ctx.hasUI) ctx.ui.notify(lines.join("\n"), state.lockdown ? "error" : "info");
    },
  });
}

/* Exports used by the standalone test suite (node --experimental-strip-types). */
export const __internals = {
  expandTilde,
  realpathNearest,
  normalizeTarget,
  underPrefix,
  loadConfig,
  refreshState,
  verifyBarrier,
  checkToolCall,
  scanCommandText,
  checkPathTool,
  checkFetchContent,
  isLocalModel,
  effectivePathPrefixes,
  findWorktrees,
  unquoteGitPath,
  mountPoints,
  state,
  configPath,
};
