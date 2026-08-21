import type { WidgetRegistryUsageGuidance } from "../contracts/index.js";

type UsageGuidanceListKey =
  | "whenToUse"
  | "whenNotToUse"
  | "authoringSteps"
  | "blockingRequirements"
  | "commonPitfalls";

const listKeys: UsageGuidanceListKey[] = [
  "whenToUse",
  "whenNotToUse",
  "authoringSteps",
  "blockingRequirements",
  "commonPitfalls",
];

const headingAliases: Record<string, keyof WidgetRegistryUsageGuidance> = {
  authoringsteps: "authoringSteps",
  blockingrequirements: "blockingRequirements",
  buildpurpose: "buildPurpose",
  commonpitfalls: "commonPitfalls",
  purpose: "buildPurpose",
  whennottouse: "whenNotToUse",
  whentouse: "whenToUse",
};

function normalizeMarkdownText(markdown: string) {
  return markdown
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("<!--"))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeading(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/`/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function normalizeGuidanceHeading(value: string) {
  return normalizeHeading(value).replace(/-/g, "");
}

function extractSection(markdown: string, sectionId: string) {
  const targetHeading = normalizeHeading(sectionId);
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let isCapturing = false;
  let capturedLevel = 0;
  const captured: string[] = [];

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const heading = normalizeHeading(headingMatch[2]);

      if (isCapturing && level <= capturedLevel) {
        break;
      }

      if (heading === targetHeading) {
        isCapturing = true;
        capturedLevel = level;
        continue;
      }
    }

    if (isCapturing) {
      captured.push(line);
    }
  }

  return captured.join("\n");
}

function collectGuidanceSections(markdown: string) {
  const sections = new Map<keyof WidgetRegistryUsageGuidance, string>();
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let activeKey: keyof WidgetRegistryUsageGuidance | null = null;
  let activeLevel = 0;
  let captured: string[] = [];

  function flush() {
    if (activeKey) {
      sections.set(activeKey, captured.join("\n"));
    }
  }

  for (const line of lines) {
    const headingMatch = /^(#{1,6})\s+(.+?)\s*$/.exec(line);

    if (headingMatch) {
      const level = headingMatch[1].length;
      const alias = headingAliases[normalizeGuidanceHeading(headingMatch[2])];

      if (activeKey && level <= activeLevel) {
        flush();
        activeKey = null;
        activeLevel = 0;
        captured = [];
      }

      if (alias) {
        flush();
        activeKey = alias;
        activeLevel = level;
        captured = [];
        continue;
      }
    }

    if (activeKey) {
      captured.push(line);
    }
  }

  flush();

  return sections;
}

function parseMarkdownList(markdown: string) {
  const items: string[] = [];
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  let current: string[] = [];

  function flush() {
    const value = normalizeMarkdownText(current.join("\n"));

    if (value) {
      items.push(value);
    }

    current = [];
  }

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("<!--")) {
      continue;
    }

    const listItemMatch = /^[-*]\s+(.+)$/.exec(trimmed);

    if (listItemMatch) {
      flush();
      current.push(listItemMatch[1]);
      continue;
    }

    if (current.length > 0 && /^\s+/.test(line)) {
      current.push(trimmed);
      continue;
    }

    flush();
    current.push(trimmed);
  }

  flush();

  return items;
}

function getRequiredSection(
  sections: Map<keyof WidgetRegistryUsageGuidance, string>,
  key: keyof WidgetRegistryUsageGuidance,
  sourceLabel: string,
) {
  const value = sections.get(key);

  if (!value || !normalizeMarkdownText(value)) {
    throw new Error(`Widget USAGE_GUIDANCE.md ${sourceLabel} is missing required section "${key}".`);
  }

  return value;
}

export function resolveWidgetUsageGuidance(
  markdown: string,
  sectionId?: string,
): WidgetRegistryUsageGuidance {
  const source = sectionId ? extractSection(markdown, sectionId) : markdown;
  const sourceLabel = sectionId ? `section "${sectionId}"` : "file";

  if (!normalizeMarkdownText(source)) {
    throw new Error(
      sectionId
        ? `Widget USAGE_GUIDANCE.md section "${sectionId}" is empty or missing.`
        : "Widget USAGE_GUIDANCE.md cannot be empty.",
    );
  }

  const sections = collectGuidanceSections(source);
  const buildPurpose = normalizeMarkdownText(
    getRequiredSection(sections, "buildPurpose", sourceLabel),
  );
  const guidance: WidgetRegistryUsageGuidance = {
    buildPurpose,
    whenToUse: [],
    whenNotToUse: [],
    authoringSteps: [],
  };

  for (const key of listKeys) {
    const section = sections.get(key);
    const values = section ? parseMarkdownList(section) : [];

    if (
      (key === "whenToUse" || key === "whenNotToUse" || key === "authoringSteps") &&
      values.length === 0
    ) {
      throw new Error(
        `Widget USAGE_GUIDANCE.md ${sourceLabel} is missing required list section "${key}".`,
      );
    }

    guidance[key] = values;
  }

  return guidance;
}

export function resolveWidgetDescription(markdown: string, sectionId?: string) {
  return resolveWidgetUsageGuidance(markdown, sectionId).buildPurpose;
}
