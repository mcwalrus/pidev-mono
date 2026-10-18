import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_SETTLE_TIMEOUT_MS, type DumpOptions, main, parseArgs } from "./dump.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "system-context-"));
	dirs.push(dir);
	return dir;
}

describe("parseArgs", () => {
	it("defaults the project directory to the fallback cwd and no output", () => {
		expect(parseArgs([], "/work")).toEqual({
			cwd: "/work",
			settleTimeoutMs: DEFAULT_SETTLE_TIMEOUT_MS,
			out: undefined,
		});
	});

	it("parses a positional project directory, --out and --settle-timeout", () => {
		expect(parseArgs(["/target", "--out", "captured.txt", "--settle-timeout", "2500"])).toMatchObject({
			cwd: "/target",
			settleTimeoutMs: 2500,
			out: "captured.txt",
		});
	});

	it("ignores an invalid settle timeout and keeps the default", () => {
		expect(parseArgs(["--settle-timeout", "not-a-number"]).settleTimeoutMs).toBe(DEFAULT_SETTLE_TIMEOUT_MS);
	});
});

describe("main", () => {
	it("writes the prompt to --out, creates missing parents, and returns the path on stdout", async () => {
		const dir = tempDir();
		const out = join(dir, "nested", "deeper", "prompt.txt");

		const result = await main(["--out", out], { produce: async () => "PROMPT\nBODY" });

		expect(result.code).toBe(0);
		expect(result.outPath).toBe(out);
		expect(result.stdout).toBe(`${out}\n`);
		expect(readFileSync(out, "utf8")).toBe("PROMPT\nBODY");
	});

	it("sends the prompt to stdout when --out is absent", async () => {
		const result = await main([], { produce: async () => "STDOUT PROMPT" });

		expect(result.code).toBe(0);
		expect(result.outPath).toBeUndefined();
		expect(result.stdout).toBe("STDOUT PROMPT");
		expect(result.stderr).toBe("");
	});

	it("passes the parsed directory and settle timeout to the producer", async () => {
		let seen: DumpOptions | undefined;
		await main(["/target", "--settle-timeout", "1234"], {
			produce: async (options) => {
				seen = options;
				return "x";
			},
		});

		expect(seen?.cwd).toBe("/target");
		expect(seen?.settleTimeoutMs).toBe(1234);
	});

	it("exits non-zero with the failure reason on stderr, writing no file", async () => {
		const dir = tempDir();
		const out = join(dir, "should-not-exist.txt");

		const result = await main(["--out", out], {
			produce: async () => {
				throw new Error("trust store unreadable");
			},
		});

		expect(result.code).toBe(1);
		expect(result.stdout).toBe("");
		expect(result.stderr).toContain("trust store unreadable");
		expect(existsSync(out)).toBe(false);
	});

	it("keeps producer diagnostics on stderr, never in the prompt or output file", async () => {
		const dir = tempDir();
		const out = join(dir, "prompt.txt");

		const result = await main(["--out", out], {
			produce: async (options) => {
				options.log("project trust: reading store");
				return "CLEAN PROMPT";
			},
		});

		expect(readFileSync(out, "utf8")).toBe("CLEAN PROMPT");
		expect(result.stdout).toBe(`${out}\n`);
		expect(result.stderr).toContain("project trust: reading store");
	});
});
