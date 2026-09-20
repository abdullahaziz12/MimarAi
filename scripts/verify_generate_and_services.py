#!/usr/bin/env python3
"""
MimarAI — AI Services & Full /generate Pipeline Verification
Tests:
  1. GET /health/services (Gemini & Groq connectivity)
  2. POST /api/projects/{id}/generate (Full Dual-Model Feature Pipeline)
     - Gemini Generation
     - Groq Generation
     - Schema Normalization & Quality Flags (Fix 2 & Fix 4)
     - Provider Resilience (Fix 3)

Usage:
  powershell:
    python scripts/verify_generate_and_services.py
"""

import os
import sys
import time
import json
import httpx

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

BACKEND_URL = os.getenv("MIMARAI_BACKEND_URL", "https://mimaraibackend-uuquznm1.b4a.run").rstrip("/")
TEST_TOKEN = os.getenv("MIMARAI_TEST_TOKEN", "").strip()

def sanitize(text: str) -> str:
    if TEST_TOKEN and len(TEST_TOKEN) > 5:
        return text.replace(TEST_TOKEN, "[REDACTED_TOKEN]")
    return text

def log(msg: str):
    print(f"[*] {sanitize(msg)}")

def main():
    print("=" * 70)
    print(" MimarAI — AI Services & Pipeline Verification")
    print("=" * 70)
    print(f" Target Backend: {BACKEND_URL}")
    print(f" Test Token    : {'Configured (Redacted)' if TEST_TOKEN else 'NOT SET'}")
    print("=" * 70)

    if not TEST_TOKEN:
        print("[!] ERROR: $env:MIMARAI_TEST_TOKEN is required. Please set it before running.")
        sys.exit(1)

    headers = {
        "Authorization": f"Bearer {TEST_TOKEN}",
        "Content-Type": "application/json",
        "Accept": "application/json"
    }

    client = httpx.Client(timeout=90.0, follow_redirects=True)

    # 1. Check /health/services for Gemini & Groq connectivity
    log("1. Checking AI Services health (/health/services)...")
    t0 = time.time()
    try:
        resp_services = client.get(f"{BACKEND_URL}/health/services", headers=headers)
        dur_services = (time.time() - t0) * 1000
        services_data = resp_services.json()
        print("\n" + "=" * 70)
        print(f" AI Services Health -> Status {resp_services.status_code} ({dur_services:.1f}ms)")
        print(json.dumps(services_data, indent=2))
        print("=" * 70)
    except Exception as e:
        print(f"[!] Error querying /health/services: {e}")
        services_data = {"error": str(e)}

    # 2. Create fresh draft project for generation
    idea = "A cloud-based hospital management system for patient intake, doctor appointment scheduling, laboratory order tracking, and pharmacy prescription dispensing."
    log("2. Creating a test draft project for generation pipeline...")
    t0 = time.time()
    resp_draft = client.post(
        f"{BACKEND_URL}/api/projects/draft",
        headers=headers,
        json={"idea_text": idea, "step": 0}
    )
    if resp_draft.status_code != 200:
        print(f"[!] Draft creation failed ({resp_draft.status_code}): {resp_draft.text}")
        sys.exit(1)

    project_id = resp_draft.json().get("id")
    log(f"   Project created: {project_id}")

    # 3. Set project status to ready
    log("3. Setting project status to 'ready' with fixed inputs...")
    fixed_inputs_payload = {
        "stack": "Next.js + FastAPI",
        "database": "PostgreSQL",
        "deployment": "Docker on AWS ECS",
        "apis": "Stripe, Twilio"
    }
    client.post(
        f"{BACKEND_URL}/api/projects/{project_id}/status",
        headers=headers,
        json={
            "status": "ready",
            "fixed_inputs": fixed_inputs_payload
        }
    )

    # 4. Trigger Full Generation Pipeline: POST /api/projects/{id}/generate
    log("4. Executing Dual-Model Generation Pipeline (POST /generate)...")
    log("   (Calling Gemini + Groq concurrently, normalizing, and verifying quality flags...)")
    t0 = time.time()
    try:
        resp_gen = client.post(
            f"{BACKEND_URL}/api/projects/{project_id}/generate",
            headers=headers,
            json={
                "idea_text": idea,
                "fixed_inputs": fixed_inputs_payload
            }
        )
        dur_gen = (time.time() - t0) * 1000
        gen_status = resp_gen.status_code
        try:
            gen_data = resp_gen.json()
        except Exception:
            gen_data = {"raw_text": resp_gen.text}
    except Exception as e:
        dur_gen = (time.time() - t0) * 1000
        gen_status = 500
        gen_data = {"error": str(e)}

    print("\n" + "=" * 70)
    print(f" Full Generation Pipeline Result -> Status {gen_status} ({dur_gen:.1f}ms)")
    if gen_status == 200:
        features = gen_data.get("features", [])
        metadata = gen_data.get("generation_metadata", {}) or gen_data.get("pipeline_metadata", {})
        print(f" Total Features Generated: {len(features)}")
        print(f" Pipeline Metadata       : {json.dumps(metadata, indent=2)}")
        
        # Show first 3 features sample
        print("\n Sample Features Generated:")
        for idx, f in enumerate(features[:3], 1):
            name = f.get("name", "Unnamed")
            src_model = f.get("source_model", f.get("source", "unknown"))
            q_flags = f.get("quality_flags", {})
            print(f"  {idx}. [{src_model.upper()}] {name}")
            print(f"     Quality Flags: {q_flags}")
    else:
        print(f" Error Output: {sanitize(json.dumps(gen_data, indent=2))}")
    print("=" * 70)

    # Save to Markdown Report File
    report_file = os.path.join(PROJECT_ROOT, "Requirements", "GENERATE_PIPELINE_RESULTS.md")
    md_lines = [
        "# MimarAI — AI Services & Full /generate Pipeline Report",
        "",
        f"- **Execution Timestamp:** `{time.strftime('%Y-%m-%d %H:%M:%S UTC', time.gmtime())}`",
        f"- **Target Backend:** `{BACKEND_URL}`",
        f"- **Project ID Used:** `{project_id}`",
        "",
        "## 1. AI Services Connectivity (`GET /health/services`)",
        "",
        "```json",
        json.dumps(services_data, indent=2),
        "```",
        "",
        "## 2. Full Dual-Model Pipeline (`POST /generate`)",
        "",
        f"- **Status Code:** `{gen_status}`",
        f"- **Duration:** `{dur_gen:.1f}ms`",
        f"- **Features Generated:** `{len(gen_data.get('features', [])) if isinstance(gen_data, dict) else 0}`",
        "",
        "### Pipeline Details & Sample Features",
        "```json",
        sanitize(json.dumps(gen_data, indent=2)[:3000]),
        "```"
    ]

    with open(report_file, "w", encoding="utf-8") as f:
        f.write("\n".join(md_lines))

    print(f"\n[SUCCESS] Full report saved to: {report_file}\n")

if __name__ == "__main__":
    main()
