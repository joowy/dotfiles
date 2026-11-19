import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

// @cortexkit/pi-anthropic-auth falls back to max_tokens 16384 when pi passes
// no limit, and the agent loop never passes one. Long thinking then uses the
// whole budget and the reply ends with "Response was truncated before completion."
// Replace that fallback with the model's real output limit from the registry.
const CORTEXKIT_DEFAULT_MAX_TOKENS = 16_384;

export default function (pi: ExtensionAPI) {
	pi.on("before_provider_request", (event, ctx) => {
		const payload = event.payload as { model?: unknown; max_tokens?: unknown } | null;
		if (!payload || typeof payload !== "object") return undefined;
		if (payload.max_tokens !== CORTEXKIT_DEFAULT_MAX_TOKENS) return undefined;
		if (typeof payload.model !== "string") return undefined;

		const model = ctx.modelRegistry.find("anthropic", payload.model);
		if (!model || model.maxTokens <= CORTEXKIT_DEFAULT_MAX_TOKENS) return undefined;

		return { ...payload, max_tokens: model.maxTokens };
	});
}
