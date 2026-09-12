# Static-Site Iframe APIs

The embed module implements the application-owned `mainsequence.*` version-one static-site
handshake. It provides a framework-neutral host/client protocol and a React host component.

## Entry points

- `/embed`: message types, parsers, host/client creation, origin resolution, and delegated FastAPI
  credential helpers.
- `/embed/react`: `StaticSiteIframe`.

## Required controls

- Use an exact expected origin; never `*`.
- Keep the iframe sandbox minimal.
- Validate channel, version, message type, request IDs, payload size, and message source.
- Expose only the public user UID and theme context.
- Resolve runtime credentials through a trusted host callback.
- Enforce authorization, target scope, expiry, CORS, and origin policy in the backend.
- Dispose listeners and reject late or duplicate responses.

The SDK does not own authentication or credential minting. The host application injects those
capabilities and remains responsible for policy and audit behavior.
