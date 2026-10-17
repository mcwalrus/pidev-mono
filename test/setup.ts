import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach } from "vitest";

// Point HOME at a fresh tmpdir BEFORE any package import. Production modules
// cache `homedir()` at module-load, so this must happen first. Package imports
// below are therefore dynamic (inside beforeEach) and NOT hoisted — static
// `import` statements would run above this assignment and capture the real HOME.
const TEST_HOME = mkdtempSync(join(tmpdir(), "piex-test-home-"));
process.env.HOME = TEST_HOME;
process.env.USERPROFILE = TEST_HOME;
delete process.env.XDG_CONFIG_HOME;

// Env hygiene: clear host-injected variables so filesystem-driven detection
// starts from a clean state on every test.
beforeEach(async () => {
	delete process.env.XDG_CONFIG_HOME;
	delete process.env.PI_CODING_AGENT_DIR;

	// Reset every package that owns module-level singleton state. New packages
	// with singleton state must export a reset and be wired in here.
	const hello = await import("../packages/hello/state/store.js");
	hello.__resetState();
});
