import xterm from "@xterm/headless";
import { createCanvas } from "canvas";

const XtermTerminal = xterm.Terminal;

const BASE16 = [
	"#000000",
	"#cd0000",
	"#00cd00",
	"#cdcd00",
	"#0000ee",
	"#cd00cd",
	"#00cdcd",
	"#e5e5e5",
	"#7f7f7f",
	"#ff0000",
	"#00ff00",
	"#ffff00",
	"#5c5cff",
	"#ff00ff",
	"#00ffff",
	"#ffffff",
];

const DEFAULT_FG = "#d4d4d4";
const DEFAULT_BG = "#1e1e1e";
const DEFAULT_FONT_SIZE = 14;
const DEFAULT_FONT_FAMILY = "Menlo, monospace";

export interface RenderOptions {
	/** Colour for cells with no explicit foreground. */
	defaultFg?: string;
	/** Colour for cells with no explicit background. */
	defaultBg?: string;
	fontSize?: number;
	fontFamily?: string;
}

export interface RenderedImage {
	png: Buffer;
	width: number;
	height: number;
}

function toHex(r: number, g: number, b: number): string {
	return `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/**
 * Resolve a terminal palette index (0-255) to a hex colour.
 *
 * 0-15 use the standard ANSI palette; 16-231 form the 6x6x6 colour cube; 232-255
 * are the greyscale ramp. This is the rule xterm uses, so `getFgColor()` values
 * map to the colours a real terminal would show.
 */
export function paletteColor(index: number): string {
	if (index < 16) return BASE16[index]!;
	if (index < 232) {
		const offset = index - 16;
		const level = (value: number) => (value === 0 ? 0 : 55 + value * 40);
		return toHex(level(Math.floor(offset / 36)), level(Math.floor((offset % 36) / 6)), level(offset % 6));
	}
	const grey = 8 + (index - 232) * 10;
	return toHex(grey, grey, grey);
}

/**
 * Parse `ansi` into a cell grid and rasterise it to a PNG.
 *
 * The terminal is created at `cols` x `rows` so wrapping matches the source pane.
 * Every cell's mode is honoured: palette, truecolor, and default colours, with
 * the inverse attribute swapping the two.
 */
export async function renderAnsiToPng(
	ansi: string,
	cols: number,
	rows: number,
	options: RenderOptions = {},
): Promise<RenderedImage> {
	const defaultFg = options.defaultFg ?? DEFAULT_FG;
	const defaultBg = options.defaultBg ?? DEFAULT_BG;
	const fontSize = options.fontSize ?? DEFAULT_FONT_SIZE;
	const fontFamily = options.fontFamily ?? DEFAULT_FONT_FAMILY;

	const terminal = new XtermTerminal({ cols, rows, allowProposedApi: true });
	await new Promise<void>((resolve) => {
		terminal.write(ansi.replace(/\r?\n/g, "\r\n"), () => resolve());
	});

	const measure = createCanvas(1, 1).getContext("2d");
	measure.font = `${fontSize}px ${fontFamily}`;
	const cellWidth = Math.ceil(measure.measureText("M").width);
	const cellHeight = Math.round(fontSize * 1.35);

	const image = createCanvas(cols * cellWidth, rows * cellHeight);
	const ctx = image.getContext("2d");
	ctx.fillStyle = defaultBg;
	ctx.fillRect(0, 0, image.width, image.height);
	ctx.textBaseline = "middle";

	const buffer = terminal.buffer.active;
	for (let y = 0; y < rows; y++) {
		const line = buffer.getLine(buffer.viewportY + y);
		if (!line) continue;
		for (let x = 0; x < cols; x++) {
			const cell = line.getCell(x);
			if (!cell) continue;
			const width = cell.getWidth();
			// Width 0 marks the cell after a wide glyph; the glyph already covers it.
			if (width === 0) continue;

			let fg = cell.isFgDefault()
				? defaultFg
				: cell.isFgRGB()
					? toHex((cell.getFgColor() >> 16) & 255, (cell.getFgColor() >> 8) & 255, cell.getFgColor() & 255)
					: paletteColor(cell.getFgColor());
			let bg = cell.isBgDefault()
				? null
				: cell.isBgRGB()
					? toHex((cell.getBgColor() >> 16) & 255, (cell.getBgColor() >> 8) & 255, cell.getBgColor() & 255)
					: paletteColor(cell.getBgColor());
			if (cell.isInverse()) {
				const swapped = fg;
				fg = bg ?? defaultBg;
				bg = swapped;
			}

			if (bg) {
				ctx.fillStyle = bg;
				ctx.fillRect(x * cellWidth, y * cellHeight, width * cellWidth, cellHeight);
			}
			const chars = cell.getChars();
			if (chars && chars !== " ") {
				ctx.fillStyle = fg;
				ctx.font = `${cell.isBold() ? "bold " : ""}${fontSize}px ${fontFamily}`;
				ctx.fillText(chars, x * cellWidth, y * cellHeight + cellHeight / 2);
			}
		}
	}

	return { png: image.toBuffer("image/png"), width: image.width, height: image.height };
}
