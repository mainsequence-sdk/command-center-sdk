---
sidebar_position: 6
title: Application controls
---

# Compose actions and labelled fields

Use the public controls for every ordinary button, badge, label, and text control in a complete
application. They carry the SDK's theme, focus, hover, touch-size, and accessibility rules, so an
application does not restate them and the browser verifier's `touch-target` and `input-zoom` rules
are satisfied by construction.

Import the components from the public entrypoint:

```tsx
import {
  Badge,
  Button,
  Field,
  Input,
  Label,
  Textarea,
  useFieldControlProps,
} from "@dev-mainsequence/command-center-sdk/controls";
```

Load the package theme and component styles once near the application root:

```ts
import "@dev-mainsequence/command-center-sdk/theme/styles.css";
import "@dev-mainsequence/command-center-sdk/styles.css";
```

## Give each rule one owner

Every interactive control renders with the `cc-control` class. That class reads
`--application-control-min-size`, which the theme raises from 36px to 44px on a coarse pointer, so
a consumer's buttons and inputs grow with the SDK's own. Text controls keep a 16px minimum font
size on a coarse pointer so iOS Safari does not zoom on focus. Do not restate these in application
CSS and do not override the control minimum size and still claim conformance.

The controls own presentation and accessible wiring only. They have no form state, validation,
submission, router, transport, or persistence dependency. Values, validation rules, when a message
is an error, submission, and mutation policy stay in the application.

## Compose page and card actions

Place actions in the layout header or a card header and choose one primary action per surface:

```tsx
import { Button } from "@dev-mainsequence/command-center-sdk/controls";
import {
  ApplicationPage,
  ApplicationPageHeader,
} from "@dev-mainsequence/command-center-sdk/layout";

export function PortfolioPage({ rebalance, rebalancing }: PortfolioPageProps) {
  return (
    <ApplicationPage maxWidth="wide">
      <ApplicationPageHeader
        actions={
          <>
            <Button onClick={exportPositions}>Export</Button>
            <Button onClick={rebalance} pending={rebalancing} variant="primary">
              Rebalance
            </Button>
          </>
        }
        title="Portfolio overview"
      />
    </ApplicationPage>
  );
}
```

`variant` is `outline` (default), `primary`, `secondary`, `ghost`, or `danger`. `size` is
`small`, `medium` (default), or `large`. `pending` reports the action as busy, shows the activity
indicator, ignores clicks, and keeps the button focusable; the application decides when the
action is pending. The rendered element is a `<button>` with `type="button"` unless `type` is
supplied. Use `type="submit"` inside a form the application handles.

An icon-only button is a square control and needs an accessible name:

```tsx
<Button aria-label="Remove position" iconOnly variant="ghost">
  <Trash2 aria-hidden="true" />
</Button>
```

Links keep native anchor semantics. Do not wrap a `Button` in an anchor or style an anchor as a
button with these classes; use the navigation primitives or a plain link.

## Compose a labelled field

`Field` owns the relationship between a label, its control, a description, and an error:

```tsx
import { Field, Input, Textarea } from "@dev-mainsequence/command-center-sdk/controls";

export function ServiceForm({ errors, onChange, values }: ServiceFormProps) {
  return (
    <form onSubmit={onSubmit}>
      <Field
        description="Shown in the catalog and in exports."
        error={errors.name}
        label="Display name"
        required
      >
        <Input
          autoComplete="off"
          name="name"
          onChange={(event) => onChange("name", event.target.value)}
          value={values.name}
        />
      </Field>
      <Field label="Notes">
        <Textarea
          name="notes"
          onChange={(event) => onChange("notes", event.target.value)}
          rows={4}
          value={values.notes}
        />
      </Field>
    </form>
  );
}
```

The field generates the control `id`, targets it from the label, joins the error and description
into `aria-describedby`, sets `aria-invalid` while `error` is present, sets `aria-required` when
`required`, and propagates `disabled`. Pass `controlId` when a stable id is needed for tests or
deep links. Explicit `id`, `aria-describedby`, `disabled`, and `invalid` values on the control
win over the field's values.

`required` on the field is presentational and assistive. Add the native `required` attribute to the
control when the browser should block submission; leave it off when the application validates on
its own terms.

Show `error` only when the application has decided the value is invalid, for example after a blur,
a submit attempt, or a server response. Do not render an error for an untouched empty field on
first paint.

## Wire a custom control into a field

A picker, an editor, or another composite joins the field through the public hook:

```tsx
import { useFieldControlProps } from "@dev-mainsequence/command-center-sdk/controls";
import { ResourcePicker } from "@dev-mainsequence/command-center-sdk/views";

function CurrencyPicker(props: CurrencyPickerProps) {
  const control = useFieldControlProps({ invalid: props.invalid });
  return <ResourcePicker {...props} triggerProps={control} />;
}

<Field error={errors.currency} label="Settlement currency" required>
  <CurrencyPicker onChange={setCurrency} options={currencies} value={currency} />
</Field>;
```

The hook returns `id`, `aria-describedby`, `aria-invalid`, `aria-required`, and `disabled` as the
field resolves them and omits every value that does not apply. Outside a `Field` it returns only
the explicit values, so the control can call it unconditionally.

Use `Label` on its own only when no `Field` owns the control, for example a search box in a
toolbar:

```tsx
<Label htmlFor="positions-search">Search positions</Label>
<Input id="positions-search" type="search" />
```

## Mark status with a badge

```tsx
import { Badge } from "@dev-mainsequence/command-center-sdk/controls";

<Badge variant={deployment.healthy ? "success" : "danger"}>
  {deployment.healthy ? "Healthy" : "Failing"}
</Badge>;
```

`variant` is `neutral` (default), `primary`, `secondary`, `success`, `warning`, or `danger`. Map
domain status to a tone in the application. A badge is static; do not attach a click handler to
it. Use `ResourceStatusCell` from `/views` inside a resource table.

## Migrate from an application kit

Replace private button, input, textarea, and badge components with the SDK controls and delete
the private files. A kit whose default button was the filled primary needs `variant="primary"` at
the call sites that meant it; the SDK default is `outline`. `size="sm"`, `"lg"`, and `"icon"`
become `size="small"`, `size="large"`, and `iconOnly`. A private card or page header maps to
`ApplicationCard` and `ApplicationPageHeader` from `/layout`. Remove application CSS that
reproduced the control geometry, focus ring, or touch sizing from SDK variables.

## Verify in a real browser

Run the layout verifier from `/layout/testing` on a route that renders the controls. Coarse
entries report `touch-target`; entries narrower than 768px report `input-zoom`. Configure
`hasTouch` and `isMobile` on the Playwright context for coarse entries.

```ts
import { expect, test } from "@playwright/test";
import {
  assertCommandCenterPageLayout,
} from "@dev-mainsequence/command-center-sdk/layout/testing";

test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 812 } });

test("service form controls are touch-sized", async ({ page }) => {
  await page.goto("/services/new");
  await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  await assertCommandCenterPageLayout(page);
});
```

Run the closed theme audit separately:

```bash
npx command-center-sdk theme audit --path src
```

Exercise each variant and size, the pending state, a field with and without a description and
error, a disabled field, at least one dark and one light SDK theme, 375×812 with a coarse pointer,
and 1280×800.

## Backend and storage boundary

The control props are React presentation input, not a backend contract. There is no controls
contract ID, JSON Schema, fixture bundle, persisted state, or migration. Form payloads, validation
responses, and error shapes are application and backend concerns.
