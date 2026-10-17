import { captureTmuxPane, paletteColor, renderAnsiToPng } from "@pidev/term-image";
import { describe, expect, it } from "vitest";

describe("@pidev/term-image entry", () => {
	it("re-exports the capture and render surface", () => {
		expect(typeof captureTmuxPane).toBe("function");
		expect(typeof renderAnsiToPng).toBe("function");
		expect(paletteColor(1)).toBe("#cd0000");
	});
});
