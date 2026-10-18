import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { afterEach, describe, expect, it, vi } from "vitest";
import { buildInvocation, captureScript, DEFAULT_OUTPUT_FILE, SCRIPT_PATH } from "./script.js";

const dirs: string[] = [];

afterEach(() => {
	for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), "system-context-script-"));
	dirs.push(dir);
	return dir;
}

function execWriting(content: string) {
	return vi.fn(async (_command: string, args: string[]) => {
		writeFileSync(args[args.indexOf("--out") + 1]!, content);
		return { stdout: "", stderr: "", code: 0, killed: false };
	});
}

describe("buildInvocation", () => {
	it("locates the script and passes the target directory and --out", () => {
		const invocation = buildInvocation({ cwd: "/projects/other", out: "captured.txt" }, "/session");

		expect(invocation.command).toBe("node");
		expect(invocation.args).toEqual([
			"--experimental-strip-types",
			SCRIPT_PATH,
			"/projects/other",
			"--out",
			"/session/captured.txt",
		]);
		expect(invocation.outPath).toBe("/session/captured.txt");
	});

	it("defaults the target directory to the session cwd and the output to a predictable filename", () => {
		const invocation = buildInvocation({}, "/session");

		expect(invocation.args[2]).toBe("/session");
		expect(invocation.outPath).toBe(join("/session", DEFAULT_OUTPUT_FILE));
	});
});

describe("captureScript", () => {
	it("defaults the output into the explicit target directory when only cwd is given", () => {
		const invocation = buildInvocation({ cwd: "/projects/other" }, "/session");

		expect(invocation.outPath).toBe(join("/projects/other", DEFAULT_OUTPUT_FILE));
	});

	it("runs the script and returns the absolute path and byte size", async () => {
		const dir = tempDir();
		const out = join(dir, "prompt.txt");
		const exec = execWriting("PROMPT\n");

		const result = await captureScript({ exec } as unknown as ExtensionAPI, { out }, dir);

		expect(exec).toHaveBeenCalledWith("node", ["--experimental-strip-types", SCRIPT_PATH, dir, "--out", out]);
		expect(result.path).toBe(out);
		expect(result.bytes).toBe(7);
	});

	it("throws the script's reason on a non-zero exit", async () => {
		const dir = tempDir();
		const exec = vi.fn(async () => ({ stdout: "", stderr: "trust store unreadable\n", code: 1, killed: false }));

		await expect(captureScript({ exec } as unknown as ExtensionAPI, { out: "x.txt" }, dir)).rejects.toThrow(
			/trust store unreadable/,
		);
	});
});
