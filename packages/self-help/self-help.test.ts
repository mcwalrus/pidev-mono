import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi } from "@pidev/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The repo's installed pi-coding-agent pulls a pi-codemode whose named exports
// drifted, so the package root cannot be evaluated under Vitest. Production runs
// under the host, which aliases a matching build; tests substitute the two
// path helpers the extension imports.
vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => `${process.env.HOME}/.pi/agent`,
	CONFIG_DIR_NAME: ".pi",
}));

import register from "./index.js";
import type { ResolvedPackage } from "./resolve.js";
import { DEFAULT_SECTION_BYTE_CAP, formatExtensionsSection } from "./section.js";

const created: string[] = [];

afterEach(() => {
	while (created.length > 0) {
		const path = created.pop();
		if (path) rmSync(path, { recursive: true, force: true });
	}
});

function makeInstalledPackage(
	agentDir: string,
	name: string,
	manifest: Record<string, unknown> = {},
	files: Record<string, string> = {},
): string {
	const root = join(agentDir, "npm", "node_modules", name);
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, "package.json"), JSON.stringify({ name, ...manifest }));
	for (const [file, content] of Object.entries(files)) {
		const path = join(root, file);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	created.push(join(agentDir, "npm", "node_modules", name.split("/")[0]!));
	return root;
}

async function advertisedSection(packages: unknown, hasUI = false): Promise<string | undefined> {
	const { pi, captured } = createMockPi({ getSettings: () => ({ packages }) as never });
	register(pi);
	const ctx = createMockCtx({ hasUI });
	await captured.events.get("session_start")![0]({ type: "session_start", reason: "startup" }, ctx);
	const event = { systemPromptOptions: { sections: {} as Record<string, string> } };
	await captured.events.get("before_agent_start")![0](event, ctx);
	return event.systemPromptOptions.sections.extensions;
}

function fakePackage(index: number): ResolvedPackage {
	return { source: `npm:p${index}`, name: `p${index}`, scope: "user", location: `/root/p${index}/package.json` };
}

describe("registration", () => {
	it("registers the lifecycle handlers and no model-callable tool", () => {
		const { pi, captured } = createMockPi({ getSettings: () => ({}) as never });
		register(pi);
		expect(captured.tools.size).toBe(0);
		expect(captured.events.get("session_start")).toHaveLength(1);
		expect(captured.events.get("before_agent_start")).toHaveLength(1);
	});
});

describe("advertisement", () => {
	it("leaves the prompt unchanged when nothing is installed", async () => {
		expect(await advertisedSection([])).toBeUndefined();
		expect(await advertisedSection(undefined)).toBeUndefined();
	});

	it("advertises an npm package's name and package.json location", async () => {
		const root = makeInstalledPackage(
			getAgentDir(),
			"@acme/widget",
			{ description: "A widget" },
			{ "README.md": "# Widget" },
		);
		const section = await advertisedSection(["npm:@acme/widget"]);
		expect(section).toBeDefined();
		expect(section).toContain("<available_extensions>");
		expect(section).toContain("<name>@acme/widget</name>");
		expect(section).toContain(join(root, "package.json"));
	});

	it("produces the section with hasUI false", async () => {
		makeInstalledPackage(getAgentDir(), "@acme/headless", {}, { "README.md": "# Headless" });
		expect(await advertisedSection(["npm:@acme/headless"], false)).toContain("@acme/headless");
	});
});

describe("source safety", () => {
	it("omits a source whose name contains a separator or `..`", async () => {
		makeInstalledPackage(getAgentDir(), "@acme/kept", {}, { "README.md": "# Kept" });
		const section = await advertisedSection([
			"npm:../../etc/passwd",
			"npm:foo/bar",
			"npm:@scope/../escape",
			"npm:@acme/kept",
		]);
		expect(section).not.toContain("passwd");
		expect(section).not.toContain("foo/bar");
		expect(section).not.toContain("escape");
		expect(section).toContain("@acme/kept");
	});
});

describe("byte cap", () => {
	it("keeps a small advertisement within the default cap", () => {
		const section = formatExtensionsSection([fakePackage(0)]);
		expect(Buffer.byteLength(section!, "utf8")).toBeLessThanOrEqual(DEFAULT_SECTION_BYTE_CAP);
	});

	it("degrades to names and locations with a truncation note over the cap", () => {
		const packages = Array.from({ length: 50 }, (_, index) => fakePackage(index));
		const section = formatExtensionsSection(packages, 10);
		expect(section).toContain("Truncated");
		expect(section).toContain("p0");
		expect(section).toContain("p49");
	});
});
