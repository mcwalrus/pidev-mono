import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { checkDetail, checkSummary } from "./render.js";
import type { CheckStore } from "./state/store.js";

export const TOOL_NAME = "checks";

/** Parameter schema for the `checks` tool. `action` accepts only `"run"`; anything else fails validation. */
export const ChecksParams = Type.Object({
	action: Type.Optional(
		Type.Literal("run", { description: 'Set to "run" to re-run every check before reading the result.' }),
	),
	name: Type.Optional(
		Type.String({ description: "Return this one check's exit code and output tail instead of the summary." }),
	),
});

export interface ChecksToolParams {
	action?: "run";
	name?: string;
}

export interface ChecksToolDeps {
	store: CheckStore;
	/** Re-run every check, refreshing the surfaces; resolves once the run settles. */
	run: (ctx: ExtensionContext) => Promise<unknown>;
}

export function registerChecksTool(pi: ExtensionAPI, deps: ChecksToolDeps): void {
	pi.registerTool({
		name: TOOL_NAME,
		label: "Checks",
		description:
			'Report whether the session environment precondition checks pass, as one line. Pass name for a single check\'s exit code and output tail, or action "run" to re-run first.',
		promptSnippet: "Check whether environment preconditions are ready",
		promptGuidelines: [
			'Use `checks` to see whether the environment is ready before relying on a service; pass action="run" to re-check and name="<check>" for one failure\'s detail.',
		],
		parameters: ChecksParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const p = params as ChecksToolParams;
			if (p.action === "run") await deps.run(ctx);
			const text = p.name === undefined ? checkSummary(deps.store) : checkDetail(deps.store, p.name);
			return { content: [{ type: "text" as const, text }], details: {} };
		},
	});
}
