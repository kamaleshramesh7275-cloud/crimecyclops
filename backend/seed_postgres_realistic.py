"""
Realistic Data Generator for CrimeCyclops
Creates highly realistic FIR records, syndicates, and comprehensive case details.
"""
import os
import random
from datetime import datetime, timedelta
import psycopg2
from psycopg2.extras import execute_values
from dotenv import load_dotenv
import bcrypt

load_dotenv()
DATABASE_URL = os.getenv("DATABASE_URL")

FIRST_NAMES = ["Amit", "Ramesh", "Suresh", "Priya", "Anita", "Karthik", "Sneha", "Rahul", "Vikram", "Deepa", 
               "Manjula", "Syed", "Imran", "Arjun", "Neha", "Pooja", "Vishal", "Kiran", "Sanjay", "Anil", 
               "Prakash", "Ganesh", "Rajesh", "Sunil", "Sita", "Gita", "Laxmi", "Nandini", "Ravi", "Mahesh"]
LAST_NAMES = ["Kumar", "Gowda", "Patil", "Desai", "Rao", "Shetty", "Naidu", "Bhat", "Hegde", "Ali", 
              "Pasha", "Sharma", "Singh", "Reddy", "Iyer", "Menon", "Nair", "Venkatesh", "Prasad", "Das"]
OCCUPATIONS = ["Student", "Software Engineer", "Business Owner", "Unemployed", "Farmer", "Teacher", "Driver", "Shopkeeper", "Banker", "Contractor", "Unknown"]

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
    "Tumakuru": {"lat": 13.3392, "lon": 77.1010, "density": 253, "lit": 75.14, "unemp": 4.3}
}

CRIMES = [
    {"type": "Cyber Fraud", "ipc": "IT Act 66D", "desc": "Victim received a malicious APK on WhatsApp claiming to be electricity bill update. Lost Rs. {amount} from {bank} account.", "amt_range": (5000, 2500000)},
    {"type": "Cyber Fraud", "ipc": "IT Act 66C", "desc": "Phishing scam via fake banking portal. Victim's credentials stolen resulting in unauthorized transfer of Rs. {amount}.", "amt_range": (10000, 500000)},
    {"type": "Vehicle Theft", "ipc": "IPC 379", "desc": "A {color} {vehicle} was reported stolen from {locality} parking lot around {time}.", "amt_range": (0,0)},
    {"type": "Burglary", "ipc": "IPC 454", "desc": "House break-in at {locality}. Suspects broke the back door and stole {qty} grams of gold ornaments.", "amt_range": (0,0)},
    {"type": "Assault", "ipc": "IPC 324", "desc": "Physical altercation near {locality} over a property dispute. Victim sustained injuries from a blunt object.", "amt_range": (0,0)},
    {"type": "Drug Trafficking", "ipc": "NDPS 21", "desc": "Raid conducted at {locality}. Seizure of {qty} grams of MDMA. Suspects were using a rented vehicle for distribution.", "amt_range": (0,0)},
    {"type": "Extortion", "ipc": "IPC 384", "desc": "Business owner threatened by a local gang at {locality}. Demand for Rs. {amount} as protection money.", "amt_range": (50000, 500000)},
    {"type": "Financial Scam", "ipc": "IPC 420", "desc": "Fake investment scheme promising double returns in 30 days. Multiple victims lost an aggregate of Rs. {amount}.", "amt_range": (100000, 10000000)},
]

VEHICLES = ["Honda Activa", "TVS Jupiter", "Maruti Swift", "Hyundai Creta", "Royal Enfield", "Bajaj Pulsar"]
COLORS = ["Red", "Black", "White", "Silver", "Blue"]
BANKS = ["HDFC", "SBI", "ICICI", "Axis", "Kotak"]
TIMES = ["2:00 AM", "11:30 PM", "3:45 AM", "4:00 PM", "9:15 PM"]

def generate_desc(crime):
    desc = crime["desc"]
    if "{amount}" in desc:
        amt = random.randint(crime["amt_range"][0], crime["amt_range"][1])
        desc = desc.replace("{amount}", f"{amt:,}")
    if "{bank}" in desc:
        desc = desc.replace("{bank}", random.choice(BANKS))
    if "{color}" in desc:
        desc = desc.replace("{color}", random.choice(COLORS))
    if "{vehicle}" in desc:
        desc = desc.replace("{vehicle}", random.choice(VEHICLES))
    if "{time}" in desc:
        desc = desc.replace("{time}", random.choice(TIMES))
    if "{qty}" in desc:
        desc = desc.replace("{qty}", str(random.randint(10, 500)))
    if "{locality}" in desc:
        desc = desc.replace("{locality}", f"Sector {random.randint(1, 15)}")
    return desc

def rand_name():
    return f"{random.choice(FIRST_NAMES)} {random.choice(LAST_NAMES)}"

def main():
    if not DATABASE_URL:
        print("DATABASE_URL missing!")
        return

    conn = psycopg2.connect(DATABASE_URL)
    cur = conn.cursor()

    print("Clearing database...")
    cur.execute("TRUNCATE TABLE case_links, court_outcomes, seizures, fir_records, officers, stations, districts, audit_log, persons RESTART IDENTITY CASCADE;")
    
    print("Seeding districts...")
    for d_name, d_data in DISTRICTS_DATA.items():
        cur.execute("INSERT INTO districts(name, population_density, literacy_rate, unemployment_proxy) VALUES (%s, %s, %s, %s)", 
                    (d_name, d_data["density"], d_data["lit"], d_data["unemp"]))
    
    cur.execute("SELECT id, name FROM districts")
    district_rows = cur.fetchall()
    
    stations = []
    officer_args = []
    
    print("Seeding stations & officers...")
    for d_id, d_name in district_rows:
        # Get coordinates from DISTRICTS_DATA for station generation
        d_lat = DISTRICTS_DATA[d_name]["lat"]
        d_lon = DISTRICTS_DATA[d_name]["lon"]
        for s_idx in range(1, 10):
            slat = d_lat + random.uniform(-0.1, 0.1)
            slon = d_lon + random.uniform(-0.1, 0.1)
            cur.execute("INSERT INTO stations(district_id, name, beat, latitude, longitude) VALUES (%s, %s, %s, %s, %s) RETURNING id",
                        (d_id, f"{d_name} PS {s_idx}", f"Beat-{s_idx}", slat, slon))
            s_id = cur.fetchone()[0]
            stations.append({"id": s_id, "d_id": d_id, "lat": slat, "lon": slon})
            officer_args.append((rand_name(), s_id, random.randint(3, 12)))
            
    execute_values(cur, "INSERT INTO officers(name, station_id, workload) VALUES %s", officer_args)
    
    print("Seeding 46,789 Persons (The Syndicate & Civilians)...")
    person_args = []
    syndicate_members = []
    
    for i in range(46789):
        role = random.choices(["Suspect", "Victim", "Witness", "Complainant"], weights=[0.25, 0.4, 0.1, 0.25])[0]
        person_args.append((role, rand_name(), random.choice(["18-25", "26-35", "36-50", "50+"]), random.choice(["Male", "Female"]), random.choice(OCCUPATIONS)))
        if role == "Suspect" and len(syndicate_members) < 2000:
            syndicate_members.append(i + 1) # ID will be i+1

    execute_values(cur, "INSERT INTO persons(role, name, age_band, gender, occupation) VALUES %s", person_args, page_size=2000)
    
    print("Generating 46,789 FIRs...")
    firs = []
    now = datetime.now()
    
    for i in range(46789):
        station = random.choice(stations)
        crime = random.choice(CRIMES)
        desc = generate_desc(crime)
        inc_date = (now - timedelta(days=random.randint(0, 365))).strftime("%Y-%m-%d")
        flat = station["lat"] + random.uniform(-0.02, 0.02)
        flon = station["lon"] + random.uniform(-0.02, 0.02)
        status = random.choices(["Open", "Under Investigation", "Closed", "Chargesheeted"], weights=[0.1, 0.2, 0.5, 0.2])[0]
        
        firs.append((station["d_id"], station["id"], crime["type"], crime["ipc"], inc_date, flat, flon, status, desc))

    execute_values(cur, 
        "INSERT INTO fir_records(district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, status, description) VALUES %s", 
        firs, page_size=2000
    )
    
    print("Seeding Complex Case Links & Syndicates...")
    case_links = []
    outcomes = []
    
    # Ensure syndicates are involved in multiple FIRs to create dense network clusters
    for fid in range(1, 46790):
        # 1-3 people per FIR
        num_people = random.randint(1, 3)
        for _ in range(num_people):
            if random.random() < 0.15: # 15% chance this crime was committed by a syndicate member
                pid = random.choice(syndicate_members)
                role = "Suspect"
            else:
                pid = random.randint(1, 46789)
                role = random.choices(["Suspect", "Victim", "Witness", "Complainant"], weights=[0.2, 0.5, 0.1, 0.2])[0]
            
            case_links.append((fid, pid, role))
            
        if random.random() > 0.5:
            outcomes.append((fid, random.choice(["Convicted", "Acquitted", "Pending", "Plea Deal"]), round(random.uniform(0.3, 0.95), 2)))

    execute_values(cur, "INSERT INTO case_links(fir_id, person_id, relationship_type) VALUES %s", case_links, page_size=2000)
    execute_values(cur, "INSERT INTO court_outcomes(fir_id, outcome, conviction_rate) VALUES %s", outcomes, page_size=2000)
    
    # Performance Indexes
    print("Creating High-Performance Database Indexes...")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fir_district ON fir_records(district_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_fir_status ON fir_records(status);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_case_links_fir ON case_links(fir_id);")
    cur.execute("CREATE INDEX IF NOT EXISTS idx_case_links_person ON case_links(person_id);")
    
    print("Setting up admin user...")
    cur.execute("INSERT INTO users(username, role, password) VALUES (%s,%s,%s) ON CONFLICT(username) DO NOTHING", 
                ("admin", "admin", bcrypt.hashpw(b"admin123", bcrypt.gensalt()).decode("utf-8")))

    conn.commit()
    cur.close()
    conn.close()
    print("Done generating 46,789 realistic FIR records!")

if __name__ == "__main__":
    main()
