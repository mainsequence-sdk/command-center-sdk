// A live composition for resource-transfer-list.pw.ts: an application builds a user and team
// access control from two transfer lists. The spec bundles it with Vite against the built package.
import { createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";

import { ResourceTransferList } from "../../../dist/views/index.js";

const users = [
  { label: "Ada Lovelace", subtitle: "ada@example.test", value: "ada" },
  { label: "Grace Hopper", subtitle: "grace@example.test", value: "grace" },
  { disabled: true, label: "Linus Torvalds", meta: "Always has access", subtitle: "linus@example.test", value: "linus" },
  { label: "Margaret Hamilton", subtitle: "margaret@example.test", value: "margaret" },
  { label: "Katherine Johnson", subtitle: "katherine@example.test", value: "katherine" },
  { label: "Alan Turing", subtitle: "alan@example.test", value: "alan" },
];

const teams = [
  { label: "Research", meta: "12 members", value: "research" },
  { label: "Trading", meta: "4 members", value: "trading" },
  { label: "Operations", meta: "7 members", value: "operations" },
];

function AccessEditor() {
  const [userValue, setUserValue] = useState<readonly string[]>(["linus"]);
  const [teamValue, setTeamValue] = useState<readonly string[]>([]);
  return h(
    "section",
    { "aria-label": "Who can view", style: { display: "grid", gap: "1.5rem" } },
    h(ResourceTransferList, {
      description: "Chosen users can view this object.",
      itemLabel: "users",
      onValueChange: setUserValue,
      options: users,
      value: userValue,
    }),
    h(ResourceTransferList, {
      itemLabel: "teams",
      onValueChange: setTeamValue,
      options: teams,
      value: teamValue,
    }),
    h("output", { "data-teams": teamValue.join(","), "data-users": userValue.join(",") }),
  );
}

createRoot(document.getElementById("root")!).render(h(AccessEditor));
