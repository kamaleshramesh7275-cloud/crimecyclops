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
from app.routers import analytics as analytics_router
from app.routers import public_safety as public_safety_router
from chatbot.routes import router as chatbot_router

from chatbot.vectorstore import vector_store_instance
from chatbot.dataset_loader import load_all_dataset
import os
from fastapi import Depends
from app.auth_service import RoleChecker

# Access control check groups
investigator_analyst_checker = RoleChecker(["investigator", "analyst"])
admin_checker = RoleChecker(["admin"])

app = FastAPI(title="CrimeCyclops", version="1.0.0")

FRONTEND_DIST = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "frontend", "dist")
)


@app.on_event("startup")
def startup_event():
    init_db()
    # Initialize chatbot vector store
    if not vector_store_instance.load_from_disk():
        docs = load_all_dataset()
        vector_store_instance.build_index(docs)

# CORS Configuration - Restrict * wildcard for production
allowed_origins_str = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000")
allowed_origins = [origin.strip() for origin in allowed_origins_str.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Public routes
app.include_router(auth_router.router, prefix="/api")
app.include_router(public_safety_router.router, prefix="/api")


# Authenticated routes (investigators and analysts)
app.include_router(dashboard_router.router, prefix="/api", dependencies=[Depends(investigator_analyst_checker)])
app.include_router(network_router.router, prefix="/api", dependencies=[Depends(investigator_analyst_checker)])
app.include_router(reports_router.router, prefix="/api", dependencies=[Depends(investigator_analyst_checker)])
app.include_router(alerts_router.router, prefix="/api", dependencies=[Depends(investigator_analyst_checker)])
app.include_router(geo_router.router, prefix="/api", dependencies=[Depends(investigator_analyst_checker)])
app.include_router(analytics_router.router, prefix="/api", dependencies=[Depends(investigator_analyst_checker)])
app.include_router(chatbot_router, prefix="/api", dependencies=[Depends(investigator_analyst_checker)])

# Admin-only operations
app.include_router(ingest_router.router, prefix="/api", dependencies=[Depends(admin_checker)])


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
