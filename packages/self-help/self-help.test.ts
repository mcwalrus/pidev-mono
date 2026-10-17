import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { createMockCtx, createMockPi } from "@pidev/test-utils";
import { afterEach, describe, expect, it, vi } from "vitest";

// The repo's installed pi-coding-agent pulls a pi-codemode whose named exports
// drifted, so the package root cannot be evaluated under Vitest. Production runs
// under the host, which aliases a matching build; tests substitute the two
// path helpers the extension imports.
vi.mock("@earendil-works/pi-coding-agent", () => ({
	getAgentDir: () => process.env.PI_CODING_AGENT_DIR ?? `${process.env.HOME}/.pi/agent`,
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

function makePackageAt(
	nodeModules: string,
	name: string,
	manifest: Record<string, unknown> = {},
	files: Record<string, string> = {},
): string {
	const root = join(nodeModules, name);
	mkdirSync(root, { recursive: true });
	writeFileSync(join(root, "package.json"), JSON.stringify({ name, ...manifest }));
	for (const [file, content] of Object.entries(files)) {
		const path = join(root, file);
		mkdirSync(dirname(path), { recursive: true });
		writeFileSync(path, content);
	}
	created.push(join(nodeModules, name.split("/")[0]!));
	return root;
}

function makeInstalledPackage(
	agentDir: string,
	name: string,
	manifest: Record<string, unknown> = {},
	files: Record<string, string> = {},
): string {
	return makePackageAt(join(agentDir, "npm", "node_modules"), name, manifest, files);
}

async function advertisedSection(
	packages: unknown,
	options: { hasUI?: boolean; cwd?: string } = {},
): Promise<string | undefined> {
	const { pi, captured } = createMockPi({ getSettings: () => ({ packages }) as never });
	register(pi);
	const ctx = createMockCtx({ hasUI: options.hasUI ?? false, cwd: options.cwd });
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
		expect(await advertisedSection(["npm:@acme/headless"], { hasUI: false })).toContain("@acme/headless");
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

describe("documentation", () => {
	it("carries the manifest description and the resolved README path", async () => {
		const root = makeInstalledPackage(
			getAgentDir(),
			"@acme/documented",
			{ description: "Documents things" },
			{ "README.md": "# Body that must not leak" },
		);
		const section = await advertisedSection(["npm:@acme/documented"]);
		expect(section).toContain("<description>Documents things</description>");
		expect(section).toContain(`<readme>${join(root, "README.md")}</readme>`);
		expect(section).not.toContain("Body that must not leak");
	});

	it("recognises a lowercase readme.md", async () => {
		const root = makeInstalledPackage(getAgentDir(), "@acme/lower", {}, { "readme.md": "# Lower" });
		const section = await advertisedSection(["npm:@acme/lower"]);
		expect(section).toContain(`<readme>${join(root, "readme.md")}</readme>`);
	});

	it("marks a package with no README as undocumented", async () => {
		makeInstalledPackage(getAgentDir(), "@acme/bare", {});
		const section = await advertisedSection(["npm:@acme/bare"]);
		expect(section).toContain("<undocumented>No README.md at the package root.</undocumented>");
		expect(section).not.toContain("<readme>");
	});

	it("still advertises the location when package.json is missing or unreadable", async () => {
		const root = join(getAgentDir(), "npm", "node_modules", "@acme", "broken");
		mkdirSync(root, { recursive: true });
		created.push(join(getAgentDir(), "npm", "node_modules", "@acme"));
		const section = await advertisedSection(["npm:@acme/broken"]);
		expect(section).toContain(`<location>${join(root, "package.json")}</location>`);
		expect(section).not.toContain("<description>");
		expect(section).toContain("<undocumented>");
	});
});

describe("scopes", () => {
	it("resolves the user scope under the configured agent directory", async () => {
		const custom = join(tmpdir(), `self-help-agent-${process.pid}-${Date.now()}`);
		created.push(custom);
		process.env.PI_CODING_AGENT_DIR = custom;
		const root = makePackageAt(join(custom, "npm", "node_modules"), "@acme/relocated", {}, { "README.md": "# x" });
		const section = await advertisedSection(["npm:@acme/relocated"]);
		delete process.env.PI_CODING_AGENT_DIR;
		expect(section).toContain(join(root, "package.json"));
	});

	it("resolves the project scope under the session working directory", async () => {
		const cwd = join(tmpdir(), `self-help-cwd-${process.pid}-${Date.now()}`);
		created.push(cwd);
		const root = makePackageAt(join(cwd, ".pi", "npm", "node_modules"), "@acme/project", {}, { "README.md": "# p" });
		const section = await advertisedSection(["npm:@acme/project"], { cwd });
		expect(section).toContain(join(root, "package.json"));
	});

	it("advertises both scopes with the project copy active", async () => {
		const cwd = join(tmpdir(), `self-help-both-${process.pid}-${Date.now()}`);
		created.push(cwd);
		makeInstalledPackage(getAgentDir(), "@acme/both", {}, { "README.md": "# u" });
		const projectRoot = makePackageAt(
			join(cwd, ".pi", "npm", "node_modules"),
			"@acme/both",
			{},
			{
				"README.md": "# p",
			},
		);
		const section = await advertisedSection(["npm:@acme/both"], { cwd });
		expect(section!.match(/<name>@acme\/both<\/name>/g)).toHaveLength(2);
		expect(section).toContain(`<location>${join(projectRoot, "package.json")}</location>`);
		expect(section).toContain("<active>true</active>");
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
