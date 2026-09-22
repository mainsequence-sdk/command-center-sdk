# SDK ADR 011: Public Control and Form Primitives

- Status: Accepted
- Date: 2026-09-22
- Implementation: `@dev-mainsequence/command-center-sdk` 0.5.0
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 003: Public Application Layout System](./adr-sdk-003-public-application-layout-system.md)
  - [SDK ADR 004: Public Application Feedback System](./adr-sdk-004-public-application-feedback-system.md)
  - [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md)
  - [Application controls](../application-controls.md), [Application layout](../application-layout.md),
    [Mobile](../concepts/mobile.md)

## Publication status

This decision is implemented in SDK source for the next package release. A consumer may use the
component names, entrypoint, hook, class names, and data attributes only when its installed package
export map and declarations contain them.

An ADR or a newer checkout does not make an API available in an older package. Repository-only
components from Command Center or another application are not substitutes for the public SDK API.

## Decision summary

The SDK publishes the generic interactive controls that every complete application composes and
that no SDK entrypoint has offered until now:

```text
@dev-mainsequence/command-center-sdk/controls
```

The entrypoint contains `Button`, `Badge`, `Label`, `Field`, `Input`, `Textarea`, and the
`useFieldControlProps` hook. Every interactive control carries one base class, `cc-control`, which
is the single home for interactive sizing: it reads `--application-control-min-size` at every
pointer type, so the touch-size floor from SDK ADR 006 reaches a consumer's controls without the
consumer appearing in any SDK selector list. The SDK owns these primitives. The Command Center
host and its sibling applications adopt them from the released package and retire their private
copies.

## Context

### The package publishes no generic control

Measured against `@dev-mainsequence/command-center-sdk@0.4.4` on 2026-09-22:

- The export map declares `/layout`, `/feedback`, `/navigation`, `/views`, `/embed/react`, and
  the theme and contract surfaces. Together they publish 31 React components. Every one is page
  geometry, navigation chrome, feedback, or a `Resource*` view. None is a button, input, textarea,
  label, field, badge, checkbox, switch, or radio.
- The SDK's own copyable examples render page-header actions as a bare `<button type="button">`
  in `docs/application-layout.md`, `src/layout/README.md`, the layout skill, and the packed
  consumer fixture, because there is nothing else to render.
- Inside the package, 34 bare `<button>` elements across 15 source files are each styled by a
  component-specific rule. `.cc-resource-button` and its `--primary` and `--danger` modifiers are
  a real SDK button written in SDK tokens, but they are bound to descendant selectors such as
  `.cc-resource-selection-bar button` and `.cc-resource-dialog button`, which is why the danger
  modifier needs `!important` to win and why nothing outside those parents can use it.

### The SDK enforces a control contract it does not publish

SDK ADR 006 gave the SDK `--application-control-min-size` (2.25rem, 2.75rem on a coarse pointer),
the 16px minimum text-input size that stops iOS Safari focus zoom, and verifier rules
(`touch-target`, `input-zoom`) that fail a consumer's browser conformance run. The stylesheet
applies the size token through one `@media (pointer: coarse)` block that enumerates 27
selectors, one per control the SDK happens to render. A control the SDK does not render can never
be on that list. A consumer therefore inherits the verifier and none of the components that would
satisfy it, and every new SDK control must be added to the list by hand.

### Consumers rebuild the same controls by hand

The Command Center host keeps a private kit at `apps/command-center/src/components/ui/`: 15 files,
1,239 lines, built on Tailwind utility classes, `class-variance-authority`, `clsx`, and
`tailwind-merge`. Its imports across the monorepo, counted as importing files:

| Module | Total | Host | Sibling applications |
| --- | --- | --- | --- |
| `button` | 92 | 28 | 64 |
| `badge` | 81 | 26 | 55 |
| `toaster` | 50 | 14 | 36 |
| `card` | 49 | 25 | 24 |
| `input` | 47 | 21 | 26 |
| `dialog` | 33 | 11 | 22 |
| `select` | 21 | 7 | 14 |
| `textarea` | 19 | 5 | 14 |

The sibling applications (`mainsequence-foundry`, `marketplace`, `mainsequence-ai`) are separate
workspace packages that declare this SDK as a dependency and then import `@/components/ui/*`,
where `@/` is a build alias to the host application's private `src`. They compile only inside the
host's Vite and TypeScript configuration. That is the alias-based coupling this repository's
boundary rules forbid, and it exists because the SDK left the gap.

An independent consumer cannot even do that. `CommandCenterWidgets`, a separate repository on
0.1.20 with no access to the host alias, hand-rolls 72 controls (33 `<label>`, 19 `<input>`, 12
`<select>`, 4 `<textarea>`, 4 `<button>`) and styles them from SDK variables by hand: correct,
duplicated, and unverifiable.

Nothing in the monorepo publishes a label, field, checkbox, switch, radio, or form primitive at
all; 41 files hand-roll `<label>`. The host kit covers actions, not forms. Upstreaming the host kit
alone would therefore serve the host and leave the form-heavy independent consumer where it is.

### The host kit is already an SDK-token kit

Every one of the 25 distinct semantic utility classes the host kit uses (`bg-primary`,
`border-input`, `ring-ring`, `text-muted-foreground`, `bg-danger`, `text-success`, and so on)
resolves to a variable this package already publishes through `theme/tailwind.css`. No host-only
color exists. The visual contract is SDK-owned today; only the component wrapper lives in the host,
in a styling technology the SDK does not use.

## Decision

### Publish `/controls`

| Primitive | SDK-owned behavior | Consumer-owned input |
| --- | --- | --- |
| `Button` | `<button type="button">` default, `outline`/`primary`/`secondary`/`ghost`/`danger` variants, `small`/`medium`/`large` sizes, `iconOnly` square shape, `pending` state (`aria-busy`, activity indicator, clicks ignored, focus kept), focus ring, hover under `(hover: hover)`, disabled treatment, touch sizing | Label, handler, `type`, when it is pending or disabled, and an accessible name for an icon-only button |
| `Badge` | Static pill with `neutral`/`primary`/`secondary`/`success`/`warning`/`danger` tones | Text and the mapping from domain status to tone |
| `Label` | Label typography, automatic `htmlFor` inside a `Field`, required indicator | Text |
| `Field` | Generated control `id`, label target, `aria-describedby` for error then description, `aria-invalid` while an error is present, `aria-required`, disabled propagation, vertical rhythm, `data-cc-field` state attributes | Value, validation rules, when an error is shown, submission, `controlId` when a stable id is needed |
| `Input`, `Textarea` | Native text controls with the field wiring applied, `invalid` prop, 16px minimum on a coarse pointer, focus and invalid borders, forwarded refs | Value, change handling, native attributes such as `required`, `name`, `autoComplete` |
| `useFieldControlProps` | Resolves the same wiring for a custom control rendered inside a `Field` | The custom control |

The controls are presentation and accessibility only. The entrypoint has no form state, no
validation, no submission, no router, no transport, and no persistence dependency. `Field.required`
is assistive and presentational; native constraint validation stays a consumer choice through the
control's own `required` attribute.

### One base class carries the device contract

`cc-control` sets `min-block-size: var(--application-control-min-size)` unconditionally. The
token, not a media query in `styles.css`, changes on a coarse pointer, so the 27-selector block is
not extended for the new controls and is no longer the mechanism a control needs to honour the
floor. Existing SDK controls keep their current selectors in this release and adopt `cc-control`
as they are touched; each adoption removes a selector from the block. `Input` and `Textarea` join
the coarse-pointer 16px rule that every SDK text input already follows.

### The SDK owns these primitives

The Command Center host, its sibling applications, and every other consumer use the released
`/controls` components in place of private buttons, badges, inputs, textareas, and labels. The host
kit is a migration source, not a parallel implementation: after the host adopts the release, its
`button.tsx`, `input.tsx`, `textarea.tsx`, and `badge.tsx` are deleted and the sibling
applications import only declared SDK exports for these controls.

### Name parity, re-authored styling

Component names match the host kit so adoption is an import-path change, with these mappings:

| Host kit | SDK | Note |
| --- | --- | --- |
| `<Button>` with no `variant` | `<Button variant="primary">` | The SDK default is `outline`, matching its own existing buttons, so one primary action per surface is the explicit choice |
| `size="sm"` / `"lg"` / `"icon"` | `size="small"` / `"large"` / `iconOnly` | |
| `<Badge>` with no `variant` | `<Badge>` (`neutral`) | |
| `Card`, `CardHeader`, `CardTitle`, `CardContent` | `ApplicationCard` from `/layout` | Already public; not duplicated here |
| `PageHeader` | `ApplicationPageHeader` from `/layout` | Already public; not duplicated here |

Styling is re-authored in the SDK's `cc-` component CSS and existing theme variables. The package
does not adopt Tailwind, `class-variance-authority`, `clsx`, or `tailwind-merge`: they would become
a runtime requirement of every consumer, including static-site embeds that ship no utility
framework. No theme variable is added; the audit's closed token set is unchanged.

### Deferred, with reasons

- `Select`: the host's `select.tsx` already wraps the SDK's `ResourcePicker`. A public select must
  be reconciled with the picker's option model and sheet presentation rather than published as a
  second listbox. Separate decision.
- `Dialog`: SDK ADR 010 gave the SDK scrim, focus trap, scroll lock, and dismissal ownership for
  the navigation drawer through an internal overlay utility. A public dialog should stand on that
  utility once it is promoted; publishing a dialog first would fork it. Separate decision.
- `Toaster`: 36 sibling-application importers, but its state lives in a store. The SDK pattern
  (SDK ADR 004) is a controlled surface fed by consumer state; a notification primitive needs that
  design. Separate decision.
- `Tabs`, `Tooltip`, `Popover`, `Menu`, `Checkbox`, `Switch`, `Radio`: no current SDK consumer
  demand large enough to fix the API now. Checkbox, switch, and radio will join `/controls` through
  the same `Field` wiring when added.

## Ownership boundary

The SDK owns:

- the control React components, the field hook, and their public types;
- the `cc-control` base class and the variant, size, state, and wiring vocabulary;
- browser-ready component styles in SDK theme tokens, including touch sizing, focus, hover,
  invalid, disabled, and pending treatment;
- accessible wiring between a label, control, description, and error;
- unit, packed-consumer, theme-audit, and real-browser coverage; and
- human and agent guidance for composing actions and fields.

The consumer owns:

- values, change handling, validation rules, and when a message is an error;
- submission, mutation policy, optimistic updates, and notifications;
- which action is primary on a surface and the accessible name of an icon-only button;
- native constraint validation attributes; and
- domain composites such as pickers, editors, and multi-step forms.

## Relationship to existing views and internal controls

`ResourceListPage`, `ResourceToolbar`, `ResourceSearch`, `ResourcePicker`, the action dialogs, and
`EntitySummary` keep their current internal buttons and inputs in this release. They are migrated
to the public controls incrementally so that each change can be verified against the existing
browser tests, and the coarse-pointer selector block shrinks with each migration. No public prop
or class of those views changes here.

`ApplicationStatusScreen.action` keeps its controlled callback shape from SDK ADR 004; its
rendered button adopts the public control in a follow-up.

## Serialized contracts and backend impact

This decision adds no serialized, persisted, iframe, or backend protocol. Public props contain
React nodes, callbacks, and DOM attributes and cannot be treated as wire data. Existing contract
IDs, JSON Schemas, fixtures, manifest entries, theme IDs, and iframe versions remain unchanged.
No backend or storage action is required.

## Consumer adoption

After the release that carries `/controls`:

1. The Command Center host replaces `@/components/ui/{button,input,textarea,badge}` imports with
   `@dev-mainsequence/command-center-sdk/controls`, applying the mapping table above, and deletes
   those four files. `page-header.tsx` migrates to `ApplicationPageHeader` in the same pass.
   `card.tsx` (111 call sites with per-subcomponent class overrides and depth-based nesting)
   migrates to `ApplicationCard` in a following pass.
2. The sibling applications stop importing `@/components/ui/*` for these controls. Their remaining
   `@/` imports are the next boundary item and are outside this decision.
3. Independent consumers replace hand-styled controls with the SDK components and drop the CSS
   that reproduced SDK tokens.
4. The layout verifier's `touch-target` and `input-zoom` rules become satisfiable by construction
   for every migrated control.

## Verification

The public surface is verified through:

- server-rendered component tests for variants, sizes, the pending state, badge tones, field
  wiring with and without a description and error, disabled propagation, explicit-attribute
  precedence, and standalone labels;
- client tests for click delivery and suppression, forwarded refs and focus, and custom-control
  wiring through the hook;
- TypeScript compilation from the public subpath and the packed consumer fixture;
- the closed SDK theme audit over the component stylesheet;
- packed-consumer export, declaration, and skill-lane assertions; and
- real Chromium checks at 375×812 with a coarse pointer and 1280×800 with a fine pointer, in a dark
  and a light theme, asserting the 44px control floor, the 16px input floor, and no horizontal
  overflow.

## Compatibility and rollout

The change is additive: a new entrypoint, new class names, new data attributes, and a new packaged
skill. Existing entrypoints, components, class names, rendered output, theme variables, and the
theme audit's token set are unchanged. The class names `cc-control`, `cc-button`, `cc-badge`,
`cc-label`, `cc-field`, `cc-input`, and `cc-textarea`, their modifier and element classes, and the
`data-cc-button`, `data-cc-badge`, `data-cc-label`, `data-cc-field`, `data-cc-input`, and
`data-cc-textarea` attributes become stable with this release.

The release must include the `/controls` export, declarations, component CSS, nearest README,
human guide, updated copyable examples and consumer fixture, browser tests, changelog entry, and
the `compose-command-center-controls` packaged skill. The layout skill and the general
application-building skills route action and form composition to it.

## Rejected alternatives

### Publish the host kit as it is

Rejected because it would make Tailwind, `class-variance-authority`, `clsx`, and `tailwind-merge`
runtime requirements of every consumer, contradict the package's plain-CSS component contract, and
still leave the form layer unwritten.

### Keep the kit host-private and reach it through the alias

Rejected because it is the boundary violation this decision exists to remove: sibling
applications compile only inside the host, independent consumers get nothing, and the SDK's own
verifier keeps failing controls it never shipped.

### Extend `.cc-resource-button` and export it

Rejected because its descendant-selector binding is the defect. A control class that depends on
being inside a resource surface cannot be a general primitive, and the `!important` in its danger
modifier shows where that leads.

### Ship a form library or validation

Rejected because value handling, validation rules, and submission are product policy. The SDK owns
wiring and presentation; a schema, a form state hook, or an error strategy would either encode one
product or expose so many options that it no longer owns meaningful behavior.

### Enforce native `required` from `Field`

Rejected because native constraint validation changes submission behavior and browser UI. The
field marks the requirement for assistive technology and the eye; the consumer decides whether the
browser blocks submission.
