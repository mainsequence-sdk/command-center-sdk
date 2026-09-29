import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ResourceTransferList } from "./ResourceTransferList.js";

const options = [
  { label: "Ada Lovelace", subtitle: "ada@example.test", value: "ada" },
  { label: "Grace Hopper", value: "grace" },
  { disabled: true, label: "Linus Torvalds", meta: "Admin", value: "linus" },
];

function openingTags(html: string, marker: string) {
  return (html.match(/<[a-z][^>]*>/gu) ?? []).filter((tag) => tag.includes(marker));
}

function attribute(tag: string, name: string) {
  const match = new RegExp(`\\s${name}="([^"]*)"`, "u").exec(tag);
  return match ? match[1]! : null;
}

describe("ResourceTransferList", () => {
  it("renders two named multi-select lists, one tab stop each, and named move buttons", () => {
    const html = renderToStaticMarkup(
      <ResourceTransferList
        description="Chosen users can view this object."
        itemLabel="users"
        onValueChange={() => undefined}
        options={options}
        value={["linus", "ghost"]}
      />,
    );

    const lists = openingTags(html, 'role="listbox"');
    expect(lists).toHaveLength(2);
    expect(lists.every((tag) => attribute(tag, "aria-multiselectable") === "true")).toBe(true);
    const labels = lists.map((tag) => attribute(tag, "aria-labelledby"));
    expect(html).toContain(`id="${labels[0]}"><span class="cc-resource-transfer__pane-label">Available users</span> <span class="cc-resource-transfer__count">(2)</span>`);
    expect(html).toContain(`id="${labels[1]}"><span class="cc-resource-transfer__pane-label">Selected users</span> <span class="cc-resource-transfer__count">(1)</span>`);
    const description = attribute(lists[0]!, "aria-describedby");
    expect(html).toContain(`id="${description}">Chosen users can view this object.</p>`);

    const optionsHtml = openingTags(html, 'role="option"');
    expect(optionsHtml.map((tag) => attribute(tag, "data-value"))).toEqual(["ada", "grace", "linus"]);
    expect(optionsHtml.map((tag) => attribute(tag, "tabindex"))).toEqual(["0", "-1", "0"]);
    expect(optionsHtml.map((tag) => attribute(tag, "aria-selected"))).toEqual(["false", "false", "false"]);
    expect(attribute(optionsHtml[2]!, "aria-disabled")).toBe("true");
    // A chosen value without an option is kept in the value and never drawn.
    expect(html).not.toContain("ghost");

    for (const name of ["Add selected users", "Add all shown users", "Remove selected users", "Remove all shown users"]) {
      expect(html).toContain(`aria-label="${name}"`);
    }
    expect(html).toContain('<label class="cc-label cc-resource-visually-hidden" data-cc-label="" for=');
    expect(html).toContain("Search available users");
    expect(html).toContain("Search selected users");
    expect(html).toContain('data-cc-presentation="columns"');
    expect(html).toContain('aria-live="polite"');
  });

  it("uses the empty messages and honors an explicit stacked presentation", () => {
    const html = renderToStaticMarkup(
      <ResourceTransferList
        emptySelectedMessage="Nobody yet."
        itemLabel="teams"
        onValueChange={() => undefined}
        options={[{ label: "Research", value: "research" }]}
        presentation="stacked"
        value={["research"]}
      />,
    );

    expect(html).toContain('data-cc-presentation="stacked"');
    expect(html).toContain("All teams are selected.");
    expect(html).not.toContain("Nobody yet.");
  });

  it("marks both lists busy while a change is saving", () => {
    const html = renderToStaticMarkup(
      <ResourceTransferList itemLabel="users" onValueChange={() => undefined} options={options} pending value={[]} />,
    );

    expect(openingTags(html, 'role="listbox"').every((tag) => attribute(tag, "aria-busy") === "true")).toBe(true);
    expect(openingTags(html, 'class="cc-resource-transfer"')[0]).toContain('data-pending="true"');
    expect(openingTags(html, 'aria-label="Add all shown users"').every((tag) => attribute(tag, "aria-disabled") === "true")).toBe(true);
    // Saving is not read only: options stay enabled.
    expect(openingTags(html, 'role="option"').map((tag) => attribute(tag, "aria-disabled"))).toEqual([null, null, "true"]);
  });

  it("marks every option inert when the list is read only", () => {
    const html = renderToStaticMarkup(
      <ResourceTransferList disabled itemLabel="users" onValueChange={() => undefined} options={options} value={[]} />,
    );

    expect(openingTags(html, 'role="option"').every((tag) => attribute(tag, "aria-disabled") === "true")).toBe(true);
    expect(openingTags(html, "aria-label=\"Add all shown users\"").every((tag) => attribute(tag, "aria-disabled") === "true")).toBe(true);
    expect(html).toContain('data-disabled="true"');
  });
});
