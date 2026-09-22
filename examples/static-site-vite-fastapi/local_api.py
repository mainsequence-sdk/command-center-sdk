"""Loopback-only, single-developer FastAPI example; never deploy as a shared service."""

from uuid import UUID

from fastapi import FastAPI, HTTPException
from mainsequence.client.models_user import User

app = FastAPI(title="Local static-site API example")


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ready"}


@app.get("/api/me")
def get_me() -> dict[str, str | None]:
    # This local-only process has one CLI-authenticated developer identity.
    # In a deployed FastAPI release, use platform-injected request.state.user_uid instead.
    try:
        user = User.get_authenticated_user_details()
        uid = str(UUID(str(user.uid)))
    except Exception as exc:
        # Do not send SDK auth errors or credentials to the browser.
        raise HTTPException(
            status_code=503,
            detail="identity_unavailable: run mainsequence login in the API environment",
        ) from exc
    return {"uid": uid, "username": user.username}
