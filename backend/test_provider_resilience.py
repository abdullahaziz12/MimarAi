import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch, MagicMock
import httpx

os.environ["GEMINI_API_KEY"] = "fake-gemini-key"
os.environ["GROQ_API_KEY"] = "fake-groq-key"

from backend.main import call_gemini_api, call_groq_json


class TestProviderResilience(unittest.IsolatedAsyncioTestCase):

    @patch("backend.main.log_ai_call", new_callable=AsyncMock)
    @patch("asyncio.sleep", new_callable=AsyncMock)
    @patch("httpx.AsyncClient.post")
    async def test_gemini_404_skips_retry_to_next_candidate(self, mock_post, mock_sleep, mock_log):
        # 1st candidate (e.g. gemini-2.5-flash) returns 404 -> skips 2nd attempt, goes to 2nd candidate
        # 2nd candidate returns 200 -> succeeds
        resp_404 = MagicMock(status_code=404, text="Model not found")
        resp_200 = MagicMock(
            status_code=200,
            json=lambda: {"candidates": [{"content": {"parts": [{"text": '{"status": "ok"}'}]}}]}
        )
        mock_post.side_effect = [resp_404, resp_200]

        result = await call_gemini_api("system", "user", retry=True)
        self.assertEqual(result, {"status": "ok"})
        # Should have called post exactly twice (1 for 1st candidate, 1 for 2nd candidate)
        # Without 404 skip, it would have called post 3 times (2 attempts on 1st candidate, 1 on 2nd)
        self.assertEqual(mock_post.call_count, 2)
        mock_sleep.assert_not_called()

    @patch("backend.main.log_ai_call", new_callable=AsyncMock)
    @patch("asyncio.sleep", new_callable=AsyncMock)
    @patch("httpx.AsyncClient.post")
    async def test_gemini_503_sleeps_and_retries(self, mock_post, mock_sleep, mock_log):
        # 1st attempt returns 503 -> sleeps 1.5s -> 2nd attempt returns 200 -> succeeds
        resp_503 = MagicMock(status_code=503, text="Service Unavailable / Overloaded")
        resp_200 = MagicMock(
            status_code=200,
            json=lambda: {"candidates": [{"content": {"parts": [{"text": '{"result": "success"}'}]}}]}
        )
        mock_post.side_effect = [resp_503, resp_200]

        result = await call_gemini_api("system", "user", retry=True)
        self.assertEqual(result, {"result": "success"})
        self.assertEqual(mock_post.call_count, 2)
        mock_sleep.assert_awaited_once_with(1.5)

    @patch("backend.main.log_ai_call", new_callable=AsyncMock)
    @patch("asyncio.sleep", new_callable=AsyncMock)
    @patch("httpx.AsyncClient.post")
    async def test_groq_429_sleeps_and_retries(self, mock_post, mock_sleep, mock_log):
        # 1st attempt returns 429 -> sleeps 2.0s -> 2nd attempt returns 200 -> succeeds
        resp_429 = MagicMock(status_code=429, text="TPM Rate limit reached")
        resp_200 = MagicMock(
            status_code=200,
            json=lambda: {"choices": [{"message": {"content": '{"plan": "valid"}'}}]}
        )
        mock_post.side_effect = [resp_429, resp_200]

        result = await call_groq_json("system", "user", retry=True)
        self.assertEqual(result, {"plan": "valid"})
        self.assertEqual(mock_post.call_count, 2)
        mock_sleep.assert_awaited_once_with(2.0)


if __name__ == "__main__":
    unittest.main()
