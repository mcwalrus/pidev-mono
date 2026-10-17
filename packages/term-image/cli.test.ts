import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { TmuxCapture } from "./capture.js";
import { DEFAULT_OUT, main, parseArgs } from "./cli.js";
import type { RenderedImage } from "./render.js";

describe("parseArgs", () => {
	it("defaults target and output", () => {
		expect(parseArgs([])).toEqual({ target: "0", out: DEFAULT_OUT });
	});

	it("reads positional target and output", () => {
		expect(parseArgs(["work:0.1", "/tmp/x.png"])).toEqual({ target: "work:0.1", out: "/tmp/x.png" });
	});

	it("ignores flag-prefixed tokens", () => {
		expect(parseArgs(["--verbose", "1", "out.png"])).toEqual({ target: "1", out: "out.png" });
	});
});

describe("main", () => {
	const dirs: string[] = [];

	afterEach(() => {
		for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	});

	it("captures, renders, and writes the PNG", async () => {
		const dir = mkdtempSync(join(tmpdir(), "term-image-"));
		dirs.push(dir);
		const out = join(dir, "pane.png");
		const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
		const capture = (): TmuxCapture => ({ cols: 4, rows: 1, ansi: "hi" });
		const render = async (): Promise<RenderedImage> => ({ png, width: 4, height: 1 });

		const written = await main(["0", out], { capture, render });

		expect(written).toBe(out);
		expect(readFileSync(out)).toEqual(png);
	});
});
