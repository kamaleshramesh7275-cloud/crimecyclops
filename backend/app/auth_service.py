import os
from datetime import datetime, timedelta
from typing import List, Optional
from fastapi import Depends, HTTPException, Security, status
from fastapi.security import OAuth2PasswordBearer, SecurityScopes
import jwt
from jwt.exceptions import PyJWTError
from passlib.context import CryptContext
from app.database import get_db_connection

# Load configurations from environment
SECRET_KEY = os.getenv("JWT_SECRET", "4d9c73e0a29b4e8c8a14d59fcf82e9b11d9f8c858be16cb4d142d76a7e02b3c2")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "720")) # Default 12 hours

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def get_user_from_db(username: str):
    with get_db_connection() as conn:
        is_postgres = "postgres" in str(type(conn))
        sql = "SELECT id, username, role, password FROM users WHERE username = %s LIMIT 1" if is_postgres else "SELECT id, username, role, password FROM users WHERE username = ? LIMIT 1"
        user = conn.execute(sql, (username,)).fetchone()
        
        # Standardize sqlite vs postgres row output
        if user:
            return {
                "id": user["id"],
                "username": user["username"],
                "role": user["role"],
                "password": user["password"]
            }
    return None


async def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except PyJWTError:
        raise credentials_exception
        
    user = get_user_from_db(username)
    if user is None:
        raise credentials_exception
    return user


class RoleChecker:
    """Dependency checker to enforce RBAC rules on endpoints."""
    def __init__(self, allowed_roles: List[str]):
        self.allowed_roles = allowed_roles

    def __call__(self, current_user: dict = Depends(get_current_user)):
        # Admin bypasses all checks
        if current_user["role"] == "admin":
            return current_user
            
        if current_user["role"] not in self.allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to access this resource."
            )
        return current_user
