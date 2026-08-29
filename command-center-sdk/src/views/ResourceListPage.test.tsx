import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import type { ResourceApplicationDefinition } from "../resource/types.js";
import { ResourceListPage, type ResourcePrimaryAction } from "./ResourceListPage.js";

type Project = { name: string; uid: string };

const pageInfo = {
  pageIndex: 0,
  pageSize: 25,
  totalItems: 1,
  hasNextPage: false,
  hasPreviousPage: false,
};

const definition: ResourceApplicationDefinition<Project, string> = {
  id: "projects",
  label: "Projects",
  description: "Reusable project registry",
  getId: (project) => project.uid,
  adapter: {
    list: async () => ({ items: [{ name: "Alpha", uid: "project-1" }], pageInfo }),
  },
  columns: [
    {
      id: "name",
      header: "Name",
      getValue: (project) => project.name,
      sortableKey: "name",
    },
  ],
};

function render(primaryActions: readonly ResourcePrimaryAction[]) {
  return renderToStaticMarkup(
    <ResourceListPage
      definition={definition}
      initialResult={{ items: [{ name: "Alpha", uid: "project-1" }], pageInfo }}
      primaryActions={primaryActions}
    />,
  );
}

describe("ResourceListPage", () => {
  it("renders zero, one, or multiple primary actions without changing the list shell", () => {
    const none = render([]);
    const one = render([{ id: "create", label: "Create project", onSelect: () => undefined }]);
    const multiple = render([
      { id: "create", label: "Create project", onSelect: () => undefined },
      { id: "import", label: "Import", onSelect: () => undefined },
    ]);

    for (const html of [none, one, multiple]) {
      expect(html).toContain("cc-resource-toolbar");
      expect(html).toContain("cc-data-table");
      expect(html).toContain("Search projects");
    }
    expect(none).not.toContain("Create project");
    expect(one).toContain("Create project");
    expect(multiple).toContain("Create project");
    expect(multiple).toContain("Import");
  });

  it("keeps filters and narrow accessories in the standard toolbar order", () => {
    const html = renderToStaticMarkup(
      <ResourceListPage
        definition={definition}
        filterControls={<span>Custom filter</span>}
        headerAccessory={<span>Header accessory</span>}
        initialResult={{ items: [{ name: "Alpha", uid: "project-1" }], pageInfo }}
        toolbarLeading={<span>Leading accessory</span>}
        toolbarTrailing={<span>Trailing accessory</span>}
      />,
    );

    expect(html.indexOf("Header accessory")).toBeLessThan(html.indexOf("cc-resource-list-page__card"));
    expect(html.indexOf("Leading accessory")).toBeLessThan(html.indexOf("Search projects"));
    expect(html.indexOf("Search projects")).toBeLessThan(html.indexOf("Custom filter"));
    expect(html.indexOf("Custom filter")).toBeLessThan(html.indexOf("Trailing accessory"));
    expect(html).not.toContain("renderToolbar");
  });

  it("places the standard refresh control after collection filters", () => {
    const html = renderToStaticMarkup(
      <ResourceListPage
        definition={definition}
        initialResult={{ items: [{ name: "Alpha", uid: "project-1" }], pageInfo }}
        refreshable
      />,
    );

    expect(html).toContain(">Refresh</button>");
    expect(html.indexOf("Search projects")).toBeLessThan(html.indexOf(">Refresh</button>"));
  });

  it("renders standard select filters as accessible single-row toolbar controls", () => {
    const html = renderToStaticMarkup(
      <ResourceListPage
        definition={definition}
        filterDefinitions={[
          {
            id: "namespace",
            label: "Namespace",
            value: "",
            options: [{ label: "All namespaces", value: "" }],
            onChange: () => undefined,
          },
        ]}
        initialResult={{ items: [{ name: "Alpha", uid: "project-1" }], pageInfo }}
      />,
    );

    expect(html).toContain("cc-resource-toolbar__filters");
    expect(html).toContain('<span class="cc-resource-visually-hidden">Namespace</span>');
    expect(html).toContain('aria-label="Namespace"');
    expect(html).toContain('aria-haspopup="listbox"');
    expect(html).toContain("All namespaces");
    expect(html).not.toContain("<select");
  });

  it("treats discovery filters as metadata and renders only the primary search", () => {
    const html = renderToStaticMarkup(
      <ResourceListPage
        definition={definition}
        initialResult={{
          items: [{ name: "Alpha", uid: "project-1" }],
          pageInfo,
          controls: {
            search: { placeholder: "Search by code repository name or UID", fields: ["name", "uid"] },
            filters: [
              { key: "code_repository_name__contains", label: "Code repository name", type: "text" },
              { key: "archived", label: "Archived", type: "boolean" },
              { key: "labels__contains", label: "Label", type: "text" },
            ],
            ordering: [],
          },
        }}
      />,
    );

    expect(html).toContain('placeholder="Search by code repository name or UID"');
    expect(html).not.toContain('aria-label="Code repository name"');
    expect(html).not.toContain('aria-label="Archived"');
    expect(html).not.toContain('aria-label="Label"');
    expect(html).not.toContain("cc-resource-toolbar__filters");
  });

  it("keeps primary actions visible when selection actions are present", () => {
    const html = renderToStaticMarkup(
      <ResourceListPage
        definition={definition}
        initialBulkActions={[
          {
            id: "delete",
            label: "Delete selected",
            endpoint: "/code-repositories/bulk-delete/",
            method: "POST",
            selection_modes: ["explicit"],
            options: [],
          },
        ]}
        initialResult={{ items: [{ name: "Alpha", uid: "project-1" }], pageInfo }}
        initialSelectedIds={["project-1"]}
        primaryActions={[{ id: "create", label: "Create project", onSelect: () => undefined }]}
      />,
    );

    expect(html).toContain("Create project");
    expect(html).toContain("Actions");
    expect(html).not.toContain("Delete selected");
    expect(html.indexOf("Create project")).toBeLessThan(html.indexOf("Actions"));
  });
});
