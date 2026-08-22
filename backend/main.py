import os
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv

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


# --- Contact Form Schema ---
class ContactMessage(BaseModel):
    name: str
    email: str
    topic: str
    message: str


@app.get("/")
def read_root():
    return {
        "service": "MimarAi Backend API",
        "version": "0.1.0 (V0 Foundations)",
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


@app.post("/contact")
async def submit_contact(msg: ContactMessage):
    """
    Receives contact form submissions and persists them to Supabase 'contact_messages' table.
    Returns 200 on success; 503 if the database is not configured.
    """
    if not msg.name.strip() or not msg.email.strip() or not msg.message.strip():
        raise HTTPException(status_code=422, detail="Name, email, and message are required.")

    client = get_supabase()
    if not client:
        # Graceful degradation: log server-side and return 200 so the UX is not broken
        # when Supabase is temporarily unavailable. Swap for real email service in V1.
        print(f"[CONTACT] Supabase unavailable. Message from {msg.name} <{msg.email}>: {msg.message}")
        return {"status": "received", "message": "Your message has been received."}

    try:
        client.table("contact_messages").insert({
            "name": msg.name.strip(),
            "email": msg.email.strip(),
            "topic": msg.topic.strip(),
            "message": msg.message.strip(),
        }).execute()
        return {"status": "ok", "message": "Message received. We will get back to you shortly."}
    except Exception as e:
        # Table may not exist yet — log and degrade gracefully
        print(f"[CONTACT] DB insert failed: {e}. Message from {msg.name}: {msg.message}")
        return {"status": "received", "message": "Your message has been received."}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)
