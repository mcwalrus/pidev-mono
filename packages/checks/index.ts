/**
 * @pidev/checks — environment precondition checks for Pi.
 *
 * Declare named shell probes in `~/.config/pidev-checks/config.json`, or per
 * project in `.pi/checks/config.json`. On
 * `session_start` every check runs concurrently (non-blocking); the aggregate
 * shows beside the editor and `/checks` re-runs every check and shows detail.
 * When a rerun changes the state, the next model prompt carries a note of where
 * the checks stand and what changed.
 * Checks are advisory and read-only — the extension launches nothing but the
 * declared commands.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { type CheckDefinition, loadChecksConfig } from "./config.js";
import { changeNotice, reportText, reportType, statusText, widgetLines } from "./render.js";
import { type CheckExecutor, runChecks } from "./runner.js";
import { type CheckResult, createCheckStore, seedResults } from "./state/store.js";

export type { CheckDefinition } from "./config.js";
export { CONFIG_NAME, DEFAULT_TIMEOUT_MS, loadChecksConfig, PROJECT_CONFIG_FILE, parseChecksConfig } from "./config.js";
export type { Aggregate, CheckTransition, Foreground } from "./render.js";
export {
	aggregateOf,
	changeNotice,
	reportText,
	reportType,
	stateChanges,
	statusText,
	tail,
	widgetLines,
} from "./render.js";
export type { CheckExecutor, RunChecksOptions } from "./runner.js";
export { DEFAULT_CONCURRENCY, runChecks } from "./runner.js";
export type { CheckResult, CheckState, CheckStore } from "./state/store.js";
export { createCheckStore, seedResults } from "./state/store.js";

export const COMMAND_NAME = "checks";
export const WIDGET_KEY = "pidev-checks";
export const STATUS_KEY = "pidev-checks";

export default function register(pi: ExtensionAPI): void {
	const store = createCheckStore();
	let controller: AbortController | undefined;
	let runToken = 0;
	let pendingNotice: string | undefined;

	const paint = (ctx: ExtensionContext): void => {
		if (!ctx.hasUI) return;
		const theme = ctx.ui.theme;
		ctx.ui.setWidget(WIDGET_KEY, widgetLines(store, theme));
		ctx.ui.setStatus(STATUS_KEY, statusText(store, theme));
	};

	const run = async (ctx: ExtensionContext, definitions: CheckDefinition[]): Promise<CheckResult[]> => {
		const previous = store.results;
		controller?.abort();
		const token = ++runToken;
		const abort = new AbortController();
		controller = abort;
		store.results = seedResults(definitions);
		store.running = true;
		store.lastRunAt = null;
		paint(ctx);

		const executor: CheckExecutor = (command, args, options) => pi.exec(command, args, options);
		const results = await runChecks(definitions, executor, {
			cwd: ctx.cwd,
			signal: abort.signal,
			onUpdate: (results) => {
				if (token !== runToken) return;
				store.results = results;
				paint(ctx);
			},
		});
		if (token !== runToken) return results;
		store.results = results;
		store.running = false;
		store.lastRunAt = Date.now();
		paint(ctx);

		const notice = changeNotice(previous, results);
		if (notice !== undefined) pendingNotice = notice;
		return results;
	};

	pi.on("session_start", (_event, ctx) => {
		void run(ctx, loadChecksConfig(ctx.cwd));
	});

	pi.on("before_agent_start", () => {
		if (pendingNotice === undefined) return undefined;
		const content = pendingNotice;
		pendingNotice = undefined;
		return { message: { customType: WIDGET_KEY, content, display: true } };
	});

	pi.on("session_shutdown", (_event, ctx) => {
		runToken++;
		controller?.abort();
		controller = undefined;
		store.results = [];
		store.running = false;
		store.lastRunAt = null;
		pendingNotice = undefined;
		if (ctx.hasUI) {
			ctx.ui.setWidget(WIDGET_KEY, undefined);
			ctx.ui.setStatus(STATUS_KEY, undefined);
		}
	});

	pi.registerCommand(COMMAND_NAME, {
		description: "Re-run every environment check and show the results",
		handler: async (args, ctx) => {
			const argument = args.trim();
			if (argument !== "" && argument !== "run") {
				ctx.ui.notify("Usage: /checks", "info");
				return;
			}
			await run(ctx, loadChecksConfig(ctx.cwd));
			ctx.ui.notify(reportText(store), reportType(store));
		},
	});
}
