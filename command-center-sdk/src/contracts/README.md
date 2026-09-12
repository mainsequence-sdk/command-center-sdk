# SDK Contracts

This module exports the generic ordered-migration helper used by versioned SDK payloads. Public
backend-facing schemas and fixtures live in the package-level `contracts/` directory and are
indexed by `contracts/manifest.json`.

## Entry points

- `src/contracts/migrations.ts`: deterministic consecutive version migrations.
- `contracts/manifest.json`: machine-readable schema and fixture index.

Keep TypeScript types, runtime parsers, schemas, manifest entries, and fixtures aligned. Breaking
wire changes require a new versioned contract identifier and schema file.
