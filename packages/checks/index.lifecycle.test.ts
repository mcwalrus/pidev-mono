import { configPath, saveJsonConfig } from "@pidev/config";
import { createMockCtx, createMockPi, makeTheme } from "@pidev/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import register, { COMMAND_NAME, CONFIG_NAME } from "./index.js";

beforeEach(() => {
	saveJsonConfig(configPath(CONFIG_NAME), {});
});

function startSession(captured: ReturnType<typeof createMockPi>["captured"], ctx: ReturnType<typeof createMockCtx>) {
	return captured.events.get("session_start")![0]({}, ctx);
}

function colourTheme() {
	return makeTheme({ fg: (colour, text) => `${colour}:${text}` });
}

function lastWidget(ctx: ReturnType<typeof createMockCtx>): string[] {
	return ((ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[]) ?? [];
}

function lastStatus(ctx: ReturnType<typeof createMockCtx>): string | undefined {
	return (ctx.ui.setStatus as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string | undefined;
}

describe("aggregate colour", () => {
	it("stays neutral while a run is in flight", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "slow", command: "slow" }] });
		const exec = vi.fn(() => new Promise<never>(() => {}));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: colourTheme() } });

		await startSession(captured, ctx);

		expect(lastWidget(ctx).join("\n")).toContain("muted:");
		expect(lastWidget(ctx).join("\n")).not.toMatch(/warning:|error:/);
		expect(lastStatus(ctx)).toContain("muted:");
	});

	it("reads green once every check passes", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: colourTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(lastWidget(ctx).join("\n")).toContain("success:"));

		expect(lastStatus(ctx)).toContain("success:");
	});

	it("reads red for any settled failure", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 1, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: colourTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(lastWidget(ctx).join("\n")).toContain("error:"));

		expect(lastStatus(ctx)).toContain("error:");
	});
});

describe("widget attention line", () => {
	function execByCommand(failing: Set<string>) {
		return vi.fn(async (command: string) => ({
			stdout: "",
			stderr: "",
			code: failing.has(command) ? 1 : 0,
			killed: false,
		}));
	}

	it("names the checks needing attention and keeps the /checks hint", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), {
			checks: [
				{ name: "postgres", command: "postgres" },
				{ name: "radius", command: "radius" },
				{ name: "redis", command: "redis" },
			],
		});
		const { pi, captured } = createMockPi({ exec: execByCommand(new Set(["postgres", "redis"])) });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(lastWidget(ctx).join("\n")).toContain("Needs attention"));

		const widget = lastWidget(ctx).join("\n");
		expect(widget).toContain("postgres");
		expect(widget).toContain("redis");
		expect(widget).not.toContain("radius");
		expect(widget).toContain("Run /checks to inspect");
	});

	it("bounds the attention name list", async () => {
		const checks = Array.from({ length: 7 }, (_, i) => ({ name: `check-${i}`, command: `check-${i}` }));
		saveJsonConfig(configPath(CONFIG_NAME), { checks });
		const { pi, captured } = createMockPi({ exec: execByCommand(new Set(checks.map((check) => check.name))) });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(lastWidget(ctx).join("\n")).toContain("Needs attention"));

		const widget = lastWidget(ctx).join("\n");
		expect(widget).toContain("check-4");
		expect(widget).not.toContain("check-5");
		expect(widget).toContain("+2 more");
	});
});

describe("session lifecycle", () => {
	it("keeps stores independent across two instances", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "alpha", command: "alpha" }] });
		const first = createMockPi({ exec: vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false })) });
		register(first.pi);
		const firstCtx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });
		await startSession(first.captured, firstCtx);
		await vi.waitFor(() => expect(lastWidget(firstCtx).join("\n")).toContain("1/1 passed"));

		saveJsonConfig(configPath(CONFIG_NAME), {
			checks: [
				{ name: "beta", command: "beta" },
				{ name: "gamma", command: "gamma" },
			],
		});
		const second = createMockPi({ exec: vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false })) });
		register(second.pi);
		const secondCtx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });
		await startSession(second.captured, secondCtx);
		await vi.waitFor(() => expect(lastWidget(secondCtx).join("\n")).toContain("2/2 passed"));

		expect(lastWidget(firstCtx).join("\n")).toContain("1/1 passed");
		expect(first.pi.exec).toHaveBeenCalledTimes(1);
		expect(second.pi.exec).toHaveBeenCalledTimes(2);
	});

	it("aborts an in-flight run when /checks run starts a new one", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "slow", command: "slow" }] });
		const signals: AbortSignal[] = [];
		let calls = 0;
		const exec = vi.fn((_command: string, _args: string[], options?: { signal?: AbortSignal }) => {
			const call = ++calls;
			if (options?.signal) signals.push(options.signal);
			if (call === 1) {
				return new Promise<never>((_resolve, reject) => {
					options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
				});
			}
			return Promise.resolve({ stdout: "", stderr: "", code: 0, killed: false });
		});
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(signals).toHaveLength(1));
		await captured.commands.get(COMMAND_NAME)!.handler("run", ctx as never);

		expect(signals[0]?.aborted).toBe(true);
		expect(exec).toHaveBeenCalledTimes(2);
		expect(lastWidget(ctx).join("\n")).toContain("1/1 passed");
	});

	it("re-runs every check when the session reloads", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });
		const start = captured.events.get("session_start")![0];

		await start({ reason: "startup" }, ctx);
		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
		await start({ reason: "reload" }, ctx);
		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(2));
	});
});
