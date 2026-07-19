from pathlib import Path
import sqlite3

DB_PATH = Path(__file__).resolve().parents[1] / "crimecyclops.db"


def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db_connection()
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS districts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            population_density REAL,
            literacy_rate REAL,
            unemployment_proxy REAL
        );

        CREATE TABLE IF NOT EXISTS stations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            district_id INTEGER,
            name TEXT NOT NULL,
            beat TEXT,
            latitude REAL,
            longitude REAL,
            FOREIGN KEY(district_id) REFERENCES districts(id)
        );

        CREATE TABLE IF NOT EXISTS fir_records (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            district_id INTEGER,
            station_id INTEGER,
            crime_type TEXT,
            ipc_section TEXT,
            incident_date TEXT,
            latitude REAL,
            longitude REAL,
            status TEXT,
            description TEXT,
            FOREIGN KEY(district_id) REFERENCES districts(id),
            FOREIGN KEY(station_id) REFERENCES stations(id)
        );

        CREATE TABLE IF NOT EXISTS persons (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            role TEXT,
            name TEXT,
            age_band TEXT,
            gender TEXT,
            occupation TEXT
        );

        CREATE TABLE IF NOT EXISTS case_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fir_id INTEGER,
            person_id INTEGER,
            relationship_type TEXT,
            FOREIGN KEY(fir_id) REFERENCES fir_records(id),
            FOREIGN KEY(person_id) REFERENCES persons(id)
        );

        CREATE TABLE IF NOT EXISTS seizures (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fir_id INTEGER,
            seizure_type TEXT,
            quantity TEXT,
            location TEXT,
            seizure_date TEXT,
            FOREIGN KEY(fir_id) REFERENCES fir_records(id)
        );

        CREATE TABLE IF NOT EXISTS court_outcomes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            fir_id INTEGER,
            outcome TEXT,
            conviction_rate REAL,
            FOREIGN KEY(fir_id) REFERENCES fir_records(id)
        );

        CREATE TABLE IF NOT EXISTS officers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT,
            station_id INTEGER,
            workload INTEGER DEFAULT 0,
            FOREIGN KEY(station_id) REFERENCES stations(id)
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_name TEXT,
            action TEXT,
            resource TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            role TEXT,
            password TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_fir_station_date ON fir_records(station_id, incident_date);
        CREATE INDEX IF NOT EXISTS idx_fir_location ON fir_records(latitude, longitude);
        CREATE INDEX IF NOT EXISTS idx_case_links_fir ON case_links(fir_id);
        CREATE INDEX IF NOT EXISTS idx_case_links_person ON case_links(person_id);
        """
    )
    conn.commit()
    conn.close()
