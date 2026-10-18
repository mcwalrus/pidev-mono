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
import { Type } from "typebox";
import { type ProviderNeutralContent, renderProviderNeutralContent, toProviderNeutralTool } from "./footprint.js";
import { SystemContextOverlay } from "./overlay.js";
import { type CaptureRequest, captureScript, DEFAULT_OUTPUT_FILE } from "./script.js";

export const COMMAND_NAME = "system-context";
export const TOOL_NAME = "system_context";

/** The slice of context the footprint capture needs. */
export type FootprintSource = Pick<ExtensionContext, "getSystemPrompt">;

export interface ParsedCommandArgs {
	out?: string;
	dir?: string;
}

/** Parse `/system-context [--out <file>] [--dir <path>]`. */
export function parseCommandArgs(args: string): ParsedCommandArgs {
	const tokens = args.trim().split(/\s+/).filter(Boolean);
	const parsed: ParsedCommandArgs = {};
	for (let index = 0; index < tokens.length; index++) {
		if (tokens[index] === "--out") parsed.out = tokens[++index];
		else if (tokens[index] === "--dir") parsed.dir = tokens[++index];
	}
	return parsed;
}

const CaptureParams = Type.Object({
	cwd: Type.Optional(
		Type.String({ description: "Project directory to capture. Defaults to the session working directory." }),
	),
	out: Type.Optional(
		Type.String({ description: `Output file path. Defaults to ${DEFAULT_OUTPUT_FILE} in the target directory.` }),
	),
});

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

	pi.registerTool({
		name: TOOL_NAME,
		label: "Capture system context",
		description:
			"Capture the assembled system prompt Pi would build for a project directory and write it to a file. Returns the written path and byte size.",
		parameters: CaptureParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			try {
				const { path, bytes } = await captureScript(pi, params as CaptureRequest, ctx.cwd);
				return {
					content: [{ type: "text" as const, text: `Wrote ${bytes} bytes to ${path}` }],
					details: { path, bytes },
				};
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				return {
					content: [{ type: "text" as const, text: `Error: ${message}` }],
					details: undefined,
					isError: true,
				};
			}
		},
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Show this session's provider-neutral system footprint",
		handler: async (args, ctx) => {
			const parsed = parseCommandArgs(args);
			if (parsed.out !== undefined) {
				try {
					const { path, bytes } = await captureScript(pi, { cwd: parsed.dir, out: parsed.out }, ctx.cwd);
					ctx.ui.notify(`Wrote ${bytes} bytes to ${path}`, "info");
				} catch (error) {
					const message = error instanceof Error ? error.message : String(error);
					ctx.ui.notify(`System context capture failed: ${message}`, "error");
				}
				return;
			}

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
