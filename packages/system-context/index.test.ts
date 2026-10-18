import type { ExtensionCommandContext } from "@earendil-works/pi-coding-agent";
import type { TUI } from "@earendil-works/pi-tui";
import { createMockCommandCtx, createMockPi, makeTheme } from "@pidev/test-utils";
import { describe, expect, it, vi } from "vitest";
import register, { COMMAND_NAME, captureFootprint } from "./index.js";

function setup() {
	const { pi, captured } = createMockPi();
	register(pi);
	return captured;
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
	const component = factory(tui, makeTheme(), undefined, () => {});
	return component.render(70).join("\n");
}

describe("registration", () => {
	it("registers /system-context and an agent_start capture", () => {
		const captured = setup();
		expect(captured.commands.has(COMMAND_NAME)).toBe(true);
		expect(captured.events.get("agent_start")).toHaveLength(1);
	});
});

describe("footprint capture", () => {
	it("captures the prompt at agent start", async () => {
		const captured = setup();
		const handler = captured.events.get("agent_start")![0];
		await handler({}, { getSystemPrompt: () => "PROMPT FROM AGENT START" });

		const { ctx } = makeCtx("tui", () => "LATER PROMPT");
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx);

		expect(renderCaptured(ctx)).toContain("PROMPT FROM AGENT START");
	});

	it("builds the footprint on demand when no run has started", async () => {
		const captured = setup();
		const { ctx } = makeCtx("tui", () => "ON DEMAND PROMPT");
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx);

		expect(renderCaptured(ctx)).toContain("ON DEMAND PROMPT");
	});

	it("captureFootprint returns the session prompt verbatim", () => {
		expect(captureFootprint({ getSystemPrompt: () => "exact\nprompt" })).toBe("exact\nprompt");
	});
});

describe("non-interactive modes", () => {
	it("notifies and returns without opening the overlay", async () => {
		const captured = setup();
		const { ctx, custom } = makeCtx("print", () => "PROMPT");
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx);

		expect(custom).not.toHaveBeenCalled();
		expect(ctx.ui.notify).toHaveBeenCalledWith(expect.stringContaining("interactive"), "warning");
	});
});
