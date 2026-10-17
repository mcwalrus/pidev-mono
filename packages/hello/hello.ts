import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadConfig } from "./config.js";
import { addNote, getNotes, type NoteDetails, STATE_ENTRY_TYPE } from "./state/store.js";

export const TOOL_NAME = "note";
export const COMMAND_NAME = "notes";
export const TOOL_LABEL = "Note";

/**
 * Tool parameters use the standalone `typebox` package. `description` fields
 * double as LLM-facing prompt copy — write them for the model, not the reader.
 */
export const NoteParams = Type.Object({
	action: Type.Union([Type.Literal("add"), Type.Literal("list")], {
		description: 'Use "add" to record a note, "list" to read them back.',
	}),
	text: Type.Optional(Type.String({ description: 'The note text. Required when action is "add".' })),
});

export interface NoteToolParams {
	action: "add" | "list";
	text?: string;
}

const DEFAULT_PROMPT_SNIPPET = "Keep short working notes for the current session";
const DEFAULT_PROMPT_GUIDELINES = [
	'Use `note` to record decisions or context worth keeping across compaction; use action="list" to read them back.',
];

export function registerNoteTool(pi: ExtensionAPI): void {
	const guidance = loadConfig().guidance;
	pi.registerTool({
		name: TOOL_NAME,
		label: TOOL_LABEL,
		description:
			'Add or list short notes for the current session. Action "add" records a note; action "list" returns every note in order.',
		promptSnippet: guidance?.promptSnippet ?? DEFAULT_PROMPT_SNIPPET,
		promptGuidelines: guidance?.promptGuidelines ?? DEFAULT_PROMPT_GUIDELINES,
		parameters: NoteParams,

		async execute(_toolCallId, params) {
			const p = params as NoteToolParams;
			let text: string;
			if (p.action === "add") {
				if (!p.text) {
					return {
						content: [{ type: "text" as const, text: 'Error: `text` is required when action is "add".' }],
						details: { notes: getNotes() } satisfies NoteDetails,
					};
				}
				addNote(p.text);
				text = `Added note #${getNotes().length}: ${p.text}`;
			} else {
				const current = getNotes();
				text = current.length === 0 ? "No notes" : current.map((n, i) => `${i + 1}. ${n}`).join("\n");
			}
			const details: NoteDetails = { notes: getNotes() };
			// Persist the snapshot on the calling session's branch. A call made
			// through another tool never lands as a standalone `toolResult`, so its
			// `details` alone would not survive replay; the custom entry does.
			pi.appendEntry(STATE_ENTRY_TYPE, details);
			return { content: [{ type: "text" as const, text }], details };
		},
	});
}

export function registerNotesCommand(pi: ExtensionAPI): void {
	pi.registerCommand(COMMAND_NAME, {
		description: "List every note recorded on the current branch",
		handler: async (_args, ctx) => {
			const current = getNotes();
			ctx.ui.notify(
				current.length === 0 ? "No notes yet" : current.map((n, i) => `${i + 1}. ${n}`).join("\n"),
				"info",
			);
		},
	});
}
