import { describe, expect, it } from "vitest";
import {
  assertWidgetPreviewFixture,
  validateWidgetManifest,
} from "@dev-mainsequence/command-center-sdk/widget/testing";

import extension, { helloWidgetModule } from "./index.js";

describe("basic widget package example", () => {
  it("has a valid manifest, preview fixture, and explicit extension", () => {
    expect(validateWidgetManifest(helloWidgetModule.manifest)).toEqual([]);
    expect(() => assertWidgetPreviewFixture(helloWidgetModule)).not.toThrow();
    expect(extension.widgets).toEqual([helloWidgetModule]);
  });
});
