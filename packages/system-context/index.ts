/**
 * @pidev/system-context extension entry.
 *
 * Two surfaces share one purpose: a `/system-context` overlay for the current
 * session's provider-neutral system footprint, and a model-callable tool that
 * captures another directory's prompt to a file by shelling out to the SDK
 * script.
 */

import type {
	ExtensionAPI,
	ExtensionCommandContext,
	ExtensionContext,
	Theme,
	ToolInfo,
} from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { type ProviderNeutralContent, renderProviderNeutralContent, toProviderNeutralTool } from "./footprint.js";
import { SystemContextOverlay } from "./overlay.js";

export const COMMAND_NAME = "system-context";

/** The slice of context the footprint capture needs. */
export type FootprintSource = Pick<ExtensionContext, "getSystemPrompt">;

/** The active subset of all tools, reduced to provider-visible semantics. */
export function getProviderNeutralTools(pi: ExtensionAPI) {
	const active = new Set(pi.getActiveTools());
	return pi
		.getAllTools()
		.filter((tool: ToolInfo) => active.has(tool.name))
		.map((tool: ToolInfo) => toProviderNeutralTool(tool));
}

/** Capture the exact prompt Pi assembled plus the active provider-neutral tools. */
export function captureFootprint(pi: ExtensionAPI, ctx: FootprintSource): ProviderNeutralContent {
	return { systemPrompt: ctx.getSystemPrompt(), tools: getProviderNeutralTools(pi) };
}

/** Open the scrollable footprint overlay for the assembled prompt `content`. */
export function openOverlay(ctx: ExtensionCommandContext, content: string): Promise<void> {
	return ctx.ui.custom<void>(
		(tui: TUI, theme: Theme, _keybindings: KeybindingsManager, done: () => void) =>
			new SystemContextOverlay(tui, theme, content, done),
		{
			overlay: true,
			overlayOptions: { anchor: "center", width: "95%", maxHeight: "92%", margin: 0 },
		},
	);
}

export default function register(pi: ExtensionAPI): void {
	let footprint: ProviderNeutralContent | undefined;

	pi.on("agent_start", (_event, ctx) => {
		footprint = captureFootprint(pi, ctx);
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Show this session's provider-neutral system footprint",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/system-context opens a viewer only in interactive Pi.", "warning");
				return;
			}

			await ctx.waitForIdle();
			const snapshot = footprint ?? captureFootprint(pi, ctx);
			await openOverlay(ctx, renderProviderNeutralContent(snapshot));
		},
	});
}
