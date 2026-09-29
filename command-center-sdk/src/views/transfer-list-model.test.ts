import { describe, expect, it } from "vitest";

import { matchesOptionQuery, normalizeOptionQuery } from "./option-search.js";
import {
  addToTransferSelection,
  removeFromTransferSelection,
  splitTransferOptions,
} from "./transfer-list-model.js";

const options = [
  { label: "Ada", value: "ada" },
  { label: "Grace", value: "grace" },
  { disabled: true, label: "Linus", value: "linus" },
  { label: "Margaret", value: "margaret" },
];

describe("splitTransferOptions", () => {
  it("lists unchosen options in option order and chosen options in value order", () => {
    const panes = splitTransferOptions(options, ["margaret", "ada"]);

    expect(panes.available.map((option) => option.value)).toEqual(["grace", "linus"]);
    expect(panes.selected.map((option) => option.value)).toEqual(["margaret", "ada"]);
  });

  it("does not list chosen values that have no option, and ignores duplicates", () => {
    const panes = splitTransferOptions([...options, { label: "Ada again", value: "ada" }], ["ghost", "ada", "ada"]);

    expect(panes.selected.map((option) => option.label)).toEqual(["Ada"]);
    expect(panes.available.map((option) => option.value)).toEqual(["grace", "linus", "margaret"]);
  });
});

describe("addToTransferSelection", () => {
  it("appends in option order and reports what was added", () => {
    const result = addToTransferSelection(options, ["grace"], ["margaret", "ada"]);

    expect(result.value).toEqual(["grace", "ada", "margaret"]);
    expect(result.change).toEqual({ added: ["ada", "margaret"], removed: [] });
  });

  it("skips disabled options, chosen values, and values without an option", () => {
    const result = addToTransferSelection(options, ["grace"], ["linus", "grace", "ghost"]);

    expect(result.value).toEqual(["grace"]);
    expect(result.change.added).toEqual([]);
  });
});

describe("removeFromTransferSelection", () => {
  it("removes the requested values and keeps the rest in order", () => {
    const result = removeFromTransferSelection(options, ["margaret", "ada", "grace"], ["ada"]);

    expect(result.value).toEqual(["margaret", "grace"]);
    expect(result.change).toEqual({ added: [], removed: ["ada"] });
  });

  it("keeps disabled options and chosen values that have no option", () => {
    const result = removeFromTransferSelection(options, ["linus", "ghost", "ada"], ["linus", "ghost", "ada"]);

    expect(result.value).toEqual(["linus", "ghost"]);
    expect(result.change.removed).toEqual(["ada"]);
  });
});

describe("option search", () => {
  it("matches label, subtitle, meta, and keywords, ignoring case and outer spaces", () => {
    const option = { keywords: ["research"], label: "Ada Lovelace", meta: "Admin", subtitle: "ada@example.test" };

    for (const query of ["  lovelace ", "EXAMPLE.test", "admin", "Research", ""]) {
      expect(matchesOptionQuery(option, normalizeOptionQuery(query))).toBe(true);
    }
    expect(matchesOptionQuery(option, normalizeOptionQuery("grace"))).toBe(false);
  });
});
