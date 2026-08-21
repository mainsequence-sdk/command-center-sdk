export interface VersionedDocument {
  schemaVersion?: number;
}

export interface MigrationStep<T> {
  from: number;
  to: number;
  migrate: (value: Readonly<T>) => T;
}

export interface MigrationResult<T> {
  value: T;
  fromVersion: number;
  toVersion: number;
  appliedVersions: number[];
}

export function runOrderedMigrations<T>(input: {
  value: T;
  currentVersion: number;
  targetVersion: number;
  steps: readonly MigrationStep<T>[];
}): MigrationResult<T> {
  if (!Number.isInteger(input.currentVersion) || input.currentVersion < 1) {
    throw new RangeError("currentVersion must be a positive integer.");
  }
  if (!Number.isInteger(input.targetVersion) || input.targetVersion < input.currentVersion) {
    throw new RangeError("targetVersion must be an integer at or above currentVersion.");
  }

  const byFrom = new Map<number, MigrationStep<T>>();
  input.steps.forEach((step) => {
    if (step.to !== step.from + 1) {
      throw new Error(`Migration ${step.from} -> ${step.to} must advance exactly one version.`);
    }
    if (byFrom.has(step.from)) {
      throw new Error(`Duplicate migration starting at version ${step.from}.`);
    }
    byFrom.set(step.from, step);
  });

  let version = input.currentVersion;
  let value = input.value;
  const appliedVersions: number[] = [];

  while (version < input.targetVersion) {
    const step = byFrom.get(version);
    if (!step) {
      throw new Error(`Missing migration from version ${version} to ${version + 1}.`);
    }
    value = step.migrate(value);
    version = step.to;
    appliedVersions.push(version);
  }

  return {
    value,
    fromVersion: input.currentVersion,
    toVersion: version,
    appliedVersions,
  };
}
