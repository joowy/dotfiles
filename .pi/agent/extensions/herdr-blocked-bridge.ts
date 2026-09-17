// Herdr state bridges for pi. (herdr-agent-state.ts is managed by Herdr;
// this file lives beside it and survives Herdr reinstalls.)
//
// Bridge 1 — permission / UI prompts → blocked:
// Herdr's integration listens for "herdr:blocked" on pi.events, but nothing in
// pi core emits it. Pi core does emit "ui_prompt_start" / "ui_prompt_end"
// around every blocking UI prompt, so those are forwarded.
//
// Bridge 2 — background subagents → working:
// pi-subagents publishes "⏳ N subagent(s)" sidebar labels itself and emits
// "herdr:busy" on pi.events while runs are active, but Herdr's v9 integration
// does not listen for it — so a pane with an idle main agent and a running
// worker is classified "idle". This bridge reports "working" to Herdr while
// any subagent run is active. Reports are debounced so they land after the
// managed integration's own reports and always reflect the newest state.
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import net from "node:net";

const SOURCE = "herdr:pi";
const AGENT = "pi";
// Delay (ms) before publishing lifecycle state. The managed Herdr integration
// reports synchronously on the same events; publishing after a short delay
// guarantees this bridge's value — which additionally accounts for background
// subagent runs — is the final word without racing it.
const PUBLISH_DELAY_MS = 150;

type PromptEvent = {
	title?: string;
	kind?: string;
};

type BusyEvent = {
	active?: boolean;
	label?: string;
};

function socketEndpoint(): string | undefined {
	const socketPath = process.env.HERDR_SOCKET_PATH;
	if (!socketPath) return undefined;
	return process.platform === "win32" ? `\\\\.\\pipe\\${socketPath}` : socketPath;
}

function sendPayload(payload: unknown, timeoutMs: number): Promise<boolean> {
	const endpoint = socketEndpoint();
	const paneId = process.env.HERDR_PANE_ID;
	if (process.env.HERDR_ENV !== "1" || !endpoint || !paneId) {
		return Promise.resolve(true);
	}
	return new Promise((resolve) => {
		let done = false;
		let timeout: ReturnType<typeof setTimeout> | undefined;
		const finish = (delivered: boolean) => {
			if (done) return;
			done = true;
			if (timeout) clearTimeout(timeout);
			socket.destroy();
			resolve(delivered);
		};
		const socket = net.createConnection(endpoint);
		socket.on("error", () => finish(false));
		socket.on("connect", () => socket.write(`${JSON.stringify(payload)}\n`));
		socket.on("data", () => finish(true));
		socket.on("end", () => finish(false));
		timeout = setTimeout(() => finish(false), timeoutMs);
		timeout.unref?.();
	});
}

let lifecycleSeq = Date.now() * 1000;

function nextLifecycleSeq(): number {
	lifecycleSeq = Math.max(lifecycleSeq + 1, Date.now() * 1000);
	return lifecycleSeq;
}

export default function (pi: ExtensionAPI) {
	if (process.env.HERDR_ENV !== "1") {
		return;
	}

	let rootSession = false;
	let mainActive = false;
	let uiPromptDepth = 0;
	let busyActive = false;
	let busyLabel: string | undefined;
	let reportedBusyWorking = false;
	let sessionRef: Record<string, unknown> = {};
	let publishTimer: ReturnType<typeof setTimeout> | undefined;

	function captureSessionRef(ctx: unknown) {
		try {
			const manager = (ctx as { sessionManager?: { getSessionFile?: () => unknown; getSessionId?: () => unknown } })
				?.sessionManager;
			const file = manager?.getSessionFile?.();
			const id = manager?.getSessionId?.();
			const next: Record<string, unknown> = {};
			if (typeof file === "string" && file.length > 0) next.agent_session_path = file;
			else if (typeof id === "string" && id.length > 0) next.agent_session_id = id;
			if (Object.keys(next).length > 0) sessionRef = next;
		} catch {
			// Best effort; pane_id + source + agent still identifies the record.
		}
	}

	function sendState(state: "working" | "idle", message: string | undefined) {
		void sendPayload(
			{
				id: `${SOURCE}:busy:${Date.now()}:${Math.random().toString(36).slice(2)}`,
				method: "pane.report_agent",
				params: {
					pane_id: process.env.HERDR_PANE_ID,
					source: SOURCE,
					agent: AGENT,
					state,
					message,
					seq: nextLifecycleSeq(),
					...sessionRef,
				},
			},
			500,
		).then((delivered) => {
			if (!delivered) {
				void sendPayload(
					{
						id: `${SOURCE}:busy:${Date.now()}:${Math.random().toString(36).slice(2)}`,
						method: "pane.report_agent",
						params: {
							pane_id: process.env.HERDR_PANE_ID,
							source: SOURCE,
							agent: AGENT,
							state,
							message,
							seq: nextLifecycleSeq(),
							...sessionRef,
						},
					},
					1500,
				);
			}
		});
	}

	function publishLifecycle() {
		if (!rootSession) return;
		// A visible prompt takes precedence: the managed integration reports
		// "blocked" for it, and needing user input outranks background work.
		if (uiPromptDepth > 0) return;
		if (busyActive) {
			sendState("working", busyLabel ?? "subagent running");
			reportedBusyWorking = true;
			return;
		}
		// The busy run ended. The managed integration has no transition for
		// this, so repair the state it last reported only if this bridge had
		// previously overridden it with busy-driven "working".
		if (reportedBusyWorking) {
			reportedBusyWorking = false;
			sendState(mainActive ? "working" : "idle", undefined);
		}
	}

	function schedulePublish() {
		if (publishTimer) clearTimeout(publishTimer);
		publishTimer = setTimeout(() => {
			publishTimer = undefined;
			publishLifecycle();
		}, PUBLISH_DELAY_MS);
		publishTimer.unref?.();
	}

	// Bridge 1: blocking UI prompts (permission dialogs, confirms, selects).
	pi.on("ui_prompt_start", (event) => {
		uiPromptDepth += 1;
		const prompt = event as unknown as PromptEvent;
		pi.events.emit("herdr:blocked", {
			active: true,
			label: prompt.title ?? prompt.kind ?? "waiting for input",
		});
	});

	pi.on("ui_prompt_end", () => {
		uiPromptDepth = Math.max(0, uiPromptDepth - 1);
		pi.events.emit("herdr:blocked", { active: false });
		// A prompt closing while subagents run leaves the pane working, but the
		// managed integration has no transition to report — re-assert it.
		schedulePublish();
	});

	// Bridge 2: background subagent runs reported by pi-subagents.
	// Recorded unconditionally: this may fire from pi-subagents' session_start
	// handler before this bridge's own session_start handler has run.
	pi.events.on("herdr:busy", (data) => {
		const busy = data as BusyEvent;
		busyActive = busy.active === true;
		busyLabel = typeof busy.label === "string" ? busy.label : undefined;
		schedulePublish();
	});

	pi.on("session_start", (_event, ctx) => {
		const context = ctx as { mode?: string; isIdle?: () => boolean };
		if (context?.mode !== "tui") return;
		rootSession = true;
		captureSessionRef(ctx);
		mainActive = context?.isIdle?.() === false;
		// Covers subagent runs restored from a previous session: pi-subagents
		// re-emits their busy state during startup, possibly before rootSession
		// was set here.
		schedulePublish();
	});

	pi.on("agent_start", (_event, ctx) => {
		if (!rootSession) return;
		captureSessionRef(ctx);
		mainActive = true;
		// Re-assert after the managed integration's own report, so a busy
		// pane is not flapped back to idle/working-without-label by it.
		schedulePublish();
	});

	pi.on("agent_settled", (_event, ctx) => {
		if (!rootSession) return;
		const context = ctx as { isIdle?: () => boolean };
		if (context?.isIdle?.() !== true) return;
		mainActive = false;
		// The managed integration now reports idle; if subagents are still
		// running, the pane is still working — re-assert after its report.
		schedulePublish();
	});
}
