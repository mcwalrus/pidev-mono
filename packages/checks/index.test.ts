import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { configPath, saveJsonConfig } from "@pidev/config";
import { createMockCtx, createMockPi, makeTheme } from "@pidev/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import register, { COMMAND_NAME, CONFIG_NAME, STATUS_KEY, WIDGET_KEY } from "./index.js";

function clearConfig(): void {
	saveJsonConfig(configPath(CONFIG_NAME), {});
}

function writeRawConfig(text: string): void {
	const path = configPath(CONFIG_NAME);
	mkdirSync(dirname(path), { recursive: true });
	writeFileSync(path, text, "utf-8");
}

beforeEach(() => {
	clearConfig();
});

function startSession(captured: ReturnType<typeof createMockPi>["captured"], ctx: ReturnType<typeof createMockCtx>) {
	return captured.events.get("session_start")![0]({}, ctx);
}

describe("session start", () => {
	it("runs a declared check and shows it passed in the widget", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), {
			checks: [{ name: "postgres", command: "pg_isready", args: ["-h", "127.0.0.1"] }],
		});
		const exec = vi.fn(async () => ({ stdout: "accepting connections", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);

		expect(exec).toHaveBeenCalledWith("pg_isready", ["-h", "127.0.0.1"], expect.objectContaining({ cwd: ctx.cwd }));
		await vi.waitFor(() => {
			const widget = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[];
			expect(widget.join("\n")).toContain("1/1 passed");
		});
	});

	it("lists the check with name, state, and duration from /checks", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => {
			const widget = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[];
			expect(widget.join("\n")).toContain("1/1 passed");
		});
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx as never);

		const report = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
		expect(report).toContain("postgres");
		expect(report).toContain("passed");
		expect(report).toMatch(/\d+ms/);
	});

	it("warns and yields no checks when the config file is malformed", async () => {
		writeRawConfig("not json");
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const { pi, captured } = createMockPi();
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);

		expect(captured.events.get("session_start")).toHaveLength(1);
		const widget = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[];
		expect(widget.join("\n")).toContain("No checks");
		expect(captured.tools.size).toBe(0);
		warn.mockRestore();
	});

	it("shows timed_out, failed, and error distinctly in /checks", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), {
			checks: [
				{ name: "hang", command: "hang" },
				{ name: "fail", command: "fail" },
				{ name: "missing", command: "missing" },
			],
		});
		const exec = vi.fn(async (command: string) => {
			if (command === "hang") return { stdout: "", stderr: "", code: -1, killed: true };
			if (command === "fail") return { stdout: "", stderr: "boom", code: 2, killed: false };
			throw new Error("spawn ENOENT");
		});
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => {
			const widget = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[];
			expect(widget.join("\n")).not.toContain("running");
		});
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx as never);

		const report = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
		expect(report).toContain("hang  timed_out");
		expect(report).toContain("fail  failed");
		expect(report).toContain("missing  error");
	});

	it("re-runs every check on /checks run and refreshes the surfaces", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		let code = 0;
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => {
			const widget = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[];
			expect(widget.join("\n")).toContain("1/1 passed");
		});
		expect(exec).toHaveBeenCalledTimes(1);

		code = 1;
		await captured.commands.get(COMMAND_NAME)!.handler("run", ctx as never);

		expect(exec).toHaveBeenCalledTimes(2);
		const report = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
		expect(report).toContain("postgres  failed");
	});

	it("shows the last-run time on the widget and in /checks", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => {
			const widget = (ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[];
			expect(widget.join("\n")).toMatch(/last run \d\d:\d\d:\d\d/);
		});
		await captured.commands.get(COMMAND_NAME)!.handler("", ctx as never);
		const report = (ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0] as string;
		expect(report).toMatch(/last run \d\d:\d\d:\d\d/);
	});

	it("prints usage and runs nothing for an unknown argument", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
		await captured.commands.get(COMMAND_NAME)!.handler("wat", ctx as never);

		expect(exec).toHaveBeenCalledTimes(1);
		expect((ctx.ui.notify as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[0]).toContain("Usage: /checks [run]");
	});

	it("aborts an in-flight run and clears the surfaces on shutdown", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "slow", command: "slow" }] });
		let signal: AbortSignal | undefined;
		const exec = vi.fn(
			(_command: string, _args: string[], options?: { signal?: AbortSignal }) =>
				new Promise<never>((_resolve, reject) => {
					signal = options?.signal;
					options?.signal?.addEventListener("abort", () => reject(new Error("aborted")));
				}),
		);
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(signal).toBeDefined());

		const shutdown = captured.events.get("session_shutdown")![0];
		await shutdown({ reason: "quit" }, ctx);

		expect(signal?.aborted).toBe(true);
		expect((ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)).toEqual([WIDGET_KEY, undefined]);
		expect((ctx.ui.setStatus as ReturnType<typeof vi.fn>).mock.calls.at(-1)).toEqual([STATUS_KEY, undefined]);

		await shutdown({ reason: "reload" }, ctx);
		expect((ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)).toEqual([WIDGET_KEY, undefined]);
	});

	it("runs checks without any UI calls when no UI is available", async () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: false });

		await startSession(captured, ctx);
		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(1));

		expect(ctx.ui.setWidget).not.toHaveBeenCalled();
		expect(ctx.ui.setStatus).not.toHaveBeenCalled();
	});

	it.each(["rpc", "json", "print"])("does not error in %s mode", async (mode) => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => ({ stdout: "", stderr: "", code: 0, killed: false }));
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: false, mode });

		startSession(captured, ctx);
		await vi.waitFor(() => expect(exec).toHaveBeenCalledTimes(1));
	});
});
