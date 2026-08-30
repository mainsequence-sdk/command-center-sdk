import type {
  NavigationApplicationDefinition,
  NavigationContributionDefinition,
  NavigationDestinationDefinition,
  NavigationSubApplicationDefinition,
} from "./types.js";

export class NavigationDefinitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NavigationDefinitionError";
  }
}

function assertStableId(value: string, owner: string) {
  if (!value.trim()) {
    throw new NavigationDefinitionError(`${owner} requires a non-empty id.`);
  }
}

function assertLabel(value: string, owner: string) {
  if (!value.trim()) {
    throw new NavigationDefinitionError(`${owner} requires a non-empty label.`);
  }
}

function assertHref(value: string | undefined, owner: string) {
  if (value !== undefined && !value.trim()) {
    throw new NavigationDefinitionError(
      `${owner} href must be non-empty when provided.`,
    );
  }
}

function assertOrder(value: number | undefined, owner: string) {
  if (value !== undefined && !Number.isFinite(value)) {
    throw new NavigationDefinitionError(
      `${owner} order must be a finite number when provided.`,
    );
  }
}

function compareOrdered(
  left: { id: string; label: string; order?: number },
  right: { id: string; label: string; order?: number },
) {
  const leftOrder = left.order ?? Number.POSITIVE_INFINITY;
  const rightOrder = right.order ?? Number.POSITIVE_INFINITY;

  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  const labelDifference = left.label.localeCompare(right.label);
  return labelDifference || left.id.localeCompare(right.id);
}

function validateDestinations(
  applicationId: string,
  subApplication: NavigationSubApplicationDefinition,
  applicationDestinationIds: Set<string>,
) {
  const localIds = new Set<string>();

  subApplication.destinations.forEach((destination) => {
    assertStableId(
      destination.id,
      `Navigation destination in ${applicationId}/${subApplication.id}`,
    );
    assertLabel(destination.label, `Navigation destination ${destination.id}`);
    assertHref(destination.href, `Navigation destination ${destination.id}`);
    assertOrder(destination.order, `Navigation destination ${destination.id}`);

    if (localIds.has(destination.id)) {
      throw new NavigationDefinitionError(
        `Navigation sub-application ${applicationId}/${subApplication.id} contains duplicate destination id ${destination.id}.`,
      );
    }

    if (applicationDestinationIds.has(destination.id)) {
      throw new NavigationDefinitionError(
        `Navigation application ${applicationId} contains duplicate destination id ${destination.id}.`,
      );
    }

    localIds.add(destination.id);
    applicationDestinationIds.add(destination.id);
  });
}

export function validateNavigationApplication(
  definition: NavigationApplicationDefinition,
) {
  assertStableId(definition.id, "Navigation application");
  assertLabel(definition.label, `Navigation application ${definition.id}`);
  assertHref(definition.href, `Navigation application ${definition.id}`);
  assertOrder(definition.order, `Navigation application ${definition.id}`);

  const subApplicationIds = new Set<string>();
  const destinationIds = new Set<string>();

  definition.subApplications.forEach((subApplication) => {
    assertStableId(
      subApplication.id,
      `Navigation sub-application in ${definition.id}`,
    );
    assertLabel(
      subApplication.label,
      `Navigation sub-application ${definition.id}/${subApplication.id}`,
    );
    assertOrder(
      subApplication.order,
      `Navigation sub-application ${definition.id}/${subApplication.id}`,
    );

    if (subApplicationIds.has(subApplication.id)) {
      throw new NavigationDefinitionError(
        `Navigation application ${definition.id} contains duplicate sub-application id ${subApplication.id}.`,
      );
    }

    subApplicationIds.add(subApplication.id);
    validateDestinations(definition.id, subApplication, destinationIds);
  });

  if (
    definition.defaultDestinationId &&
    !destinationIds.has(definition.defaultDestinationId)
  ) {
    throw new NavigationDefinitionError(
      `Navigation application ${definition.id} default destination ${definition.defaultDestinationId} does not exist.`,
    );
  }

  return definition;
}

export function defineNavigationApplication<
  Definition extends NavigationApplicationDefinition,
>(definition: Definition): Definition {
  validateNavigationApplication(definition);
  return definition;
}

export function defineNavigationSubApplication<
  Definition extends NavigationSubApplicationDefinition,
>(definition: Definition): Definition {
  validateNavigationApplication({
    id: "__standalone__",
    label: "Standalone navigation application",
    subApplications: [definition],
  });
  return definition;
}

export function defineNavigationContribution<
  Definition extends NavigationContributionDefinition,
>(definition: Definition): Definition {
  assertStableId(definition.id, "Navigation contribution");
  assertStableId(
    definition.targetApplicationId,
    `Navigation contribution ${definition.id}`,
  );
  defineNavigationSubApplication(definition.subApplication);
  return definition;
}

function cloneAndSortSubApplication(
  definition: NavigationSubApplicationDefinition,
): NavigationSubApplicationDefinition {
  return {
    ...definition,
    destinations: [...definition.destinations].sort(compareOrdered),
  };
}

function cloneAndSortApplication(
  definition: NavigationApplicationDefinition,
): NavigationApplicationDefinition {
  return {
    ...definition,
    subApplications: [...definition.subApplications]
      .map(cloneAndSortSubApplication)
      .sort(compareOrdered),
  };
}

export function composeNavigationApplications(
  applications: readonly NavigationApplicationDefinition[],
  contributions: readonly NavigationContributionDefinition[] = [],
) {
  const applicationMap = new Map<string, NavigationApplicationDefinition>();

  applications.forEach((definition) => {
    validateNavigationApplication(definition);

    if (applicationMap.has(definition.id)) {
      throw new NavigationDefinitionError(
        `Navigation collection contains duplicate application id ${definition.id}.`,
      );
    }

    applicationMap.set(definition.id, cloneAndSortApplication(definition));
  });

  const contributionIds = new Set<string>();
  contributions.forEach((contribution) => {
    defineNavigationContribution(contribution);

    if (contributionIds.has(contribution.id)) {
      throw new NavigationDefinitionError(
        `Navigation collection contains duplicate contribution id ${contribution.id}.`,
      );
    }

    contributionIds.add(contribution.id);
    const application = applicationMap.get(contribution.targetApplicationId);

    if (!application) {
      throw new NavigationDefinitionError(
        `Navigation contribution ${contribution.id} targets unknown application ${contribution.targetApplicationId}.`,
      );
    }

    if (
      application.subApplications.some(
        (candidate) => candidate.id === contribution.subApplication.id,
      )
    ) {
      throw new NavigationDefinitionError(
        `Navigation application ${application.id} already contains sub-application id ${contribution.subApplication.id}.`,
      );
    }

    const merged = cloneAndSortApplication({
      ...application,
      subApplications: [
        ...application.subApplications,
        contribution.subApplication,
      ],
    });
    validateNavigationApplication(merged);
    applicationMap.set(application.id, merged);
  });

  return Array.from(applicationMap.values()).sort(compareOrdered);
}

export function findNavigationDestination(
  application: NavigationApplicationDefinition,
  destinationId: string,
): {
  destination: NavigationDestinationDefinition;
  subApplication: NavigationSubApplicationDefinition;
} | null {
  for (const subApplication of application.subApplications) {
    const destination = subApplication.destinations.find(
      (candidate) => candidate.id === destinationId,
    );

    if (destination) {
      return { destination, subApplication };
    }
  }

  return null;
}
