---
name: build-resource-picker
description: Build or migrate selection interactions with ResourcePicker and ResourceTransferList from @dev-mainsequence/command-center-sdk/views. Use for controlled single selection, multiple selection, searchable object choices, action menus, custom option rendering, loading states, header actions, supporting copy, and popup placement without inventing another dropdown, and for choosing many items side by side from a long list (a transfer list with Available and Selected lists), such as the users and teams of an access control, without hand-building a dual list.
---

# Build A Resource Picker

## Select The Mode

- Use `single` mode for one controlled value.
- Use `multiple` mode for a controlled set of values.
- Use `action` mode for a searchable command or action menu.

Read the installed `ResourcePickerProps` union before implementation. Each mode has a distinct
contract; do not approximate one mode with another.

## Adapt Domain Data

1. Convert domain records into stable picker option identity, labels, supporting text, and disabled
   state.
2. Keep selection state controlled by the consumer.
3. Use SDK loading, empty, placement, keyboard, portal, copy, header-action, and custom-rendering
   capabilities.
4. Keep fetching and query ownership outside the picker and pass normalized options and state in.

For `ResourceListPage` filters and discovered bulk actions, prefer the higher-level list contracts
that already compose the picker correctly. Do not manually insert another picker into the list
toolbar.

## Choose Many Side By Side

Use `ResourceTransferList` when people choose many items from a long list and need to see what they
chose: the items not chosen on one side, the chosen ones on the other, each searchable, with buttons
that move the marked items or every shown item across. Use a picker for a few choices in a compact
field.

1. Map domain records to picker options (`value`, `label`, `subtitle`, `meta`, `disabled`).
2. Keep `value` controlled, and save from `onValueChange(value, change)`; `change` lists exactly
   what was `added` and `removed`, so send only those changes to the backend.
3. Name the items with a plural `itemLabel`; it names the lists, searches, and move buttons.
4. Mark items that must stay chosen as `disabled`, and give the reason in `meta` or `subtitle`.
5. Compose one list per kind of item: an access control uses one list for users and one for teams
   under each access level. The SDK knows nothing about users, teams, or access.
6. Leave `presentation` at `auto`: side by side on wide screens, stacked on phones.

```tsx
import { ResourceTransferList } from "@dev-mainsequence/command-center-sdk/views";

<ResourceTransferList
  itemLabel="users"
  description="Chosen users can view this object."
  options={users.map((user) => ({
    value: user.uid,
    label: user.name,
    subtitle: user.email,
    disabled: user.uid === ownerUid,
    meta: user.uid === ownerUid ? "Owner" : undefined,
  }))}
  value={viewUserUids}
  onValueChange={(value, change) => saveViewUsers(value, change)}
/>;
```

The list owns its keyboard model (one Tab stop per list; arrows, Home, End; Space marks; Shift with
an arrow extends; Ctrl or Cmd with A marks every shown item; Enter moves), the move-button names,
search, the status announcement, and the phone form. Chosen values it has no option for stay in the
value.

## Do Not Rebuild Owned Behavior

Do not introduce a browser-native select, one-off combobox, menu popover, or dropdown library when
`ResourcePicker` expresses the interaction. Do not hand-build a dual list, a pair of checklists, or
move buttons between two lists; use `ResourceTransferList`. Do not place non-searchable buttons into action mode
just to bypass structured action APIs.

When a picker is one field of a form, wrap it in `Field` from `/controls` and pass
`useFieldControlProps()` to its trigger so the label, description, error, and required state are
wired the same way as every other control. Do not build a second labelled-field pattern; route it
to `$compose-command-center-controls`.

## Check The Phone Presentation

Render the screen at 375×812 with a coarse pointer and confirm no horizontal overflow, no control
under 24px, no text input under 16px, and no hover-only affordance. Run the `/layout/testing`
verifier at its default matrix when the screen sits in an `ApplicationPage`. Use
`useCommandCenterViewport` from `/layout` for any width- or pointer-dependent host logic instead
of `matchMedia`.

## Verify

Test keyboard navigation, focus return, search, loading, empty options, disabled options, controlled
single/multiple updates, action invocation, portal placement, and narrow container behavior. For a
transfer list, test marking and moving by keyboard and pointer, "all shown" with a search, locked
choices, the `change` your application saves, and the stacked form at 375×812.
