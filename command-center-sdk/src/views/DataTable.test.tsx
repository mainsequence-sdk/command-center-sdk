import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { DataTable } from "./DataTable.js";

describe("DataTable", () => {
  it("omits row selection controls for resources that cannot participate in bulk actions", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={[{ id: "name", header: "Name", getValue: (row) => row.name }]}
        getId={(row) => row.id}
        isRowSelectable={(row) => row.selectable}
        isSelected={() => false}
        items={[
          { id: "selectable", name: "Selectable", selectable: true },
          { id: "read-only", name: "Read only", selectable: false },
        ]}
        onToggleAll={() => undefined}
        onToggleSelection={() => undefined}
      />,
    );

    expect(html).toContain("Select selectable");
    expect(html).not.toContain("Select read-only");
  });
});
