import { makeTheme } from "@pidev/test-utils";
import { describe, expect, it } from "vitest";
import { aggregateOf, DEFAULT_TAIL_BYTES, tail, widgetLines } from "./render.js";
import type { CheckResult, CheckState, CheckStore } from "./state/store.js";

function result(name: string, state: CheckState): CheckResult {
	return { name, state, code: null, durationMs: null, stdout: "", stderr: "", finishedAt: null };
}

function store(results: CheckResult[], running = false, lastRunAt: number | null = null): CheckStore {
	return { results, running, lastRunAt };
}

describe("aggregateOf", () => {
	it("is neutral for an empty config", () => {
		expect(aggregateOf([])).toBe("neutral");
	});

	it("stays neutral while any result is pending or running", () => {
		expect(aggregateOf([result("a", "running"), result("b", "pending")])).toBe("neutral");
		expect(aggregateOf([result("a", "passed"), result("b", "running")])).toBe("neutral");
	});

	it("is all-passed only when every settled result passed", () => {
		expect(aggregateOf([result("a", "passed"), result("b", "passed")])).toBe("all-passed");
	});

	it("is attention for any settled failed, timed_out, or error", () => {
		expect(aggregateOf([result("a", "passed"), result("b", "failed")])).toBe("attention");
		expect(aggregateOf([result("a", "timed_out")])).toBe("attention");
		expect(aggregateOf([result("a", "error")])).toBe("attention");
	});
});

describe("tail", () => {
	it("keeps the last lines", () => {
		expect(tail("a\nb\nc", 2)).toBe("b\nc");
		expect(tail("one\ntwo\nthree\nfour", 2)).toBe("three\nfour");
	});

	it("cuts a single enormous line to the byte bound", () => {
		const line = "x".repeat(DEFAULT_TAIL_BYTES * 2);
		const bounded = tail(line);
		expect(Buffer.byteLength(bounded, "utf8")).toBeLessThanOrEqual(DEFAULT_TAIL_BYTES);
		expect(bounded).toBe(line.slice(-DEFAULT_TAIL_BYTES));
	});

	it("stays within the byte bound for multi-byte output", () => {
		const line = "é".repeat(DEFAULT_TAIL_BYTES);
		expect(Buffer.byteLength(tail(line), "utf8")).toBeLessThanOrEqual(DEFAULT_TAIL_BYTES);
	});
});

describe("widgetLines", () => {
	it("names settled non-passed checks and keeps the /checks hint", () => {
		const theme = makeTheme();
		const text = widgetLines(
			store([result("postgres", "failed"), result("radius", "passed"), result("redis", "timed_out")], false, 1),
			theme,
		).join("\n");

		expect(text).toContain("postgres");
		expect(text).toContain("redis");
		expect(text).not.toContain("radius");
		expect(text).toContain("Run /checks to inspect");
	});

	it("bounds the attention name list", () => {
		const theme = makeTheme();
		const results = Array.from({ length: 7 }, (_, i) => result(`check-${i}`, "failed"));
		const text = widgetLines(store(results, false, 1), theme).join("\n");

		expect(text).toContain("check-0");
		expect(text).toContain("check-4");
		expect(text).not.toContain("check-5");
		expect(text).toContain("+2 more");
	});

	it("does not name attention checks while a run is in flight", () => {
		const theme = makeTheme();
		const text = widgetLines(store([result("postgres", "running")], true, null), theme).join("\n");

		expect(text).not.toContain("Needs attention");
	});
});
