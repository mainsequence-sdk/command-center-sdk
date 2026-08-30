import { spawnSync } from "node:child_process";
import { readFile, realpath, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

export const COMMAND_CENTER_SDK_PACKAGE = "@dev-mainsequence/command-center-sdk";

const DEPENDENCY_SECTIONS = Object.freeze([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
  "peerDependencies",
]);
const MUTABLE_DEPENDENCY_SECTIONS = new Set([
  "dependencies",
  "devDependencies",
  "optionalDependencies",
]);
const INCOMPATIBLE_AFTER_UPDATE = new Set([
  "lock_missing",
  "install_required",
  "installed_drift",
  "update_available",
]);

export class ApplicationSdkMaintenanceError extends Error {
  constructor(message, { stage, applicationRoot, cause } = {}) {
    super(message, { cause });
    this.name = "ApplicationSdkMaintenanceError";
    this.stage = stage || "unknown";
    this.applicationRoot = applicationRoot || null;
  }

  toJSON() {
    return {
      error: this.message,
      stage: this.stage,
      applicationRoot: this.applicationRoot,
    };
  }
}

function commandText(command, args) {
  return [command, ...args].join(" ");
}

function resultText(result) {
  const raw = String(result?.stderr || result?.stdout || "").trim();
  return raw.length > 1_000 ? `${raw.slice(0, 1_000)}…` : raw;
}

function runSpawn(
  spawnSyncImpl,
  command,
  args,
  { cwd, env, quiet = true, allowStatuses = [0], stage } = {},
) {
  const result = spawnSyncImpl(command, args, {
    cwd,
    env,
    encoding: "utf8",
    stdio: quiet ? "pipe" : "inherit",
  });
  if (result.error) {
    throw new ApplicationSdkMaintenanceError(
      `Could not run ${commandText(command, args)}: ${result.error.message}`,
      { stage, applicationRoot: cwd, cause: result.error },
    );
  }
  if (!allowStatuses.includes(result.status)) {
    const detail = resultText(result);
    throw new ApplicationSdkMaintenanceError(
      `${commandText(command, args)} failed with status ${result.status ?? "unknown"}${detail ? `: ${detail}` : "."}`,
      { stage, applicationRoot: cwd },
    );
  }
  return result;
}

async function readJson(path, { stage, missingMessage }) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && missingMessage) {
      throw new ApplicationSdkMaintenanceError(missingMessage, {
        stage,
        applicationRoot: resolve(path, ".."),
        cause: error,
      });
    }
    throw new ApplicationSdkMaintenanceError(`Could not read valid JSON from ${path}: ${error.message}`, {
      stage,
      applicationRoot: resolve(path, ".."),
      cause: error,
    });
  }
}

async function readInstalledVersion(applicationRoot) {
  const manifestPath = join(
    applicationRoot,
    "node_modules",
    "@dev-mainsequence",
    "command-center-sdk",
    "package.json",
  );
  try {
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    return typeof manifest.version === "string" ? manifest.version.trim() || null : null;
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new ApplicationSdkMaintenanceError(
      `Could not inspect the installed Command Center SDK at ${manifestPath}: ${error.message}`,
      { stage: "inspect-installed-sdk", applicationRoot, cause: error },
    );
  }
}

function dependencyDeclaration(manifest, applicationRoot) {
  const declarations = DEPENDENCY_SECTIONS.flatMap((section) => {
    const value = manifest?.[section]?.[COMMAND_CENTER_SDK_PACKAGE];
    return typeof value === "string" ? [{ section, value: value.trim() }] : [];
  });
  if (declarations.length > 1) {
    throw new ApplicationSdkMaintenanceError(
      `${COMMAND_CENTER_SDK_PACKAGE} must be declared in exactly one dependency section; found ${declarations.map(({ section }) => section).join(", ")}.`,
      { stage: "inspect-package-manifest", applicationRoot },
    );
  }
  return declarations[0] || null;
}

function lockedVersion(lockfile) {
  const packageEntry =
    lockfile?.packages?.[`node_modules/${COMMAND_CENTER_SDK_PACKAGE}`] ??
    lockfile?.dependencies?.[COMMAND_CENTER_SDK_PACKAGE];
  return typeof packageEntry?.version === "string"
    ? packageEntry.version.trim() || null
    : null;
}

function isRegistryDependencySpec(spec) {
  if (!spec) return false;
  return !(
    /^(?:file:|link:|workspace:|npm:|git(?:\+|:)|github:|https?:|ssh:|\.?\.?\/|\/)/iu.test(
      spec,
    ) ||
    spec.includes("://") ||
    spec.includes("/")
  );
}

function parseJsonOutput(raw, label, applicationRoot, { allowEmpty = false } = {}) {
  const source = String(raw || "").trim();
  if (!source && allowEmpty) return {};
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new ApplicationSdkMaintenanceError(`${label} returned invalid JSON.`, {
      stage: "resolve-sdk-registry-state",
      applicationRoot,
      cause: error,
    });
  }
}

function registryVersion(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized && normalized.toUpperCase() !== "MISSING" ? normalized : null;
}

function statusHint(status, declared) {
  switch (status) {
    case "current":
      return "The application SDK dependency, lockfile, and installed package are aligned.";
    case "update_available":
      return "Run command-center-sdk application update-sdk --path .";
    case "constraint_blocked":
      return `The declared dependency ${declared} does not allow the registry latest version; review package.json before crossing that compatibility boundary.`;
    case "lock_missing":
      return "The SDK is declared but missing from package-lock.json.";
    case "install_required":
      return "The locked SDK is not installed in node_modules.";
    case "installed_drift":
      return "The installed SDK version differs from package-lock.json.";
    case "not_declared":
      return `Install ${COMMAND_CENTER_SDK_PACKAGE} before using application update-sdk.`;
    case "unsupported_dependency_type":
      return "The SDK must be a dependency, devDependency, or optionalDependency to be updated.";
    case "unsupported_source":
      return "Linked, workspace, file, Git, alias, and URL SDK sources are not replaced by update-sdk.";
    default:
      return "Inspect the SDK dependency state.";
  }
}

function resolveStatus({ declaration, locked, installed, wanted, latest }) {
  if (!declaration) return "not_declared";
  if (!MUTABLE_DEPENDENCY_SECTIONS.has(declaration.section)) {
    return "unsupported_dependency_type";
  }
  if (!isRegistryDependencySpec(declaration.value)) return "unsupported_source";
  if (!locked) return "lock_missing";
  if (!installed) return "install_required";
  if (installed !== locked) return "installed_drift";
  if (wanted && wanted !== locked) return "update_available";
  if (latest && latest !== locked) return "constraint_blocked";
  return "current";
}

export function createApplicationSdkMaintenanceLocalOps({
  spawnSyncImpl = spawnSync,
  processEnv = process.env,
} = {}) {
  return {
    async resolveApplicationRoot(path) {
      const applicationRoot = resolve(path || process.cwd());
      let applicationStat;
      try {
        applicationStat = await stat(applicationRoot);
      } catch (error) {
        throw new ApplicationSdkMaintenanceError(
          `Application directory does not exist: ${applicationRoot}`,
          { stage: "resolve-application-root", applicationRoot, cause: error },
        );
      }
      if (!applicationStat.isDirectory()) {
        throw new ApplicationSdkMaintenanceError(`Application path is not a directory: ${applicationRoot}`, {
          stage: "resolve-application-root",
          applicationRoot,
        });
      }

      const gitResult = runSpawn(
        spawnSyncImpl,
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd: applicationRoot, env: processEnv, stage: "resolve-application-root" },
      );
      const repositoryRootOutput = String(gitResult.stdout || "").trim();
      if (!repositoryRootOutput) {
        throw new ApplicationSdkMaintenanceError("Git did not return a repository root.", {
          stage: "resolve-application-root",
          applicationRoot,
        });
      }
      const repositoryRoot = resolve(repositoryRootOutput);
      const [canonicalApplicationRoot, canonicalRepositoryRoot] = await Promise.all([
        realpath(applicationRoot),
        realpath(repositoryRoot),
      ]);
      if (canonicalApplicationRoot !== canonicalRepositoryRoot) {
        throw new ApplicationSdkMaintenanceError(
          `Command Center application commands require the Vite application at the Git repository root (${repositoryRoot}); received nested application directory ${applicationRoot}.`,
          { stage: "resolve-application-root", applicationRoot },
        );
      }
      return applicationRoot;
    },

    async readLocalState(applicationRoot) {
      const manifestPath = join(applicationRoot, "package.json");
      const lockPath = join(applicationRoot, "package-lock.json");
      const [manifest, lockfile, installed] = await Promise.all([
        readJson(manifestPath, {
          stage: "inspect-package-manifest",
          missingMessage: `Command Center SDK maintenance requires ${manifestPath}.`,
        }),
        readJson(lockPath, {
          stage: "inspect-package-lock",
          missingMessage: `Command Center SDK maintenance requires ${lockPath}.`,
        }),
        readInstalledVersion(applicationRoot),
      ]);
      const declaration = dependencyDeclaration(manifest, applicationRoot);
      return {
        declaration,
        locked: lockedVersion(lockfile),
        installed,
      };
    },

    readRegistryState(applicationRoot, { declaration }) {
      const latestResult = runSpawn(
        spawnSyncImpl,
        "npm",
        ["view", COMMAND_CENTER_SDK_PACKAGE, "dist-tags.latest", "--json"],
        {
          cwd: applicationRoot,
          env: processEnv,
          stage: "resolve-sdk-registry-state",
        },
      );
      const latestPayload = parseJsonOutput(
        latestResult.stdout,
        "npm view",
        applicationRoot,
      );
      const latest = registryVersion(latestPayload);
      if (!latest) {
        throw new ApplicationSdkMaintenanceError(
          `npm did not return a latest version for ${COMMAND_CENTER_SDK_PACKAGE}.`,
          { stage: "resolve-sdk-registry-state", applicationRoot },
        );
      }

      if (
        !declaration ||
        !MUTABLE_DEPENDENCY_SECTIONS.has(declaration.section) ||
        !isRegistryDependencySpec(declaration.value)
      ) {
        return { latest, current: null, wanted: null };
      }
      const outdatedResult = runSpawn(
        spawnSyncImpl,
        "npm",
        ["outdated", COMMAND_CENTER_SDK_PACKAGE, "--json", "--long"],
        {
          cwd: applicationRoot,
          env: processEnv,
          allowStatuses: [0, 1],
          stage: "resolve-sdk-registry-state",
        },
      );
      const outdatedPayload = parseJsonOutput(
        outdatedResult.stdout,
        "npm outdated",
        applicationRoot,
        { allowEmpty: true },
      );
      const entry = outdatedPayload?.[COMMAND_CENTER_SDK_PACKAGE];
      return {
        latest,
        current: registryVersion(entry?.current),
        wanted: registryVersion(entry?.wanted),
      };
    },

    updateSdk(applicationRoot, { quiet = false } = {}) {
      runSpawn(
        spawnSyncImpl,
        "npm",
        ["update", COMMAND_CENTER_SDK_PACKAGE, "--save"],
        {
          cwd: applicationRoot,
          env: {
            ...processEnv,
            COMMAND_CENTER_SDK_MCP_POSTINSTALL: "0",
          },
          quiet,
          stage: "update-sdk",
        },
      );
    },
  };
}

export const applicationSdkMaintenanceLocalOps = createApplicationSdkMaintenanceLocalOps();

export async function inspectApplicationSdk({
  applicationDir,
  localOps = applicationSdkMaintenanceLocalOps,
} = {}) {
  const applicationRoot = await localOps.resolveApplicationRoot(applicationDir);
  const local = await localOps.readLocalState(applicationRoot);
  const registry = await localOps.readRegistryState(applicationRoot, {
    declaration: local.declaration,
  });
  const wanted =
    registry.wanted || registry.current || local.installed || local.locked || null;
  const status = resolveStatus({
    declaration: local.declaration,
    locked: local.locked,
    installed: local.installed,
    wanted,
    latest: registry.latest,
  });
  return {
    command: "command-center-sdk application sdk-status",
    applicationRoot,
    package: COMMAND_CENTER_SDK_PACKAGE,
    dependencyType: local.declaration?.section || null,
    declared: local.declaration?.value || null,
    locked: local.locked,
    installed: local.installed,
    wanted,
    latest: registry.latest,
    status,
    updateAvailable: status === "update_available",
    updateSupported: !new Set([
      "not_declared",
      "unsupported_dependency_type",
      "unsupported_source",
    ]).has(status),
    hint: statusHint(status, local.declaration?.value || null),
  };
}

function hasChanged(before, after) {
  return ["declared", "locked", "installed"].some(
    (field) => before[field] !== after[field],
  );
}

export async function updateApplicationSdk({
  applicationDir,
  dryRun = false,
  quiet = false,
  localOps = applicationSdkMaintenanceLocalOps,
  onPlan,
} = {}) {
  const before = await inspectApplicationSdk({ applicationDir, localOps });
  if (!before.updateSupported) {
    throw new ApplicationSdkMaintenanceError(before.hint, {
      stage: "update-sdk-preflight",
      applicationRoot: before.applicationRoot,
    });
  }

  const shouldRun = !new Set(["current", "constraint_blocked"]).has(before.status);
  const plan = {
    command: "command-center-sdk application update-sdk",
    dryRun: Boolean(dryRun),
    applicationRoot: before.applicationRoot,
    package: COMMAND_CENTER_SDK_PACKAGE,
    before,
    commands: shouldRun
      ? [`npm update ${COMMAND_CENTER_SDK_PACKAGE} --save`]
      : [],
  };
  if (onPlan) await onPlan(plan);
  if (dryRun) {
    return {
      ...plan,
      updated: false,
      after: null,
    };
  }
  if (!shouldRun) {
    return {
      ...plan,
      updated: false,
      after: before,
    };
  }

  await localOps.updateSdk(before.applicationRoot, { quiet });
  const after = await inspectApplicationSdk({ applicationDir: before.applicationRoot, localOps });
  if (INCOMPATIBLE_AFTER_UPDATE.has(after.status)) {
    throw new ApplicationSdkMaintenanceError(
      `SDK update completed but the application remains inconsistent (${after.status}): ${after.hint}`,
      { stage: "verify-sdk-update", applicationRoot: before.applicationRoot },
    );
  }
  return {
    ...plan,
    updated: hasChanged(before, after),
    after,
  };
}
