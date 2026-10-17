/**
 * @piex/hello — example Pi extension. Registers the `note` tool, the `/notes`
 * slash command, and rebuilds its state from the session branch on
 * `session_start` (so it survives `/reload` and conversation compaction).
 *
 * Pi loads the default-exported function with an `ExtensionAPI`. Add the
 * package's `pi.extensions: ["./index.ts"]` manifest field to the package.json
 * so the loader finds this entry.
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerNotesCommand, registerNoteTool } from "./hello.js";
import { __resetState, replaceNotes, replayFromBranch } from "./state/store.js";

export { COMMAND_NAME, NoteParams, TOOL_NAME } from "./hello.js";
export type { NoteDetails } from "./state/store.js";
export { __resetState, getNotes, replaceNotes, replayFromBranch } from "./state/store.js";

export default function register(pi: ExtensionAPI): void {
	registerNoteTool(pi);
	registerNotesCommand(pi);

	// Re-key state from the branch. `root → leaf`, last snapshot wins. A ctx
	// that throws (a session replaced mid-event) has nothing to bind — fall back
	// to empty rather than leaving stale notes attached to the new session.
	pi.on("session_start", async (_event, ctx) => {
		try {
			replaceNotes(replayFromBranch(ctx.sessionManager.getBranch()));
		} catch {
			__resetState();
		}
	});
}
