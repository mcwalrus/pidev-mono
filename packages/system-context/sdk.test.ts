import { describe, expect, it } from "vitest";

/**
 * The dump script and the extension's capture path both drive these exports at
 * runtime. A transitive `@earendil-works` version drift can leave the SDK root
 * unimportable, which breaks cross-directory capture with a module error rather
 * than a logic error, so the import is asserted here.
 */
describe("host SDK availability", () => {
	it("resolves the exports the dump script drives", async () => {
		const sdk = await import("@earendil-works/pi-coding-agent");
		expect(typeof sdk.createAgentSession).toBe("function");
		expect(typeof sdk.DefaultResourceLoader).toBe("function");
		expect(typeof sdk.ProjectTrustStore).toBe("function");
	});
});
