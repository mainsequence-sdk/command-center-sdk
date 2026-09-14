/**
 * The published viewport scale shared by every SDK stylesheet and the `/layout` viewport seam.
 *
 * Values are CSS pixels. A viewport narrower than `sm` is `xs`. SDK CSS expresses the same
 * boundaries as `@media (max-width: <value - 1>px)`; CSS media queries cannot read custom
 * properties, so this constant set is the contract rather than a variable.
 */
export const commandCenterBreakpoints = Object.freeze({
  sm: 640,
  md: 768,
  lg: 1024,
});

export type CommandCenterBreakpointName = keyof typeof commandCenterBreakpoints;
export type CommandCenterBreakpoint = "xs" | CommandCenterBreakpointName;

export const commandCenterBreakpointOrder: readonly CommandCenterBreakpoint[] = Object.freeze([
  "xs",
  "sm",
  "md",
  "lg",
]);

/** Resolve the breakpoint band a viewport width falls into. */
export function resolveCommandCenterBreakpoint(width: number): CommandCenterBreakpoint {
  if (!Number.isFinite(width) || width < commandCenterBreakpoints.sm) return "xs";
  if (width < commandCenterBreakpoints.md) return "sm";
  if (width < commandCenterBreakpoints.lg) return "md";
  return "lg";
}

/** True when `breakpoint` is at least as wide as `minimum` on the published scale. */
export function isCommandCenterBreakpointAtLeast(
  breakpoint: CommandCenterBreakpoint,
  minimum: CommandCenterBreakpoint,
) {
  return (
    commandCenterBreakpointOrder.indexOf(breakpoint) >=
    commandCenterBreakpointOrder.indexOf(minimum)
  );
}
