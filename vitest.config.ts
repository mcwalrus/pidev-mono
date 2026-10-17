import { availableParallelism } from "node:os";
import { defineConfig } from "vitest/config";

export default defineConfig({
	test: {
		include: ["packages/*/**/*.test.ts"],
		setupFiles: ["./test/setup.ts"],
		// test/setup.ts performs dynamic imports inside beforeEach so module-load
		// captures (e.g. homedir()) resolve against the stubbed HOME. Cold-cache
		// resolution can exceed vitest's default 10s hookTimeout on a worker's
		// first test; raised so warm-up completes inside the timer.
		hookTimeout: 30_000,
		testTimeout: 15_000,
		maxWorkers: Math.max(1, Math.floor(availableParallelism() * 0.6)),
		unstubGlobals: true,
		clearMocks: true,
		restoreMocks: true,
		passWithNoTests: true,
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			include: ["packages/*/**/*.ts"],
			// Deliberately modest for a fresh scaffold — raise as tests land.
			thresholds: {
				statements: 70,
				branches: 60,
				functions: 70,
				lines: 70,
			},
			exclude: [
				"**/node_modules/**",
				"**/dist/**",
				"**/*.test.ts",
				"**/*.d.ts",
				"**/index.ts",
				"packages/test-utils/**",
			],
		},
	},
});
