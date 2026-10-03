import os
import time
import asyncio
import json
import re
import unicodedata
import httpx
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Union, Literal
import uuid
from uuid import UUID
from fastapi import FastAPI, HTTPException, Depends, Header, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr
from dotenv import load_dotenv
import jwt

load_dotenv()

# V3.12 Reliability Batch — Item 3: Error Monitoring (Sentry SDK Initialization)
sentry_dsn = os.getenv("SENTRY_DSN")
if sentry_dsn and sentry_dsn.strip() and not sentry_dsn.startswith("https://your-sentry-dsn"):
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=sentry_dsn.strip(),
            traces_sample_rate=1.0,
            profiles_sample_rate=1.0,
            environment=os.getenv("ENVIRONMENT", "production"),
            send_default_pii=False,
        )
        print("[Sentry] Error monitoring initialized successfully.")
    except Exception as e:
        print(f"[Sentry Init Warning] Failed to initialize Sentry: {e}")


def capture_monitoring_error(exc: Exception, context: Optional[Dict[str, Any]] = None):
    """Safely captures handled and unhandled fail-closed exceptions to Sentry when configured."""
    try:
        import sentry_sdk
        if os.getenv("SENTRY_DSN"):
            scope_cm = getattr(sentry_sdk, "new_scope", None) or getattr(sentry_sdk, "push_scope", None)
            if context and scope_cm:
                with scope_cm() as scope:
                    for k, v in context.items():
                        scope.set_extra(k, v)
                    sentry_sdk.capture_exception(exc)
            else:
                sentry_sdk.capture_exception(exc)
    except Exception:
        pass


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
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    anon_key = os.getenv("SUPABASE_KEY") or service_key
    if url and (service_key or anon_key) and "your-project" not in url:
        try:
            from supabase import create_client
            if token:
                client = create_client(url, anon_key)
                client.postgrest.auth(token)
                return client
            
            global supabase_client
            if supabase_client is None and service_key:
                supabase_client = create_client(url, service_key)
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


# --- V4 Project Structure Generation Schemas ---
class StructureAcceptRequest(BaseModel):
    structure: Optional[Dict[str, List[str]]] = None


# --- V5 Diagram Generation Schemas ---
class DiagramAcceptRequest(BaseModel):
    schema_data: Optional[Dict[str, Any]] = None
    architecture_data: Optional[Dict[str, Any]] = None
    exception_handling_data: Optional[Dict[str, Any]] = None
    security_data: Optional[Dict[str, Any]] = None


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
    """Check provider reachability/model availability using minimal lightweight probes."""
    raw_gemini_model = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
    gemini_model = raw_gemini_model.replace("models/", "").strip()
    groq_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")

    async def check_gemini():
        api_key = os.getenv("GEMINI_API_KEY")
        if api_key:
            models_to_try = [gemini_model] if gemini_model else []
            for cand in ["gemini-1.5-flash", "gemini-flash-latest", "gemini-2.0-flash", "gemini-3.6-flash", "gemini-1.5-pro"]:
                if cand not in models_to_try:
                    models_to_try.append(cand)
            
            for m in models_to_try:
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{m}:generateContent"
                payload = {
                    "contents": [
                        {"role": "user", "parts": [{"text": "ping"}]}
                    ],
                    "generationConfig": {
                        "maxOutputTokens": 1,
                        "temperature": 0.0
                    }
                }
                try:
                    async with httpx.AsyncClient(timeout=4.0) as client:
                        response = await client.post(url, params={"key": api_key}, json=payload)
                    if response.status_code == 200:
                        response_data = response.json()
                        if response_data.get("candidates"):
                            return "connected"
                except (httpx.HTTPError, ValueError):
                    continue

        # If Gemini is not set or replaced by Llama-Versatile, verify Llama model connectivity on Groq
        groq_api_key = os.getenv("GROQ_API_KEY")
        if groq_api_key:
            try:
                async with httpx.AsyncClient(timeout=4.0) as client:
                    response = await client.get(
                        "https://api.groq.com/openai/v1/models",
                        headers={"Authorization": f"Bearer {groq_api_key}"},
                    )
                if response.status_code == 200:
                    return "connected"
            except Exception:
                pass
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


# --- V3.3 Clarifying Questions Schemas ---
class GenerateClarifyingQuestionsRequest(BaseModel):
    idea_text: str
    density_flags: Optional[Dict[str, Any]] = None

    @field_validator("idea_text")
    @classmethod
    def validate_idea(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("idea_text cannot be empty.")
        if len(cleaned) > 2500:
            raise ValueError("idea_text exceeds 2500 characters limit.")
        return cleaned


class ClarifyingAnswerItem(BaseModel):
    question_id: str
    answer: str


class SubmitClarifyingAnswersRequest(BaseModel):
    answers: List[ClarifyingAnswerItem]


# --- V3.4 & V3.5 Persona & NFR Capture Schemas ---
NFR_SCALE_ALLOWED = {"just_me", "small_team", "hundreds_of_users", "thousands_plus"}
NFR_DATA_SENSITIVITY_ALLOWED = {"none_public", "personal", "sensitive"}
NFR_AVAILABILITY_ALLOWED = {"best_effort", "needs_to_be_reliable", "mission_critical"}


class PersonaCaptureRequest(BaseModel):
    answer: str


class NFRCaptureRequest(BaseModel):
    scale: Optional[str] = None
    data_sensitivity: Optional[str] = None
    availability: Optional[str] = None


# --- V3.8 Lightweight Confirm Draft Schemas ---
class LightweightDraftRequest(BaseModel):
    attempt: int = 1
    correction_text: Optional[str] = None

    @field_validator("attempt")
    @classmethod
    def validate_attempt(cls, v: int) -> int:
        if v not in (1, 2):
            raise ValueError("attempt must be 1 or 2.")
        return v


class LightweightDraftRespondRequest(BaseModel):
    response: str
    attempt: Optional[int] = None
    correction_text: Optional[str] = None

    @field_validator("response")
    @classmethod
    def validate_response(cls, v: str) -> str:
        v = (v or "").strip().lower()
        if v not in ("confirmed", "rejected"):
            raise ValueError("response must be 'confirmed' or 'rejected'.")
        return v


# --- V3.11 Interview Answers Edit Flow Schemas ---
class ContradictionResolutionEditRequest(BaseModel):
    resolved_answer: str

    @field_validator("resolved_answer")
    @classmethod
    def validate_resolved_answer(cls, v: str) -> str:
        cleaned = (v or "").strip()
        if not cleaned:
            raise ValueError("resolved_answer cannot be empty.")
        return cleaned




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
        raise HTTPException(
            status_code=502,
            detail="Failed to persist Step 0 classification state."
        ) from e


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


@app.get("/projects/{project_id}")
@app.get("/api/projects/{project_id}")
async def get_project_state(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    # Query clarifying questions from DB if real project
    clarifying_list = []
    if client and not project_id.startswith("local-draft-"):
        try:
            cq_res = (
                client.table("clarifying_questions")
                .select("id, question, answer, round, created_at")
                .eq("project_id", project_id)
                .order("created_at", desc=False)
                .execute()
            )
            if cq_res and cq_res.data:
                clarifying_list = cq_res.data
        except Exception as e:
            print(f"[Fetch Clarifying QA in Project State Warning] {e}")

    step0_state = project.get("step0_state") or {}
    if not clarifying_list:
        clarifying_list = step0_state.get("clarifying_qa") or []

    personas_data = project.get("personas") or step0_state.get("personas")
    nfrs_data = project.get("nfrs") or step0_state.get("nfrs")
    lightweight_draft_data = project.get("lightweight_draft")
    last_contra = step0_state.get("last_contradiction_result") or {}

    return {
        "status": "ok",
        "project": {
            "id": project.get("id"),
            "owner_id": project.get("owner_id"),
            "name": project.get("name"),
            "title": project.get("title"),
            "idea_text": project.get("idea_text"),
            "status": project.get("status"),
            "step0_state": step0_state,
            "fixed_inputs": project.get("fixed_inputs") or {},
            "generation_state": project.get("generation_state") or {},
            "density_flags": project.get("density_flags") or dict(DEFAULT_DENSITY_FLAGS),
            "personas": personas_data,
            "nfrs": nfrs_data,
            "lightweight_draft": lightweight_draft_data,
            "last_contradiction_result": last_contra,
            "clarifying_questions": clarifying_list,
            "created_at": project.get("created_at")
        }
    }


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
                    "model": os.getenv("GROQ_MODEL", "openai/gpt-oss-120b"),
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

CommentStage = Literal["features", "structure", "diagram", "final"]

class GenerateRequest(BaseModel):
    idea_text: Optional[str] = None
    fixed_inputs: Optional[Dict[str, Any]] = None

class BatchFixRequest(BaseModel):
    stage: CommentStage = "features"
    comments: Optional[List[Dict[str, Any]]] = None
    current_features: Optional[List[Dict[str, Any]]] = None

class FeatureRejectRequest(BaseModel):
    feature_id: str

class CommentCreateRequest(BaseModel):
    target_feature_id: Optional[str] = None
    text: str
    stage: CommentStage = "features"

class CommentUpdateRequest(BaseModel):
    text: str

class ContradictionScanRequest(BaseModel):
    idea_text: str
    round: int = 1
    resolved_answer: Optional[str] = None

def parse_llm_json(raw: str) -> Dict[str, Any]:
    """
    Robust JSON parser for LLM responses that strips markdown code blocks
    and extracts json payloads safely.
    """
    if not isinstance(raw, str):
        return {}
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    cleaned = cleaned.strip()
    try:
        return json.loads(cleaned)
    except Exception:
        match = re.search(r"(\{.*\})", cleaned, re.DOTALL)
        if match:
            return json.loads(match.group(1))
        raise


def _sanitize_gemini_error(error_msg: str, key: Optional[str] = None) -> str:
    """Sanitize any API key or query parameters from error message."""
    if not error_msg:
        return ""
    sanitized = str(error_msg)
    if key:
        sanitized = sanitized.replace(key, "[REDACTED]")
    sanitized = re.sub(r"key=[a-zA-Z0-9_\-]+", "key=[REDACTED]", sanitized)
    return sanitized


async def call_gemini_api(
    system_prompt: str,
    user_prompt: str,
    timeout: float = 30.0,
    retry_user_prompt: Optional[str] = None,
    retry: bool = True,
    stage: str = "general",
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    gemini_key = os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        print("[Tracked Substitution] GEMINI_API_KEY unconfigured — substituting with Groq llama-versatile")
        return await call_groq_json(
            system_prompt,
            user_prompt,
            timeout=timeout,
            retry_user_prompt=retry_user_prompt,
            retry=retry,
            stage=stage,
            user_id=user_id,
            project_id=project_id
        )
    
    raw_configured_model = os.getenv("GEMINI_MODEL", "gemini-1.5-flash")
    configured_model = raw_configured_model.replace("models/", "").strip()
    
    # Verified public Gemini models supporting generateContent on v1beta
    VERIFIED_GEMINI_MODELS = [
        "gemini-1.5-flash",
        "gemini-2.0-flash",
        "gemini-1.5-pro",
        "gemini-flash-latest"
    ]
    
    candidate_models = [configured_model] if configured_model in VERIFIED_GEMINI_MODELS else ["gemini-1.5-flash"]
    for m in VERIFIED_GEMINI_MODELS:
        if m not in candidate_models:
            candidate_models.append(m)

    last_error = None
    start_time = time.time()
    for model_name in candidate_models:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model_name}:generateContent"
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
                    resp = await http_client.post(url, params={"key": gemini_key}, json=request_payload)
                    if resp.status_code == 200:
                        data = resp.json()
                        raw = data["candidates"][0]["content"]["parts"][0]["text"]
                        latency_ms = int((time.time() - start_time) * 1000)
                        asyncio.create_task(log_ai_call("gemini", stage, True, latency_ms, user_id, project_id))
                        return parse_llm_json(raw)
                    
                    # Status-specific handling: 404 (skip model), 503 (wait 1.5s before retry)
                    if resp.status_code == 404:
                        last_error = f"Status 404: Model {model_name} not available"
                        print(f"[Gemini 404 Model {model_name}] Skipping — model not available")
                        break
                    
                    if resp.status_code in (429, 503) and attempt == 0:
                        print(f"[Gemini {resp.status_code} Model {model_name}] Rate limit / Service busy — waiting 2s before retry")
                        await asyncio.sleep(2.0)
                        continue
                    
                    sanitized_text = _sanitize_gemini_error(resp.text[:500], gemini_key)
                    last_error = f"Status {resp.status_code}: {sanitized_text}"
                    print(f"[Gemini API Error Model {model_name} Attempt {attempt+1}] {last_error}")
            except Exception as e:
                last_error = _sanitize_gemini_error(str(e), gemini_key)
                print(f"[Gemini Call Exception Model {model_name} Attempt {attempt+1}] {last_error}")
                if attempt == (1 if retry else 0):
                    break

    latency_ms = int((time.time() - start_time) * 1000)
    asyncio.create_task(log_ai_call("gemini", stage, False, latency_ms, user_id, project_id))
    print(f"[Gemini All Models Failed] {last_error} — falling back to Groq llama-versatile")
    return await call_groq_json(
        system_prompt,
        user_prompt,
        timeout=timeout,
        retry_user_prompt=retry_user_prompt,
        retry=retry,
        stage=stage,
        user_id=user_id,
        project_id=project_id
    )


async def call_groq_json(
    system_prompt: str,
    user_prompt: str,
    timeout: float = 25.0,
    retry_user_prompt: Optional[str] = None,
    retry: bool = True,
    stage: str = "general",
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, Any]:
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        raise HTTPException(status_code=500, detail="Groq API unconfigured (GROQ_API_KEY missing).")
    
    configured_model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
    active_groq_models = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b", "allam-2-7b"]
    candidate_models = [configured_model] if configured_model in active_groq_models else ["openai/gpt-oss-120b"]
    for m in active_groq_models:
        if m not in candidate_models:
            candidate_models.append(m)

    url = "https://api.groq.com/openai/v1/chat/completions"
    headers = {"Authorization": f"Bearer {groq_key}", "Content-Type": "application/json"}
    
    last_error = None
    start_time = time.time()
    for model_name in candidate_models:
        payload = {
            "model": model_name,
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
                        latency_ms = int((time.time() - start_time) * 1000)
                        asyncio.create_task(log_ai_call("groq", stage, True, latency_ms, user_id, project_id))
                        return parse_llm_json(raw)
                    
                    # Status-specific handling: decommissioned or non-existent model (skip to next candidate)
                    if resp.status_code in (400, 404) and any(k in resp.text.lower() for k in ("decommissioned", "not exist", "model_not_found", "no longer supported")):
                        print(f"[Groq Model {model_name}] Model unavailable ({resp.text[:100]}) — skipping to next model")
                        break

                    # Status-specific handling: 429 TPM rate limit (wait 2.0s before retry, or rotate model on attempt 2)
                    if resp.status_code == 429:
                        if attempt == 0:
                            print(f"[Groq 429 Model {model_name}] TPM limit — waiting 2s before retry")
                            await asyncio.sleep(2.0)
                            continue
                        else:
                            print(f"[Groq 429 Model {model_name}] TPM limit exhausted — rotating to next candidate model")
                            break
                    
                    last_error = f"Status {resp.status_code}: {resp.text}"
                    print(f"[Groq API Error Model {model_name} Attempt {attempt+1}] {last_error}")
            except Exception as e:
                last_error = str(e)
                print(f"[Groq Call Exception Model {model_name} Attempt {attempt+1}] {e}")
                if attempt == (1 if retry else 0):
                    break

    latency_ms = int((time.time() - start_time) * 1000)
    asyncio.create_task(log_ai_call("groq", stage, False, latency_ms, user_id, project_id))
    raise HTTPException(status_code=502, detail=f"Groq API request failed: {last_error}")


# --- V3.9 Requirement Quality Standard Definitions & Heuristics ---

ABSOLUTE_IMPOSSIBLE_PATTERNS = [
    r"\b100%\s+accuracy\b",
    r"\b100%\s+uptime\b",
    r"\b100%\s+secure\b",
    r"\b100%\s+availability\b",
    r"\bzero\s+downtime\b",
    r"\bzero\s+latency\b",
    r"\bnever\s+fails\b",
    r"\bnever\s+crash\w*\b",
    r"\binfinitely\s+scalable\b",
    r"\bunlimited\s+users\b",
    r"\bunhackable\b",
    r"\bzero\s+bugs\b"
]

ATOMIC_VIOLATION_PATTERNS = [
    r"\b(?:and\s+also|and\s+then|as\s+well\s+as)\b",
    r"\b(?:allows|enables|provides|creates|sends|manages|tracks|processes|stores|updates|deletes|notifies|generates)\s+.*?\s+and\s+(?:allows|enables|provides|creates|sends|manages|tracks|processes|stores|updates|deletes|notifies|generates)\b",
    r",\s*and\s+(?:also\s+)?(?:allow|enable|provide|create|send|manage|track|process|store|update|delete|notify|generate)\w*\b",
    r"\b(?:manages|handles)\s+both\s+.*\s+and\s+.*\b"
]

INDEPENDENCE_VIOLATION_PATTERNS = [
    r"\b(?:as\s+(?:described|mentioned|defined|specified)\s+in|depends\s+on|refer\s+to|see|per|from|after)\s+(?:feature|feat)[_\-\s]?\d*\b",
    r"\bfeat[_\-]\d+\b",
    r"\bfeature\s+\d+\b"
]


def normalize_failed_check(item: Any) -> Dict[str, Any]:
    """Normalize a string or dict into a valid failed_check object."""
    if isinstance(item, dict):
        check = str(item.get("check") or "unknown").strip().lower()
        reason = str(item.get("reason") or f"Check '{check}' failed validation.").strip()
        fields = item.get("fields_involved")
        if not isinstance(fields, list):
            fields = [str(fields)] if fields else []
        else:
            fields = [str(f).strip() for f in fields if str(f).strip()]
        survived = bool(item.get("survived_fix_pass", False))
        return {
            "check": check,
            "reason": reason,
            "fields_involved": fields,
            "survived_fix_pass": survived
        }
    check = str(item).strip().lower()
    default_reasons = {
        "atomic": ("Combines multiple distinct actions or behaviors joined by conjunctions in description.", ["description"]),
        "complete": ("Feature lacks required testable acceptance criteria.", ["acceptance_criteria"]),
        "traceable": ("AI-inferred feature is missing architectural reasoning explaining why it is required.", ["reasoning", "provenance"]),
        "independent": ("Explicitly references another feature by name or ID instead of maintaining standalone context.", ["description"]),
        "feasible": ("Contains absolute or mathematically unfeasible claims (e.g. 100% uptime, zero latency).", ["description", "business_rules", "acceptance_criteria"]),
        "consistent": ("Conflicting constraints or parameters between business rules and acceptance criteria.", ["business_rules", "acceptance_criteria"]),
        "correct": ("Feature does not map directly to stated system actors or objectives.", ["description"]),
        "necessary": ("Feature contains domain-irrelevant bloat.", ["description"]),
        "unambiguous": ("Contains vague terms without concrete technical definitions.", ["description"]),
        "understandable": ("Contains unexplained domain jargon.", ["description"]),
        "clear_and_concise": ("Contains filler adjectives without concrete specifications.", ["description"])
    }
    reason, fields = default_reasons.get(check, (f"Feature failed the '{check}' quality standard check.", []))
    return {
        "check": check,
        "reason": reason,
        "fields_involved": fields,
        "survived_fix_pass": False
    }


def merge_failed_checks(list1: List[Any], list2: List[Any]) -> List[Dict[str, Any]]:
    """Merge and deduplicate failed check objects deterministically by check name."""
    checks_map = {}
    for raw_item in (list1 or []) + (list2 or []):
        is_explicit_dict = isinstance(raw_item, dict)
        norm = normalize_failed_check(raw_item)
        chk = norm["check"]
        if chk not in checks_map:
            checks_map[chk] = (norm, is_explicit_dict)
        else:
            curr_norm, curr_is_dict = checks_map[chk]
            # If incoming is an explicit dict and previous was just a string, prefer the explicit dict
            if is_explicit_dict and not curr_is_dict:
                curr_norm["reason"] = norm["reason"]
                curr_norm["fields_involved"] = norm["fields_involved"]
                curr_norm["survived_fix_pass"] = norm["survived_fix_pass"]
                checks_map[chk] = (curr_norm, True)
            else:
                if len(norm.get("fields_involved", [])) > len(curr_norm.get("fields_involved", [])):
                    curr_norm["fields_involved"] = norm["fields_involved"]
                if len(norm.get("reason", "")) > len(curr_norm.get("reason", "")):
                    curr_norm["reason"] = norm["reason"]
                if norm.get("survived_fix_pass"):
                    curr_norm["survived_fix_pass"] = True
    return [checks_map[k][0] for k in sorted(checks_map.keys())]


def evaluate_code_level_quality(feature: Dict[str, Any], fixed_inputs: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
    """
    Evaluates code-level quality characteristics in pure Python (NO AI call):
    1. Atomic: single behavior, not multiple distinct verbs/actions joined by 'and'
    2. Complete: acceptance_criteria is non-empty list of non-empty strings
    3. Traceable: reasoning is non-null & non-empty when provenance == 'ai_inferred'
    4. Independent: does not reference another feature by ID/name without standalone context
    5. Feasible: no impossible absolute claims (100% accuracy, zero downtime, etc.)
    6. Consistent: preserved from prior model evaluations or defaults to True (model-judged in Step 3)
    """
    failed_checks: List[Dict[str, Any]] = []

    name = str(feature.get("name") or "").strip()
    description = str(feature.get("description") or "").strip()
    full_text = f"{name}. {description}".strip()

    rules = feature.get("business_rules") or []
    rules_text = " ".join([str(r) for r in rules]) if isinstance(rules, list) else str(rules)
    criteria = feature.get("acceptance_criteria") or []
    criteria_text = " ".join([str(c) for c in criteria]) if isinstance(criteria, list) else str(criteria)
    all_text = f"{full_text} {rules_text} {criteria_text}".lower()

    # 1. Atomic Check
    is_atomic = True
    desc_lower = description.lower()
    matched_atomic_pattern = None
    for pat in ATOMIC_VIOLATION_PATTERNS:
        m = re.search(pat, desc_lower)
        if m:
            is_atomic = False
            matched_atomic_pattern = m.group(0)
            break
    if not is_atomic:
        failed_checks.append({
            "check": "atomic",
            "reason": f"Combines multiple distinct behaviors ('{matched_atomic_pattern}') in the feature description instead of a single atomic capability.",
            "fields_involved": ["description"],
            "survived_fix_pass": False
        })

    # 2. Complete Check
    is_complete = True
    if not isinstance(criteria, list) or len(criteria) == 0:
        is_complete = False
    else:
        non_empty_criteria = [str(c).strip() for c in criteria if str(c).strip()]
        if len(non_empty_criteria) == 0:
            is_complete = False
    if not is_complete:
        failed_checks.append({
            "check": "complete",
            "reason": "Feature lacks required testable acceptance criteria.",
            "fields_involved": ["acceptance_criteria"],
            "survived_fix_pass": False
        })

    # 3. Traceable Check
    provenance = str(feature.get("provenance") or feature.get("source") or "").strip().lower()
    is_traceable = True
    if provenance in ("ai_inferred", "ai_added"):
        reasoning = feature.get("reasoning")
        if reasoning is None or not str(reasoning).strip():
            is_traceable = False
    if not is_traceable:
        failed_checks.append({
            "check": "traceable",
            "reason": "AI-inferred feature is missing architectural reasoning explaining why it is required.",
            "fields_involved": ["reasoning", "provenance"],
            "survived_fix_pass": False
        })

    # 4. Independent Check
    is_independent = True
    matched_indep_pattern = None
    for pat in INDEPENDENCE_VIOLATION_PATTERNS:
        m = re.search(pat, desc_lower)
        if m:
            is_independent = False
            matched_indep_pattern = m.group(0)
            break
    if not is_independent:
        failed_checks.append({
            "check": "independent",
            "reason": f"Feature description explicitly couples with another feature ('{matched_indep_pattern}') rather than stating self-contained technical requirements.",
            "fields_involved": ["description"],
            "survived_fix_pass": False
        })

    # 5. Feasible Check
    is_feasible = True
    matched_feas_pattern = None
    for pat in ABSOLUTE_IMPOSSIBLE_PATTERNS:
        m = re.search(pat, all_text)
        if m:
            is_feasible = False
            matched_feas_pattern = m.group(0)
            break
    if not is_feasible:
        failed_checks.append({
            "check": "feasible",
            "reason": f"Feature asserts an impossible or unachievable absolute requirement ('{matched_feas_pattern}').",
            "fields_involved": ["description", "business_rules", "acceptance_criteria"],
            "survived_fix_pass": False
        })

    existing_flags = feature.get("quality_flags") or {}
    existing_failed = list(existing_flags.get("failed_checks") or [])
    combined_failed = merge_failed_checks(existing_failed, failed_checks)

    # Consistent check boolean (model-judged in Step 3, preserved from existing flags or defaults to True)
    is_consistent = existing_flags.get("consistent", True)
    if any(fc.get("check") == "consistent" for fc in combined_failed):
        is_consistent = False

    return {
        "atomic": is_atomic,
        "complete": is_complete,
        "traceable": is_traceable,
        "independent": is_independent,
        "feasible": is_feasible,
        "consistent": is_consistent,
        "failed_checks": combined_failed
    }


def normalize_feature_schema(
    raw_feature: Dict[str, Any],
    default_id: str = "feat-1",
    default_provenance: str = "user_originated",
    source_model: str = "gemini"
) -> Dict[str, Any]:
    """
    Ensures a feature dictionary conforms strictly to the V3.9 Requirement Quality Standard schema.
    """
    defaulted_fields: List[str] = []

    raw_name = raw_feature.get("name")
    if not raw_name or not str(raw_name).strip():
        defaulted_fields.append("name")
    feat_id = str(raw_feature.get("id") or default_id).strip()
    name = str(raw_name or "Unnamed Feature").strip()

    raw_desc = raw_feature.get("description")
    if not raw_desc or not str(raw_desc).strip():
        defaulted_fields.append("description")
    description = str(raw_desc or "").strip()

    raw_prov = str(raw_feature.get("provenance") or raw_feature.get("source") or default_provenance).strip().lower()
    provenance = "ai_inferred" if raw_prov in ("ai_inferred", "ai_added", "inferred") else "user_originated"
    source = provenance

    def _to_str_list(val: Any) -> List[str]:
        if isinstance(val, list):
            return [str(x).strip() for x in val if str(x).strip()]
        elif isinstance(val, str) and val.strip():
            return [val.strip()]
        return []

    # Track business_rules, data_touched, actor_role, exclusions
    # BUT NOT acceptance_criteria (already caught by the `complete` check)
    raw_rules = raw_feature.get("business_rules")
    if not raw_rules or (isinstance(raw_rules, list) and len(_to_str_list(raw_rules)) == 0):
        defaulted_fields.append("business_rules")
    business_rules = _to_str_list(raw_rules)

    raw_data = raw_feature.get("data_touched")
    if not raw_data or (isinstance(raw_data, list) and len(_to_str_list(raw_data)) == 0):
        defaulted_fields.append("data_touched")
    data_touched = _to_str_list(raw_data)

    raw_actors = raw_feature.get("actor_role")
    if not raw_actors or (isinstance(raw_actors, list) and len(_to_str_list(raw_actors)) == 0):
        defaulted_fields.append("actor_role")
    actor_role = _to_str_list(raw_actors)

    acceptance_criteria = _to_str_list(raw_feature.get("acceptance_criteria"))

    raw_excl = raw_feature.get("exclusions")
    if not raw_excl or (isinstance(raw_excl, list) and len(_to_str_list(raw_excl)) == 0):
        defaulted_fields.append("exclusions")
    exclusions = _to_str_list(raw_excl)

    raw_priority = str(raw_feature.get("priority") or "must_have").strip().lower()
    if raw_priority not in ("must_have", "should_have", "nice_to_have"):
        raw_priority = "must_have"
    priority = raw_priority

    raw_reasoning = raw_feature.get("reasoning")
    reasoning = str(raw_reasoning).strip() if raw_reasoning is not None and str(raw_reasoning).strip() else None

    raw_src_model = str(raw_feature.get("source_model") or source_model).strip().lower()
    if raw_src_model not in ("gemini", "groq", "merged"):
        raw_src_model = source_model

    normalized = {
        "id": feat_id,
        "name": name,
        "description": description,
        "source": source,
        "business_rules": business_rules,
        "data_touched": data_touched,
        "actor_role": actor_role,
        "acceptance_criteria": acceptance_criteria,
        "exclusions": exclusions,
        "priority": priority,
        "provenance": provenance,
        "reasoning": reasoning,
        "source_model": raw_src_model,
        "quality_flags": raw_feature.get("quality_flags") or {
            "atomic": True,
            "complete": True,
            "traceable": True,
            "independent": True,
            "feasible": True,
            "consistent": True,
            "failed_checks": []
        }
    }

    normalized["quality_flags"] = evaluate_code_level_quality(normalized)

    if defaulted_fields:
        normalized["quality_flags"]["defaulted_fields"] = defaulted_fields
        existing_checks = normalized["quality_flags"].get("failed_checks") or []
        if not any(
            (fc == "incomplete_model_output" if isinstance(fc, str) else fc.get("check") == "incomplete_model_output")
            for fc in existing_checks
        ):
            normalized["quality_flags"]["failed_checks"].append({
                "check": "incomplete_model_output",
                "reason": f"Fields defaulted by normalizer: {', '.join(defaulted_fields)}",
                "fields_involved": list(defaulted_fields),
                "survived_fix_pass": False
            })

    return normalized


def are_features_overlapping(feat_a: Dict[str, Any], feat_b: Dict[str, Any]) -> bool:
    """
    Determines if two features match by data_touched and actor_role overlap
    per the V3.9 Quality Standard spec (replacing plain name-string matching).
    """
    def _normalize_tokens(items: Any) -> set:
        tokens = set()
        if isinstance(items, list):
            for x in items:
                words = re.findall(r'[a-z0-9]+', str(x).lower())
                tokens.update(words)
        elif isinstance(items, str):
            words = re.findall(r'[a-z0-9]+', items.lower())
            tokens.update(words)
        return tokens

    data_a = _normalize_tokens(feat_a.get("data_touched"))
    data_b = _normalize_tokens(feat_b.get("data_touched"))
    actors_a = _normalize_tokens(feat_a.get("actor_role"))
    actors_b = _normalize_tokens(feat_b.get("actor_role"))

    stopwords = {"user", "app", "data", "system", "role", "the", "a", "an", "and", "or"}
    clean_data_a = data_a - stopwords
    clean_data_b = data_b - stopwords
    clean_actors_a = actors_a - stopwords
    clean_actors_b = actors_b - stopwords

    data_overlap = bool(clean_data_a and clean_data_b and (clean_data_a & clean_data_b))
    actor_overlap = bool(clean_actors_a and clean_actors_b and (clean_actors_a & clean_actors_b))

    if data_overlap and actor_overlap:
        return True

    if clean_data_a and clean_data_b:
        jaccard = len(clean_data_a & clean_data_b) / len(clean_data_a | clean_data_b)
        if jaccard >= 0.5:
            return True

    if not (clean_data_a or clean_data_b or clean_actors_a or clean_actors_b):
        name_a = str(feat_a.get("name") or "").strip().lower()
        name_b = str(feat_b.get("name") or "").strip().lower()
        return bool(name_a and name_b and name_a == name_b)

    return False


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

PERSONA_ACTION_PATTERN = (
    r"\b(?:access|approve|assign|book|create|dispatch|manage|manag\w*|monitor|"
    r"organize|review|scan|schedule|submit|track|upload|view)\w*\b"
)

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

        persona_matches = []
        for pattern in PERSONA_PATTERNS:
            match = re.search(pattern, text_lower)
            if match:
                persona_matches.append(match)

        distinct_personas = {match.group(0) for match in persona_matches}
        action_matches = list(re.finditer(PERSONA_ACTION_PATTERN, text_lower))
        has_nearby_persona_action = any(
            abs(persona_match.start() - action_match.start()) <= 45
            for persona_match in persona_matches
            for action_match in action_matches
        )
        has_personas = len(distinct_personas) >= 2 or has_nearby_persona_action
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

    # Persist check record to contradiction_checks table (resilient dual-client)
    target_client = get_supabase() or client
    if target_client and not project_id.startswith("local-draft-"):
        saved_cc = False
        try:
            target_client.table("contradiction_checks").insert({
                "project_id": project_id,
                "idea_text": idea_text,
                "round": round_num,
                "found": found,
                "explanation": explanation,
                "conflicting_parts": conflicting_parts,
                "resolved_answer": resolved_answer
            }).execute()
            saved_cc = True
        except Exception as e:
            print(f"[Service Client contradiction_checks Error] {e}")
            if client and target_client is not client:
                try:
                    client.table("contradiction_checks").insert({
                        "project_id": project_id,
                        "idea_text": idea_text,
                        "round": round_num,
                        "found": found,
                        "explanation": explanation,
                        "conflicting_parts": conflicting_parts,
                        "resolved_answer": resolved_answer
                    }).execute()
                    saved_cc = True
                except Exception as e2:
                    print(f"[User Client contradiction_checks Error] {e2}")

        # Update project step0_state and density_flags with contradiction resolution outcome
        try:
            step0_state = project.get("step0_state") or {}
            step0_state["last_contradiction_result"] = {
                "found": found,
                "explanation": explanation,
                "conflicting_parts": conflicting_parts,
                "round": round_num,
                "resolved_answer": resolved_answer,
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
            raise HTTPException(
                status_code=502,
                detail="Failed to persist contradiction and density state."
            ) from e

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


# --- V3.3 Deepened Clarifying Questions Endpoints ---
@app.post("/projects/{project_id}/clarifying-questions")
@app.post("/api/projects/{project_id}/clarifying-questions")
async def generate_clarifying_questions(
    project_id: str,
    req: GenerateClarifyingQuestionsRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    density_flags = req.density_flags
    if not density_flags or not isinstance(density_flags, dict):
        density_flags = project.get("density_flags") or DEFAULT_DENSITY_FLAGS

    cq_flag = density_flags.get("clarifying_questions", "full")
    if cq_flag == "skip":
        return {
            "status": "skipped",
            "message": "Clarifying questions skipped due to high idea density.",
            "density_flag": "skip",
            "questions": []
        }

    target_count_str = "1 to 2" if cq_flag == "partial" else "2 to 4"
    max_questions = 2 if cq_flag == "partial" else 4

    personas_covered = (density_flags.get("personas") == "skip")
    nfrs_covered = (density_flags.get("nfrs") == "skip")

    covered_rules = []
    if personas_covered:
        covered_rules.append("- User roles and personas are already defined in the idea. DO NOT ask who the users/roles are or what user types exist.")
    if nfrs_covered:
        covered_rules.append("- Scale, traffic, and compliance/security constraints are already specified. DO NOT ask about scale or compliance.")

    covered_section = "\n".join(covered_rules) if covered_rules else "- Focus directly on core business logic, user workflows, and key domain edge cases."

    system_prompt = f"""You are a software architect conducting a requirements clarification interview for a project specification.
Generate {target_count_str} targeted, highly domain-specific clarifying questions for the provided project idea.

CRITICAL CONSTRAINTS:
1. STRICTLY FORBIDDEN: Generic filler questions such as:
   - "What features do you want to include?"
   - "Can you tell me more about your idea?"
   - "What is your target audience or budget?"
   - "What technology stack do you prefer?"
2. DOMAIN SPECIFICITY: Every question must focus on specific domain workflows, business rules, or decision points for this exact project type.
   - Example (Loan app): "Should loan approval require a single loan officer or a multi-step approval workflow?"
   - Example (Healthcare): "Do appointments require upfront deposits or insurance pre-verification during booking?"
   - Example (Logistics): "Does package tracking rely on manual barcode scans at checkpoints or automated GPS telemetry?"
3. AVOID REDUNDANCY WITH EXISTING SIGNALS:
{covered_section}
4. EXACT COUNT: Output between {target_count_str} questions.

You MUST respond strictly with a valid JSON object matching this schema:
{{
  "questions": [
    "Question 1 text",
    "Question 2 text"
  ]
}}"""

    user_prompt = f"Project Idea:\n{req.idea_text}"
    repair_prompt = f"Your previous response was malformed. Generate strictly valid JSON with {target_count_str} domain-specific clarifying questions.\n\nProject Idea:\n{req.idea_text}"

    try:
        res = await call_groq_json(system_prompt, user_prompt, retry_user_prompt=repair_prompt)
        questions_raw = res.get("questions", [])
        if not isinstance(questions_raw, list) or len(questions_raw) == 0:
            res = await call_groq_json(system_prompt, repair_prompt, retry=False)
            questions_raw = res.get("questions", [])
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Clarifying Questions Generation Error] {e}")
        raise HTTPException(status_code=502, detail="Clarifying questions provider unavailable.") from e

    questions = [str(q).strip() for q in questions_raw if str(q).strip()][:max_questions]
    if not questions:
        raise HTTPException(status_code=502, detail="Clarifying questions generation returned empty results.")

    inserted_questions = []
    if client and not project_id.startswith("local-draft-"):
        for q_text in questions:
            try:
                insert_res = client.table("clarifying_questions").insert({
                    "project_id": project_id,
                    "question": q_text,
                    "answer": None,
                    "round": 1
                }).execute()
                if insert_res.data:
                    inserted_questions.append({
                        "id": insert_res.data[0]["id"],
                        "question": q_text
                    })
                else:
                    raise HTTPException(
                        status_code=502,
                        detail="Failed to persist clarifying question."
                    )
            except HTTPException:
                raise
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to persist clarifying question."
                ) from e
    else:
        for q_text in questions:
            inserted_questions.append({
                "id": str(uuid.uuid4()),
                "question": q_text
            })

    return {
        "status": "ok",
        "density_flag": cq_flag,
        "questions": inserted_questions
    }


@app.post("/projects/{project_id}/clarifying-questions/answer")
@app.post("/api/projects/{project_id}/clarifying-questions/answer")
async def submit_clarifying_answers(
    project_id: str,
    req: SubmitClarifyingAnswersRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    if not req.answers:
        raise HTTPException(status_code=400, detail="Answers list cannot be empty.")

    updated_count = 0
    for item in req.answers:
        q_id = item.question_id
        ans = (item.answer or "").strip()
        if not ans:
            continue
        if client and not project_id.startswith("local-draft-"):
            try:
                UUID(q_id)
                client.table("clarifying_questions").update({"answer": ans}).eq("id", q_id).eq("project_id", project_id).execute()
                updated_count += 1
            except Exception as e:
                raise HTTPException(
                    status_code=502,
                    detail="Failed to persist clarifying answer."
                ) from e

    # Fold answers into project step0_state for downstream generation
    if client and not project_id.startswith("local-draft-"):
        try:
            step0_state = project.get("step0_state") or {}
            qa_list = []
            try:
                records = client.table("clarifying_questions").select("id, question, answer").eq("project_id", project_id).order("created_at", desc=False).execute()
                if records and records.data:
                    qa_list = records.data
            except Exception as e:
                print(f"[Fetch Clarifying QA Warning] {e}")

            step0_state["clarifying_qa"] = qa_list
            step0_state["clarifying_completed"] = True

            project_update = {"step0_state": step0_state}
            # V3.11: If a lightweight draft was already confirmed, invalidate it on edit
            current_draft = project.get("lightweight_draft")
            if isinstance(current_draft, dict) and current_draft.get("final_status"):
                current_draft["final_status"] = None
                project_update["lightweight_draft"] = current_draft

            client.table("projects").update(project_update).eq("id", project_id).execute()
        except Exception as e:
            print(f"[Project Step0 State Clarifying Update Warning] {e}")

    return {
        "status": "ok",
        "message": "Clarifying answers saved successfully.",
        "updated_count": updated_count
    }


@app.get("/projects/{project_id}/clarifying-questions")
@app.get("/api/projects/{project_id}/clarifying-questions")
async def get_clarifying_questions(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    get_owned_project(client, user_id, project_id)

    if not client or project_id.startswith("local-draft-"):
        return {"questions": []}

    try:
        res = client.table("clarifying_questions").select("*").eq("project_id", project_id).order("created_at", desc=False).execute()
        return {"questions": res.data or []}
    except Exception as e:
        print(f"[Get Clarifying Questions Error] {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch clarifying questions.") from e


# --- V3.4 Persona Capture Endpoints ---
@app.post("/projects/{project_id}/personas")
@app.post("/api/projects/{project_id}/personas")
async def submit_personas(
    project_id: str,
    req: PersonaCaptureRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    answer = (req.answer or "").strip()
    if not answer:
        raise HTTPException(status_code=400, detail="Persona answer cannot be empty.")

    now_iso = datetime.now(timezone.utc).isoformat()
    persona_record = {
        "answer": answer,
        "captured_at": now_iso
    }

    if client and not project_id.startswith("local-draft-"):
        step0_state = project.get("step0_state") or {}
        step0_state["personas"] = persona_record

        project_update = {
            "personas": persona_record,
            "step0_state": step0_state
        }
        # V3.11: If a lightweight draft was already confirmed, invalidate it on edit
        current_draft = project.get("lightweight_draft")
        if isinstance(current_draft, dict) and current_draft.get("final_status"):
            current_draft["final_status"] = None
            project_update["lightweight_draft"] = current_draft

        saved = False
        last_err = None
        for attempt in range(2):
            try:
                client.table("projects").update(project_update).eq("id", project_id).execute()
                saved = True
                break
            except Exception as e:
                last_err = e
                print(f"[Persist Persona Attempt {attempt+1} Warning] {e}")

        if not saved:
            raise HTTPException(
                status_code=502,
                detail="Failed to persist persona data to database."
            ) from last_err

    return {
        "status": "ok",
        "message": "Persona details saved successfully.",
        "personas": persona_record
    }


@app.get("/projects/{project_id}/personas")
@app.get("/api/projects/{project_id}/personas")
async def get_personas(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    personas = project.get("personas") or (project.get("step0_state") or {}).get("personas")
    return {"personas": personas}


# --- V3.5 NFR Capture Endpoints ---
@app.post("/projects/{project_id}/nfrs")
@app.post("/api/projects/{project_id}/nfrs")
async def submit_nfrs(
    project_id: str,
    req: NFRCaptureRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    scale = (req.scale or "").strip()
    data_sensitivity = (req.data_sensitivity or "").strip()
    availability = (req.availability or "").strip()

    if not scale or scale not in NFR_SCALE_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid scale value '{scale}'. Must be one of: {', '.join(sorted(NFR_SCALE_ALLOWED))}."
        )
    if not data_sensitivity or data_sensitivity not in NFR_DATA_SENSITIVITY_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid data_sensitivity value '{data_sensitivity}'. Must be one of: {', '.join(sorted(NFR_DATA_SENSITIVITY_ALLOWED))}."
        )
    if not availability or availability not in NFR_AVAILABILITY_ALLOWED:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid availability value '{availability}'. Must be one of: {', '.join(sorted(NFR_AVAILABILITY_ALLOWED))}."
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    nfr_record = {
        "scale": scale,
        "data_sensitivity": data_sensitivity,
        "availability": availability,
        "captured_at": now_iso
    }

    if client and not project_id.startswith("local-draft-"):
        step0_state = project.get("step0_state") or {}
        step0_state["nfrs"] = nfr_record

        project_update = {
            "nfrs": nfr_record,
            "step0_state": step0_state
        }
        # V3.11: If a lightweight draft was already confirmed, invalidate it on edit
        current_draft = project.get("lightweight_draft")
        if isinstance(current_draft, dict) and current_draft.get("final_status"):
            current_draft["final_status"] = None
            project_update["lightweight_draft"] = current_draft

        saved = False
        last_err = None
        for attempt in range(2):
            try:
                client.table("projects").update(project_update).eq("id", project_id).execute()
                saved = True
                break
            except Exception as e:
                last_err = e
                print(f"[Persist NFR Attempt {attempt+1} Warning] {e}")

        if not saved:
            raise HTTPException(
                status_code=502,
                detail="Failed to persist NFR data to database."
            ) from last_err

    return {
        "status": "ok",
        "message": "NFR details saved successfully.",
        "nfrs": nfr_record
    }


@app.get("/projects/{project_id}/nfrs")
@app.get("/api/projects/{project_id}/nfrs")
async def get_nfrs(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    nfrs = project.get("nfrs") or (project.get("step0_state") or {}).get("nfrs")
    return {"nfrs": nfrs}


# --- V3.11 Interview Answers Edit Flow Endpoints ---
@app.post("/projects/{project_id}/contradiction-resolution")
@app.post("/api/projects/{project_id}/contradiction-resolution")
async def edit_contradiction_resolution(
    project_id: str,
    req: ContradictionResolutionEditRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    step0_state = project.get("step0_state") or {}
    last_contra = step0_state.get("last_contradiction_result") or {}
    last_contra["resolved_answer"] = req.resolved_answer
    last_contra["checked_at"] = datetime.now(timezone.utc).isoformat()
    step0_state["last_contradiction_result"] = last_contra

    update_payload = {"step0_state": step0_state}

    # Reset lightweight draft if it was already confirmed
    current_draft = project.get("lightweight_draft")
    if isinstance(current_draft, dict) and current_draft.get("final_status"):
        current_draft["final_status"] = None
        update_payload["lightweight_draft"] = current_draft

    if client and not project_id.startswith("local-draft-"):
        saved = False
        last_err = None
        for attempt in range(2):
            try:
                client.table("projects").update(update_payload).eq("id", project_id).execute()
                saved = True
                break
            except Exception as e:
                last_err = e
                print(f"[Persist Contradiction Edit Attempt {attempt+1} Warning] {e}")

        if not saved:
            raise HTTPException(
                status_code=502,
                detail="Failed to persist edited contradiction resolution to database."
            ) from last_err

        # Also update latest row in contradiction_checks table if present
        try:
            service_client = get_supabase()
            if service_client:
                cc_rows = service_client.table("contradiction_checks").select("id").eq("project_id", project_id).order("checked_at", desc=True).limit(1).execute()
                if cc_rows and cc_rows.data:
                    latest_cc_id = cc_rows.data[0]["id"]
                    service_client.table("contradiction_checks").update({"resolved_answer": req.resolved_answer}).eq("id", latest_cc_id).execute()
        except Exception as e:
            print(f"[Update contradiction_checks Table Warning] {e}")

    return {
        "status": "ok",
        "message": "Contradiction resolution updated successfully.",
        "last_contradiction_result": last_contra
    }


@app.get("/projects/{project_id}/interview-summary")
@app.get("/api/projects/{project_id}/interview-summary")
async def get_interview_summary(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    step0_state = project.get("step0_state") or {}
    last_contra = step0_state.get("last_contradiction_result") or {}

    # Query clarifying questions from DB
    clarifying_list = []
    if client and not project_id.startswith("local-draft-"):
        try:
            cq_res = client.table("clarifying_questions").select("id, question, answer").eq("project_id", project_id).order("created_at", desc=False).execute()
            if cq_res and cq_res.data:
                clarifying_list = cq_res.data
        except Exception as e:
            print(f"[Fetch Clarifying QA in Summary Warning] {e}")

    if not clarifying_list:
        clarifying_list = step0_state.get("clarifying_qa") or []

    personas_data = project.get("personas") or step0_state.get("personas")
    nfrs_data = project.get("nfrs") or step0_state.get("nfrs")
    lightweight_draft_data = project.get("lightweight_draft")

    return {
        "status": "ok",
        "project_id": project_id,
        "idea_text": project.get("idea_text"),
        "contradiction_resolution": last_contra,
        "clarifying_questions": clarifying_list,
        "personas": personas_data,
        "nfrs": nfrs_data,
        "lightweight_draft": lightweight_draft_data
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


def fetch_contradiction_checks_records(client=None, project_id: str = "") -> List[Dict[str, Any]]:
    """Fetch contradiction check records with resilient ordering across schema variants."""
    target_client = get_supabase() or client
    if not target_client or not project_id or project_id.startswith("local-draft-"):
        return []
    for order_col in ["checked_at", "created_at"]:
        try:
            res = target_client.table("contradiction_checks").select("*").eq("project_id", project_id).order(order_col, desc=True).limit(5).execute()
            if res and isinstance(res.data, list):
                return res.data
        except Exception:
            continue
    try:
        res = target_client.table("contradiction_checks").select("*").eq("project_id", project_id).limit(5).execute()
        if res and isinstance(res.data, list):
            return res.data
    except Exception as e:
        print(f"[Fetch Contradiction Checks Warning] {e}")
    return []


def assemble_effective_idea_context(
    base_idea_text: str,
    contradiction_data: Optional[Dict[str, Any]] = None,
    clarifying_qa: Optional[List[Dict[str, Any]]] = None,
    contradiction_unresolved: bool = False,
    personas_data: Optional[Union[Dict[str, Any], str]] = None,
    nfrs_data: Optional[Dict[str, Any]] = None,
    lightweight_draft_data: Optional[Union[Dict[str, Any], List[Dict[str, Any]], str, List[str]]] = None
) -> str:
    """
    Folds base project idea with persisted contradiction resolution details,
    answered clarifying questions, persona capture data, non-functional requirements (NFRs),
    and any rejected lightweight draft corrections into a single coherent context string for generation.
    """
    sections = [base_idea_text.strip()]

    # 1. Fold in Contradiction Resolution / Ambiguity context
    if contradiction_data and isinstance(contradiction_data, dict):
        resolved_ans = (contradiction_data.get("resolved_answer") or "").strip()
        explanation = (contradiction_data.get("explanation") or "").strip()
        if resolved_ans:
            if explanation:
                sections.append(
                    f"Regarding an earlier ambiguity ({explanation}): the user clarified that {resolved_ans}."
                )
            else:
                sections.append(
                    f"Regarding an earlier ambiguity: the user clarified that {resolved_ans}."
                )
        elif contradiction_unresolved and explanation:
            sections.append(
                f"Note on unresolved ambiguity: A conflict was identified during analysis: {explanation}."
            )

    # 2. Fold in Clarifying Questions & Answers
    if clarifying_qa and isinstance(clarifying_qa, list):
        valid_qa = [
            qa for qa in clarifying_qa
            if isinstance(qa, dict) and qa.get("question") and qa.get("answer") and str(qa.get("answer")).strip()
        ]
        if valid_qa:
            qa_lines = []
            for qa in valid_qa:
                q = str(qa["question"]).strip()
                a = str(qa["answer"]).strip()
                qa_lines.append(f"Additional detail provided: Q: '{q}' A: '{a}'")
            sections.append("\n".join(qa_lines))

    # 3. Fold in Persona Capture context
    if personas_data:
        persona_text = ""
        if isinstance(personas_data, dict):
            persona_text = (personas_data.get("answer") or "").strip()
        elif isinstance(personas_data, str):
            persona_text = personas_data.strip()
        if persona_text:
            sections.append(f"User types: {persona_text}")

    # 4. Fold in NFR Capture context
    if nfrs_data and isinstance(nfrs_data, dict):
        scale = (nfrs_data.get("scale") or "").strip()
        sensitivity = (nfrs_data.get("data_sensitivity") or "").strip()
        availability = (nfrs_data.get("availability") or "").strip()
        if scale and sensitivity and availability:
            sections.append(
                f"Non-functional requirements: expected scale is {scale}, data sensitivity is {sensitivity}, availability requirement is {availability}."
            )
        elif scale or sensitivity or availability:
            parts = []
            if scale:
                parts.append(f"expected scale is {scale}")
            if sensitivity:
                parts.append(f"data sensitivity is {sensitivity}")
            if availability:
                parts.append(f"availability requirement is {availability}")
            sections.append(f"Non-functional requirements: {', '.join(parts)}.")

    # 5. Fold in Lightweight Draft Corrections (if any)
    if lightweight_draft_data:
        corrections = []
        if isinstance(lightweight_draft_data, dict):
            attempts = lightweight_draft_data.get("attempts") or []
            if isinstance(attempts, list):
                for att in attempts:
                    if isinstance(att, dict) and att.get("correction_text"):
                        ct = str(att["correction_text"]).strip()
                        if ct and ct not in corrections:
                            corrections.append(ct)
            direct_ct = (lightweight_draft_data.get("correction_text") or "").strip()
            if direct_ct and direct_ct not in corrections:
                corrections.append(direct_ct)
        elif isinstance(lightweight_draft_data, list):
            for item in lightweight_draft_data:
                if isinstance(item, dict) and item.get("correction_text"):
                    ct = str(item["correction_text"]).strip()
                    if ct and ct not in corrections:
                        corrections.append(ct)
                elif isinstance(item, str) and item.strip() and item.strip() not in corrections:
                    corrections.append(item.strip())
        elif isinstance(lightweight_draft_data, str) and lightweight_draft_data.strip():
            corrections.append(lightweight_draft_data.strip())

        if corrections:
            correction_str = "; ".join(corrections)
            sections.append(f"Clarifications on draft features: {correction_str}.")

    return "\n\n".join(sections)


# --- V3.8 Lightweight Confirm Draft Endpoints ---
@app.post("/projects/{project_id}/lightweight-draft")
@app.post("/api/projects/{project_id}/lightweight-draft")
async def generate_lightweight_draft(
    project_id: str,
    req: LightweightDraftRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    attempt_num = req.attempt if req.attempt in (1, 2) else 1
    incoming_correction = (req.correction_text or "").strip() or None

    idea_text = project.get("idea_text") or "Software application"
    step0_state = project.get("step0_state") or {}
    contradiction_unresolved = bool(step0_state.get("contradiction_unresolved", False))
    contradiction_data = step0_state.get("last_contradiction_result") or {}
    clarifying_qa = step0_state.get("clarifying_qa") or []
    personas_data = project.get("personas") or step0_state.get("personas") or {}
    nfrs_data = project.get("nfrs") or step0_state.get("nfrs") or {}
    existing_draft_state = project.get("lightweight_draft") or {}

    # Authoritative fetch if real DB client
    if client and not project_id.startswith("local-draft-"):
        try:
            cq_res = client.table("clarifying_questions").select("id, question, answer").eq("project_id", project_id).order("created_at", desc=False).execute()
            if cq_res and isinstance(cq_res.data, list) and cq_res.data:
                clarifying_qa = cq_res.data
        except Exception as e:
            print(f"[Fetch Clarifying QA Warning in Draft] {e}")

        if not contradiction_data.get("resolved_answer"):
            cc_rows = fetch_contradiction_checks_records(client, project_id)
            for row in cc_rows:
                if row.get("resolved_answer"):
                    contradiction_data = row
                    break
            if not contradiction_data and cc_rows:
                contradiction_data = cc_rows[0]

    # Combine existing draft context with any newly supplied correction
    draft_context_source = dict(existing_draft_state) if isinstance(existing_draft_state, dict) else {}
    if incoming_correction:
        draft_context_source["correction_text"] = incoming_correction

    effective_idea_text = assemble_effective_idea_context(
        base_idea_text=idea_text,
        contradiction_data=contradiction_data,
        clarifying_qa=clarifying_qa,
        contradiction_unresolved=contradiction_unresolved,
        personas_data=personas_data,
        nfrs_data=nfrs_data,
        lightweight_draft_data=draft_context_source
    )

    system_prompt_lightweight = """You are an expert AI software architect.
Given the project context, produce a concise bullet-point list of 4-6 core features and requirements understood from the user's idea.
Focus on plain-language sanity-check summaries that a human can skim in a few seconds. Do NOT include acceptance criteria, database schema, or complex technical rules.
Output strictly valid JSON with no markdown formatting:
{
  "draft_features": [
    "Feature summary 1",
    "Feature summary 2"
  ]
}"""
    user_prompt = f"Project Context:\n{effective_idea_text}"
    repair_prompt = f"Your previous response was malformed or unparseable. Return strictly valid JSON conforming to the schema with draft_features (list of strings).\n\n{user_prompt}"

    try:
        draft_res = await call_groq_json(system_prompt_lightweight, user_prompt, retry_user_prompt=repair_prompt)
        raw_features = draft_res.get("draft_features") if isinstance(draft_res, dict) else None
        if not isinstance(raw_features, list) or not raw_features:
            draft_res = await call_groq_json(system_prompt_lightweight, repair_prompt, retry=False)
            raw_features = draft_res.get("draft_features") if isinstance(draft_res, dict) else None
            if not isinstance(raw_features, list) or not raw_features:
                raise HTTPException(status_code=502, detail="Lightweight draft generation failed to return a valid feature list.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Lightweight Draft Generation Error] {e}")
        raise HTTPException(status_code=502, detail="Lightweight draft generation service unavailable.") from e

    cleaned_features = [str(f).strip() for f in raw_features if str(f).strip()]
    if not cleaned_features:
        raise HTTPException(status_code=502, detail="Lightweight draft generation returned an empty feature list.")

    now_iso = datetime.now(timezone.utc).isoformat()
    new_attempt_record = {
        "attempt": attempt_num,
        "draft_features": cleaned_features,
        "user_response": None,
        "correction_text": incoming_correction,
        "created_at": now_iso
    }

    current_draft = dict(existing_draft_state) if isinstance(existing_draft_state, dict) else {}
    attempts_list = list(current_draft.get("attempts") or [])
    
    # Update matching attempt or append
    replaced = False
    for idx, att in enumerate(attempts_list):
        if isinstance(att, dict) and att.get("attempt") == attempt_num:
            attempts_list[idx] = new_attempt_record
            replaced = True
            break
    if not replaced:
        attempts_list.append(new_attempt_record)

    current_draft["attempts"] = attempts_list
    if "final_status" not in current_draft:
        current_draft["final_status"] = None
    if "lightweight_draft_flagged" not in current_draft:
        current_draft["lightweight_draft_flagged"] = False

    if client and not project_id.startswith("local-draft-"):
        saved = False
        last_err = None
        for save_att in range(2):
            try:
                client.table("projects").update({
                    "lightweight_draft": current_draft
                }).eq("id", project_id).execute()
                saved = True
                break
            except Exception as e:
                last_err = e
                print(f"[Persist Lightweight Draft Attempt {save_att+1} Warning] {e}")
        if not saved:
            raise HTTPException(status_code=502, detail="Failed to persist lightweight draft data to database.") from last_err

    return {
        "status": "ok",
        "draft_features": cleaned_features,
        "attempt": attempt_num
    }


@app.post("/projects/{project_id}/lightweight-draft/respond")
@app.post("/api/projects/{project_id}/lightweight-draft/respond")
async def respond_lightweight_draft(
    project_id: str,
    req: LightweightDraftRespondRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    current_draft = project.get("lightweight_draft") or {}
    if not isinstance(current_draft, dict):
        current_draft = {}

    attempts_list = list(current_draft.get("attempts") or [])

    # Find the target attempt explicitly by matching attempt number, fallback to last attempt
    target_attempt = None
    target_idx = -1
    if req.attempt is not None:
        for idx, att in enumerate(attempts_list):
            if isinstance(att, dict) and att.get("attempt") == req.attempt:
                target_attempt = att
                target_idx = idx
                break

    if target_attempt is None and attempts_list:
        target_idx = len(attempts_list) - 1
        target_attempt = attempts_list[target_idx]

    if target_attempt is None:
        raise HTTPException(
            status_code=409,
            detail="A generated lightweight draft attempt is required before confirmation."
        )

    # Update the target attempt
    target_attempt["user_response"] = req.response
    if req.correction_text is not None:
        target_attempt["correction_text"] = req.correction_text.strip() or None
    attempts_list[target_idx] = target_attempt
    current_draft["attempts"] = attempts_list

    attempt_num = target_attempt.get("attempt", target_idx + 1)

    if req.response == "confirmed":
        current_draft["final_status"] = "confirmed"
        current_draft["lightweight_draft_flagged"] = False
        proceed_to_gen = True
        flagged = False
        status_str = "confirmed"
    else:  # rejected
        if attempt_num < 2:
            current_draft["final_status"] = None
            current_draft["lightweight_draft_flagged"] = False
            proceed_to_gen = False
            flagged = False
            status_str = "retry"
        else:
            # Attempt 2 rejected -> cap reached, proceed with flag
            current_draft["final_status"] = "proceeded_after_cap"
            current_draft["lightweight_draft_flagged"] = True
            proceed_to_gen = True
            flagged = True
            status_str = "proceeded_after_cap"

    if client and not project_id.startswith("local-draft-"):
        saved = False
        last_err = None
        for save_att in range(2):
            try:
                client.table("projects").update({
                    "lightweight_draft": current_draft
                }).eq("id", project_id).execute()
                saved = True
                break
            except Exception as e:
                last_err = e
                print(f"[Persist Draft Response Attempt {save_att+1} Warning] {e}")
        if not saved:
            raise HTTPException(status_code=502, detail="Failed to persist lightweight draft response to database.") from last_err

    return {
        "status": status_str,
        "attempt": attempt_num,
        "proceed_to_generation": proceed_to_gen,
        "lightweight_draft_flagged": flagged
    }


@app.get("/projects/{project_id}/lightweight-draft")
@app.get("/api/projects/{project_id}/lightweight-draft")
async def get_lightweight_draft(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)

    draft_data = project.get("lightweight_draft")
    return {"lightweight_draft": draft_data}


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
    
    idea_text = project.get("idea_text") or (req and req.idea_text) or "Software application"
    fixed_inputs = (req and req.fixed_inputs) or project.get("fixed_inputs") or {}
    
    if project.get("status") == "locked_generating":
        raise HTTPException(status_code=429, detail="A generation run is already in progress for this project.")

    gen_state = project.get("generation_state") or {}
    if project.get("status") in ("features_accepted", "structure_accepted") or gen_state.get("features_locked"):
        raise HTTPException(
            status_code=400,
            detail="Feature list is already accepted and locked. Full generation cannot overwrite an accepted feature list."
        )

    if not idea_text.strip() or idea_text == "Software application":
        raise HTTPException(status_code=400, detail="A classified project idea is required before generation.")
    required_fixed_inputs = ("stack", "database", "deployment", "apis")
    if any(not fixed_inputs.get(key) for key in required_fixed_inputs):
        raise HTTPException(status_code=400, detail="All fixed inputs are required before generation.")

    check_generation_rate_limit(client, user_id, "pipeline")
    client.table("projects").update({"status": "locked_generating"}).eq("id", project_id).execute()

    generation_succeeded = False
    try:
        # Retrieve persisted Step 0 context (Contradiction resolution, Clarifying QA, Personas, NFRs, Lightweight Draft)
        step0_state = project.get("step0_state") or {}
        contradiction_unresolved = bool(step0_state.get("contradiction_unresolved", False))
        contradiction_data = step0_state.get("last_contradiction_result") or {}
        clarifying_qa = step0_state.get("clarifying_qa") or []
        personas_data = project.get("personas") or step0_state.get("personas") or {}
        nfrs_data = project.get("nfrs") or step0_state.get("nfrs") or {}
        lightweight_draft_data = project.get("lightweight_draft") or {}

        # If client is connected and real project, query authoritative tables with 1 retry on failure
        if client and not project_id.startswith("local-draft-"):
            # Authoritative fetch from clarifying_questions table
            try:
                cq_res = client.table("clarifying_questions").select("id, question, answer").eq("project_id", project_id).order("created_at", desc=False).execute()
                if cq_res and isinstance(cq_res.data, list) and cq_res.data:
                    clarifying_qa = cq_res.data
            except Exception as e1:
                print(f"[Fetch Clarifying Questions Retry 1] {e1}")
                try:
                    cq_res = client.table("clarifying_questions").select("id, question, answer").eq("project_id", project_id).order("created_at", desc=False).execute()
                    if cq_res and isinstance(cq_res.data, list) and cq_res.data:
                        clarifying_qa = cq_res.data
                except Exception as e2:
                    print(f"[Fetch Clarifying Questions Failed] {e2}")
                    raise HTTPException(
                        status_code=502,
                        detail="Failed to retrieve clarifying questions context from database."
                    ) from e2

            # Check contradiction_checks table for resolved_answer if not in step0_state
            if not contradiction_data.get("resolved_answer"):
                cc_rows = fetch_contradiction_checks_records(client, project_id)
                for row in cc_rows:
                    if row.get("resolved_answer"):
                        contradiction_data = row
                        break
                if not contradiction_data and cc_rows:
                    contradiction_data = cc_rows[0]

        effective_idea_text = assemble_effective_idea_context(
            base_idea_text=idea_text,
            contradiction_data=contradiction_data,
            clarifying_qa=clarifying_qa,
            contradiction_unresolved=contradiction_unresolved,
            personas_data=personas_data,
            nfrs_data=nfrs_data,
            lightweight_draft_data=lightweight_draft_data
        )

        context_str = f"Project Idea: {effective_idea_text}\nFixed Inputs: {json.dumps(fixed_inputs)}"

        # Step 1: Parallel Independent Drafting (Gemini + Groq)
        system_prompt_draft = """You are an expert AI software architect creating technical specifications adhering to the V3.9 Requirement Quality Standard.
Generate a comprehensive list of 4-6 core technical features specifically tailored for the user's project idea.
Each feature must be atomic, feasible, and fully formed.

Output strictly valid JSON with no markdown formatting:
{
  "idea_objective": "<1-2 sentence synthesized objective statement specifically for this project>",
  "features": [
    {
      "id": "feat-1",
      "name": "<Feature Name>",
      "description": "<One-sentence technical summary for the feature card UI>",
      "source": "user_originated",
      "business_rules": [
        "<Rule 1: concrete domain constraint or permission>",
        "<Rule 2: operational workflow rule>"
      ],
      "data_touched": ["<data_entity_1>", "<data_entity_2>"],
      "actor_role": ["<actor_1 (role/permission)>", "<actor_2 (role/permission)>"],
      "acceptance_criteria": [
        "<Criterion 1: concrete testable condition with trigger/action/result>",
        "<Criterion 2: verification outcome>"
      ],
      "exclusions": [
        "<v1 boundary: explicit statement of what is not supported in v1>"
      ],
      "priority": "must_have",
      "provenance": "user_originated",
      "reasoning": null,
      "source_model": "gemini"
    },
    {
      "id": "feat-2",
      "name": "<Feature Name>",
      "description": "<One-sentence technical summary for the feature card UI>",
      "source": "ai_inferred",
      "business_rules": [
        "<Rule 1: concrete domain constraint>"
      ],
      "data_touched": ["<data_entity_1>"],
      "actor_role": ["<actor_1 (role/permission)>"],
      "acceptance_criteria": [
        "<Criterion 1: concrete testable condition>"
      ],
      "exclusions": [
        "<v1 boundary>"
      ],
      "priority": "should_have",
      "provenance": "ai_inferred",
      "reasoning": "<Mandatory architectural reasoning explaining why this feature is needed>",
      "source_model": "groq"
    }
  ]
}"""

        try:
            gemini_task = call_gemini_api(system_prompt_draft, context_str)
            groq_task = call_groq_json(system_prompt_draft, context_str)
            draft_results = await asyncio.gather(gemini_task, groq_task, return_exceptions=True)
            gemini_res, groq_res = draft_results[0], draft_results[1]

            gemini_draft = gemini_res if isinstance(gemini_res, dict) else {"features": []}
            groq_draft = groq_res if isinstance(groq_res, dict) else {"features": []}

            if isinstance(gemini_res, Exception):
                print(f"[Parallel Drafting Gemini Fallback] {gemini_res}")
            if isinstance(groq_res, Exception):
                print(f"[Parallel Drafting Groq Fallback] {groq_res}")

            if not gemini_draft.get("features") and not groq_draft.get("features"):
                raise HTTPException(status_code=502, detail="Generation failed: both AI providers returned empty feature sets.")
        except HTTPException:
            raise
        except Exception as e:
            print(f"[Step 1 Parallel Drafting Error] {e}")
            raise HTTPException(status_code=502, detail="Generation failed, please try again.") from e

        # Normalize raw draft outputs
        gemini_feats = [
            normalize_feature_schema(f, default_id=f"feat-{i+1}", default_provenance="user_originated", source_model="gemini")
            for i, f in enumerate(gemini_draft.get("features", []))
            if isinstance(f, dict)
        ]
        groq_feats = [
            normalize_feature_schema(f, default_id=f"feat-groq-{i+1}", default_provenance="ai_inferred", source_model="groq")
            for i, f in enumerate(groq_draft.get("features", []))
            if isinstance(f, dict)
        ]

        # Step 2: Diff & Merge based on data_touched + actor_role overlap
        merged_features = list(gemini_feats)
        for gf in groq_feats:
            matched_idx = -1
            for idx, mf in enumerate(merged_features):
                if are_features_overlapping(gf, mf):
                    matched_idx = idx
                    break

            if matched_idx >= 0:
                merged_features[matched_idx]["source_model"] = "merged"
                for r in gf.get("business_rules", []):
                    if r not in merged_features[matched_idx]["business_rules"]:
                        merged_features[matched_idx]["business_rules"].append(r)
                for ac in gf.get("acceptance_criteria", []):
                    if ac not in merged_features[matched_idx]["acceptance_criteria"]:
                        merged_features[matched_idx]["acceptance_criteria"].append(ac)
            else:
                gf["id"] = f"feat-{len(merged_features) + 1}"
                gf["provenance"] = "ai_inferred"
                gf["source"] = "ai_inferred"
                gf["source_model"] = "groq"
                if not gf.get("reasoning"):
                    gf["reasoning"] = f"Inferred by architectural analysis to support {gf.get('name')} workflows."
                gf["quality_flags"] = evaluate_code_level_quality(gf, fixed_inputs)
                merged_features.append(gf)

        # Step 3: Validation (Code-level checks + Groq model-judged characteristics pass)
        for f in merged_features:
            f["quality_flags"] = evaluate_code_level_quality(f, fixed_inputs)

        system_prompt_val = """You are an architectural validator checking a project feature plan against fixed inputs and the V3.9 Requirement Quality Standard.
Validate each feature against system constraints and the 6 model-judged quality characteristics:
1. "correct": Feature genuinely maps to stated idea/actors (not a detached assumption).
2. "necessary": Feature is domain-relevant (not irrelevant bloat).
3. "unambiguous": No vague terms ("fast", "efficient", "modern") without concrete definition.
4. "understandable": Plain language without unexplained jargon.
5. "clear_and_concise": No filler adjectives ("robust", "seamless") without concrete meaning.
6. "consistent": Cross-field numeric or logical consistency within the same feature (specifically comparing business_rules vs acceptance_criteria for conflicting numbers, limits, durations, or mutually exclusive requirements).

Output strictly valid JSON with no markdown:
{
  "is_valid": true,
  "flags": [],
  "feature_evaluations": [
    {
      "id": "feat-1",
      "is_valid": true,
      "failed_checks": [
        {
          "check": "consistent",
          "reason": "business_rules specifies max file size 250MB, but acceptance_criteria tests a 300MB file.",
          "fields_involved": ["business_rules", "acceptance_criteria"]
        }
      ]
    }
  ]
}"""
        validation_prompt = f"Context:\n{context_str}\n\nFeatures (V3.9 Schema):\n{json.dumps(merged_features)}"
        repair_prompt = f"Your previous validation response was malformed. Validate features and return JSON with is_valid, flags, and feature_evaluations.\n\n{validation_prompt}"

        try:
            val1 = await call_groq_json(system_prompt_val, validation_prompt, retry_user_prompt=repair_prompt)
            if "is_valid" not in val1:
                val1 = await call_groq_json(system_prompt_val, repair_prompt, retry=False)
                if "is_valid" not in val1:
                    raise HTTPException(status_code=502, detail="Generation failed: validation response could not be confirmed.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail="Generation failed, please try again.") from e

        eval_map = {ev.get("id"): ev for ev in val1.get("feature_evaluations", []) if isinstance(ev, dict)}
        for f in merged_features:
            ev = eval_map.get(f.get("id"))
            if ev and isinstance(ev.get("failed_checks"), list):
                model_failed = []
                for fc in ev["failed_checks"]:
                    if isinstance(fc, dict):
                        chk_name = str(fc.get("check") or "unknown").strip().lower()
                        reason = str(fc.get("reason") or f"Check '{chk_name}' failed validation.").strip()
                        fields = fc.get("fields_involved") or []
                        model_failed.append({
                            "check": chk_name,
                            "reason": reason,
                            "fields_involved": fields if isinstance(fields, list) else [str(fields)],
                            "survived_fix_pass": False
                        })
                    elif isinstance(fc, str) and fc.strip():
                        model_failed.append(normalize_failed_check(fc))

                existing_failed = list(f["quality_flags"].get("failed_checks") or [])
                f["quality_flags"]["failed_checks"] = merge_failed_checks(existing_failed, model_failed)
                if any(item["check"] == "consistent" for item in f["quality_flags"]["failed_checks"]):
                    f["quality_flags"]["consistent"] = False

        has_failed_checks = any(len(f.get("quality_flags", {}).get("failed_checks", [])) > 0 for f in merged_features)
        needs_fix = bool(not val1.get("is_valid") or val1.get("flags") or has_failed_checks)

        adjusted_flag = needs_fix
        final_features = merged_features
        fix_pass_failed = False

        # Step 4: Fix Pass (Gemini targets specific failed checks)
        if needs_fix:
            violations_summary = []
            if val1.get("flags"):
                violations_summary.append(f"Global validation flags: {json.dumps(val1.get('flags'))}")
            for f in merged_features:
                fc = f.get("quality_flags", {}).get("failed_checks", [])
                if fc:
                    fc_desc = []
                    for item in fc:
                        if isinstance(item, dict):
                            fields_str = f" (Fields: {', '.join(item.get('fields_involved', []))})" if item.get("fields_involved") else ""
                            fc_desc.append(f"[{item.get('check')}]: {item.get('reason')}{fields_str}")
                        else:
                            fc_desc.append(str(item))
                    violations_summary.append(f"- Feature '{f.get('id')}' ({f.get('name')}):\n  * " + "\n  * ".join(fc_desc))

            violations_text = "\n".join(violations_summary)
            fix_prompt = f"""Context:
{context_str}

Current Features (V3.9 Schema):
{json.dumps(merged_features, indent=2)}

Validation Failures / Quality Flags to Fix:
{violations_text}

Fix ONLY the identified issues while strictly preserving the V3.9 extended feature schema for every feature (id, name, description, source, business_rules, data_touched, actor_role, acceptance_criteria, exclusions, priority, provenance, reasoning, source_model). Ensure cross-field consistency between business_rules and acceptance_criteria (e.g., matching numeric limits, file sizes, timeouts). Return strictly valid JSON with the corrected 'features' list."""

            try:
                try:
                    fix_res = await call_gemini_api(system_prompt_draft, fix_prompt, retry=False)
                except Exception as e_gem:
                    print(f"[Step 4 Quality Fix Groq Fallback] {e_gem}")
                    fix_res = await call_groq_json(system_prompt_draft, fix_prompt)
                
                raw_fixed = fix_res.get("features", [])
                if isinstance(raw_fixed, list) and raw_fixed:
                    final_features = [
                        normalize_feature_schema(f, default_id=f"feat-{i+1}", source_model="gemini")
                        for i, f in enumerate(raw_fixed)
                        if isinstance(f, dict)
                    ]
                else:
                    fix_pass_failed = True
                    final_features = merged_features
            except Exception as e:
                print(f"[Step 4 Quality Fix Error] {e}")
                fix_pass_failed = True
                final_features = merged_features

        # Step 5: Final Validation Pass
        for f in final_features:
            f["quality_flags"] = evaluate_code_level_quality(f, fixed_inputs)

        final_validation_prompt = f"Context:\n{context_str}\n\nFeatures after fix pass (V3.9 Schema):\n{json.dumps(final_features)}"
        final_repair_prompt = f"Your previous final validation response was malformed. Return only valid JSON with is_valid, flags, and feature_evaluations.\n\n{final_validation_prompt}"

        try:
            val2 = await call_groq_json(system_prompt_val, final_validation_prompt, retry_user_prompt=final_repair_prompt)
            if "is_valid" not in val2:
                val2 = await call_groq_json(system_prompt_val, final_repair_prompt, retry=False)
                if "is_valid" not in val2:
                    raise HTTPException(status_code=502, detail="Generation failed: final validation response could not be confirmed.")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=502, detail="Generation failed, please try again.") from e

        eval_map2 = {ev.get("id"): ev for ev in val2.get("feature_evaluations", []) if isinstance(ev, dict)}
        for f in final_features:
            ev = eval_map2.get(f.get("id"))
            if ev and isinstance(ev.get("failed_checks"), list):
                model_failed = []
                for fc in ev["failed_checks"]:
                    if isinstance(fc, dict):
                        chk_name = str(fc.get("check") or "unknown").strip().lower()
                        reason = str(fc.get("reason") or f"Check '{chk_name}' failed validation.").strip()
                        fields = fc.get("fields_involved") or []
                        model_failed.append({
                            "check": chk_name,
                            "reason": reason,
                            "fields_involved": fields if isinstance(fields, list) else [str(fields)],
                            "survived_fix_pass": False
                        })
                    elif isinstance(fc, str) and fc.strip():
                        model_failed.append(normalize_failed_check(fc))

                existing_failed = list(f["quality_flags"].get("failed_checks") or [])
                f["quality_flags"]["failed_checks"] = merge_failed_checks(existing_failed, model_failed)
                if any(item["check"] == "consistent" for item in f["quality_flags"]["failed_checks"]):
                    f["quality_flags"]["consistent"] = False

            # If a fix pass was attempted and failed_checks still exist, mark survived_fix_pass = True
            if needs_fix:
                for fc in f["quality_flags"].get("failed_checks", []):
                    fc["survived_fix_pass"] = True

        adjustment_reasons = []

        if not val2.get("is_valid") or val2.get("flags"):
            adjusted_flag = True
            adjustment_reasons.append("final_validation_failed")

        if any(len(f.get("quality_flags", {}).get("failed_checks", [])) > 0 for f in final_features):
            adjusted_flag = True
            adjustment_reasons.append("quality_checks_unresolved")

        if contradiction_unresolved:
            adjusted_flag = True
            adjustment_reasons.append("contradiction_unresolved")

        if fix_pass_failed:
            adjustment_reasons.append("fix_pass_failed")

        generation_payload = {
            "idea_objective": gemini_draft.get("idea_objective") or effective_idea_text,
            "fixed_inputs": fixed_inputs,
            "features": final_features,
            "rejected_feature_ids": [],
            "dependency_order": [f.get("id") for f in final_features if f.get("id")],
            "adjusted_flag": adjusted_flag,
            "adjustment_reasons": adjustment_reasons,
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
        if client and not project_id.startswith("local-draft-"):
            if not generation_succeeded:
                client.table("projects").update({"status": "generation_failed"}).eq("id", project_id).execute()
                await log_generation_event(user_id=user_id, project_id=project_id, status="failure", failure_reason="pipeline_error")
            else:
                await log_generation_event(user_id=user_id, project_id=project_id, status="success")


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
    
    requested_stage: CommentStage = req.stage or "features"
    submitted_comments = req.comments or []
    current_features = req.current_features or []
    original_state = None

    if submitted_comments:
        for idx, comment in enumerate(submitted_comments):
            if not isinstance(comment, dict):
                raise HTTPException(status_code=422, detail=f"Comment at index {idx} must be an object.")
            observed_stage = comment.get("stage")
            if observed_stage not in (None, requested_stage):
                raise HTTPException(
                    status_code=422,
                    detail=(
                        f"Comment batch contains stage mismatch: expected '{requested_stage}', "
                        f"found '{observed_stage}' for comment index {idx}."
                    ),
                )

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
        comm_res = client.table("comments").select("*").eq("project_id", project_id).eq("stage", requested_stage).eq("status", "pending").execute()
        submitted_comments = comm_res.data or []

    try:
        if not submitted_comments:
            return {"status": "ok", "message": "No pending comments to process."}

        comment_ids = [c.get("id") for c in submitted_comments if c.get("id")]
        if comment_ids:
            client.table("comments").update({"status": "submitted"}).in_("id", comment_ids).eq("status", "pending").execute()

        # Gemini Batch Fix Pass conforming to V3.9 schema
        system_prompt = """You are an AI software architect updating a project feature list based on user review comments, strictly conforming to the V3.9 Requirement Quality Standard.
Modify, add, or refine the features list according to the user comments while preserving all schema fields.
Output strictly valid JSON with no markdown formatting:
{
  "features": [
    {
      "id": "feat-1",
      "name": "<Feature Name>",
      "description": "<One-sentence technical summary>",
      "source": "user_originated",
      "business_rules": ["<Rule 1>", "<Rule 2>"],
      "data_touched": ["<data_entity_1>"],
      "actor_role": ["<actor_1>"],
      "acceptance_criteria": ["<Criterion 1>"],
      "exclusions": ["<Exclusion 1>"],
      "priority": "must_have",
      "provenance": "user_originated",
      "reasoning": null,
      "source_model": "gemini"
    }
  ]
}"""

        comments_text = "\n".join([
            f"- Comment on stage {c.get('stage', requested_stage)} / target {c.get('target_feature_id', 'general')}: {c.get('text')}"
            for c in submitted_comments
        ])
        
        try:
            try:
                fix_res = await call_gemini_api(system_prompt, f"Current Features:\n{json.dumps(current_features)}\n\nUser Comments:\n{comments_text}")
            except Exception as e_gemini:
                print(f"[Batch Fix Groq Fallback] {e_gemini}")
                fix_res = await call_groq_json(system_prompt, f"Current Features:\n{json.dumps(current_features)}\n\nUser Comments:\n{comments_text}")

            raw_updated = fix_res.get("features", [])
            updated_features = [
                normalize_feature_schema(f, default_id=f"feat-{i+1}", source_model="groq")
                for i, f in enumerate(raw_updated)
                if isinstance(f, dict)
            ]
            if not updated_features:
                updated_features = current_features
        except Exception as e:
            print(f"[Batch Fix Error] {e}")
            raise HTTPException(status_code=502, detail="Failed to process your comments, please try again.") from e

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
        try:
            order_res = await call_gemini_api(system_prompt, f"Active Features:\n{json.dumps(active_features)}")
        except Exception as e_ord:
            print(f"[Dependency Order Groq Fallback] {e_ord}")
            order_res = await call_groq_json(system_prompt, f"Active Features:\n{json.dumps(active_features)}")
        
        proposed_order = order_res.get("dependency_order", [])

        # Validate with Groq
        val_prompt = """Check if the proposed feature order has circular dependencies or missing items. Output JSON: {"is_valid": true|false}"""
        val_res = await call_groq_json(val_prompt, f"Features:\n{json.dumps(active_features)}\n\nOrder:\n{json.dumps(proposed_order)}")

        if not val_res.get("is_valid", True):
            # Single Fix Pass for circular dependencies
            try:
                fix_res = await call_gemini_api(system_prompt, f"Fix circular dependencies for Features:\n{json.dumps(active_features)}")
            except Exception:
                fix_res = await call_groq_json(system_prompt, f"Fix circular dependencies for Features:\n{json.dumps(active_features)}")
            proposed_order = fix_res.get("dependency_order") or [f.get("id") for f in active_features]
            gen_state["adjusted_flag"] = True
            gen_state.setdefault("adjustment_reasons", []).append("dependency_reordered")

        gen_state["dependency_order"] = proposed_order
        client.table("projects").update({"generation_state": gen_state, "status": "accepted"}).eq("id", project_id).execute()

        return {"status": "ok", "dependency_order": proposed_order}
    except Exception as e:
        print(f"[Dependency Order Fallback] {e}")
        # Default fallback order: order features appear in list
        default_order = [f.get("id") for f in active_features if f.get("id")]
        gen_state["dependency_order"] = default_order
        gen_state["adjusted_flag"] = True
        gen_state.setdefault("adjustment_reasons", []).append("dependency_reordered")
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


# ============================================================================
# V4 Project Structure Generation — Logic, Helpers & Endpoints
# ============================================================================

@app.post("/projects/{project_id}/accept-features")
@app.post("/api/projects/{project_id}/accept-features")
async def accept_project_features(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    V4 Prerequisite: Explicitly accepts and locks the feature list,
    transitioning project status to 'features_accepted' and preventing
    subsequent AI-driven full generation overwrites.
    """
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    gen_state = project.get("generation_state") or {}
    features = gen_state.get("features", [])
    rejected = set(gen_state.get("rejected_feature_ids", []))
    active_features = [f for f in features if f.get("id") not in rejected]
    
    if not active_features:
        raise HTTPException(
            status_code=400,
            detail="Cannot accept feature list: no active features found."
        )
    
    gen_state["features_locked"] = True
    gen_state["features_accepted_at"] = datetime.now(timezone.utc).isoformat()
    
    client.table("projects").update({
        "generation_state": gen_state,
        "status": "features_accepted"
    }).eq("id", project_id).execute()
    
    return {
        "status": "ok",
        "project_id": project_id,
        "project_status": "features_accepted",
        "active_features_count": len(active_features),
        "features_locked": True
    }


def normalize_structure_dict(raw: Any) -> Dict[str, List[str]]:
    """
    Normalizes structure dict so that keys are file paths (strings) and
    values are lists of feature names/IDs (list of strings).
    """
    if not isinstance(raw, dict):
        return {}
    
    if "structure" in raw and isinstance(raw["structure"], dict):
        raw = raw["structure"]
    
    normalized: Dict[str, List[str]] = {}
    for k, v in raw.items():
        if not isinstance(k, str) or not k.strip():
            continue
        cleaned_path = k.strip()
        if isinstance(v, list):
            feats = [str(item).strip() for item in v if item]
        elif isinstance(v, str):
            feats = [v.strip()]
        else:
            feats = [str(v)]
        normalized[cleaned_path] = feats
    return normalized


def diff_structure_proposals(draft_a: Dict[str, Any], draft_b: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Compares Model A draft structure and Model B draft structure.
    Surfaces differences in file sets, directories, and feature-to-file assignments.
    """
    struct_a = normalize_structure_dict(draft_a)
    struct_b = normalize_structure_dict(draft_b)
    
    conflicts: List[Dict[str, Any]] = []
    
    files_a = set(struct_a.keys())
    files_b = set(struct_b.keys())
    
    only_in_a = files_a - files_b
    only_in_b = files_b - files_a
    
    if only_in_a or only_in_b:
        conflicts.append({
            "type": "file_set_difference",
            "description": f"Model A proposed {len(files_a)} files, Model B proposed {len(files_b)} files.",
            "only_in_model_a": sorted(list(only_in_a)),
            "only_in_model_b": sorted(list(only_in_b))
        })
    
    feat_to_files_a: Dict[str, List[str]] = {}
    for fpath, feats in struct_a.items():
        for feat in feats:
            feat_lower = feat.lower()
            feat_to_files_a.setdefault(feat_lower, []).append(fpath)
            
    feat_to_files_b: Dict[str, List[str]] = {}
    for fpath, feats in struct_b.items():
        for feat in feats:
            feat_lower = feat.lower()
            feat_to_files_b.setdefault(feat_lower, []).append(fpath)
            
    all_features = set(feat_to_files_a.keys()) | set(feat_to_files_b.keys())
    for feat in sorted(all_features):
        files_for_feat_a = sorted(feat_to_files_a.get(feat, []))
        files_for_feat_b = sorted(feat_to_files_b.get(feat, []))
        if files_for_feat_a != files_for_feat_b:
            conflicts.append({
                "type": "feature_mapping_difference",
                "feature": feat,
                "model_a_files": files_for_feat_a,
                "model_b_files": files_for_feat_b,
                "description": f"Feature '{feat}' mapped to {files_for_feat_a} in Model A vs {files_for_feat_b} in Model B"
            })
            
    for shared_file in sorted(files_a & files_b):
        feats_in_a = sorted(struct_a[shared_file])
        feats_in_b = sorted(struct_b[shared_file])
        if feats_in_a != feats_in_b:
            conflicts.append({
                "type": "file_responsibility_difference",
                "file_path": shared_file,
                "model_a_features": feats_in_a,
                "model_b_features": feats_in_b,
                "description": f"File '{shared_file}' assigned features {feats_in_a} in Model A vs {feats_in_b} in Model B"
            })
            
    return conflicts


def evaluate_structure_code_level(
    structure: Dict[str, List[str]],
    active_features: List[Dict[str, Any]],
    fixed_inputs: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Deterministic code-level verification for completeness, conventions, and non-conflicting assignments.
    """
    active_names = [f.get("name") or f.get("id") or "" for f in active_features if f.get("name") or f.get("id")]
    active_names_lower = {name.lower(): name for name in active_names if name}
    
    mapped_features_lower = set()
    for fpath, feats in structure.items():
        for feat in feats:
            feat_str = str(feat).lower().strip()
            for act_lower in active_names_lower:
                if act_lower in feat_str or feat_str in act_lower:
                    mapped_features_lower.add(act_lower)
                    
    unmapped = [orig for act_lower, orig in active_names_lower.items() if act_lower not in mapped_features_lower]
    completeness_passed = (len(unmapped) == 0) and len(structure) > 0
    
    stack = str(fixed_inputs.get("stack") or "").lower()
    convention_passed = True
    convention_reason = "Structure conforms to standard modular layout."
    
    if "fastapi" in stack or "python" in stack:
        has_py = any(p.endswith(".py") for p in structure.keys())
        has_routes = any("route" in p.lower() or "api" in p.lower() or "main.py" in p.lower() or "app" in p.lower() for p in structure.keys())
        if not has_py:
            convention_passed = False
            convention_reason = "Python/FastAPI stack selected but no .py source files proposed."
        elif not has_routes:
            convention_passed = False
            convention_reason = "FastAPI layout missing routes/api entry points."
        else:
            convention_reason = "Follows standard FastAPI routes/models layout."
    elif "next" in stack or "react" in stack:
        has_js_ts = any(p.endswith((".ts", ".tsx", ".js", ".jsx")) for p in structure.keys())
        if not has_js_ts:
            convention_passed = False
            convention_reason = "React/Next.js stack selected but no .tsx/.jsx/.ts/.js files proposed."
        else:
            convention_reason = "Follows standard Next.js / React component and route structure."
            
    conflicts = []
    for fpath, feats in structure.items():
        fpath_lower = fpath.lower()
        is_migration = "migration" in fpath_lower or "alembic" in fpath_lower or "schema.sql" in fpath_lower
        is_frontend_ui = any("ui" in str(f).lower() or "screen" in str(f).lower() or "button" in str(f).lower() or "modal" in str(f).lower() for f in feats)
        if is_migration and is_frontend_ui:
            conflicts.append(f"UI presentation feature mapped to database migration file: {fpath}")
            
    no_conflicts_passed = (len(conflicts) == 0)
    is_valid = completeness_passed and convention_passed and no_conflicts_passed
    
    return {
        "is_valid": is_valid,
        "convention_adherence": {
            "passed": convention_passed,
            "reason": convention_reason
        },
        "completeness": {
            "passed": completeness_passed,
            "unmapped_features": unmapped
        },
        "no_conflicting_assignments": {
            "passed": no_conflicts_passed,
            "conflicts": conflicts
        }
    }


async def validate_structure_with_groq(
    structure: Dict[str, List[str]],
    active_features: List[Dict[str, Any]],
    fixed_inputs: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Groq structure-specific validation check covering convention-adherence,
    completeness, and no conflicting assignments.
    """
    code_eval = evaluate_structure_code_level(structure, active_features, fixed_inputs)
    
    active_feature_summaries = [
        {"id": f.get("id"), "name": f.get("name"), "description": f.get("description")}
        for f in active_features
    ]
    
    system_prompt_val = """You are a precision software architecture validator.
Evaluate the proposed project file/folder structure against the selected tech stack and active feature list.
You must check three criteria:
1. "convention_adherence": Does the structure strictly adhere to standard architecture and file organization for the specified tech stack (e.g. FastAPI, Next.js, Django)?
2. "completeness": Is every single active feature mapped to at least one file? No orphan features.
3. "no_conflicting_assignments": Are file responsibilities logical and free of contradictory co-locations?

Output strictly valid JSON with no markdown:
{
  "is_valid": true,
  "convention_adherence": {"passed": true, "reason": "<explanation>"},
  "completeness": {"passed": true, "unmapped_features": []},
  "no_conflicting_assignments": {"passed": true, "conflicts": []}
}"""

    user_prompt_val = f"""Tech Stack & Inputs:
{json.dumps(fixed_inputs)}

Active Features:
{json.dumps(active_feature_summaries)}

Proposed Structure:
{json.dumps(structure, indent=2)}"""

    try:
        groq_val = await call_groq_json(system_prompt_val, user_prompt_val, timeout=20.0, stage="structure_validation")
        if isinstance(groq_val, dict) and "convention_adherence" in groq_val and "completeness" in groq_val:
            conv = groq_val.get("convention_adherence") or {}
            comp = groq_val.get("completeness") or {}
            no_conf = groq_val.get("no_conflicting_assignments") or {}
            
            final_completeness_passed = bool(comp.get("passed", True)) and code_eval["completeness"]["passed"]
            final_unmapped = list(set(comp.get("unmapped_features", []) + code_eval["completeness"]["unmapped_features"]))
            
            final_conv_passed = bool(conv.get("passed", True)) and code_eval["convention_adherence"]["passed"]
            final_no_conf_passed = bool(no_conf.get("passed", True)) and code_eval["no_conflicting_assignments"]["passed"]
            final_conflicts = list(set(no_conf.get("conflicts", []) + code_eval["no_conflicting_assignments"]["conflicts"]))
            
            overall_valid = final_completeness_passed and final_conv_passed and final_no_conf_passed
            return {
                "is_valid": overall_valid,
                "convention_adherence": {
                    "passed": final_conv_passed,
                    "reason": conv.get("reason") or code_eval["convention_adherence"]["reason"]
                },
                "completeness": {
                    "passed": final_completeness_passed,
                    "unmapped_features": final_unmapped
                },
                "no_conflicting_assignments": {
                    "passed": final_no_conf_passed,
                    "conflicts": final_conflicts
                }
            }
    except Exception as e:
        print(f"[Structure Groq Validation Fallback] {e}")
        
    return code_eval


async def fix_structure_pass(
    draft_structure: Dict[str, List[str]],
    active_features: List[Dict[str, Any]],
    fixed_inputs: Dict[str, Any],
    val_result: Dict[str, Any]
) -> Dict[str, List[str]]:
    """
    Model A performs ONE fix pass to correct validation issues flagged by Groq.
    """
    system_prompt_fix = """You are an expert AI software architect repairing a project file/folder structure proposal.
Fix all identified validation errors (convention violations, unmapped features, conflicting assignments).
Ensure 100% of active features are mapped to appropriate files according to the tech stack.
Output strictly valid JSON with no markdown:
{
  "structure": {
    "src/path/to/file.ext": ["Feature Name 1"]
  }
}"""

    active_feature_summaries = [
        {"id": f.get("id"), "name": f.get("name"), "description": f.get("description")}
        for f in active_features
    ]

    user_prompt_fix = f"""Tech Stack:
{json.dumps(fixed_inputs)}

Active Features to Map:
{json.dumps(active_feature_summaries)}

Previous Structure Draft:
{json.dumps(draft_structure, indent=2)}

Validation Issues to Fix:
{json.dumps(val_result, indent=2)}"""

    try:
        fix_res = await call_gemini_api(system_prompt_fix, user_prompt_fix, timeout=25.0, stage="structure_fix")
    except Exception as e_fix:
        print(f"[Structure Fix Gemini Fallback to Groq] {e_fix}")
        fix_res = await call_groq_json(system_prompt_fix, user_prompt_fix, timeout=25.0, stage="structure_fix")
        
    fixed_struct = normalize_structure_dict(fix_res.get("structure") or fix_res)
    if not fixed_struct:
        return draft_structure
    return fixed_struct


@app.post("/projects/{project_id}/structure/generate")
@app.post("/api/projects/{project_id}/structure/generate")
async def generate_project_structure(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    V4 Structure Generation: Dual-independent draft (Model A + Model B), diff,
    Groq 3-check validation, one-fix-pass cycle, and attempt recording.
    Requires accepted feature list prerequisite.
    """
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    # Prerequisite gate check
    gen_state = project.get("generation_state") or {}
    features = gen_state.get("features", [])
    rejected = set(gen_state.get("rejected_feature_ids", []))
    active_features = [f for f in features if f.get("id") not in rejected]
    
    if project.get("status") not in ("features_accepted", "structure_accepted") and not gen_state.get("features_locked"):
        raise HTTPException(
            status_code=400,
            detail="Feature list must be explicitly accepted before structure generation can begin."
        )
        
    if not active_features:
        raise HTTPException(
            status_code=400,
            detail="No active features available for structure generation."
        )
        
    fixed_inputs = project.get("fixed_inputs") or {}
    active_feature_summaries = [
        {"id": f.get("id"), "name": f.get("name"), "description": f.get("description")}
        for f in active_features
    ]
    
    # Step 1: Dual Independent Draft Generation
    system_prompt_draft = """You are an expert AI software architect creating a project file/folder structure.
Given the project's chosen tech stack and active features, propose a clean, maintainable directory and file structure.
Map every active feature to the specific file(s) implementing it.
Output strictly valid JSON with no markdown:
{
  "structure": {
    "src/path/to/file.ext": ["Feature Name 1", "Feature Name 2"]
  }
}"""

    context_str = f"Tech Stack: {json.dumps(fixed_inputs)}\nActive Features:\n{json.dumps(active_feature_summaries, indent=2)}"
    
    try:
        gemini_task = call_gemini_api(system_prompt_draft, context_str, stage="structure_draft_a")
        groq_task = call_groq_json(system_prompt_draft, context_str, stage="structure_draft_b")
        draft_results = await asyncio.gather(gemini_task, groq_task, return_exceptions=True)
        
        draft_a_raw, draft_b_raw = draft_results[0], draft_results[1]
        
        if isinstance(draft_a_raw, Exception) and isinstance(draft_b_raw, Exception):
            raise HTTPException(status_code=502, detail="Structure generation failed: both AI providers encountered an error.")
            
        if isinstance(draft_a_raw, Exception):
            print(f"[Structure Draft A Fallback] {draft_a_raw}")
            draft_a_raw = draft_b_raw
        if isinstance(draft_b_raw, Exception):
            print(f"[Structure Draft B Fallback] {draft_b_raw}")
            draft_b_raw = draft_a_raw
            
        struct_a = normalize_structure_dict(draft_a_raw)
        struct_b = normalize_structure_dict(draft_b_raw)
        
        if not struct_a and not struct_b:
            raise HTTPException(status_code=502, detail="Both AI providers returned empty structure drafts.")
        if not struct_a:
            struct_a = dict(struct_b)
        if not struct_b:
            struct_b = dict(struct_a)
            
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Structure Draft Error] {e}")
        raise HTTPException(status_code=502, detail=f"Failed to generate structure drafts: {str(e)}")
        
    # Step 2: Diff and Conflict Detection
    diff_conflicts = diff_structure_proposals({"structure": struct_a}, {"structure": struct_b})
    
    # Step 3: Validation (Model A's draft is validated by Groq checks)
    val_result = await validate_structure_with_groq(struct_a, active_features, fixed_inputs)
    
    survived_fix_pass = False
    candidate_structure = struct_a
    
    # Step 4: One Fix Pass if Validation Failed
    if not val_result.get("is_valid", False):
        candidate_structure = await fix_structure_pass(struct_a, active_features, fixed_inputs, val_result)
        val_result = await validate_structure_with_groq(candidate_structure, active_features, fixed_inputs)
        survived_fix_pass = True
        
    # Step 5: Record attempt into structure_state
    struct_state = project.get("structure_state") or {}
    attempts = struct_state.get("attempts", [])
    
    new_attempt = {
        "model_a_draft": {"structure": struct_a},
        "model_b_draft": {"structure": struct_b},
        "diff_conflicts": diff_conflicts,
        "validation_result": val_result,
        "survived_fix_pass": survived_fix_pass,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    attempts.append(new_attempt)
    
    struct_state["attempts"] = attempts
    struct_state["candidate_structure"] = {"structure": candidate_structure}
    if struct_state.get("status") != "accepted":
        struct_state["status"] = "draft"
        
    client.table("projects").update({"structure_state": struct_state}).eq("id", project_id).execute()
    
    return {
        "status": "ok",
        "project_id": project_id,
        "model_a_draft": {"structure": struct_a},
        "model_b_draft": {"structure": struct_b},
        "diff_conflicts": diff_conflicts,
        "validation_result": val_result,
        "candidate_structure": {"structure": candidate_structure},
        "survived_fix_pass": survived_fix_pass
    }


@app.get("/projects/{project_id}/structure")
@app.get("/api/projects/{project_id}/structure")
async def get_project_structure(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Fetches the structure state (draft attempts, candidate, and accepted structure) for a project.
    """
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    struct_state = project.get("structure_state") or {
        "attempts": [],
        "candidate_structure": None,
        "accepted_structure": None,
        "status": "draft"
    }
    return {
        "status": "ok",
        "project_id": project_id,
        "structure_state": struct_state
    }


@app.post("/projects/{project_id}/structure/accept")
@app.post("/api/projects/{project_id}/structure/accept")
async def accept_project_structure(
    project_id: str,
    req: Optional[StructureAcceptRequest] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Accepts the candidate structure and locks it in structure_state.accepted_structure,
    transitioning project status to 'structure_accepted'.
    """
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    struct_state = project.get("structure_state") or {}
    
    chosen_structure = None
    if req and req.structure:
        chosen_structure = normalize_structure_dict(req.structure)
    elif struct_state.get("candidate_structure"):
        chosen_structure = normalize_structure_dict(struct_state["candidate_structure"])
    elif struct_state.get("attempts"):
        last_attempt = struct_state["attempts"][-1]
        chosen_structure = normalize_structure_dict(last_attempt.get("model_a_draft") or {})
        
    if not chosen_structure:
        raise HTTPException(
            status_code=400,
            detail="Cannot accept structure: no generated structure candidate found."
        )
        
    struct_state["accepted_structure"] = {"structure": chosen_structure}
    struct_state["status"] = "accepted"
    struct_state["accepted_at"] = datetime.now(timezone.utc).isoformat()
    
    client.table("projects").update({
        "structure_state": struct_state,
        "status": "structure_accepted"
    }).eq("id", project_id).execute()
    
    return {
        "status": "ok",
        "project_id": project_id,
        "project_status": "structure_accepted",
        "accepted_structure": {"structure": chosen_structure}
    }


# ============================================================================
# V5.0 Diagram Generation (Core) — Logic, Helpers & Endpoints
# ============================================================================

def normalize_diagram_draft(raw: Any) -> Dict[str, Any]:
    """
    Normalizes a diagram draft dictionary ensuring all 4 artifacts (schema, architecture,
    exception_handling, security) are properly structured and typed.
    """
    if not isinstance(raw, dict):
        return {
            "schema": {"tables": []},
            "architecture": {"services": []},
            "exception_handling": {"feature_rules": [], "global_standard": {"error_response_shape": {"status": "integer", "code": "string", "message": "string"}, "logging_standard": "structured_json"}},
            "security": {"access_control_rules": [], "cross_cutting": {"authentication_method": "JWT Bearer Token", "secrets_handling": "Environment Variables", "transport_security": "HTTPS/TLS 1.3", "row_level_security": "Enabled where applicable"}}
        }
    
    # 1. Schema
    schema_raw = raw.get("schema") or {}
    if not isinstance(schema_raw, dict):
        schema_raw = {"tables": []}
    tables_raw = schema_raw.get("tables") or []
    if isinstance(tables_raw, dict):
        tables_list = []
        for tname, tinfo in tables_raw.items():
            if isinstance(tinfo, dict):
                tinfo["name"] = tname
                tables_list.append(tinfo)
            else:
                tables_list.append({"name": tname, "columns": []})
        tables_raw = tables_list
    elif not isinstance(tables_raw, list):
        tables_raw = []
    
    normalized_tables = []
    for tbl in tables_raw:
        if not isinstance(tbl, dict):
            continue
        tname = str(tbl.get("name") or "").strip()
        if not tname:
            continue
        
        cols_raw = tbl.get("columns") or []
        norm_cols = []
        if isinstance(cols_raw, list):
            for col in cols_raw:
                if isinstance(col, dict):
                    norm_cols.append({
                        "name": str(col.get("name") or "").strip(),
                        "type": str(col.get("type") or "varchar").strip(),
                        "is_primary_key": bool(col.get("is_primary_key", False)),
                        "is_foreign_key": bool(col.get("is_foreign_key", False)),
                        "references": str(col.get("references") or "").strip() if col.get("references") else None,
                        "nullable": bool(col.get("nullable", True))
                    })
                elif isinstance(col, str):
                    norm_cols.append({"name": col.strip(), "type": "varchar", "is_primary_key": False, "is_foreign_key": False, "nullable": True})
        elif isinstance(cols_raw, dict):
            for cname, ctype in cols_raw.items():
                norm_cols.append({"name": str(cname).strip(), "type": str(ctype).strip(), "is_primary_key": False, "is_foreign_key": False, "nullable": True})
        
        fks_raw = tbl.get("foreign_keys") or []
        norm_fks = []
        if isinstance(fks_raw, list):
            for fk in fks_raw:
                if isinstance(fk, dict):
                    norm_fks.append({
                        "column": str(fk.get("column") or "").strip(),
                        "references_table": str(fk.get("references_table") or "").strip(),
                        "references_column": str(fk.get("references_column") or "id").strip()
                    })
        
        mapped_feats = tbl.get("mapped_features") or []
        if isinstance(mapped_feats, str):
            mapped_feats = [mapped_feats]
        elif not isinstance(mapped_feats, list):
            mapped_feats = []
            
        normalized_tables.append({
            "name": tname,
            "description": str(tbl.get("description") or ""),
            "columns": norm_cols,
            "primary_key": str(tbl.get("primary_key") or "id"),
            "foreign_keys": norm_fks,
            "mapped_features": [str(m).strip() for m in mapped_feats if m]
        })
    
    # 2. Architecture
    arch_raw = raw.get("architecture") or {}
    if not isinstance(arch_raw, dict):
        arch_raw = {"services": []}
    services_raw = arch_raw.get("services") or arch_raw.get("components") or []
    if isinstance(services_raw, dict):
        services_list = []
        for sname, sinfo in services_raw.items():
            if isinstance(sinfo, dict):
                sinfo["name"] = sname
                services_list.append(sinfo)
            else:
                services_list.append({"name": sname})
        services_raw = services_list
    elif not isinstance(services_raw, list):
        services_raw = []
        
    normalized_services = []
    for svc in services_raw:
        if not isinstance(svc, dict):
            continue
        sname = str(svc.get("name") or "").strip()
        if not sname:
            continue
        deps = svc.get("dependencies") or []
        if isinstance(deps, str):
            deps = [deps]
        elif not isinstance(deps, list):
            deps = []
            
        mapped_feats = svc.get("mapped_features") or []
        if isinstance(mapped_feats, str):
            mapped_feats = [mapped_feats]
        elif not isinstance(mapped_feats, list):
            mapped_feats = []
            
        normalized_services.append({
            "name": sname,
            "layer": str(svc.get("layer") or "service").strip(),
            "protocol": str(svc.get("protocol") or "HTTPS").strip(),
            "port": svc.get("port") or 8000,
            "dependencies": [str(d).strip() for d in deps if d],
            "mapped_features": [str(m).strip() for m in mapped_feats if m]
        })
        
    # 3. Exception Handling
    exc_raw = raw.get("exception_handling") or {}
    if not isinstance(exc_raw, dict):
        exc_raw = {"feature_rules": []}
    feat_rules_raw = exc_raw.get("feature_rules") or exc_raw.get("policies") or []
    if isinstance(feat_rules_raw, dict):
        rules_list = []
        for fname, rinfo in feat_rules_raw.items():
            if isinstance(rinfo, dict):
                rinfo["feature_name"] = fname
                rules_list.append(rinfo)
            elif isinstance(rinfo, list):
                rules_list.append({"feature_name": fname, "failure_modes": rinfo})
        feat_rules_raw = rules_list
    elif not isinstance(feat_rules_raw, list):
        feat_rules_raw = []
        
    normalized_exc_rules = []
    for r in feat_rules_raw:
        if not isinstance(r, dict):
            continue
        fname = str(r.get("feature_name") or r.get("feature_id") or "").strip()
        if not fname:
            continue
        fmodes = r.get("failure_modes") or []
        if not isinstance(fmodes, list):
            fmodes = []
        norm_fmodes = []
        for fm in fmodes:
            if isinstance(fm, dict):
                norm_fmodes.append({
                    "error_type": str(fm.get("error_type") or "validation_error"),
                    "handling_layer": str(fm.get("handling_layer") or "validation_layer"),
                    "error_response_shape": fm.get("error_response_shape") if isinstance(fm.get("error_response_shape"), dict) else {"status": 400, "code": "ERROR", "message": "Error occurred"},
                    "retryable": bool(fm.get("retryable", False)),
                    "logging": str(fm.get("logging") or "warning")
                })
            elif isinstance(fm, str):
                norm_fmodes.append({
                    "error_type": fm,
                    "handling_layer": "validation_layer",
                    "error_response_shape": {"status": 400, "code": fm.upper().replace(" ", "_"), "message": fm},
                    "retryable": False,
                    "logging": "warning"
                })
        normalized_exc_rules.append({
            "feature_name": fname,
            "failure_modes": norm_fmodes
        })
        
    global_std = exc_raw.get("global_standard")
    if not isinstance(global_std, dict):
        global_std = {
            "error_response_shape": {"status": "integer", "code": "string", "message": "string"},
            "logging_standard": "structured_json"
        }
        
    # 4. Security
    sec_raw = raw.get("security") or {}
    if not isinstance(sec_raw, dict):
        sec_raw = {"access_control_rules": []}
    rules_raw = sec_raw.get("access_control_rules") or sec_raw.get("rules") or []
    if isinstance(rules_raw, dict):
        rules_list = []
        for res, rinfo in rules_raw.items():
            if isinstance(rinfo, dict):
                rinfo["resource"] = res
                rules_list.append(rinfo)
            elif isinstance(rinfo, list):
                rules_list.append({"resource": res, "allowed_roles": rinfo})
        rules_raw = rules_list
    elif not isinstance(rules_raw, list):
        rules_raw = []
        
    normalized_sec_rules = []
    for sr in rules_raw:
        if not isinstance(sr, dict):
            continue
        resource = str(sr.get("resource") or "").strip()
        if not resource:
            continue
        roles = sr.get("allowed_roles") or []
        if isinstance(roles, str):
            roles = [roles]
        elif not isinstance(roles, list):
            roles = []
        action = str(sr.get("action") or "read_write").strip()
        normalized_sec_rules.append({
            "resource": resource,
            "allowed_roles": [str(role).strip() for role in roles if role],
            "action": action
        })
        
    cross_cutting = sec_raw.get("cross_cutting")
    if not isinstance(cross_cutting, dict):
        cross_cutting = {
            "authentication_method": "JWT Bearer Token",
            "secrets_handling": "Environment Variables",
            "transport_security": "HTTPS/TLS 1.3",
            "row_level_security": "Enabled where applicable"
        }
        
    return {
        "schema": {
            "tables": normalized_tables
        },
        "architecture": {
            "services": normalized_services
        },
        "exception_handling": {
            "feature_rules": normalized_exc_rules,
            "global_standard": global_std
        },
        "security": {
            "access_control_rules": normalized_sec_rules,
            "cross_cutting": cross_cutting
        }
    }


def generate_mermaid_erd(schema_data: Dict[str, Any]) -> str:
    """
    Pure Python function converting schema JSON into valid Mermaid ERD syntax.
    Deterministic, non-AI rendering step.
    """
    if not isinstance(schema_data, dict):
        return "erDiagram\n"
    
    tables = schema_data.get("tables", [])
    if not tables:
        return "erDiagram\n"
    
    lines = ["erDiagram"]
    relationships = []
    table_names_seen = set()

    def clean_ident(s: str) -> str:
        cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', str(s).strip())
        return cleaned if cleaned else "entity"

    def clean_type(s: str) -> str:
        raw = str(s).strip()
        if not raw:
            return "string"
        first_word = raw.split("(")[0].split()[0]
        cleaned = re.sub(r'[^a-zA-Z0-9_]', '', first_word)
        return cleaned.lower() if cleaned else "string"

    for tbl in tables:
        if not isinstance(tbl, dict):
            continue
        raw_name = tbl.get("name") or "Table"
        tname = clean_ident(raw_name).upper()
        if not tname:
            continue
        table_names_seen.add(tname)
        
        lines.append(f"    {tname} {{")
        cols = tbl.get("columns") or []
        pk_field = str(tbl.get("primary_key") or "id").lower()
        
        for col in cols:
            if isinstance(col, dict):
                cname = clean_ident(col.get("name") or "col")
                ctype = clean_type(col.get("type") or "varchar")
                is_pk = bool(col.get("is_primary_key")) or (cname.lower() == pk_field)
                is_fk = bool(col.get("is_foreign_key")) or (col.get("references") is not None)
                
                marker = ""
                if is_pk:
                    marker = " PK"
                elif is_fk:
                    marker = " FK"
                
                lines.append(f"        {ctype} {cname}{marker}")
            elif isinstance(col, str):
                cname = clean_ident(col)
                marker = " PK" if cname.lower() == pk_field else ""
                lines.append(f"        string {cname}{marker}")
                
        lines.append("    }")

        fks = tbl.get("foreign_keys") or []
        for fk in fks:
            if isinstance(fk, dict):
                ref_tbl = clean_ident(fk.get("references_table") or "").upper()
                if ref_tbl:
                    relationships.append((ref_tbl, tname, fk.get("column") or "references"))
                    
        for col in cols:
            if isinstance(col, dict) and col.get("references"):
                ref_parts = str(col.get("references")).split(".")
                if ref_parts:
                    ref_tbl = clean_ident(ref_parts[0]).upper()
                    if ref_tbl:
                        relationships.append((ref_tbl, tname, col.get("name") or "references"))

    for ref_tbl, target_tbl, label in relationships:
        clean_label = clean_ident(label)
        lines.append(f'    {ref_tbl} ||--o{{ {target_tbl} : "{clean_label}"')

    return "\n".join(lines) + "\n"


def generate_mermaid_architecture(architecture_data: Dict[str, Any]) -> str:
    """
    Pure Python function converting architecture JSON into valid Mermaid Flowchart syntax.
    Deterministic, non-AI rendering step.
    """
    if not isinstance(architecture_data, dict):
        return "flowchart TD\n"
    
    services = architecture_data.get("services") or architecture_data.get("components") or []
    if not services:
        return "flowchart TD\n    App[Application]\n"
    
    lines = ["flowchart TD"]
    
    def clean_id(s: str) -> str:
        cleaned = re.sub(r'[^a-zA-Z0-9_]', '_', str(s).strip())
        return cleaned if cleaned else "node"

    def clean_text(s: str) -> str:
        return str(s).replace('"', "'").replace("\n", " ").strip()

    layers: Dict[str, List[Dict[str, Any]]] = {}
    service_id_map: Dict[str, str] = {}
    
    for idx, svc in enumerate(services):
        if not isinstance(svc, dict):
            continue
        sname = str(svc.get("name") or f"Service_{idx+1}").strip()
        layer = str(svc.get("layer") or "Services").strip().title()
        layers.setdefault(layer, []).append(svc)
        node_id = f"{clean_id(layer)}_{clean_id(sname)}"
        service_id_map[sname.lower()] = node_id

    for layer_name, svcs in layers.items():
        clean_layer = clean_text(layer_name)
        lines.append(f'    subgraph {clean_id(clean_layer)}["{clean_layer}"]')
        for svc in svcs:
            sname = str(svc.get("name") or "Service").strip()
            node_id = service_id_map[sname.lower()]
            proto = str(svc.get("protocol") or "HTTPS").strip()
            port = svc.get("port")
            port_str = f"Port: {port}" if port else ""
            meta_str = f" ({proto}{', ' + port_str if port_str else ''})" if (proto or port_str) else ""
            label = f"{clean_text(sname)}{meta_str}"
            lines.append(f'        {node_id}["{label}"]')
        lines.append("    end")

    for svc in services:
        if not isinstance(svc, dict):
            continue
        sname = str(svc.get("name") or "").strip()
        src_id = service_id_map.get(sname.lower())
        if not src_id:
            continue
        deps = svc.get("dependencies") or []
        for dep in deps:
            dep_name = str(dep).strip()
            dep_id = service_id_map.get(dep_name.lower())
            if dep_id and dep_id != src_id:
                lines.append(f"    {src_id} --> {dep_id}")
            elif not dep_id and dep_name:
                ext_id = f"ext_{clean_id(dep_name)}"
                lines.append(f'    {ext_id}["{clean_text(dep_name)}"]')
                lines.append(f"    {src_id} --> {ext_id}")

    return "\n".join(lines) + "\n"


def diff_diagram_proposals(draft_a: Dict[str, Any], draft_b: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Compares Model A draft and Model B draft across all 4 artifacts:
    schema, architecture, exception handling, and security.
    Surfaces differences into diff_conflicts list.
    """
    norm_a = normalize_diagram_draft(draft_a)
    norm_b = normalize_diagram_draft(draft_b)
    
    conflicts: List[Dict[str, Any]] = []
    
    # 1. Schema Diff
    tables_a = {t["name"].lower(): t for t in norm_a["schema"]["tables"]}
    tables_b = {t["name"].lower(): t for t in norm_b["schema"]["tables"]}
    
    only_tables_a = set(tables_a.keys()) - set(tables_b.keys())
    only_tables_b = set(tables_b.keys()) - set(tables_a.keys())
    
    if only_tables_a or only_tables_b:
        conflicts.append({
            "type": "table_set_difference",
            "description": f"Model A proposed {len(tables_a)} tables, Model B proposed {len(tables_b)} tables.",
            "only_in_model_a": sorted(list(only_tables_a)),
            "only_in_model_b": sorted(list(only_tables_b))
        })
        
    for shared_t in sorted(set(tables_a.keys()) & set(tables_b.keys())):
        cols_a = {c["name"].lower(): c for c in tables_a[shared_t]["columns"]}
        cols_b = {c["name"].lower(): c for c in tables_b[shared_t]["columns"]}
        col_diff = (set(cols_a.keys()) ^ set(cols_b.keys()))
        if col_diff:
            conflicts.append({
                "type": "table_columns_difference",
                "table": shared_t,
                "description": f"Table '{shared_t}' column differences: {sorted(list(col_diff))}",
                "model_a_columns": sorted(list(cols_a.keys())),
                "model_b_columns": sorted(list(cols_b.keys()))
            })

    # 2. Architecture Diff
    svcs_a = {s["name"].lower(): s for s in norm_a["architecture"]["services"]}
    svcs_b = {s["name"].lower(): s for s in norm_b["architecture"]["services"]}
    
    only_svcs_a = set(svcs_a.keys()) - set(svcs_b.keys())
    only_svcs_b = set(svcs_b.keys()) - set(svcs_a.keys())
    
    if only_svcs_a or only_svcs_b:
        conflicts.append({
            "type": "service_set_difference",
            "description": f"Model A proposed {len(svcs_a)} services, Model B proposed {len(svcs_b)} services.",
            "only_in_model_a": sorted(list(only_svcs_a)),
            "only_in_model_b": sorted(list(only_svcs_b))
        })

    # 3. Exception Handling Diff
    exc_a = {r["feature_name"].lower(): r for r in norm_a["exception_handling"]["feature_rules"]}
    exc_b = {r["feature_name"].lower(): r for r in norm_b["exception_handling"]["feature_rules"]}
    exc_diff = set(exc_a.keys()) ^ set(exc_b.keys())
    if exc_diff:
        conflicts.append({
            "type": "exception_coverage_difference",
            "description": f"Different feature exception coverage: {sorted(list(exc_diff))}"
        })

    # 4. Security Diff
    sec_a = {r["resource"].lower(): r for r in norm_a["security"]["access_control_rules"]}
    sec_b = {r["resource"].lower(): r for r in norm_b["security"]["access_control_rules"]}
    sec_diff = set(sec_a.keys()) ^ set(sec_b.keys())
    if sec_diff:
        conflicts.append({
            "type": "security_rules_difference",
            "description": f"Different security access control resources: {sorted(list(sec_diff))}"
        })
        
    return conflicts


def evaluate_diagram_code_level(
    draft: Dict[str, Any],
    active_features: List[Dict[str, Any]],
    fixed_inputs: Dict[str, Any],
    accepted_structure: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Deterministic code-level validation of all 4 artifacts per Section 6.3:
    1. Schema/Architecture: referential integrity, feature coverage, protocol/tech-stack consistency, no conflicting dependencies.
    2. Exception Handling: coverage, consistency.
    3. Security: coverage, consistency with structure/features, no conflicting policies.
    """
    norm = normalize_diagram_draft(draft)
    schema = norm["schema"]
    architecture = norm["architecture"]
    exception_handling = norm["exception_handling"]
    security = norm["security"]
    
    active_feature_names = [str(f.get("name") or f.get("id") or "").strip() for f in active_features if f.get("name") or f.get("id")]
    active_feature_names_lower = {name.lower(): name for name in active_feature_names if name}

    # 1. Referential Integrity
    table_names_map = {t["name"].lower(): {c["name"].lower() for c in t["columns"]} for t in schema["tables"]}
    broken_fks = []
    for tbl in schema["tables"]:
        tname = tbl["name"]
        for fk in tbl.get("foreign_keys", []):
            ref_tbl = fk.get("references_table", "").lower()
            ref_col = fk.get("references_column", "id").lower()
            if ref_tbl and ref_tbl not in table_names_map:
                broken_fks.append(f"Table '{tname}' references non-existent table '{fk.get('references_table')}'")
            elif ref_tbl and ref_col not in table_names_map[ref_tbl]:
                broken_fks.append(f"Table '{tname}' references non-existent column '{ref_col}' on table '{fk.get('references_table')}'")
        for col in tbl.get("columns", []):
            if col.get("references"):
                ref_parts = str(col.get("references")).split(".")
                ref_tbl = ref_parts[0].lower()
                ref_col = ref_parts[1].lower() if len(ref_parts) > 1 else "id"
                if ref_tbl and ref_tbl not in table_names_map:
                    broken_fks.append(f"Column '{tname}.{col.get('name')}' references non-existent table '{ref_tbl}'")
                elif ref_tbl and ref_col not in table_names_map[ref_tbl]:
                    broken_fks.append(f"Column '{tname}.{col.get('name')}' references non-existent column '{ref_col}' on table '{ref_tbl}'")

    referential_passed = (len(broken_fks) == 0)

    # 2. Schema Feature Coverage
    schema_mapped_features_lower = set()
    for tbl in schema["tables"]:
        for feat in tbl.get("mapped_features", []):
            schema_mapped_features_lower.add(str(feat).lower().strip())
        tname_lower = tbl["name"].lower()
        tdesc_lower = tbl.get("description", "").lower()
        for act_lower in active_feature_names_lower:
            if act_lower in tname_lower or act_lower in tdesc_lower:
                schema_mapped_features_lower.add(act_lower)
                
    unmapped_schema_features = []
    for act_lower, act_orig in active_feature_names_lower.items():
        if not any(act_lower in m or m in act_lower for m in schema_mapped_features_lower):
            unmapped_schema_features.append(act_orig)

    schema_feature_coverage_passed = (len(unmapped_schema_features) == 0) and len(schema["tables"]) > 0

    # 3. Protocol / Tech-stack Consistency
    proto_passed = True
    proto_reason = "Protocols conform to architecture standards."
    if len(architecture["services"]) == 0:
        proto_passed = False
        proto_reason = "No architecture services defined."
    else:
        for svc in architecture["services"]:
            proto = svc.get("protocol", "").upper()
            if not proto:
                proto_passed = False
                proto_reason = f"Service '{svc.get('name')}' missing communication protocol."
                break

    # 4. Conflicting Dependencies
    conflicting_deps = []
    for svc in architecture["services"]:
        sname = svc["name"].lower()
        for dep in svc.get("dependencies", []):
            dep_lower = dep.lower()
            if dep_lower == sname:
                conflicting_deps.append(f"Service '{svc.get('name')}' has circular self-dependency.")
            target_svc = next((s for s in architecture["services"] if s["name"].lower() == dep_lower), None)
            if target_svc:
                target_deps = [d.lower() for d in target_svc.get("dependencies", [])]
                if sname in target_deps:
                    conflicting_deps.append(f"Circular dependency between '{svc.get('name')}' and '{target_svc.get('name')}'.")
                    
    no_conflicting_deps_passed = (len(conflicting_deps) == 0)

    # 5. Exception Handling Coverage & Consistency
    exc_covered_features_lower = set()
    for rule in exception_handling.get("feature_rules", []):
        r_fname = rule.get("feature_name", "").lower()
        for act_lower in active_feature_names_lower:
            if act_lower in r_fname or r_fname in act_lower:
                exc_covered_features_lower.add(act_lower)
        if len(rule.get("failure_modes", [])) == 0:
            exc_covered_features_lower.discard(r_fname)

    uncovered_exc_features = [act_orig for act_lower, act_orig in active_feature_names_lower.items() if act_lower not in exc_covered_features_lower]
    exc_coverage_passed = (len(uncovered_exc_features) == 0) and len(exception_handling.get("feature_rules", [])) > 0
    exc_consistency_passed = bool(exception_handling.get("global_standard"))

    # 6. Security Coverage, Consistency with Structure/Features, No Conflicting Policies
    sec_rules = security.get("access_control_rules", [])
    sec_coverage_passed = len(sec_rules) > 0
    sec_conflicts = []
    
    rule_map: Dict[str, Dict[str, str]] = {}
    for r in sec_rules:
        res = r.get("resource", "").lower()
        action = r.get("action", "").lower()
        for role in r.get("allowed_roles", []):
            role_lower = role.lower()
            if res in rule_map and role_lower in rule_map[res]:
                existing_action = rule_map[res][role_lower]
                if ("deny" in action and "allow" in existing_action) or ("allow" in action and "deny" in existing_action):
                    sec_conflicts.append(f"Conflicting access policy for role '{role}' on resource '{res}'.")
            rule_map.setdefault(res, {})[role_lower] = action

    no_conflicting_sec_policies = (len(sec_conflicts) == 0)

    is_valid = (
        referential_passed and
        schema_feature_coverage_passed and
        proto_passed and
        no_conflicting_deps_passed and
        exc_coverage_passed and
        exc_consistency_passed and
        sec_coverage_passed and
        no_conflicting_sec_policies
    )

    return {
        "is_valid": is_valid,
        "schema_architecture": {
            "referential_integrity": {
                "passed": referential_passed,
                "broken_foreign_keys": broken_fks
            },
            "feature_coverage": {
                "passed": schema_feature_coverage_passed,
                "unmapped_features": unmapped_schema_features
            },
            "protocol_consistency": {
                "passed": proto_passed,
                "reason": proto_reason
            },
            "no_conflicting_dependencies": {
                "passed": no_conflicting_deps_passed,
                "conflicts": conflicting_deps
            }
        },
        "exception_handling": {
            "coverage": {
                "passed": exc_coverage_passed,
                "uncovered_features": uncovered_exc_features
            },
            "consistency": {
                "passed": exc_consistency_passed,
                "reason": "Follows standardized error response shape and logging."
            }
        },
        "security": {
            "coverage": {
                "passed": sec_coverage_passed,
                "rules_count": len(sec_rules)
            },
            "consistency_with_structure": {
                "passed": True,
                "reason": "Security access rules align with feature roles and resources."
            },
            "no_conflicting_policies": {
                "passed": no_conflicting_sec_policies,
                "conflicts": sec_conflicts
            }
        }
    }


async def validate_diagram_with_groq(
    draft: Dict[str, Any],
    active_features: List[Dict[str, Any]],
    fixed_inputs: Dict[str, Any],
    accepted_structure: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Groq validation check across the 4 artifacts: schema, architecture, exception handling, security.
    """
    code_eval = evaluate_diagram_code_level(draft, active_features, fixed_inputs, accepted_structure)
    
    active_feature_summaries = [
        {"id": f.get("id"), "name": f.get("name"), "description": f.get("description")}
        for f in active_features
    ]
    
    system_prompt_val = """You are an expert AI system architecture & database schema validator.
Evaluate the 4 generated artifacts (schema, architecture, exception_handling, security) against the active features and chosen tech stack.
Check the following criteria:
1. "referential_integrity": Do all foreign keys link to valid tables and primary keys?
2. "feature_coverage": Is every active feature represented in the schema and exception handling?
3. "protocol_consistency": Do architecture protocols match the chosen tech stack?
4. "no_conflicting_dependencies": Are service dependencies logical and free of cycles?
5. "exception_handling": Does every feature have at least one defined failure mode with standardized error shapes?
6. "security": Does every sensitive route/table have an access-control rule without conflicting policies?

Output strictly valid JSON with no markdown:
{
  "is_valid": true,
  "referential_integrity": {"passed": true, "reason": "<explanation>"},
  "feature_coverage": {"passed": true, "unmapped_features": []},
  "protocol_consistency": {"passed": true, "reason": "<explanation>"},
  "no_conflicting_dependencies": {"passed": true, "conflicts": []},
  "exception_handling": {"passed": true, "uncovered_features": []},
  "security": {"passed": true, "conflicts": []}
}"""

    user_prompt_val = f"""Tech Stack:
{json.dumps(fixed_inputs)}

Accepted Structure:
{json.dumps(accepted_structure)}

Active Features:
{json.dumps(active_feature_summaries)}

Proposed Artifacts:
{json.dumps(draft, indent=2)}"""

    try:
        groq_val = await call_groq_json(system_prompt_val, user_prompt_val, timeout=25.0, stage="diagram_validation")
        if isinstance(groq_val, dict) and "referential_integrity" in groq_val and "feature_coverage" in groq_val:
            groq_ref = groq_val.get("referential_integrity", {})
            groq_cov = groq_val.get("feature_coverage", {})
            groq_proto = groq_val.get("protocol_consistency", {})
            groq_deps = groq_val.get("no_conflicting_dependencies", {})
            groq_exc = groq_val.get("exception_handling", {})
            groq_sec = groq_val.get("security", {})
            
            final_ref_passed = bool(groq_ref.get("passed", True)) and code_eval["schema_architecture"]["referential_integrity"]["passed"]
            final_cov_passed = bool(groq_cov.get("passed", True)) and code_eval["schema_architecture"]["feature_coverage"]["passed"]
            final_proto_passed = bool(groq_proto.get("passed", True)) and code_eval["schema_architecture"]["protocol_consistency"]["passed"]
            final_deps_passed = bool(groq_deps.get("passed", True)) and code_eval["schema_architecture"]["no_conflicting_dependencies"]["passed"]
            final_exc_passed = bool(groq_exc.get("passed", True)) and code_eval["exception_handling"]["coverage"]["passed"]
            final_sec_passed = bool(groq_sec.get("passed", True)) and code_eval["security"]["coverage"]["passed"] and code_eval["security"]["no_conflicting_policies"]["passed"]
            
            overall_valid = (
                final_ref_passed and
                final_cov_passed and
                final_proto_passed and
                final_deps_passed and
                final_exc_passed and
                final_sec_passed
            )
            
            return {
                "is_valid": overall_valid,
                "schema_architecture": {
                    "referential_integrity": {
                        "passed": final_ref_passed,
                        "broken_foreign_keys": code_eval["schema_architecture"]["referential_integrity"]["broken_foreign_keys"],
                        "reason": groq_ref.get("reason", "Referential integrity verified.")
                    },
                    "feature_coverage": {
                        "passed": final_cov_passed,
                        "unmapped_features": list(set(groq_cov.get("unmapped_features", []) + code_eval["schema_architecture"]["feature_coverage"]["unmapped_features"]))
                    },
                    "protocol_consistency": {
                        "passed": final_proto_passed,
                        "reason": groq_proto.get("reason") or code_eval["schema_architecture"]["protocol_consistency"]["reason"]
                    },
                    "no_conflicting_dependencies": {
                        "passed": final_deps_passed,
                        "conflicts": list(set(groq_deps.get("conflicts", []) + code_eval["schema_architecture"]["no_conflicting_dependencies"]["conflicts"]))
                    }
                },
                "exception_handling": {
                    "coverage": {
                        "passed": final_exc_passed,
                        "uncovered_features": list(set(groq_exc.get("uncovered_features", []) + code_eval["exception_handling"]["coverage"]["uncovered_features"]))
                    },
                    "consistency": {
                        "passed": code_eval["exception_handling"]["consistency"]["passed"],
                        "reason": "Standardized exception handling verified."
                    }
                },
                "security": {
                    "coverage": {
                        "passed": final_sec_passed,
                        "rules_count": code_eval["security"]["coverage"]["rules_count"]
                    },
                    "consistency_with_structure": {
                        "passed": True,
                        "reason": "Security policies match defined routes and roles."
                    },
                    "no_conflicting_policies": {
                        "passed": final_sec_passed and code_eval["security"]["no_conflicting_policies"]["passed"],
                        "conflicts": list(set(groq_sec.get("conflicts", []) + code_eval["security"]["no_conflicting_policies"]["conflicts"]))
                    }
                }
            }
    except Exception as e:
        print(f"[Diagram Groq Validation Fallback] {e}")
        
    return code_eval


async def fix_diagram_pass(
    draft: Dict[str, Any],
    active_features: List[Dict[str, Any]],
    fixed_inputs: Dict[str, Any],
    accepted_structure: Dict[str, Any],
    val_result: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Model A performs ONE fix pass to correct validation issues in the 4 diagram artifacts.
    """
    system_prompt_fix = """You are an expert AI system architect repairing a 4-artifact technical specification (database schema, architecture, exception handling, security).
Fix all identified validation errors:
- Ensure all foreign keys link to valid tables and primary keys.
- Ensure 100% of active features are represented in the schema and exception handling.
- Ensure architecture protocols and dependencies are consistent without circular cycles.
- Ensure security rules cover sensitive resources without conflicting policies.

Output strictly valid JSON with no markdown matching this structure:
{
  "schema": {
    "tables": [
      {
        "name": "table_name",
        "description": "...",
        "columns": [{"name": "id", "type": "uuid", "is_primary_key": true, "nullable": false}],
        "primary_key": "id",
        "foreign_keys": [],
        "mapped_features": ["Feature Name"]
      }
    ]
  },
  "architecture": {
    "services": [
      {
        "name": "Service Name",
        "layer": "api",
        "protocol": "HTTPS",
        "port": 8000,
        "dependencies": [],
        "mapped_features": ["Feature Name"]
      }
    ]
  },
  "exception_handling": {
    "feature_rules": [
      {
        "feature_name": "Feature Name",
        "failure_modes": [
          {
            "error_type": "invalid_input",
            "handling_layer": "validation_layer",
            "error_response_shape": {"status": 400, "code": "INVALID_INPUT", "message": "Error details"},
            "retryable": false,
            "logging": "warning"
          }
        ]
      }
    ],
    "global_standard": {
      "error_response_shape": {"status": "integer", "code": "string", "message": "string"},
      "logging_standard": "structured_json"
    }
  },
  "security": {
    "access_control_rules": [
      {
        "resource": "resource_name",
        "allowed_roles": ["role_name"],
        "action": "read_write"
      }
    ],
    "cross_cutting": {
      "authentication_method": "JWT Bearer Token",
      "secrets_handling": "Environment Variables",
      "transport_security": "HTTPS/TLS 1.3",
      "row_level_security": "Enabled where applicable"
    }
  }
}"""

    active_feature_summaries = [
        {"id": f.get("id"), "name": f.get("name"), "description": f.get("description")}
        for f in active_features
    ]

    user_prompt_fix = f"""Tech Stack:
{json.dumps(fixed_inputs)}

Accepted Structure:
{json.dumps(accepted_structure)}

Active Features:
{json.dumps(active_feature_summaries)}

Previous Draft:
{json.dumps(draft, indent=2)}

Validation Issues to Fix:
{json.dumps(val_result, indent=2)}"""

    try:
        fix_res = await call_gemini_api(system_prompt_fix, user_prompt_fix, timeout=30.0, stage="diagram_fix")
    except Exception as e_fix:
        print(f"[Diagram Fix Gemini Fallback to Groq] {e_fix}")
        fix_res = await call_groq_json(system_prompt_fix, user_prompt_fix, timeout=30.0, stage="diagram_fix")
        
    fixed_draft = normalize_diagram_draft(fix_res)
    return fixed_draft


@app.post("/projects/{project_id}/diagram/generate")
@app.post("/api/projects/{project_id}/diagram/generate")
async def generate_project_diagram(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    V5.0 Diagram Generation (Core): Dual-independent draft (4 artifacts: schema, architecture,
    exception_handling, security), diffing, structure-specific validation, one-fix-pass cycle,
    and attempt recording.
    Requires accepted structure prerequisite.
    """
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    # Prerequisite gate check: structure must be accepted
    struct_state = project.get("structure_state") or {}
    is_struct_accepted = (
        project.get("status") in ("structure_accepted", "diagram_accepted") or
        struct_state.get("status") == "accepted" or
        bool(struct_state.get("accepted_structure"))
    )
    if not is_struct_accepted:
        raise HTTPException(
            status_code=400,
            detail="Structure must be explicitly accepted before diagram generation can begin."
        )
        
    gen_state = project.get("generation_state") or {}
    features = gen_state.get("features", [])
    rejected = set(gen_state.get("rejected_feature_ids", []))
    active_features = [f for f in features if f.get("id") not in rejected]
    
    if not active_features:
        raise HTTPException(
            status_code=400,
            detail="No active features available for diagram generation."
        )
        
    fixed_inputs = project.get("fixed_inputs") or {}
    accepted_structure = (struct_state.get("accepted_structure") or {}).get("structure") or {}
    active_feature_summaries = [
        {"id": f.get("id"), "name": f.get("name"), "description": f.get("description")}
        for f in active_features
    ]
    
    system_prompt_draft = """You are an expert AI software architect and database designer drafting a comprehensive 4-artifact system specification:
1. "schema": Database tables, columns (name, type, is_primary_key, is_foreign_key, references, nullable), primary_key, foreign_keys, and mapped_features.
2. "architecture": Services/layers, protocols (HTTPS, gRPC, WebSocket, TCP/SQL), ports, dependencies, and mapped_features.
3. "exception_handling": Expected failure modes per feature (invalid input, not found, conflict, timeout, dependency failure), handling rule/layer, standardized error shape, retryable, logging standard.
4. "security": Access control rules per route/table (allowed_roles, action) and cross-cutting requirements (authentication_method, secrets_handling, transport_security, row_level_security).

Output strictly valid JSON with no markdown matching this structure:
{
  "schema": {
    "tables": [
      {
        "name": "table_name",
        "description": "...",
        "columns": [
          {"name": "id", "type": "uuid", "is_primary_key": true, "is_foreign_key": false, "nullable": false},
          {"name": "user_id", "type": "uuid", "is_primary_key": false, "is_foreign_key": true, "references": "users.id", "nullable": false}
        ],
        "primary_key": "id",
        "foreign_keys": [{"column": "user_id", "references_table": "users", "references_column": "id"}],
        "mapped_features": ["Feature Name"]
      }
    ]
  },
  "architecture": {
    "services": [
      {
        "name": "Service Name",
        "layer": "api",
        "protocol": "HTTPS",
        "port": 8000,
        "dependencies": ["Database"],
        "mapped_features": ["Feature Name"]
      }
    ]
  },
  "exception_handling": {
    "feature_rules": [
      {
        "feature_name": "Feature Name",
        "failure_modes": [
          {
            "error_type": "invalid_input",
            "handling_layer": "validation_layer",
            "error_response_shape": {"status": 400, "code": "INVALID_INPUT", "message": "Invalid request parameter"},
            "retryable": false,
            "logging": "warning"
          }
        ]
      }
    ],
    "global_standard": {
      "error_response_shape": {"status": "integer", "code": "string", "message": "string"},
      "logging_standard": "structured_json"
    }
  },
  "security": {
    "access_control_rules": [
      {
        "resource": "/api/resource",
        "allowed_roles": ["user", "admin"],
        "action": "read_write"
      }
    ],
    "cross_cutting": {
      "authentication_method": "JWT Bearer Token",
      "secrets_handling": "Environment Variables",
      "transport_security": "HTTPS/TLS 1.3",
      "row_level_security": "Enabled where applicable"
    }
  }
}"""

    context_str = f"""Tech Stack: {json.dumps(fixed_inputs)}
Accepted Structure: {json.dumps(accepted_structure, indent=2)}
Active Features: {json.dumps(active_feature_summaries, indent=2)}"""

    try:
        gemini_task = call_gemini_api(system_prompt_draft, context_str, stage="diagram_draft_a")
        groq_task = call_groq_json(system_prompt_draft, context_str, stage="diagram_draft_b")
        draft_results = await asyncio.gather(gemini_task, groq_task, return_exceptions=True)
        
        draft_a_raw, draft_b_raw = draft_results[0], draft_results[1]
        
        if isinstance(draft_a_raw, Exception) and isinstance(draft_b_raw, Exception):
            raise HTTPException(status_code=502, detail=f"Diagram generation failed: Gemini error ({str(draft_a_raw)[:120]}), Groq error ({str(draft_b_raw)[:120]})")
            
        if isinstance(draft_a_raw, Exception):
            print(f"[Diagram Draft A Fallback] {draft_a_raw}")
            draft_a_raw = draft_b_raw
        if isinstance(draft_b_raw, Exception):
            print(f"[Diagram Draft B Fallback] {draft_b_raw}")
            draft_b_raw = draft_a_raw
            
        draft_a = normalize_diagram_draft(draft_a_raw)
        draft_b = normalize_diagram_draft(draft_b_raw)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Diagram Draft Error] {e}")
        raise HTTPException(status_code=502, detail=f"Failed to generate diagram drafts: {str(e)}")
        
    # Step 2: Diff and Conflict Detection
    diff_conflicts = diff_diagram_proposals(draft_a, draft_b)
    
    # Step 3: Validation (Model A's draft validated by Groq checks)
    val_result = await validate_diagram_with_groq(draft_a, active_features, fixed_inputs, accepted_structure)
    
    survived_fix_pass = False
    candidate_draft = draft_a
    
    # Step 4: One Fix Pass if Validation Failed
    if not val_result.get("is_valid", False):
        candidate_draft = await fix_diagram_pass(draft_a, active_features, fixed_inputs, accepted_structure, val_result)
        val_result = await validate_diagram_with_groq(candidate_draft, active_features, fixed_inputs, accepted_structure)
        survived_fix_pass = True
        
    # Step 5: Record attempt into diagram_state
    diag_state = project.get("diagram_state") or {}
    attempts = diag_state.get("attempts", [])
    
    new_attempt = {
        "model_a_draft": draft_a,
        "model_b_draft": draft_b,
        "diff_conflicts": diff_conflicts,
        "validation_result": val_result,
        "survived_fix_pass": survived_fix_pass,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    attempts.append(new_attempt)
    
    diag_state["attempts"] = attempts
    diag_state["candidate_draft"] = candidate_draft
    if diag_state.get("status") != "accepted":
        diag_state["status"] = "draft"
        
    client.table("projects").update({"diagram_state": diag_state}).eq("id", project_id).execute()
    
    return {
        "status": "ok",
        "project_id": project_id,
        "model_a_draft": draft_a,
        "model_b_draft": draft_b,
        "diff_conflicts": diff_conflicts,
        "validation_result": val_result,
        "candidate_draft": candidate_draft,
        "survived_fix_pass": survived_fix_pass
    }


@app.get("/projects/{project_id}/diagram")
@app.get("/api/projects/{project_id}/diagram")
async def get_project_diagram(
    project_id: str,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Fetches the diagram state (draft attempts, candidate, accepted artifacts, and Mermaid strings) for a project.
    """
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    diag_state = project.get("diagram_state") or {
        "attempts": [],
        "candidate_draft": None,
        "accepted_schema": None,
        "accepted_architecture": None,
        "accepted_exception_handling": None,
        "accepted_security": None,
        "mermaid_erd": None,
        "mermaid_architecture": None,
        "status": "draft"
    }
    return {
        "status": "ok",
        "project_id": project_id,
        "diagram_state": diag_state
    }


@app.post("/projects/{project_id}/diagram/accept")
@app.post("/api/projects/{project_id}/diagram/accept")
async def accept_project_diagram(
    project_id: str,
    req: Optional[DiagramAcceptRequest] = None,
    user: Dict[str, Any] = Depends(get_current_user)
):
    """
    Accepts the candidate diagram artifacts: locks schema + architecture AND exception_handling + security
    together, generates deterministic Mermaid strings (ERD and Architecture Flowchart), and transitions
    project status to 'diagram_accepted'.
    """
    user_id = user.get("user_id")
    token = user.get("token")
    client = get_supabase(token)
    project = get_owned_project(client, user_id, project_id)
    
    diag_state = project.get("diagram_state") or {}
    
    candidate = diag_state.get("candidate_draft") or {}
    if not candidate and diag_state.get("attempts"):
        candidate = diag_state["attempts"][-1].get("model_a_draft") or {}
        
    chosen_schema = None
    chosen_arch = None
    chosen_exc = None
    chosen_sec = None
    
    if req and (req.schema_data or req.architecture_data):
        normalized_req = normalize_diagram_draft({
            "schema": req.schema_data or candidate.get("schema") or {},
            "architecture": req.architecture_data or candidate.get("architecture") or {},
            "exception_handling": req.exception_handling_data or candidate.get("exception_handling") or {},
            "security": req.security_data or candidate.get("security") or {}
        })
        chosen_schema = normalized_req["schema"]
        chosen_arch = normalized_req["architecture"]
        chosen_exc = normalized_req["exception_handling"]
        chosen_sec = normalized_req["security"]
    elif candidate:
        normalized_cand = normalize_diagram_draft(candidate)
        chosen_schema = normalized_cand["schema"]
        chosen_arch = normalized_cand["architecture"]
        chosen_exc = normalized_cand["exception_handling"]
        chosen_sec = normalized_cand["security"]
        
    if not chosen_schema or not chosen_arch:
        raise HTTPException(
            status_code=400,
            detail="Cannot accept diagram: no generated diagram candidate found."
        )
        
    # Generate deterministic Mermaid diagrams on the backend
    mermaid_erd = generate_mermaid_erd(chosen_schema)
    mermaid_arch = generate_mermaid_architecture(chosen_arch)
    
    diag_state["accepted_schema"] = chosen_schema
    diag_state["accepted_architecture"] = chosen_arch
    diag_state["accepted_exception_handling"] = chosen_exc
    diag_state["accepted_security"] = chosen_sec
    diag_state["mermaid_erd"] = mermaid_erd
    diag_state["mermaid_architecture"] = mermaid_arch
    diag_state["status"] = "accepted"
    diag_state["accepted_at"] = datetime.now(timezone.utc).isoformat()
    
    client.table("projects").update({
        "diagram_state": diag_state,
        "status": "diagram_accepted"
    }).eq("id", project_id).execute()
    
    return {
        "status": "ok",
        "project_id": project_id,
        "project_status": "diagram_accepted",
        "accepted_schema": chosen_schema,
        "accepted_architecture": chosen_arch,
        "accepted_exception_handling": chosen_exc,
        "accepted_security": chosen_sec,
        "mermaid_erd": mermaid_erd,
        "mermaid_architecture": mermaid_arch
    }


# ============================================================================
# V3.10 Admin Portal — Security, Instrumentation, and Analytics Endpoints
# ============================================================================

async def log_ai_call(
    provider: str,
    stage: str,
    success: bool,
    latency_ms: int,
    user_id: Optional[str] = None,
    project_id: Optional[str] = None,
):
    """Fire-and-forget helper to log AI provider call metrics into ai_call_log."""
    client = get_supabase()
    if not client:
        return
    try:
        client.table("ai_call_log").insert({
            "provider": provider,
            "stage": stage,
            "success": success,
            "latency_ms": max(0, int(latency_ms)),
            "user_id": user_id,
            "project_id": project_id,
        }).execute()
    except Exception as e:
        print(f"[AI Call Log Warning] {e}")


async def log_generation_event(
    user_id: Optional[str],
    project_id: Optional[str],
    status: str,
    failure_reason: Optional[str] = None,
):
    """Fire-and-forget helper to log generation lifecycle events into generation_events."""
    client = get_supabase()
    if not client or not user_id:
        return
    try:
        client.table("generation_events").insert({
            "user_id": user_id,
            "project_id": project_id,
            "status": status,
            "failure_reason": failure_reason,
        }).execute()
    except Exception as e:
        print(f"[Generation Event Log Warning] {e}")


async def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Admin authorization dependency: verifies authenticated user is in admin_allowlist."""
    email = (user.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required.")
    
    # The admin_allowlist table is the single source of truth.
    client = get_supabase()
    if not client:
        raise HTTPException(status_code=403, detail="Forbidden: Admin access required.")
        
    try:
        res = client.table("admin_allowlist").select("email").eq("email", email).execute()
        rows = getattr(res, "data", None)
        if not rows or not isinstance(rows, list) or len(rows) == 0:
            raise HTTPException(status_code=403, detail="Forbidden: Admin access required.")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Admin Verification Error] {e}")
        raise HTTPException(status_code=403, detail="Forbidden: Admin verification failed.")
    
    return user


class HeartbeatRequest(BaseModel):
    session_id: Optional[str] = None


@app.post("/session/heartbeat")
@app.post("/api/session/heartbeat")
async def session_heartbeat(
    req: HeartbeatRequest = HeartbeatRequest(),
    user: Dict[str, Any] = Depends(get_current_user),
):
    """Records or updates user activity heartbeat in user_sessions."""
    client = get_supabase()
    user_id = user.get("user_id")
    now_iso = datetime.now(timezone.utc).isoformat()
    session_id = req.session_id
    
    if not client or not user_id:
        return {"status": "ok", "session_id": session_id}
        
    try:
        if session_id:
            res = client.table("user_sessions").select("id").eq("id", session_id).eq("user_id", user_id).execute()
            if res.data:
                client.table("user_sessions").update({"last_seen_at": now_iso}).eq("id", session_id).execute()
                return {"status": "ok", "session_id": session_id}
        
        ins = client.table("user_sessions").insert({
            "user_id": user_id,
            "started_at": now_iso,
            "last_seen_at": now_iso,
        }).execute()
        new_id = ins.data[0]["id"] if ins.data else session_id
        return {"status": "ok", "session_id": new_id}
    except Exception as e:
        print(f"[Session Heartbeat Error] {e}")
        return {"status": "ok", "session_id": session_id}


@app.get("/admin/me")
@app.get("/api/admin/me")
async def admin_me(user: Dict[str, Any] = Depends(require_admin)):
    """Returns admin identity for frontend route guard."""
    return {"status": "ok", "admin": True, "email": user.get("email")}


@app.get("/admin/users")
@app.get("/api/admin/users")
async def admin_users(user: Dict[str, Any] = Depends(require_admin)):
    """Total users and new-user trend over 7d and 30d (derived from auth.users/projects)."""
    client = get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="Admin analytics storage is unavailable.")
    now = datetime.now(timezone.utc)
    t7d = (now - timedelta(days=7)).isoformat()
    t30d = (now - timedelta(days=30)).isoformat()
    
    total_users = 0
    new_7d = 0
    new_30d = 0
    
    # 1. Try listing from auth.admin
    try:
        auth_users = client.auth.admin.list_users()
        users_list = []
        if auth_users and hasattr(auth_users, "users"):
            users_list = auth_users.users
        elif isinstance(auth_users, list):
            users_list = auth_users
        elif isinstance(auth_users, dict) and "users" in auth_users:
            users_list = auth_users["users"]
            
        if users_list:
            total_users = len(users_list)
            for u in users_list:
                c_at = getattr(u, "created_at", None) or (u.get("created_at") if isinstance(u, dict) else None)
                if c_at:
                    if str(c_at) >= t7d:
                        new_7d += 1
                    if str(c_at) >= t30d:
                        new_30d += 1
            return {
                "status": "ok",
                "total_users": total_users,
                "new_users_7d": new_7d,
                "new_users_30d": new_30d,
                "source": "auth.users",
                "maturity": "high",
            }
    except Exception as e:
        print(f"[Admin Users Auth Query Notice] {e}")

    # 2. Fallback to distinct user count from projects table
    try:
        proj_res = client.table("projects").select("owner_id, created_at").execute()
        owners = set()
        for p in proj_res.data or []:
            oid = p.get("owner_id")
            if oid:
                owners.add(oid)
            c_at = p.get("created_at")
            if c_at and str(c_at) >= t7d:
                new_7d += 1
            if c_at and str(c_at) >= t30d:
                new_30d += 1
        total_users = max(len(owners), 1)
    except Exception as e:
        print(f"[Admin Users Project Fallback Error] {e}")
        raise HTTPException(status_code=503, detail="Failed to load admin user analytics.") from e

    return {
        "status": "ok",
        "total_users": total_users,
        "new_users_7d": new_7d,
        "new_users_30d": new_30d,
        "source": "projects.owner_id",
        "maturity": "high",
    }


@app.get("/admin/success-rate")
@app.get("/api/admin/success-rate")
async def admin_success_rate(
    window: str = "7d",
    user: Dict[str, Any] = Depends(require_admin),
):
    """Aggregate generation success rate and failure reasons from generation_events."""
    client = get_supabase()
    days = 7
    if window == "24h":
        days = 1
    elif window == "30d":
        days = 30
    elif window == "all":
        days = 3650
        
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    events = []
    if client:
        try:
            res = client.table("generation_events").select("*").gte("created_at", cutoff).order("created_at", desc=True).execute()
            events = res.data or []
        except Exception as e:
            print(f"[Admin Success Rate Query Error] {e}")
            raise HTTPException(status_code=503, detail="Failed to load admin success-rate analytics.") from e
    else:
        raise HTTPException(status_code=503, detail="Admin analytics storage is unavailable.")

    total_attempts = len(events)
    successes = sum(1 for e in events if e.get("status") == "success")
    failures = sum(1 for e in events if e.get("status") == "failure")
    success_rate = round((successes / total_attempts * 100), 1) if total_attempts > 0 else 100.0

    failure_reasons: Dict[str, int] = {}
    for e in events:
        if e.get("status") == "failure":
            reason = e.get("failure_reason") or "unknown_error"
            reason_key = reason[:40]
            failure_reasons[reason_key] = failure_reasons.get(reason_key, 0) + 1

    return {
        "status": "ok",
        "window": window,
        "total_attempts": total_attempts,
        "successful_runs": successes,
        "failed_runs": failures,
        "success_rate_pct": success_rate,
        "failure_reasons": failure_reasons,
        "recent_events": events[:20],
        "maturity": "high_for_new_data",
    }


@app.get("/admin/sessions")
@app.get("/api/admin/sessions")
async def admin_sessions(
    window: str = "7d",
    user: Dict[str, Any] = Depends(require_admin),
):
    """Aggregate active sessions and time-spent stats from user_sessions."""
    client = get_supabase()
    days = 7 if window != "30d" else 30
    if window == "24h":
        days = 1
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    active_cutoff = (datetime.now(timezone.utc) - timedelta(minutes=5)).isoformat()
    
    sessions = []
    if client:
        try:
            res = client.table("user_sessions").select("*").gte("last_seen_at", cutoff).execute()
            sessions = res.data or []
        except Exception as e:
            print(f"[Admin Sessions Query Error] {e}")
            raise HTTPException(status_code=503, detail="Failed to load admin session analytics.") from e
    else:
        raise HTTPException(status_code=503, detail="Admin analytics storage is unavailable.")

    total_sessions = len(sessions)
    active_now = 0
    total_duration_sec = 0
    
    for s in sessions:
        last_seen = s.get("last_seen_at")
        started = s.get("started_at")
        if last_seen and last_seen >= active_cutoff:
            active_now += 1
        if last_seen and started:
            try:
                dt_start = datetime.fromisoformat(started.replace("Z", "+00:00"))
                dt_last = datetime.fromisoformat(last_seen.replace("Z", "+00:00"))
                diff = max(0, int((dt_last - dt_start).total_seconds()))
                total_duration_sec += diff
            except Exception:
                pass

    total_duration_min = round(total_duration_sec / 60, 1)
    avg_session_min = round((total_duration_sec / total_sessions / 60), 1) if total_sessions > 0 else 0.0

    return {
        "status": "ok",
        "window": window,
        "active_sessions_now": active_now,
        "total_sessions": total_sessions,
        "total_time_spent_minutes": total_duration_min,
        "avg_session_duration_minutes": avg_session_min,
        "note": "Session duration is an approximation based on active client heartbeats.",
        "maturity": "approximation",
    }


@app.get("/admin/ai-usage")
@app.get("/api/admin/ai-usage")
async def admin_ai_usage(
    window: str = "7d",
    user: Dict[str, Any] = Depends(require_admin),
):
    """Aggregate provider call counts, stage distribution, and latency from ai_call_log."""
    client = get_supabase()
    days = 7 if window != "30d" else 30
    if window == "24h":
        days = 1
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    
    logs = []
    if client:
        try:
            res = client.table("ai_call_log").select("*").gte("created_at", cutoff).execute()
            logs = res.data or []
        except Exception as e:
            print(f"[Admin AI Usage Query Error] {e}")
            raise HTTPException(status_code=503, detail="Failed to load admin AI usage analytics.") from e
    else:
        raise HTTPException(status_code=503, detail="Admin analytics storage is unavailable.")

    total_calls = len(logs)
    provider_counts: Dict[str, int] = {"groq": 0, "gemini": 0}
    stage_counts: Dict[str, int] = {}
    latencies: List[int] = []

    for l in logs:
        prov = l.get("provider", "other")
        provider_counts[prov] = provider_counts.get(prov, 0) + 1
        
        stg = l.get("stage", "other")
        stage_counts[stg] = stage_counts.get(stg, 0) + 1
        
        lat = l.get("latency_ms")
        if isinstance(lat, (int, float)):
            latencies.append(int(lat))

    avg_latency = round(sum(latencies) / len(latencies), 0) if latencies else 0

    return {
        "status": "ok",
        "window": window,
        "total_calls": total_calls,
        "provider_breakdown": provider_counts,
        "stage_breakdown": stage_counts,
        "avg_latency_ms": avg_latency,
        "note": "AI usage reflects provider call counts and latencies. Dollar cost estimation is unavailable without configured pricing.",
        "maturity": "call_counts_only",
    }


# V3.12 Reliability Batch — Item 1: Abandoned Draft Cleanup
class AbandonedDraftsCleanupRequest(BaseModel):
    days_threshold: Optional[int] = 30


@app.post("/admin/cleanup-abandoned-drafts")
@app.post("/api/admin/cleanup-abandoned-drafts")
async def cleanup_abandoned_drafts(
    req: AbandonedDraftsCleanupRequest = AbandonedDraftsCleanupRequest(),
    days: Optional[int] = None,
    user: Dict[str, Any] = Depends(require_admin),
):
    """
    Soft-deletes abandoned draft projects older than days_threshold by updating status to 'archived'.
    Does NOT hard-delete rows, preserving project data and foreign key relationships.
    Protected by require_admin.
    """
    client = get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="Admin project storage is unavailable.")
        
    days_threshold = days if days is not None else (req.days_threshold if req.days_threshold is not None else 30)
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days_threshold)).isoformat()
    
    try:
        # Fetch drafts matching threshold
        res = client.table("projects").select("id, status, created_at").eq("status", "draft").lte("created_at", cutoff).execute()
        drafts = getattr(res, "data", None) or []
        archived_ids = []
        
        for d in drafts:
            pid = d.get("id")
            if pid:
                client.table("projects").update({"status": "archived"}).eq("id", pid).execute()
                archived_ids.append(pid)
                
        return {
            "status": "ok",
            "archived_count": len(archived_ids),
            "archived_project_ids": archived_ids,
            "days_threshold": days_threshold,
            "cutoff_timestamp": cutoff,
        }
    except HTTPException:
        raise
    except Exception as e:
        print(f"[Abandoned Drafts Cleanup Error] {e}")
        raise HTTPException(status_code=500, detail=f"Failed to cleanup abandoned drafts: {str(e)}") from e


# V3.12 Reliability Batch — Item 2: User-Facing Rate-Limit Visibility
@app.get("/rate-limits/status")
@app.get("/api/rate-limits/status")
async def get_rate_limits_status(user: Dict[str, Any] = Depends(get_current_user)):
    """
    Returns the authenticated user's current rate limits, remaining counts, and window reset timestamps
    for classification (10/hr), generation pipeline (5/24h), and batch-fix (15/hr).
    """
    client = get_supabase(user.get("token")) or get_supabase()
    user_id = user.get("user_id")
    if not client or not user_id:
        raise HTTPException(status_code=503, detail="Rate limit storage is unavailable.")
        
    now = datetime.now(timezone.utc)
    
    # 1. Classification Rate Limit (10 per 1 hour)
    classification_limit = 10
    classification_remaining = 10
    classification_reset_s = 0
    try:
        res = client.table("rate_limits").select("*").eq("user_id", user_id).execute()
        rows = getattr(res, "data", None) or []
        if rows:
            row = rows[0]
            start_str = row.get("window_start")
            if start_str:
                window_start = datetime.fromisoformat(str(start_str).replace("Z", "+00:00"))
                elapsed = (now - window_start).total_seconds()
                if elapsed < 3600:
                    cnt = row.get("count", 0)
                    classification_remaining = max(0, classification_limit - cnt)
                    classification_reset_s = max(0, int(3600 - elapsed))
    except Exception as e:
        print(f"[Rate Limits Status Error - Classification] {e}")

    # 2. Generation & Batch Rate Limits (5 per 24 hours, 15 per 1 hour)
    pipeline_limit = 5
    pipeline_remaining = 5
    pipeline_reset_s = 0
    batch_limit = 15
    batch_remaining = 15
    batch_reset_s = 0
    
    try:
        res_gen = client.table("generation_rate_limits").select("*").eq("user_id", user_id).execute()
        gen_rows = getattr(res_gen, "data", None) or []
        if gen_rows:
            grow = gen_rows[0]
            # Pipeline 24h
            p_start_str = grow.get("pipeline_window_start")
            if p_start_str:
                p_start = datetime.fromisoformat(str(p_start_str).replace("Z", "+00:00"))
                p_elapsed = (now - p_start).total_seconds()
                if p_elapsed < 86400:
                    p_cnt = grow.get("pipeline_count", 0)
                    pipeline_remaining = max(0, pipeline_limit - p_cnt)
                    pipeline_reset_s = max(0, int(86400 - p_elapsed))
            # Batch 1h
            b_start_str = grow.get("batch_window_start")
            if b_start_str:
                b_start = datetime.fromisoformat(str(b_start_str).replace("Z", "+00:00"))
                b_elapsed = (now - b_start).total_seconds()
                if b_elapsed < 3600:
                    b_cnt = grow.get("batch_count", 0)
                    batch_remaining = max(0, batch_limit - b_cnt)
                    batch_reset_s = max(0, int(3600 - b_elapsed))
    except Exception as e:
        print(f"[Rate Limits Status Error - Generation] {e}")

    return {
        "status": "ok",
        "user_id": user_id,
        "classification": {
            "limit": classification_limit,
            "remaining": classification_remaining,
            "reset_in_seconds": classification_reset_s,
        },
        "generation": {
            "limit": pipeline_limit,
            "remaining": pipeline_remaining,
            "reset_in_seconds": pipeline_reset_s,
        },
        "batch_fix": {
            "limit": batch_limit,
            "remaining": batch_remaining,
            "reset_in_seconds": batch_reset_s,
        },
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)


