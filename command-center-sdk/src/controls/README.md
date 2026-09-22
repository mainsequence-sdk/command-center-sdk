# Application controls

This module provides the public React controls every Command Center-compatible application
composes into its pages: the action button, the status badge, and the labelled field with its
text controls. Import them from `@dev-mainsequence/command-center-sdk/controls` and load the
package theme plus component styles once in the application.

## Public entrypoint

- `/controls`: `Button`, `Badge`, `Label`, `Field`, `Input`, `Textarea`, the
  `useFieldControlProps` hook for a custom control, and their public prop and variant types.

The SDK owns control geometry and the touch-size floor, focus and hover treatment, variant and
size vocabulary, the pending state, the label-to-control wiring, and the description and error
association. Consumers own values, validation rules, when an error is shown, submission,
mutation policy, and product copy.

Every interactive control carries the `cc-control` class. That class reads
`--application-control-min-size` at every pointer type, so a control grows on a coarse pointer
exactly as the SDK's own controls do without appearing in any SDK selector list. Text controls
keep a 16px minimum font size on a coarse pointer so iOS Safari does not zoom on focus (SDK ADR
006).

The module has no form library, validation, router, transport, or persistence dependency. Keep the
stable `data-cc-*` attributes intact; the public browser verifier and consumer tests rely on them.

See `docs/application-controls.md` for the complete workflow and copyable examples.

## Compose actions

```tsx
import { Button } from "@dev-mainsequence/command-center-sdk/controls";

<Button variant="primary" onClick={save} pending={saving}>
  Save changes
</Button>
<Button onClick={cancel}>Cancel</Button>
<Button aria-label="Remove row" iconOnly variant="ghost">
  <TrashIcon aria-hidden="true" />
</Button>;
```

`variant` is `outline` (default), `primary`, `secondary`, `ghost`, or `danger`. `size` is `small`,
`medium` (default), or `large`. Keep one `primary` action per surface. `pending` keeps the button
focusable, sets `aria-busy`, shows the activity indicator, and ignores clicks; it does not decide
when an action is pending. `iconOnly` makes a square control and requires an accessible name. The
rendered element is always a `<button>` with `type="button"` unless `type` is supplied; links keep
native anchor semantics and are not styled as buttons by this module.

## Compose a labelled field

```tsx
import { Field, Input, Textarea } from "@dev-mainsequence/command-center-sdk/controls";

<Field
  description="Shown in the catalog and in exports."
  error={errors.name}
  label="Display name"
  required
>
  <Input name="name" onChange={onNameChange} value={name} />
</Field>
<Field label="Notes">
  <Textarea name="notes" onChange={onNotesChange} rows={4} value={notes} />
</Field>;
```

`Field` generates the control `id`, targets it from the label, joins the error and description
into `aria-describedby`, sets `aria-invalid` while `error` is present, sets `aria-required` when
`required`, and propagates `disabled`. `required` is presentational and assistive: add the native
`required` attribute to the control yourself when native constraint validation is wanted. Pass
`controlId` when a stable id is needed for tests or deep links.

A custom control joins a field through the hook:

```tsx
import { useFieldControlProps } from "@dev-mainsequence/command-center-sdk/controls";

function CurrencyPicker(props: CurrencyPickerProps) {
  const control = useFieldControlProps({ invalid: props.invalid });
  return <ResourcePicker {...props} triggerProps={control} />;
}
```

Explicit `id`, `aria-describedby`, `disabled`, and `invalid` values win over the field's values.
Outside a `Field` the hook returns only the explicit values.

## Mark status

```tsx
import { Badge } from "@dev-mainsequence/command-center-sdk/controls";

<Badge variant="success">Deployed</Badge>;
```

`variant` is `neutral` (default), `primary`, `secondary`, `success`, `warning`, or `danger`. A badge
is static; do not attach click handlers to it.

## Maintenance constraints

- Keep this module free of form state, validation, routers, transports, and persistence.
- Add a control only when its presentation and accessibility wiring repeat across complete
  applications; a domain-specific composite belongs in the consumer or in `/views`.
- Every interactive control must carry `cc-control` and must not restate the touch-size token in
  its own selector.
- Coordinate component markup, component CSS, the theme audit, browser verification, examples,
  the packaged skill, and package exports for any public behavior change.
- Test each variant and size, the pending state, field wiring with and without a description and
  error, disabled propagation, 375×812 with a coarse pointer, desktop, dark and one light theme.
