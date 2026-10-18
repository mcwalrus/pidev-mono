import { verifyShipManifest } from "@pidev/test-utils";
import { describe, expect, it } from "vitest";

const manifest = verifyShipManifest(import.meta.url);

describe("publish manifest", () => {
	it("`package.json` `files` array covers every production .ts module across the tree", () => {
		expect(manifest.missing).toEqual([]);
	});

	it("ships the licence and notice, with no ghost entries", () => {
		expect(manifest.declared).toEqual(expect.arrayContaining(["LICENSE", "NOTICE"]));
		expect(manifest.stale).toEqual([]);
	});
});
