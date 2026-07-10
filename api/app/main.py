from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import allowed_origins
from app.routes.conti import router as conti_router
from app.routes.dddit import router as dddit_router
from app.routes.hub import router as hub_router
from app.routes.youtube import router as youtube_router


def create_app() -> FastAPI:
    app = FastAPI(title="works-api", docs_url=None, redoc_url=None)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins(),
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "OPTIONS"],
        allow_headers=["Content-Type"],
    )
    app.include_router(dddit_router)
    app.include_router(conti_router)
    app.include_router(hub_router)
    app.include_router(youtube_router)

    @app.get("/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
