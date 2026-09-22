---
name: compose-command-center-controls
description: Compose, migrate, review, or verify buttons, badges, labels, labelled fields, inputs, and textareas with the public @dev-mainsequence/command-center-sdk/controls primitives. Use for page and card actions, icon-only buttons, pending actions, status badges, form fields with descriptions and errors, wiring a custom control into a field, or replacing an application's private button/input/badge kit. Do not use for form state, validation rules, submission, selects, dialogs, or notifications.
---

# Compose Command Center Controls

## Confirm The Installed Surface

Inspect the installed package version and export map before editing. Require `/controls`; do not
infer its availability from an ADR or a newer repository checkout. Import the SDK component and
theme styles once at the application entrypoint:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

Do not copy SDK CSS or import `dist`, `src`, Command Center application components, aliases, or
repository-only files.

These primitives are what make an independent application look and behave exactly like the host
and like every other Command Center site. A hand-rolled `<button>`, `<input>`, `<textarea>`, or
`<label>`, a Tailwind or CSS button, or a private kit is the one thing that breaks that.

## Give Each Control Rule One Owner

Use the public controls for every ordinary action and text control:

- `Button` for an action: `outline` (default), `primary`, `secondary`, `ghost`, or `danger`;
  `small`, `medium`, or `large`; `iconOnly` for a square icon button; `pending` while the
  application reports the action in flight.
- `Badge` for a static status or category marker.
- `Field` for one labelled control with an optional `description` and `error`; it generates the
  control id, the label target, `aria-describedby`, `aria-invalid`, `aria-required`, and disabled
  propagation.
- `Input` and `Textarea` inside a `Field`, or with an explicit `id` next to a standalone `Label`.
- `useFieldControlProps` inside a custom control so a picker or editor joins the field wiring.

Every interactive control carries `cc-control`, which reads `--application-control-min-size`
at every pointer type. Do not restate control height, focus rings, or touch sizing in application
CSS, and do not override the minimum size and still claim conformance.

```tsx
import { Button, Field, Input, Textarea } from "@dev-mainsequence/command-center-sdk/controls";
import {
  ApplicationCard,
  ApplicationPage,
  ApplicationPageHeader,
  ApplicationPageStack,
} from "@dev-mainsequence/command-center-sdk/layout";

export function ServicePage({ errors, onChange, save, saving, values }: ServicePageProps) {
  return (
    <ApplicationPage maxWidth="content">
      <ApplicationPageHeader
        actions={
          <Button onClick={save} pending={saving} variant="primary">
            Save
          </Button>
        }
        title="New service"
      />
      <ApplicationPageStack>
        <ApplicationCard header={<h2>Identity</h2>}>
          <Field description="Shown in the catalog." error={errors.name} label="Display name" required>
            <Input name="name" onChange={(event) => onChange("name", event.target.value)} value={values.name} />
          </Field>
          <Field label="Notes">
            <Textarea name="notes" onChange={(event) => onChange("notes", event.target.value)} rows={4} value={values.notes} />
          </Field>
        </ApplicationCard>
      </ApplicationPageStack>
    </ApplicationPage>
  );
}
```

Keep one `primary` action per surface. Give an `iconOnly` button an `aria-label`. Render `error`
only after the application has decided the value is invalid. Add native `required` to the control
yourself when the browser should block submission; `Field.required` is assistive and visual only.

## Keep Policy In The Application

The controls own presentation and accessible wiring. The application owns values, change
handling, validation rules, submission, mutation policy, optimistic updates, and notifications.
Do not pass a form library, schema, or submit promise into a control. Route selects to
`ResourcePicker` in `/views`, resource tables and status cells to `$build-resource-list`, page
geometry to `$compose-command-center-page`, and startup or reconnection feedback to
`$build-application-loading-flow`.

## Migrate A Private Kit

When an application keeps its own `button`, `input`, `textarea`, or `badge` components:

1. Replace the imports with `@dev-mainsequence/command-center-sdk/controls`.
2. Add `variant="primary"` where the private default button was the filled primary; the SDK
   default is `outline`.
3. Map `size="sm"`, `"lg"`, and `"icon"` to `size="small"`, `size="large"`, and `iconOnly`.
4. Map a private badge default to `neutral` by omitting `variant`.
5. Map a private card or page header to `ApplicationCard` and `ApplicationPageHeader` from
   `/layout`.
6. Delete the private files and the CSS that reproduced control geometry or focus rings from SDK
   variables.
7. Remove any build alias that let a sibling package import the private kit.

## Verify

Run the theme audit and a real-browser check as separate mandatory steps:

```bash
npx command-center-sdk theme audit --path src
```

```ts
import { expect, test } from "@playwright/test";
import {
  assertCommandCenterPageLayout,
} from "@dev-mainsequence/command-center-sdk/layout/testing";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

test("service form controls conform", async ({ page }) => {
  await page.goto("/services/new");
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await assertCommandCenterPageLayout(page);
});
```

Coarse entries report `touch-target`; entries narrower than 768px report `input-zoom`. Exercise
each variant and size, the pending state, a field with and without a description and error, a
disabled field, one dark and one light preset, 375×812 with a coarse pointer, and 1280×800.

## Enforce The Boundary

- Keep stable `data-cc-*` attributes; tests and the verifier use them.
- Keep `cc-control` on every interactive control; never remove it through `className`.
- Do not attach handlers to a `Badge`.
- Do not style an anchor with button classes; links keep native semantics.
- Do not override SDK control variables or geometry and still claim conformance.
