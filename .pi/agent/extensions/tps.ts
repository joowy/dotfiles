import type { AssistantMessage } from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

function isAssistantMessage(message: unknown): message is AssistantMessage {
	if (!message || typeof message !== "object") return false;
	const role = (message as { role?: unknown }).role;
	return role === "assistant";
}

export default function (pi: ExtensionAPI) {
	let agentStartMs: number | null = null;

	pi.on("agent_start", () => {
		agentStartMs = Date.now();
	});

	pi.on("agent_end", (event, ctx) => {
		if (!ctx.hasUI) return;
		if (agentStartMs === null) return;

		const elapsedMs = Date.now() - agentStartMs;
		agentStartMs = null;
		if (elapsedMs <= 0) return;

		let output = 0;

		for (const message of event.messages) {
			if (!isAssistantMessage(message)) continue;
			output += message.usage.output || 0;
		}

		if (output <= 0) return;

		const totalSeconds = elapsedMs / 1000;
		const tokensPerSecond = output / totalSeconds;
		const durationText =
			totalSeconds < 60
				? `${totalSeconds.toFixed(1)}s`
				: `${Math.floor(totalSeconds / 60)}m ${(totalSeconds % 60).toFixed(1)}s`;
		const message = `TPS ${tokensPerSecond.toFixed(1)} tok/s. ${durationText}`;
		ctx.ui.notify(message, "info");
	});
}
