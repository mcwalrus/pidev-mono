import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPath, saveJsonConfig } from "@pidev/config";
import { assertToolContract, createMockCtx, createMockPi, makeTheme } from "@pidev/test-utils";
import { Value } from "typebox/value";
import { beforeEach, describe, expect, it, vi } from "vitest";
import register, { CONFIG_NAME, PROJECT_CONFIG_FILE } from "./index.js";
import { ChecksParams, TOOL_NAME } from "./tool.js";

type ExecStub = (command: string) => Promise<{ stdout: string; stderr: string; code: number; killed: boolean }>;

beforeEach(() => {
	saveJsonConfig(configPath(CONFIG_NAME), {});
});

function registerWith(checks: unknown[], exec: ExecStub) {
	saveJsonConfig(configPath(CONFIG_NAME), { checks });
	const { pi, captured } = createMockPi({ exec });
	register(pi);
	const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });
	const start = () => captured.events.get("session_start")![0]({}, ctx);
	const call = async (params: Record<string, unknown>) => {
		const result = await captured.tools.get(TOOL_NAME)!.execute!("id", params, undefined, undefined, ctx as never);
		return (result.content[0] as { text: string }).text;
	};
	const settle = () => vi.waitFor(async () => expect(await call({})).not.toBe("still running"));
	const lastWidget = () => ((ctx.ui.setWidget as ReturnType<typeof vi.fn>).mock.calls.at(-1)?.[1] as string[]) ?? [];
	return { captured, ctx, start, call, settle, lastWidget };
}

const pass = { stdout: "", stderr: "", code: 0, killed: false };

describe("checks tool contract", () => {
	it("registers a model-facing tool with the documented shape", () => {
		const { pi, captured } = createMockPi();
		register(pi);

		assertToolContract(captured.tools.get(TOOL_NAME)!, {
			name: TOOL_NAME,
			requiredFields: [],
			optionalFields: ["action", "name"],
		});
	});

	it("rejects an unknown action at the schema", () => {
		expect(Value.Check(ChecksParams, {})).toBe(true);
		expect(Value.Check(ChecksParams, { action: "run" })).toBe(true);
		expect(Value.Check(ChecksParams, { action: "stop" })).toBe(false);
	});
});

describe("checks tool status", () => {
	it("summarises an all-passed run in one line", async () => {
		const exec = vi.fn(async () => pass);
		const { start, call, settle } = registerWith([{ name: "postgres", command: "pg_isready" }], exec);

		await start();
		await settle();

		expect(await call({})).toBe(`all passed (config: ${configPath(CONFIG_NAME)})`);
	});

	it("names each non-passed check and its state without any captured output", async () => {
		const exec = vi.fn(async (command: string) =>
			command === "db" ? { stdout: "secret-token", stderr: "", code: 2, killed: false } : pass,
		);
		const { start, call, settle } = registerWith(
			[
				{ name: "db", command: "db" },
				{ name: "cache", command: "cache" },
			],
			exec,
		);

		await start();
		await settle();

		const text = await call({});
		expect(text).toBe(`1 of 2 passed: db failed (config: ${configPath(CONFIG_NAME)})`);
		expect(text).not.toContain("secret-token");
	});

	it("reports none configured for an empty config", async () => {
		const { pi, captured } = createMockPi();
		register(pi);
		const ctx = createMockCtx({ hasUI: true, ui: { theme: makeTheme() } });

		await captured.events.get("session_start")![0]({}, ctx);
		const result = await captured.tools.get(TOOL_NAME)!.execute!("id", {}, undefined, undefined, ctx as never);

		expect((result.content[0] as { text: string }).text).toBe(`none configured (config: ${configPath(CONFIG_NAME)})`);
	});

	it("points to the project-local config file that was applied", async () => {
		const cwd = mkdtempSync(join(tmpdir(), "pidev-checks-tool-"));
		const path = join(cwd, PROJECT_CONFIG_FILE);
		saveJsonConfig(path, { checks: [{ name: "postgres", command: "pg_isready" }] });
		const exec = vi.fn(async () => pass);
		const { pi, captured } = createMockPi({ exec });
		register(pi);
		const ctx = createMockCtx({ hasUI: true, cwd, ui: { theme: makeTheme() } });

		await captured.events.get("session_start")![0]({}, ctx);
		const result = await vi.waitFor(async () => {
			const resolved = await captured.tools.get(TOOL_NAME)!.execute!("id", {}, undefined, undefined, ctx as never);
			const text = (resolved.content[0] as { text: string }).text;
			expect(text).toBe(`all passed (config: ${path})`);
			return text;
		});

		expect(result).toContain(path);
	});
});

describe("checks tool run", () => {
	it("re-runs every check, refreshes the surfaces, and returns the new summary", async () => {
		let code = 1;
		const exec = vi.fn(async () => ({ ...pass, code }));
		const { start, call, settle, lastWidget, ctx } = registerWith(
			[{ name: "postgres", command: "pg_isready" }],
			exec,
		);

		await start();
		await settle();
		expect(await call({})).toBe(`0 of 1 passed: postgres failed (config: ${configPath(CONFIG_NAME)})`);

		code = 0;
		expect(await call({ action: "run" })).toBe(`all passed (config: ${configPath(CONFIG_NAME)})`);
		expect(exec).toHaveBeenCalledTimes(2);
		expect(lastWidget().join("\n")).toContain("1/1 passed");
		expect(ctx.ui.setWidget).toHaveBeenCalled();
	});
});

describe("checks tool detail", () => {
	it("returns one check's exit code and bounded output tail", async () => {
		const exec = vi.fn(async (command: string) =>
			command === "db" ? { stdout: "token", stderr: "boom", code: 2, killed: false } : pass,
		);
		const { start, call, settle } = registerWith(
			[
				{ name: "db", command: "db" },
				{ name: "cache", command: "cache" },
			],
			exec,
		);

		await start();
		await settle();

		const text = await call({ name: "db" });
		expect(text).toContain("db  failed");
		expect(text).toContain("exit 2");
		expect(text).toContain("boom");
		expect(text).not.toContain("cache");
	});

	it("reports plainly when the named check does not exist", async () => {
		const exec = vi.fn(async () => pass);
		const { start, call, settle } = registerWith([{ name: "postgres", command: "pg_isready" }], exec);

		await start();
		await settle();

		expect(await call({ name: "nope" })).toBe('No check named "nope".');
	});
});
