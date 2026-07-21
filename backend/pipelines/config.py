import os
from pathlib import Path

# Base Paths
PIPELINE_DIR = Path(__file__).resolve().parent
BACKEND_DIR = PIPELINE_DIR.parent
DATA_DIR = BACKEND_DIR / "data"

# Subdirectories for data storage
RAW_DATA_DIR = DATA_DIR / "raw"
CLEAN_DATA_DIR = DATA_DIR / "clean"

# Create folders if not existing
RAW_DATA_DIR.mkdir(parents=True, exist_ok=True)
CLEAN_DATA_DIR.mkdir(parents=True, exist_ok=True)

# Database config
DATABASE_URL = os.getenv("DATABASE_URL")
