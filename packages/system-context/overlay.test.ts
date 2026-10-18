import type { Theme } from "@earendil-works/pi-coding-agent";
import { visibleWidth } from "@earendil-works/pi-tui";
import { makeTheme } from "@pidev/test-utils";
import { describe, expect, it } from "vitest";
import { CHROME_ROWS, OVERLAY_TITLE, renderOverlay } from "./overlay.js";

const theme = makeTheme() as unknown as Theme;

function frame(content: string, overrides: Partial<Parameters<typeof renderOverlay>[0]> = {}) {
	return renderOverlay({ content, width: 30, visibleLines: 5, scrollOffset: 0, theme, ...overrides });
}

describe("renderOverlay", () => {
	it("wraps long lines to the content width and pads every row to the terminal width", () => {
		const long = "alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu";
		const rendered = frame(long, { width: 24, visibleLines: 8 });

		expect(rendered.totalLines).toBeGreaterThan(1);
		expect(rendered.lines.length).toBe(CHROME_ROWS + 8);
		for (const line of rendered.lines) expect(visibleWidth(line)).toBe(24);
		expect(rendered.lines.join("\n")).toContain("alpha");
		expect(rendered.lines.join("\n")).toContain("mu");
	});

	it("preserves real line breaks in the content", () => {
		const rendered = frame("first line\nsecond line", { visibleLines: 4 });
		const body = rendered.lines.slice(4, 4 + 4).join("\n");
		expect(body).toContain("first line");
		expect(body).toContain("second line");
	});

	it("clamps the scroll offset at both ends", () => {
		const content = Array.from({ length: 100 }, (_, index) => `line ${index}`).join("\n");
		expect(frame(content, { visibleLines: 4, scrollOffset: 1000 }).scrollOffset).toBe(96);
		expect(frame(content, { visibleLines: 4, scrollOffset: -5 }).scrollOffset).toBe(0);
	});

	it("renders a well-formed frame for empty content", () => {
		const rendered = frame("", { visibleLines: 3 });
		expect(rendered.totalLines).toBe(1);
		expect(rendered.lines.length).toBe(CHROME_ROWS + 3);
		expect(rendered.lines[0]?.startsWith("╭")).toBe(true);
		expect(rendered.lines.at(-1)?.endsWith("╯")).toBe(true);
		expect(rendered.copyText).toBe("");
	});

	it("copies only the semantic footprint, excluding title and footer chrome", () => {
		const rendered = frame("SEMANTIC\nPROMPT", { visibleLines: 4 });
		expect(rendered.copyText).toBe("SEMANTIC\nPROMPT");
		expect(rendered.copyText).not.toContain(OVERLAY_TITLE);
		expect(rendered.copyText).not.toContain("Esc/q");
	});
});
