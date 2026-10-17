import type { SessionEntry } from "@earendil-works/pi-coding-agent";

/** Custom-entry type used to persist a notes snapshot on the session branch. */
export const STATE_ENTRY_TYPE = "pidev-note-state";

/** The persisted/replayed snapshot shape carried in the tool result `details`. */
export interface NoteDetails {
	notes: string[];
}

/**
 * Module-level store. Pi extensions commonly keep a small singleton and rebuild
 * it from the session branch on lifecycle events. Tests call `__resetState()`
 * from `test/setup.ts`'s `beforeEach` so suites cannot leak into each other.
 */
let notes: string[] = [];

export function getNotes(): string[] {
	return [...notes];
}

export function addNote(text: string): void {
	notes.push(text);
}

export function replaceNotes(next: readonly string[]): void {
	notes = [...next];
}

/** Reset for tests and for a fresh, unreplayable session. */
export function __resetState(): void {
	notes = [];
}

/**
 * Rebuild the snapshot from the session branch.
 *
 * Walks `root → leaf` and keeps the LAST snapshot it sees, so replay after a
 * compaction or `/reload` reproduces exactly what the transcript shows. Handles
 * both persistence shapes: a standalone `toolResult` message, and a `custom`
 * entry (written by `pi.appendEntry` for calls that never land as a toolResult,
 * e.g. through another tool).
 */
export function replayFromBranch(entries: Iterable<SessionEntry>): string[] {
	let captured: string[] | undefined;
	for (const entry of entries) {
		const snapshot = extractSnapshot(entry);
		if (snapshot) captured = snapshot;
	}
	return captured ? [...captured] : [];
}

function extractSnapshot(entry: SessionEntry): string[] | undefined {
	const e = entry as unknown as {
		type?: string;
		customType?: string;
		data?: { notes?: unknown };
		message?: { role?: string; toolName?: string; details?: { notes?: unknown } };
	};
	if (e.type === "custom" && e.customType === STATE_ENTRY_TYPE) {
		return asNotes(e.data?.notes);
	}
	if (e.type === "message" && e.message?.role === "toolResult" && e.message.toolName === "note") {
		return asNotes(e.message.details?.notes);
	}
	return undefined;
}

function asNotes(value: unknown): string[] | undefined {
	return Array.isArray(value) && value.every((v) => typeof v === "string") ? value : undefined;
}
