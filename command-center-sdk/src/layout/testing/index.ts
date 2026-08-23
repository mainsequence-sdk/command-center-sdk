export interface CommandCenterLayoutViewport {
  height: number;
  width: number;
}

export const COMMAND_CENTER_LAYOUT_VIEWPORTS = [
  { width: 375, height: 812 },
  { width: 768, height: 900 },
  { width: 1280, height: 800 },
] as const satisfies readonly CommandCenterLayoutViewport[];

export type CommandCenterPageLayoutViolationCode =
  | "card-inset"
  | "grid-collapse"
  | "grid-overflow"
  | "grid-overlap"
  | "header-overflow"
  | "header-overlap"
  | "horizontal-overflow"
  | "interactive-clipping"
  | "interactive-size"
  | "page-root-count"
  | "stack-gap";

export interface CommandCenterPageLayoutViolation {
  code: CommandCenterPageLayoutViolationCode;
  element?: string;
  message: string;
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
  violations: CommandCenterPageLayoutViolation[];
  viewport: CommandCenterLayoutViewport;
}

export interface CommandCenterPageLayoutReport {
  ok: boolean;
  reports: CommandCenterPageLayoutViewportReport[];
  violations: CommandCenterPageLayoutViolation[];
}

export interface VerifyCommandCenterPageLayoutOptions {
  minimumCardInsetPx?: number;
  minimumSectionGapPx?: number;
  rootSelector?: string;
  tolerancePx?: number;
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
  minimumCardInsetPx: number;
  minimumSectionGapPx: number;
  rootSelector: string;
  tolerancePx: number;
}

function resolveOptions(
  options: VerifyCommandCenterPageLayoutOptions,
): ResolvedVerificationOptions {
  const resolved = {
    minimumCardInsetPx: options.minimumCardInsetPx ?? 12,
    minimumSectionGapPx: options.minimumSectionGapPx ?? 12,
    rootSelector: options.rootSelector ?? "[data-cc-application-page]",
    tolerancePx: options.tolerancePx ?? 1,
  };

  if (!resolved.rootSelector.trim()) {
    throw new RangeError("rootSelector must not be empty.");
  }
  for (const [name, value] of [
    ["minimumCardInsetPx", resolved.minimumCardInsetPx],
    ["minimumSectionGapPx", resolved.minimumSectionGapPx],
    ["tolerancePx", resolved.tolerancePx],
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
      const viewport = `${violation.viewport.width}x${violation.viewport.height}`;
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
  }

  const originalViewport = page.viewportSize?.() ?? null;
  try {
    for (const viewport of viewports) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      const report = await page.evaluate(
      (input: ResolvedVerificationOptions & { viewport: CommandCenterLayoutViewport }) => {
        const violations: CommandCenterPageLayoutViolation[] = [];
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

        function addViolation(
          code: CommandCenterPageLayoutViolationCode,
          message: string,
          element?: Element,
        ) {
          violations.push({
            code,
            ...(element ? { element: describeElement(element) } : {}),
            message,
            viewport: input.viewport,
          });
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
          viewport: input.viewport,
        };
      },
      { ...resolved, viewport: { width: viewport.width, height: viewport.height } },
    );
      reports.push(report);
    }
  } finally {
    if (originalViewport) await page.setViewportSize(originalViewport);
  }

  const violations = reports.flatMap((report) => report.violations);
  return { ok: violations.length === 0, reports, violations };
}

export async function assertCommandCenterPageLayout(
  page: CommandCenterLayoutBrowserPage,
  options: VerifyCommandCenterPageLayoutOptions = {},
) {
  const report = await verifyCommandCenterPageLayout(page, options);
  if (!report.ok) throw new CommandCenterPageLayoutError(report);
  return report;
}
