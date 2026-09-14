export type CommandCenterApplicationShellPhase = "startup" | "ready";
export type CommandCenterNavigationDepth = 0 | 1 | 2;

export type CommandCenterApplicationShellViolationCode =
  | "child-top-navigation"
  | "navigation-depth"
  | "navigation-root-count"
  | "ready-content"
  | "startup-content"
  | "startup-status";

export interface CommandCenterApplicationShellViolation {
  code: CommandCenterApplicationShellViolationCode;
  message: string;
}

export interface CommandCenterApplicationShellMeasurements {
  applicationPageCount: number;
  navigationDepths: number[];
  navigationRootCount: number;
  topNavigationCount: number;
  viewportStatusCount: number;
}

export interface CommandCenterApplicationShellReport {
  measurements: CommandCenterApplicationShellMeasurements;
  navigationDepth: CommandCenterNavigationDepth;
  ok: boolean;
  phase: CommandCenterApplicationShellPhase;
  violations: CommandCenterApplicationShellViolation[];
}

export interface VerifyCommandCenterApplicationShellOptions {
  navigationDepth: CommandCenterNavigationDepth;
  phase: CommandCenterApplicationShellPhase;
  /** Limits verification to one embedded application root. Defaults to `body`. */
  rootSelector?: string;
}

/** The browser-driver surface required by the application-shell verifier. */
export interface CommandCenterApplicationShellBrowserPage {
  evaluate<Result, Argument>(
    pageFunction: (argument: Argument) => Result | Promise<Result>,
    argument: Argument,
  ): Promise<Result>;
}

interface ResolvedApplicationShellOptions {
  navigationDepth: CommandCenterNavigationDepth;
  phase: CommandCenterApplicationShellPhase;
  rootSelector: string;
}

function resolveOptions(
  options: VerifyCommandCenterApplicationShellOptions,
): ResolvedApplicationShellOptions {
  const rootSelector = options.rootSelector?.trim() || "body";

  if (![0, 1, 2].includes(options.navigationDepth)) {
    throw new RangeError("navigationDepth must be 0, 1, or 2.");
  }
  if (options.phase !== "startup" && options.phase !== "ready") {
    throw new RangeError('phase must be "startup" or "ready".');
  }

  return {
    navigationDepth: options.navigationDepth,
    phase: options.phase,
    rootSelector,
  };
}

export function formatCommandCenterApplicationShellViolations(
  report: CommandCenterApplicationShellReport,
) {
  if (report.ok) {
    return `Command Center application shell conforms in the ${report.phase} phase.`;
  }

  return report.violations
    .map((violation) => `${violation.code}: ${violation.message}`)
    .join("\n");
}

export class CommandCenterApplicationShellError extends Error {
  readonly report: CommandCenterApplicationShellReport;

  constructor(report: CommandCenterApplicationShellReport) {
    super(formatCommandCenterApplicationShellViolations(report));
    this.name = "CommandCenterApplicationShellError";
    this.report = report;
  }
}

/**
 * Verifies the canonical embedded application shell in a Playwright-compatible page.
 * Startup must show only one viewport status screen; ready state must use exactly the declared
 * navigation depth. Child-owned top navigation is forbidden in both phases.
 */
export async function verifyCommandCenterApplicationShell(
  page: CommandCenterApplicationShellBrowserPage,
  options: VerifyCommandCenterApplicationShellOptions,
): Promise<CommandCenterApplicationShellReport> {
  const resolved = resolveOptions(options);

  return page.evaluate((input: ResolvedApplicationShellOptions) => {
    const root = document.querySelector<HTMLElement>(input.rootSelector);
    if (!root) {
      return {
        measurements: {
          applicationPageCount: 0,
          navigationDepths: [],
          navigationRootCount: 0,
          topNavigationCount: 0,
          viewportStatusCount: 0,
        },
        navigationDepth: input.navigationDepth,
        ok: false,
        phase: input.phase,
        violations: [{
          code: "navigation-root-count" as const,
          message: `Application root ${input.rootSelector} was not found.`,
        }],
      };
    }

    function allMatches(selector: string) {
      return [
        ...(root!.matches(selector) ? [root!] : []),
        ...Array.from(root!.querySelectorAll<HTMLElement>(selector)),
      ];
    }

    const navigationRoots = allMatches("[data-cc-navigation-depth]");
    const navigationDepths = navigationRoots
      .map((element) => Number(element.dataset.ccNavigationDepth))
      .filter((depth) => Number.isFinite(depth));
    const topNavigationCount = allMatches('[data-theme-chrome="topbar"]').length;
    const viewportStatusCount = allMatches(
      '[data-cc-application-status-screen][data-variant="viewport"]',
    ).length;
    const applicationPageCount = allMatches("[data-cc-application-page]").length;
    const violations: CommandCenterApplicationShellViolation[] = [];

    if (topNavigationCount > 0) {
      violations.push({
        code: "child-top-navigation",
        message: "Embedded applications must not render a child top navigation bar; the host owns global chrome.",
      });
    }

    if (input.phase === "startup") {
      if (viewportStatusCount !== 1) {
        violations.push({
          code: "startup-status",
          message: `Startup requires exactly one viewport ApplicationStatusScreen; found ${viewportStatusCount}.`,
        });
      }
      if (navigationRoots.length > 0 || applicationPageCount > 0) {
        violations.push({
          code: "startup-content",
          message: "Navigation and route content must remain unmounted until host, transport, and API readiness complete.",
        });
      }
    } else {
      if (viewportStatusCount > 0) {
        violations.push({
          code: "startup-status",
          message: "The viewport startup status screen must be unmounted after readiness completes.",
        });
      }
      if (applicationPageCount !== 1) {
        violations.push({
          code: "ready-content",
          message: `Ready state requires exactly one ApplicationPage route root; found ${applicationPageCount}.`,
        });
      }

      const expectedRootCount = input.navigationDepth === 0 ? 0 : 1;
      if (navigationRoots.length !== expectedRootCount) {
        violations.push({
          code: "navigation-root-count",
          message: `Navigation depth ${input.navigationDepth} requires ${expectedRootCount} shell root(s); found ${navigationRoots.length}.`,
        });
      }
      if (
        navigationRoots.length > 0 &&
        (navigationDepths.length !== navigationRoots.length ||
          navigationDepths.some((depth) => depth !== input.navigationDepth))
      ) {
        violations.push({
          code: "navigation-depth",
          message: `Ready navigation must use only depth ${input.navigationDepth}; found ${navigationDepths.join(", ") || "invalid markers"}.`,
        });
      }
    }

    return {
      measurements: {
        applicationPageCount,
        navigationDepths,
        navigationRootCount: navigationRoots.length,
        topNavigationCount,
        viewportStatusCount,
      },
      navigationDepth: input.navigationDepth,
      ok: violations.length === 0,
      phase: input.phase,
      violations,
    };
  }, resolved);
}

export async function assertCommandCenterApplicationShell(
  page: CommandCenterApplicationShellBrowserPage,
  options: VerifyCommandCenterApplicationShellOptions,
) {
  const report = await verifyCommandCenterApplicationShell(page, options);
  if (!report.ok) throw new CommandCenterApplicationShellError(report);
  return report;
}
