/**
 * @pidev/system-context extension entry.
 *
 * Two surfaces share one purpose: a `/system-context` overlay for the current
 * session's provider-neutral system footprint, and a model-callable tool that
 * captures another directory's prompt to a file by shelling out to the SDK
 * script.
 */

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext, Theme } from "@earendil-works/pi-coding-agent";
import type { KeybindingsManager, TUI } from "@earendil-works/pi-tui";
import { SystemContextOverlay } from "./overlay.js";

export const COMMAND_NAME = "system-context";

/** The slice of context the footprint capture needs. */
export type FootprintSource = Pick<ExtensionContext, "getSystemPrompt">;

/** Capture the exact prompt Pi assembled for this session. */
export function captureFootprint(ctx: FootprintSource): string {
	return ctx.getSystemPrompt();
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
	let footprint: string | undefined;

	pi.on("agent_start", (_event, ctx) => {
		footprint = captureFootprint(ctx);
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Show this session's provider-neutral system footprint",
		handler: async (_args, ctx) => {
			if (ctx.mode !== "tui") {
				ctx.ui.notify("/system-context opens a viewer only in interactive Pi.", "warning");
				return;
			}

			await ctx.waitForIdle();
			await openOverlay(ctx, footprint ?? captureFootprint(ctx));
		},
	});
}
