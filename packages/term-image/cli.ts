#!/usr/bin/env node
import { realpathSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { TmuxCapture } from "./capture.js";
import type { RenderedImage } from "./render.js";

export const DEFAULT_TARGET = "0";
export const DEFAULT_OUT = "term-image.png";

/** The two effects `main` performs, injectable so tests stay off tmux and canvas. */
export interface CliDependencies {
	capture: (target: string) => TmuxCapture;
	render: (ansi: string, cols: number, rows: number) => Promise<RenderedImage>;
}

/**
 * `term-image [target] [out.png]`.
 *
 * Positional only: a tmux target (`session:window.pane`, default the current
 * session) then the output path. `--`-prefixed tokens are ignored so callers can
 * forward extra flags without the parser failing.
 */
export function parseArgs(argv: string[]): { target: string; out: string } {
	const positional = argv.filter((arg) => !arg.startsWith("--"));
	const [target = DEFAULT_TARGET, out = DEFAULT_OUT] = positional;
	return { target, out };
}

/**
 * Load the real capture/render modules by `.ts` URL.
 *
 * The package's relative imports use `.js` specifiers for Pi's loader (which
 * rewrites `.js` -> `.ts`). Plain `node` does not, so the bin reaches its
 * siblings directly as `.ts` and relies on Node's native type stripping instead.
 * Kept out of module scope so importing this file in tests has no side effects.
 */
async function loadDefaults(): Promise<CliDependencies> {
	const captureModule = (await import(new URL("./capture.ts", import.meta.url).href)) as typeof import("./capture.js");
	const renderModule = (await import(new URL("./render.ts", import.meta.url).href)) as typeof import("./render.js");
	return { capture: captureModule.captureTmuxPane, render: renderModule.renderAnsiToPng };
}

/** Capture `target`, render it, write the PNG, and return the absolute path. */
export async function main(argv = process.argv.slice(2), deps: Partial<CliDependencies> = {}): Promise<string> {
	const { target, out } = parseArgs(argv);
	const defaults = deps.capture && deps.render ? (deps as CliDependencies) : await loadDefaults();
	const capture = deps.capture ?? defaults.capture;
	const render = deps.render ?? defaults.render;
	const pane = capture(target);
	const image = await render(pane.ansi, pane.cols, pane.rows);
	const outPath = resolve(out);
	await writeFile(outPath, image.png);
	return outPath;
}

/**
 * True when this module is the process entry point.
 *
 * `argv[1]` is the symlink path when invoked through `node_modules/.bin`, so it
 * is resolved before comparing against this module's real path.
 */
function isDirectInvocation(): boolean {
	const entry = process.argv[1];
	if (!entry) return false;
	try {
		return realpathSync(entry) === fileURLToPath(import.meta.url);
	} catch {
		return false;
	}
}

// Run only when executed as the bin, not when imported by tests.
if (isDirectInvocation()) {
	main()
		.then((outPath) => {
			console.log(outPath);
		})
		.catch((error: unknown) => {
			console.error(error instanceof Error ? error.message : String(error));
			process.exitCode = 1;
		});
}
