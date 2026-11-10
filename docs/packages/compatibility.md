# Package Compatibility

## Current baseline

| Surface | Baseline | Rule |
| --- | --- | --- |
| SDK | `0.5.19` | Public entrypoints follow semantic versioning. |
| Contract manifest | `command-center-contract-manifest@v1` | Breaking wire changes require a new contract ID and schema. |
| Static-site iframe | `mainsequence.*`, version `1` | Hosts and children reject malformed or unsupported messages. |
| Themes | SDK semantic version | Published theme IDs and token names are compatibility-sensitive. |
| Chat | `0.0.17` | Public entrypoints follow semantic versioning. |
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

## SDK 0.5.19 locale adoption

The iframe retains `command-center.static_site_iframe@v1`, its schema URN, and
numeric version 1. New children advertise `locale-context-v1` in ready capabilities;
new hosts include the optional locale field only for those children. Legacy
children receive the original initialize shape, including under strict legacy
schema validation. New children on old hosts normalize a missing locale to `en`.

Locale uses the documented BCP 47 language/script/region core profile. Invalid
values are rejected; an unsupported translation has an application-owned English
fallback. Update the schema bundle with the SDK before advertising support.
Neither adoption nor rollback changes stored preferences, authentication, business
records, or theme IDs. See the SDK localization and embed guides for migration.
