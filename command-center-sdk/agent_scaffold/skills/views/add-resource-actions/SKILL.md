---
name: add-resource-actions
description: Add or migrate resource actions through the currently published @dev-mainsequence/command-center-sdk view and adapter contracts. Use for ResourceListPage primary and row actions, ResourceDetailShell header action placement, explicit or all-matching selection, backend-discovered bulk actions, options, confirmation, preflight, blocked states, execution, refresh, and selection cleanup.
---

# Add Resource Actions

## Inspect The Installed Action Surface

Read `ResourceListPageProps`, `ResourceDetailShellProps`, resource action types, and adapter methods
from the installed version. Do not assume that `definition.actions` automatically renders or
executes actions unless the installed view explicitly consumes it.

## Separate Ownership

- Pass consumer-owned list primary actions through `primaryActions` and row actions through
  `rowActions`.
- Pass consumer-controlled detail action elements through `ResourceDetailShell.headerActions`; the
  current shell owns placement, not their execution lifecycle.
- Obtain selection and bulk action availability, endpoints, selection modes, options, confirmation,
  tone, and optional preflight from `bulk_actions` in the adapter's canonical
  `command-center.resource_discovery@v1` response when the backend owns them.

Do not hardcode a backend-owned bulk capability into a custom toolbar.

## Use The SDK Lifecycle

1. Give each supported list action a stable id, label, tone, and disabled or pending state.
2. Use the standard list or detail action region rather than adding another toolbar.
3. Use `discoveredRowActions` only to map a row control to an advertised adapter action.
4. Rediscover immediately before execution so permission or option changes are reviewed. Do not
   rediscover through `/bulk-actions/` in a canonical list.
5. Preserve `explicit` and `all_matching` bulk selection semantics exactly. Discovery's compound
   UI identity is not a bulk-action UID.
6. Pass advertised options and canonical selection unchanged to preflight and execution.
7. Run advertised preflight when confirmation opens and whenever selection or options change.
8. Keep confirmation disabled until the current preflight allows execution.
9. Preserve pending, error, blocked, retry, refresh, and selection cleanup owned by
   `ResourceListPage`.

Use the SDK `ResourceActionConfirmationDialog`, bulk action picker, and preflight panel unless a host
injects the established confirmation presentation contract. A custom renderer may change
presentation but must preserve lifecycle and the hard `canConfirm` gate.

## Do Not Rebuild Owned Behavior

Do not add one toolbar button per discovered bulk action. Do not bypass confirmation by calling the
adapter directly. Do not execute a blocked bulk action. Do not claim SDK-owned lifecycle for a
consumer-provided detail action element. Do not reduce warning or danger tone to button color alone.

## Backend Handoff

When an action contract is missing, hand the backend task the required action id, selection modes,
options, confirmation copy, tone, preflight response, execution response, permission, and error
semantics. Use `$implement-bulk-actions-contract` for the backend implementation and keep it
outside this frontend view skill.

## Verify

Test list action placement, disabled and pending state, detail action placement, every bulk
selection mode, defaults, confirmation text, allowed and blocked preflight, stale-request
cancellation, rediscovery, retry, transport failure, successful refresh, and selection cleanup.
