export type ResourcePaginationToken =
  | { kind: "page"; pageIndex: number }
  | { kind: "ellipsis"; position: "start" | "end" }
  | { kind: "open-ended" };

export interface ResourcePaginationInput {
  count: number;
  hasNextPage?: boolean;
  hasPreviousPage?: boolean;
  pageIndex: number;
  pageSize: number;
}

export interface ResourcePaginationModel {
  canGoNext: boolean;
  canGoPrevious: boolean;
  end: number;
  hasOpenEndedNext: boolean;
  minimumTotalCount: number;
  pageIndex: number;
  start: number;
  tokens: readonly ResourcePaginationToken[];
  totalPages: number;
}

function buildKnownTotalPageTokens(
  pageIndex: number,
  totalPages: number,
): ResourcePaginationToken[] {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, index) => ({
      kind: "page" as const,
      pageIndex: index,
    }));
  }

  const edgeWindowSize = 5;
  const pages = new Set<number>([0, totalPages - 1]);

  if (pageIndex <= 3) {
    Array.from({ length: edgeWindowSize }, (_, index) => index).forEach((page) => pages.add(page));
  } else if (pageIndex >= totalPages - 4) {
    Array.from(
      { length: edgeWindowSize },
      (_, index) => totalPages - edgeWindowSize + index,
    ).forEach((page) => pages.add(page));
  } else {
    [pageIndex - 1, pageIndex, pageIndex + 1].forEach((page) => pages.add(page));
  }

  const visiblePages = [...pages]
    .filter((page) => page >= 0 && page < totalPages)
    .sort((left, right) => left - right);
  const tokens: ResourcePaginationToken[] = [];

  visiblePages.forEach((page, index) => {
    const previousPage = visiblePages[index - 1];

    if (previousPage !== undefined && page - previousPage > 1) {
      if (page - previousPage === 2) {
        tokens.push({ kind: "page", pageIndex: previousPage + 1 });
      } else {
        tokens.push({ kind: "ellipsis", position: "end" });
      }
    }

    tokens.push({ kind: "page", pageIndex: page });
  });

  return tokens;
}

function buildOpenEndedPageTokens(pageIndex: number): ResourcePaginationToken[] {
  const lastKnownPage = pageIndex + 1;
  const start = Math.max(0, lastKnownPage - 4);
  const pages = Array.from(
    { length: lastKnownPage - start + 1 },
    (_, index) => start + index,
  );
  const tokens: ResourcePaginationToken[] = [];

  if (start > 0) {
    tokens.push({ kind: "page", pageIndex: 0 });

    if (start > 1) {
      tokens.push({ kind: "ellipsis", position: "start" });
    }
  }

  pages.forEach((page) => tokens.push({ kind: "page", pageIndex: page }));
  tokens.push({ kind: "open-ended" });
  return tokens;
}

export function createResourcePaginationModel(
  input: ResourcePaginationInput,
): ResourcePaginationModel {
  if (!Number.isInteger(input.pageIndex) || input.pageIndex < 0) {
    throw new Error("Resource page index must be a non-negative integer.");
  }

  if (!Number.isInteger(input.pageSize) || input.pageSize <= 0) {
    throw new Error("Resource page size must be a positive integer.");
  }

  if (!Number.isFinite(input.count) || input.count < 0) {
    throw new Error("Resource count must be a non-negative number.");
  }

  const exactTotalPages = Math.max(1, Math.ceil(input.count / input.pageSize));
  const totalPages = Math.max(
    exactTotalPages,
    input.hasNextPage ? input.pageIndex + 2 : input.pageIndex + 1,
  );
  const hasOpenEndedNext = Boolean(input.hasNextPage) && exactTotalPages <= input.pageIndex + 2;
  const nominalEnd = (input.pageIndex + 1) * input.pageSize;
  const start = input.count === 0 ? 0 : input.pageIndex * input.pageSize + 1;
  const end =
    input.count === 0
      ? 0
      : hasOpenEndedNext
        ? nominalEnd
        : Math.min(input.count, nominalEnd);

  return {
    canGoNext: input.hasNextPage ?? input.pageIndex < totalPages - 1,
    canGoPrevious: input.hasPreviousPage ?? input.pageIndex > 0,
    end,
    hasOpenEndedNext,
    minimumTotalCount: hasOpenEndedNext ? Math.max(input.count, nominalEnd + 1) : input.count,
    pageIndex: input.pageIndex,
    start,
    tokens: hasOpenEndedNext
      ? buildOpenEndedPageTokens(input.pageIndex)
      : buildKnownTotalPageTokens(input.pageIndex, totalPages),
    totalPages,
  };
}
