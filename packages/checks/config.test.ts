import { configPath, saveJsonConfig } from "@pidev/config";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CONFIG_NAME, loadChecksConfig, parseChecksConfig } from "./config.js";

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
		const result = parseChecksConfig({
			checks: [
				{ name: "dup", command: "true" },
				{ name: "dup", command: "false" },
			],
		});
		expect(result.map((entry) => entry.command)).toEqual(["true", "false"]);
	});
});

describe("loadChecksConfig", () => {
	it("reads checks from the XDG config path", () => {
		saveJsonConfig(configPath(CONFIG_NAME), { checks: [{ name: "postgres", command: "pg_isready" }] });
		expect(loadChecksConfig()).toEqual([{ name: "postgres", command: "pg_isready" }]);
	});
});
