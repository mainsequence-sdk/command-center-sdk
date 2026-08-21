---
name: implement-adapter-from-api-contract
description: Implement the existing Adapter From API serialized contracts published by @dev-mainsequence/command-center-sdk. Use when producing or consuming provider discovery, executable operation queries, persisted public configuration, write-only secure configuration, transport-mode settings, health declarations, or exact responseContract mappings without adding connection UI or changing the SDK schemas.
---

# Implement Adapter From API Contracts

## Stay In Consumer Scope

Work only in the provider, backend, application, or integration consuming the installed SDK
contract bundle. Do not edit the Command Center SDK source or its published schemas during this
skill.

If the installed contract cannot represent the requirement, record the exact missing capability
and stop this implementation task. Produce a separate SDK-source handoff with the pinned version,
contract ID, failing fixture or payload, and compatibility requirement. Do not continue into SDK
maintenance from this consumer skill.

## Use The Contract-Only Surface

This skill implements the published wire contracts. It does not build connection UI,
authentication, credential storage, provider execution, or application routing. Resolve every
Adapter From API entry from the installed `/contracts/manifest.json`, then load each referenced
schema and its indexed valid and invalid fixtures. The manifest bundle is authoritative; do not
copy its field definitions or maintain a second list of contract IDs in this skill.

## Implement The Four Boundaries

1. Implement discovery, query, public configuration, and secure configuration at their actual
   trust boundaries.
2. Generate models and validators from the manifest-selected schemas without weakening strictness.
3. Preserve the declared operation response contract in backend and direct transport modes.
4. Keep public and secure configuration separated throughout persistence, logging, and responses.
5. Apply semantic checks documented by the canonical contract guide when JSON Schema alone cannot
   express a cross-field rule.

## Preserve The Boundary

Do not add compatibility aliases, frontend presentation state, product endpoints, or executable
code to these payloads. Do not edit the installed schemas to accommodate an invalid provider.

## Verify

Compile all four installed schemas with draft 2020-12, accept every indexed valid fixture, reject
every invalid fixture, and contract-test discovery, public/secure separation, both transport modes,
health resolution, executable query validation, exact response bodies, and secret redaction.
