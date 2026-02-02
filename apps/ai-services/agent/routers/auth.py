from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from pydantic import BaseModel

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
    """
    Demo login endpoint using in-memory store.
    Real authentication will be handled by NestJS backend.
    """
    return {
        "user": store.user,
        "token": "mock-token-123"
    }


@router.post("/signup", response_model=AuthResponse)
def signup(body: SignupRequest) -> dict:
    """
    Demo signup endpoint using in-memory store.
    Real user creation will be handled by NestJS backend.
    """
    store.user["name"] = body.name
    return {
        "user": store.user,
        "token": "mock-token-new-user"
    }
