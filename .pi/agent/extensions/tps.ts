import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

/**
 * Wall-clock time spent waiting on the human is dead time for the model: it
 * inflates the denominator of tokens/second without producing any tokens.
 *
 * Two independent sources are observed, and their windows are UNIONED (never
 * summed — a questionnaire opened inside a permission dialog would otherwise be
 * counted twice and cancel the whole measurement):
 *
 * 1. Pi core `ui_prompt_start` / `ui_prompt_end` — generic and covers every
 *    blocking extension prompt, because the runner wraps exactly the blocking
 *    UI surfaces (`select`, `confirm`, `input`, `editor`, `custom`) and emits
 *    the pair for the outermost one only. This is what catches permission
 *    dialogs from @gotgenes/pi-permission-system, which awaits `ctx.ui.custom`
 *    inside its awaited `tool_call` hook, i.e. inside agent_start..agent_end.
 *
 * 2. `rpiv:ask-user:blocked` from @juicesharp/rpiv-ask-user-question — kept as a
 *    belt-and-braces fallback for hosts where the questionnaire overlay does not
 *    route through the wrapped UI context.
 *
 * Neither package is required: if nothing emits, the human-wait total stays at
 * zero and the measurement degrades gracefully.
 */
const ASK_USER_BLOCKED_CHANNEL = "rpiv:ask-user:blocked";

function isAssistantMessage(message: unknown): message is AssistantMessage {
	if (!message || typeof message !== "object") return false;
	const role = (message as { role?: unknown }).role;
	return role === "assistant";
}

/** Payload is `{ active: boolean }`; ignore anything malformed. */
function readBlockedActive(payload: unknown): boolean | null {
	if (!payload || typeof payload !== "object") return null;
	const active = (payload as { active?: unknown }).active;
	return typeof active === "boolean" ? active : null;
}

function formatDuration(totalSeconds: number): string {
	if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
	const totalMinutes = Math.floor(totalSeconds / 60);
	if (totalMinutes < 60)
		return `${totalMinutes}m ${(totalSeconds % 60).toFixed(1)}s`;
	const hours = Math.floor(totalMinutes / 60);
	return `${hours}h ${(totalMinutes % 60)}m ${(totalSeconds % 60).toFixed(0)}s`;
}

export default function (pi: ExtensionAPI) {
	let agentStartMs: number | null = null;
	/** When the currently open human-wait window began, if one is open. */
	let blockedSinceMs: number | null = null;
	/** Human-wait accumulated during the current agent run. */
	let blockedTotalMs = 0;

	/**
	 * When the currently streaming assistant message began being generated, if
	 * one is. Tool execution, steering gaps, and human wait are all excluded —
	 * this is the closest proxy to the time the model spent producing tokens.
	 */
	let generationSinceMs: number | null = null;
	/** Generation time accumulated during the current agent run. */
	let generationTotalMs = 0;

	/** Open `ctx.ui.*` prompts, counted by depth: only the outermost emits events. */
	let uiPromptDepth = 0;
	/** True while the questionnaire overlay reports itself blocking. */
	let questionnaireOpen = false;

	/** Recompute the union of all wait sources; the window opens on the first and closes on the last. */
	function updateBlocked(): void {
		if (uiPromptDepth > 0 || questionnaireOpen) {
			if (blockedSinceMs === null) blockedSinceMs = Date.now();
			return;
		}
		if (blockedSinceMs !== null) {
			blockedTotalMs += Date.now() - blockedSinceMs;
			blockedSinceMs = null;
		}
	}

	// Dispatched on a microtask by the runner, so both edges land a tick late;
	// the skew is shared by start and end and cancels out.
	pi.on("ui_prompt_start", () => {
		uiPromptDepth++;
		updateBlocked();
	});

	pi.on("ui_prompt_end", () => {
		if (uiPromptDepth > 0) uiPromptDepth--;
		updateBlocked();
	});

	pi.events.on(ASK_USER_BLOCKED_CHANNEL, (payload) => {
		const active = readBlockedActive(payload);
		if (active === null) return;
		questionnaireOpen = active;
		updateBlocked();
	});

	pi.on("message_start", (event) => {
		// message_start/message_end also fire for user and toolResult messages;
		// only assistant messages are model generation windows.
		if (isAssistantMessage(event.message)) generationSinceMs = Date.now();
	});

	pi.on("message_end", (event) => {
		if (!isAssistantMessage(event.message)) return;
		if (generationSinceMs === null) return;
		generationTotalMs += Date.now() - generationSinceMs;
		generationSinceMs = null;
	});

	pi.on("agent_start", () => {
		agentStartMs = Date.now();
		blockedTotalMs = 0;
		generationTotalMs = 0;
		// A prompt opened before the run (e.g. an `input`-hook gate) is not part of
		// this run's dead time: re-base its clock on the run boundary.
		if (blockedSinceMs !== null) blockedSinceMs = agentStartMs;
		// Same for a generation window that predates the run.
		if (generationSinceMs !== null) generationSinceMs = agentStartMs;
	});

	pi.on("agent_end", (event, ctx) => {
		const runStartMs = agentStartMs;
		// Only the run boundary is cleared here, so an early return below cannot
		// leave a stale one behind; the per-run sums are consumed further down.
		agentStartMs = null;

		if (!ctx.hasUI) return;
		if (runStartMs === null) return;

		const elapsedMs = Date.now() - runStartMs;

		// A human-wait window can still be open when the run ends (aborted turn);
		// close it at the boundary so the wait is counted rather than dropped.
		// Same for a still-open generation window on a mid-message abort.
		if (blockedSinceMs !== null) {
			blockedTotalMs += Date.now() - blockedSinceMs;
			blockedSinceMs = null;
		}
		if (generationSinceMs !== null) {
			generationTotalMs += Date.now() - generationSinceMs;
			generationSinceMs = null;
		}

		// Snapshot the per-run sums, then zero them so nothing accumulates into
		// the next run; the numbers above feed the calculations below.
		const waitMs = Math.min(blockedTotalMs, Math.max(elapsedMs, 0));
		const generationMs = Math.min(
			generationTotalMs,
			Math.max(elapsedMs - waitMs, 0),
		);
		blockedTotalMs = 0;
		generationTotalMs = 0;

		if (elapsedMs <= 0) return;

		let outputTokens = 0;

		for (const message of event.messages) {
			if (!isAssistantMessage(message)) continue;
			outputTokens += message.usage.output || 0;
		}

		if (outputTokens <= 0) return;

		// The numerator is output tokens; walk the denominator through the most
		// specific time measure available: generation windows, then wall clock
		// minus human wait, then plain wall clock for a run that was effectively
		// all waiting.
		const measuredMs =
			generationMs > 0 ? generationMs : elapsedMs - waitMs > 0 ? elapsedMs - waitMs : elapsedMs;
		const tokensPerSecond = outputTokens / (measuredMs / 1000);

		const message = `TPS ${tokensPerSecond.toFixed(1)} tok/s. ${formatDuration(
			generationMs / 1000,
		)} generating`;
		ctx.ui.notify(message, "info");
	});
}
