import os
from typing import Optional, Dict, Any
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import jwt

load_dotenv()

app = FastAPI(
    title="MimarAi Backend API",
    description="Precision Architecture & Planning Layer API",
    version="0.1.0"
)

# CORS setup
frontend_url = os.getenv("FRONTEND_URL", "https://mimar-ai.vercel.app")
allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://mimar-ai.vercel.app",
]
if frontend_url and frontend_url not in allowed_origins and frontend_url != "*":
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if frontend_url == "*" else allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Client Initialization (Lazy / resilient)
supabase_url: Optional[str] = os.getenv("SUPABASE_URL")
supabase_key: Optional[str] = os.getenv("SUPABASE_KEY")
supabase_jwt_secret: Optional[str] = os.getenv("SUPABASE_JWT_SECRET")
supabase_client = None

def get_supabase():
    global supabase_client
    if supabase_client is not None:
        return supabase_client
    
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if url and key and "your-project" not in url:
        try:
            from supabase import create_client
            supabase_client = create_client(url, key)
            return supabase_client
        except Exception as e:
            print(f"Supabase client initialization warning: {e}")
            return None
    return None


# --- JWT Authentication Dependency ---
async def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """
    Verifies the Supabase JWT token passed in Authorization: Bearer <token>.
    Supports both local JWT Secret verification and Supabase Auth API verification.
    """
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail="Missing or malformed Authorization header. Expected 'Bearer <token>'."
        )

    token = authorization.split(" ")[1].strip()
    if not token:
        raise HTTPException(status_code=401, detail="Authentication token cannot be empty.")

    # 1. Try direct JWT decode if SUPABASE_JWT_SECRET is set
    secret = os.getenv("SUPABASE_JWT_SECRET")
    if secret:
        try:
            payload = jwt.decode(
                token,
                secret,
                algorithms=["HS256"],
                options={"verify_aud": False}
            )
            return {
                "user_id": payload.get("sub"),
                "email": payload.get("email"),
                "role": payload.get("role"),
                "user_metadata": payload.get("user_metadata", {})
            }
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=401, detail="Authentication token has expired.")
        except jwt.InvalidTokenError as e:
            raise HTTPException(status_code=401, detail=f"Invalid authentication token: {str(e)}")

    # 2. Fallback to Supabase API auth check
    client = get_supabase()
    if client:
        try:
            user_response = client.auth.get_user(token)
            if user_response and user_response.user:
                u = user_response.user
                return {
                    "user_id": u.id,
                    "email": u.email,
                    "role": u.role,
                    "user_metadata": u.user_metadata or {}
                }
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

    raise HTTPException(
        status_code=401,
        detail="Backend token verification unconfigured. SUPABASE_JWT_SECRET or valid client required."
    )


# --- Schemas ---
class ContactMessage(BaseModel):
    name: str
    email: str
    topic: str
    message: str
    recipient: Optional[str] = "support.mimarai@gmail.com"


@app.get("/")
def read_root():
    return {
        "service": "MimarAi Backend API",
        "version": "0.1.0 (V1 Auth Security Foundations)",
        "status": "online"
    }


@app.get("/health")
def health_check():
    """
    Standard liveness endpoint for keep-alive pings and deployment health checks.
    """
    return {"status": "ok"}


@app.get("/health/db")
def health_db_check():
    """
    Diagnostic database connectivity check against Supabase 'projects' table.
    """
    client = get_supabase()
    if not client:
        return {
            "status": "warning",
            "db": "unconfigured",
            "message": "SUPABASE_URL and SUPABASE_KEY environment variables are not set or invalid."
        }
    
    try:
        response = client.table("projects").select("id", count="exact").execute()
        return {
            "status": "ok",
            "db": "connected",
            "projects_count": response.count if response.count is not None else len(response.data),
            "sample": response.data[:1]
        }
    except Exception as e:
        return {
            "status": "error",
            "db": "connection_failed",
            "error": str(e)
        }


@app.get("/me")
async def get_me(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Authenticated user endpoint proving frontend-to-backend Auth handoff works end-to-end.
    """
    return {
        "status": "authenticated",
        "user_id": user.get("user_id"),
        "email": user.get("email"),
        "metadata": user.get("user_metadata", {})
    }


@app.post("/contact")
async def submit_contact(msg: ContactMessage):
    """
    Receives contact form submissions and persists them to Supabase 'contact_messages' table.
    Routs all messages to support.mimarai@gmail.com.
    """
    if not msg.name.strip() or not msg.email.strip() or not msg.message.strip():
        raise HTTPException(status_code=422, detail="Name, email, and message are required.")

    target_email = msg.recipient.strip() if msg.recipient else "support.mimarai@gmail.com"
    print(f"[CONTACT -> {target_email}] Message from {msg.name} <{msg.email}> | Topic: {msg.topic}: {msg.message}")

    client = get_supabase()
    if not client:
        return {"status": "received", "message": "Your message has been received."}

    try:
        client.table("contact_messages").insert({
            "name": msg.name.strip(),
            "email": msg.email.strip(),
            "topic": msg.topic.strip(),
            "message": msg.message.strip(),
        }).execute()
        return {"status": "ok", "message": f"Message sent to {target_email} successfully."}
    except Exception as e:
        print(f"[CONTACT DB Insert Warning] {e}")
        return {"status": "received", "message": "Your message has been received."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
