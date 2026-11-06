/**
 * Rename the Herdr pane label from a generated title.
 *
 * One destination only: the Herdr pane label. The pi session name and the OSC 2
 * terminal title are left alone.
 *
 * Two pitfalls this file carries from the package it replaces:
 * - A title is one short line, so the naming request must not reason. Reasoning
 *   models spend a small output budget on hidden thinking and can return no
 *   text at all, which surfaces as an invalid title. pi emits no thinking-off
 *   signal for the models in use, so the request body asks for it directly, and
 *   the fields differ per adapter.
 * - opencode routes by session and rejects a request without a session header,
 *   so the naming request reuses the live session id and sends it explicitly.
 *
 * Settings live in the naming block of ~/.pi/agent/pi-herdr.json:
 * { "naming": { "enabled": true, "model": "", "maxChars": 32 } }
 */

import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import { join } from "node:path";

import type { UserMessage } from "@earendil-works/pi-ai";
// The loader aliases this subpath to the same compat module for type and runtime.
import { completeSimple } from "@earendil-works/pi-ai/compat";
import {
  getAgentDir,
  type ExtensionAPI,
  type ExtensionCommandContext,
  type ExtensionContext,
  type SessionEntry,
} from "@earendil-works/pi-coding-agent";

const SETTINGS_FILE = "pi-herdr.json";
const DEFAULT_TITLE_MAX_CHARS = 32;
const NAMING_SOURCE_CHAR_MAX = 4000;
const NAMING_MAX_TOKENS = 64;
const REQUEST_TIMEOUT_MS = 30_000;
const SOCKET_TIMEOUT_MS = 1500;
const OPENCODE_SESSION_HEADER = "x-opencode-session";

const TITLE_PROMPT = `You name coding sessions.

Reply with exactly one line:
TITLE: <short title>

Rules:
- Write the title in the same language the user wrote in.
- Describe the concrete task, not the tooling.
- Keep it short enough to fit a terminal tab label.
- No quotes, no punctuation at the end, no emoji, no markdown, no extra labels or explanation.

Example:
TITLE: Fix OAuth callback`;

type NamingSource = "user_message" | "conversation";

type NamingSettings = {
  enabled: boolean;
  /** Empty means "use the model the session is already running on". */
  model: string;
  maxChars: number;
};

type RenameFailureReason =
  | "missing_prompt"
  | "missing_model"
  | "missing_auth"
  | "request_failed"
  | "invalid_output"
  | "skipped"
  | "stale_session";

type GenerateTitleResult =
  | { ok: true; title: string }
  | { ok: false; reason: Exclude<RenameFailureReason, "skipped" | "stale_session">; detail?: string };

type RenameResult =
  | { ok: true; title: string }
  | { ok: false; reason: RenameFailureReason; detail?: string };

// --- Herdr socket -----------------------------------------------------------

function socketEndpoint(): string | undefined {
  const socketPath = process.env.HERDR_SOCKET_PATH;
  if (!socketPath) return undefined;
  return process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath;
}

/** One request per connection, newline-delimited JSON. Resolves undefined on any failure. */
function sendRequest(endpoint: string, method: string, params: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    const socket = net.createConnection(endpoint);
    let buffer = "";
    let settled = false;

    const finish = (value: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };

    const timer = setTimeout(() => finish(undefined), SOCKET_TIMEOUT_MS);
    timer.unref?.();

    socket.on("error", () => finish(undefined));
    socket.on("end", () => finish(undefined));
    socket.on("connect", () => {
      const id = `pi-herdr-pane-name:${Date.now()}:${Math.random().toString(36).slice(2)}`;
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
    socket.on("data", (chunk) => {
      buffer += chunk.toString();
      const newline = buffer.indexOf("\n");
      if (newline === -1) return;

      try {
        const response = JSON.parse(buffer.slice(0, newline)) as { result?: unknown };
        finish(response.result);
      } catch {
        finish(undefined);
      }
    });
  });
}

async function setPaneLabel(endpoint: string, paneId: string, label: string): Promise<boolean> {
  const result = (await sendRequest(endpoint, "pane.rename", { pane_id: paneId, label })) as
    | { pane?: { pane_id?: string } }
    | undefined;
  return !!result?.pane;
}

// --- Settings ---------------------------------------------------------------

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readPositiveInteger(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  return Math.floor(value);
}

function readSettingsFile(): Record<string, unknown> {
  try {
    const settingsPath = join(getAgentDir(), SETTINGS_FILE);
    if (!existsSync(settingsPath)) return {};
    return asObject(JSON.parse(readFileSync(settingsPath, "utf-8")));
  } catch {
    return {};
  }
}

/** Read fresh on each attempt so edits to the file apply without a restart. */
function readNamingSettings(): NamingSettings {
  const naming = asObject(readSettingsFile().naming);

  return {
    enabled: typeof naming.enabled === "boolean" ? naming.enabled : true,
    model: typeof naming.model === "string" ? naming.model.trim() : "",
    maxChars: readPositiveInteger(naming.maxChars, DEFAULT_TITLE_MAX_CHARS),
  };
}

// --- Title text -------------------------------------------------------------

function sanitizeTitle(value: string): string {
  return value
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s"'`“”‘’]+|[\s"'`“”‘’]+$/g, "")
    .trim();
}

/** Cut at a word boundary so a label does not end mid-word. */
export function compactTitle(value: string, maxChars = DEFAULT_TITLE_MAX_CHARS): string | undefined {
  const title = sanitizeTitle(value);
  if (!title) return undefined;
  if (title.length <= maxChars) return title;

  const clipped = title.slice(0, maxChars + 1);
  const lastSpace = clipped.lastIndexOf(" ");
  if (lastSpace > 0) {
    const atBoundary = clipped.slice(0, lastSpace).trim();
    if (atBoundary) return atBoundary;
  }

  return title.slice(0, maxChars).trim() || undefined;
}

function cleanGeneratedValue(value: string): string {
  return value
    .replace(/^\d+\.\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/^[\s"'`]+|[\s"'`]+$/g, "")
    .trim();
}

function parseGeneratedTitle(value: string): { title?: string } {
  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const titleMatch = line.match(/title\s*:\s*(.*)$/i);
    if (titleMatch?.[1]) {
      return { title: cleanGeneratedValue(titleMatch[1]) };
    }
  }

  if (lines.length === 1) {
    return { title: cleanGeneratedValue(lines[0]!) };
  }

  return {};
}

function extractTextFromMessageContent(content: unknown): string {
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";

  return content
    .filter(
      (part): part is { type: "text"; text: string } =>
        !!part && typeof part === "object" && "type" in part && part.type === "text" && "text" in part,
    )
    .map((part) => part.text.trim())
    .filter(Boolean)
    .join("\n")
    .trim();
}

function normalizeUserPrompt(text: string): string | undefined {
  const prompt = text.replace(/^(?:<skill\b[^>]*>[\s\S]*?<\/skill>\s*)+/, "").trim();
  return prompt || undefined;
}

function getFirstUserPrompt(entries: SessionEntry[], fallback?: string): string | undefined {
  for (const entry of entries) {
    if (entry.type !== "message") continue;
    if (entry.message.role !== "user") continue;

    const prompt = normalizeUserPrompt(extractTextFromMessageContent(entry.message.content));
    if (prompt) return prompt;
  }

  return normalizeUserPrompt(fallback ?? "");
}

function buildConversationNamingSource(entries: SessionEntry[]): string | undefined {
  const messages: string[] = [];

  for (const entry of entries) {
    if (entry.type !== "message") continue;

    const role = entry.message.role;
    if (role !== "user" && role !== "assistant") continue;

    const text = extractTextFromMessageContent(entry.message.content);
    if (!text) continue;

    messages.push(`<${role}>\n${text}\n</${role}>`);
  }

  const conversation = messages.join("\n\n").trim();
  return conversation || undefined;
}

function formatNamingPrompt(seed: string, source: NamingSource): string {
  const tag = source === "conversation" ? "conversation" : "user_message";
  const content = seed.trim().slice(0, NAMING_SOURCE_CHAR_MAX);

  return `<${tag}>\n${content}\n</${tag}>\n\nReply with:\nTITLE: <short title>`;
}

// --- Naming request ---------------------------------------------------------

function parseModelSpec(modelSpec: string): { provider: string; modelId: string } | undefined {
  const [provider, ...modelParts] = modelSpec.split("/");
  const modelId = modelParts.join("/");
  if (!provider?.trim() || !modelId.trim()) return undefined;
  return { provider: provider.trim(), modelId: modelId.trim() };
}

function resolveNamingModel(ctx: ExtensionContext, modelSpec: string) {
  const spec = modelSpec.trim();
  if (!spec) return ctx.model;

  const parsed = parseModelSpec(spec);
  if (!parsed) return undefined;

  return ctx.modelRegistry.find(parsed.provider, parsed.modelId) ?? ctx.model;
}

function namingSessionId(ctx: ExtensionContext): string | undefined {
  try {
    const id = ctx.sessionManager?.getSessionId?.();
    return typeof id === "string" && id.length > 0 ? id : undefined;
  } catch {
    return undefined;
  }
}

/** opencode rejects a request that carries no session header; send it explicitly. */
function opencodeSessionHeaders(
  model: { provider?: string },
  sessionId: string | undefined,
): Record<string, string> | undefined {
  if (!sessionId) return undefined;
  if (model.provider !== "opencode" && model.provider !== "opencode-go") return undefined;
  return { [OPENCODE_SESSION_HEADER]: sessionId };
}

type ReasoningCapableModel = {
  reasoning?: boolean;
  api?: string;
  /** Adapter-specific settings; the thinking format differs per adapter. */
  compat?: unknown;
};

/**
 * The request body asks for thinking off, because a small output budget spent
 * on reasoning returns no text. pi only sends its own thinking-off signal when
 * the catalog marks "off" as supported, and the models in use do not.
 */
function reasoningOffPayloadFields(model: ReasoningCapableModel): Record<string, unknown> | undefined {
  if (!model.reasoning || model.api !== "openai-completions") return undefined;

  const thinkingFormat = (model.compat as { thinkingFormat?: string } | undefined)?.thinkingFormat;

  switch (thinkingFormat) {
    case "deepseek":
    case "zai":
      return { thinking: { type: "disabled" } };
    case "qwen":
      return { enable_thinking: false };
    case "qwen-chat-template":
    case "chat-template":
      return { chat_template_kwargs: { enable_thinking: false } };
    case "openrouter":
      return { reasoning: { effort: "none" } };
    case "together":
      return { reasoning: { enabled: false } };
    case "string-thinking":
      return { thinking: "none" };
    default:
      return { reasoning_effort: "none" };
  }
}

/** onPayload is the portable place to add those fields: every adapter runs it. */
function disableReasoningInPayload(model: ReasoningCapableModel, payload: unknown): unknown {
  const fields = reasoningOffPayloadFields(model);
  if (!fields || typeof payload !== "object" || payload === null) return payload;

  return { ...(payload as Record<string, unknown>), ...fields };
}

function describeError(error: unknown): string | undefined {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return message.trim() || undefined;
}

async function generateTitle(
  seed: string,
  source: NamingSource,
  ctx: ExtensionContext,
  naming: NamingSettings,
  signal: AbortSignal,
): Promise<GenerateTitleResult> {
  const model = resolveNamingModel(ctx, naming.model);
  if (!model) {
    return { ok: false, reason: "missing_model" };
  }

  const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
  if (!auth.ok) {
    return { ok: false, reason: "missing_auth", detail: auth.error };
  }

  const message: UserMessage = {
    role: "user",
    content: [{ type: "text", text: formatNamingPrompt(seed, source) }],
    timestamp: Date.now(),
  };

  const sessionId = namingSessionId(ctx);
  const headers = { ...auth.headers, ...opencodeSessionHeaders(model, sessionId) };

  try {
    const response = await completeSimple(
      model,
      { systemPrompt: TITLE_PROMPT, messages: [message] },
      {
        apiKey: auth.apiKey,
        headers: Object.keys(headers).length > 0 ? headers : undefined,
        maxTokens: NAMING_MAX_TOKENS,
        // Providers such as opencode-go route by session, so reuse the live one.
        sessionId,
        // Asking for a thinking level while disabling reasoning would ask for
        // reasoning that is already off, so the level is not forwarded.
        onPayload: (payload: unknown) => disableReasoningInPayload(model, payload),
        signal,
      },
    );

    const generated = response.content
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
      .map((part) => part.text)
      .join("\n");

    const title = compactTitle(parseGeneratedTitle(generated).title ?? "", naming.maxChars);
    if (!title) {
      return { ok: false, reason: "invalid_output" };
    }

    return { ok: true, title };
  } catch (error) {
    return { ok: false, reason: "request_failed", detail: describeError(error) };
  }
}

function renameFailureSummary(reason: RenameFailureReason): string {
  switch (reason) {
    case "missing_prompt":
      return "No user or assistant text found in the current branch.";
    case "missing_model":
      return "No model is available for title generation.";
    case "missing_auth":
      return "No request auth is available for the naming model.";
    case "request_failed":
      return "Pane rename request failed.";
    case "invalid_output":
      return "The model returned an invalid title format.";
    case "stale_session":
      return "Session changed before the rename completed.";
    case "skipped":
      return "Pane rename was skipped.";
  }
}

function describeRenameFailure(reason: RenameFailureReason, detail?: string): string {
  const summary = renameFailureSummary(reason);
  return detail ? `${summary} (${detail})` : summary;
}

function notify(ctx: ExtensionCommandContext, message: string, level: "info" | "error"): void {
  if (!ctx.hasUI) return;
  ctx.ui.notify(message, level);
}

// --- Extension --------------------------------------------------------------

export default function herdrPaneNameExtension(pi: ExtensionAPI) {
  const endpoint = socketEndpoint();
  const paneId = process.env.HERDR_PANE_ID;
  if (process.env.HERDR_ENV !== "1" || !endpoint || !paneId) return;

  /** Label this extension last wrote; used to skip redundant writes. */
  let appliedLabel: string | undefined;
  /** Label handed to the socket but not yet confirmed; guards the async gap. */
  let labelInProgress: string | undefined;
  /** One automatic title attempt per session, successful or not. */
  let hasAttempted: boolean = false;
  /** Bumped whenever the session changes or a rename is overridden. */
  let sessionEpoch: number = 0;
  let renameInFlight: Promise<RenameResult> | null = null;
  let requestController: AbortController | null = null;

  const applyLabel = async (title: string): Promise<string | undefined> => {
    const naming = readNamingSettings();
    const normalized = compactTitle(title, naming.maxChars);
    if (!normalized) return undefined;

    labelInProgress = normalized;
    try {
      const written = await setPaneLabel(endpoint, paneId, normalized);
      if (!written) return undefined;

      appliedLabel = normalized;
      hasAttempted = true;
      return normalized;
    } finally {
      labelInProgress = undefined;
    }
  };

  const cancelRename = (): void => {
    sessionEpoch += 1;
    requestController?.abort();
    requestController = null;
    renameInFlight = null;
  };

  const runNaming = async (
    seed: string | undefined,
    source: NamingSource,
    ctx: ExtensionContext,
    force: boolean,
  ): Promise<RenameResult> => {
    const naming = readNamingSettings();
    if (!naming.enabled) return { ok: false, reason: "skipped" };

    if (!force && (appliedLabel !== undefined || hasAttempted || renameInFlight)) {
      return { ok: false, reason: "skipped" };
    }

    const trimmedSeed = seed?.trim();
    if (!trimmedSeed) return { ok: false, reason: "missing_prompt" };
    if (!force) hasAttempted = true;

    const epoch = sessionEpoch;
    // Only a label written during this request counts as someone else taking
    // over; whatever was already applied is the label this request replaces.
    const labelAtRequestStart = appliedLabel;
    const controller = new AbortController();
    requestController = controller;

    const work = (async (): Promise<RenameResult> => {
      const generated = await generateTitle(trimmedSeed, source, ctx, naming, controller.signal);
      if (!generated.ok) return generated;

      if (epoch !== sessionEpoch) {
        return { ok: false, reason: "stale_session" };
      }

      // A hand-picked title that landed during the request owns the label.
      if (appliedLabel !== labelAtRequestStart) {
        return { ok: false, reason: "stale_session" };
      }

      const title = await applyLabel(generated.title);
      if (!title) return { ok: false, reason: "invalid_output" };

      return { ok: true, title };
    })();

    const tracked = work.finally(() => {
      if (requestController === controller) requestController = null;
      if (renameInFlight === tracked) renameInFlight = null;
    });

    renameInFlight = tracked;
    return tracked;
  };

  pi.registerCommand("rename", {
    description: "Rename the Herdr pane label from the conversation or an explicit title",
    handler: async (args: string, ctx: ExtensionCommandContext) => {
      await ctx.waitForIdle();
      if (renameInFlight) await renameInFlight;

      if (args.trim()) {
        const applied = await applyLabel(args);
        if (!applied) {
          notify(ctx, "Invalid title.", "error");
          return;
        }

        notify(ctx, `Renamed pane: ${applied}`, "info");
        return;
      }

      const conversation = buildConversationNamingSource(ctx.sessionManager.getBranch());
      const result = await runNaming(conversation, "conversation", ctx, true);

      if (!result.ok) {
        notify(ctx, describeRenameFailure(result.reason, result.detail), "error");
        return;
      }

      notify(ctx, `Renamed pane: ${result.title}`, "info");
    },
  });

  pi.on("session_start", async () => {
    cancelRename();
    appliedLabel = undefined;
    labelInProgress = undefined;
    hasAttempted = false;

    // A resumed session already carries a name; reuse it instead of generating
    // another one, and do not write it back to the session.
    const naming = readNamingSettings();
    if (!naming.enabled) return;

    const existing = compactTitle(pi.getSessionName() ?? "", naming.maxChars);
    if (!existing) return;

    await applyLabel(existing);
  });

  // The label is set after the turn, when the first prompt is already on the
  // branch, so no separate turn-start capture is needed.
  pi.on("agent_end", (_event, ctx: ExtensionContext) => {
    const naming = readNamingSettings();
    if (!naming.enabled) return;
    if (appliedLabel !== undefined || hasAttempted || renameInFlight) return;

    const seed = getFirstUserPrompt(ctx.sessionManager.getBranch());
    if (!seed) return;

    // The naming request takes seconds; the turn must not wait on it.
    void runNaming(seed, "user_message", ctx, false).catch((error: unknown) => {
      console.warn(`[herdr-pane-name] ${describeError(error) ?? "rename failed"}`);
    });
  });

  // pi announces its own renames here; mirror them onto the pane. Anything
  // already generated or in flight is dropped so a slow title cannot overwrite
  // a name the user just chose.
  pi.on("session_info_changed", async (event) => {
    const naming = readNamingSettings();
    const normalized = compactTitle(event.name ?? "", naming.maxChars);
    if (!normalized || normalized === appliedLabel || normalized === labelInProgress) return;

    cancelRename();
    await applyLabel(normalized);
  });

  pi.on("session_shutdown", () => {
    cancelRename();
  });
}
