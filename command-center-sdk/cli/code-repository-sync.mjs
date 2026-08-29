import {
  createCodeRepositorySyncApi,
  resolveCodeRepositorySyncConfiguration,
} from "./code-repository-sync-api.mjs";
import {
  nextNpmPatchVersion,
  codeRepositorySyncLocalOps,
  sanitizeCommitMessage,
} from "./code-repository-sync-local-ops.mjs";

export const CODE_REPOSITORY_SYNC_COMMANDS = Object.freeze([
  "resolve the exact CodeRepositoryBranch from canonical Git origin, attached branch, and HEAD commit",
  "calculate the next npm patch version",
  "request backend default redeployment tag for the resolved CodeRepositoryBranch",
  "verify the backend tag does not exist locally",
  "ensure or create the repository SSH key",
  "register a new or inaccessible SSH key through the owning CodeRepository",
  "git push --dry-run --follow-tags origin HEAD:refs/heads/<branch>",
  "verify the exact backend tag does not exist remotely",
  "npm version patch --no-git-tag-version",
  "verify the bumped version matches the preflight version",
  "npm install --package-lock-only",
  "npm ci",
  "git add -A",
  "git commit -m <message>",
  "git tag -a <backend tag> -m <backend tag>",
  "git push --atomic --follow-tags origin HEAD:refs/heads/<branch> refs/tags/<backend tag>:refs/tags/<backend tag>",
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
      canonicalRepositoryIdentity: this.state.canonicalRepositoryIdentity || null,
      codeRepositoryUid: this.state.codeRepositoryUid || null,
      gitBranch: this.state.gitBranch || null,
      repositoryRef: this.state.repositoryRef || null,
      commitSha: this.state.commitSha || null,
      codeRepositoryBranchUid: this.state.codeRepositoryBranchUid || null,
      nextVersion: this.state.nextVersion || null,
      version: this.state.version || null,
      tagName: this.state.tagName || null,
      completed: [...(this.state.completed || [])],
    };
  }
}

export async function syncCodeRepository({
  message,
  codeRepositoryUid,
  codeRepositoryDir,
  dryRun = false,
  quiet = false,
  env = process.env,
  backendUrl,
  accessToken,
  fetchImpl,
  localOps = codeRepositorySyncLocalOps,
  api,
  onPlan,
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
    state.message = sanitizeCommitMessage(message);
    state.codeRepositoryDir = await complete("resolve-code-repository-directory", () =>
      localOps.resolveCodeRepositoryDir(codeRepositoryDir),
    );
    const inspection = await complete("inspect-code-repository", () =>
      localOps.inspectCodeRepository(state.codeRepositoryDir),
    );
    Object.assign(state, inspection);

    let codeRepositoryApi = api;
    if (!codeRepositoryApi) {
      stage = "resolve-backend-configuration";
      const configuration = resolveCodeRepositorySyncConfiguration({ backendUrl, accessToken, env });
      if (!configuration.available) {
        throw new Error(`CodeRepository sync requires ${configuration.missing.join(" and ")}.`);
      }
      codeRepositoryApi = createCodeRepositorySyncApi({
        backendUrl: configuration.backendUrl,
        accessToken: configuration.accessToken,
        fetchImpl,
      });
      state.completed.push(stage);
    }

    const branchContext = await complete("resolve-git-context", () =>
      codeRepositoryApi.resolveGitContext({
        repositoryIdentity: state.canonicalRepositoryIdentity,
        repositoryBranch: state.gitBranch,
        commitSha: state.commitSha,
      }),
    );
    state.codeRepositoryUid = branchContext.codeRepositoryUid;
    state.codeRepositoryBranchUid = branchContext.codeRepositoryBranchUid;
    if (
      branchContext.canonicalRepositoryIdentity !== state.canonicalRepositoryIdentity ||
      branchContext.gitBranch !== state.gitBranch ||
      branchContext.repositoryRef !== state.repositoryRef ||
      branchContext.commitSha !== state.commitSha
    ) {
      throw new Error("Backend Git-context resolution does not match the inspected Git checkout.");
    }
    const expectedCodeRepositoryUid = String(codeRepositoryUid || "").trim();
    if (expectedCodeRepositoryUid) {
      await complete("assert-code-repository-uid", () => {
        if (expectedCodeRepositoryUid !== state.codeRepositoryUid) {
          throw new Error(
            `Expected CodeRepository UID ${JSON.stringify(expectedCodeRepositoryUid)} does not match Git-resolved CodeRepository ${JSON.stringify(state.codeRepositoryUid)}.`,
          );
        }
      });
    }

    state.nextVersion = await complete("calculate-next-version", () =>
      nextNpmPatchVersion(state.currentVersion),
    );
    state.tagName = await complete("render-branch-tag", () =>
      codeRepositoryApi.renderDefaultRedeploymentTag(state.codeRepositoryBranchUid, state.nextVersion),
    );
    await complete("validate-local-branch-tag", () =>
      localOps.validateGitTag(state.codeRepositoryDir, state.tagName),
    );

    const plan = {
      command: "command-center-sdk code-repository sync",
      dryRun: Boolean(dryRun),
      codeRepositoryDir: state.codeRepositoryDir,
      canonicalRepositoryIdentity: state.canonicalRepositoryIdentity,
      codeRepositoryUid: state.codeRepositoryUid,
      gitBranch: state.gitBranch,
      repositoryRef: state.repositoryRef,
      commitSha: state.commitSha,
      codeRepositoryBranchUid: state.codeRepositoryBranchUid,
      currentVersion: state.currentVersion,
      nextVersion: state.nextVersion,
      tagName: state.tagName,
      commands: [...CODE_REPOSITORY_SYNC_COMMANDS],
    };
    if (onPlan) await onPlan(plan);
    if (dryRun) return { ...plan, version: state.nextVersion, completed: [...state.completed] };

    const repositoryKey = await complete("ensure-repository-ssh-key", () =>
      localOps.ensureRepositoryKey(state.origin, { quiet }),
    );
    const gitEnv = localOps.gitEnvironment(repositoryKey.keyPath);
    const registerDeployKey = () =>
      codeRepositoryApi.addCodeRepositoryDeployKey(state.codeRepositoryUid, {
        keyTitle: repositoryKey.keyTitle,
        publicKey: repositoryKey.publicKey,
      });
    const verifyGitPush = () =>
      localOps.verifyGitPush(state.codeRepositoryDir, state.gitBranch, gitEnv, { quiet });

    if (repositoryKey.created) {
      await complete("register-code-repository-deploy-key", registerDeployKey);
      await complete("verify-git-push-access", verifyGitPush);
    } else {
      stage = "verify-git-push-access";
      try {
        await verifyGitPush();
        state.completed.push(stage);
      } catch {
        await complete("register-code-repository-deploy-key", registerDeployKey);
        await complete("verify-git-push-access", verifyGitPush);
      }
    }

    await complete("validate-remote-branch-tag", () =>
      localOps.validateRemoteGitTag(state.codeRepositoryDir, state.tagName, gitEnv),
    );

    await complete("bump-version", () =>
      localOps.runCommand("npm", ["version", "patch", "--no-git-tag-version"], {
        cwd: state.codeRepositoryDir,
        env: gitEnv,
        quiet,
      }),
    );
    state.version = await complete("read-version", () =>
      localOps.readPackageVersion(state.codeRepositoryDir),
    );
    await complete("verify-version-bump", () => {
      if (state.version !== state.nextVersion) {
        throw new Error(
          `npm produced version ${state.version}; preflight expected ${state.nextVersion}.`,
        );
      }
    });
    await complete("update-lockfile", () =>
      localOps.runCommand("npm", ["install", "--package-lock-only"], {
        cwd: state.codeRepositoryDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("install-lockfile", () =>
      localOps.runCommand("npm", ["ci"], {
        cwd: state.codeRepositoryDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("stage", () =>
      localOps.runCommand("git", ["add", "-A"], {
        cwd: state.codeRepositoryDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("commit", () =>
      localOps.runCommand("git", ["commit", "-m", state.message], {
        cwd: state.codeRepositoryDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("tag", () =>
      localOps.runCommand("git", ["tag", "-a", state.tagName, "-m", state.tagName], {
        cwd: state.codeRepositoryDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("push", () =>
      localOps.runCommand(
        "git",
        [
          "push",
          "--atomic",
          "--follow-tags",
          "origin",
          `HEAD:refs/heads/${state.gitBranch}`,
          `refs/tags/${state.tagName}:refs/tags/${state.tagName}`,
        ],
        {
          cwd: state.codeRepositoryDir,
          env: gitEnv,
          quiet,
        },
      ),
    );

    return {
      ...plan,
      version: state.version,
      tagName: state.tagName,
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
