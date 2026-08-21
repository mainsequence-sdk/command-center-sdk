import { assertJsonSerializable, type WidgetManifest } from "../../contracts/index.js";

import type { WidgetDefinition, WidgetModule } from "../index.js";

export interface WidgetValidationIssue {
  field: string;
  message: string;
}

export function validateWidgetManifest(manifest: WidgetManifest): WidgetValidationIssue[] {
  const issues: WidgetValidationIssue[] = [];
  if (!manifest.id.trim()) issues.push({ field: "id", message: "Widget id is required." });
  if (!/^\d+\.\d+\.\d+(?:[-+].+)?$/.test(manifest.widgetVersion)) {
    issues.push({ field: "widgetVersion", message: "Widget version must be semver-like." });
  }
  try {
    assertJsonSerializable(manifest, `Widget manifest ${manifest.id}`);
  } catch (error) {
    issues.push({ field: "manifest", message: error instanceof Error ? error.message : String(error) });
  }
  return issues;
}

export function assertWidgetPreviewFixture(
  widget: WidgetDefinition | WidgetModule,
): void {
  const definition = "runtime" in widget ? widget.runtime.definition : widget;
  if (definition.mockProps === undefined && definition.exampleProps === undefined) {
    throw new Error(`Widget "${definition.id}" must provide mockProps or exampleProps.`);
  }
}
