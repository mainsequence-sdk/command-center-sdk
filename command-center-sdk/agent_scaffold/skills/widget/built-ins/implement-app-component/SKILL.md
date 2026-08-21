---
name: implement-app-component
description: Implement or configure the existing AppComponent built-in from @dev-mainsequence/command-center-sdk. Use when exposing one compiled HTTP operation, prototyping it with inline Mock JSON, mapping generated request and response ports, executing a browser-accessible manual target, or injecting trusted host transport while preserving core__app-component and command-center.app_component_authoring@v1.
---

# Implement AppComponent

## Stay In Consumer Scope

Work only in the consuming application or trusted widget host. Do not edit the Command Center SDK
source, AppComponent implementation, or its published schema during this skill.

If the installed contract cannot represent the requirement, record the exact missing capability
and stop this implementation task. Produce a separate SDK-source handoff with the pinned version,
contract ID, failing fixture or payload, and compatibility requirement. Do not continue into SDK
maintenance from this consumer skill.

## Use The Existing AppComponent Contract

Use AppComponent for one reusable request-and-response operation. Do not use it for an entire
routed application, a resource list/detail lifecycle, or a generic connection editor. Mock JSON is
an AppComponent target mode, not another widget or contract.

Inspect the installed `/widget/built-ins/app-component` declarations. Resolve
`command-center.app_component_authoring@v1` from `/contracts/manifest.json`, then load only the
schema and fixtures indexed by that entry. Do not reproduce the authoring schema in this skill.

## Implement The Operation

1. Reuse `appComponentWidgetModule` and canonical ID `core__app-component`.
2. Choose the schema-supported target appropriate to the operation.
3. Author the JSON-safe operation through the canonical schema rather than inventing fields.
4. Bind upstream values to
   the generated request ports and downstream consumers to the generated response ports.
5. Keep request input presentation in the published request-input map rather than inventing
   application-specific prop fields.
6. Use the portable no-auth transport only for suitable targets. Inject privileged transport,
   session authentication, internal gateways, and product-specific target resolution through a
   trusted host runtime override.
7. Handle CORS, cancellation, loading, transport failure, response status, and malformed response
   data at the owning runtime boundary.

## Preserve The Boundary

Never persist secrets, bearer tokens, session JWTs, clients, callbacks, or React nodes in props.
Do not modify the built-in, fork its ID, invent another Mock JSON widget, or change its dynamic port
meaning.

## Verify

Validate the authoring envelope and Mock JSON against the installed schema and fixtures. Test
manual and Mock JSON execution, generated IO, input mapping, cancellation, errors, preview data,
and trusted host transport separately.
