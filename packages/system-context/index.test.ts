import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionCommandContext, ToolDefinition, ToolInfo } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { createMockCommandCtx, createMockCtx, createMockPi, makeTheme } from "@pidev/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";
import register, {
	COMMAND_NAME,
	captureFootprint,
	getProviderNeutralTools,
	parseCommandArgs,
	TOOL_NAME,
} from "./index.js";
import { DEFAULT_OUTPUT_FILE, SCRIPT_PATH } from "./script.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "system-context-index-"));
	dirs.push(dir);
	return dir;
}

function execWriting(content: string) {
	return vi.fn(async (_command: string, args: string[]) => {
		writeFileSync(args[args.indexOf("--out") + 1]!, content);
		return { stdout: "", stderr: "", code: 0, killed: false };
	});
}

function toolInfo(name: string): ToolInfo {
	return {
		name,
		description: `${name} description`,
		parameters: { type: "object", properties: {} },
		sourceInfo: { source: "test" },
		exposure: "direct",
	} as unknown as ToolInfo;
}

function setup() {
	const { pi, captured } = createMockPi();
	register(pi);
	return { pi, captured };
}

interface OverlayFactoryContext {
	factory?: (tui: TUI, theme: unknown, keybindings: unknown, done: () => void) => { render(width: number): string[] };
}

function makeCtx(mode: string, getSystemPrompt: () => string, cwd = "/tmp/test-cwd") {
	const custom = vi.fn(async (factory: unknown) => {
		(ctx as unknown as OverlayFactoryContext).factory = factory as OverlayFactoryContext["factory"];
	});
	const ctx = {
		...createMockCommandCtx({ mode, hasUI: true, cwd, ui: { custom: custom as never } }),
		waitForIdle: vi.fn(async () => {}),
		getSystemPrompt,
	} as unknown as ExtensionCommandContext;
	return { ctx, custom };
}

function renderCaptured(ctx: ExtensionCommandContext): string {
	const factory = (ctx as unknown as OverlayFactoryContext).factory;
	if (!factory) throw new Error("overlay factory was not called");
	const tui = { terminal: { rows: 40 }, requestRender: vi.fn() } as unknown as TUI;
	const component = factory(tui, makeTheme() as never, undefined, () => {});
	return component.render(70).join("\n");
}

async function callTool(tool: ToolDefinition, params: Record<string, unknown>, cwd: string) {
	return tool.execute!("tc", params as never, undefined as never, undefined as never, createMockCtx({ cwd }) as never);
}

describe("registration", () => {
	it("registers /system-context, the capture tool, and an agent_start capture", () => {
		const { captured } = setup();
		expect(captured.commands.has(COMMAND_NAME)).toBe(true);
		expect([...captured.tools.keys()]).toEqual([TOOL_NAME]);
		expect(captured.events.get("agent_start")).toHaveLength(1);
	});
});

describe("footprint capture", () => {
	it("captures the prompt at agent start", async () => {
		const { captured } = setup();
		const handler = captured.events.get("agent_start")![0];
		await handler({}, { getSystemPrompt: () => "PROMPT FROM AGENT START" });

		const { ctx } = makeCtx("tui", () => "LATER PROMPT");
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx);

		const rendered = renderCaptured(ctx);
		expect(rendered).toContain("PROMPT FROM AGENT START");
		expect(rendered).toContain("Tools");
	});

	it("builds the footprint on demand when no run has started", async () => {
		const { captured } = setup();
		const { ctx } = makeCtx("tui", () => "ON DEMAND PROMPT");
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx);

		expect(renderCaptured(ctx)).toContain("ON DEMAND PROMPT");
	});

	it("reduces only the active subset of all tools", () => {
		const { pi, captured } = createMockPi();
		captured.allTools.push(toolInfo("active-tool"), toolInfo("inactive-tool"));
		captured.activeTools.push("active-tool");

		const tools = getProviderNeutralTools(pi);

		expect(tools.map((tool) => tool.name)).toEqual(["active-tool"]);
		expect(tools[0]).not.toHaveProperty("sourceInfo");
	});

	it("captures the session prompt and active tools into the content shape", () => {
		const { pi, captured } = createMockPi();
		captured.allTools.push(toolInfo("note"));
		captured.activeTools.push("note");

		const content = captureFootprint(pi, { getSystemPrompt: () => "exact\nprompt" });

		expect(content.systemPrompt).toBe("exact\nprompt");
		expect(content.tools.map((tool) => tool.name)).toEqual(["note"]);
	});
});

describe("parseCommandArgs", () => {
	it("parses --out and --dir in either order", () => {
		expect(parseCommandArgs("--out cap.txt --dir /other")).toEqual({ out: "cap.txt", dir: "/other" });
		expect(parseCommandArgs("--dir /other --out cap.txt")).toEqual({ out: "cap.txt", dir: "/other" });
		expect(parseCommandArgs("")).toEqual({});
	});
});

describe("capture tool", () => {
	it("defaults cwd to the session cwd and out to a predictable filename", async () => {
		const session = tempDir();
		const { pi, captured } = createMockPi({ exec: execWriting("PROMPT\n") });
		register(pi);
		const tool = captured.tools.get(TOOL_NAME)!;

		const result = await callTool(tool, {}, session);

		const out = join(session, DEFAULT_OUTPUT_FILE);
		expect(pi.exec).toHaveBeenCalledWith("node", ["--experimental-strip-types", SCRIPT_PATH, session, "--out", out]);
		expect(result.details).toEqual({ path: out, bytes: 7 });
		expect((result.content[0] as { text: string }).text).toContain(out);
	});

	it("passes explicit cwd and out through and returns the absolute path and byte size", async () => {
		const session = tempDir();
		const other = tempDir();
		const { pi, captured } = createMockPi({ exec: execWriting("PROMPT") });
		register(pi);
		const tool = captured.tools.get(TOOL_NAME)!;

		const result = await callTool(tool, { cwd: other, out: "custom.txt" }, session);

		const out = join(session, "custom.txt");
		expect(pi.exec).toHaveBeenCalledWith("node", ["--experimental-strip-types", SCRIPT_PATH, other, "--out", out]);
		expect(result.details).toEqual({ path: out, bytes: 6 });
	});

	it("surfaces a non-zero script exit as an error result naming the reason", async () => {
		const exec = vi.fn(async () => ({ stdout: "", stderr: "trust store unreadable\n", code: 1, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const tool = captured.tools.get(TOOL_NAME)!;

		const result = await callTool(tool, {}, tempDir());

		expect(result.isError).toBe(true);
		expect((result.content[0] as { text: string }).text).toContain("trust store unreadable");
		expect((result.content[0] as { text: string }).text).not.toContain("Wrote");
	});
});

describe("/system-context --out", () => {
	it("writes the file and notifies the written path", async () => {
		const session = tempDir();
		const { pi, captured } = createMockPi({ exec: execWriting("PROMPT\n") });
		register(pi);
		const { ctx } = makeCtx("tui", () => "PROMPT", session);
		const out = join(session, "captured.txt");

		await captured.commands.get(COMMAND_NAME)!.handler(`--out ${out}`, ctx);

		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining(out), "info");
	});
});

describe("non-interactive modes", () => {
	it("notifies and returns without opening the overlay", async () => {
		const { captured } = setup();
		const { ctx, custom } = makeCtx("print", () => "PROMPT");
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx);

		expect(custom).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("interactive"), "warning");
	});
});
