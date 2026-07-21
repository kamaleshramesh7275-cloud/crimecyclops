import pandas as pd
from app.database import get_db_connection

def load_districts_dataframe(df: pd.DataFrame):
    """Upsert districts into the districts database table."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    is_postgres = "postgres" in str(type(conn))
    
    for _, row in df.iterrows():
        name = row["name"]
        density = float(row.get("population_density", 0))
        literacy = float(row.get("literacy_rate", 0))
        unemp = float(row.get("unemployment_proxy", 0))
        source = row.get("data_source", "REAL_NCRB")
        
        if is_postgres:
            cursor.execute("""
                INSERT INTO districts (name, population_density, literacy_rate, unemployment_proxy, data_source)
                VALUES (%s, %s, %s, %s, %s)
                ON CONFLICT (name) DO UPDATE 
                SET population_density = EXCLUDED.population_density,
                    literacy_rate = EXCLUDED.literacy_rate,
                    unemployment_proxy = EXCLUDED.unemployment_proxy,
                    data_source = EXCLUDED.data_source;
            """, (name, density, literacy, unemp, source))
        else:
            # SQLite upsert
            cursor.execute("""
                INSERT INTO districts (name, population_density, literacy_rate, unemployment_proxy, data_source)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(name) DO UPDATE 
                SET population_density = excluded.population_density,
                    literacy_rate = excluded.literacy_rate,
                    unemployment_proxy = excluded.unemployment_proxy,
                    data_source = excluded.data_source;
            """, (name, density, literacy, unemp, source))
            
    conn.commit()
    cursor.close()
    conn.close()
    print(f"Loaded {len(df)} districts.")


def load_stations_dataframe(df: pd.DataFrame):
    """Insert stations into the stations database table, generating PostGIS geometries if active."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    is_postgres = "postgres" in str(type(conn))
    
    for _, row in df.iterrows():
        district_id = int(row["district_id"])
        name = row["name"]
        beat = row.get("beat", "")
        lat = float(row.get("latitude", 0.0))
        lon = float(row.get("longitude", 0.0))
        source = row.get("data_source", "REAL_NCRB")
        
        if is_postgres:
            cursor.execute("""
                INSERT INTO stations (district_id, name, beat, latitude, longitude, geom, data_source)
                VALUES (%s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s);
            """, (district_id, name, beat, lat, lon, lon, lat, source))
        else:
            cursor.execute("""
                INSERT INTO stations (district_id, name, beat, latitude, longitude, data_source)
                VALUES (?, ?, ?, ?, ?, ?);
            """, (district_id, name, beat, lat, lon, source))
            
    conn.commit()
    cursor.close()
    conn.close()
    print(f"Loaded {len(df)} stations.")


def load_firs_dataframe(df: pd.DataFrame):
    """Insert FIR records into the database, generating PostGIS geometries if active."""
    conn = get_db_connection()
    cursor = conn.cursor()
    
    is_postgres = "postgres" in str(type(conn))
    
    for _, row in df.iterrows():
        district_id = int(row["district_id"])
        station_id = int(row["station_id"])
        crime_type = row["crime_type"]
        ipc_section = row.get("ipc_section", "")
        inc_date = row["incident_date"]
        lat = float(row.get("latitude", 0.0))
        lon = float(row.get("longitude", 0.0))
        status = row.get("status", "open")
        desc = row.get("description", "")
        source = row.get("data_source", "REAL_NCRB")
        
        if is_postgres:
            cursor.execute("""
                INSERT INTO fir_records (district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, geom, status, description, data_source)
                VALUES (%s, %s, %s, %s, %s, %s, %s, ST_SetSRID(ST_MakePoint(%s, %s), 4326), %s, %s, %s);
            """, (district_id, station_id, crime_type, ipc_section, inc_date, lat, lon, lon, lat, status, desc, source))
        else:
            cursor.execute("""
                INSERT INTO fir_records (district_id, station_id, crime_type, ipc_section, incident_date, latitude, longitude, status, description, data_source)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
            """, (district_id, station_id, crime_type, ipc_section, inc_date, lat, lon, status, desc, source))
            
    conn.commit()
    cursor.close()
    conn.close()
    print(f"Loaded {len(df)} FIR records.")
