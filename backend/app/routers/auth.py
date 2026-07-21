from fastapi import APIRouter, HTTPException, Depends, status
from app.auth_service import verify_password, create_access_token, get_user_from_db
from app.audit import log_action

router = APIRouter(tags=["auth"])


@router.post("/auth/login")
def login(payload: dict):
    username = (payload.get("username") or "").strip()
    password = (payload.get("password") or "").strip()

    if not username or not password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username and password are required."
        )

    user = get_user_from_db(username)
    if not user or not verify_password(password, user["password"]):
        # Log failed login attempt
        if username:
            log_action(username, "failed_login", "auth")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials."
        )

    # Issue JWT token containing username and role
    access_token = create_access_token(data={"sub": user["username"], "role": user["role"]})
    
    # Log successful login
    log_action(user["username"], "login", "auth")

    return {
        "token": access_token,
        "role": user["role"],
        "user": user["username"],
    }
