import Ajv2020 from "ajv/dist/2020.js";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  readStaticSiteIframeMessage,
  STATIC_SITE_IFRAME_CONTRACT,
  STATIC_SITE_IFRAME_SCHEMA_ID,
} from "../embed/static-site.js";
import {
  parseBulkActionDiscovery,
  parseBulkActionPreflight,
} from "../resource/bulk-actions.js";
import {
  RESOURCE_BULK_ACTION_DISCOVERY_CONTRACT,
  RESOURCE_BULK_ACTION_EXECUTION_CONTRACT,
  RESOURCE_BULK_ACTION_PREFLIGHT_CONTRACT,
  RESOURCE_COLLECTION_CONTRACT,
  RESOURCE_DISCOVERY_CONTRACT,
} from "../resource/types.js";
import { parseResourceDiscovery } from "../resource/discovery.js";

interface ContractManifestEntry {
  contract: string;
  id: string;
  file: string;
  npmPath: string;
  role: string;
  typescript: {
    entrypoint: string;
    type: string;
  };
  fixtures: {
    valid: string[];
    invalid: string[];
  };
}

interface ContractManifest {
  format: string;
  package: string;
  npmPath: string;
  schemaDialect: string;
  schemas: ContractManifestEntry[];
}

const contractsRoot = fileURLToPath(
  new URL("../../contracts/", import.meta.url),
);

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(join(contractsRoot, path), "utf8"));
}

const manifest = readJson("manifest.json") as ContractManifest;

function createValidator() {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    validateFormats: false,
  });

  manifest.schemas.forEach((entry) => {
    ajv.addSchema(readJson(entry.file), entry.id);
  });
  return ajv;
}

describe("published contract schema bundle", () => {
  it("indexes every public contract and keeps TypeScript identifiers aligned", () => {
    expect(manifest).toMatchObject({
      format: "command-center-contract-manifest@v1",
      package: "@dev-mainsequence/command-center-sdk",
      npmPath: "@dev-mainsequence/command-center-sdk/contracts/manifest.json",
      schemaDialect: "https://json-schema.org/draft/2020-12/schema",
    });

    const contracts = manifest.schemas.map((entry) => entry.contract);
    expect(new Set(contracts).size).toBe(contracts.length);
    expect(contracts).toEqual([
      STATIC_SITE_IFRAME_CONTRACT,
      RESOURCE_COLLECTION_CONTRACT,
      RESOURCE_BULK_ACTION_DISCOVERY_CONTRACT,
      RESOURCE_DISCOVERY_CONTRACT,
      RESOURCE_BULK_ACTION_EXECUTION_CONTRACT,
      RESOURCE_BULK_ACTION_PREFLIGHT_CONTRACT,
    ]);

    const ids = manifest.schemas.map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(
      manifest.schemas.find(
        (entry) => entry.contract === STATIC_SITE_IFRAME_CONTRACT,
      )?.id,
    ).toBe(STATIC_SITE_IFRAME_SCHEMA_ID);
    manifest.schemas.forEach((entry) => {
      expect(readJson(entry.file)).toMatchObject({
        $schema: manifest.schemaDialect,
        $id: entry.id,
      });
      expect(entry.npmPath).toBe(
        `@dev-mainsequence/command-center-sdk/contracts/${entry.file}`,
      );
      expect(entry.typescript.entrypoint).toMatch(
        /^@dev-mainsequence\/command-center-sdk\//u,
      );
      expect(entry.typescript.type.trim()).not.toBe("");
      expect(entry.role.trim()).not.toBe("");
    });
  });

  it("compiles every schema, accepts every valid fixture, and rejects every invalid fixture", () => {
    const ajv = createValidator();

    manifest.schemas.forEach((entry) => {
      const validate = ajv.getSchema(entry.id);
      expect(validate, `Missing compiled schema ${entry.id}`).toBeTypeOf(
        "function",
      );

      entry.fixtures.valid.forEach((fixture) => {
        const value = readJson(fixture);
        expect(
          validate!(value),
          `${fixture}: ${ajv.errorsText(validate!.errors)}`,
        ).toBe(true);
      });
      entry.fixtures.invalid.forEach((fixture) => {
        expect(
          validate!(readJson(fixture)),
          `${fixture} unexpectedly validated`,
        ).toBe(false);
      });
    });
  });

  it("does not leave unindexed schema or fixture JSON files", () => {
    const indexedSchemas = new Set(manifest.schemas.map((entry) => entry.file));
    const actualSchemas = readdirSync(join(contractsRoot, "schemas"))
      .filter((name) => name.endsWith(".json"))
      .map((name) => `schemas/${name}`);
    expect([...indexedSchemas].sort()).toEqual(actualSchemas.sort());

    for (const fixtureKind of ["valid", "invalid"] as const) {
      const indexedFixtures = new Set(
        manifest.schemas.flatMap((entry) => entry.fixtures[fixtureKind]),
      );
      const actualFixtures = readdirSync(
        join(contractsRoot, "fixtures", fixtureKind),
      )
        .filter((name) => name.endsWith(".json"))
        .map((name) => `fixtures/${fixtureKind}/${name}`);
      expect([...indexedFixtures].sort()).toEqual(actualFixtures.sort());
    }
  });

  it("keeps discovery and preflight fixtures aligned with the runtime parsers", () => {
    const discovery = manifest.schemas.find(
      (entry) => entry.contract === RESOURCE_BULK_ACTION_DISCOVERY_CONTRACT,
    )!;
    discovery.fixtures.valid.forEach((fixture) => {
      expect(() => parseBulkActionDiscovery(readJson(fixture))).not.toThrow();
    });
    discovery.fixtures.invalid.forEach((fixture) => {
      expect(() => parseBulkActionDiscovery(readJson(fixture))).toThrow();
    });

    const resourceDiscovery = manifest.schemas.find(
      (entry) => entry.contract === RESOURCE_DISCOVERY_CONTRACT,
    )!;
    resourceDiscovery.fixtures.valid.forEach((fixture) => {
      expect(() => parseResourceDiscovery(readJson(fixture))).not.toThrow();
    });
    resourceDiscovery.fixtures.invalid.forEach((fixture) => {
      expect(() => parseResourceDiscovery(readJson(fixture))).toThrow();
    });

    const preflight = manifest.schemas.find(
      (entry) => entry.contract === RESOURCE_BULK_ACTION_PREFLIGHT_CONTRACT,
    )!;
    preflight.fixtures.valid.forEach((fixture) => {
      expect(() => parseBulkActionPreflight(readJson(fixture))).not.toThrow();
    });
    preflight.fixtures.invalid.forEach((fixture) => {
      expect(() => parseBulkActionPreflight(readJson(fixture))).toThrow();
    });
  });

  it("keeps static-site iframe fixtures aligned with the public runtime parser", () => {
    const iframe = manifest.schemas.find(
      (entry) => entry.contract === STATIC_SITE_IFRAME_CONTRACT,
    )!;
    const channel = "mainsequence.portfolio-dashboard";
    iframe.fixtures.valid.forEach((fixture) => {
      expect(
        readStaticSiteIframeMessage(readJson(fixture), channel),
      ).not.toBeNull();
    });
    iframe.fixtures.invalid.forEach((fixture) => {
      expect(
        readStaticSiteIframeMessage(readJson(fixture), channel),
      ).toBeNull();
    });
  });

  it("keeps the schema's platform request rules aligned with the public runtime parser", () => {
    const validate = createValidator().getSchema(STATIC_SITE_IFRAME_SCHEMA_ID)!;
    const channel = "mainsequence.portfolio-dashboard";
    const messages: unknown[] = [];
    for (const path of [
      "/",
      "/api/projects/?limit=20&search=a%20b",
      "/api/projects/.../",
      "/api/projects/?next=//elsewhere/../x",
      "/api/projects/?filter[name]=a|b^{c}`d",
      "/api/%E2%9C%93/",
      `/${"a".repeat(4_095)}`,
      `/${"a".repeat(4_096)}`,
      "",
      "api/projects/",
      "https://platform.example.com/api/projects/",
      "//platform.example.com/api/projects/",
      "/api//projects/",
      "/api/projects/#top",
      "/api\\projects/",
      "/api/projects/?q=a\\b",
      "/api/../admin/",
      "/api/./projects/",
      "/..",
      "/a/..?x",
      "/a/%2e?x",
      "/api/.%2E/admin/",
      "/api/projects%2Fadmin/",
      "/api/projects%5cadmin/",
      "/a?%2f%2e%2e",
      "/api/projects/%zz",
      "/api/projects/?discount=50%",
      "/api/projects/ with space",
      "/api/projects/é",
      '/api/projects/?q="x"',
    ]) {
      messages.push({
        channel,
        version: 1,
        type: "platform-request",
        payload: { requestId: "platform-parity", method: "GET", path },
      });
    }
    for (const [method, body] of [["POST", "{}"], ["DELETE", ""], ["GET", "{}"]]) {
      messages.push({
        channel,
        version: 1,
        type: "platform-request",
        payload: { requestId: "platform-parity", method, path: "/api/projects/", body },
      });
    }
    for (const [status, body, bodyEncoding] of [
      [100, "x", "text"],
      [599, "", "text"],
      [99, "", "text"],
      [200, "", "base64"],
      [200, "QQ==", "base64"],
      [200, "QUJD", "base64"],
      [200, "QQ=", "base64"],
      [200, "Q Q=", "base64"],
    ]) {
      messages.push({
        channel,
        version: 1,
        type: "platform-response",
        payload: { requestId: "platform-parity", status, headers: {}, body, bodyEncoding },
      });
    }
    const disagreements = messages.filter(
      (message) =>
        validate(message) !== (readStaticSiteIframeMessage(message, channel) !== null),
    );
    expect(disagreements).toEqual([]);
  });
});
