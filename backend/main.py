import os
import asyncio
import json
import re
import unicodedata
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List
from uuid import UUID
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
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

# Standardized Error Response Formatter
def build_error_payload(status_code: int, detail: Any) -> Dict[str, Any]:
    if isinstance(detail, dict) and detail.get("status") == "error":
        return detail

    error_type = "internal_error"
    if status_code == 400:
        error_type = "bad_request"
    elif status_code == 401:
        error_type = "unauthorized"
    elif status_code == 403:
        error_type = "forbidden"
    elif status_code == 404:
        error_type = "not_found"
    elif status_code == 422:
        error_type = "validation_error"
    elif status_code == 429:
        error_type = "rate_limit_exceeded"
    elif status_code == 500:
        detail_str = str(detail).lower()
        if "unconfigured" in detail_str or "missing" in detail_str:
            error_type = "config_error"
        else:
            error_type = "internal_error"
    elif status_code == 502:
        error_type = "provider_error"
    elif status_code == 503:
        error_type = "storage_unavailable"
    elif status_code == 504:
        error_type = "timeout_error"

    if isinstance(detail, dict):
        msg = detail.get("message") or detail.get("detail") or str(detail)
    else:
        msg = str(detail)

    return {
        "status": "error",
        "error_type": error_type,
        "message": msg
    }


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    payload = build_error_payload(exc.status_code, exc.detail)
    return JSONResponse(status_code=exc.status_code, content=payload)


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=422,
        content={
            "status": "error",
            "error_type": "validation_error",
            "message": str(exc)
        }
    )

# CORS setup
frontend_url = os.getenv("FRONTEND_URL", "https://mimar-ai.vercel.app")
allowed_origins = [
    "https://mimar-ai.vercel.app",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3000",
]
if frontend_url and frontend_url not in allowed_origins:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Supabase Client Initialization (Lazy / resilient)
supabase_url: Optional[str] = os.getenv("SUPABASE_URL")
supabase_key: Optional[str] = os.getenv("SUPABASE_KEY")
supabase_jwt_secret: Optional[str] = os.getenv("SUPABASE_JWT_SECRET")
supabase_client = None
service_health_cache = {"expires_at": 0.0, "data": None}

def get_supabase(token: Optional[str] = None):
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_KEY")
    if url and key and "your-project" not in url:
        try:
            from supabase import create_client
            if token:
                client = create_client(url, key)
                client.postgrest.auth(token)
                return client
            
            global supabase_client
            if supabase_client is None:
                supabase_client = create_client(url, key)
            return supabase_client
        except Exception as e:
            print(f"Supabase client initialization warning: {e}")
            return None
    return None


def get_owned_project(client, user_id: Optional[str], project_id: str):
    """Return an owned persisted project or reject the request before AI work."""
    if not client or not user_id:
        raise HTTPException(status_code=503, detail="Project storage is unavailable.")
    if not project_id or project_id.startswith("local-draft-"):
        raise HTTPException(status_code=400, detail="A persisted project ID is required.")
    try:
        UUID(project_id)
    except (ValueError, AttributeError):
        raise HTTPException(status_code=400, detail="Invalid project ID.")

    try:
        result = (
            client.table("projects")
            .select("*")
            .eq("id", project_id)
            .eq("owner_id", user_id)
            .execute()
        )
    except Exception as exc:
        print(f"[Project Authorization Error] {exc}")
        raise HTTPException(status_code=404, detail="Project not found") from exc

    if not result or not result.data:
        raise HTTPException(status_code=404, detail="Project not found")
    return result.data[0]


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
                "user_metadata": payload.get("user_metadata", {}),
                "token": token
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
                    "user_metadata": u.user_metadata or {},
                    "token": token
                }
        except Exception as e:
            raise HTTPException(status_code=401, detail=f"Token verification failed: {str(e)}")

    raise HTTPException(
        status_code=401,
        detail="Backend token verification unconfigured. SUPABASE_JWT_SECRET or valid client required."
    )


import smtplib
import html
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from pydantic import BaseModel, field_validator

# --- Schemas ---
class ContactMessage(BaseModel):
    name: str
    email: str
    topic: str
    message: str

    @field_validator('email')
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", v):
            raise ValueError("Invalid email address format.")
        return v


# --- Reusable SMTP Email Dispatcher ---
def send_smtp_email(to_email: str, subject: str, html_body: str, plain_text_body: str) -> bool:
    """
    Connects to Gmail SMTP via STARTTLS using environment variables and dispatches
    a multipart (text/plain + text/html) email. Returns True on success, False on failure.
    Never exposes or logs credentials.
    """
    smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.getenv("SMTP_PORT", 587))
    gmail_user = os.getenv("GMAIL_USER", "support.mimarai@gmail.com")
    gmail_password = os.getenv("GMAIL_APP_PASSWORD", "").strip()

    if not gmail_password or not gmail_user:
        print("[SMTP Warning] GMAIL_APP_PASSWORD or GMAIL_USER is not set in environment. Skipping email dispatch.")
        return False

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"] = f"MimarAI Support <{gmail_user}>"
        msg["To"] = to_email

        # Attach plain-text fallback first, then HTML version
        part1 = MIMEText(plain_text_body, "plain", "utf-8")
        part2 = MIMEText(html_body, "html", "utf-8")
        msg.attach(part1)
        msg.attach(part2)

        server = smtplib.SMTP(smtp_server, smtp_port, timeout=12)
        server.ehlo()
        server.starttls()
        server.ehlo()
        server.login(gmail_user, gmail_password)
        server.send_message(msg)
        server.quit()
        print(f"[SMTP Success] Email successfully sent to {to_email} with subject: '{subject}'")
        return True
    except Exception as e:
        print(f"[SMTP Error] Failed to send email to {to_email}: {str(e)}")
        return False


@app.get("/")
@app.options("/")
def read_root():
    return {
        "service": "MimarAi Backend API",
        "version": "0.1.0 (V1 Auth Security Foundations)",
        "status": "online"
    }


@app.get("/health")
@app.options("/health")
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


async def check_provider_health():
    """Check provider reachability/model availability without generating tokens."""
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

    async def check_gemini():
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            return "unavailable"
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(url, params={"key": api_key})
            return "connected" if response.status_code == 200 else "unavailable"
        except (httpx.HTTPError, ValueError):
            return "unavailable"

    async def check_groq():
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            return "unavailable"
        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                response = await client.get(
                    "https://api.groq.com/openai/v1/models",
                    headers={"Authorization": f"Bearer {api_key}"},
                )
            if response.status_code != 200:
                return "unavailable"
            models = response.json().get("data", [])
            return "connected" if any(model.get("id") == groq_model for model in models) else "unavailable"
        except (httpx.HTTPError, ValueError, TypeError):
            return "unavailable"

    gemini_status, groq_status = await asyncio.gather(check_gemini(), check_groq())
    return {"gemini": {"status": gemini_status}, "groq": {"status": groq_status}}


@app.get("/health/services")
async def health_services_check():
    """Return cached backend/provider health without exposing provider credentials."""
    now = datetime.now(timezone.utc).timestamp()
    cached = service_health_cache.get("data")
    if cached and service_health_cache.get("expires_at", 0) > now:
        return cached

    try:
        provider_status = await check_provider_health()
        result = {
            "backend": {"status": "connected"},
            **provider_status,
        }
        service_health_cache.update({"expires_at": now + 15, "data": result})
        return result
    except Exception:
        return {
            "backend": {"status": "connected"},
            "gemini": {"status": "unavailable"},
            "groq": {"status": "unavailable"},
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
    Receives contact form submissions, validates data, persists to Supabase DB,
    dispatches notification email to support.mimarai@gmail.com, and sends an HTML auto-reply to user.
    """
    if not msg.name.strip() or not msg.email.strip() or not msg.message.strip():
        raise HTTPException(status_code=422, detail="Name, email, and message are required.")

    support_email = os.getenv("SUPPORT_EMAIL", "mimarai.support@gmail.com").strip()

    # 1. HTML escape user inputs to prevent HTML injection in emails
    safe_name = html.escape(msg.name.strip())
    safe_email = html.escape(msg.email.strip())
    safe_topic = html.escape(msg.topic.strip())
    safe_message = html.escape(msg.message.strip())

    # 2. Database Persistence
    db_saved = False
    client = get_supabase()
    if client:
        try:
            client.table("contact_messages").insert({
                "name": msg.name.strip(),
                "email": msg.email.strip(),
                "topic": msg.topic.strip(),
                "message": msg.message.strip(),
            }).execute()
            db_saved = True
        except Exception as e:
            print(f"[CONTACT DB Warning] Insert failed: {e}")

    # 3. Notification Email to support.mimarai@gmail.com
    notif_subject = f"New {msg.topic.strip()} — MimarAI Contact Form"
    notif_html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #0F172A; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0B0F19; padding: 24px; border-radius: 8px; color: #F8FAFC; border: 1px solid #1E293B;">
    <h2 style="color: #38BDF8; margin-top: 0;">New Contact Form Submission</h2>
    <p><strong>From:</strong> {safe_name} (&lt;<a href="mailto:{safe_email}" style="color: #38BDF8;">{safe_email}</a>&gt;)</p>
    <p><strong>Inquiry Type:</strong> {safe_topic}</p>
    <div style="background: #161F32; padding: 16px; border-left: 3px solid #38BDF8; border-radius: 4px; margin: 20px 0;">
      <div style="font-size: 11px; color: #94A3B8; font-family: monospace; text-transform: uppercase; margin-bottom: 6px;">Message Payload:</div>
      <div style="color: #E2E8F0; white-space: pre-wrap;">"{safe_message}"</div>
    </div>
    <hr style="border: 0; border-top: 1px solid #1E293B; margin: 20px 0;">
    <p style="font-size: 12px; color: #94A3B8; margin-bottom: 0;">MimarAI Production Pipeline — Automated Notification</p>
  </div>
</body>
</html>"""

    notif_plain = f"""New Contact Form Submission

From: {msg.name.strip()} ({msg.email.strip()})
Inquiry Type: {msg.topic.strip()}

Message:
"{msg.message.strip()}"

MimarAI Production Pipeline — Automated Notification"""

    notif_sent = send_smtp_email(support_email, notif_subject, notif_html, notif_plain)

    # 4. User Auto-Reply Email to msg.email
    user_subject = "We received your message — MimarAI"
    user_html = f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #0F172A; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0B0F19; padding: 24px; border-radius: 8px; color: #F8FAFC; border: 1px solid #1E293B;">
    <h2 style="color: #38BDF8; margin-top: 0;">MimarAI Support Confirmation</h2>
    <p>Hi <strong>{safe_name}</strong>,</p>
    <p>Thanks for reaching out to MimarAI! This confirms we've received your <strong>{safe_topic}</strong> and it's now in our queue.</p>
    <p>Our team reviews inquiries daily and typically responds within 24 business hours. If your message included a bug report, feel free to also open an issue on our GitHub repository for faster visibility:</p>
    <p style="margin: 16px 0;">
      <a href="https://github.com/abdullahaziz12/MimarAi" style="color: #38BDF8; font-weight: 600; text-decoration: underline;">github.com/abdullahaziz12/MimarAi</a>
    </p>
    <div style="background: #161F32; padding: 16px; border-left: 3px solid #38BDF8; border-radius: 4px; margin: 20px 0;">
      <div style="font-size: 11px; color: #94A3B8; font-family: monospace; text-transform: uppercase; margin-bottom: 6px;">For reference, here's what you sent us:</div>
      <div style="color: #E2E8F0; white-space: pre-wrap;">"{safe_message}"</div>
    </div>
    <p>We'll follow up soon.</p>
    <hr style="border: 0; border-top: 1px solid #1E293B; margin: 24px 0;">
    <p style="font-size: 13px; color: #94A3B8; margin-bottom: 0;">
      <strong>The MimarAI Team</strong><br>
      Support: <a href="mailto:{support_email}" style="color: #38BDF8;">{support_email}</a>
    </p>
  </div>
</body>
</html>"""

    user_plain = f"""Hi {msg.name.strip()},

Thanks for reaching out to MimarAI! This confirms we've received your {msg.topic.strip()} and it's now in our queue.

Our team reviews inquiries daily and typically responds within 24 business hours. If your message included a bug report, feel free to also open an issue on our GitHub repository for faster visibility:
https://github.com/abdullahaziz12/MimarAi

For reference, here's what you sent us:
"{msg.message.strip()}"

We'll follow up soon.

The MimarAI Team
Support: {support_email}"""

    user_sent = send_smtp_email(msg.email.strip(), user_subject, user_html, user_plain)

    if not notif_sent or not user_sent:
        print(f"[CONTACT WARNING] DB Saved={db_saved}. Notification Sent={notif_sent}, User Auto-Reply Sent={user_sent}.")

    return {
        "status": "ok",
        "message": "Message received. We will get back to you shortly.",
        "email_sent": notif_sent and user_sent,
        "db_saved": db_saved
    }


# --- V2 Step 0 Classification & Project Draft Endpoints ---
import json
import httpx
from datetime import datetime, timezone, timedelta

class ClassifyRequest(BaseModel):
    idea_text: str
    project_id: Optional[str] = None
    step0_state: Optional[Dict[str, Any]] = None

class CreateDraftRequest(BaseModel):
    idea_text: Optional[str] = None

class UpdateProjectStatusRequest(BaseModel):
    status: Optional[str] = None
    fixed_inputs: Optional[Dict[str, Any]] = None

GREETING_WHITELIST = {
    "hi", "hello", "hey", "test", "thanks", "thank you", "ok", "okay",
    "good morning", "good afternoon", "good evening", "sup", "yo", "hi there",
    "hello there", "testing", "cool", "great"
}

PROJECT_DOMAIN_TERMS = {
    "bank", "banking", "hospital", "healthcare", "school", "education",
    "ecommerce", "e-commerce", "commerce", "food delivery", "restaurant",
    "loan", "inventory", "payroll", "crm", "marketplace", "attendance",
    "logistics", "booking", "real estate", "social network"
}

PROJECT_SCOPE_TERMS = {
    "manage", "management", "track", "tracking", "attendance", "payment",
    "payments", "loan", "loans", "employee", "employees", "customer",
    "customers", "booking", "bookings", "orders", "order", "delivery",
    "upload", "document", "documents", "report", "reports", "notification",
    "notifications", "role-based", "role based", "authentication", "login",
    "dashboard", "workflow", "approval", "approvals", "history", "review"
}

def has_concrete_project_scope(text: str) -> bool:
    """Recognize a domain plus at least one concrete capability before AI classification."""
    normalized = unicodedata.normalize("NFKC", text).casefold()
    tokens = re.findall(r"[\w]+", normalized, flags=re.UNICODE)

    def contains_keyword(keyword: str) -> bool:
        keyword_tokens = re.findall(r"[\w]+", keyword.casefold(), flags=re.UNICODE)
        width = len(keyword_tokens)
        return any(
            tokens[index : index + width] == keyword_tokens
            for index in range(len(tokens) - width + 1)
        )

    return (
        any(contains_keyword(term) for term in PROJECT_DOMAIN_TERMS)
        and any(contains_keyword(term) for term in PROJECT_SCOPE_TERMS)
    )

def check_regex_prefilter(text: str) -> bool:
    cleaned = re.sub(r'[^\w\s]', '', text.lower()).strip()
    words = cleaned.split()
    if len(words) <= 4 and cleaned in GREETING_WHITELIST:
        return True
    return False

def _update_project_step0_state(client, project_id, classification_result, current_state):
    if not client or not project_id:
        return
    try:
        state = current_state or {"round_count": 0, "off_topic_streak": 0, "last_label": None}
        label = classification_result.get("label")
        
        round_count = state.get("round_count", 0)
        off_topic_streak = state.get("off_topic_streak", 0)

        if label == "OFF_TOPIC":
            off_topic_streak += 1
        else:
            off_topic_streak = 0

        if label == "TOO_VAGUE":
            round_count += 1
        else:
            round_count = 0

        new_state = {
            "round_count": round_count,
            "off_topic_streak": off_topic_streak,
            "last_label": label,
            "last_sub_case": classification_result.get("sub_case"),
            "extracted_name": classification_result.get("extracted_name"),
            "updated_at": datetime.now(timezone.utc).isoformat()
        }

        client.table("projects").update({"step0_state": new_state}).eq("id", project_id).execute()
    except Exception as e:
        print(f"[DB Step0 State Update Warning] {e}")


@app.post("/projects/draft")
@app.post("/api/projects/draft")
async def create_draft_project(
    req: CreateDraftRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    if not client or not user_id:
        raise HTTPException(status_code=503, detail="Project storage is unavailable.")

    try:
        res = client.table("projects").insert({
            "owner_id": user_id,
            "name": (req.idea_text or "Untitled Project").strip()[:120] or "Untitled Project",
            "status": "draft",
            "idea_text": req.idea_text,
            "step0_state": {"round_count": 0, "off_topic_streak": 0, "last_label": None},
            "density_flags": dict(DEFAULT_DENSITY_FLAGS)
        }).execute()
        
        if res.data:
            return res.data[0]
        raise HTTPException(status_code=500, detail="Failed to create draft project.")
    except Exception as e:
        print(f"[Create Draft Project Error] {e}")
        raise HTTPException(status_code=500, detail="Failed to create draft project.") from e


@app.get("/projects/drafts")
@app.get("/api/projects/drafts")
async def get_draft_projects(
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    if not client or not user_id:
        raise HTTPException(status_code=503, detail="Project storage is unavailable.")

    try:
        res = client.table("projects").select("*").eq("owner_id", user_id).eq("status", "draft").order("created_at", desc=True).execute()
        return {"drafts": res.data or []}
    except Exception as e:
        print(f"[Get Draft Projects Error] {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch draft projects.") from e


@app.post("/projects/{project_id}/status")
@app.post("/api/projects/{project_id}/status")
async def update_project_status(
    project_id: str,
    req: UpdateProjectStatusRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    get_owned_project(client, user_id, project_id)

    try:
        # Enforce project ownership check
        try:
            proj_res = client.table("projects").select("id").eq("id", project_id).eq("owner_id", user_id).execute()
            if not proj_res or not proj_res.data:
                raise HTTPException(status_code=404, detail="Project not found")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Update Project Status Ownership Check Warning] {e}")
            raise HTTPException(status_code=404, detail="Project not found")

        payload = {}
        if req.status:
            payload["status"] = req.status
        if req.fixed_inputs:
            payload["fixed_inputs"] = req.fixed_inputs
        if payload:
            client.table("projects").update(payload).eq("id", project_id).eq("owner_id", user_id).execute()
        return {"status": "ok", "project_id": project_id, "updated_status": req.status}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Update Project Status Error] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to update project status: {str(e)}")


@app.post("/interview/classify")
@app.post("/api/interview/classify")
async def classify_idea(
    req: ClassifyRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    idea_text = req.idea_text.strip() if req.idea_text else ""

    if not req.project_id or req.project_id.startswith("local-draft-"):
        raise HTTPException(status_code=400, detail="A persisted project ID is required.")
    
    # 0. Empty idea_text check
    if not idea_text:
        raise HTTPException(
            status_code=400,
            detail="Idea text cannot be empty."
        )

    # 1. 2,000 character check (server-side)
    if len(idea_text) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Idea description exceeds 2,000 characters limit."
        )

    # 2. Validate project ownership before classification/provider work.
    client = get_supabase(token)
    get_owned_project(client, user_id, req.project_id)

    # 3. Rate limiting check (10 per hour)
    client = get_supabase(token)
    if client and user_id:
        try:
            res = client.table("rate_limits").select("*").eq("user_id", user_id).execute()
            now = datetime.now(timezone.utc)
            if res.data:
                row = res.data[0]
                window_start = datetime.fromisoformat(row["window_start"].replace("Z", "+00:00"))
                if now - window_start < timedelta(hours=1):
                    if row["count"] >= 10:
                        raise HTTPException(
                            status_code=429,
                            detail="You've hit the hourly limit for idea submissions (10 calls/hr). Please try again in a few minutes."
                        )
                    client.table("rate_limits").update({"count": row["count"] + 1}).eq("user_id", user_id).execute()
                else:
                    client.table("rate_limits").update({"count": 1, "window_start": now.isoformat()}).eq("user_id", user_id).execute()
            else:
                client.table("rate_limits").insert({"user_id": user_id, "count": 1, "window_start": now.isoformat()}).execute()
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Rate Limit Warning] {e}")

    # 3. Regex Pre-filter check
    if check_regex_prefilter(idea_text):
        result_payload = {
            "status": "ok",
            "label": "OFF_TOPIC",
            "sub_case": None,
            "extracted_name": None,
            "explanation": "Greeting or minimal chit-chat detected.",
            "source": "prefilter"
        }
        _update_project_step0_state(client, req.project_id, result_payload, req.step0_state)
        return result_payload

    # A concrete domain plus a capability is sufficient to proceed. Do not let
    # an LLM incorrectly downgrade a detailed project idea to TOO_VAGUE.
    if has_concrete_project_scope(idea_text):
        result_payload = {
            "status": "ok",
            "label": "READY",
            "sub_case": None,
            "extracted_name": None,
            "explanation": "A project domain and concrete capabilities were identified.",
            "source": "scope_prefilter"
        }
        _update_project_step0_state(client, req.project_id, result_payload, req.step0_state)
        return result_payload

    # 4. Groq API Call
    groq_api_key = os.getenv("GROQ_API_KEY")
    if not groq_api_key:
        raise HTTPException(
            status_code=500,
            detail="Having trouble understanding that — classification service unconfigured (GROQ_API_KEY missing)."
        )

    system_prompt = """You are an architectural assistant classifier for MimarAi.
Your task is to classify a user's initial project idea into exactly one of three categories:
1. OFF_TOPIC: The message is unrelated to software applications, websites, tools, platforms, or system building (e.g. general trivia, personal questions, nonsensical text).
2. TOO_VAGUE: The idea is about software, but lacks sufficient context or scope. There are two sub-cases:
   - "no_domain": The user mentions wanting an app or site but gives no domain or concept at all (e.g. "I want to build an app", "Make me a website").
   - "unexplained": The user names a product/domain but gives no features or details (e.g. "a banking app", "Uber clone", "FoodieApp").
3. READY: The user provides a clear software idea with at least a basic domain and some features or scope (e.g. "a food delivery platform with live order tracking and driver assignments").

Important classification rule: if the user provides a domain plus any concrete capability, workflow, user type, or business function, classify it as READY. Do not classify a detailed or imperfectly worded idea as TOO_VAGUE. For example, "a banking app with loan management and employee attendance" is READY.

Output strictly valid JSON with no markdown formatting:
{
  "label": "OFF_TOPIC" | "TOO_VAGUE" | "READY",
  "sub_case": "no_domain" | "unexplained" | null,
  "extracted_name": "<extracted product name if sub_case is unexplained, else null>",
  "explanation": "<short rationale>"
}"""

    try:
        async with httpx.AsyncClient(timeout=8.0) as http_client:
            resp = await http_client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {groq_api_key}",
                    "Content-Type": "application/json"
                },
                json={
                    "model": "openai/gpt-oss-120b",
                    "messages": [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": idea_text}
                    ],
                    "temperature": 0.1,
                    "response_format": {"type": "json_object"}
                }
            )

            if resp.status_code != 200:
                print(f"[Groq API Error] Status {resp.status_code}: {resp.text}")
                raise HTTPException(
                    status_code=502,
                    detail="Having trouble understanding that — classification service error."
                )

            data = resp.json()
            raw_content = data["choices"][0]["message"]["content"]
            parsed = json.loads(raw_content)

            label = parsed.get("label")
            if label not in ["OFF_TOPIC", "TOO_VAGUE", "READY"]:
                raise HTTPException(
                    status_code=500,
                    detail="Having trouble understanding that — invalid classification label received."
                )

            result_payload = {
                "status": "ok",
                "label": label,
                "sub_case": parsed.get("sub_case"),
                "extracted_name": parsed.get("extracted_name"),
                "explanation": parsed.get("explanation"),
                "source": "groq"
            }

            _update_project_step0_state(client, req.project_id, result_payload, req.step0_state)
            return result_payload

    except httpx.TimeoutException:
        raise HTTPException(
            status_code=504,
            detail="Having trouble understanding that — classification request timed out."
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Classification Error] {e}")
        raise HTTPException(
            status_code=500,
            detail="Having trouble understanding that — internal classification error."
        )


# --- V3 Feature Generation Pipeline & Comment System ---

class GenerateRequest(BaseModel):
    idea_text: Optional[str] = None
    fixed_inputs: Optional[Dict[str, Any]] = None

class BatchFixRequest(BaseModel):
    stage: Optional[str] = "features"
    comments: Optional[List[Dict[str, Any]]] = None
    current_features: Optional[List[Dict[str, Any]]] = None

class FeatureRejectRequest(BaseModel):
    feature_id: str

class CommentCreateRequest(BaseModel):
    target_feature_id: Optional[str] = None
    text: str
    stage: Optional[str] = "features"

class CommentUpdateRequest(BaseModel):
    text: str

class ContradictionScanRequest(BaseModel):
    idea_text: str
    round: int = 1
    resolved_answer: Optional[str] = None

async def call_gemini_api(
    system_prompt: str,
    user_prompt: str,
    timeout: float = 12.0,
    retry_user_prompt: Optional[str] = None,
    retry: bool = True,
) -> Dict[str, Any]:
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise HTTPException(status_code=500, detail="Gemini API unconfigured (GEMINI_API_KEY missing).")
    
    gemini_model = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{gemini_model}:generateContent?key={gemini_key}"
    payload = {
        "contents": [
            {"role": "user", "parts": [{"text": f"{system_prompt}\n\n{user_prompt}"}]}
        ],
        "generationConfig": {
            "temperature": 0.2,
            "responseMimeType": "application/json"
        }
    }
    
    for attempt in range(2 if retry else 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as http_client:
                request_payload = dict(payload)
                if attempt and retry_user_prompt:
                    request_payload["contents"] = [
                        {"role": "user", "parts": [{"text": f"{system_prompt}\n\n{retry_user_prompt}"}]}
                    ]
                resp = await http_client.post(url, json=request_payload)
                if resp.status_code == 200:
                    data = resp.json()
                    raw = data["candidates"][0]["content"]["parts"][0]["text"]
                    return json.loads(raw)
                print(f"[Gemini API Error Attempt {attempt+1}] Status {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[Gemini Call Exception Attempt {attempt+1}] {e}")
            if attempt == (1 if retry else 0):
                raise
    raise HTTPException(status_code=502, detail="Gemini API request failed after retry.")


async def call_groq_json(
    system_prompt: str,
    user_prompt: str,
    timeout: float = 10.0,
    retry_user_prompt: Optional[str] = None,
    retry: bool = True,
) -> Dict[str, Any]:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(status_code=500, detail="Groq API unconfigured (GROQ_API_KEY missing).")
    
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
    payload = {
        "model": groq_model,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        "temperature": 0.1,
        "response_format": {"type": "json_object"}
    }
    
    for attempt in range(2 if retry else 1):
        try:
            async with httpx.AsyncClient(timeout=timeout) as http_client:
                request_payload = dict(payload)
                if attempt and retry_user_prompt:
                    request_payload["messages"] = [
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": retry_user_prompt},
                    ]
                resp = await http_client.post(url, headers=headers, json=request_payload)
                if resp.status_code == 200:
                    data = resp.json()
                    raw = data["choices"][0]["message"]["content"]
                    return json.loads(raw)
                print(f"[Groq API Error Attempt {attempt+1}] Status {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"[Groq Call Exception Attempt {attempt+1}] {e}")
            if attempt == (1 if retry else 0):
                raise
    raise HTTPException(status_code=502, detail="Groq API request failed after retry.")


# V3.2 Density Check Heuristic Definitions
DEFAULT_DENSITY_FLAGS = {
    "clarifying_questions": "full",
    "personas": "ask",
    "nfrs": "ask"
}

PERSONA_PATTERNS = [
    r"\badmin\b", r"\badministrator\b", r"\badministrators\b", r"\buser\b", r"\busers\b",
    r"\bdoctor\b", r"\bdoctors\b", r"\bpatient\b", r"\bpatients\b", r"\bcustomer\b", r"\bcustomers\b",
    r"\bstaff\b", r"\bmanager\b", r"\bmanagers\b", r"\brole\b", r"\broles\b", r"\bpermission\b",
    r"\bpermissions\b", r"\baccess\s+level[s]?\b", r"\bguest\b", r"\bguests\b", r"\bmember\b",
    r"\bmembers\b", r"\bclient\b", r"\bclients\b", r"\bclinician\b", r"\bclinicians\b",
    r"\bhygienist\b", r"\bhygienists\b", r"\bemployee\b", r"\bemployees\b", r"\btenant\b",
    r"\btenants\b", r"\bconsumer\b", r"\bconsumers\b", r"\bprovider\b", r"\bproviders\b",
    r"\bvendor\b", r"\bvendors\b"
]

SCALE_PATTERNS = [
    r"\bconcurrent\b", r"\bthroughput\b", r"\bqps\b", r"\btps\b", r"\blatency\b", r"\bload\s*balanced\b",
    r"\bscale\b", r"\bscalable\b", r"\bscalability\b", r"\btraffic\b",
    r"\b\d+[\s\-]*(?:users|concurrent|thousand|thousands|million|millions|daily|monthly|requests|reqs|per\s+second|qps|tps|records|transactions|txs|gb|tb|pb)\b",
    r"\b(?:thousands|millions|billions)\s+of\s+(?:users|requests|records|transactions|events|visitors)\b",
    r"\bhigh[\s\-]*(?:scale|volume|traffic|throughput|availability|load)\b"
]

SENSITIVITY_PATTERNS = [
    r"\bmedical\b", r"\bhealth\b", r"\bhealthcare\b", r"\bpatient\s+record[s]?\b",
    r"\bhipaa\b", r"\bpci\b", r"\bpci[\s\-]dss\b", r"\bgdpr\b", r"\bsoc[\s\-]?2\b",
    r"\bfinancial\b", r"\bpayment\b", r"\bpayments\b", r"\bbank\b", r"\bbanking\b",
    r"\bcredit\s+card[s]?\b", r"\bdebit\s+card[s]?\b", r"\bchildren\b", r"\bminors\b",
    r"\bcoppa\b", r"\bpersonal\s+data\b", r"\bpii\b", r"\bconfidential\b",
    r"\behr\b", r"\bemr\b", r"\bphi\b", r"\bencrypted\s+at\s+rest\b",
    r"\bend[\s\-]to[\s\-]end\s+encrypt\w*\b"
]


def compute_density_flags(idea_text: str, resolved_answer: Optional[str] = None) -> Dict[str, str]:
    """
    Pure heuristic (non-AI) to compute V3.2 density flags:
    - clarifying_questions: 'full' | 'partial' | 'skip'
    - personas: 'ask' | 'skip'
    - nfrs: 'ask' | 'skip'
    """
    try:
        if not isinstance(idea_text, str):
            return dict(DEFAULT_DENSITY_FLAGS)

        combined_text = idea_text.strip()
        if resolved_answer and isinstance(resolved_answer, str):
            combined_text += f" {resolved_answer.strip()}"

        if not combined_text:
            return dict(DEFAULT_DENSITY_FLAGS)

        text_lower = combined_text.lower()
        words = text_lower.split()
        word_count = len(words)

        clauses = [c.strip() for c in re.split(r'[.!?;,]+', combined_text) if c.strip()]
        clause_count = len(clauses)

        has_personas = any(bool(re.search(pat, text_lower)) for pat in PERSONA_PATTERNS)
        has_scale = any(bool(re.search(pat, text_lower)) for pat in SCALE_PATTERNS)
        has_sensitivity = any(bool(re.search(pat, text_lower)) for pat in SENSITIVITY_PATTERNS)

        # 1. Personas: 'skip' if persona keywords detected, else 'ask'
        personas = "skip" if has_personas else "ask"

        # 2. NFRs: 'skip' if both scale AND sensitivity detected, else 'ask'
        nfrs = "skip" if (has_scale and has_sensitivity) else "ask"

        # 3. Clarifying Questions:
        # Rule 1: Short/sparse (< 20 words) -> always 'full'
        if word_count < 20:
            clarifying_questions = "full"
        # Rule 3: Dense (>= 35 words and >= 3 clauses)
        elif word_count >= 35 and clause_count >= 3:
            if has_personas and has_scale and has_sensitivity:
                clarifying_questions = "skip"
            elif has_personas or has_scale or has_sensitivity:
                clarifying_questions = "partial"
            else:
                clarifying_questions = "full"
        # Rule 2: Moderate (20 <= word_count < 35)
        else:
            if has_personas or has_scale or has_sensitivity:
                clarifying_questions = "partial"
            else:
                clarifying_questions = "full"

        return {
            "clarifying_questions": clarifying_questions,
            "personas": personas,
            "nfrs": nfrs
        }
    except Exception as e:
        print(f"[Density Check Warning] {e}")
        return dict(DEFAULT_DENSITY_FLAGS)


@app.post("/projects/{project_id}/contradiction-scan")
@app.post("/api/projects/{project_id}/contradiction-scan")
async def scan_project_contradictions(
    project_id: str,
    req: ContradictionScanRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    idea_text = req.idea_text.strip() if req.idea_text else ""
    if not idea_text:
        raise HTTPException(status_code=400, detail="Idea text cannot be empty.")
    if len(idea_text) > 2000:
        raise HTTPException(status_code=400, detail="Idea description exceeds 2,000 characters limit.")

    round_num = req.round if req.round in (1, 2) else 1
    resolved_answer = req.resolved_answer.strip() if req.resolved_answer else None

    system_prompt = """You are an architectural assistant analyzing a software project idea for internal contradictions.
Your task is to look specifically for internal contradictions and logical conflicts between stated requirements in the user's idea text.
Do NOT flag vagueness, broad scope, or missing technical details — only flag genuine logical conflicts where two requirements directly contradict each other (e.g., "offline-first with no servers" combined with "real-time multi-user cloud synchronization", or "no user accounts / no database" combined with "personalized saved user profiles across devices").

Output strictly valid JSON with no markdown formatting:
If no contradiction is found:
{
  "contradiction": false
}

If a genuine contradiction is found:
{
  "contradiction": true,
  "explanation": "<Plain-language description of the conflict>",
  "conflicting_parts": ["<requirement A as stated>", "<requirement B as stated>"]
}"""

    if resolved_answer:
        user_prompt = f"Original Project Idea:\n{idea_text}\n\nUser Resolution / Clarification:\n{resolved_answer}"
    else:
        user_prompt = f"Project Idea:\n{idea_text}"

    repair_prompt = f"Your previous response was malformed or unparseable. Analyze the following idea for internal contradictions and return strictly valid JSON conforming to the schema with contradiction (boolean) and explanation (if true).\n\n{user_prompt}"

    try:
        scan_res = await call_groq_json(system_prompt, user_prompt, retry_user_prompt=repair_prompt)
        if "contradiction" not in scan_res or not isinstance(scan_res.get("contradiction"), bool):
            # Malformed shape: fail-closed, retry once explicitly
            scan_res = await call_groq_json(system_prompt, repair_prompt, retry=False)
            if "contradiction" not in scan_res or not isinstance(scan_res.get("contradiction"), bool):
                raise HTTPException(status_code=502, detail="Contradiction scan failed to return a valid verification shape.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Contradiction Scan Error] {e}")
        raise HTTPException(status_code=502, detail="Contradiction scan service unavailable.") from e

    found = scan_res.get("contradiction", False)
    explanation = scan_res.get("explanation") if found else None
    conflicting_parts = scan_res.get("conflicting_parts") if found else []

    # V3.2 Density Check (pure heuristic, synchronous, zero AI call)
    full_idea_text = f"{idea_text}\n{resolved_answer}" if resolved_answer else idea_text
    density_flags = compute_density_flags(full_idea_text)

    # Persist check record to contradiction_checks table
    if client and not project_id.startswith("local-draft-"):
        try:
            client.table("contradiction_checks").insert({
                "project_id": project_id,
                "round": round_num,
                "found": found,
                "explanation": explanation,
                "conflicting_parts": conflicting_parts,
                "resolved_answer": resolved_answer
            }).execute()
        except Exception as e:
            print(f"[Contradiction Checks DB Warning] {e}")

        # Update project step0_state and density_flags with contradiction resolution outcome
        try:
            step0_state = project.get("step0_state") or {}
            step0_state["last_contradiction_result"] = {
                "found": found,
                "explanation": explanation,
                "conflicting_parts": conflicting_parts,
                "round": round_num,
                "checked_at": datetime.now(timezone.utc).isoformat()
            }
            if round_num >= 2 and found:
                step0_state["contradiction_unresolved"] = True
            elif not found:
                step0_state["contradiction_unresolved"] = False

            client.table("projects").update({
                "step0_state": step0_state,
                "density_flags": density_flags
            }).eq("id", project_id).execute()
        except Exception as e:
            print(f"[Step0 State Contradiction & Density Update Warning] {e}")

    unresolved = bool(round_num >= 2 and found)
    return {
        "status": "ok",
        "contradiction": found,
        "explanation": explanation,
        "conflicting_parts": conflicting_parts,
        "round": round_num,
        "contradiction_unresolved": unresolved,
        "density_flags": density_flags
    }


def check_generation_rate_limit(client, user_id: str, limit_type: str):
    if not client or not user_id:
        return
    try:
        res = client.table("generation_rate_limits").select("*").eq("user_id", user_id).execute()
        now = datetime.now(timezone.utc)
        
        if limit_type == "pipeline":
            max_limit = 5
            window_hours = 24
            col_count = "pipeline_count"
            col_start = "pipeline_window_start"
        else:
            max_limit = 15
            window_hours = 1
            col_count = "batch_count"
            col_start = "batch_window_start"
            
        if res.data:
            row = res.data[0]
            start_str = row.get(col_start)
            window_start = datetime.fromisoformat(start_str.replace("Z", "+00:00")) if start_str else now
            
            if now - window_start < timedelta(hours=window_hours):
                if row.get(col_count, 0) >= max_limit:
                    unit = "day" if limit_type == "pipeline" else "hour"
                    raise HTTPException(
                        status_code=429,
                        detail=f"Limit reached for feature generation ({max_limit} runs per {unit}). Please try again later."
                    )
                client.table("generation_rate_limits").update({col_count: row.get(col_count, 0) + 1}).eq("user_id", user_id).execute()
            else:
                client.table("generation_rate_limits").update({col_count: 1, col_start: now.isoformat()}).eq("user_id", user_id).execute()
        else:
            client.table("generation_rate_limits").insert({
                "user_id": user_id,
                col_count: 1,
                col_start: now.isoformat()
            }).execute()
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Generation Rate Limit Warning] {e}")


@app.post("/projects/{project_id}/generate")
@app.post("/api/projects/{project_id}/generate")
async def generate_feature_pipeline(
    project_id: str,
    req: Optional[GenerateRequest] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    idea_text = (req and req.idea_text) or "Software application"
    fixed_inputs = (req and req.fixed_inputs) or {}
    
    if project.get("status") == "locked_generating":
        raise HTTPException(status_code=429, detail="A generation run is already in progress for this project.")
    if not req or not req.idea_text:
        idea_text = project.get("idea_text") or idea_text
    if not req or not req.fixed_inputs:
        fixed_inputs = project.get("fixed_inputs") or fixed_inputs

    if not idea_text.strip() or idea_text == "Software application":
        raise HTTPException(status_code=400, detail="A classified project idea is required before generation.")
    required_fixed_inputs = ("stack", "database", "deployment", "apis")
    if any(not fixed_inputs.get(key) for key in required_fixed_inputs):
        raise HTTPException(status_code=400, detail="All fixed inputs are required before generation.")

    check_generation_rate_limit(client, user_id, "pipeline")
    client.table("projects").update({"status": "locked_generating"}).eq("id", project_id).execute()

    generation_succeeded = False
    try:
        context_str = f"Project Idea: {idea_text}\nFixed Inputs: {json.dumps(fixed_inputs)}"

        # Step 1: Parallel Independent Drafting (Gemini + Groq)
        system_prompt_draft = """You are an expert AI software architect.
Generate a comprehensive list of 4-6 core technical features specifically tailored for the user's project idea.
Output strictly valid JSON with no markdown formatting:
{
  "idea_objective": "<1-2 sentence synthesized objective statement specifically for this project>",
  "features": [
    {
      "id": "feat-1",
      "name": "<Feature Name>",
      "description": "<One-sentence technical description>",
      "source": "user_originated"
    },
    {
      "id": "feat-2",
      "name": "<Feature Name>",
      "description": "<One-sentence technical description>",
      "source": "ai_added"
    }
  ]
}"""

        try:
            gemini_task = call_gemini_api(system_prompt_draft, context_str)
            groq_task = call_groq_json(system_prompt_draft, context_str)
            gemini_draft, groq_draft = await asyncio.gather(gemini_task, groq_task)
        except Exception as e:
            print(f"[Step 1 Parallel Drafting Error] {e}")
            raise HTTPException(status_code=502, detail="Generation failed, please try again.") from e

        # Step 2: Diff & Merge
        gemini_feats = gemini_draft.get("features", [])
        groq_feats = groq_draft.get("features", [])

        merged_features = list(gemini_feats)
        gemini_names = {f.get("name", "").lower() for f in gemini_feats}

        for idx, gf in enumerate(groq_feats):
            if gf.get("name", "").lower() not in gemini_names:
                gf["source"] = "ai_added"
                gf["id"] = f"feat-{len(merged_features) + 1}"
                merged_features.append(gf)

        system_prompt_val = """You are an architectural validator. Check constraint violations against fixed inputs, scope relevance, and completeness. Output only valid JSON: {\"is_valid\": true, \"flags\": [\"specific reason\"]}."""
        validation_prompt = f"Context:\n{context_str}\n\nFeatures:\n{json.dumps(merged_features)}"
        repair_prompt = f"Your previous validation response was malformed or unparseable. Re-check this plan and return only the required JSON object with is_valid and a flags array.\n\n{validation_prompt}"
        try:
            val1 = await call_groq_json(system_prompt_val, validation_prompt, retry_user_prompt=repair_prompt)
            if "is_valid" not in val1:
                # Bug A1 Fix: missing is_valid is a validation failure, retry with repair prompt
                val1 = await call_groq_json(system_prompt_val, repair_prompt, retry=False)
                if "is_valid" not in val1:
                    raise HTTPException(status_code=502, detail="Generation failed: validation response could not be confirmed.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail="Generation failed, please try again.") from e

        adjusted_flag = bool(not val1["is_valid"] and val1.get("flags"))
        final_features = merged_features
        fix_pass_failed = False
        if adjusted_flag:
            fix_prompt = f"Context:\n{context_str}\n\nCurrent Features:\n{json.dumps(merged_features)}\n\nGroq validation flags:\n{json.dumps(val1.get('flags'))}\n\nFix only the issues identified by those flags and return the complete corrected feature list in the required JSON shape."
            try:
                fix_res = await call_gemini_api(system_prompt_draft, fix_prompt, retry=False)
                final_features = fix_res["features"]
            except Exception as e:
                print(f"[Step 4 Gemini Fix Error] {e}")
                # Bug A2 Fix: keep merged_features fallback but record fix_pass_failed = True
                fix_pass_failed = True
                final_features = merged_features

        final_validation_prompt = f"Context:\n{context_str}\n\nFeatures after the single fix pass:\n{json.dumps(final_features)}"
        final_repair_prompt = f"Your previous final validation response was malformed or unparseable. Return only valid JSON with is_valid and flags.\n\n{final_validation_prompt}"
        try:
            val2 = await call_groq_json(system_prompt_val, final_validation_prompt, retry_user_prompt=final_repair_prompt)
            if "is_valid" not in val2:
                # Fail-closed retry for final validation pass as well
                val2 = await call_groq_json(system_prompt_val, final_repair_prompt, retry=False)
                if "is_valid" not in val2:
                    raise HTTPException(status_code=502, detail="Generation failed: final validation response could not be confirmed.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail="Generation failed, please try again.") from e
        if not val2["is_valid"] and val2.get("flags"):
            adjusted_flag = True

        # Ensure contradiction_unresolved flags adjusted_flag
        step0_state = project.get("step0_state") or {}
        if step0_state.get("contradiction_unresolved"):
            adjusted_flag = True

        generation_payload = {
            "idea_objective": gemini_draft.get("idea_objective") or idea_text,
            "fixed_inputs": fixed_inputs,
            "features": final_features,
            "rejected_feature_ids": [],
            "dependency_order": [f.get("id") for f in final_features if f.get("id")],
            "adjusted_flag": adjusted_flag,
            "fix_pass_failed": fix_pass_failed,
            "generated_at": datetime.now(timezone.utc).isoformat()
        }

        if client and not project_id.startswith("local-draft-"):
            client.table("projects").update({
                "generation_state": generation_payload,
                "status": "reviewing"
            }).eq("id", project_id).execute()

            client.table("plan_history").insert({
                "project_id": project_id,
                "event": "pipeline_generated",
                "note": f"Dual-model features generated ({len(final_features)} features)"
            }).execute()

        generation_succeeded = True
        return {
            "status": "ok",
            "project_id": project_id,
            "generation_state": generation_payload
        }
    finally:
        if client and not project_id.startswith("local-draft-") and not generation_succeeded:
            client.table("projects").update({"status": "generation_failed"}).eq("id", project_id).execute()


@app.post("/projects/{project_id}/comments/batch-fix")
@app.post("/api/projects/{project_id}/comments/batch-fix")
async def process_comment_batch(
    project_id: str,
    req: BatchFixRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    submitted_comments = req.comments or []
    current_features = req.current_features or []
    original_state = None

    if project.get("status") == "locked_generating":
        raise HTTPException(status_code=429, detail="A generation or comment batch is already in progress.")
    if not current_features:
        current_state = project.get("generation_state") or {}
        original_state = current_state
        current_features = current_state.get("features", [])
    else:
        original_state = project.get("generation_state") or {}

    check_generation_rate_limit(client, user_id, "batch")
    client.table("projects").update({"status": "locked_generating"}).eq("id", project_id).execute()

    # Fetch pending DB comments if not passed in req
    if not submitted_comments:
        comm_res = client.table("comments").select("*").eq("project_id", project_id).eq("status", "pending").execute()
        submitted_comments = comm_res.data or []

    try:
        if not submitted_comments:
            return {"status": "ok", "message": "No pending comments to process."}

        comment_ids = [c.get("id") for c in submitted_comments if c.get("id")]
        if comment_ids:
            client.table("comments").update({"status": "submitted"}).in_("id", comment_ids).eq("status", "pending").execute()

        # Gemini Batch Fix Pass
        system_prompt = """You are an AI software architect updating a project feature list based on user review comments.
Modify, add, or refine the features list according to the user comments.
Output strictly valid JSON with no markdown formatting:
{
  "features": [
    {
      "id": "feat-1",
      "name": "<Feature Name>",
      "description": "<One-sentence technical description>",
      "source": "user_originated" | "ai_added"
    }
  ]
}"""

        comments_text = "\n".join([f"- Comment on {c.get('target_feature_id', 'general')}: {c.get('text')}" for c in submitted_comments])
        
        try:
            fix_res = await call_gemini_api(system_prompt, f"Current Features:\n{json.dumps(current_features)}\n\nUser Comments:\n{comments_text}")
            updated_features = fix_res["features"]
        except Exception as e:
            print(f"[Batch Fix Gemini Error] {e}")
            raise HTTPException(status_code=502, detail="Failed to process your comments, please try again.") from e

        generation_payload = {
            "features": updated_features,
            "adjusted_flag": False
        }

        curr_state = project.get("generation_state") or {}
        curr_state["features"] = updated_features
        generation_payload = curr_state
        client.table("projects").update({"generation_state": curr_state, "status": "reviewing"}).eq("id", project_id).execute()

        if comment_ids:
            try:
                client.table("comments").update({"status": "resolved"}).in_("id", comment_ids).eq("status", "submitted").execute()
            except Exception:
                if original_state is not None:
                    client.table("projects").update({"generation_state": original_state}).eq("id", project_id).execute()
                raise HTTPException(status_code=502, detail="Failed to process your comments, please try again.")

        return {"status": "ok", "generation_state": generation_payload}
    finally:
        client.table("projects").update({"status": "reviewing"}).eq("id", project_id).execute()


@app.post("/projects/{project_id}/features/{feature_id}/reject")
@app.post("/api/projects/{project_id}/features/{feature_id}/reject")
async def reject_feature(
    project_id: str,
    feature_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    gen_state = project.get("generation_state") or {}
    features = gen_state.get("features", [])
    rejected = set(gen_state.get("rejected_feature_ids", []))

    # Reject toggle logic
    if feature_id in rejected:
        rejected.remove(feature_id)
    else:
        # Check Minimum 1 active feature guard
        active_count = sum(1 for f in features if f.get("id") not in rejected and f.get("id") != feature_id)
        if active_count < 1:
            raise HTTPException(status_code=400, detail="Cannot reject feature: plan requires at least 1 active feature remaining.")
        rejected.add(feature_id)

    gen_state["rejected_feature_ids"] = list(rejected)
    client.table("projects").update({"generation_state": gen_state}).eq("id", project_id).execute()

    return {"status": "ok", "rejected_feature_ids": list(rejected)}


@app.post("/projects/{project_id}/dependency-order")
@app.post("/api/projects/{project_id}/dependency-order")
async def generate_dependency_order(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    gen_state = project.get("generation_state") or {}
    features = gen_state.get("features", [])
    rejected = set(gen_state.get("rejected_feature_ids", []))

    active_features = [f for f in features if f.get("id") not in rejected]
    if not active_features:
        raise HTTPException(status_code=400, detail="No active features to order.")

    system_prompt = """You are a software dependency analyzer.
Order the given active features by topological build dependency (features with no dependencies first, dependent features later).
Output strictly valid JSON:
{
  "dependency_order": ["<feature-id-1>", "<feature-id-2>", ...]
}"""

    try:
        order_res = await call_gemini_api(system_prompt, f"Active Features:\n{json.dumps(active_features)}")
        proposed_order = order_res.get("dependency_order", [])

        # Validate with Groq
        val_prompt = """Check if the proposed feature order has circular dependencies or missing items. Output JSON: {"is_valid": true|false}"""
        val_res = await call_groq_json(val_prompt, f"Features:\n{json.dumps(active_features)}\n\nOrder:\n{json.dumps(proposed_order)}")

        if not val_res.get("is_valid", True):
            # Single Fix Pass for circular dependencies
            fix_res = await call_gemini_api(system_prompt, f"Fix circular dependencies for Features:\n{json.dumps(active_features)}")
            proposed_order = fix_res.get("dependency_order") or [f.get("id") for f in active_features]
            gen_state["adjusted_flag"] = True

        gen_state["dependency_order"] = proposed_order
        client.table("projects").update({"generation_state": gen_state, "status": "accepted"}).eq("id", project_id).execute()

        return {"status": "ok", "dependency_order": proposed_order}
    except Exception as e:
        print(f"[Dependency Order Fallback] {e}")
        # Default fallback order: order features appear in list
        default_order = [f.get("id") for f in active_features if f.get("id")]
        gen_state["dependency_order"] = default_order
        gen_state["adjusted_flag"] = True
        client.table("projects").update({"generation_state": gen_state, "status": "accepted"}).eq("id", project_id).execute()
        return {"status": "ok", "dependency_order": default_order}


@app.get("/projects/{project_id}/comments")
@app.get("/api/projects/{project_id}/comments")
async def get_project_comments(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    get_owned_project(client, user_id, project_id)

    res = client.table("comments").select("*").eq("project_id", project_id).order("created_at", desc=False).execute()
    return {"comments": res.data or []}


@app.post("/projects/{project_id}/comments")
@app.post("/api/projects/{project_id}/comments")
async def add_project_comment(
    project_id: str,
    req: CommentCreateRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    get_owned_project(client, user_id, project_id)

    res = client.table("comments").insert({
        "project_id": project_id,
        "stage": req.stage or "features",
        "target_feature_id": req.target_feature_id,
        "text": req.text,
        "status": "pending"
    }).execute()

    return res.data[0] if res.data else {"status": "created"}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)


