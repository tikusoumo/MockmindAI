from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from ..db import is_db_configured, session_scope
from ..models_sql import User as UserRow
from ..data_store import store

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class SignupRequest(BaseModel):
    name: str
    email: str
    password: str


class AuthResponse(BaseModel):
    user: dict[str, Any]
    token: str


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest) -> dict:
    if not is_db_configured():
        # Demo mode: Allow any login if email matches demo user, or just mock it
        if body.email == "demo@example.com" or True: # Allow all for demo
             return {
                "user": store.user,
                "token": "mock-token-123"
            }

    with session_scope() as session:
        # TODO: Real password hashing
        # For now, simple lookup
        statement = select(UserRow).where(UserRow.email == body.email)
        user = session.exec(statement).first()
        
        if not user:
             raise HTTPException(status_code=401, detail="Invalid credentials")
        
        # Verify password (simple check for now, should be hashed)
        if user.password_hash != body.password:
            raise HTTPException(status_code=401, detail="Invalid credentials")

        return {
            "user": {
                "name": user.name,
                "role": user.role,
                "avatar": user.avatar,
                "level": user.level or "Junior"
            },
            "token": f"token-{user.id}"
        }


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest) -> dict:
    if not is_db_configured():
         # Demo mode update mock store
        store.user["name"] = body.name
        return {
            "user": store.user,
            "token": "mock-token-new-user"
        }

    with session_scope() as session:
        statement = select(UserRow).where(UserRow.email == body.email)
        existing = session.exec(statement).first()
        if existing:
            raise HTTPException(status_code=400, detail="User already exists")
            
        new_user = UserRow(
            name=body.name,
            email=body.email,
            password_hash=body.password, # TODO: Hash this!
            role="Candidate",
            avatar=f"https://api.dicebear.com/7.x/avataaars/svg?seed={body.name}",
            level="Junior"
        )
        session.add(new_user)
        session.commit()
        session.refresh(new_user)
        
        return {
            "user": {
                "name": new_user.name,
                "role": new_user.role,
                "avatar": new_user.avatar,
                "level": new_user.level
            },
            "token": f"token-{new_user.id}"
        }
