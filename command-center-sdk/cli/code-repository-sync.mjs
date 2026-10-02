import { codeRepositorySyncLocalOps } from "./code-repository-sync-local-ops.mjs";

// The whole sync, in order. Versions, tags, commits, and pushes belong to the repository and its CI;
// the platform deploys from the pushes as the repository's workflow file says.
const DEPENDENCY_STEPS = Object.freeze([
  Object.freeze({
    stage: "update-lockfile",
    command: "npm",
    args: Object.freeze(["install", "--package-lock-only"]),
  }),
  Object.freeze({ stage: "install-lockfile", command: "npm", args: Object.freeze(["ci"]) }),
]);

export class CodeRepositorySyncError extends Error {
  constructor(message, { stage, state, cause } = {}) {
    super(message, { cause });
    this.name = "CodeRepositorySyncError";
    this.stage = stage || "unknown";
    this.state = state || {};
  }

  toJSON() {
    return {
      error: this.message,
      stage: this.stage,
      codeRepositoryDir: this.state.codeRepositoryDir || null,
      completed: [...(this.state.completed || [])],
    };
  }
}

/**
 * Refreshes `package-lock.json` and installs it with `npm ci` in the code repository's root. It
 * calls no backend and runs no Git command: the person commits and pushes the changed files.
 */
export async function syncCodeRepository({
  codeRepositoryDir,
  quiet = false,
  localOps = codeRepositorySyncLocalOps,
} = {}) {
  const state = { completed: [] };
  let stage = "arguments";

  async function complete(name, operation) {
    stage = name;
    const result = await operation();
    state.completed.push(name);
    return result;
  }

  try {
    state.codeRepositoryDir = await complete("resolve-code-repository-directory", () =>
      localOps.resolveCodeRepositoryDir(codeRepositoryDir),
    );
    await complete("inspect-code-repository", () =>
      localOps.inspectCodeRepository(state.codeRepositoryDir),
    );
    for (const step of DEPENDENCY_STEPS) {
      await complete(step.stage, () =>
        localOps.runCommand(step.command, [...step.args], { cwd: state.codeRepositoryDir, quiet }),
      );
    }
    return {
      command: "command-center-sdk code-repository sync",
      codeRepositoryDir: state.codeRepositoryDir,
      commands: DEPENDENCY_STEPS.map(({ command, args }) => [command, ...args].join(" ")),
      completed: [...state.completed],
    };
  } catch (error) {
    if (error instanceof CodeRepositorySyncError) throw error;
    throw new CodeRepositorySyncError(`CodeRepository sync failed during ${stage}: ${error.message}`, {
      stage,
      state,
      cause: error,
    });
  }
}
