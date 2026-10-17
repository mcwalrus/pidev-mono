/**
 * @pidev/term-image — capture a tmux pane and render it to a PNG.
 *
 * Two seams keep this testable: `capture.ts` shells out to tmux behind an
 * injectable exec, and `render.ts` is a pure `ansi -> PNG buffer` function built
 * on `@xterm/headless` (cell grid) and `canvas` (raster). `cli.ts` wires them
 * together for an agent to run from a shell.
 */

export type { ExecFile, TmuxCapture } from "./capture.js";
export { captureTmuxPane } from "./capture.js";
export type { RenderedImage, RenderOptions } from "./render.js";
export { paletteColor, renderAnsiToPng } from "./render.js";
