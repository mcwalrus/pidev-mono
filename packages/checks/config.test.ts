import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { configPath, saveJsonConfig } from "@pidev/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	CONFIG_NAME,
	loadChecksConfig,
	PROJECT_CONFIG_FILE,
	parseChecksConfig,
	resolveChecksConfig,
} from "./config.js";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("parseChecksConfig", () => {
	it("returns no checks for a non-object payload", () => {
		expect(parseChecksConfig(null)).toEqual([]);
		expect(parseChecksConfig("nope")).toEqual([]);
		expect(parseChecksConfig([1, 2])).toEqual([]);
	});

	it("returns no checks when `checks` is absent", () => {
		expect(parseChecksConfig({})).toEqual([]);
	});

	it("warns and returns no checks when `checks` is not an array", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(parseChecksConfig({ checks: {} })).toEqual([]);
		expect(warn).toHaveBeenCalledOnce();
	});

	it("parses a valid entry and preserves its optional fields", () => {
		expect(
			parseChecksConfig({
				checks: [
					{
						name: "postgres",
						command: "pg_isready",
						args: ["-h", "127.0.0.1"],
						cwd: "/srv",
						timeoutMs: 5000,
					},
				],
			}),
		).toEqual([{ name: "postgres", command: "pg_isready", args: ["-h", "127.0.0.1"], cwd: "/srv", timeoutMs: 5000 }]);
	});

	it("skips an invalid entry with a warning but keeps the rest", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = parseChecksConfig({
			checks: [
				{ name: "good", command: "true" },
				{ name: "", command: "bad" },
				{ name: "no-command" },
				{ name: "later", command: "true" },
			],
		});
		expect(result.map((entry) => entry.name)).toEqual(["good", "later"]);
		expect(warn).toHaveBeenCalledTimes(2);
	});

	it("preserves declaration order and duplicate names", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = parseChecksConfig({
			checks: [
				{ name: "dup", command: "true" },
				{ name: "dup", command: "false" },
			],
		});
		expect(result.map((entry) => entry.command)).toEqual(["true", "false"]);
		expect(warn).toHaveBeenCalledOnce();
		expect(warn).toHaveBeenCalledWith('pidev-checks: duplicate check name "dup"');
	});

	it("warns once per duplicated name regardless of copies", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const result = parseChecksConfig({
			checks: [
				{ name: "dup", command: "a" },
				{ name: "dup", command: "b" },
				{ name: "dup", command: "c" },
				{ name: "solo", command: "d" },
			],
		});
		expect(result.map((entry) => entry.command)).toEqual(["a", "b", "c", "d"]);
		expect(warn).toHaveBeenCalledOnce();
	});
});

describe("resolveChecksConfig", () => {
	it("reports the XDG path applied", () => {
		const path = configPath(CONFIG_NAME);
		saveJsonConfig(path, { checks: [{ name: "postgres", command: "pg_isready" }] });
		expect(resolveChecksConfig()).toEqual({
			definitions: [{ name: "postgres", command: "pg_isready" }],
			path,
		});
	});

	it("reports the project path when it wins", () => {
		const cwd = mkdtempSync(join(tmpdir(), "pidev-checks-project-"));
		const path = join(cwd, PROJECT_CONFIG_FILE);
		saveJsonConfig(path, { checks: [{ name: "local", command: "true" }] });
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "global", command: "true" }] });
		expect(resolveChecksConfig(cwd)).toEqual({ definitions: [{ name: "local", command: "true" }], path });
	});

	it("reports no path when no file exists", () => {
		rmSync(configPath(CONFIG_NAME), { force: true });
		expect(resolveChecksConfig()).toEqual({ definitions: [], path: undefined });
	});
});

describe("loadChecksConfig", () => {
	it("reads checks from the XDG config path", () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		expect(loadChecksConfig()).toEqual([{ name: "postgres", command: "pg_isready" }]);
	});

	it("prefers a project-local config under the session cwd", () => {
		const cwd = mkdtempSync(join(tmpdir(), "pidev-checks-project-"));
		saveJsonConfig(join(cwd, PROJECT_CONFIG_FILE), { checks: [{ name: "local", command: "true" }] });
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "global", command: "true" }] });
		expect(loadChecksConfig(cwd)).toEqual([{ name: "local", command: "true" }]);
	});

	it("falls back to the global config when the project file is absent", () => {
		const cwd = mkdtempSync(join(tmpdir(), "pidev-checks-project-"));
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "global", command: "true" }] });
		expect(loadChecksConfig(cwd)).toEqual([{ name: "global", command: "true" }]);
	});

	it("falls back to the global config when no cwd is given", () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "global", command: "true" }] });
		expect(loadChecksConfig()).toEqual([{ name: "global", command: "true" }]);
	});
});
