from app.database import get_db_connection

def log_action(username: str, action: str, resource: str):
    try:
        with get_db_connection() as conn:
            cursor = conn.cursor()
            # Handle parameter placeholders depending on active DB engine
            if "postgres" in str(type(conn)):
                cursor.execute(
                    "INSERT INTO audit_log (user_name, action, resource) VALUES (%s, %s, %s);",
                    (username, action, resource)
                )
            else:
                cursor.execute(
                    "INSERT INTO audit_log (user_name, action, resource) VALUES (?, ?, ?);",
                    (username, action, resource)
                )
            conn.commit()
            cursor.close()
    except Exception as e:
        # Prevent database logging failures from crashing API requests
        print(f"Audit log insertion failed: {e}")
