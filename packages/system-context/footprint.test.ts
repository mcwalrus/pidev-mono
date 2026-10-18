import { describe, expect, it } from "vitest";
import {
	type ProviderNeutralToolInput,
	renderProviderNeutralContent,
	renderStructured,
	toProviderNeutralTool,
} from "./footprint.js";

describe("renderStructured", () => {
	it("keeps multiline strings on real lines and preserves array boundaries", () => {
		const display = renderStructured({
			system: "first paragraph\n\nsecond paragraph",
			messages: [{ role: "user", content: "message line one\nmessage line two" }],
		});

		const lines = display.split("\n").map((line) => line.trim());
		expect(lines).toContain("first paragraph");
		expect(lines).toContain("second paragraph");
		expect(lines).toContain("message line one");
		expect(lines).toContain("message line two");
		expect(lines.indexOf("first paragraph")).toBeLessThan(lines.indexOf("second paragraph"));
		expect(display.includes("\\n")).toBe(false);
		expect(display).toContain("[");
		expect(display).toContain("]");
	});
});

describe("renderProviderNeutralContent", () => {
	it("renders a System Prompt section and a Tools section with real prompt newlines", () => {
		const display = renderProviderNeutralContent({
			systemPrompt: "system line one\nsystem line two",
			tools: [
				{
					name: "search",
					description: "description line one\ndescription line two",
					parameters: { type: "object", properties: { query: { type: "string" } } },
				},
			],
		});

		const lines = display.split("\n").map((line) => line.trim());
		expect(lines).toContain("System Prompt");
		expect(lines).toContain("Tools");
		expect(lines).toContain("system line one");
		expect(lines).toContain("system line two");
		expect(lines).toContain("description line one");
		expect(lines).toContain("description line two");
		expect(display.includes("\\n")).toBe(false);

		for (const field of ["sourceInfo", "promptGuidelines", "before_provider_request"]) {
			expect(display.includes(field)).toBe(false);
		}
	});

	it("renders a well-formed empty Tools section", () => {
		const display = renderProviderNeutralContent({ systemPrompt: "prompt", tools: [] });
		expect(display).toContain("Tools");
		expect(display.trimEnd().endsWith("[]")).toBe(true);
	});
});

describe("toProviderNeutralTool", () => {
	it("keeps only permitted fields and preserves parameter schemas", () => {
		const parameters = {
			type: "object",
			properties: { query: { type: "string", description: "search text" } },
			required: ["query"],
			additionalProperties: false,
		};
		const descriptor = toProviderNeutralTool({
			name: "search",
			description: "Search files",
			parameters,
			sourceInfo: { source: "extension" },
			promptGuidelines: ["Use search for files"],
		} as ProviderNeutralToolInput & { sourceInfo: unknown; promptGuidelines: string[] });

		expect(descriptor).toEqual({ name: "search", description: "Search files", parameters });
		expect(JSON.stringify(descriptor)).not.toContain("sourceInfo");
		expect(JSON.stringify(descriptor)).not.toContain("promptGuidelines");
	});

	it("includes constrainedSampling only when the runtime object exposes it", () => {
		const withoutIt = toProviderNeutralTool({ name: "a", description: "d", parameters: {} });
		expect("constrainedSampling" in withoutIt).toBe(false);

		const withIt = toProviderNeutralTool({
			name: "b",
			description: "d",
			parameters: {},
			constrainedSampling: { grammar: "json" },
		});
		expect(withIt.constrainedSampling).toEqual({ grammar: "json" });
	});
});
