import {
  COMMAND_CENTER_WIDGET_API_VERSION,
  type WidgetPackageProvenance,
} from "../../contracts/index.js";
import {
  adaptLegacyWidgetDefinition,
  type WidgetDefinition,
  type WidgetModule,
} from "../index.js";

import { normalizeWidgetTypeId } from "./widget-id.js";

export interface WidgetRegistryContribution {
  extensionId: string;
  packageName: string;
  packageVersion: string;
  widgets: readonly (WidgetModule<any> | WidgetDefinition<any>)[];
}

export interface RegisteredWidgetModule {
  module: WidgetModule<any>;
  provenance: WidgetPackageProvenance;
}

export interface WidgetRegistry {
  widgets: readonly WidgetDefinition<any>[];
  modules: readonly RegisteredWidgetModule[];
  getWidget(id: string): WidgetDefinition<any> | undefined;
  getModule(id: string): RegisteredWidgetModule | undefined;
}

function asModule(
  widget: WidgetModule<any> | WidgetDefinition<any> | null | undefined,
  contribution: WidgetRegistryContribution,
  index: number,
): WidgetModule<any> {
  if (!widget) {
    throw new Error(
      `Empty widget contribution at index ${index} from ${contribution.packageName}@${contribution.packageVersion} (${contribution.extensionId}).`,
    );
  }
  return "manifest" in widget ? widget : adaptLegacyWidgetDefinition(widget);
}

export function createWidgetRegistry(input: {
  contributions: readonly WidgetRegistryContribution[];
}): WidgetRegistry {
  const extensionOwners = new Map<string, WidgetRegistryContribution>();
  const moduleById = new Map<string, RegisteredWidgetModule>();

  input.contributions.forEach((contribution) => {
    const previousExtension = extensionOwners.get(contribution.extensionId);
    if (previousExtension) {
      throw new Error(
        `Duplicate extension id "${contribution.extensionId}" from ${previousExtension.packageName}@${previousExtension.packageVersion} and ${contribution.packageName}@${contribution.packageVersion}.`,
      );
    }
    extensionOwners.set(contribution.extensionId, contribution);

    contribution.widgets.forEach((candidate, index) => {
      const module = asModule(candidate, contribution, index);
      if (module.manifest.apiVersion !== COMMAND_CENTER_WIDGET_API_VERSION) {
        throw new Error(
          `Widget "${module.manifest.id}" from ${contribution.packageName}@${contribution.packageVersion} targets unsupported API ${module.manifest.apiVersion}.`,
        );
      }
      const widgetId = normalizeWidgetTypeId(module.manifest.id);
      const previous = moduleById.get(widgetId);
      if (previous) {
        const owner = previous.provenance;
        throw new Error(
          `Duplicate widget id "${widgetId}" from ${owner.packageName}@${owner.packageVersion} (${owner.extensionId}) and ${contribution.packageName}@${contribution.packageVersion} (${contribution.extensionId}).`,
        );
      }
      moduleById.set(widgetId, {
        module,
        provenance: {
          extensionId: contribution.extensionId,
          packageName: contribution.packageName,
          packageVersion: contribution.packageVersion,
        },
      });
    });
  });

  const modules = Object.freeze([...moduleById.values()]);
  const widgets = Object.freeze(modules.map((entry) => entry.module.runtime.definition));
  return Object.freeze({
    widgets,
    modules,
    getWidget: (id: string) => moduleById.get(normalizeWidgetTypeId(id))?.module.runtime.definition,
    getModule: (id: string) => moduleById.get(normalizeWidgetTypeId(id)),
  });
}
