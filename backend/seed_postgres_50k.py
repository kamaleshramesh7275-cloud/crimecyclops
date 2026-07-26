"""
Batch seeder for 50k records.
"""
import os
import random
from datetime import datetime, timedelta
from dotenv import load_dotenv
import psycopg2
from psycopg2.extras import execute_values
import bcrypt

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

# --- Sample Data ---
DISTRICTS_DATA = {
    "Bengaluru Urban": {"lat": 12.9716, "lon": 77.5946, "density": 4381, "lit": 87.67, "unemp": 4.5},
    "Mysuru": {"lat": 12.2958, "lon": 76.6394, "density": 476, "lit": 72.79, "unemp": 3.8},
    "Hubballi-Dharwad": {"lat": 15.3647, "lon": 75.1240, "density": 434, "lit": 80.00, "unemp": 4.2},
    "Mangaluru (Dakshina Kannada)": {"lat": 12.9141, "lon": 74.8560, "density": 430, "lit": 88.57, "unemp": 3.5},
    "Belagavi": {"lat": 15.8497, "lon": 74.4977, "density": 356, "lit": 73.48, "unemp": 4.1},
    "Kalaburagi": {"lat": 17.3297, "lon": 76.8343, "density": 233, "lit": 64.85, "unemp": 5.2},
    "Ballari": {"lat": 15.1394, "lon": 76.9214, "density": 300, "lit": 67.43, "unemp": 4.8},
    "Vijayapura": {"lat": 16.8302, "lon": 75.7100, "density": 207, "lit": 67.15, "unemp": 4.6},
    "Shivamogga": {"lat": 13.9299, "lon": 75.5681, "density": 207, "lit": 80.45, "unemp": 4.0},
    "Tumakuru": {"lat": 13.3392, "lon": 77.1010, "density": 253, "lit": 75.14, "unemp": 4.3},
    "Mandya": {"lat": 12.5218, "lon": 76.8951, "density": 365, "lit": 70.40, "unemp": 3.9},
    "Udupi": {"lat": 13.3409, "lon": 74.7421, "density": 304, "lit": 86.24, "unemp": 3.6},
    "Davanagere": {"lat": 14.4644, "lon": 75.9218, "density": 328, "lit": 75.74, "unemp": 4.4},
    "Hassan": {"lat": 13.0068, "lon": 76.1004, "density": 261, "lit": 76.07, "unemp": 3.7},
    "Bidar": {"lat": 17.9104, "lon": 77.5199, "density": 312, "lit": 70.51, "unemp": 5.0}
}

CRIME_TEMPLATES = [
    ("Theft", "IPC 379", "Stolen vehicle from {locality}."),
    ("Cyber Fraud", "IT Act 66D", "Phishing scam resulting in loss of Rs. {amount}000."),
    ("Assault", "IPC 323", "Physical altercation reported near {locality}."),
    ("Drug Trafficking", "NDPS 21", "Seizure of {qty}g of contraband."),
    ("Burglary", "IPC 454", "House break-in at {locality}. Valuables stolen."),
]

def rand_name():
    first = ["Ramesh", "Suresh", "Priya", "Anita", "Karthik", "Sneha", "Rahul", "Vikram", "Deepa", "Manjula", "Syed", "Imran"]
    last = ["Kumar", "Gowda", "Patil", "Desai", "Rao", "Shetty", "Naidu", "Bhat", "Hegde", "Ali"]
    return f"{random.choice(first)} {random.choice(last)}"

def main():
    if not DATABASE_URL:
        print("DATABASE_URL not set in .env")
        return
        
    print("Connecting to Neon...")
    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("Clearing tables...")
    cur.execute("TRUNCATE TABLE case_links, court_outcomes, seizures, fir_records, officers, stations, districts, audit_log, persons RESTART IDENTITY CASCADE;")
    
    print("Seeding districts & stations...")
    district_args = []
    for d_name, data in DISTRICTS_DATA.items():
        district_args.append((d_name, data["density"], data["lit"], data["unemp"]))
        
    cur.execute("PREPARE stmt_d AS INSERT INTO districts(name, population_density, literacy_rate, unemployment_proxy) VALUES ($1, $2, $3, $4) RETURNING id")
    
    district_ids = {}
    for d_name, density, lit, unemp in district_args:
        cur.execute("INSERT INTO districts(name, population_density, literacy_rate, unemployment_proxy) VALUES (%s, %s, %s, %s) RETURNING id", (d_name, density, lit, unemp))
        district_ids[d_name] = cur.fetchone()[0]

    station_args = []
    officer_args = []
    
    stations = []
    
    for d_name, data in DISTRICTS_DATA.items():
        did = district_ids[d_name]
        num_stations = 15 if d_name == "Bengaluru Urban" else 6
        for s_idx in range(1, num_stations + 1):
            slat = data["lat"] + random.uniform(-0.1, 0.1)
            slon = data["lon"] + random.uniform(-0.1, 0.1)
            cur.execute(
                "INSERT INTO stations(district_id, name, beat, latitude, longitude) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                (did, f"{d_name} PS {s_idx}", f"Beat-{s_idx}", slat, slon)
            )
            sid = cur.fetchone()[0]
            stations.append({"id": sid, "district_id": did, "lat": slat, "lon": slon})
            officer_args.append((rand_name(), sid, random.randint(2, 10)))
            
    execute_values(cur, "INSERT INTO officers(name, station_id, workload) VALUES %s", officer_args)
    
    print("Seeding 50,000 persons...")
    person_args = [(random.choice(["Suspect", "Victim", "Witness", "Complainant"]), rand_name(), random.choice(["18-25", "26-35", "36-50", "50+"]), random.choice(["Male", "Female"]), "Unknown") for _ in range(50000)]
    execute_values(cur, "INSERT INTO persons(role, name, age_band, gender, occupation) VALUES %s", person_args)
    
    print("Generating 50,000 FIRs...")
    firs = []
    now = datetime.now()
    
    for i in range(50000):
        station = random.choice(stations)
        crime_type, ipc, desc_tpl = random.choice(CRIME_TEMPLATES)
        desc = desc_tpl.format(locality=f"Area {random.randint(1, 20)}", amount=random.randint(1, 50), qty=random.randint(10, 500))
        inc_date = (now - timedelta(days=random.randint(0, 365))).strftime("%Y-%m-%d")
        flat = station["lat"] + random.uniform(-0.05, 0.05)
        flon = station["lon"] + random.uniform(-0.05, 0.05)
        status = random.choice(["Open", "Under Investigation", "Closed", "Chargesheeted"])
        
        firs.append((station["district_id"], station["id"], crime_type, ipc, inc_date, flat, flon, status, desc))

    print("Inserting 50,000 FIRs (this will take a moment)...")
    execute_values(cur, 
        "INSERT INTO fir_records(district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, status, description) VALUES %s", 
        firs,
        page_size=1000
    )
    
    print("Fetching inserted FIR IDs for linking...")
    cur.execute("SELECT id FROM fir_records ORDER BY id LIMIT 50000")
    fir_ids = [r[0] for r in cur.fetchall()]
    
    print("Seeding case links and outcomes...")
    case_links = []
    outcomes = []
    
    for fid in fir_ids:
        # 1-3 people per FIR
        for _ in range(random.randint(1, 3)):
            person_id = random.randint(1, 50000)
            role = random.choice(["Suspect", "Victim", "Witness", "Complainant"])
            case_links.append((fid, person_id, role))
            
        if random.random() > 0.5:
            outcomes.append((fid, random.choice(["Convicted", "Acquitted", "Pending", "Plea Deal"]), round(random.uniform(0.3, 0.95), 2)))

    execute_values(cur, "INSERT INTO case_links(fir_id, person_id, relationship_type) VALUES %s", case_links, page_size=2000)
    execute_values(cur, "INSERT INTO court_outcomes(fir_id, outcome, conviction_rate) VALUES %s", outcomes, page_size=2000)
    
    # Admin
    print("Setting up admin user...")
    cur.execute("INSERT INTO users(username, role, password) VALUES (%s,%s,%s) ON CONFLICT(username) DO NOTHING", 
                ("admin", "admin", bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")))

    conn.commit()
    cur.close()
    conn.close()
    print("✅ Successfully seeded 50,000 records!")

if __name__ == "__main__":
    main()
