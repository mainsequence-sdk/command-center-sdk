import { rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const defaultRepositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function cleanSdkDist({ repositoryRoot = defaultRepositoryRoot } = {}) {
  const resolvedRepositoryRoot = resolve(repositoryRoot);
  const distRoot = join(resolvedRepositoryRoot, "command-center-sdk", "dist");
  rmSync(distRoot, { recursive: true, force: true });
  return distRoot;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  cleanSdkDist();
}
