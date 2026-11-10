import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { CommandCenterLocalizationProvider } from "@dev-mainsequence/command-center-sdk/localization/react";
import type { TranslateSdkMessage } from "@dev-mainsequence/command-center-sdk/localization";
import type { ResourceApplicationDefinition } from "@dev-mainsequence/command-center-sdk/resource";
import { ResourceListPage } from "@dev-mainsequence/command-center-sdk/views";

const action = { id: "archive", label: "Archive", endpoint: "/archive/", method: "POST" as const, selection_modes: ["explicit" as const], options: [], confirmation: { title: "Review archive", word: "ARCHIVE", button_label: "Confirm archive", warning: "" } };
let listCalls = 0;
const definition: ResourceApplicationDefinition<{ id: string; name: string }, string> = {
  id: "records", label: "Records", getId: item => item.id,
  columns: [{ id: "name", header: "Name", getValue: item => item.name }],
  adapter: { async list() {
    listCalls++;
    document.documentElement.dataset.listCalls = String(listCalls);
    return { items: [{ id: "one", name: "First record" }, { id: "two", name: "Second record" }], pageInfo: { pageIndex: 0, pageSize: 25, totalItems: 100, hasNextPage: true, hasPreviousPage: false }, bulkActions: [action] };
  } },
};

function App() {
  const [locale, setLocale] = useState("de");
  const translate: TranslateSdkMessage = (key, values) => {
    if (locale !== "de") return undefined;
    if (key === "next") return "Weiter zur nächsten Ergebnisseite";
    if (key === "actions") return "Aktionen";
    if (key === "cancel") return "Abbrechen";
    if (key === "closeDialog") return "Dialog schließen";
    if (key === "confirmationWord") return "Bestätigungswort";
    if (key === "selectionPage") return `${values.count} ${values.count === 1 ? "Datensatz" : "Datensätze"} auf dieser Seite ausgewählt.`;
    return undefined;
  };
  return h(CommandCenterLocalizationProvider, { locale, translate },
    h("button", { onClick: () => setLocale(current => current === "de" ? "en" : "de"), type: "button" }, "Change language"),
    h("input", { "aria-label": "Unsaved draft", defaultValue: "Keep this draft" }),
    h(ResourceListPage, { definition }),
  );
}
createRoot(document.getElementById("root")!).render(h(App));
