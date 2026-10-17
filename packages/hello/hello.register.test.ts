import type { SessionEntry, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi, roundTripBranchState } from "@pidev/test-utils";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import register, { __resetState, COMMAND_NAME, getNotes, replaceNotes, replayFromBranch, TOOL_NAME } from "./index.js";

beforeEach(() => {
	__resetState();
});
afterEach(() => {
	__resetState();
});

function setup() {
	const { pi, captured } = createMockPi();
	register(pi);
	return captured;
}

async function callTool(tool: ToolDefinition, params: Record<string, unknown>) {
	const ctx = createMockCtx();
	return tool.execute!("tc", params as never, undefined as never, undefined as never, ctx as never);
}

describe("registration", () => {
	it("registers the note tool, the /notes command, and a session_start handler", () => {
		const captured = setup();
		expect(captured.tools.has(TOOL_NAME)).toBe(true);
		expect(captured.commands.has(COMMAND_NAME)).toBe(true);
		expect(captured.events.get("session_start")).toHaveLength(1);
	});
});

describe("execute", () => {
	it("adds then lists notes, carrying the snapshot in `details`", async () => {
		const captured = setup();
		const tool = captured.tools.get(TOOL_NAME)!;

		const added = await callTool(tool, { action: "add", text: "hello" });
		expect(added.details).toEqual({ notes: ["hello"] });
		expect(added.content[0]).toMatchObject({ text: expect.stringContaining("hello") });

		const listed = await callTool(tool, { action: "list" });
		expect(listed.content[0]).toMatchObject({ text: expect.stringContaining("1. hello") });
	});

	it('requires `text` when action is "add" and leaves state untouched', async () => {
		const captured = setup();
		const tool = captured.tools.get(TOOL_NAME)!;
		const result = await callTool(tool, { action: "add" });
		expect(result.content[0]).toMatchObject({ text: expect.stringContaining("text") });
		expect(getNotes()).toEqual([]);
	});

	it("persists a custom entry so non-toolResult calls still replay", async () => {
		const captured = setup();
		const tool = captured.tools.get(TOOL_NAME)!;
		await callTool(tool, { action: "add", text: "note" });
		expect(captured.entries).toEqual([{ customType: "pidev-note-state", data: { notes: ["note"] } }]);
	});
});

describe("replay", () => {
	it("rebuilds the last snapshot from the branch (round trip)", async () => {
		const { before, after } = await roundTripBranchState<{ notes: string[] }>({
			reset: __resetState,
			snapshot: getNotes,
			replay: (entries) => replaceNotes(replayFromBranch(entries as unknown as SessionEntry[])),
			toolName: TOOL_NAME,
			details: [{ notes: ["a"] }, { notes: ["a", "b"] }],
		});
		expect(before).toEqual([]);
		expect(after).toEqual(["a", "b"]);
	});

	it("session_start replays the branch into module state", async () => {
		const captured = setup();
		const handler = captured.events.get("session_start")![0];
		const branch = [
			{
				type: "message",
				message: { role: "toolResult", toolName: TOOL_NAME, details: { notes: ["from-branch"] } },
			},
		] as unknown as SessionEntry[];
		await handler({}, createMockCtx({ branch }));
		expect(getNotes()).toEqual(["from-branch"]);
	});
});
