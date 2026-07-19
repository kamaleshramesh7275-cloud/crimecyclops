from __future__ import annotations

import random
from datetime import datetime, timedelta
from pathlib import Path

from app.database import get_db_connection, init_db

DISTRICTS = [
    ("Bengaluru Urban", 12000, 0.88, 0.14),
    ("Mysuru", 5200, 0.8, 0.12),
    ("Hubballi-Dharwad", 6400, 0.74, 0.19),
    ("Kalaburagi", 4800, 0.68, 0.21),
    ("Mangaluru", 4500, 0.82, 0.11),
    ("Ballari", 3700, 0.65, 0.24),
]

STATIONS = {
    "Bengaluru Urban": ["Hebbal", "Indiranagar", "Koramangala", "Yelahanka"],
    "Mysuru": ["Mysuru West", "Mysuru East", "Nazarbad"],
    "Hubballi-Dharwad": ["Hubballi North", "Dharwad City", "Old Hubballi"],
    "Kalaburagi": ["Station Road", "Gulbarga City", "Jayanagar"],
    "Mangaluru": ["Mangaluru Central", "Mangaluru South", "Kankanady"],
    "Ballari": ["Ballari Town", "Hospet Road", "Bellary West"],
}

CRIME_TYPES = [
    ("Theft", "IPC 379"),
    ("Burglary", "IPC 457"),
    ("Assault", "IPC 323"),
    ("Drug Trafficking", "IPC 21/27"),
    ("Vehicle Theft", "IPC 379"),
    ("Domestic Violence", "IPC 498A"),
    ("Cyber Fraud", "IPC 420"),
    ("Missing Person", "IPC 363"),
]

PERSON_ROLES = ["victim", "accused", "witness"]
AGE_BANDS = ["18-25", "26-35", "36-45", "46-55", "56+"]
GENDERS = ["Male", "Female", "Other"]
OCCUPATIONS = ["Student", "Vendor", "IT Professional", "Laborer", "Business", "Driver", "Housewife", "Farmer"]


def seed_demo_data():
    init_db()
    conn = get_db_connection()
    conn.execute("DELETE FROM audit_log")
    conn.execute("DELETE FROM users")
    conn.execute("DELETE FROM court_outcomes")
    conn.execute("DELETE FROM seizures")
    conn.execute("DELETE FROM case_links")
    conn.execute("DELETE FROM persons")
    conn.execute("DELETE FROM fir_records")
    conn.execute("DELETE FROM officers")
    conn.execute("DELETE FROM stations")
    conn.execute("DELETE FROM districts")

    district_rows = []
    station_rows = []
    officer_rows = []
    person_rows = []
    fir_rows = []
    case_link_rows = []
    seizure_rows = []
    outcome_rows = []

    for district_idx, (name, density, literacy, unemployment) in enumerate(DISTRICTS, start=1):
        conn.execute(
            "INSERT INTO districts(name, population_density, literacy_rate, unemployment_proxy) VALUES (?, ?, ?, ?)",
            (name, density, literacy, unemployment),
        )
        district_id = conn.execute("SELECT id FROM districts WHERE name = ?", (name,)).fetchone()[0]
        district_rows.append(district_id)

        for station_idx, station_name in enumerate(STATIONS[name], start=1):
            lat = 12.8 + random.uniform(0.0, 0.9) + station_idx * 0.01
            lon = 77.4 + random.uniform(0.0, 0.8) + district_idx * 0.02
            cursor = conn.execute(
                "INSERT INTO stations(district_id, name, beat, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
                (district_id, station_name, f"Beat {station_idx}", lat, lon),
            )
            station_id = cursor.lastrowid
            station_rows.append(station_id)
            officer_rows.append((f"Officer {district_idx}-{station_idx}", station_id, random.randint(4, 12)))

    conn.executemany(
        "INSERT INTO officers(name, station_id, workload) VALUES (?, ?, ?)",
        officer_rows,
    )

    for _ in range(600):
        district_id = random.choice(district_rows)
        station_id = random.choice(station_rows)
        crime_type, ipc = random.choice(CRIME_TYPES)
        incident_date = (datetime(2024, 1, 1) + timedelta(days=random.randint(0, 730))).strftime("%Y-%m-%d")
        lat = round(random.uniform(12.5, 14.1), 5)
        lon = round(random.uniform(75.9, 77.9), 5)
        description = f"{crime_type} reported at {incident_date} involving multiple parties; witnesses noted suspicious activity in the area."
        fir_rows.append((district_id, station_id, crime_type, ipc, incident_date, lat, lon, random.choice(["open", "closed", "under investigation"]), description))

    conn.executemany(
        "INSERT INTO fir_records(district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        fir_rows,
    )

    fir_ids = [row[0] for row in conn.execute("SELECT id FROM fir_records").fetchall()]

    for _ in range(900):
        role = random.choice(PERSON_ROLES)
        person_rows.append((role, f"Person {random.randint(1, 900)}", random.choice(AGE_BANDS), random.choice(GENDERS), random.choice(OCCUPATIONS)))

    conn.executemany(
        "INSERT INTO persons(role, name, age_band, gender, occupation) VALUES (?, ?, ?, ?, ?)",
        person_rows,
    )

    person_ids = [row[0] for row in conn.execute("SELECT id FROM persons").fetchall()]
    for fir_id in fir_ids:
        linked_count = random.randint(1, 3)
        for _ in range(linked_count):
            case_link_rows.append((fir_id, random.choice(person_ids), random.choice(["victim", "accused", "witness"])))

    conn.executemany(
        "INSERT INTO case_links(fir_id, person_id, relationship_type) VALUES (?, ?, ?)",
        case_link_rows,
    )

    for fir_id in fir_ids[:300]:
        seizure_rows.append((fir_id, random.choice(["weapon", "drugs", "cash", "vehicle"]), random.randint(1, 12), f"Location {random.randint(1, 20)}", datetime(2024, 1, 1).strftime("%Y-%m-%d")))

    conn.executemany(
        "INSERT INTO seizures(fir_id, seizure_type, quantity, location, seizure_date) VALUES (?, ?, ?, ?, ?)",
        seizure_rows,
    )

    for fir_id in fir_ids[:250]:
        outcome_rows.append((fir_id, random.choice(["convicted", "pending", "acquitted"]), round(random.uniform(0.2, 0.9), 2)))

    conn.executemany(
        "INSERT INTO court_outcomes(fir_id, outcome, conviction_rate) VALUES (?, ?, ?)",
        outcome_rows,
    )

    conn.execute(
        "INSERT INTO users(username, role, password) VALUES (?, ?, ?)",
        ("admin", "state analyst", "demo"),
    )
    conn.execute(
        "INSERT INTO audit_log(user_name, action, resource) VALUES (?, ?, ?)",
        ("admin", "seed_demo", "dashboard"),
    )
    conn.commit()
    conn.close()


if __name__ == "__main__":
    seed_demo_data()
    print("Seed data generated.")
