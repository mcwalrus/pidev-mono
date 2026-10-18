import type { ExtensionCommandContext, ToolInfo } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { createMockCommandCtx, createMockPi, makeTheme } from "@pidev/test-utils";
import { describe, expect, it, vi } from "vitest";
import register, { COMMAND_NAME, captureFootprint, getProviderNeutralTools } from "./index.js";

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

function makeCtx(mode: string, getSystemPrompt: () => string) {
	const custom = vi.fn(async (factory: unknown) => {
		(ctx as unknown as OverlayFactoryContext).factory = factory as OverlayFactoryContext["factory"];
	});
	const ctx = {
		...createMockCommandCtx({ mode, hasUI: true, ui: { custom: custom as never } }),
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

describe("registration", () => {
	it("registers /system-context and an agent_start capture", () => {
		const { captured } = setup();
		expect(captured.commands.has(COMMAND_NAME)).toBe(true);
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

describe("non-interactive modes", () => {
	it("notifies and returns without opening the overlay", async () => {
		const { captured } = setup();
		const { ctx, custom } = makeCtx("print", () => "PROMPT");
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx);

		expect(custom).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("interactive"), "warning");
	});
});
