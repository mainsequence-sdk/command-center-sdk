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

export class ProjectSdkMaintenanceError extends Error {
  constructor(message, { stage, projectRoot, cause } = {}) {
    super(message, { cause });
    this.name = "ProjectSdkMaintenanceError";
    this.stage = stage || "unknown";
    this.projectRoot = projectRoot || null;
  }

  toJSON() {
    return {
      error: this.message,
      stage: this.stage,
      projectRoot: this.projectRoot,
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
    throw new ProjectSdkMaintenanceError(
      `Could not run ${commandText(command, args)}: ${result.error.message}`,
      { stage, projectRoot: cwd, cause: result.error },
    );
  }
  if (!allowStatuses.includes(result.status)) {
    const detail = resultText(result);
    throw new ProjectSdkMaintenanceError(
      `${commandText(command, args)} failed with status ${result.status ?? "unknown"}${detail ? `: ${detail}` : "."}`,
      { stage, projectRoot: cwd },
    );
  }
  return result;
}

async function readJson(path, { stage, missingMessage }) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT" && missingMessage) {
      throw new ProjectSdkMaintenanceError(missingMessage, {
        stage,
        projectRoot: resolve(path, ".."),
        cause: error,
      });
    }
    throw new ProjectSdkMaintenanceError(`Could not read valid JSON from ${path}: ${error.message}`, {
      stage,
      projectRoot: resolve(path, ".."),
      cause: error,
    });
  }
}

async function readInstalledVersion(projectRoot) {
  const manifestPath = join(
    projectRoot,
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
    throw new ProjectSdkMaintenanceError(
      `Could not inspect the installed Command Center SDK at ${manifestPath}: ${error.message}`,
      { stage: "inspect-installed-sdk", projectRoot, cause: error },
    );
  }
}

function dependencyDeclaration(manifest, projectRoot) {
  const declarations = DEPENDENCY_SECTIONS.flatMap((section) => {
    const value = manifest?.[section]?.[COMMAND_CENTER_SDK_PACKAGE];
    return typeof value === "string" ? [{ section, value: value.trim() }] : [];
  });
  if (declarations.length > 1) {
    throw new ProjectSdkMaintenanceError(
      `${COMMAND_CENTER_SDK_PACKAGE} must be declared in exactly one dependency section; found ${declarations.map(({ section }) => section).join(", ")}.`,
      { stage: "inspect-package-manifest", projectRoot },
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

function parseJsonOutput(raw, label, projectRoot, { allowEmpty = false } = {}) {
  const source = String(raw || "").trim();
  if (!source && allowEmpty) return {};
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new ProjectSdkMaintenanceError(`${label} returned invalid JSON.`, {
      stage: "resolve-sdk-registry-state",
      projectRoot,
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
      return "The project SDK dependency, lockfile, and installed package are aligned.";
    case "update_available":
      return "Run command-center-sdk project update-sdk --path .";
    case "constraint_blocked":
      return `The declared dependency ${declared} does not allow the registry latest version; review package.json before crossing that compatibility boundary.`;
    case "lock_missing":
      return "The SDK is declared but missing from package-lock.json.";
    case "install_required":
      return "The locked SDK is not installed in node_modules.";
    case "installed_drift":
      return "The installed SDK version differs from package-lock.json.";
    case "not_declared":
      return `Install ${COMMAND_CENTER_SDK_PACKAGE} before using project update-sdk.`;
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

export function createProjectSdkMaintenanceLocalOps({
  spawnSyncImpl = spawnSync,
  processEnv = process.env,
} = {}) {
  return {
    async resolveProjectRoot(path) {
      const projectRoot = resolve(path || process.cwd());
      let projectStat;
      try {
        projectStat = await stat(projectRoot);
      } catch (error) {
        throw new ProjectSdkMaintenanceError(
          `Project directory does not exist: ${projectRoot}`,
          { stage: "resolve-project-root", projectRoot, cause: error },
        );
      }
      if (!projectStat.isDirectory()) {
        throw new ProjectSdkMaintenanceError(`Project path is not a directory: ${projectRoot}`, {
          stage: "resolve-project-root",
          projectRoot,
        });
      }

      const gitResult = runSpawn(
        spawnSyncImpl,
        "git",
        ["rev-parse", "--show-toplevel"],
        { cwd: projectRoot, env: processEnv, stage: "resolve-project-root" },
      );
      const repositoryRootOutput = String(gitResult.stdout || "").trim();
      if (!repositoryRootOutput) {
        throw new ProjectSdkMaintenanceError("Git did not return a repository root.", {
          stage: "resolve-project-root",
          projectRoot,
        });
      }
      const repositoryRoot = resolve(repositoryRootOutput);
      const [canonicalProjectRoot, canonicalRepositoryRoot] = await Promise.all([
        realpath(projectRoot),
        realpath(repositoryRoot),
      ]);
      if (canonicalProjectRoot !== canonicalRepositoryRoot) {
        throw new ProjectSdkMaintenanceError(
          `Command Center project commands require the Vite application at the Git repository root (${repositoryRoot}); received nested project directory ${projectRoot}.`,
          { stage: "resolve-project-root", projectRoot },
        );
      }
      return projectRoot;
    },

    async readLocalState(projectRoot) {
      const manifestPath = join(projectRoot, "package.json");
      const lockPath = join(projectRoot, "package-lock.json");
      const [manifest, lockfile, installed] = await Promise.all([
        readJson(manifestPath, {
          stage: "inspect-package-manifest",
          missingMessage: `Command Center SDK maintenance requires ${manifestPath}.`,
        }),
        readJson(lockPath, {
          stage: "inspect-package-lock",
          missingMessage: `Command Center SDK maintenance requires ${lockPath}.`,
        }),
        readInstalledVersion(projectRoot),
      ]);
      const declaration = dependencyDeclaration(manifest, projectRoot);
      return {
        declaration,
        locked: lockedVersion(lockfile),
        installed,
      };
    },

    readRegistryState(projectRoot, { declaration }) {
      const latestResult = runSpawn(
        spawnSyncImpl,
        "npm",
        ["view", COMMAND_CENTER_SDK_PACKAGE, "dist-tags.latest", "--json"],
        {
          cwd: projectRoot,
          env: processEnv,
          stage: "resolve-sdk-registry-state",
        },
      );
      const latestPayload = parseJsonOutput(
        latestResult.stdout,
        "npm view",
        projectRoot,
      );
      const latest = registryVersion(latestPayload);
      if (!latest) {
        throw new ProjectSdkMaintenanceError(
          `npm did not return a latest version for ${COMMAND_CENTER_SDK_PACKAGE}.`,
          { stage: "resolve-sdk-registry-state", projectRoot },
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
          cwd: projectRoot,
          env: processEnv,
          allowStatuses: [0, 1],
          stage: "resolve-sdk-registry-state",
        },
      );
      const outdatedPayload = parseJsonOutput(
        outdatedResult.stdout,
        "npm outdated",
        projectRoot,
        { allowEmpty: true },
      );
      const entry = outdatedPayload?.[COMMAND_CENTER_SDK_PACKAGE];
      return {
        latest,
        current: registryVersion(entry?.current),
        wanted: registryVersion(entry?.wanted),
      };
    },

    updateSdk(projectRoot, { quiet = false } = {}) {
      runSpawn(
        spawnSyncImpl,
        "npm",
        ["update", COMMAND_CENTER_SDK_PACKAGE, "--save"],
        {
          cwd: projectRoot,
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

export const projectSdkMaintenanceLocalOps = createProjectSdkMaintenanceLocalOps();

export async function inspectProjectSdk({
  projectDir,
  localOps = projectSdkMaintenanceLocalOps,
} = {}) {
  const projectRoot = await localOps.resolveProjectRoot(projectDir);
  const local = await localOps.readLocalState(projectRoot);
  const registry = await localOps.readRegistryState(projectRoot, {
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
    command: "command-center-sdk project sdk-status",
    projectRoot,
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

export async function updateProjectSdk({
  projectDir,
  dryRun = false,
  quiet = false,
  localOps = projectSdkMaintenanceLocalOps,
  onPlan,
} = {}) {
  const before = await inspectProjectSdk({ projectDir, localOps });
  if (!before.updateSupported) {
    throw new ProjectSdkMaintenanceError(before.hint, {
      stage: "update-sdk-preflight",
      projectRoot: before.projectRoot,
    });
  }

  const shouldRun = !new Set(["current", "constraint_blocked"]).has(before.status);
  const plan = {
    command: "command-center-sdk project update-sdk",
    dryRun: Boolean(dryRun),
    projectRoot: before.projectRoot,
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

  await localOps.updateSdk(before.projectRoot, { quiet });
  const after = await inspectProjectSdk({ projectDir: before.projectRoot, localOps });
  if (INCOMPATIBLE_AFTER_UPDATE.has(after.status)) {
    throw new ProjectSdkMaintenanceError(
      `SDK update completed but the project remains inconsistent (${after.status}): ${after.hint}`,
      { stage: "verify-sdk-update", projectRoot: before.projectRoot },
    );
  }
  return {
    ...plan,
    updated: hasChanged(before, after),
    after,
  };
}
