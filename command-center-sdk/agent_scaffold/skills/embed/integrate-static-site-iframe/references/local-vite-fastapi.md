# Top-Level Local Vite And FastAPI Procedure

Use this procedure when a static site is opened directly from Vite and calls a local FastAPI API.
The Vite app and FastAPI module belong to the consuming application. The SDK supplies no local
authentication middleware or proxy. Complete the runner, identity, readiness, proxy, and direct
transport before declaring the local page functional.

## 1. Serve A Loopback API With Server-Side Developer Identity

Add a FastAPI ASGI module with `/healthz` and the needed `/api/...` routes. For a single-developer
loopback runner, resolve the signed-in developer on the **server** using the `mainsequence` Python
package:

```python
from fastapi import FastAPI, HTTPException
from mainsequence.client.models_user import User

app = FastAPI()

@app.get("/healthz")
def healthz():
    return {"status": "ready"}

@app.get("/api/me")
def me():
    try:
        user = User.get_authenticated_user_details()
    except Exception as exc:
        raise HTTPException(503, detail="identity_unavailable") from exc
    return {"uid": user.uid, "username": user.username}
```

This identifies the CLI user of the local API process, not each browser visitor. Do not share
this runner with other users. Deployed FastAPI routes use the
platform-injected `request.state.user` and `request.state.user_uid`; plain Uvicorn does not inject
those fields. Do not accept a browser UID header, copied session token, or Vite credential as a
substitute.

## 2. Start The API And Wait For Readiness

Use Python 3.13 or later. Use the application's existing Python environment and dependency file;
for a new local example, create one and install the API dependencies:

```bash
python3.13 -m venv .venv
. .venv/bin/activate
python -m pip install 'fastapi>=0.115,<1' 'uvicorn>=0.34,<1' 'mainsequence>=8.1.19,<9'
```

In that same environment, authenticate and start the API:

```bash
mainsequence login
mainsequence user
python -m uvicorn local_api:app --host 127.0.0.1 --port 8001
```

Replace `local_api:app` with the consuming application's module and ASGI object if different.
Wait for Uvicorn's `Application startup complete`. In another terminal check:

```bash
curl --fail http://127.0.0.1:8001/healthz
```

If login is absent, expired, or the platform cannot be reached, the protected route must
return `503 identity_unavailable` without leaking backend auth errors. Show an unavailable state
and fix the API process's CLI login.

## 3. Proxy The API Through Vite

Configure the consuming application's Vite server to preserve the `/api` prefix:

```ts
// vite.config.ts
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: { "/api": "http://127.0.0.1:8001" },
  },
});
```

## 4. Call The Local Transport And Verify It

Install the Vite application's declared npm dependencies and start it:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:5174/`. In the application-owned API
client or resource adapter, select local mode explicitly and call
`fetch("/api/me", { signal })` (or another `/api/...` route). Verify the browser requests `/api`
from the Vite origin and the local FastAPI process receives it. With a valid CLI session, it
returns the signed-in developer's UID. With identity unavailable, it returns `503` and the page
shows an unavailable state.

Do not use `fetchFastApi`, a ResourceRelease UID, or an iframe host for this top-level local path.
The [runnable SDK consumer example](https://github.com/mainsequence-sdk/command-center-sdk/tree/main/examples/static-site-vite-fastapi)
shows the complete files and an explicit local/hosted transport selector.
