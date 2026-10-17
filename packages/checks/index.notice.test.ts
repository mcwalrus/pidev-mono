import { configPath, saveJsonConfig } from "@pidev/config";
import { createMockCtx, createMockPi, makeTheme } from "@pidev/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import register, { COMMAND_NAME, CONFIG_NAME } from "./index.js";

beforeEach(() => {
	saveJsonConfig(configPath(CONFIG_NAME), {});
});

function setup() {
	saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "jaeger", command: "jaeger" }] });
	const state = { code: 1 };
	const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: state.code, killed: false }));
	const { pi, captured } = createMockPi({ exec });
	register(pi);
	const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });
	const rerun = () => captured.commands.get(COMMAND_NAME)!.handler("", ctx as never);
	const nextPrompt = () => captured.events.get("before_agent_start")![0]({}, ctx);
	return { state, captured, ctx, rerun, nextPrompt };
}

describe("model notice", () => {
	it("injects a one-shot note after a check recovers", async () => {
		const { state, rerun, nextPrompt } = setup();
		await rerun();
		state.code = 0;
		await rerun();

		expect(await nextPrompt()).toEqual({
			message: {
				customType: "pidev-checks",
				content: "Environment precondition improved: jaeger: failed -> passed. Checks now 1/1 pass.",
				display: true,
			},
		});
		expect(await nextPrompt()).toBeUndefined();
	});

	it("injects nothing when the state has not changed", async () => {
		const { rerun, nextPrompt } = setup();
		await rerun();
		await rerun();

		expect(await nextPrompt()).toBeUndefined();
	});

	it("drops a queued note on shutdown", async () => {
		const { state, captured, ctx, rerun, nextPrompt } = setup();
		await rerun();
		state.code = 0;
		await rerun();

		await captured.events.get("session_shutdown")![0]({ reason: "quit" }, ctx);

		expect(await nextPrompt()).toBeUndefined();
	});

	it("replaces a recovery note with a regression note", async () => {
		const { state, rerun, nextPrompt } = setup();
		await rerun();
		state.code = 0;
		await rerun();
		state.code = 1;
		await rerun();

		expect(await nextPrompt()).toEqual({
			message: {
				customType: "pidev-checks",
				content: "Environment precondition changed: jaeger: passed -> failed. Checks now 0/1 pass.",
				display: true,
			},
		});
	});
});
