---
name: build-resource-picker
description: Build or migrate selection interactions with ResourcePicker from @dev-mainsequence/command-center-sdk/views. Use for controlled single selection, multiple selection, searchable object choices, action menus, custom option rendering, loading states, header actions, supporting copy, and popup placement without inventing another dropdown.
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

## Do Not Rebuild Owned Behavior

Do not introduce a browser-native select, one-off combobox, menu popover, or dropdown library when
`ResourcePicker` expresses the interaction. Do not place non-searchable buttons into action mode
just to bypass structured action APIs.

## Verify

Test keyboard navigation, focus return, search, loading, empty options, disabled options, controlled
single/multiple updates, action invocation, portal placement, and narrow container behavior.
