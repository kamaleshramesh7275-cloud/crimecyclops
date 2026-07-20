from __future__ import annotations

import random
from datetime import datetime, timedelta
from pathlib import Path

from app.database import get_db_connection, init_db

# 31 Districts of Karnataka with realistic population densities, literacy rates, and approximate lat/longs
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
    "Raichur": {"lat": 16.20, "lon": 77.36, "density": 3500, "lit": 0.60, "unemp": 0.22},
    "Shivamogga": {"lat": 13.93, "lon": 75.57, "density": 4000, "lit": 0.80, "unemp": 0.15},
    "Chikkamagaluru": {"lat": 13.32, "lon": 75.77, "density": 2900, "lit": 0.79, "unemp": 0.16},
    "Kodagu": {"lat": 12.33, "lon": 75.80, "density": 1800, "lit": 0.82, "unemp": 0.13},
    "Chitradurga": {"lat": 14.23, "lon": 76.40, "density": 3200, "lit": 0.74, "unemp": 0.18},
    "Hassan": {"lat": 13.00, "lon": 76.10, "density": 3800, "lit": 0.76, "unemp": 0.16},
    "Uttara Kannada": {"lat": 14.80, "lon": 74.50, "density": 2500, "lit": 0.84, "unemp": 0.15},
    "Vijayapura": {"lat": 16.83, "lon": 75.71, "density": 3900, "lit": 0.67, "unemp": 0.21},
    "Bagalkot": {"lat": 16.18, "lon": 75.70, "density": 3700, "lit": 0.68, "unemp": 0.20},
    "Bidar": {"lat": 17.91, "lon": 77.53, "density": 4100, "lit": 0.71, "unemp": 0.19},
    "Koppal": {"lat": 15.35, "lon": 76.16, "density": 3400, "lit": 0.68, "unemp": 0.21},
    "Gadag": {"lat": 15.42, "lon": 75.63, "density": 3100, "lit": 0.75, "unemp": 0.17},
    "Haveri": {"lat": 14.79, "lon": 75.40, "density": 3600, "lit": 0.77, "unemp": 0.16},
    "Davangere": {"lat": 14.47, "lon": 75.92, "density": 4200, "lit": 0.76, "unemp": 0.17},
    "Mandya": {"lat": 12.52, "lon": 76.90, "density": 4500, "lit": 0.70, "unemp": 0.18},
    "Chamarajanagar": {"lat": 11.92, "lon": 76.94, "density": 2800, "lit": 0.61, "unemp": 0.20},
    "Ramanagara": {"lat": 12.71, "lon": 77.28, "density": 3900, "lit": 0.69, "unemp": 0.16},
    "Kolar": {"lat": 13.13, "lon": 78.13, "density": 4300, "lit": 0.74, "unemp": 0.17},
    "Chikkaballapura": {"lat": 13.43, "lon": 77.73, "density": 3800, "lit": 0.70, "unemp": 0.19},
    "Yadgir": {"lat": 16.76, "lon": 77.14, "density": 3100, "lit": 0.52, "unemp": 0.25},
    "Vijayanagara": {"lat": 15.27, "lon": 76.39, "density": 3500, "lit": 0.67, "unemp": 0.21},
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


def generate_stations(district_name, num_stations):
    return [f"{district_name} Station {i}" for i in range(1, num_stations + 1)]

def seed_demo_data():
    init_db()
    conn = get_db_connection()
    tables = ["audit_log", "users", "court_outcomes", "seizures", "case_links", "persons", "fir_records", "officers", "stations", "districts"]
    for t in tables:
        conn.execute(f"DELETE FROM {t}")

    district_rows = []
    station_rows = []
    officer_rows = []
    person_rows = []
    fir_rows = []
    case_link_rows = []
    seizure_rows = []
    outcome_rows = []

    # Map station_id -> (lat, lon) for FIR generation
    station_coords = {}

    for district_idx, (name, data) in enumerate(DISTRICTS_DATA.items(), start=1):
        conn.execute(
            "INSERT INTO districts(name, population_density, literacy_rate, unemployment_proxy) VALUES (?, ?, ?, ?)",
            (name, data["density"], data["lit"], data["unemp"]),
        )
        district_id = conn.execute("SELECT id FROM districts WHERE name = ?", (name,)).fetchone()[0]
        district_rows.append(district_id)
        
        num_stations = random.randint(4, 12)
        if name == "Bengaluru Urban":
            num_stations = 25 # High density for BLR
            
        stations = generate_stations(name, num_stations)
        
        for station_idx, station_name in enumerate(stations, start=1):
            # Scatter stations around the district centroid (approx 0.1 - 0.2 deg radius max)
            slat = data["lat"] + random.uniform(-0.15, 0.15)
            slon = data["lon"] + random.uniform(-0.15, 0.15)
            cursor = conn.execute(
                "INSERT INTO stations(district_id, name, beat, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
                (district_id, station_name, f"Beat {station_idx}", slat, slon),
            )
            station_id = cursor.lastrowid
            station_rows.append((station_id, district_id))
            station_coords[station_id] = (slat, slon)
            
            # 2 to 5 officers per station
            for i in range(random.randint(2, 5)):
                officer_rows.append((f"Officer {district_idx}-{station_idx}-{i}", station_id, random.randint(4, 15)))

    conn.executemany(
        "INSERT INTO officers(name, station_id, workload) VALUES (?, ?, ?)",
        officer_rows,
    )

    # 15,000 FIRs distributed across all stations
    for _ in range(15000):
        station_id, district_id = random.choice(station_rows)
        crime_type, ipc = random.choice(CRIME_TYPES)
        
        # Bias some crimes toward Bengaluru
        if random.random() < 0.2:
            # Pick a BLR station specifically for tech/cyber crimes
            blr_stations = [s for s in station_rows if s[1] == district_rows[0]]
            if blr_stations and crime_type == "Cyber Fraud":
                station_id, district_id = random.choice(blr_stations)

        incident_date = (datetime(2024, 1, 1) + timedelta(days=random.randint(0, 730))).strftime("%Y-%m-%d")
        
        # FIR location slightly scattered from the station
        slat, slon = station_coords[station_id]
        flat = round(slat + random.uniform(-0.02, 0.02), 5)
        flon = round(slon + random.uniform(-0.02, 0.02), 5)
        
        status = random.choice(["open", "closed", "under investigation", "closed"]) # Biased towards closed
        description = f"{crime_type} reported at {incident_date} involving multiple parties."
        fir_rows.append((district_id, station_id, crime_type, ipc, incident_date, flat, flon, status, description))

    # Batch insert FIRs
    for i in range(0, len(fir_rows), 1000):
        conn.executemany(
            "INSERT INTO fir_records(district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            fir_rows[i:i+1000],
        )

    fir_ids = [row[0] for row in conn.execute("SELECT id FROM fir_records").fetchall()]

    for _ in range(3000):
        role = random.choice(PERSON_ROLES)
        person_rows.append((role, f"Person {random.randint(1, 9999)}", random.choice(AGE_BANDS), random.choice(GENDERS), random.choice(OCCUPATIONS)))

    conn.executemany(
        "INSERT INTO persons(role, name, age_band, gender, occupation) VALUES (?, ?, ?, ?, ?)",
        person_rows,
    )

    person_ids = [row[0] for row in conn.execute("SELECT id FROM persons").fetchall()]
    
    # 5,000 case links
    for _ in range(5000):
        case_link_rows.append((random.choice(fir_ids), random.choice(person_ids), random.choice(["victim", "accused", "witness"])))

    for i in range(0, len(case_link_rows), 1000):
        conn.executemany(
            "INSERT INTO case_links(fir_id, person_id, relationship_type) VALUES (?, ?, ?)",
            case_link_rows[i:i+1000],
        )

    for _ in range(1500):
        seizure_rows.append((random.choice(fir_ids), random.choice(["weapon", "drugs", "cash", "vehicle"]), random.randint(1, 12), f"Location {random.randint(1, 100)}", datetime(2024, 1, 1).strftime("%Y-%m-%d")))

    conn.executemany(
        "INSERT INTO seizures(fir_id, seizure_type, quantity, location, seizure_date) VALUES (?, ?, ?, ?, ?)",
        seizure_rows,
    )

    for fir_id in random.sample(fir_ids, 2000):
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
    print("Vast seed data generated (All 31 districts, 15,000+ FIRs).")
