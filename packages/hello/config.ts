import {
	configPath,
	type GuidanceFields,
	loadJsonConfigWithLegacyFallback,
	validateGuidanceFields,
} from "@pidev/config";

/** Directory name under the XDG config root (`~/.config/pidev-hello/config.json`). */
export const CONFIG_NAME = "pidev-hello";

export interface NoteConfig {
	guidance?: GuidanceFields;
}

/**
 * Load config with crash-resistant defaults. `loadJsonConfigWithLegacyFallback`
 * prefers the XDG path and falls back to the legacy location — a present but
 * malformed XDG file warns and returns `{}` rather than silently reading legacy.
 */
export function loadConfig(): NoteConfig {
	const raw = loadJsonConfigWithLegacyFallback<NoteConfig>(CONFIG_NAME);
	return { guidance: validateGuidanceFields(raw.guidance) };
}

/** Re-exported so tests (and the README) share one path-resolution entry point. */
export { configPath };
