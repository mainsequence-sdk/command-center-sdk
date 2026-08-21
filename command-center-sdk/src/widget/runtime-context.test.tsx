import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  useRequiredWidgetCapability,
  useWidgetTheme,
  WidgetRuntimeProvider,
} from "./index.js";

function Consumer() {
  const formatter = useRequiredWidgetCapability<(value: number) => string>("example.format@v1");
  const theme = useWidgetTheme();
  return <span style={{ color: theme.primary }}>{formatter(42)}</span>;
}

describe("widget runtime context", () => {
  it("injects typed capabilities and theme tokens without application globals", () => {
    const markup = renderToStaticMarkup(
      <WidgetRuntimeProvider
        value={{
          capabilities: { "example.format@v1": (value: number) => `Value ${value}` },
          theme: { primary: "#123456" },
          locale: "en",
        }}
      >
        <Consumer />
      </WidgetRuntimeProvider>,
    );
    expect(markup).toContain("Value 42");
    expect(markup).toContain("#123456");
  });
});
