"""
Run this once to seed the Neon PostgreSQL database.
Execute from the backend/ directory:

    cd c:\projects\crimecyclops\backend
    python seed_postgres.py
"""
import os
import sys
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

import psycopg2
import psycopg2.extras
from app.database import init_db
from app.auth_service import get_password_hash

DATABASE_URL = os.getenv("DATABASE_URL", "")
if not DATABASE_URL:
    print("ERROR: DATABASE_URL not set. Make sure backend/.env exists.")
    sys.exit(1)

# ── Same data as seed_data.py ────────────────────────────────────────────────

DISTRICTS_DATA = {
    "Bengaluru Urban": {"lat": 12.97, "lon": 77.59, "density": 12000, "lit": 0.88, "unemp": 0.14},
    "Bengaluru Rural": {"lat": 13.20, "lon": 77.58, "density": 4400, "lit": 0.78, "unemp": 0.16},
    "Mysuru": {"lat": 12.30, "lon": 76.64, "density": 5200, "lit": 0.80, "unemp": 0.12},
    "Dakshina Kannada": {"lat": 12.87, "lon": 74.88, "density": 4500, "lit": 0.88, "unemp": 0.11},
    "Dharwad": {"lat": 15.45, "lon": 75.00, "density": 6400, "lit": 0.74, "unemp": 0.19},
    "Kalaburagi": {"lat": 17.33, "lon": 76.83, "density": 4800, "lit": 0.68, "unemp": 0.21},
    "Ballari": {"lat": 15.14, "lon": 76.92, "density": 3700, "lit": 0.65, "unemp": 0.24},
    "Belagavi": {"lat": 15.85, "lon": 74.50, "density": 6000, "lit": 0.73, "unemp": 0.18},
    "Udupi": {"lat": 13.34, "lon": 74.74, "density": 4100, "lit": 0.86, "unemp": 0.12},
    "Tumakuru": {"lat": 13.34, "lon": 77.10, "density": 4300, "lit": 0.75, "unemp": 0.17},
}

CRIME_TEMPLATES = [
    ("Cyber Fraud", "IPC 420 / IT Act 66D", "Victim duped via fake trading app at {locality}."),
    ("Drug Trafficking", "NDPS Act 21/27", "Seizure of {qty} grams MDMA near {locality}."),
    ("Burglary", "IPC 457/380", "Night break-in and theft of gold worth Rs. {amount} lakh at {locality}."),
    ("Vehicle Theft", "IPC 379", "Theft of 2-wheeler near metro station at {locality}."),
    ("Assault", "IPC 323/324", "Physical assault from land dispute at {locality}."),
    ("Domestic Violence", "IPC 498A", "Marital harassment complaint at {locality}."),
    ("Missing Person", "IPC 363", "Missing 22-year-old last seen near {locality}."),
    ("Commercial Fraud", "IPC 406/420", "Financial misappropriation case at {locality}."),
]

PERSON_ROLES = ["victim", "accused", "witness"]
AGE_BANDS = ["18-25", "26-35", "36-45", "46-55", "56+"]
GENDERS = ["Male", "Female", "Other"]
OCCUPATIONS = ["IT Professional", "Vendor", "Student", "Businessperson", "Driver", "Farmer"]
FIRST_NAMES = ["Kiran", "Rajesh", "Priya", "Suresh", "Lakshmi", "Anand", "Deepak", "Manjunath"]
LAST_NAMES = ["Gowda", "Rao", "Patil", "Shetty", "Kulkarni", "Hegde", "Bhat", "Nayak"]

def rand_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

def main():
    print("Connecting to Neon PostgreSQL...")
    conn = psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    # Init schema first
    print("Initialising schema...")
    init_db()

    # Clear existing data
    print("Clearing old data...")
    tables = ["audit_log", "users", "court_outcomes", "seizures",
              "case_links", "persons", "fir_records", "officers", "stations", "districts"]
    for t in tables:
        cur.execute(f"DELETE FROM {t}")

    # Seed districts + stations + FIRs
    print("Seeding districts, stations, FIR records...")
    for district_name, data in DISTRICTS_DATA.items():
        cur.execute(
            "INSERT INTO districts(name, population_density, literacy_rate, unemployment_proxy) VALUES (%s, %s, %s, %s) RETURNING id",
            (district_name, data["density"], data["lit"], data["unemp"])
        )
        district_id = cur.fetchone()["id"]

        num_stations = 6 if district_name != "Bengaluru Urban" else 15
        for s_idx in range(1, num_stations + 1):
            slat = data["lat"] + random.uniform(-0.1, 0.1)
            slon = data["lon"] + random.uniform(-0.1, 0.1)
            cur.execute(
                "INSERT INTO stations(district_id, name, beat, latitude, longitude) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (district_id, f"{district_name} PS {s_idx}", f"Beat-{s_idx}", slat, slon)
            )
            station_id = cur.fetchone()["id"]

            # Officer
            cur.execute(
                "INSERT INTO officers(name, station_id, workload) VALUES (%s, %s, %s)",
                (rand_name(), station_id, random.randint(2, 10))
            )

            # FIR records per station
            for _ in range(random.randint(3, 8)):
                crime_type, ipc, desc_tpl = random.choice(CRIME_TEMPLATES)
                desc = desc_tpl.format(locality=f"Area {s_idx}", amount=random.randint(1, 50), qty=random.randint(10, 500))
                inc_date = (datetime.now() - timedelta(days=random.randint(0, 365))).strftime("%Y-%m-%d")
                flat = slat + random.uniform(-0.05, 0.05)
                flon = slon + random.uniform(-0.05, 0.05)
                status = random.choice(["Open", "Under Investigation", "Closed", "Chargesheeted"])

                cur.execute(
                    "INSERT INTO fir_records(district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, status, description) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id",
                    (district_id, station_id, crime_type, ipc, inc_date, flat, flon, status, desc)
                )
                fir_id = cur.fetchone()["id"]

                # Person
                cur.execute(
                    "INSERT INTO persons(role, name, age_band, gender, occupation) VALUES (%s,%s,%s,%s,%s) RETURNING id",
                    (random.choice(PERSON_ROLES), rand_name(), random.choice(AGE_BANDS), random.choice(GENDERS), random.choice(OCCUPATIONS))
                )
                person_id = cur.fetchone()["id"]
                cur.execute(
                    "INSERT INTO case_links(fir_id, person_id, relationship_type) VALUES (%s,%s,%s)",
                    (fir_id, person_id, random.choice(PERSON_ROLES))
                )

                # Court outcome
                cur.execute(
                    "INSERT INTO court_outcomes(fir_id, outcome, conviction_rate) VALUES (%s,%s,%s)",
                    (fir_id, random.choice(["Convicted", "Acquitted", "Pending", "Plea Deal"]), round(random.uniform(0.3, 0.95), 2))
                )

    # Admin user
    print("Creating admin user...")
    cur.execute(
        "INSERT INTO users(username, role, password) VALUES (%s,%s,%s) ON CONFLICT(username) DO NOTHING",
        ("admin", "admin", get_password_hash("admin123"))
    )

    # Audit log
    cur.execute(
        "INSERT INTO audit_log(user_name, action, resource) VALUES (%s,%s,%s)",
        ("admin", "seed_postgres", "neon_db")
    )

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Neon database seeded successfully!")

if __name__ == "__main__":
    main()
