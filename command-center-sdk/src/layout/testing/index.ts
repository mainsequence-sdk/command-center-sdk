export type CommandCenterLayoutPointer = "coarse" | "fine";

export interface CommandCenterLayoutViewport {
  height: number;
  /**
   * The primary pointer the page will meet at this size. Touch rules run only for `coarse`
   * entries. The verifier cannot switch a browser context's touch emulation; configure
   * `hasTouch`/`isMobile` on the driver for coarse entries when emulation matters.
   */
  pointer?: CommandCenterLayoutPointer;
  width: number;
}

/** The mobile breakpoint below which text inputs must stay at the zoom-safe font size. */
const MOBILE_BREAKPOINT_PX = 768;

export const COMMAND_CENTER_LAYOUT_VIEWPORTS = [
  { width: 320, height: 568, pointer: "coarse" },
  { width: 375, height: 812, pointer: "coarse" },
  { width: 812, height: 375, pointer: "coarse" },
  { width: 768, height: 1024, pointer: "coarse" },
  { width: 1024, height: 768, pointer: "fine" },
  { width: 1280, height: 800, pointer: "fine" },
] as const satisfies readonly CommandCenterLayoutViewport[];

export type CommandCenterPageLayoutViolationCode =
  | "card-inset"
  | "grid-collapse"
  | "grid-overflow"
  | "grid-overlap"
  | "header-overflow"
  | "header-overlap"
  | "horizontal-overflow"
  | "input-zoom"
  | "interactive-clipping"
  | "interactive-size"
  | "page-root-count"
  | "stack-gap"
  | "sticky-hover"
  | "touch-target";

export type CommandCenterPageLayoutSeverity = "error" | "warning";

export interface CommandCenterPageLayoutViolation {
  code: CommandCenterPageLayoutViolationCode;
  element?: string;
  message: string;
  /** `error` fails the report; `warning` is reported but does not affect `ok`. */
  severity: CommandCenterPageLayoutSeverity;
  viewport: CommandCenterLayoutViewport;
}

export interface CommandCenterPageLayoutMeasurements {
  cardCount: number;
  cardGridCount: number;
  documentClientWidth: number;
  documentScrollWidth: number;
  headerCount: number;
  interactiveElementCount: number;
  pageRootCount: number;
  stackCount: number;
}

export interface CommandCenterPageLayoutViewportReport {
  measurements: CommandCenterPageLayoutMeasurements;
  ok: boolean;
  /** Error-severity findings. */
  violations: CommandCenterPageLayoutViolation[];
  /** Warning-severity findings; they never change `ok`. */
  warnings: CommandCenterPageLayoutViolation[];
  viewport: CommandCenterLayoutViewport;
}

export interface CommandCenterPageLayoutReport {
  ok: boolean;
  reports: CommandCenterPageLayoutViewportReport[];
  violations: CommandCenterPageLayoutViolation[];
  warnings: CommandCenterPageLayoutViolation[];
}

export interface VerifyCommandCenterPageLayoutOptions {
  /**
   * Report hover rules that are not guarded by a hover-capable media query at coarse-pointer
   * viewports. Reported as warnings because third-party stylesheets are outside the page author's
   * control. Default true.
   */
  checkStickyHover?: boolean;
  /** Minimum computed font size for text inputs below the mobile breakpoint. Default 16. */
  inputFontSizeMinimumPx?: number;
  minimumCardInsetPx?: number;
  minimumSectionGapPx?: number;
  rootSelector?: string;
  tolerancePx?: number;
  /** Touch targets below this size at a coarse-pointer viewport are errors. Default 24. */
  touchTargetFloorPx?: number;
  /** Touch targets below this size at a coarse-pointer viewport are warnings. Default 44. */
  touchTargetMinimumPx?: number;
  viewports?: readonly CommandCenterLayoutViewport[];
}

/**
 * The subset of a browser automation page required by the verifier. Playwright's Page is
 * structurally compatible; other drivers can expose the same two operations through an adapter.
 */
export interface CommandCenterLayoutBrowserPage {
  evaluate<Result, Argument>(
    pageFunction: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>;
  setViewportSize(viewport: CommandCenterLayoutViewport): Promise<void>;
  viewportSize?(): CommandCenterLayoutViewport | null;
}

interface ResolvedVerificationOptions {
  checkStickyHover: boolean;
  inputFontSizeMinimumPx: number;
  minimumCardInsetPx: number;
  minimumSectionGapPx: number;
  mobileBreakpointPx: number;
  rootSelector: string;
  tolerancePx: number;
  touchTargetFloorPx: number;
  touchTargetMinimumPx: number;
}

function resolveOptions(
  options: VerifyCommandCenterPageLayoutOptions,
): ResolvedVerificationOptions {
  const resolved = {
    checkStickyHover: options.checkStickyHover ?? true,
    inputFontSizeMinimumPx: options.inputFontSizeMinimumPx ?? 16,
    minimumCardInsetPx: options.minimumCardInsetPx ?? 12,
    minimumSectionGapPx: options.minimumSectionGapPx ?? 12,
    mobileBreakpointPx: MOBILE_BREAKPOINT_PX,
    rootSelector: options.rootSelector ?? "[data-cc-application-page]",
    tolerancePx: options.tolerancePx ?? 1,
    touchTargetFloorPx: options.touchTargetFloorPx ?? 24,
    touchTargetMinimumPx: options.touchTargetMinimumPx ?? 44,
  };

  if (!resolved.rootSelector.trim()) {
    throw new RangeError("rootSelector must not be empty.");
  }
  for (const [name, value] of [
    ["inputFontSizeMinimumPx", resolved.inputFontSizeMinimumPx],
    ["minimumCardInsetPx", resolved.minimumCardInsetPx],
    ["minimumSectionGapPx", resolved.minimumSectionGapPx],
    ["tolerancePx", resolved.tolerancePx],
    ["touchTargetFloorPx", resolved.touchTargetFloorPx],
    ["touchTargetMinimumPx", resolved.touchTargetMinimumPx],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new RangeError(`${name} must be a finite non-negative number.`);
    }
  }

  return resolved;
}

export function formatCommandCenterPageLayoutViolations(
  report: CommandCenterPageLayoutReport,
) {
  if (report.ok) return "Command Center page layout conforms at every tested viewport.";

  return report.violations
    .map((violation) => {
      const pointer = violation.viewport.pointer ? ` ${violation.viewport.pointer}` : "";
      const viewport = `${violation.viewport.width}x${violation.viewport.height}${pointer}`;
      const element = violation.element ? ` (${violation.element})` : "";
      return `[${viewport}] ${violation.code}${element}: ${violation.message}`;
    })
    .join("\n");
}

export class CommandCenterPageLayoutError extends Error {
  readonly report: CommandCenterPageLayoutReport;

  constructor(report: CommandCenterPageLayoutReport) {
    super(formatCommandCenterPageLayoutViolations(report));
    this.name = "CommandCenterPageLayoutError";
    this.report = report;
  }
}

export async function verifyCommandCenterPageLayout(
  page: CommandCenterLayoutBrowserPage,
  options: VerifyCommandCenterPageLayoutOptions = {},
): Promise<CommandCenterPageLayoutReport> {
  const resolved = resolveOptions(options);
  const viewports = options.viewports ?? COMMAND_CENTER_LAYOUT_VIEWPORTS;
  const reports: CommandCenterPageLayoutViewportReport[] = [];

  if (viewports.length === 0) {
    throw new RangeError("At least one layout verification viewport is required.");
  }
  for (const viewport of viewports) {
    if (
      !Number.isFinite(viewport.width) ||
      !Number.isFinite(viewport.height) ||
      viewport.width <= 0 ||
      viewport.height <= 0
    ) {
      throw new RangeError("Layout verification viewports require positive finite dimensions.");
    }
    if (
      viewport.pointer !== undefined &&
      viewport.pointer !== "coarse" &&
      viewport.pointer !== "fine"
    ) {
      throw new RangeError("Layout verification viewport pointer must be \"coarse\" or \"fine\".");
    }
  }

  const originalViewport = page.viewportSize?.() ?? null;
  try {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const report = await page.evaluate(
      (input: ResolvedVerificationOptions & { viewport: CommandCenterLayoutViewport }) => {
        const violations: CommandCenterPageLayoutViolation[] = [];
        const warnings: CommandCenterPageLayoutViolation[] = [];
        const coarsePointer = input.viewport.pointer === "coarse";
        const rootElements = Array.from(
          document.querySelectorAll<HTMLElement>(input.rootSelector),
        );
        const documentElement = document.documentElement;

        function describeElement(element: Element) {
          if (element.id) return `#${element.id}`;
          for (const attribute of [
            "data-cc-application-page",
            "data-cc-application-page-header",
            "data-cc-application-page-stack",
            "data-cc-application-card-grid",
            "data-cc-application-card",
          ]) {
            if (element.hasAttribute(attribute)) return `[${attribute}]`;
          }
          const className = typeof element.className === "string"
            ? element.className.trim().split(/\s+/u).filter(Boolean).slice(0, 2).join(".")
            : "";
          return `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
        }

        function addFinding(
          severity: CommandCenterPageLayoutSeverity,
          code: CommandCenterPageLayoutViolationCode,
          message: string,
          element?: Element | string,
        ) {
          const described = typeof element === "string"
            ? element
            : element ? describeElement(element) : undefined;
          (severity === "error" ? violations : warnings).push({
            code,
            ...(described ? { element: described } : {}),
            message,
            severity,
            viewport: input.viewport,
          });
        }

        function addViolation(
          code: CommandCenterPageLayoutViolationCode,
          message: string,
          element?: Element,
        ) {
          addFinding("error", code, message, element);
        }

        function isRendered(element: HTMLElement) {
          if (element.closest("[hidden], [aria-hidden='true']")) return false;
          let current: HTMLElement | null = element;
          while (current) {
            const style = getComputedStyle(current);
            if (
              style.display === "none" ||
              style.visibility === "hidden" ||
              style.visibility === "collapse"
            ) {
              return false;
            }
            current = current.parentElement;
          }
          return true;
        }

        function visibleChildren(element: HTMLElement) {
          return Array.from(element.children)
            .filter((child): child is HTMLElement => child instanceof HTMLElement)
            .filter(isRendered)
            .filter((child) => {
              const rect = child.getBoundingClientRect();
              return rect.width > input.tolerancePx || rect.height > input.tolerancePx;
            });
        }

        function resolveCssLength(element: HTMLElement, value: string) {
          if (!value.trim()) return 0;
          const probe = document.createElement("div");
          probe.style.position = "absolute";
          probe.style.visibility = "hidden";
          probe.style.width = value;
          element.append(probe);
          const pixels = probe.getBoundingClientRect().width;
          probe.remove();
          return pixels;
        }

        function hasScrollableAncestor(element: HTMLElement, boundary: HTMLElement) {
          let current = element.parentElement;
          while (current && current !== boundary) {
            const style = getComputedStyle(current);
            if (
              [style.overflow, style.overflowX, style.overflowY]
                .some((value) => value === "auto" || value === "scroll")
            ) {
              return true;
            }
            current = current.parentElement;
          }
          return false;
        }

        if (rootElements.length !== 1) {
          addViolation(
            "page-root-count",
            `Expected exactly one application page root; found ${rootElements.length}.`,
          );
        }

        if (
          documentElement.scrollWidth >
          documentElement.clientWidth + input.tolerancePx
        ) {
          addViolation(
            "horizontal-overflow",
            `The document is ${documentElement.scrollWidth - documentElement.clientWidth}px wider than its viewport.`,
          );
        }

        const root = rootElements[0];
        const stacks = root
          ? [
              root,
              ...Array.from(
                root.querySelectorAll<HTMLElement>("[data-cc-application-page-stack]"),
              ),
            ]
          : [];
        const cards = root
          ? Array.from(root.querySelectorAll<HTMLElement>("[data-cc-application-card]"))
          : [];
        const grids = root
          ? Array.from(root.querySelectorAll<HTMLElement>("[data-cc-application-card-grid]"))
          : [];
        const headers = root
          ? Array.from(root.querySelectorAll<HTMLElement>("[data-cc-application-page-header]"))
          : [];
        const interactiveElements = root
          ? Array.from(
              root.querySelectorAll<HTMLElement>(
                "a[href], button, input, select, textarea, [role='button'], [tabindex]:not([tabindex='-1'])",
              ),
            ).filter(isRendered)
          : [];

        if (root && root.scrollWidth > root.clientWidth + input.tolerancePx) {
          addViolation(
            "horizontal-overflow",
            `The application page is ${root.scrollWidth - root.clientWidth}px wider than its content box.`,
            root,
          );
        }

        for (const stack of stacks) {
          const children = visibleChildren(stack);
          if (children.length < 2) continue;
          const declaredGap = Number.parseFloat(getComputedStyle(stack).rowGap) || 0;
          const requiredGap = Math.max(input.minimumSectionGapPx, declaredGap);
          for (let index = 1; index < children.length; index += 1) {
            const previous = children[index - 1]!.getBoundingClientRect();
            const current = children[index]!.getBoundingClientRect();
            const effectiveGap = current.top - previous.bottom;
            if (effectiveGap + input.tolerancePx < requiredGap) {
              addViolation(
                "stack-gap",
                `Top-level siblings have ${effectiveGap.toFixed(1)}px separation; expected at least ${requiredGap.toFixed(1)}px.`,
                stack,
              );
              break;
            }
          }
        }

        for (const card of cards) {
          if (card.dataset.ccContentPadding === "none") continue;
          const content = card.querySelector<HTMLElement>(
            ":scope > [data-cc-application-card-content]",
          );
          if (!content) {
            addViolation(
              "card-inset",
              "A standard card is missing its stable content wrapper.",
              card,
            );
            continue;
          }
          const style = getComputedStyle(content);
          const insets = [
            Number.parseFloat(style.paddingTop) || 0,
            Number.parseFloat(style.paddingRight) || 0,
            Number.parseFloat(style.paddingBottom) || 0,
            Number.parseFloat(style.paddingLeft) || 0,
          ];
          const minimumInset = Math.min(...insets);
          if (minimumInset + input.tolerancePx < input.minimumCardInsetPx) {
            addViolation(
              "card-inset",
              `A standard card has ${minimumInset.toFixed(1)}px minimum content inset; expected at least ${input.minimumCardInsetPx}px.`,
              card,
            );
          }
        }

        for (const grid of grids) {
          const gridRect = grid.getBoundingClientRect();
          const gridStyle = getComputedStyle(grid);
          const gridCards = Array.from(
            grid.querySelectorAll<HTMLElement>(":scope > [data-cc-application-card]"),
          ).filter(isRendered);
          const rects = gridCards.map((card) => card.getBoundingClientRect());

          for (let index = 0; index < rects.length; index += 1) {
            const rect = rects[index]!;
            if (
              rect.left < gridRect.left - input.tolerancePx ||
              rect.right > gridRect.right + input.tolerancePx
            ) {
              addViolation(
                "grid-overflow",
                "A card escapes the horizontal bounds of its card grid.",
                gridCards[index],
              );
            }
            for (let otherIndex = index + 1; otherIndex < rects.length; otherIndex += 1) {
              const other = rects[otherIndex]!;
              const overlapWidth = Math.min(rect.right, other.right) - Math.max(rect.left, other.left);
              const overlapHeight = Math.min(rect.bottom, other.bottom) - Math.max(rect.top, other.top);
              if (
                overlapWidth > input.tolerancePx &&
                overlapHeight > input.tolerancePx
              ) {
                addViolation(
                  "grid-overlap",
                  "Two cards overlap inside the card grid.",
                  grid,
                );
              }
            }
          }

          const minimumWidth = resolveCssLength(
            grid,
            gridStyle.getPropertyValue("--application-card-min-width"),
          );
          const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
          const mustCollapse =
            minimumWidth > 0 &&
            gridRect.width + input.tolerancePx < minimumWidth * 2 + columnGap;
          if (mustCollapse) {
            const hasSharedRow = rects.some((rect, index) =>
              rects.slice(index + 1).some(
                (other) => Math.abs(rect.top - other.top) <= input.tolerancePx,
              ),
            );
            if (hasSharedRow) {
              addViolation(
                "grid-collapse",
                `Cards remain on the same row although the grid is narrower than two ${minimumWidth.toFixed(1)}px cards plus its gap.`,
                grid,
              );
            }
          }
        }

        for (const header of headers) {
          const intro = header.querySelector<HTMLElement>(
            ":scope > .cc-application-page-header__intro",
          );
          const actions = header.querySelector<HTMLElement>(
            ":scope > [data-cc-application-page-header-actions]",
          );
          if (!intro || !actions || !isRendered(actions)) continue;
          const headerRect = header.getBoundingClientRect();
          const introRect = intro.getBoundingClientRect();
          const actionsRect = actions.getBoundingClientRect();
          const overlapWidth = Math.min(introRect.right, actionsRect.right) - Math.max(introRect.left, actionsRect.left);
          const overlapHeight = Math.min(introRect.bottom, actionsRect.bottom) - Math.max(introRect.top, actionsRect.top);
          if (
            overlapWidth > input.tolerancePx &&
            overlapHeight > input.tolerancePx
          ) {
            addViolation(
              "header-overlap",
              "Page-header actions overlap the title and description region.",
              header,
            );
          }
          if (
            actionsRect.left < headerRect.left - input.tolerancePx ||
            actionsRect.right > headerRect.right + input.tolerancePx ||
            actionsRect.top < headerRect.top - input.tolerancePx ||
            actionsRect.bottom > headerRect.bottom + input.tolerancePx
          ) {
            addViolation(
              "header-overflow",
              "Page-header actions escape the header bounds.",
              actions,
            );
          }
        }

        if (root) {
          const rootRect = root.getBoundingClientRect();
          for (const interactive of interactiveElements) {
            const rect = interactive.getBoundingClientRect();
            if (
              rect.width <= input.tolerancePx ||
              rect.height <= input.tolerancePx
            ) {
              addViolation(
                "interactive-size",
                `A visible interactive element is only ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}px.`,
                interactive,
              );
              continue;
            }
            if (coarsePointer) {
              const inlineLink =
                interactive.tagName === "A" && getComputedStyle(interactive).display === "inline";
              const smallest = Math.min(rect.width, rect.height);
              if (!inlineLink && smallest + input.tolerancePx < input.touchTargetFloorPx) {
                addFinding(
                  "error",
                  "touch-target",
                  `A touch target is ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}px; the floor is ${input.touchTargetFloorPx}px.`,
                  interactive,
                );
              } else if (!inlineLink && smallest + input.tolerancePx < input.touchTargetMinimumPx) {
                addFinding(
                  "warning",
                  "touch-target",
                  `A touch target is ${rect.width.toFixed(1)}×${rect.height.toFixed(1)}px; ${input.touchTargetMinimumPx}px is recommended.`,
                  interactive,
                );
              }
            }
            const clipped =
              rect.left < rootRect.left - input.tolerancePx ||
              rect.right > rootRect.right + input.tolerancePx ||
              rect.top < rootRect.top - input.tolerancePx ||
              rect.bottom > rootRect.bottom + input.tolerancePx;
            if (clipped && !hasScrollableAncestor(interactive, root)) {
              addViolation(
                "interactive-clipping",
                "A visible interactive element escapes the application page without a scroll container.",
                interactive,
              );
            }
          }
        }

        if (root && input.viewport.width < input.mobileBreakpointPx) {
          const textInputs = Array.from(
            root.querySelectorAll<HTMLElement>(
              "input:not([type='button']):not([type='checkbox']):not([type='color']):not([type='file']):not([type='hidden']):not([type='image']):not([type='radio']):not([type='range']):not([type='reset']):not([type='submit']), select, textarea",
            ),
          ).filter(isRendered);
          for (const textInput of textInputs) {
            const fontSize = Number.parseFloat(getComputedStyle(textInput).fontSize) || 0;
            if (fontSize + input.tolerancePx < input.inputFontSizeMinimumPx) {
              addViolation(
                "input-zoom",
                `A text input renders at ${fontSize.toFixed(1)}px; mobile browsers zoom the page on focus below ${input.inputFontSizeMinimumPx}px.`,
                textInput,
              );
            }
          }
        }

        if (coarsePointer && input.checkStickyHover) {
          const hoverGuard = /hover:\s*hover/u;
          const reported = new Set<string>();
          function walkRules(rules: CSSRuleList, guarded: boolean) {
            for (const rule of Array.from(rules)) {
              if (rule instanceof CSSMediaRule) {
                walkRules(rule.cssRules, guarded || hoverGuard.test(rule.conditionText));
              } else if (
                typeof CSSSupportsRule !== "undefined" && rule instanceof CSSSupportsRule
              ) {
                walkRules(rule.cssRules, guarded);
              } else if (rule instanceof CSSStyleRule) {
                if (!guarded && rule.selectorText.includes(":hover") && !reported.has(rule.selectorText)) {
                  reported.add(rule.selectorText);
                  addFinding(
                    "warning",
                    "sticky-hover",
                    "A hover rule is not guarded by @media (hover: hover); touch leaves it applied after a tap.",
                    rule.selectorText,
                  );
                }
                if (rule.cssRules?.length) walkRules(rule.cssRules, guarded);
              }
            }
          }
          for (const sheet of Array.from(document.styleSheets)) {
            let rules: CSSRuleList | null = null;
            try {
              rules = sheet.cssRules;
            } catch {
              rules = null;
            }
            if (rules) walkRules(rules, false);
          }
        }

        const measurements: CommandCenterPageLayoutMeasurements = {
          cardCount: cards.length,
          cardGridCount: grids.length,
          documentClientWidth: documentElement.clientWidth,
          documentScrollWidth: documentElement.scrollWidth,
          headerCount: headers.length,
          interactiveElementCount: interactiveElements.length,
          pageRootCount: rootElements.length,
          stackCount: stacks.length,
        };

        return {
          measurements,
          ok: violations.length === 0,
          violations,
          warnings,
          viewport: input.viewport,
        };
      },
      {
        ...resolved,
        viewport: {
          width: viewport.width,
          height: viewport.height,
          ...(viewport.pointer ? { pointer: viewport.pointer } : {}),
        },
      },
    );
      reports.push(report);
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }

  const violations = reports.flatMap((report) => report.violations);
  const warnings = reports.flatMap((report) => report.warnings);
  return { ok: violations.length === 0, reports, violations, warnings };
}

export async function assertCommandCenterPageLayout(
  page: CommandCenterLayoutBrowserPage,
  options: VerifyCommandCenterPageLayoutOptions = {},
) {
  const report = await verifyCommandCenterPageLayout(page, options);
  if (!report.ok) throw new CommandCenterPageLayoutError(report);
  return report;
}
