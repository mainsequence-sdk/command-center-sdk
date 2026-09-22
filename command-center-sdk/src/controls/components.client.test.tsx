// @vitest-environment jsdom

import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button, Field, Input, useFieldControlProps } from "./index.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

describe("application controls client behavior", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];
  const containers: HTMLElement[] = [];

  function mount(element: React.ReactNode) {
    const container = document.createElement("div");
    document.body.append(container);
    containers.push(container);
    const root = createRoot(container);
    roots.push(root);
    return { container, root };
  }

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    containers.splice(0).forEach((container) => container.remove());
  });

  it("delivers clicks while idle and swallows them while pending", async () => {
    const onClick = vi.fn();
    const { container, root } = mount(<Button onClick={onClick}>Save</Button>);

    await act(async () => {
      root.render(<Button onClick={onClick}>Save</Button>);
    });
    const button = container.querySelector<HTMLButtonElement>("button")!;
    await act(async () => button.click());
    expect(onClick).toHaveBeenCalledOnce();

    await act(async () => {
      root.render(
        <Button onClick={onClick} pending>
          Save
        </Button>,
      );
    });
    await act(async () => button.click());
    expect(onClick).toHaveBeenCalledOnce();
    expect(button.getAttribute("aria-busy")).toBe("true");
    expect(button.disabled).toBe(false);
  });

  it("exposes the input element through the ref so a consumer can manage focus", async () => {
    const ref = createRef<HTMLInputElement>();
    const { root } = mount(null);

    await act(async () => {
      root.render(
        <Field label="Name">
          <Input ref={ref} />
        </Field>,
      );
    });

    expect(ref.current).toBeInstanceOf(HTMLInputElement);
    await act(async () => ref.current!.focus());
    expect(document.activeElement).toBe(ref.current);
    expect(ref.current!.id).toBeTruthy();
    expect(document.querySelector("label")?.getAttribute("for")).toBe(ref.current!.id);
  });

  it("wires a custom control into the field through the public hook", async () => {
    function ChoiceControl() {
      const control = useFieldControlProps();
      return <div role="combobox" {...control} />;
    }
    const { container, root } = mount(null);

    await act(async () => {
      root.render(
        <Field controlId="currency" error="Choose a currency." label="Currency" required>
          <ChoiceControl />
        </Field>,
      );
    });

    const control = container.querySelector<HTMLElement>("[role=combobox]")!;
    expect(control.id).toBe("currency");
    expect(control.getAttribute("aria-describedby")).toBe("currency-error");
    expect(control.getAttribute("aria-invalid")).toBe("true");
    expect(control.getAttribute("aria-required")).toBe("true");
  });
});
