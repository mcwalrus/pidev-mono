import { createCanvas, loadImage } from "canvas";
import { describe, expect, it } from "vitest";
import { paletteColor, renderAnsiToPng } from "./render.js";

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("paletteColor", () => {
	it("maps the 16 ANSI colours", () => {
		expect(paletteColor(0)).toBe("#000000");
		expect(paletteColor(1)).toBe("#cd0000");
		expect(paletteColor(15)).toBe("#ffffff");
	});

	it("maps the 6x6x6 colour cube", () => {
		expect(paletteColor(16)).toBe("#000000");
		expect(paletteColor(196)).toBe("#ff0000");
		expect(paletteColor(231)).toBe("#ffffff");
	});

	it("maps the greyscale ramp", () => {
		expect(paletteColor(232)).toBe("#080808");
		expect(paletteColor(255)).toBe("#eeeeee");
	});
});

describe("renderAnsiToPng", () => {
	it("produces a PNG whose header matches the requested grid", async () => {
		const image = await renderAnsiToPng("hello\nworld", 10, 2);
		expect(image.png.subarray(0, 8)).toEqual(PNG_MAGIC);
		expect(image.width).toBeGreaterThan(0);
		expect(image.height).toBeGreaterThan(0);
		// PNG IHDR stores width and height as big-endian uint32 at offsets 16 and 20.
		expect(image.png.readUInt32BE(16)).toBe(image.width);
		expect(image.png.readUInt32BE(20)).toBe(image.height);
	});

	it("paints background colour into the cell", async () => {
		const image = await renderAnsiToPng("\x1b[41mX\x1b[0m", 4, 1);
		const loaded = await loadImage(image.png);
		const canvas = createCanvas(image.width, image.height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(loaded, 0, 0);
		const [r, g, b] = ctx.getImageData(1, 1, 1, 1).data;
		expect([r, g, b]).toEqual([0xcd, 0x00, 0x00]);
	});

	it("swaps foreground and background for inverse cells", async () => {
		const image = await renderAnsiToPng("\x1b[7mX\x1b[0m", 4, 1);
		const loaded = await loadImage(image.png);
		const canvas = createCanvas(image.width, image.height);
		const ctx = canvas.getContext("2d");
		ctx.drawImage(loaded, 0, 0);
		const [r, g, b] = ctx.getImageData(1, 1, 1, 1).data;
		// Inverse of default foreground (#d4d4d4) on default background.
		expect([r, g, b]).toEqual([0xd4, 0xd4, 0xd4]);
	});
});
