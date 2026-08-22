import {
  createProjectSyncApi,
  resolveProjectSyncConfiguration,
} from "./project-sync-api.mjs";
import {
  projectSyncLocalOps,
  sanitizeCommitMessage,
} from "./project-sync-local-ops.mjs";

export const PROJECT_SYNC_COMMANDS = Object.freeze([
  "ensure or create the repository SSH key",
  "register a new or inaccessible SSH key through the owning Project",
  "git push --dry-run --follow-tags origin HEAD:refs/heads/<branch>",
  "npm version patch --no-git-tag-version",
  "request backend default redeployment tag for the resolved ProjectBranch",
  "npm install --package-lock-only",
  "npm ci",
  "git add -A",
  "git commit -m <message>",
  "git tag -a <backend tag> -m <backend tag>",
  "git push --follow-tags origin HEAD:refs/heads/<branch> refs/tags/<backend tag>:refs/tags/<backend tag>",
]);

export class ProjectSyncError extends Error {
  constructor(message, { stage, state, cause } = {}) {
    super(message, { cause });
    this.name = "ProjectSyncError";
    this.stage = stage || "unknown";
    this.state = state || {};
  }

  toJSON() {
    return {
      error: this.message,
      stage: this.stage,
      projectDir: this.state.projectDir || null,
      projectUid: this.state.projectUid || null,
      gitBranch: this.state.gitBranch || null,
      projectBranchUid: this.state.projectBranchUid || null,
      version: this.state.version || null,
      tagName: this.state.tagName || null,
      completed: [...(this.state.completed || [])],
    };
  }
}

export async function syncProject({
  message,
  projectUid,
  projectDir,
  dryRun = false,
  quiet = false,
  env = process.env,
  backendUrl,
  accessToken,
  fetchImpl,
  localOps = projectSyncLocalOps,
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
    state.projectDir = await complete("resolve-project-directory", () =>
      localOps.resolveProjectDir(projectDir),
    );
    stage = "resolve-project-uid";
    state.projectUid = String(
      projectUid || (await localOps.readProjectUid(state.projectDir)) || "",
    ).trim();
    if (!state.projectUid) {
      throw new Error(
        `MAIN_SEQUENCE_PROJECT_UID is not configured in ${state.projectDir}/.env.`,
      );
    }
    state.completed.push(stage);

    const inspection = await complete("inspect-project", () =>
      localOps.inspectProject(state.projectDir),
    );
    Object.assign(state, inspection);

    let projectApi = api;
    if (!projectApi) {
      stage = "resolve-backend-configuration";
      const configuration = resolveProjectSyncConfiguration({ backendUrl, accessToken, env });
      if (!configuration.available) {
        throw new Error(`Project sync requires ${configuration.missing.join(" and ")}.`);
      }
      projectApi = createProjectSyncApi({
        backendUrl: configuration.backendUrl,
        accessToken: configuration.accessToken,
        fetchImpl,
      });
      state.completed.push(stage);
    }

    const branchContext = await complete("resolve-project-branch", () =>
      projectApi.resolveProjectBranch(state.projectUid, state.gitBranch),
    );
    state.projectBranchUid = branchContext.projectBranchUid;
    if (branchContext.gitBranch !== state.gitBranch) {
      throw new Error("Backend ProjectBranch resolution returned another Git branch.");
    }

    const plan = {
      command: "command-center-sdk project sync",
      dryRun: Boolean(dryRun),
      projectDir: state.projectDir,
      projectUid: state.projectUid,
      gitBranch: state.gitBranch,
      projectBranchUid: state.projectBranchUid,
      currentVersion: state.currentVersion,
      commands: [...PROJECT_SYNC_COMMANDS],
    };
    if (onPlan) await onPlan(plan);
    if (dryRun) return { ...plan, version: null, tagName: null, completed: [...state.completed] };

    const repositoryKey = await complete("ensure-repository-ssh-key", () =>
      localOps.ensureRepositoryKey(state.origin, { quiet }),
    );
    const gitEnv = localOps.gitEnvironment(repositoryKey.keyPath);
    const registerDeployKey = () =>
      projectApi.addProjectDeployKey(state.projectUid, {
        keyTitle: repositoryKey.keyTitle,
        publicKey: repositoryKey.publicKey,
      });
    const verifyGitPush = () =>
      localOps.verifyGitPush(state.projectDir, state.gitBranch, gitEnv, { quiet });

    if (repositoryKey.created) {
      await complete("register-project-deploy-key", registerDeployKey);
      await complete("verify-git-push-access", verifyGitPush);
    } else {
      stage = "verify-git-push-access";
      try {
        await verifyGitPush();
        state.completed.push(stage);
      } catch {
        await complete("register-project-deploy-key", registerDeployKey);
        await complete("verify-git-push-access", verifyGitPush);
      }
    }

    await complete("bump-version", () =>
      localOps.runCommand("npm", ["version", "patch", "--no-git-tag-version"], {
        cwd: state.projectDir,
        env: gitEnv,
        quiet,
      }),
    );
    state.version = await complete("read-version", () =>
      localOps.readPackageVersion(state.projectDir),
    );
    state.tagName = await complete("render-branch-tag", () =>
      projectApi.renderDefaultRedeploymentTag(state.projectBranchUid, state.version),
    );
    await complete("validate-branch-tag", () =>
      localOps.validateGitTag(state.projectDir, state.tagName, gitEnv),
    );
    await complete("update-lockfile", () =>
      localOps.runCommand("npm", ["install", "--package-lock-only"], {
        cwd: state.projectDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("install-lockfile", () =>
      localOps.runCommand("npm", ["ci"], {
        cwd: state.projectDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("stage", () =>
      localOps.runCommand("git", ["add", "-A"], {
        cwd: state.projectDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("commit", () =>
      localOps.runCommand("git", ["commit", "-m", state.message], {
        cwd: state.projectDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("tag", () =>
      localOps.runCommand("git", ["tag", "-a", state.tagName, "-m", state.tagName], {
        cwd: state.projectDir,
        env: gitEnv,
        quiet,
      }),
    );
    await complete("push", () =>
      localOps.runCommand(
        "git",
        [
          "push",
          "--follow-tags",
          "origin",
          `HEAD:refs/heads/${state.gitBranch}`,
          `refs/tags/${state.tagName}:refs/tags/${state.tagName}`,
        ],
        {
          cwd: state.projectDir,
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
    if (error instanceof ProjectSyncError) throw error;
    throw new ProjectSyncError(`Project sync failed during ${stage}: ${error.message}`, {
      stage,
      state,
      cause: error,
    });
  }
}
