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
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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
    client = get_supabase()
    if not client or not user_id:
        return {"id": "local-draft-" + str(int(datetime.now().timestamp())), "status": "draft", "idea_text": req.idea_text}

    try:
        res = client.table("projects").insert({
            "owner_id": user_id,
            "status": "draft",
            "idea_text": req.idea_text,
            "step0_state": {"round_count": 0, "off_topic_streak": 0, "last_label": None}
        }).execute()
        
        if res.data:
            return res.data[0]
        raise HTTPException(status_code=500, detail="Failed to create draft project.")
    except Exception as e:
        print(f"[Create Draft Project Error] {e}")
        return {"id": "local-draft-" + str(int(datetime.now().timestamp())), "status": "draft", "idea_text": req.idea_text}


@app.get("/projects/drafts")
@app.get("/api/projects/drafts")
async def get_draft_projects(
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    client = get_supabase()
    if not client or not user_id:
        return {"drafts": []}

    try:
        res = client.table("projects").select("*").eq("owner_id", user_id).eq("status", "draft").order("created_at", desc=True).execute()
        return {"drafts": res.data or []}
    except Exception as e:
        print(f"[Get Draft Projects Error] {e}")
        return {"drafts": []}


@app.post("/projects/{project_id}/status")
@app.post("/api/projects/{project_id}/status")
async def update_project_status(
    project_id: str,
    req: UpdateProjectStatusRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    client = get_supabase()
    if not client or project_id.startswith("local-draft-"):
        return {"status": "ok", "project_id": project_id, "updated_status": req.status}

    try:
        payload = {}
        if req.status:
            payload["status"] = req.status
        if req.fixed_inputs:
            payload["fixed_inputs"] = req.fixed_inputs
        if payload:
            client.table("projects").update(payload).eq("id", project_id).execute()
        return {"status": "ok", "project_id": project_id, "updated_status": req.status}
    except Exception as e:
        print(f"[Update Project Status Error] {e}")
        return {"status": "warning", "message": str(e)}


@app.post("/interview/classify")
@app.post("/api/interview/classify")
async def classify_idea(
    req: ClassifyRequest,
    user: Dict[str, Any] = Depends(get_current_user)
):
    user_id = user.get("user_id")
    idea_text = req.idea_text.strip() if req.idea_text else ""
    
    # 1. 2,000 character check (server-side)
    if len(idea_text) > 2000:
        raise HTTPException(
            status_code=400,
            detail="Idea description exceeds 2,000 characters limit."
        )

    # 2. Rate limiting check (10 per hour)
    client = get_supabase()
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
                    "model": "llama-3.3-70b-versatile",
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


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=True)

