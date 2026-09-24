# Local static site and FastAPI

This is a small, application-owned consumer of `@dev-mainsequence/command-center-sdk`. Its Vite
page runs at the top level and sends `/api` requests through Vite's same-origin proxy. The Python
process resolves the **one developer signed in to its Main Sequence CLI session** on the server;
the browser supplies no user UID or credential. No FastAPI ResourceRelease UID or iframe host is
needed for this local path.

This local identity model is for a single developer on a loopback-bound machine. It does not
authenticate each browser visitor. Do not share this runner with other
users. Deployed FastAPI routes read platform-injected `request.state.user` and
`request.state.user_uid`; the local runner here deliberately does not provide those
fields. See the [Main Sequence FastAPI request-user guide](https://github.com/mainsequence-sdk/mainsequence-sdk/blob/main/docs/knowledge/fastapi/index.md)
and [CLI authentication guide](https://github.com/mainsequence-sdk/mainsequence-sdk/blob/main/docs/knowledge/infrastructure/auth.md).

## Run

Use Python 3.13 or later and Node 22 or 24. In this example directory, use two terminals:

```bash
python3.13 -m venv .venv
. .venv/bin/activate
python -m pip install -r requirements.txt
mainsequence login
mainsequence user
python -m uvicorn local_api:app --host 127.0.0.1 --port 8001
```

Wait for Uvicorn's `Application startup complete` message. In another terminal, verify readiness
and start Vite:

```bash
curl --fail http://127.0.0.1:8001/healthz
npm install
npm run dev
```

Open `http://127.0.0.1:5174/`. The page calls `/api/me`; Vite proxies it to
`http://127.0.0.1:8001/api/me`. The API obtains the UID from
`User.get_authenticated_user_details()` using its own CLI session, and returns the public UID and
optional username. If login is absent, expired, or the platform cannot be reached, `/api/me`
returns `503` with `identity_unavailable`; the page shows a sign-in/availability message rather than
inventing a user. `/healthz` remains available so readiness and identity can be diagnosed
separately. Run `mainsequence login` again in the Python process's environment when needed.

## Hosted transport

Build with `VITE_API_TRANSPORT=hosted`, `VITE_HOST_ORIGIN=<exact HTTPS host origin>`, and a JSON
map of application API names to authorized canonical release UIDs. For example:

```bash
VITE_API_TRANSPORT=hosted \
VITE_HOST_ORIGIN=https://command-center.example.com \
VITE_FASTAPI_RELEASES='{"identity":"00000000-0000-4000-8000-000000000001","reports":"00000000-0000-4000-8000-000000000002"}' \
npm run build
```

The page uses the `identity` entry for `/api/me`. Add any number of names to the map, then select
the target for each request through the same transport:

```ts
const releases = parseHostedApiReleases(import.meta.env.VITE_FASTAPI_RELEASES);
const transport = createHostedApiTransport({ client, releases });
await transport.get("identity", "/api/me");
await transport.get("reports", "/v1/report");
```

The second call illustrates routing; this small example does not implement `/v1/report`. An
unknown API name fails before a request is sent. The names and release UIDs are public routing
values, not credentials. `fetchFastApi` receives the selected UID on each call and has no
dependency on the name of the Vite variable or on this example's configuration format.

The frontend installs the SDK iframe listener and uses `client.fetchFastApi`. The trusted host
must provide a delegated credential resolver that authorizes each requested release, and the
identity release must serve `/api/me`. Directly opening the hosted build has no trusted parent
bridge and shows an unavailable error. A non-local direct link cannot use the local CLI developer
identity; supporting it requires a separate application-owned backend transport that
authenticates each request. Never put a session token or secret in a Vite variable.

The application-owned selection lives in `src/transport.ts`; neither path is an SDK backend
transport. The local runner and Vite proxy still demonstrate one API; add local proxy routes for
additional local APIs. Do not copy `local_api.py` into a deployed multi-user service.
