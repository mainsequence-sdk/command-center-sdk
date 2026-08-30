import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResourcePagination } from "./ResourcePagination.js";

describe("ResourcePagination", () => {
  it("renders accessible current-page state", () => {
    const html = renderToStaticMarkup(
      <ResourcePagination
        count={30}
        itemLabel="services"
        pageIndex={1}
        pageSize={10}
        onPageChange={() => undefined}
      />,
    );

    expect(html).toContain('aria-label="services pagination"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("11-20 of 30 services");
  });
});
