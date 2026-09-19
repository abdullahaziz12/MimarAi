import os
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi import HTTPException
import httpx

import main


class TestGeminiConfigurationAndHealth:

    @pytest.mark.asyncio
    async def test_check_provider_health_gemini_connected(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200

        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_gemini_key", "GROQ_API_KEY": "fake_groq_key"}):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_resp
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
                    groq_resp = MagicMock()
                    groq_resp.status_code = 200
                    groq_resp.json.return_value = {"data": [{"id": "openai/gpt-oss-120b"}]}
                    mock_get.return_value = groq_resp

                    res = await main.check_provider_health()
                    assert res["gemini"]["status"] == "connected"
                    assert res["groq"]["status"] == "connected"
                    
                    # Verify probe called generateContent
                    call_url = mock_post.call_args[0][0]
                    assert ":generateContent" in call_url
                    assert "gemini-2.5-flash" in call_url

    @pytest.mark.asyncio
    async def test_check_provider_health_gemini_404_reports_unavailable(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 404

        with patch.dict(os.environ, {"GEMINI_API_KEY": "fake_gemini_key", "GROQ_API_KEY": "fake_groq_key"}):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_resp
                with patch("httpx.AsyncClient.get", new_callable=AsyncMock) as mock_get:
                    groq_resp = MagicMock()
                    groq_resp.status_code = 200
                    groq_resp.json.return_value = {"data": [{"id": "openai/gpt-oss-120b"}]}
                    mock_get.return_value = groq_resp

                    res = await main.check_provider_health()
                    assert res["gemini"]["status"] == "unavailable"

    def test_sanitize_gemini_error(self):
        secret_key = "AIzaSySecretApiKey12345"
        raw_error = f"Error calling https://generativelanguage.googleapis.com/v1beta/models/gemini:generateContent?key={secret_key}: 404 Not Found"
        
        sanitized = main._sanitize_gemini_error(raw_error, secret_key)
        assert secret_key not in sanitized
        assert "[REDACTED]" in sanitized

    @pytest.mark.asyncio
    async def test_call_gemini_api_uses_verified_models_and_strips_prefix(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [
                {"content": {"parts": [{"text": '{"success": true, "result": "ok"}'}]}}
            ]
        }

        with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key", "GEMINI_MODEL": "models/gemini-2.5-flash"}):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_resp
                res = await main.call_gemini_api("System prompt", "User prompt")
                assert res == {"success": True, "result": "ok"}
                
                # Check URL called: should NOT contain models/models/
                called_url = mock_post.call_args[0][0]
                assert "models/gemini-2.5-flash:generateContent" in called_url
                assert "models/models" not in called_url

    @pytest.mark.asyncio
    async def test_call_gemini_api_invalid_env_model_falls_back_to_verified(self):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {
            "candidates": [
                {"content": {"parts": [{"text": '{"features": []}'}]}}
            ]
        }

        # Setting invalid model name gemini-3.6-flash in env
        with patch.dict(os.environ, {"GEMINI_API_KEY": "test_key", "GEMINI_MODEL": "gemini-3.6-flash"}):
            with patch("httpx.AsyncClient.post", new_callable=AsyncMock) as mock_post:
                mock_post.return_value = mock_resp
                res = await main.call_gemini_api("System", "User")
                assert res == {"features": []}
                
                # First tried candidate should be default verified model gemini-2.5-flash
                called_url = mock_post.call_args[0][0]
                assert "models/gemini-2.5-flash:generateContent" in called_url
