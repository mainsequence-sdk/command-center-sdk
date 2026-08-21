---
name: extend-command-center-sdk
description: Add or extract a reusable capability inside the @dev-mainsequence/command-center-sdk source package. Use when an existing public SDK surface cannot express a repeated frontend pattern and the proposed contract is backend-neutral, consumer-reusable, explicitly composed, and suitable for a published ESM, declaration, CSS, or testing entrypoint. Never use to patch an installed node_modules package.
---

# Extend Command Center SDK

## Confirm The Working Scope

Locate the source package by `package.json` name, not by assuming a monorepo path. Work only inside
the SDK package and its SDK-owned documentation, tests, packaging, and consumer fixtures. Never edit
an installed `node_modules` copy.

## Qualify The Capability

Move behavior into the SDK only when it is reusable across consumers or is a canonical framework
behavior and can be expressed without a specific backend, route, authentication store, product
policy, or domain payload.

Keep the behavior outside the SDK when it:

- calls or interprets a product-specific endpoint;
- chooses routing, persistence, authentication, or organization policy;
- exists for only one domain workflow without a reusable view model; or
- requires importing another application's implementation.

When generic presentation is coupled to a domain payload, split it into an SDK view model and
controlled component plus a consumer-owned adapter.

## Choose The Correct SDK Layer

- Put JSON-safe models, value contracts, normalizers, and migrations under `/contracts`.
- Put framework-neutral object definitions and adapters under `/resource`.
- Put controlled React collection/detail/picker compositions under `/views`.
- Put widget manifests, runtimes, host primitives, tests, and generic built-ins under `/widget`.
- Put workspace documents and read-only rendering under `/workspace`.
- Put portable tokens and styles under `/theme`.
- Put versioned external iframe behavior under `/embed`.

Do not create an export facade for unfinished functionality.

## Implement A Published Contract

1. Define ownership, inputs, outputs, controlled state, extension points, and prohibited coupling.
2. Prefer structured declarations and narrow callbacks over whole-surface render overrides.
3. Keep framework-neutral roots free of React and browser side effects.
4. Add the nearest module README and update package-level documentation.
5. Export the capability through the narrowest intentional subpath and generate declarations.
6. Ship required CSS through explicit package exports.
7. Add focused tests and update a packed consumer when a public surface changes.
8. Use `$evolve-command-center-contract` for serialized or versioned changes.
9. Finish with `$verify-command-center-sdk-change`.

## Assess Compatibility

State whether the change affects only TypeScript ownership, a public API, browser behavior,
serialized data, an independent protocol, or a backend-understood contract. Do not describe a
source move as a storage change unless semantics actually change.
