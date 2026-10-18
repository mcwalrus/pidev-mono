/**
 * Scrollable overlay for the session's system footprint.
 *
 * Adapted from pi-system-prompt-viewer by eggmasonvalue (Apache-2.0); see NOTICE.
 */

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, type TUI, truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";

/** Rows the overlay spends on borders, headings and footer. */
export const CHROME_ROWS = 7;
export const OVERLAY_TITLE = "Provider-neutral System Footprint";

export interface OverlayRenderInput {
	/** The semantic footprint; the copied text is exactly this. */
	content: string;
	width: number;
	visibleLines: number;
	scrollOffset: number;
	theme: Theme;
	copied?: boolean;
}

export interface OverlayFrame {
	lines: string[];
	/** Requested offset clamped to the rendered content. */
	scrollOffset: number;
	totalLines: number;
	/** Only the semantic footprint, no labels or footer. */
	copyText: string;
}

/**
 * Pure layout: wrap, border, pad and clamp. Kept free of TUI state so the
 * layout is testable without a terminal.
 */
export function renderOverlay(input: OverlayRenderInput): OverlayFrame {
	const { content, theme } = input;
	const width = Math.max(4, input.width);
	const innerWidth = Math.max(1, width - 2);
	const contentWidth = Math.max(1, innerWidth - 1);
	const displayLines = wrapContent(content, contentWidth);
	const visible = Math.max(1, input.visibleLines);
	const maxOffset = Math.max(0, displayLines.length - visible);
	const scrollOffset = Math.min(Math.max(0, input.scrollOffset), maxOffset);
	const end = Math.min(scrollOffset + visible, displayLines.length);

	const border = (text: string) => theme.fg("border", text);
	const row = (text: string) => `${border("│")}${pad(text, innerWidth)}${border("│")}`;
	const lines = [border(`╭${"─".repeat(innerWidth)}╮`)];

	lines.push(row(` ${theme.fg("accent", theme.bold(OVERLAY_TITLE))}`));
	lines.push(row(` ${theme.fg("dim", "Assembled prompt + active semantic tools")}`));
	lines.push(row(""));

	for (let index = scrollOffset; index < end; index++) lines.push(row(` ${displayLines[index] ?? ""}`));
	for (let index = end - scrollOffset; index < visible; index++) lines.push(row(""));

	const range = `${displayLines.length === 0 ? 0 : scrollOffset + 1}-${end}/${displayLines.length}`;
	const copyState = input.copied ? theme.fg("success", "copied") : "copy";
	const footerLeft = theme.fg("dim", range);
	const footerRight = theme.fg("dim", `c ${copyState}  ↑↓/jk pgup/pgdn home/end  Esc/q`);
	const spacing = Math.max(1, innerWidth - 1 - visibleWidth(footerLeft) - visibleWidth(footerRight));
	lines.push(row(""));
	lines.push(row(` ${footerLeft}${" ".repeat(spacing)}${footerRight}`));
	lines.push(border(`╰${"─".repeat(innerWidth)}╯`));

	return { lines, scrollOffset, totalLines: displayLines.length, copyText: content };
}

function wrapContent(content: string, width: number): string[] {
	const lines: string[] = [];
	for (const line of content.split("\n")) {
		const wrapped = wrapTextWithAnsi(line, width);
		lines.push(...(wrapped.length ? wrapped : [""]));
	}
	return lines;
}

function pad(text: string, width: number): string {
	const clipped = truncateToWidth(text, width, "", true);
	return clipped + " ".repeat(Math.max(0, width - visibleWidth(clipped)));
}

/**
 * TUI component delegating layout to {@link renderOverlay}. Copy uses OSC 52 so
 * the terminal clipboard receives only the semantic footprint.
 */
export class SystemContextOverlay {
	private scrollOffset = 0;
	private totalLines = 0;
	private copiedAt = 0;
	private copiedTimer: ReturnType<typeof setTimeout> | undefined;

	constructor(
		private readonly tui: TUI,
		private readonly theme: Theme,
		private readonly content: string,
		private readonly done: () => void,
	) {}

	handleInput(data: string): void {
		const visible = this.visibleLineCount();
		const maximumOffset = Math.max(0, this.totalLines - visible);

		if (matchesKey(data, "up") || matchesKey(data, "k")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - 1);
		} else if (matchesKey(data, "down") || matchesKey(data, "j")) {
			this.scrollOffset = Math.min(maximumOffset, this.scrollOffset + 1);
		} else if (matchesKey(data, "pageUp")) {
			this.scrollOffset = Math.max(0, this.scrollOffset - visible);
		} else if (matchesKey(data, "pageDown")) {
			this.scrollOffset = Math.min(maximumOffset, this.scrollOffset + visible);
		} else if (matchesKey(data, "home")) {
			this.scrollOffset = 0;
		} else if (matchesKey(data, "end")) {
			this.scrollOffset = maximumOffset;
		} else if (matchesKey(data, "c")) {
			this.copy();
		} else if (matchesKey(data, "escape") || matchesKey(data, "q")) {
			this.dispose();
			this.done();
			return;
		} else {
			return;
		}

		this.tui.requestRender();
	}

	render(width: number): string[] {
		const frame = renderOverlay({
			content: this.content,
			width,
			visibleLines: this.visibleLineCount(),
			scrollOffset: this.scrollOffset,
			theme: this.theme,
			copied: Date.now() - this.copiedAt < 2_000,
		});
		this.scrollOffset = frame.scrollOffset;
		this.totalLines = frame.totalLines;
		return frame.lines;
	}

	invalidate(): void {}

	dispose(): void {
		clearTimeout(this.copiedTimer);
		this.copiedTimer = undefined;
	}

	private visibleLineCount(): number {
		return Math.max(1, Math.floor(this.tui.terminal.rows * 0.92) - CHROME_ROWS);
	}

	private copy(): void {
		const base64 = Buffer.from(this.content, "utf-8").toString("base64");
		process.stdout.write(`\x1b]52;c;${base64}\x07`);
		this.copiedAt = Date.now();
		clearTimeout(this.copiedTimer);
		this.copiedTimer = setTimeout(() => this.tui.requestRender(), 2_000);
	}
}
