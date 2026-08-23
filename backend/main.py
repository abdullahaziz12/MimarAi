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


import smtplib
import html
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import re
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
    Receives contact form submissions, validates data, persists to Supabase DB,
    dispatches notification email to support.mimarai@gmail.com, and sends an HTML auto-reply to user.
    """
    if not msg.name.strip() or not msg.email.strip() or not msg.message.strip():
        raise HTTPException(status_code=422, detail="Name, email, and message are required.")

    support_email = "support.mimarai@gmail.com"
    
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
      Support: <a href="mailto:support.mimarai@gmail.com" style="color: #38BDF8;">support.mimarai@gmail.com</a>
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
Support: support.mimarai@gmail.com"""

    user_sent = send_smtp_email(msg.email.strip(), user_subject, user_html, user_plain)

    if not notif_sent or not user_sent:
        print(f"[CONTACT WARNING] DB Saved={db_saved}. Notification Sent={notif_sent}, User Auto-Reply Sent={user_sent}.")

    return {
        "status": "ok",
        "message": "Message received. We will get back to you shortly.",
        "email_sent": notif_sent and user_sent,
        "db_saved": db_saved
    }


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

