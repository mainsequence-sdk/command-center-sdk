# SDK ADR 007: Responsive Column Importance and Stacked Tables

- Status: Accepted
- Date: 2026-09-14
- Implementation: `@dev-mainsequence/command-center-sdk` unreleased (planned 0.4.0)
- Owners: Command Center SDK maintainers
- Package: `@dev-mainsequence/command-center-sdk`
- Related:
  - [SDK ADR 006: Device-Aware Primitives](./adr-sdk-006-device-aware-primitives.md)
  - [Resources](../resources.md), [Backend contracts](../backend-contracts.md)
  - Contract `command-center.resource_discovery@v1`
    (`contracts/schemas/resource-discovery-v1.schema.json`)

## Publication status

This decision is implemented in SDK source for the next package release. The contract field
`importance` has existed in `command-center.resource_discovery@v1` since v1; released packages
before the implementing version accept it and ignore it.

## Decision summary

Resource tables change shape on small screens from the same column declarations that drive them on
desktop. The SDK adopts the existing discovery `importance` vocabulary as the responsive signal,
adds it to host-authored column definitions, carries it through discovery resolution instead of
dropping it, and gives `DataTable` a `presentation` prop whose `stacked` form renders each row as
a card built from the same columns. Row actions, pagination, and the toolbar gain the compact
forms the stacked table needs. No serialized contract changes.

## Context

`DataTable` renders every column at every width inside an `overflow-x: auto` scroller. A resource
with eight discovered columns renders eight columns at 375px and scrolls sideways, where a row tap
and a horizontal pan fight each other. Row actions render one button per action per row, and page
tokens wrap onto two or three lines. The existing `renderCard` path on `ResourceListPage` is a
different presentation the host writes by hand; it does not reuse the columns.

The signal needed to fix this already exists on the wire. `ResourceDiscoveryColumn` in
`command-center.resource_discovery@v1` carries an optional
`importance: "primary" | "secondary" | "tertiary"`, and `parseResourceDiscovery` validates and
keeps it. It is then dropped in `resolveResourceDiscoveryColumns`, which maps discovery columns
onto `ResourceColumnDefinition`, a type that has no such field. No view reads it. A backend that
already annotates its columns gets nothing for it.

`ResourceColumnDefinition` is host-authored and framework-neutral:

```ts
export interface ResourceColumnDefinition<T, Cell = unknown> {
  id: string;
  header: string;
  getValue?: (resource: T) => unknown;
  renderCell?: (resource: T) => Cell;
  sortableKey?: string;
}
```

It has no responsive metadata, so a host without discovery cannot express column priority either.

## Decision drivers

- One vocabulary. The contract already chose `primary | secondary | tertiary`; the TypeScript
  definition should not invent a parallel one.
- The same columns must drive both forms so a stacked row and a table row always show the same
  data and the same actions.
- Selection, activation, sort, and bulk actions must keep working in the stacked form; a phone
  user still approves and runs actions.
- Defaults must reproduce 0.2.1 output for every consumer that declares nothing.
- Discovery owns column vocabulary and order; the host owns rendering. Importance is vocabulary,
  so discovery wins when it supplies a value.

## Decision

### 1. Importance on column definitions

`ResourceColumnDefinition` gains two optional fields:

```ts
importance?: "primary" | "secondary" | "tertiary";
hideBelow?: "sm" | "md" | "lg";
```

`importance` carries the contract vocabulary unchanged. `hideBelow` is a host-only presentation
override for a column whose default treatment is wrong for one screen; it never travels on the
wire. Resolution rules, in order:

1. Exactly one column is primary. If none is declared, the first column is primary. If several are
   declared, the first declared primary wins and the rest are treated as secondary. This is
   deterministic; the SDK does not log it because the package has no development-build switch.
2. `resolveResourceDiscoveryColumns` copies `importance` from the discovery column when present;
   otherwise the local definition's value applies. It continues to copy `header` and
   `sortable_key` as today.
3. A column with no importance and not first is secondary.

The default treatment per importance, at each breakpoint of the ADR 006 scale:

| Importance | Table form, `xs` | Table form, `sm` | Table form, `md` and up | Stacked form |
| --- | --- | --- | --- | --- |
| primary | shown, sticky | shown, sticky | shown | card title |
| secondary | hidden | shown | shown | label and value pair |
| tertiary | hidden | hidden | shown | behind a disclosure |

`hideBelow` replaces the table-form columns of that row for one column. `default_visible` and
`hideable` from discovery keep their current meaning and are applied before importance.

### 2. Table presentation

`DataTable` gains `presentation?: "auto" | "table" | "stacked"` following the ADR 006 convention,
exposed as `data-cc-presentation` on its root. `table` is today's markup. `auto` resolves to
`stacked` below `sm`.

The `stacked` form renders an ordered list of rows. Each row is one item with:

- the primary column's cell as the title, rendered through its `renderCell` or `getValue` exactly
  as the table would;
- secondary columns as label and value pairs using the same cells;
- tertiary columns behind a per-row disclosure, collapsed by default;
- the selection checkbox in the leading position with a `--application-control-min-size` hit
  area, when the table is selectable;
- row activation on the whole item through the same `onActivateRow` and keyboard handling; and
- row actions in a trailing overflow menu built on `ResourcePicker` action mode, so the same
  discovered and local actions appear with the same tones and disabled states.

Sort has no header to click in the stacked form. `ResourceListPage` therefore renders a sort
picker in the toolbar, built from the columns with a `sortableKey`, whenever the table's resolved
presentation is `stacked`. The sort state and `onSortChange` contract are unchanged.

Empty, loading, and error states render the same content in both forms.

### 3. Table-form hardening

In the `table` form:

- the header row is sticky within the scroller;
- the primary column is sticky at `xs` and `sm`;
- the scroller shows an edge shadow while more columns exist beyond the visible edge;
- cell padding reads `--table-standard-cell-padding-y` like `cc-resource-table-cell` already does,
  replacing the hardcoded `0.75rem 1rem`; and
- row actions collapse into the same overflow menu when there are more than two or the pointer is
  coarse.

### 4. Compact list chrome

- `ResourcePagination` gains `presentation?: "auto" | "full" | "compact"`. Compact renders
  previous, next, and the "3 of 12" summary only. `auto` resolves to compact below `sm`.
- Below `sm`, `ResourceListPage` renders search at full width, folds host-authored
  `filterDefinitions` and `filterControls` into one "Filters" disclosure with an active count, and
  keeps the result count on its own line. Discovery filter metadata still never renders inputs.
- `ResourceListPage` gains `tablePresentation` and passes it through. `renderCard` continues to
  take precedence when supplied; it is the host's explicit card presentation and is unaffected.

### 5. Detail and summary companions

The same release applies the coarse-pointer rules of ADR 006 to `EntitySummary` and
`ResourceDetailShell`: facts in a two-column grid below `sm`, code values allowed to wrap,
`title`-only content moved to a tap disclosure, and the active detail tab scrolled into view with
edge fades on the tab strip. These are CSS and small markup changes with no new props.

## Compatibility and release impact

- **No backend or storage contract change is required.** `command-center.resource_discovery@v1`
  already defines `importance` with the same three values; its schema, `$id`, manifest entry, and
  runtime parser are unchanged. Serialized bytes and semantics do not change. A backend that emits
  `importance` today keeps working and starts to benefit; one that does not keeps today's output.
- The existing valid fixture `resource-discovery-v1.records.json` already exercises `importance`
  on every column, so the packed bundle proves the field round-trips without a new fixture; no
  invalid fixture changes.
- `ResourceColumnDefinition` gains optional fields. Existing definitions compile and render
  identically.
- `DataTable`, `ResourcePagination`, and `ResourceListPage` gain optional props with defaults that
  reproduce 0.2.1 markup. Consumers who pass nothing see no change.
- The stacked form introduces new `data-cc-*` attributes and class names, which become stable on
  release.
- The hardcoded table cell padding moving to the density variable is a visible change at relaxed
  and tight density and is recorded in the changelog.
- The backend documentation gains a paragraph explaining what `importance` now does, so backend
  authors annotate columns deliberately. This is documentation, not a contract change.

## Rollout plan

1. Depends on ADR 006 section 1 for the breakpoint scale and viewport seam, and on section 2 for
   the control-size variable. Ships as `0.4.0` after `0.3.0`.
2. Implement importance resolution and the fixture first, with unit tests over
   `resolveResourceDiscoveryColumns` for every precedence case.
3. Implement the stacked form, the sort picker, compact pagination, and the toolbar collapse with
   component tests and a 375×812 touch browser test that selects rows, runs a row action from the
   overflow menu, and sorts through the picker.
4. Update the resources guide, the backend contracts guide, the views README, and the
   `build-resource-list` skill. Mark this ADR Accepted with the implementing version.

## Acceptance criteria

This ADR moves to Accepted when:

- a discovery response carrying `importance` produces column definitions carrying the same value,
  and a local definition supplies it when discovery does not;
- `DataTable` with no new prop renders markup identical to 0.2.1;
- the stacked form passes selection, activation, row-action, and sort browser tests at 375×812
  with touch, and the verifier reports no `touch-target` or `horizontal-overflow` violation on it;
- the existing valid fixture with `importance` validates against the unchanged schema and is
  present in the packed tarball; and
- the resources guide shows one list that renders as a table on desktop and stacked on a phone
  from a single definition.

## Alternatives considered

### Add a new `priority` field to the discovery contract

Rejected. The contract already carries `importance` with the same intent. A second field would
force backends to emit both and the SDK to reconcile them. The gap analysis that preceded this ADR
proposed a new field before this was noticed; this decision corrects that.

### Automatic column dropping by measured width

Rejected. Measuring which columns fit is nondeterministic across fonts and content, hides columns
the operator needs, and cannot choose a card title. Declared importance is predictable and testable.

### Make `renderCard` the mobile path

Rejected. `renderCard` is a host-authored presentation that does not reuse columns, so table and
card would show different data and require two definitions to maintain. It remains available for
resources that are genuinely card-shaped.

### Horizontal scrolling only, with sticky columns

Rejected as the only answer. Sticky header and primary column are included for the table form, but
a scrolling eight-column table on a 375px screen still fights row activation and cannot present
actions. The stacked form is the primary phone presentation.

## Consequences

- Backends that annotate `importance` immediately improve every consumer's phone experience
  without an SDK-specific contract change.
- Hosts without discovery get the same behavior by annotating their local column definitions.
- The SDK owns one more presentation form with its own stable markup.
- `ResourceListPage` grows a sort picker and a filters picker that exist only in the stacked form;
  their behavior must stay consistent with the header sort and inline filters they replace.
