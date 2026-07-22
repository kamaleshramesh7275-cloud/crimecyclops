import os
from pathlib import Path
import sqlite3
import bcrypt

DB_PATH = Path(__file__).resolve().parents[1] / "crimecyclops.db"
DATABASE_URL = os.getenv("DATABASE_URL")


class SQLiteRowWrapper:
    """Wrapper to make sqlite3.Row behave like psycopg2 RealDictCursor for subscriptable keys."""
    def __init__(self, row):
        self._row = row

    def __getitem__(self, key):
        try:
            return self._row[key]
        except KeyError:
            # PostgreSQL keys are case-sensitive or case-insensitive depending on query,
            # but sometimes code looks for keys differently.
            raise

    def keys(self):
        return self._row.keys()


def get_db_connection():
    if DATABASE_URL and (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
        import psycopg2
        import psycopg2.extras
        # Return connection with RealDictCursor for compatibility with dict-like row access
        conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        return conn
    else:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        return conn


def init_db():
    if DATABASE_URL and (DATABASE_URL.startswith("postgresql://") or DATABASE_URL.startswith("postgres://")):
        init_postgres()
    else:
        init_sqlite()


def init_postgres():
    import psycopg2
    conn = get_db_connection()
    cur = conn.cursor()
    
    # 1. Enable PostGIS
    cur.execute("CREATE EXTENSION IF NOT EXISTS postgis;")
    
    # 2. Create tables
    cur.execute("""
        CREATE TABLE IF NOT EXISTS districts (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            population_density REAL,
            literacy_rate REAL,
            unemployment_proxy REAL,
            data_source VARCHAR(50) DEFAULT 'SYNTHETIC'
        );

        CREATE TABLE IF NOT EXISTS stations (
            id SERIAL PRIMARY KEY,
            district_id INTEGER REFERENCES districts(id),
            name VARCHAR(255) NOT NULL,
            beat VARCHAR(255),
            latitude REAL,
            longitude REAL,
            data_source VARCHAR(50) DEFAULT 'SYNTHETIC'
        );
    """)
    
    # Add geometry column using PostGIS helper if not already present
    cur.execute("""
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='stations' AND column_name='geom';
    """)
    if not cur.fetchone():
        cur.execute("SELECT AddGeometryColumn('stations', 'geom', 4326, 'POINT', 2);")
        
    cur.execute("""
        CREATE TABLE IF NOT EXISTS fir_records (
            id SERIAL PRIMARY KEY,
            district_id INTEGER REFERENCES districts(id),
            station_id INTEGER REFERENCES stations(id),
            crime_type VARCHAR(255),
            ipc_section VARCHAR(255),
            incident_date VARCHAR(50),
            latitude REAL,
            longitude REAL,
            status VARCHAR(50),
            description TEXT,
            data_source VARCHAR(50) DEFAULT 'SYNTHETIC'
        );
    """)
    
    cur.execute("""
        SELECT 1 FROM information_schema.columns 
        WHERE table_name='fir_records' AND column_name='geom';
    """)
    if not cur.fetchone():
        cur.execute("SELECT AddGeometryColumn('fir_records', 'geom', 4326, 'POINT', 2);")

    cur.execute("""
        CREATE TABLE IF NOT EXISTS persons (
            id SERIAL PRIMARY KEY,
            role VARCHAR(50),
            name VARCHAR(255),
            age_band VARCHAR(50),
            gender VARCHAR(50),
            occupation VARCHAR(255)
        );

        CREATE TABLE IF NOT EXISTS case_links (
            id SERIAL PRIMARY KEY,
            fir_id INTEGER REFERENCES fir_records(id),
            person_id INTEGER REFERENCES persons(id),
            relationship_type VARCHAR(50)
        );

        CREATE TABLE IF NOT EXISTS seizures (
            id SERIAL PRIMARY KEY,
            fir_id INTEGER REFERENCES fir_records(id),
            seizure_type VARCHAR(255),
            quantity VARCHAR(255),
            location VARCHAR(255),
            seizure_date VARCHAR(50)
        );

        CREATE TABLE IF NOT EXISTS court_outcomes (
            id SERIAL PRIMARY KEY,
            fir_id INTEGER REFERENCES fir_records(id),
            outcome VARCHAR(255),
            conviction_rate REAL
        );

        CREATE TABLE IF NOT EXISTS officers (
            id SERIAL PRIMARY KEY,
            name VARCHAR(255),
            station_id INTEGER REFERENCES stations(id),
            workload INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS audit_log (
            id SERIAL PRIMARY KEY,
            user_name VARCHAR(255),
            action VARCHAR(255),
            resource VARCHAR(255),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username VARCHAR(255) UNIQUE,
            role VARCHAR(50),
            password VARCHAR(255)
        );

        CREATE INDEX IF NOT EXISTS idx_fir_station_date ON fir_records(station_id, incident_date);
        CREATE INDEX IF NOT EXISTS idx_case_links_fir ON case_links(fir_id);
        CREATE INDEX IF NOT EXISTS idx_case_links_person ON case_links(person_id);
    """)
    
    # Create GIST spatial indexes if not exist
    cur.execute("CREATE INDEX IF NOT EXISTS idx_stations_geom ON stations USING GIST(geom);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fir_records_geom ON fir_records USING GIST(geom);")

    # Insert default admin user if not exists
    cur.execute("SELECT 1 FROM users WHERE username = 'admin';")
    if not cur.fetchone():
        hashed_password = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
        cur.execute(
            "INSERT INTO users (username, role, password) VALUES (%s, %s, %s);",
            ("admin", "admin", hashed_password)
        )

    conn.commit()
    cur.close()
    conn.close()


def init_sqlite():
    conn = sqlite3.connect(DB_PATH)
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS districts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            population_density REAL,
            literacy_rate REAL,
            unemployment_proxy REAL,
            data_source TEXT DEFAULT 'SYNTHETIC'
        );

        CREATE TABLE IF NOT EXISTS stations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            district_id INTEGER,
            name TEXT NOT NULL,
            beat TEXT,
            latitude REAL,
            longitude REAL,
            data_source TEXT DEFAULT 'SYNTHETIC',
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
            data_source TEXT DEFAULT 'SYNTHETIC',
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
    
    # Check if data_source columns need to be added (for existing SQLite databases)
    try:
        conn.execute("SELECT data_source FROM districts LIMIT 1;")
    except sqlite3.OperationalError:
        conn.execute("ALTER TABLE districts ADD COLUMN data_source TEXT DEFAULT 'SYNTHETIC';")
        conn.execute("ALTER TABLE stations ADD COLUMN data_source TEXT DEFAULT 'SYNTHETIC';")
        conn.execute("ALTER TABLE fir_records ADD COLUMN data_source TEXT DEFAULT 'SYNTHETIC';")

    # Seed default user if not exists
    cur = conn.cursor()
    cur.execute("SELECT 1 FROM users WHERE username = 'admin';")
    if not cur.fetchone():
        hashed_password = bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")
        cur.execute(
            "INSERT INTO users (username, role, password) VALUES (?, ?, ?);",
            ("admin", "admin", hashed_password)
        )
    conn.commit()
    conn.close()
