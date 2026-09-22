import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Badge, Button, Field, Input, Label, Textarea } from "./index.js";

describe("application controls", () => {
  it("renders a button with the control class, variant, size, and a safe default type", () => {
    const html = renderToStaticMarkup(<Button>Refresh</Button>);

    expect(html).toContain('type="button"');
    expect(html).toContain("cc-control");
    expect(html).toContain("cc-button--outline");
    expect(html).toContain("cc-button--medium");
    expect(html).toContain('data-cc-button=""');
    expect(html).toContain('data-variant="outline"');
    expect(html).not.toContain("aria-busy");
  });

  it("renders explicit variants, sizes, icon-only shape, and the submit type", () => {
    const html = renderToStaticMarkup(
      <Button aria-label="Remove" iconOnly size="small" type="submit" variant="danger">
        ×
      </Button>,
    );

    expect(html).toContain('type="submit"');
    expect(html).toContain("cc-button--danger");
    expect(html).toContain("cc-button--small");
    expect(html).toContain("cc-button--icon-only");
    expect(html).toContain('aria-label="Remove"');
  });

  it("reports a pending action as busy, keeps it focusable, and shows the activity indicator", () => {
    const html = renderToStaticMarkup(
      <Button pending variant="primary">
        Saving
      </Button>,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-disabled="true"');
    expect(html).not.toContain(" disabled");
    expect(html).toContain('data-pending=""');
    expect(html).toContain("cc-button__indicator");
    expect(html).toContain("cc-activity-indicator--small");
  });

  it("renders a static badge with its variant", () => {
    const html = renderToStaticMarkup(<Badge variant="success">Deployed</Badge>);

    expect(html.startsWith("<span")).toBe(true);
    expect(html).toContain("cc-badge--success");
    expect(html).toContain('data-cc-badge=""');
    expect(html).not.toContain("cc-control");
  });

  it("wires a field's label, description, error, required, and invalid state to its input", () => {
    const html = renderToStaticMarkup(
      <Field
        controlId="display-name"
        description="Shown in the catalog."
        error="Enter a name."
        label="Display name"
        required
      >
        <Input name="name" />
      </Field>,
    );

    expect(html).toContain('data-cc-field=""');
    expect(html).toContain('data-invalid=""');
    expect(html).toContain('data-required=""');
    expect(html).toContain('for="display-name"');
    expect(html).toContain('id="display-name"');
    expect(html).toContain('aria-describedby="display-name-error display-name-description"');
    expect(html).toContain('id="display-name-error"');
    expect(html).toContain('id="display-name-description"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-required="true"');
    expect(html).toContain('class="cc-label__required"');
    expect(html).toContain("cc-input");
    expect(html).toContain('type="text"');
  });

  it("omits description and error wiring when neither is present and propagates disabled", () => {
    const html = renderToStaticMarkup(
      <Field controlId="notes" disabled label="Notes">
        <Textarea name="notes" />
      </Field>,
    );

    expect(html).toContain('data-disabled=""');
    expect(html).not.toContain("aria-describedby");
    expect(html).not.toContain("aria-invalid");
    expect(html).not.toContain("aria-required");
    expect(html).toContain("cc-textarea");
    expect(html).toContain(' disabled=""');
    expect(html).not.toContain("cc-label__required");
  });

  it("lets explicit control attributes win over the field's values", () => {
    const html = renderToStaticMarkup(
      <Field controlId="generated" description="Field description" label="Amount">
        <Input aria-describedby="units" id="amount" name="amount" />
      </Field>,
    );

    expect(html).toContain('id="amount"');
    expect(html).toContain('aria-describedby="generated-description units"');
  });

  it("renders a standalone label and input outside a field", () => {
    const html = renderToStaticMarkup(
      <>
        <Label htmlFor="search" required>
          Search
        </Label>
        <Input id="search" invalid type="search" />
      </>,
    );

    expect(html).toContain('for="search"');
    expect(html).toContain("cc-label__required");
    expect(html).toContain('id="search"');
    expect(html).toContain('type="search"');
    expect(html).toContain('aria-invalid="true"');
  });
});
