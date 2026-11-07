// Herdr state bridges for pi. (herdr-agent-state.ts is managed by Herdr;
// this file lives beside it and survives Herdr reinstalls.)
//
// Bridge 1 — permission / UI prompts → blocked:
// Herdr's integration listens for "herdr:blocked" on pi.events, but nothing in
// pi core emits it. Pi core does emit "ui_prompt_start" / "ui_prompt_end"
// around every blocking UI prompt, so those are forwarded.
//
// The bridge also reports "blocked" over the socket itself. Herdr accepts a
// pane state report only when its `seq` is higher than the last one for that
// pane and source. The managed integration counts up from its load time
// (`Date.now() * 1000`, +1 per report), while this bridge takes
// `Date.now() * 1000` on every report, so once the bridge publishes anything
// (a subagent run is enough) every later managed report is stale and dropped.
// Relaying "herdr:blocked" alone therefore leaves the pane stuck on the
// bridge's last "working" while a prompt waits. Reporting blocked here keeps
// the prompt state on the sequence this bridge owns.
//
// Bridge 2 — background subagents → working:
// The main agent settles as soon as it starts background workers, so a pane
// with an idle main agent and a running worker is classified "idle". This
// bridge reports "working" to Herdr while any subagent run is active. Two
// sources feed it: "herdr:busy" from pi-subagents, and the child-session
// lifecycle channels that pi-subagents-lite announces on the parent bus
// ("subagents:child:session-created" / "subagents:child:disposed"). Reports
// are debounced so they land after the managed integration's own reports and
// always reflect the newest state.
//
// Disposal is not the end of a run: pi-subagents-lite keeps a settled child
// session alive for continuations and announces "disposed" only when the record
// is stopped, cleared, or the manager goes down. Counting an announced child as
// running therefore wedges the pane on "working" forever after the first
// subagent finishes. Instead, every child session instance writes its own run
// state to a ledger file, and the root instance counts a child as running only
// while that file says "running". A child whose ledger is missing is not
// counted, so an agent type that excludes extensions can under-report a busy
// pane but can never wedge one.
//
// Bridge 3 — pane release on exit:
// A dying pi leaves its claim on the pane. Herdr granted the pane full lifecycle
// hook authority, so it trusts only reports from that pane's source and drops
// any report whose `seq` is not higher than the last one it accepted. The next
// pi in the pane starts a fresh sequence, so its first turns can be ignored
// while the dead process's record stands. Releasing on quit clears the claim so
// the successor reports normally. Reload, new, resume, and fork keep this
// process alive and therefore keep their claim.
//
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

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

// pi-subagents-lite announces child sessions on the parent bus instead of
// emitting "herdr:busy". The channel names come from its subagent-integration
// convention, so they are stable.
const CHILD_SESSION_CREATED_CHANNEL = "subagents:child:session-created";
const CHILD_SESSION_DISPOSED_CHANNEL = "subagents:child:disposed";

function announcedSessionId(data: unknown): string | undefined {
	const payload = data as { sessionId?: unknown };
	return typeof payload?.sessionId === "string" && payload.sessionId.length > 0
		? payload.sessionId
		: undefined;
}

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

const LEDGER_DIRECTORY = path.join(getAgentDir(), "tmp", "herdr-subagent-state");
const CHILD_POLL_MS = 2000;

type ChildLedgerState = "running" | "done";

function sessionIdOf(ctx: unknown): string | undefined {
	try {
		const id = (ctx as { sessionManager?: { getSessionId?: () => unknown } })?.sessionManager?.getSessionId?.();
		return typeof id === "string" && id.length > 0 ? id : undefined;
	} catch {
		return undefined;
	}
}

function ledgerFileOf(sessionId: string): string {
	return path.join(LEDGER_DIRECTORY, `${sessionId}.json`);
}

/** Written by a child session instance, read by the root instance of its pane. */
function writeChildLedger(ctx: unknown, state: ChildLedgerState): void {
	if (process.env.HERDR_ENV !== "1") return;
	const sessionId = sessionIdOf(ctx);
	if (!sessionId) return;
	try {
		mkdirSync(LEDGER_DIRECTORY, { recursive: true });
		const target = ledgerFileOf(sessionId);
		const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
		writeFileSync(
			temporary,
			JSON.stringify({
				session_id: sessionId,
				pane_id: process.env.HERDR_PANE_ID ?? null,
				state,
				updated_at_ms: Date.now(),
			}),
		);
		renameSync(temporary, target);
	} catch {
		// Accuracy only: an unreadable ledger makes the root count the child as done.
	}
}

function readChildLedgerState(sessionId: string): ChildLedgerState | undefined {
	try {
		const parsed = JSON.parse(readFileSync(ledgerFileOf(sessionId), "utf8")) as { state?: unknown };
		return parsed?.state === "running" || parsed?.state === "done" ? parsed.state : undefined;
	} catch {
		return undefined;
	}
}

function removeChildLedger(sessionId: string): void {
	try {
		rmSync(ledgerFileOf(sessionId), { force: true });
	} catch {
		// Nothing to clean up.
	}
}

/** The TUI session owns a pane; children and headless runs report a mode that is not "tui". */
function noteChildLedgerState(ctx: unknown, state: ChildLedgerState): void {
	if ((ctx as { mode?: string } | undefined)?.mode === "tui") return;
	writeChildLedger(ctx, state);
}

let lifecycleSeq = Date.now() * 1000;

function nextLifecycleSeq(): number {
	lifecycleSeq = Math.max(lifecycleSeq + 1, Date.now() * 1000);
	return lifecycleSeq;
}

const DEBUG = process.env.HERDR_BRIDGE_DEBUG === "1";

function debugLog(message: string, detail?: unknown) {
	if (!DEBUG) return;
	console.log(`[herdr-bridge] ${message}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`);
}

export default function (pi: ExtensionAPI) {
	if (process.env.HERDR_ENV !== "1") {
		return;
	}

	let rootSession = false;
	let mainActive = false;
	let uiPromptDepth = 0;
	let packageBusyActive = false;
	let packageBusyLabel: string | undefined;
	const liveChildSessions = new Set<string>();
	let sessionRef: Record<string, unknown> = {};
	let publishTimer: ReturnType<typeof setTimeout> | undefined;
	let childPollTimer: ReturnType<typeof setInterval> | undefined;
	let lastPublishedState: "working" | "idle" | "blocked" | undefined;
	let lastPublishedMessage: string | undefined;

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

	function reportPayload(state: "working" | "idle" | "blocked", message: string | undefined) {
		return {
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
		};
	}

	function sendState(state: "working" | "idle" | "blocked", message: string | undefined) {
		// An unchanged state adds nothing, and the child poll would otherwise report
		// the same value every couple of seconds.
		if (state === lastPublishedState && message === lastPublishedMessage) return;
		lastPublishedState = state;
		lastPublishedMessage = message;
		debugLog("send", { state, message });
		const forgetDroppedReport = () => {
			// A report that never reached Herdr must not be suppressed as a repeat.
			lastPublishedState = undefined;
			lastPublishedMessage = undefined;
		};
		void sendPayload(reportPayload(state, message), 500).then((delivered) => {
			if (delivered) return;
			void sendPayload(reportPayload(state, message), 1500).then((retried) => {
				if (!retried) forgetDroppedReport();
			});
		});
	}

	/** The pane keeps a claim from a dead process, so the successor's reports are dropped. */
	function releasePane(): Promise<void> {
		// One sequence for both attempts: it outranks every report this process made
		// without pretending to be newer than it is.
		const payload = {
			id: `${SOURCE}:release:${Date.now()}:${Math.random().toString(36).slice(2)}`,
			method: "pane.release_agent",
			params: {
				pane_id: process.env.HERDR_PANE_ID,
				source: SOURCE,
				agent: AGENT,
				seq: nextLifecycleSeq(),
			},
		};
		debugLog("release");
		return sendPayload(payload, 500).then((delivered) => {
			if (delivered) return;
			return sendPayload(payload, 1500).then(() => undefined);
		});
	}

	function runningChildSessions(): string[] {
		return [...liveChildSessions].filter(
			(sessionId) => readChildLedgerState(sessionId) === "running",
		);
	}

	function stopChildPolling() {
		if (!childPollTimer) return;
		clearInterval(childPollTimer);
		childPollTimer = undefined;
	}

	/** Child runs settle on their own bus, so the root has to look again. */
	function ensureChildPolling() {
		if (childPollTimer || liveChildSessions.size === 0) return;
		childPollTimer = setInterval(() => {
			if (liveChildSessions.size === 0) {
				stopChildPolling();
				return;
			}
			publishLifecycle();
		}, CHILD_POLL_MS);
		childPollTimer.unref?.();
	}

	function publishLifecycle() {
		const runningSubagents = liveChildSessions.size === 0 ? [] : runningChildSessions();
		debugLog("publish", {
			rootSession,
			promptDepth: uiPromptDepth,
			packageBusyActive,
			announcedChildren: liveChildSessions.size,
			runningSubagents: runningSubagents.length,
			mainActive,
		});
		if (!rootSession) return;
		// A visible prompt takes precedence and is published by its own handler.
		if (uiPromptDepth > 0) return;
		if (packageBusyActive || runningSubagents.length > 0) {
			sendState(
				"working",
				packageBusyActive
					? (packageBusyLabel ?? "subagent running")
					: `${runningSubagents.length} subagent${runningSubagents.length === 1 ? "" : "s"} running`,
			);
			return;
		}
		// Re-assert every transition: the managed integration's own report for it
		// carries a stale sequence and is dropped.
		sendState(mainActive ? "working" : "idle", undefined);
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
		const firstPrompt = uiPromptDepth === 0;
		uiPromptDepth += 1;
		const prompt = event as unknown as PromptEvent;
		const label = prompt.title ?? prompt.kind ?? "waiting for input";
		pi.events.emit("herdr:blocked", { active: true, label });
		if (firstPrompt && rootSession) {
			sendState("blocked", label);
		}
	});

	pi.on("ui_prompt_end", () => {
		uiPromptDepth = Math.max(0, uiPromptDepth - 1);
		pi.events.emit("herdr:blocked", { active: false });
		// The prompt is gone: publish the real state now, because the managed
		// integration's report for the same transition is stale and dropped.
		if (uiPromptDepth === 0) {
			publishLifecycle();
		}
	});

	// Bridge 2: background subagent runs reported by pi-subagents.
	// Recorded unconditionally: this may fire from pi-subagents' session_start
	// handler before this bridge's own session_start handler has run.
	pi.events.on("herdr:busy", (data) => {
		const busy = data as BusyEvent;
		packageBusyActive = busy.active === true;
		packageBusyLabel = typeof busy.label === "string" ? busy.label : undefined;
		schedulePublish();
	});

	// Bridge 2b: child sessions announced by pi-subagents-lite.
	pi.events.on(CHILD_SESSION_CREATED_CHANNEL, (data) => {
		const sessionId = announcedSessionId(data);
		debugLog("child created", { sessionId, live: liveChildSessions.size, rootSession });
		if (sessionId) {
			liveChildSessions.add(sessionId);
			ensureChildPolling();
		}
		schedulePublish();
	});

	pi.events.on(CHILD_SESSION_DISPOSED_CHANNEL, (data) => {
		const sessionId = announcedSessionId(data);
		if (sessionId) {
			liveChildSessions.delete(sessionId);
			removeChildLedger(sessionId);
			if (liveChildSessions.size === 0) stopChildPolling();
		}
		schedulePublish();
	});

	pi.on("session_shutdown", (event) => {
		// Reload, new, resume, and fork keep this process and its agent.
		if (event.reason !== "quit") return;
		// Only the TUI session holds a pane; children share the process.
		if (!rootSession) return;
		// A pending publish would re-create the claim this release clears.
		if (publishTimer) clearTimeout(publishTimer);
		publishTimer = undefined;
		stopChildPolling();
		// Best effort: a process that dies mid-write still leaves the claim.
		return releasePane();
	});

	pi.on("session_start", (_event, ctx) => {
		const context = ctx as { mode?: string; isIdle?: () => boolean };
		if (context?.mode !== "tui") {
			// A child session instance publishes its own runs for the root to read.
			noteChildLedgerState(ctx, "done");
			return;
		}
		rootSession = true;
		captureSessionRef(ctx);
		mainActive = context?.isIdle?.() === false;
		// Covers subagent runs restored from a previous session: pi-subagents
		// re-emits their busy state during startup, possibly before rootSession
		// was set here.
		schedulePublish();
	});

	pi.on("agent_start", (_event, ctx) => {
		noteChildLedgerState(ctx, "running");
		if (!rootSession) return;
		captureSessionRef(ctx);
		mainActive = true;
		// Re-assert after the managed integration's own report, so a busy
		// pane is not flapped back to idle/working-without-label by it.
		schedulePublish();
	});

	pi.on("agent_settled", (_event, ctx) => {
		noteChildLedgerState(ctx, "done");
		if (!rootSession) return;
		const context = ctx as { isIdle?: () => boolean };
		if (context?.isIdle?.() !== true) return;
		mainActive = false;
		// The managed integration now reports idle; if subagents are still
		// running, the pane is still working — re-assert after its report.
		schedulePublish();
	});
}
