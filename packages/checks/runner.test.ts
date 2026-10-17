import { describe, expect, it } from "vitest";
import type { CheckDefinition } from "./config.js";
import { type CheckExecutor, DEFAULT_CONCURRENCY, runChecks } from "./runner.js";

const CWD = "/tmp/checks-cwd";

function delay(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function definition(name: string): CheckDefinition {
	return { name, command: name };
}

describe("runChecks", () => {
	it("runs every configured check in one pass", async () => {
		const seen: string[] = [];
		const executor: CheckExecutor = async (command) => {
			seen.push(command);
			return { stdout: "", stderr: "", code: 0, killed: false };
		};

		const results = await runChecks([definition("a"), definition("b"), definition("c")], executor, { cwd: CWD });

		expect(seen.sort()).toEqual(["a", "b", "c"]);
		expect(results.map((result) => result.name)).toEqual(["a", "b", "c"]);
	});

	it("runs checks concurrently but never above the cap", async () => {
		let active = 0;
		let peak = 0;
		const executor: CheckExecutor = async () => {
			active++;
			peak = Math.max(peak, active);
			await delay(15);
			active--;
			return { stdout: "", stderr: "", code: 0, killed: false };
		};
		const definitions = Array.from({ length: DEFAULT_CONCURRENCY * 2 }, (_, i) => definition(`check-${i}`));

		await runChecks(definitions, executor, { cwd: CWD });

		expect(peak).toBeGreaterThan(1);
		expect(peak).toBeLessThanOrEqual(DEFAULT_CONCURRENCY);
	});

	it("keeps results in config order regardless of completion order", async () => {
		const executor: CheckExecutor = async (command) => {
			await delay(command === "first" ? 25 : 1);
			return { stdout: "", stderr: "", code: 0, killed: false };
		};

		const results = await runChecks([definition("first"), definition("second"), definition("third")], executor, {
			cwd: CWD,
		});

		expect(results.map((result) => result.name)).toEqual(["first", "second", "third"]);
		expect(results.every((result) => result.state === "passed")).toBe(true);
	});

	it("does not let a failing check stop later checks", async () => {
		const executor: CheckExecutor = async (command) => ({
			stdout: "",
			stderr: "",
			code: command === "fail" ? 1 : 0,
			killed: false,
		});

		const results = await runChecks([definition("fail"), definition("after")], executor, { cwd: CWD });

		expect(results[0]?.state).toBe("failed");
		expect(results[1]?.state).toBe("passed");
	});

	it("maps a killed process to timed_out, distinct from failed", async () => {
		const executor: CheckExecutor = async () => ({ stdout: "", stderr: "", code: 1, killed: true });

		const results = await runChecks([definition("hang")], executor, { cwd: CWD });

		expect(results[0]?.state).toBe("timed_out");
	});

	it("maps a rejected executor to error, distinct from failed", async () => {
		const executor: CheckExecutor = async () => {
			throw new Error("spawn ENOENT");
		};

		const results = await runChecks([definition("missing")], executor, { cwd: CWD });

		expect(results[0]?.state).toBe("error");
		expect(results[0]?.stderr).toContain("ENOENT");
	});

	it("passes the per-check timeout and cwd, defaulting both", async () => {
		const calls: Array<{ command: string; cwd?: string; timeout?: number }> = [];
		const executor: CheckExecutor = async (command, _args, options) => {
			calls.push({ command, cwd: options.cwd, timeout: options.timeout });
			return { stdout: "", stderr: "", code: 0, killed: false };
		};

		await runChecks(
			[
				{ name: "custom", command: "custom", cwd: "/tmp/elsewhere", timeoutMs: 250 },
				{ name: "defaulted", command: "defaulted" },
			],
			executor,
			{ cwd: CWD },
		);

		expect(calls.find((call) => call.command === "custom")).toMatchObject({ cwd: "/tmp/elsewhere", timeout: 250 });
		expect(calls.find((call) => call.command === "defaulted")).toMatchObject({ cwd: CWD, timeout: 10_000 });
	});

	it("does not let a timed-out or errored check stop later checks", async () => {
		const executor: CheckExecutor = async (command) => {
			if (command === "hang") return { stdout: "", stderr: "", code: -1, killed: true };
			if (command === "missing") throw new Error("boom");
			return { stdout: "", stderr: "", code: 0, killed: false };
		};

		const results = await runChecks([definition("hang"), definition("missing"), definition("after")], executor, {
			cwd: CWD,
		});

		expect(results.map((result) => result.state)).toEqual(["timed_out", "error", "passed"]);
	});
});
