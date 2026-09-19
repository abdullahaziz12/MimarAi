import os
import pytest
from unittest.mock import patch, MagicMock, AsyncMock
from fastapi import HTTPException
from datetime import datetime, timezone, timedelta

import main


class TestAdminPortalSecurityAndEndpoints:

    @pytest.mark.asyncio
    async def test_require_admin_allowlisted_user_passes(self):
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"email": "abdullahazizgujjar009@gmail.com"}]
        )

        with patch.object(main, "get_supabase", return_value=mock_client):
            user = {"email": "abdullahazizgujjar009@gmail.com", "user_id": "uid-123", "token": "tok"}
            res = await main.require_admin(user)
            assert res["email"] == "abdullahazizgujjar009@gmail.com"

    @pytest.mark.asyncio
    async def test_require_admin_non_allowlisted_user_forbidden(self):
        mock_client = MagicMock()
        mock_client.table.return_value.select.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[]
        )

        with patch.object(main, "get_supabase", return_value=mock_client):
            user = {"email": "unauthorized@example.com", "user_id": "uid-456", "token": "tok"}
            with pytest.raises(HTTPException) as exc:
                await main.require_admin(user)
            assert exc.value.status_code == 403
            assert "Forbidden" in exc.value.detail

    @pytest.mark.asyncio
    async def test_require_admin_missing_email_forbidden(self):
        user = {"user_id": "uid-789", "token": "tok"}
        with pytest.raises(HTTPException) as exc:
            await main.require_admin(user)
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_admin_me_endpoint(self):
        admin_user = {"email": "abdullahazizgujjar009@gmail.com", "user_id": "uid-123"}
        res = await main.admin_me(admin_user)
        assert res["status"] == "ok"
        assert res["admin"] is True
        assert res["email"] == "abdullahazizgujjar009@gmail.com"

    @pytest.mark.asyncio
    async def test_admin_users_endpoint_auth_listing(self):
        mock_client = MagicMock()
        now = datetime.now(timezone.utc)
        u1 = {"id": "u1", "created_at": now.isoformat()}
        u2 = {"id": "u2", "created_at": (now - timedelta(days=2)).isoformat()}
        u3 = {"id": "u3", "created_at": (now - timedelta(days=40)).isoformat()}
        mock_client.auth.admin.list_users.return_value = [u1, u2, u3]

        admin_user = {"email": "admin@example.com", "token": "tok"}
        with patch.object(main, "get_supabase", return_value=mock_client):
            res = await main.admin_users(admin_user)
            assert res["status"] == "ok"
            assert res["total_users"] == 3
            assert res["new_users_7d"] == 2
            assert res["new_users_30d"] == 2
            assert res["maturity"] == "high"

    @pytest.mark.asyncio
    async def test_admin_success_rate_endpoint(self):
        mock_client = MagicMock()
        now = datetime.now(timezone.utc)
        events = [
            {"status": "success", "failure_reason": None, "created_at": now.isoformat()},
            {"status": "success", "failure_reason": None, "created_at": now.isoformat()},
            {"status": "failure", "failure_reason": "provider_error: timeout", "created_at": now.isoformat()},
        ]
        mock_client.table.return_value.select.return_value.gte.return_value.order.return_value.execute.return_value = MagicMock(
            data=events
        )

        admin_user = {"email": "admin@example.com", "token": "tok"}
        with patch.object(main, "get_supabase", return_value=mock_client):
            res = await main.admin_success_rate("7d", admin_user)
            assert res["status"] == "ok"
            assert res["total_attempts"] == 3
            assert res["successful_runs"] == 2
            assert res["failed_runs"] == 1
            assert res["success_rate_pct"] == 66.7
            assert "provider_error: timeout" in res["failure_reasons"]

    @pytest.mark.asyncio
    async def test_admin_sessions_endpoint(self):
        mock_client = MagicMock()
        now = datetime.now(timezone.utc)
        started = (now - timedelta(minutes=10)).isoformat()
        last_seen = now.isoformat()
        sessions = [
            {"id": "s1", "user_id": "u1", "started_at": started, "last_seen_at": last_seen},
        ]
        mock_client.table.return_value.select.return_value.gte.return_value.execute.return_value = MagicMock(
            data=sessions
        )

        admin_user = {"email": "admin@example.com", "token": "tok"}
        with patch.object(main, "get_supabase", return_value=mock_client):
            res = await main.admin_sessions("7d", admin_user)
            assert res["status"] == "ok"
            assert res["active_sessions_now"] == 1
            assert res["total_sessions"] == 1
            assert res["total_time_spent_minutes"] >= 9.9
            assert res["avg_session_duration_minutes"] >= 9.9
            assert res["maturity"] == "approximation"

    @pytest.mark.asyncio
    async def test_admin_ai_usage_endpoint(self):
        mock_client = MagicMock()
        now = datetime.now(timezone.utc)
        logs = [
            {"provider": "gemini", "stage": "draft", "success": True, "latency_ms": 1200, "created_at": now.isoformat()},
            {"provider": "groq", "stage": "draft", "success": True, "latency_ms": 800, "created_at": now.isoformat()},
            {"provider": "groq", "stage": "classify", "success": True, "latency_ms": 400, "created_at": now.isoformat()},
        ]
        mock_client.table.return_value.select.return_value.gte.return_value.execute.return_value = MagicMock(
            data=logs
        )

        admin_user = {"email": "admin@example.com", "token": "tok"}
        with patch.object(main, "get_supabase", return_value=mock_client):
            res = await main.admin_ai_usage("7d", admin_user)
            assert res["status"] == "ok"
            assert res["total_calls"] == 3
            assert res["provider_breakdown"]["gemini"] == 1
            assert res["provider_breakdown"]["groq"] == 2
            assert res["stage_breakdown"]["draft"] == 2
            assert res["stage_breakdown"]["classify"] == 1
            assert res["avg_latency_ms"] == 800
            assert res["maturity"] == "call_counts_only"

    @pytest.mark.asyncio
    async def test_session_heartbeat_initial_and_update(self):
        mock_client = MagicMock()
        # 1. Initial heartbeat (no session_id)
        mock_client.table.return_value.insert.return_value.execute.return_value = MagicMock(
            data=[{"id": "new-session-uuid"}]
        )

        user = {"user_id": "u-123", "token": "tok"}
        with patch.object(main, "get_supabase", return_value=mock_client):
            res = await main.session_heartbeat(main.HeartbeatRequest(session_id=None), user)
            assert res["status"] == "ok"
            assert res["session_id"] == "new-session-uuid"

        # 2. Subsequent heartbeat with session_id
        mock_client.table.return_value.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(
            data=[{"id": "new-session-uuid"}]
        )
        with patch.object(main, "get_supabase", return_value=mock_client):
            res2 = await main.session_heartbeat(main.HeartbeatRequest(session_id="new-session-uuid"), user)
            assert res2["status"] == "ok"
            assert res2["session_id"] == "new-session-uuid"

    @pytest.mark.asyncio
    async def test_log_ai_call_and_generation_event_helpers(self):
        mock_client = MagicMock()
        with patch.object(main, "get_supabase", return_value=mock_client):
            await main.log_ai_call("gemini", "draft", True, 1500, user_id="u1", project_id="p1")
            mock_client.table.assert_called_with("ai_call_log")
            
            await main.log_generation_event("u1", "p1", "success")
            mock_client.table.assert_called_with("generation_events")
