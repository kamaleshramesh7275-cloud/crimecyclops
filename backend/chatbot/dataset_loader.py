import sqlite3
from pathlib import Path
from typing import List, Dict, Any
from app.database import DB_PATH
from chatbot.config import CHUNK_SIZE, CHUNK_OVERLAP

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into overlapping chunks."""
    if not text:
        return []
    text = text.strip()
    if len(text) <= chunk_size:
        return [text]
    
    chunks = []
    start = 0
    while start < len(text):
        end = start + chunk_size
        chunks.append(text[start:end].strip())
        start += chunk_size - overlap
    return chunks

def load_sqlite_dataset() -> List[Dict[str, Any]]:
    """Extract and index structured text documents from the CrimeCyclops SQLite database."""
    documents = []
    
    if not DB_PATH.exists():
        return documents
        
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # 1. FIR Records with Station and District info
    fir_rows = cursor.execute("""
        SELECT f.id as fir_id, f.crime_type, f.ipc_section, f.incident_date, f.status, f.description,
               s.name as station_name, s.beat, d.name as district_name
        FROM fir_records f
        LEFT JOIN stations s ON f.station_id = s.id
        LEFT JOIN districts d ON f.district_id = d.id
    """).fetchall()
    
    for row in fir_rows:
        text = (
            f"FIR ID: {row['fir_id']} | Crime Type: {row['crime_type']} | Section: {row['ipc_section']} | "
            f"Date: {row['incident_date']} | Status: {row['status']} | Police Station: {row['station_name']} ({row['beat']}) | "
            f"District: {row['district_name']} | Details: {row['description']}"
        )
        for chunk in chunk_text(text):
            documents.append({
                "text": chunk,
                "metadata": {
                    "source": f"FIR Record #{row['fir_id']}",
                    "dataset": "fir_records",
                    "fir_id": row["fir_id"],
                    "district": row["district_name"],
                    "station": row["station_name"],
                    "crime_type": row["crime_type"]
                }
            })
            
    # 2. Persons & Case Links (Suspects / Accused / Victims / Witnesses)
    person_rows = cursor.execute("""
        SELECT p.id as person_id, p.name, p.role, p.age_band, p.gender, p.occupation,
               cl.fir_id, cl.relationship_type
        FROM persons p
        LEFT JOIN case_links cl ON p.id = cl.person_id
    """).fetchall()
    
    for row in person_rows:
        text = (
            f"Person Name: {row['name']} | Role: {row['role']} | Age Band: {row['age_band']} | "
            f"Gender: {row['gender']} | Occupation: {row['occupation']} | Linked FIR: #{row['fir_id']} ({row['relationship_type']})"
        )
        for chunk in chunk_text(text):
            documents.append({
                "text": chunk,
                "metadata": {
                    "source": f"Person Link #{row['person_id']}",
                    "dataset": "persons",
                    "person_name": row["name"],
                    "role": row["role"],
                    "fir_id": row["fir_id"]
                }
            })
            
    # 3. Seizures Data
    seizure_rows = cursor.execute("""
        SELECT sz.id as seizure_id, sz.fir_id, sz.seizure_type, sz.quantity, sz.location, sz.seizure_date
        FROM seizures sz
    """).fetchall()
    
    for row in seizure_rows:
        text = (
            f"Seizure Record #{row['seizure_id']} | Type: {row['seizure_type']} | Quantity: {row['quantity']} | "
            f"Location: {row['location']} | Date: {row['seizure_date']} | Related FIR: #{row['fir_id']}"
        )
        for chunk in chunk_text(text):
            documents.append({
                "text": chunk,
                "metadata": {
                    "source": f"Seizure Record #{row['seizure_id']}",
                    "dataset": "seizures",
                    "seizure_type": row["seizure_type"],
                    "fir_id": row["fir_id"]
                }
            })

    # 4. District Demographics & Safety Metrics
    district_rows = cursor.execute("SELECT * FROM districts").fetchall()
    for row in district_rows:
        text = (
            f"District: {row['name']} | Population Density: {row['population_density']} per sq km | "
            f"Literacy Rate: {row['literacy_rate']}% | Unemployment Proxy: {row['unemployment_proxy']}%"
        )
        for chunk in chunk_text(text):
            documents.append({
                "text": chunk,
                "metadata": {
                    "source": f"District Profile - {row['name']}",
                    "dataset": "districts",
                    "district": row["name"]
                }
            })
            
    # 5. Court Outcomes
    court_rows = cursor.execute("SELECT * FROM court_outcomes").fetchall()
    for row in court_rows:
        text = (
            f"Court Outcome for FIR #{row['fir_id']} | Outcome: {row['outcome']} | "
            f"Conviction Rate Metric: {row['conviction_rate']}"
        )
        for chunk in chunk_text(text):
            documents.append({
                "text": chunk,
                "metadata": {
                    "source": f"Court Outcome FIR #{row['fir_id']}",
                    "dataset": "court_outcomes",
                    "fir_id": row["fir_id"]
                }
            })

    # 6. Police Officers & Workload
    officer_rows = cursor.execute("""
        SELECT o.name, o.workload, s.name as station_name
        FROM officers o
        LEFT JOIN stations s ON o.station_id = s.id
    """).fetchall()
    for row in officer_rows:
        text = (
            f"Police Officer: {row['name']} | Station: {row['station_name']} | Workload / Active Cases: {row['workload']}"
        )
        for chunk in chunk_text(text):
            documents.append({
                "text": chunk,
                "metadata": {
                    "source": f"Officer {row['name']}",
                    "dataset": "officers",
                    "station": row["station_name"]
                }
            })
            
    conn.close()
    return documents

def load_docs_files() -> List[Dict[str, Any]]:
    """Load text and markdown files from docs/ directory if available."""
    documents = []
    docs_dir = Path(__file__).resolve().parents[2] / "docs"
    if docs_dir.exists():
        for file_path in docs_dir.glob("**/*.md"):
            try:
                content = file_path.read_text(encoding="utf-8")
                for chunk in chunk_text(content):
                    documents.append({
                        "text": chunk,
                        "metadata": {
                            "source": f"Doc file {file_path.name}",
                            "dataset": "documentation",
                            "filename": file_path.name
                        }
                    })
            except Exception:
                pass
    return documents

def load_all_dataset() -> List[Dict[str, Any]]:
    """Combine database records and documentation into a single dataset list."""
    docs = load_sqlite_dataset()
    docs.extend(load_docs_files())
    return docs
