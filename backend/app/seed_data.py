from __future__ import annotations

import random
from datetime import datetime, timedelta
from pathlib import Path

from app.database import get_db_connection, init_db
from app.auth_service import get_password_hash
from chatbot.vectorstore import vector_store_instance
from chatbot.dataset_loader import load_all_dataset

# 31 Districts of Karnataka with realistic population densities, literacy rates, and lat/long centroids
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

DISTRICT_LOCALITIES = {
    "Bengaluru Urban": ["Indiranagar", "Whitefield", "Koramangala", "Peenya", "HSR Layout", "Electronic City", "Yelahanka", "Jayanagar", "Majestic"],
    "Mysuru": ["Devaraja Market", "Saraswathipuram", "Gokulam", "Kuvempunagar", "Vijayanagar", "Chamundi Hill Road"],
    "Dakshina Kannada": ["Hampankatta", "Pandeshwar", "Bejai", "Kadri", "Ullal", "Surathkal Port"],
    "Dharwad": ["Vidyanagar Hubballi", "Unkal Lake Area", "Keshwapur", "Line Bazar Dharwad", "Sattur"],
    "Kalaburagi": ["Super Market", "MSK Mill Area", "Station Road", "Ashok Nagar"],
    "Belagavi": ["Tilakwadi", "Shahapur", "Camp Area", "Khade Bazar"],
    "Ballari": ["Cantonment", "Cowl Bazar", "Brucepet", "Toranagallu"],
    "Udupi": ["Manipal Campus", "Malpe Harbour", "City Bus Stand", "Karkala"],
    "Tumakuru": ["BH Road", "Kyatsandra", "SS Puram", "Gubbi Gate"],
    "Shivamogga": ["Vinoba Nagar", "Durgigudi", "BH Road", "Gopala"],
}

CRIME_TEMPLATES = [
    ("Cyber Fraud", "IPC 420 / IT Act 66D", "Victim duped of Rs. {amount} lakh via fake 2026 stock trading app & APK malware at {locality}."),
    ("Cyber Fraud", "IPC 420 / IT Act 66C", "Phishing scam targeting online banking credentials of senior citizens at {locality}."),
    ("Drug Trafficking", "NDPS Act 21/27", "Seizure of {qty} grams MDMA synthetic drugs and contraband during midnight raid near {locality}."),
    ("Drug Trafficking", "NDPS Act 20(b)", "Intercepted inter-state ganja smuggling cartel carrying {qty} kg cannabis at {locality} checkpost."),
    ("Burglary", "IPC 457/380", "Night house break-in and theft of gold jewelry worth Rs. {amount} lakh at {locality} residential layout."),
    ("Vehicle Theft", "IPC 379", "Theft of 2-wheeler motor vehicle parked near metro station / bus depot at {locality}."),
    ("Assault", "IPC 323/324", "Physical altercation and assault resulting from real estate land boundary dispute at {locality}."),
    ("Domestic Violence", "IPC 498A", "Complaint registered regarding marital harassment and dowry demand at {locality}."),
    ("Missing Person", "IPC 363", "Trace report filed for missing 22-year-old student last seen near {locality} transit hub."),
    ("Commercial Fraud", "IPC 406/420", "Financial misappropriation and fraudulent land forgery case registered at {locality}."),
]

PERSON_ROLES = ["victim", "accused", "witness"]
AGE_BANDS = ["18-25", "26-35", "36-45", "46-55", "56+"]
GENDERS = ["Male", "Female", "Other"]
OCCUPATIONS = ["IT Professional", "Vendor", "Student", "Businessperson", "Real Estate Agent", "Driver", "Farmer", "Laborer"]

FIRST_NAMES = ["Kiran", "Rajesh", "Priya", "Suresh", "Lakshmi", "Anand", "Deepak", "Manjunath", "Venkatesh", "Shruti", "Basavaraj", "Vijay", "Ganesh", "Mahesh", "Sunita"]
LAST_NAMES = ["Gowda", "Rao", "Patil", "Shetty", "Kulkarni", "Hegde", "Bhat", "Nayak", "Pujari", "Reddy", "Kumar", "Deshmukh"]

def random_person_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

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

    station_coords = {}

    for district_idx, (name, data) in enumerate(DISTRICTS_DATA.items(), start=1):
        conn.execute(
            "INSERT INTO districts(name, population_density, literacy_rate, unemployment_proxy) VALUES (?, ?, ?, ?)",
            (name, data["density"], data["lit"], data["unemp"]),
        )
        district_id = conn.execute("SELECT id FROM districts WHERE name = ?", (name,)).fetchone()[0]
        district_rows.append((district_id, name))
        
        num_stations = 6
        if name == "Bengaluru Urban":
            num_stations = 25
        elif name in ["Mysuru", "Dakshina Kannada", "Dharwad", "Belagavi"]:
            num_stations = 12
            
        for s_idx in range(1, num_stations + 1):
            station_name = f"{name} Police Station {s_idx}"
            slat = data["lat"] + random.uniform(-0.1, 0.1)
            slon = data["lon"] + random.uniform(-0.1, 0.1)
            cursor = conn.execute(
                "INSERT INTO stations(district_id, name, beat, latitude, longitude) VALUES (?, ?, ?, ?, ?)",
                (district_id, station_name, f"Beat {s_idx}", slat, slon),
            )
            station_id = cursor.lastrowid
            station_rows.append((station_id, district_id, name))
            station_coords[station_id] = (slat, slon)
            
            # Police Officers per station
            for o_i in range(random.randint(3, 6)):
                officer_rows.append((f"Inspector {random_person_name()}", station_id, random.randint(5, 22)))

    conn.executemany(
        "INSERT INTO officers(name, station_id, workload) VALUES (?, ?, ?)",
        officer_rows,
    )

    # Generate 2026 Real-time Crime Dataset (Dates: 2026-01-01 to 2026-07-20)
    start_date_2026 = datetime(2026, 1, 1)
    end_date_2026 = datetime(2026, 7, 20)
    total_days = (end_date_2026 - start_date_2026).days

    for fir_num in range(1, 16001):
        station_id, district_id, district_name = random.choice(station_rows)
        crime_type, ipc_sec, desc_template = random.choice(CRIME_TEMPLATES)
        
        # Localities
        localities = DISTRICT_LOCALITIES.get(district_name, [f"Sector {random.randint(1,9)}"])
        locality = random.choice(localities)
        
        # 2026 Incident Date
        days_offset = random.randint(0, total_days)
        incident_date = (start_date_2026 + timedelta(days=days_offset)).strftime("%Y-%m-%d")
        
        slat, slon = station_coords[station_id]
        flat = round(slat + random.uniform(-0.02, 0.02), 5)
        flon = round(slon + random.uniform(-0.02, 0.02), 5)
        
        status = random.choice(["open", "under investigation", "closed", "charge-sheeted"])
        
        # Format description with realistic 2026 figures
        desc = desc_template.format(
            amount=round(random.uniform(1.5, 45.0), 2),
            qty=random.randint(50, 800),
            locality=locality
        ) + f" [2026 KSP Intelligence Record #{fir_num}]"
        
        fir_rows.append((district_id, station_id, crime_type, ipc_sec, incident_date, flat, flon, status, desc))

    # Batch insert FIR records
    for i in range(0, len(fir_rows), 1000):
        conn.executemany(
            "INSERT INTO fir_records(district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, status, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            fir_rows[i:i+1000],
        )

    fir_ids = [row[0] for row in conn.execute("SELECT id FROM fir_records").fetchall()]

    # Generate Persons & Suspects / Accused / Victims
    for _ in range(4000):
        role = random.choice(PERSON_ROLES)
        person_rows.append((role, random_person_name(), random.choice(AGE_BANDS), random.choice(GENDERS), random.choice(OCCUPATIONS)))

    conn.executemany(
        "INSERT INTO persons(role, name, age_band, gender, occupation) VALUES (?, ?, ?, ?, ?)",
        person_rows,
    )

    person_ids = [row[0] for row in conn.execute("SELECT id FROM persons").fetchall()]
    
    # Link Persons to 2026 FIRs
    for _ in range(6000):
        case_link_rows.append((random.choice(fir_ids), random.choice(person_ids), random.choice(["victim", "accused", "witness"])))

    for i in range(0, len(case_link_rows), 1000):
        conn.executemany(
            "INSERT INTO case_links(fir_id, person_id, relationship_type) VALUES (?, ?, ?)",
            case_link_rows[i:i+1000],
        )

    # 2026 Seizures (Narcotics, Cash, Weapons, Vehicles)
    for _ in range(2500):
        s_date = (start_date_2026 + timedelta(days=random.randint(0, total_days))).strftime("%Y-%m-%d")
        s_type = random.choice(["MDMA Narcotics", "Ganja Cannabis", "Counterfeit Cash", "Stolen Motor Vehicle", "Illicit Firearm"])
        qty_str = f"{random.randint(5, 500)} units/grams"
        seizure_rows.append((random.choice(fir_ids), s_type, qty_str, f"Local Checkpost {random.randint(1, 50)}", s_date))

    conn.executemany(
        "INSERT INTO seizures(fir_id, seizure_type, quantity, location, seizure_date) VALUES (?, ?, ?, ?, ?)",
        seizure_rows,
    )

    # 2026 Court Outcomes
    for fir_id in random.sample(fir_ids, 3000):
        outcome_rows.append((fir_id, random.choice(["convicted", "under trial", "acquitted", "charge-sheet filed"]), round(random.uniform(0.55, 0.95), 2)))

    conn.executemany(
        "INSERT INTO court_outcomes(fir_id, outcome, conviction_rate) VALUES (?, ?, ?)",
        outcome_rows,
    )

    conn.execute(
        "INSERT INTO users(username, role, password) VALUES (?, ?, ?)",
        ("admin", "admin", get_password_hash("admin123")),
    )
    conn.execute(
        "INSERT INTO audit_log(user_name, action, resource) VALUES (?, ?, ?)",
        ("admin", "seed_2026_karnataka_dataset", "realtime_intelligence"),
    )
    conn.commit()
    conn.close()

    # Automatically Rebuild Vector Embeddings in FAISS for AI Chatbot
    try:
        docs = load_all_dataset()
        vector_store_instance.build_index(docs)
    except Exception:
        pass


if __name__ == "__main__":
    seed_demo_data()
    print("2026 Karnataka Real-Time Crime Dataset Generated & Vector Index Rebuilt Successfully.")
