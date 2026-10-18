import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const notice = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "NOTICE"), "utf8");

describe("attribution", () => {
	it("names the upstream project, author, and repository URL", () => {
		expect(notice).toContain("pi-system-prompt-viewer");
		expect(notice).toContain("eggmasonvalue");
		expect(notice).toContain("https://github.com/eggmasonvalue/pi-system-prompt-viewer");
	});

	it("states the changes made from upstream", () => {
		expect(notice.toLowerCase()).toContain("provider request");
		expect(notice.toLowerCase()).toContain("changes");
	});
});
