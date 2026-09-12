# Package Compatibility

## Current baseline

| Surface | Baseline | Rule |
| --- | --- | --- |
| SDK | `0.2.x` | Public entrypoints follow semantic versioning. |
| Contract manifest | `command-center-contract-manifest@v1` | Breaking wire changes require a new contract ID and schema. |
| Static-site iframe | `mainsequence.*`, version `1` | Hosts and children reject malformed or unsupported messages. |
| Themes | SDK semantic version | Published theme IDs and token names are compatibility-sensitive. |

## Change policy

- Additive optional fields require deterministic defaults and test fixtures.
- Removed or renamed exports require a major package version.
- Released contract identifiers and schema URNs are immutable.
- Theme IDs must not be silently rewritten.
- Unsupported payloads fail explicitly; the SDK does not guess between wire formats.

Application versions and backend rollout versions are independent of the SDK version. Each owner
must document rollout order and rollback when a change crosses a runtime boundary.
