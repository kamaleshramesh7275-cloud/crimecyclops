from fastapi import APIRouter, HTTPException

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
def login(payload: dict):
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()

    if not username or not password:
        raise HTTPException(status_code=401, detail="Username and password are required.")

    if username != "admin" or password != "admin123":
        raise HTTPException(status_code=401, detail="Invalid credentials.")

    return {
        "token": "demo-token",
        "role": "investigator",
        "user": username,
    }
