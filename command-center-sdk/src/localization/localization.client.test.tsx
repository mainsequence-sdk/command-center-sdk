// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { CommandCenterLocalizationProvider, useSdkTranslation } from "./react.js";
import { ResourcePagination } from "../views/ResourcePagination.js";
import { ResourceSearch } from "../views/ResourceSearch.js";
import { ResourcePicker } from "../views/ResourcePicker.js";
import { ResourceListPage } from "../views/ResourceListPage.js";
import { ResourceActionConfirmationDialog } from "../views/ResourceActionConfirmationDialog.js";
import type { ResourceApplicationDefinition } from "../resource/types.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", { configurable: true, value: true });

describe("public SDK localization provider", () => {
  it("retranslates a mounted resource list, selection and dialog without refetching or losing focus", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const list = vi.fn().mockResolvedValue({ items: [{ id: "record", name: "Draft" }], pageInfo: { pageIndex: 0, pageSize: 25, totalItems: 50, hasNextPage: true, hasPreviousPage: false } });
    const definition: ResourceApplicationDefinition<{ id: string; name: string }, string> = {
      id: "records", label: "Records", getId: item => item.id, adapter: { list, listBulkActions: async () => actions },
      columns: [{ id: "name", header: "Name", getValue: item => item.name }],
    };
    const actions = [{ id: "archive", label: "Archive", endpoint: "/archive/", method: "POST" as const, options: [], selection_modes: ["explicit" as const] }];
    let locale = "de";
    // Deliberately stable identity, like an application translator reading a changing i18next instance.
    const translate = (key: string, values: Readonly<Record<string, string | number>>) => locale === "de"
      ? key === "next" ? "Weiter zur nächsten Ergebnisseite" : key === "selectionPage" ? `${values.count} auf dieser Seite ausgewählt.` : key === "cancel" ? "Abbrechen" : undefined
      : undefined;
    const render = () => <CommandCenterLocalizationProvider locale={locale} translate={translate}>
      <input aria-label="Unsaved draft" defaultValue="Keep this draft" />
      <ResourceListPage definition={definition} initialSelectedIds={["record"]} initialBulkActions={actions} />
      <ResourceActionConfirmationDialog actionLabel="Archive" title="Review archive" confirmButtonLabel="Archive now" confirmationValue="" onClose={() => {}} onConfirm={() => {}} onConfirmationValueChange={() => {}} />
    </CommandCenterLocalizationProvider>;
    try {
      await act(async () => root.render(render()));
      await act(async () => container.querySelector<HTMLInputElement>('input[aria-label="Select record"]')!.click());
      const input = container.querySelector("input")!;
      input.focus();
      expect(container.textContent).toContain("1 auf dieser Seite ausgewählt.");
      expect(container.textContent).toContain("Weiter zur nächsten Ergebnisseite");
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Abbrechen");
      expect(container.querySelector('input[aria-label="Select record"]')).toHaveProperty("checked", true);
      expect(list).toHaveBeenCalledTimes(1);
      locale = "en";
      await act(async () => root.render(render()));
      expect(container.querySelector("input")).toBe(input);
      expect(input.value).toBe("Keep this draft");
      // The dialog owns focus while open; its focus must survive the translation update too.
      expect(document.activeElement).not.toBe(document.body);
      expect(container.textContent).toContain("1 selected on this page.");
      expect(document.querySelector('[role="dialog"]')?.textContent).toContain("Cancel");
      expect(container.querySelector('input[aria-label="Select record"]')).toHaveProperty("checked", true);
      expect(list).toHaveBeenCalledTimes(1);
    } finally {
      await act(async () => root.unmount());
      container.remove();
    }
  });

  it("retranslates SDK fallback errors in place without retrying the request", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const list = vi.fn().mockRejectedValue({ unavailable: true });
    const definition: ResourceApplicationDefinition<{ id: string }, string> = {
      id: "records", label: "Records", getId: item => item.id, adapter: { list }, columns: [],
    };
    const render = (locale: string) => <CommandCenterLocalizationProvider locale={locale} translate={key => locale === "de" && key === "listLoadError" ? "Laden fehlgeschlagen" : undefined}>
      <ResourceListPage definition={definition} />
    </CommandCenterLocalizationProvider>;
    try {
      await act(async () => root.render(render("de")));
      expect(container.textContent).toContain("Laden fehlgeschlagen");
      await act(async () => root.render(render("en")));
      expect(container.textContent).toContain("The resource list could not be loaded.");
      expect(list).toHaveBeenCalledTimes(1);
    } finally { await act(async () => root.unmount()); }
  });

  it("passes zero/one/many counts and never exposes missing keys or empty accessibility labels", async () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    function Probe({ count }: { count: number }) {
      const { t } = useSdkTranslation();
      return <output aria-label={t("next")}>{t("selectionCount", { count })}{t("previous")}</output>;
    }
    try {
      for (const count of [0, 1, 2, 5]) {
        await act(async () => root.render(<CommandCenterLocalizationProvider locale="de" translate={(key, values) => key === "selectionCount" ? `${values.count} ${values.count === 1 ? "Eintrag" : "Einträge"}` : key === "next" ? " " : key}>
          <Probe count={count} />
        </CommandCenterLocalizationProvider>));
        expect(container.textContent).toContain(`${count} ${count === 1 ? "Eintrag" : "Einträge"}`);
        expect(container.textContent).toContain("Previous");
        expect(container.querySelector("output")?.getAttribute("aria-label")).toBe("Next");
      }
    } finally { await act(async () => root.unmount()); }
  });

  it("updates messages and plural counts live while preserving overrides and English fallback", async () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    const translate = (key: string, values: Readonly<Record<string, string | number>>) => key === "next" ? "Weiter zur nächsten Ergebnisseite" : key === "selectionCount" ? `${values.count} ${values.count === 1 ? "Eintrag" : "Einträge"} ausgewählt` : undefined;
    const render = (count: number) => <CommandCenterLocalizationProvider locale="de" translate={translate}>
      <ResourcePagination count={100} pageIndex={0} pageSize={25} onPageChange={() => {}} />
      <ResourceSearch value="" placeholder="Search" selectionCount={count} onChange={() => {}} />
      <ResourcePicker options={[]} value={null} mode="single" placeholder="Custom label" onValueChange={() => {}} />
    </CommandCenterLocalizationProvider>;
    await act(async () => root.render(render(1)));
    expect(container.textContent).toContain("Weiter zur nächsten Ergebnisseite");
    expect(container.textContent).toContain("1 Eintrag ausgewählt");
    expect(container.textContent).toContain("Previous");
    expect(container.textContent).toContain("Custom label");
    await act(async () => root.render(render(2)));
    expect(container.textContent).toContain("2 Einträge ausgewählt");
    await act(async () => root.render(<ResourcePagination count={100} pageIndex={0} pageSize={25} onPageChange={() => {}} />));
    expect(container.textContent).toContain("Next");
    await act(async () => root.unmount());
    container.remove();
  });
});
