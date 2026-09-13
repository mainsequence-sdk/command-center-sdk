const SAFE_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/u;
const SIDEBAR_ID = /^[a-z][A-Za-z0-9]*$/u;
const NAVIGATION_KINDS = new Set(["section", "feature"]);

export function normalizeDocumentationNavigation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("documentation/navigation.json must contain an object.");
  }
  if (value.schemaVersion === 1) {
    throw new Error(
      "documentation/navigation.json schemaVersion 1 is obsolete. Migrate surfaces into folders matching the application menu, move technical material outside docs/, and set schemaVersion to 2.",
    );
  }
  if (value.schemaVersion !== 2) {
    throw new Error("documentation/navigation.json schemaVersion must be 2.");
  }
  if (!SIDEBAR_ID.test(value.sidebarId || "") || value.sidebarId !== "userGuideSidebar") {
    throw new Error("documentation/navigation.json sidebarId must be userGuideSidebar.");
  }
  if (!value.home || typeof value.home !== "object" || Array.isArray(value.home)) {
    throw new Error("documentation/navigation.json home must contain the user-guide landing.");
  }
  const homeLabel = normalizedLabel(value.home.label, "home.label");
  if (!Array.isArray(value.navigation)) {
    throw new Error("documentation/navigation.json navigation must be an array.");
  }

  const docIds = new Set(["index"]);
  const pages = [{ doc: "index", label: homeLabel, pageType: "home" }];
  const navigation = value.navigation.map((item, index) =>
    normalizeNavigationItem(item, `navigation[${index}]`, [], docIds, pages),
  );

  return {
    schemaVersion: 2,
    sidebarId: value.sidebarId,
    home: { label: homeLabel, doc: "index" },
    navigation,
    docIds,
    pages,
  };
}

function normalizeNavigationItem(value, sourcePath, parentIds, docIds, pages) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${sourcePath} must be an object.`);
  }
  if (Object.hasOwn(value, "doc")) {
    throw new Error(`${sourcePath}.doc is not allowed; the document path is derived from nested navigation IDs.`);
  }
  const id = normalizedId(value.id, `${sourcePath}.id`);
  const label = normalizedLabel(value.label, `${sourcePath}.label`);
  const kind = typeof value.kind === "string" ? value.kind.trim() : "";
  if (!NAVIGATION_KINDS.has(kind)) {
    throw new Error(`${sourcePath}.kind must be section or feature.`);
  }
  const applicationRoute = normalizeApplicationRoute(value.applicationRoute, sourcePath);
  const pathIds = [...parentIds, id];
  const doc = `${pathIds.join("/")}/index`;
  addDoc(docIds, doc);
  pages.push({ doc, label, pageType: kind, applicationRoute });

  const taskValues = value.pages ?? [];
  const itemValues = value.items ?? [];
  if (!Array.isArray(taskValues)) throw new Error(`${sourcePath}.pages must be an array.`);
  if (!Array.isArray(itemValues)) throw new Error(`${sourcePath}.items must be an array.`);

  const siblingIds = new Set();
  const taskPages = taskValues.map((task, index) => {
    const taskPath = `${sourcePath}.pages[${index}]`;
    if (!task || typeof task !== "object" || Array.isArray(task)) {
      throw new Error(`${taskPath} must be an object.`);
    }
    if (Object.hasOwn(task, "doc")) {
      throw new Error(`${taskPath}.doc is not allowed; the document path is derived from its owning navigation IDs.`);
    }
    const taskId = normalizedId(task.id, `${taskPath}.id`);
    if (siblingIds.has(taskId)) throw new Error(`Duplicate child ID below ${sourcePath}: ${taskId}`);
    siblingIds.add(taskId);
    const taskLabel = normalizedLabel(task.label, `${taskPath}.label`);
    const taskDoc = `${pathIds.join("/")}/${taskId}`;
    addDoc(docIds, taskDoc);
    pages.push({ doc: taskDoc, label: taskLabel, pageType: "task" });
    return { id: taskId, label: taskLabel, doc: taskDoc };
  });

  for (const child of itemValues) {
    const childId = normalizedId(child?.id, `${sourcePath}.items[].id`);
    if (siblingIds.has(childId)) throw new Error(`Duplicate child ID below ${sourcePath}: ${childId}`);
    siblingIds.add(childId);
  }
  const items = itemValues.map((item, index) =>
    normalizeNavigationItem(item, `${sourcePath}.items[${index}]`, pathIds, docIds, pages),
  );

  return { id, label, kind, applicationRoute, doc, pages: taskPages, items };
}

function normalizedId(raw, sourcePath) {
  const id = typeof raw === "string" ? raw.trim() : "";
  if (!SAFE_ID.test(id) || id === "index") {
    throw new Error(`${sourcePath} must be a stable lowercase kebab-case ID other than index.`);
  }
  return id;
}

function normalizedLabel(raw, sourcePath) {
  const label = typeof raw === "string" ? raw.trim() : "";
  if (!label || /[\r\n]/u.test(label)) {
    throw new Error(`${sourcePath} must be one non-empty line.`);
  }
  return label;
}

function normalizeApplicationRoute(raw, sourcePath) {
  if (raw === undefined) return null;
  const route = typeof raw === "string" ? raw.trim() : "";
  if (!route.startsWith("/") || route.startsWith("//") || /\s/u.test(route)) {
    throw new Error(`${sourcePath}.applicationRoute must be an application-relative URL beginning with /.`);
  }
  return route;
}

function addDoc(docIds, doc) {
  if (docIds.has(doc)) throw new Error(`Duplicate documentation ID: ${doc}`);
  docIds.add(doc);
}

export function renderDocumentationSummary(navigation) {
  const lines = [
    "# User guide",
    "",
    "This map and the Docusaurus sidebar are generated from `documentation/navigation.json`.",
    "",
    `- [${navigation.home.label}](index.md)`,
  ];
  for (const item of navigation.navigation) renderSummaryItem(item, 0, lines);
  return `${lines.join("\n")}\n`;
}

function renderSummaryItem(item, depth, lines) {
  const indentation = "  ".repeat(depth);
  lines.push(`${indentation}- [${item.label}](${item.doc}.md)`);
  for (const page of item.pages) lines.push(`${indentation}  - [${page.label}](${page.doc}.md)`);
  for (const child of item.items) renderSummaryItem(child, depth + 1, lines);
}

export function renderDocumentationSidebars(navigation) {
  const sidebar = [
    { type: "doc", id: navigation.home.doc, label: navigation.home.label },
    ...navigation.navigation.map(renderSidebarItem),
  ];
  return [
    "// Generated by scripts/sync-docs-navigation.mjs. Do not edit directly.",
    `const sidebars = ${JSON.stringify({ [navigation.sidebarId]: sidebar }, null, 2)};`,
    "",
    "export default sidebars;",
    "",
  ].join("\n");
}

function renderSidebarItem(item) {
  const children = [
    ...item.pages.map((page) => ({ type: "doc", id: page.doc, label: page.label })),
    ...item.items.map(renderSidebarItem),
  ];
  if (children.length === 0) return { type: "doc", id: item.doc, label: item.label };
  return {
    type: "category",
    label: item.label,
    link: { type: "doc", id: item.doc },
    items: children,
  };
}
