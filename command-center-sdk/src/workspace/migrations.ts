import { runOrderedMigrations, type MigrationStep } from "../contracts/index.js";

import { WORKSPACE_SCHEMA_VERSION, normalizeWorkspaceDocument } from "./normalize.js";
import type { DashboardDefinition, DashboardWidgetInstance } from "./types.js";

export interface WidgetInstanceMigrationRuntime {
  widgetId: string;
  propsVersion: number;
  userStateVersion: number;
  widgetVersion?: string;
  propsMigrations?: readonly MigrationStep<Record<string, unknown>>[];
  userStateMigrations?: readonly MigrationStep<Record<string, unknown>>[];
}

export interface WorkspaceMigrationReport {
  workspace: DashboardDefinition;
  migratedWidgetIds: string[];
  deferredWidgetIds: string[];
  failedWidgetIds: string[];
}

function migrateInstance(
  instance: DashboardWidgetInstance,
  runtime: WidgetInstanceMigrationRuntime,
): DashboardWidgetInstance {
  const currentPropsVersion = instance.propsVersion ?? 1;
  const currentUserStateVersion = instance.userStateVersion ?? 1;
  const props = runOrderedMigrations({
    value: instance.props ?? {},
    currentVersion: currentPropsVersion,
    targetVersion: runtime.propsVersion,
    steps: runtime.propsMigrations ?? [],
  }).value;
  const runtimeState = runOrderedMigrations({
    value: instance.runtimeState ?? {},
    currentVersion: currentUserStateVersion,
    targetVersion: runtime.userStateVersion,
    steps: runtime.userStateMigrations ?? [],
  }).value;
  return {
    ...instance,
    props,
    runtimeState,
    propsVersion: runtime.propsVersion,
    userStateVersion: runtime.userStateVersion,
    authoredWithWidgetVersion: runtime.widgetVersion ?? instance.authoredWithWidgetVersion,
  };
}

export function migrateWorkspaceWidgets(input: {
  workspace: DashboardDefinition;
  resolveRuntime: (widgetId: string) => WidgetInstanceMigrationRuntime | undefined;
}): WorkspaceMigrationReport {
  const migratedWidgetIds: string[] = [];
  const deferredWidgetIds: string[] = [];
  const failedWidgetIds: string[] = [];
  const workspace = normalizeWorkspaceDocument(input.workspace);
  const migrateTree = (instances: DashboardWidgetInstance[]): DashboardWidgetInstance[] =>
    instances.map((instance) => {
      const runtime = input.resolveRuntime(instance.widgetId);
      let next = instance;
      if (!runtime) {
        deferredWidgetIds.push(instance.id);
      } else {
        try {
          next = migrateInstance(instance, runtime);
          if (
            next.propsVersion !== instance.propsVersion ||
            next.userStateVersion !== instance.userStateVersion
          ) {
            migratedWidgetIds.push(instance.id);
          }
        } catch {
          failedWidgetIds.push(instance.id);
          next = instance;
        }
      }
      return next.row?.children
        ? { ...next, row: { ...next.row, children: migrateTree(next.row.children) } }
        : next;
    });
  const widgets = migrateTree(workspace.widgets);
  return {
    workspace: { ...workspace, schemaVersion: workspace.schemaVersion ?? WORKSPACE_SCHEMA_VERSION, widgets },
    migratedWidgetIds,
    deferredWidgetIds,
    failedWidgetIds,
  };
}
