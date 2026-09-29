// @vitest-environment jsdom

import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ResourceTransferList, type ResourceTransferChange, type ResourceTransferListProps } from "./ResourceTransferList.js";

Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
  configurable: true,
  value: true,
});

const options = [
  { label: "Ada Lovelace", value: "ada" },
  { label: "Grace Hopper", value: "grace" },
  { disabled: true, label: "Linus Torvalds", value: "linus" },
  { label: "Margaret Hamilton", value: "margaret" },
  { label: "Katherine Johnson", value: "katherine" },
];

type HarnessProps = Partial<ResourceTransferListProps> & {
  initial?: readonly string[];
  onChange?: (value: readonly string[], change: ResourceTransferChange) => void;
};

function Harness({ initial = [], onChange, ...props }: HarnessProps) {
  const [value, setValue] = useState<readonly string[]>(initial);
  return (
    <ResourceTransferList
      itemLabel="users"
      onValueChange={(next, change) => {
        setValue(next);
        onChange?.(next, change);
      }}
      options={options}
      value={value}
      {...props}
    />
  );
}

function list(container: HTMLElement, side: "available" | "selected") {
  return container.querySelector<HTMLElement>(`[data-side="${side}"] [role="listbox"]`)!;
}

function values(container: HTMLElement, side: "available" | "selected") {
  return Array.from(list(container, side).querySelectorAll<HTMLElement>('[role="option"]')).map((option) => option.dataset.value);
}

function option(container: HTMLElement, value: string) {
  return container.querySelector<HTMLButtonElement>(`[role="option"][data-value="${value}"]`)!;
}

function button(container: HTMLElement, name: string) {
  return container.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)!;
}

function press(key: string, init: KeyboardEventInit = {}) {
  const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, key, ...init });
  document.activeElement!.dispatchEvent(event);
  return event;
}

function type(input: HTMLInputElement, text: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  setter.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("ResourceTransferList", () => {
  const roots: Array<ReturnType<typeof createRoot>> = [];

  afterEach(() => {
    roots.splice(0).forEach((root) => act(() => root.unmount()));
    document.body.innerHTML = "";
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
  });

  async function mount(props: HarnessProps = {}) {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    await act(async () => root.render(<Harness {...props} />));
    return container;
  }

  it("marks options by click and moves the marked ones with the add button", async () => {
    const onChange = vi.fn();
    const container = await mount({ onChange });

    await act(async () => option(container, "grace").click());
    await act(async () => option(container, "ada").click());
    expect(option(container, "ada").getAttribute("aria-selected")).toBe("true");
    await act(async () => button(container, "Add selected users").click());

    expect(onChange).toHaveBeenCalledWith(["ada", "grace"], { added: ["ada", "grace"], removed: [] });
    expect(values(container, "selected")).toEqual(["ada", "grace"]);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("2 users added.");
  });

  it("moves focus with the arrow keys, extends marks with Shift, and moves with Enter", async () => {
    const onChange = vi.fn();
    const container = await mount({ onChange });

    await act(async () => option(container, "ada").focus());
    await act(async () => press("ArrowDown"));
    expect(document.activeElement).toBe(option(container, "grace"));
    await act(async () => press("End"));
    expect(document.activeElement).toBe(option(container, "katherine"));
    await act(async () => press("Home"));
    await act(async () => press("ArrowDown", { shiftKey: true }));
    expect(option(container, "grace").getAttribute("aria-selected")).toBe("true");
    expect(onChange).not.toHaveBeenCalled();

    await act(async () => press("Enter"));
    expect(onChange).toHaveBeenLastCalledWith(["grace"], { added: ["grace"], removed: [] });
    // Focus stays in the list it came from, on the option that took the moved one's place.
    expect(document.activeElement).toBe(option(container, "linus"));
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Grace Hopper added.");

    await act(async () => press("Enter"));
    // A disabled option under focus does not move.
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("marks every shown option with Ctrl+A and clears them with a second Ctrl+A", async () => {
    const container = await mount();

    await act(async () => option(container, "ada").focus());
    await act(async () => press("a", { ctrlKey: true }));
    const marked = () => Array.from(list(container, "available").querySelectorAll('[aria-selected="true"]'))
      .map((node) => (node as HTMLElement).dataset.value);
    expect(marked()).toEqual(["ada", "grace", "margaret", "katherine"]);
    await act(async () => press("a", { metaKey: true }));
    expect(marked()).toEqual([]);
  });

  it("moves one option on double-click and returns it with Remove selected", async () => {
    const onChange = vi.fn();
    const container = await mount({ onChange });

    await act(async () => option(container, "margaret").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(values(container, "selected")).toEqual(["margaret"]);

    await act(async () => option(container, "margaret").click());
    await act(async () => button(container, "Remove selected users").click());
    expect(onChange).toHaveBeenLastCalledWith([], { added: [], removed: ["margaret"] });
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Margaret Hamilton removed.");
  });

  it("adds and removes only the options the search shows, and never a disabled one", async () => {
    const onChange = vi.fn();
    const container = await mount({ initial: ["linus"], onChange });
    const search = container.querySelector<HTMLInputElement>('[data-side="available"] input[type="search"]')!;

    await act(async () => type(search, "er"));
    expect(values(container, "available")).toEqual(["grace", "katherine"]);
    expect(container.querySelector('[data-side="available"] .cc-resource-transfer__count')?.textContent).toBe("(2 of 4)");
    await act(async () => button(container, "Add all shown users").click());
    expect(onChange).toHaveBeenLastCalledWith(["linus", "grace", "katherine"], { added: ["grace", "katherine"], removed: [] });

    await act(async () => button(container, "Remove all shown users").click());
    // The disabled option is a locked choice and stays.
    expect(onChange).toHaveBeenLastCalledWith(["linus"], { added: [], removed: ["grace", "katherine"] });
  });

  it("keeps chosen values it cannot show when it removes others", async () => {
    const onChange = vi.fn();
    const container = await mount({ initial: ["ghost", "ada"], onChange });

    await act(async () => button(container, "Remove all shown users").click());
    expect(onChange).toHaveBeenLastCalledWith(["ghost"], { added: [], removed: ["ada"] });
  });

  it("moves nothing while read only", async () => {
    const onChange = vi.fn();
    const container = await mount({ disabled: true, onChange });

    await act(async () => option(container, "ada").click());
    expect(option(container, "ada").getAttribute("aria-selected")).toBe("false");
    await act(async () => button(container, "Add all shown users").click());
    await act(async () => option(container, "ada").dispatchEvent(new MouseEvent("dblclick", { bubbles: true })));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps focus on a move button after it moves everything", async () => {
    const container = await mount();
    const addAll = button(container, "Add all shown users");

    await act(async () => {
      addAll.focus();
      addAll.click();
    });
    expect(document.activeElement).toBe(addAll);
    expect(addAll.getAttribute("aria-disabled")).toBe("true");
  });

  it("stacks the lists on a phone-width viewport", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    const container = await mount();

    expect(container.querySelector(".cc-resource-transfer")?.getAttribute("data-cc-presentation")).toBe("stacked");
  });
});
