import {
  COMMAND_CENTER_WIDGET_API_VERSION,
  DEFAULT_WIDGET_SIZE,
  assertJsonSerializable,
  type MigrationStep,
  type WidgetManifest,
  type WidgetManifestInput,
} from "../contracts/index.js";

import {
  defineWidget,
  type WidgetDefinition,
  type WidgetDefinitionInput,
} from "./legacy.js";

export interface WidgetRuntime<TProps extends Record<string, unknown> = Record<string, unknown>> {
  definition: WidgetDefinition<TProps>;
  migrateProps?: readonly MigrationStep<TProps>[];
  migrateUserState?: readonly MigrationStep<Record<string, unknown>>[];
}

export interface WidgetModule<TProps extends Record<string, unknown> = Record<string, unknown>> {
  manifest: WidgetManifest;
  runtime: WidgetRuntime<TProps>;
}

export interface WidgetModuleInput<TProps extends Record<string, unknown> = Record<string, unknown>> {
  manifest: WidgetManifestInput;
  runtime: Omit<WidgetRuntime<TProps>, "definition"> & {
    definition: Omit<
      WidgetDefinitionInput<TProps>,
      | "id"
      | "widgetVersion"
      | "apiVersion"
      | "propsSchema"
      | "propsVersion"
      | "userStateVersion"
      | "title"
      | "description"
      | "category"
      | "kind"
      | "source"
      | "defaultSize"
      | "responsive"
      | "requiredPermissions"
      | "tags"
      | "workspaceRuntimeMode"
      | "canvasEditing"
      | "registryContract"
      | "organizationConfiguration"
    >;
  };
}

function normalizeManifest(input: WidgetManifestInput): WidgetManifest {
  const candidate = {
    ...input,
    apiVersion: input.apiVersion ?? COMMAND_CENTER_WIDGET_API_VERSION,
    defaultSize: input.defaultSize ?? { ...DEFAULT_WIDGET_SIZE },
  };
  const pruneUndefined = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(pruneUndefined);
    if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
      return Object.fromEntries(
        Object.entries(value)
          .filter(([, entry]) => entry !== undefined)
          .map(([key, entry]) => [key, pruneUndefined(entry)]),
      );
    }
    return value;
  };
  const manifest = pruneUndefined(candidate) as WidgetManifest;

  if (manifest.apiVersion !== COMMAND_CENTER_WIDGET_API_VERSION) {
    throw new Error(
      `Unsupported widget API version "${manifest.apiVersion}"; expected "${COMMAND_CENTER_WIDGET_API_VERSION}".`,
    );
  }
  assertJsonSerializable(manifest, `Widget manifest ${manifest.id}`);
  return manifest;
}

export function defineWidgetModule<
  TProps extends Record<string, unknown> = Record<string, unknown>,
>(input: WidgetModuleInput<TProps>): WidgetModule<TProps> {
  const manifest = normalizeManifest(input.manifest);
  const definition = defineWidget({
    ...input.runtime.definition,
    id: manifest.id,
    widgetVersion: manifest.widgetVersion,
    apiVersion: manifest.apiVersion,
    propsSchema: manifest.propsSchema,
    propsVersion: manifest.propsVersion ?? 1,
    userStateVersion: manifest.userStateVersion ?? 1,
    title: manifest.title,
    description: manifest.description,
    category: manifest.category,
    kind: manifest.kind,
    source: manifest.source,
    defaultSize: manifest.defaultSize,
    responsive: manifest.responsive,
    requiredPermissions: manifest.requiredPermissions,
    tags: manifest.tags,
    workspaceRuntimeMode: manifest.workspaceRuntimeMode,
    canvasEditing: manifest.canvasEditingMode
      ? { mode: manifest.canvasEditingMode }
      : undefined,
    registryContract: manifest.registryContract,
    organizationConfiguration: manifest.organizationConfiguration,
  });

  return {
    manifest,
    runtime: {
      ...input.runtime,
      definition,
    },
  };
}

export function adaptLegacyWidgetDefinition<
  TProps extends Record<string, unknown> = Record<string, unknown>,
>(definition: WidgetDefinition<TProps>): WidgetModule<TProps> {
  if (!definition.registryContract) {
    throw new Error(
      `Legacy widget "${definition.id}" needs a registryContract before it can be adapted.`,
    );
  }

  return defineWidgetModule({
    manifest: {
      id: definition.id,
      widgetVersion: definition.widgetVersion,
      apiVersion: definition.apiVersion,
      propsSchema: definition.propsSchema,
      propsVersion: definition.propsVersion,
      userStateVersion: definition.userStateVersion,
      title: definition.title,
      description: definition.description,
      category: definition.category,
      kind: definition.kind,
      source: definition.source,
      defaultSize: definition.defaultSize,
      responsive: definition.responsive,
      requiredPermissions: definition.requiredPermissions,
      tags: definition.tags,
      workspaceRuntimeMode: definition.workspaceRuntimeMode,
      canvasEditingMode: definition.canvasEditing?.mode,
      registryContract: definition.registryContract,
      organizationConfiguration: definition.organizationConfiguration,
    },
    runtime: { definition },
  });
}

export function toLegacyWidgetDefinition<TProps extends Record<string, unknown>>(
  module: WidgetModule<TProps>,
): WidgetDefinition<TProps> {
  return module.runtime.definition;
}

type WidgetRuntimeDefinitionOverrides<
  TProps extends Record<string, unknown>,
> = Partial<
  Omit<
    WidgetDefinition<TProps>,
    | "id"
    | "widgetVersion"
    | "apiVersion"
    | "propsSchema"
    | "propsVersion"
    | "userStateVersion"
    | "title"
    | "description"
    | "category"
    | "kind"
    | "source"
    | "defaultSize"
    | "responsive"
    | "requiredPermissions"
    | "tags"
    | "workspaceRuntimeMode"
    | "canvasEditing"
    | "registryContract"
    | "organizationConfiguration"
  >
>;

/**
 * Compose trusted host integrations onto a published widget runtime without copying or changing
 * its serializable manifest. Persisted and backend-visible identity remains package-owned.
 */
export function withWidgetRuntimeOverrides<
  TProps extends Record<string, unknown> = Record<string, unknown>,
>(
  module: WidgetModule<TProps>,
  overrides: WidgetRuntimeDefinitionOverrides<TProps>,
): WidgetModule<TProps> {
  return {
    manifest: module.manifest,
    runtime: {
      ...module.runtime,
      definition: {
        ...module.runtime.definition,
        ...overrides,
      },
    },
  };
}

export interface WidgetExtension {
  id: string;
  title: string;
  description?: string;
  packageName: string;
  packageVersion: string;
  widgets: readonly WidgetModule<any>[];
}

export function defineExtension(extension: WidgetExtension): WidgetExtension {
  const widgetIds = new Set<string>();
  extension.widgets.forEach((widget) => {
    if (widgetIds.has(widget.manifest.id)) {
      throw new Error(`Extension "${extension.id}" declares duplicate widget "${widget.manifest.id}".`);
    }
    widgetIds.add(widget.manifest.id);
  });
  return Object.freeze({ ...extension, widgets: Object.freeze([...extension.widgets]) });
}
