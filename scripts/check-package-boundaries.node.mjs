import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  discoverPublishablePackages,
  findPackageBoundaryViolations,
} from "./check-package-boundaries.mjs";

const scriptsRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptsRoot, "..");
const fixturesRoot = path.join(scriptsRoot, "fixtures", "package-boundaries");

test("accepts public-package imports and local package-relative imports", () => {
  const packageRoot = path.join(fixturesRoot, "valid-package");
  const violations = findPackageBoundaryViolations({ packageRoot });

  assert.deepEqual(violations, []);
});

test("rejects the application alias in the negative package fixture", () => {
  const packageRoot = path.join(fixturesRoot, "invalid-application-alias");
  const violations = findPackageBoundaryViolations({ packageRoot });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.specifier, "@/auth/auth-store");
  assert.match(violations[0]?.reason ?? "", /application paths/);
});

test("rejects relative traversal outside a publishable package", () => {
  const packageRoot = path.join(fixturesRoot, "invalid-relative-traversal");
  const violations = findPackageBoundaryViolations({ packageRoot });

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.specifier, "../../shared/private-runtime");
  assert.match(violations[0]?.reason ?? "", /must not traverse outside/);
});

test("discovers only the unified SDK as publishable", () => {
  const packages = discoverPublishablePackages();

  assert.deepEqual(
    packages.map((workspacePackage) => workspacePackage.name),
    ["@dev-mainsequence/command-center-sdk"],
  );
  assert.equal(
    path.relative(repositoryRoot, packages[0]?.packageRoot ?? ""),
    "command-center-sdk",
  );
});
