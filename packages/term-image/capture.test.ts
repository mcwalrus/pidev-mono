import { describe, expect, it } from "vitest";
import { captureTmuxPane, type ExecFile } from "./capture.js";

describe("captureTmuxPane", () => {
	it("reads the pane size then the ANSI-escaped screen", () => {
		const calls: string[][] = [];
		const exec: ExecFile = (file, args) => {
			calls.push([file, ...args]);
			if (args.includes("display-message")) return "80 24\n";
			return "\x1b[31mred\x1b[0m";
		};

		const pane = captureTmuxPane("work:0.1", exec);

		expect(pane).toEqual({ cols: 80, rows: 24, ansi: "\x1b[31mred\x1b[0m" });
		expect(calls[0]).toEqual(["tmux", "display-message", "-p", "-t", "work:0.1", "#{pane_width} #{pane_height}"]);
		// `-e` must be present, or the capture carries no colour for the renderer.
		expect(calls[1]).toEqual(["tmux", "capture-pane", "-p", "-e", "-t", "work:0.1"]);
	});

	it("throws when the pane size cannot be read", () => {
		const exec: ExecFile = () => "0 0\nextra";
		expect(() => captureTmuxPane("missing", exec)).toThrow(/pane size/);
	});
});
