#!/usr/bin/env python3
"""
Direct Gemini & Groq API Key Validator
Usage:
  powershell:
    $env:GEMINI_API_KEY="AIzaSy..."
    python scripts/test_gemini_key.py
"""

import os
import sys
import httpx

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def test_gemini():
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("[!] GEMINI_API_KEY environment variable is NOT set.")
        print("    Set it with: $env:GEMINI_API_KEY=\"AIzaSy...\"")
        return

    masked = api_key[:6] + "..." + api_key[-4:] if len(api_key) > 10 else "***"
    print(f"\n[*] Testing Gemini API Key: {masked}")

    # 1. Test listing available models for this key
    models_url = f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}"
    try:
        r = httpx.get(models_url, timeout=10.0)
        if r.status_code == 200:
            models_data = r.json().get("models", [])
            model_names = [m.get("name", "").replace("models/", "") for m in models_data if "generateContent" in m.get("supportedGenerationMethods", [])]
            print(f"[PASS] Gemini API Key is VALID! (Found {len(model_names)} available models)")
            print(f"       Supported Models: {', '.join(model_names[:6])}...")
        else:
            print(f"[FAIL] Gemini API Key returned HTTP {r.status_code}:")
            print(f"       {r.text}")
            return
    except Exception as e:
        print(f"[FAIL] Connection error to Google Gemini: {e}")
        return

    # 2. Test ping with available models
    for candidate in ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-flash-latest"]:
        for api_version in ["v1beta", "v1"]:
            gen_url = f"https://generativelanguage.googleapis.com/{api_version}/models/{candidate}:generateContent?key={api_key}"
            payload = {"contents": [{"parts": [{"text": "Hello, reply with 1 word."}]}]}
            try:
                r = httpx.post(gen_url, json=payload, timeout=10.0)
                if r.status_code == 200:
                    reply = r.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
                    print(f"       -> [{api_version}] Model '{candidate}': OK! (AI Reply: '{reply}')")
                    break
                else:
                    print(f"       -> [{api_version}] Model '{candidate}': HTTP {r.status_code}")
                    print(f"          Error Details: {r.text}")
            except Exception as e:
                print(f"       -> [{api_version}] Model '{candidate}': Error ({e})")

if __name__ == "__main__":
    test_gemini()
