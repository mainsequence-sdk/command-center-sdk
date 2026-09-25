# Package Compatibility

## Current baseline

| Surface | Baseline | Rule |
| --- | --- | --- |
| SDK | `0.2.x` | Public entrypoints follow semantic versioning. |
| Contract manifest | `command-center-contract-manifest@v1` | Breaking wire changes require a new contract ID and schema. |
| Static-site iframe | `mainsequence.*`, version `1` | Hosts and children reject malformed or unsupported messages. |
| Themes | SDK semantic version | Published theme IDs and token names are compatibility-sensitive. |
| Chat | `0.0.4` | Public entrypoints follow semantic versioning. |
| Chat's SDK peer range | A caret range on the first SDK release that publishes `--warning-tint` (`^0.5.3` in the manifest) | A new SDK minor widens the range and releases the chat in the same change. |
| Chat's platform routes | The routes listed in the chat's documentation | Each chat release names the routes it calls and the platform version it expects. |

## Change policy

- Additive optional fields require deterministic defaults and test fixtures.
- Removed or renamed exports require a major package version.
- Released contract identifiers and schema URNs are immutable.
- Theme IDs must not be silently rewritten.
- Unsupported payloads fail explicitly; the SDK does not guess between wire formats.
- The SDK does not depend on the chat. While the SDK is 0.x, a new SDK minor needs a chat release
  that widens the chat's peer range, in the same change.

Application versions and backend rollout versions are independent of the package versions. Each
owner must document rollout order and rollback when a change crosses a runtime boundary.
