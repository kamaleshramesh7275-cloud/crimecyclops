from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from app.database import init_db
from app.routers import dashboard as dashboard_router
from app.routers import ingest as ingest_router
from app.routers import network as network_router
from app.routers import reports as reports_router
from app.routers import auth as auth_router
from app.routers import alerts as alerts_router
from app.routers import geo as geo_router
import os

app = FastAPI(title="CrimeCyclops", version="1.0.0")

FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)


@app.on_event("startup")
def startup_event():
    init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard_router.router, prefix="/api")
app.include_router(ingest_router.router, prefix="/api")
app.include_router(network_router.router, prefix="/api")
app.include_router(reports_router.router, prefix="/api")
app.include_router(auth_router.router, prefix="/api")
app.include_router(alerts_router.router, prefix="/api")
app.include_router(geo_router.router, prefix="/api")


@app.get("/health")
def health():
    return {"status": "ok"}


# Serve built React frontend static assets
if os.path.isdir(FRONTEND_DIST):
    assets_dir = os.path.join(FRONTEND_DIST, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    """Catch-all: serve React app for any non-API route."""
    candidate = os.path.join(FRONTEND_DIST, full_path)
    if os.path.isfile(candidate):
        return FileResponse(candidate)
    return FileResponse(os.path.join(FRONTEND_DIST, "index.html"))
