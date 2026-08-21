import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResourceIconLabelCell, ResourceStatusCell } from "./ResourceCells.js";

describe("ResourceCells", () => {
  it("composes an application-provided icon and values using the standard cell layout", () => {
    const html = renderToStaticMarkup(
      <ResourceIconLabelCell
        icon={<svg data-testid="source-icon" />}
        iconVariant="framed"
        label="Warehouse"
        meta="UID source-1"
        trailing={<svg data-testid="open-indicator" />}
      />,
    );

    expect(html).toContain("cc-resource-icon-label-cell__icon--framed");
    expect(html).toContain("source-icon");
    expect(html).toContain("Warehouse");
    expect(html).toContain("UID source-1");
    expect(html).toContain("open-indicator");
  });

  it("renders a semantic visual tone without defining resource-specific statuses", () => {
    const html = renderToStaticMarkup(
      <ResourceStatusCell label="Available" tone="success" />,
    );

    expect(html).toContain("cc-resource-status-cell--success");
    expect(html).toContain("Available");
  });
});
