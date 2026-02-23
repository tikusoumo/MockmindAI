from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .routers.data import router as data_router
from .routers.health import router as health_router
from .routers.livekit import router as livekit_router
from .routers.auth import router as auth_router
from .routers.documents import router as documents_router
from .routers.reports import router as reports_router
from .settings import settings

app = FastAPI(title="AI Voice Agent Backend")

allow_origins = [

	o.strip()
	for o in (settings.cors_allow_origins or "").split(",")
	if o.strip()
]

app.add_middleware(
	CORSMiddleware,
	allow_origins=allow_origins,
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)


@app.get("/hello")
def hello() -> dict[str, str]:
	return {"message": "hello"}

app.include_router(health_router)
app.include_router(livekit_router)
app.include_router(data_router)
app.include_router(auth_router)
app.include_router(documents_router)
app.include_router(reports_router)

