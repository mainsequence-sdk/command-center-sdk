import type {
  ResourceApplicationDefinition,
  ResourceId,
} from "./types.js";

const resourceIdentifierPattern = /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/;

function assertIdentifier(value: string, path: string) {
  if (!resourceIdentifierPattern.test(value)) {
    throw new Error(
      `${path} must contain lowercase letters or numbers separated by dots, underscores, or hyphens.`,
    );
  }
}

function assertUniqueIdentifiers(values: readonly string[], path: string) {
  const seen = new Set<string>();

  values.forEach((value) => {
    assertIdentifier(value, `${path} identifier`);

    if (seen.has(value)) {
      throw new Error(`${path} contains duplicate identifier \"${value}\".`);
    }

    seen.add(value);
  });
}

/**
 * Defines a normalized resource application and validates stable contribution identifiers.
 *
 * This helper intentionally does not register the definition globally. Hosts explicitly compose
 * definitions so package imports remain side-effect free.
 */
export function defineResourceApplication<
  T,
  Id extends ResourceId,
  CreateInput = unknown,
  UpdateInput = unknown,
>(
  definition: ResourceApplicationDefinition<T, Id, CreateInput, UpdateInput>,
): ResourceApplicationDefinition<T, Id, CreateInput, UpdateInput> {
  assertIdentifier(definition.id, "Resource application identifier");

  if (!definition.label.trim()) {
    throw new Error("Resource application label must not be empty.");
  }

  if (definition.columns.length === 0) {
    throw new Error(`Resource application \"${definition.id}\" must define at least one column.`);
  }

  assertUniqueIdentifiers(
    definition.columns.map((column) => column.id),
    `Resource application \"${definition.id}\" columns`,
  );
  assertUniqueIdentifiers(
    (definition.actions ?? []).map((action) => action.id),
    `Resource application \"${definition.id}\" actions`,
  );
  assertUniqueIdentifiers(
    (definition.detail?.tabs ?? []).map((tab) => tab.id),
    `Resource application \"${definition.id}\" detail tabs`,
  );

  return definition;
}
