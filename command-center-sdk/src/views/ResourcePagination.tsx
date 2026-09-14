import type { ReactNode } from "react";

import { useCommandCenterViewport } from "../layout/viewport.js";
import { createResourcePaginationModel } from "../resource/pagination.js";

/** `full` renders page tokens; `compact` renders previous, next, and a page summary only. */
export type ResourcePaginationPresentation = "auto" | "compact" | "full";

export interface ResourcePaginationProps {
  count: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  itemLabel?: string;
  pageIndex: number;
  pageSize: number;
  /** `auto` resolves to `compact` below the `sm` breakpoint. */
  presentation?: ResourcePaginationPresentation;
  onPageChange: (pageIndex: number) => void;
}

function PaginationArrow({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden="true"
      className="cc-resource-pagination__arrow"
      viewBox="0 0 24 24"
    >
      <path
        d={direction === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

export function ResourcePagination({
  count,
  hasNextPage,
  hasPreviousPage,
  itemLabel = "results",
  pageIndex,
  pageSize,
  presentation = "full",
  onPageChange,
}: ResourcePaginationProps) {
  const viewport = useCommandCenterViewport();
  const compact = presentation === "compact" ||
    (presentation === "auto" && viewport.breakpoint === "xs");
  const model = createResourcePaginationModel({
    count,
    hasNextPage,
    hasPreviousPage,
    pageIndex,
    pageSize,
  });

  if (model.totalPages <= 1 && !hasNextPage && pageIndex === 0) {
    return null;
  }

  const goToPage = (targetPageIndex: number) => {
    const maxPageIndex = model.hasOpenEndedNext ? model.pageIndex + 1 : model.totalPages - 1;
    const normalizedPageIndex = Math.max(0, Math.min(targetPageIndex, maxPageIndex));

    if (normalizedPageIndex !== model.pageIndex) {
      onPageChange(normalizedPageIndex);
    }
  };
  const summary: ReactNode =
    count === 0
      ? `No ${itemLabel}`
      : `${model.start}-${model.end} of ${
          model.hasOpenEndedNext ? `at least ${model.minimumTotalCount}` : count
        } ${itemLabel}`;
  const pageSummary = model.hasOpenEndedNext
    ? `Page ${model.pageIndex + 1}`
    : `Page ${model.pageIndex + 1} of ${Math.max(model.totalPages, 1)}`;

  return (
    <nav
      aria-label={`${itemLabel} pagination`}
      className={`cc-resource-pagination${compact ? " cc-resource-pagination--compact" : ""}`}
      data-cc-presentation={compact ? "compact" : "full"}
    >
      <div className="cc-resource-pagination__summary">{summary}</div>
      <div className="cc-resource-pagination__controls">
        <button
          type="button"
          className="cc-resource-pagination__button cc-resource-pagination__button--direction"
          disabled={!model.canGoPrevious}
          onClick={() => goToPage(model.pageIndex - 1)}
        >
          <PaginationArrow direction="left" />
          Previous
        </button>
        {compact ? (
          <span aria-current="page" className="cc-resource-pagination__page-summary">
            {pageSummary}
          </span>
        ) : model.tokens.map((token, index) => {
          if (token.kind !== "page") {
            return (
              <span
                key={`${token.kind}-${token.kind === "ellipsis" ? token.position : "next"}-${index}`}
                aria-label={token.kind === "open-ended" ? "More pages available" : "Skipped pages"}
                className="cc-resource-pagination__ellipsis"
              >
                ...
              </span>
            );
          }

          const active = token.pageIndex === model.pageIndex;

          return (
            <button
              key={token.pageIndex}
              type="button"
              aria-current={active ? "page" : undefined}
              className={`cc-resource-pagination__button${active ? " cc-resource-pagination__button--active" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                goToPage(token.pageIndex);
              }}
            >
              {token.pageIndex + 1}
            </button>
          );
        })}
        <button
          type="button"
          className="cc-resource-pagination__button cc-resource-pagination__button--direction"
          disabled={!model.canGoNext}
          onClick={() => goToPage(model.pageIndex + 1)}
        >
          Next
          <PaginationArrow direction="right" />
        </button>
      </div>
    </nav>
  );
}
