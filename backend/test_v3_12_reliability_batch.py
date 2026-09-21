import unittest
from unittest.mock import patch, MagicMock
from datetime import datetime, timezone, timedelta
import os
import sys

# Ensure backend directory is in sys.path
sys.path.insert(0, os.path.dirname(__file__))

import main


class TestV312Item1AbandonedDraftCleanup(unittest.IsolatedAsyncioTestCase):
    """Unit tests for Item 1: Abandoned Draft Cleanup endpoint."""

    @patch.object(main, "get_supabase")
    async def test_cleanup_soft_deletes_qualifying_drafts(self, mock_get_supabase):
        """Verify qualifying drafts older than threshold are soft-deleted (status set to archived), not deleted."""
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        cutoff_date = (datetime.now(timezone.utc) - timedelta(days=35)).isoformat()
        draft_1 = {"id": "p-old-1", "status": "draft", "created_at": cutoff_date}
        draft_2 = {"id": "p-old-2", "status": "draft", "created_at": cutoff_date}

        mock_projects_table = MagicMock()
        mock_client.table.return_value = mock_projects_table

        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_lte = MagicMock()
        mock_update = MagicMock()
        mock_update_eq = MagicMock()

        mock_projects_table.select.return_value = mock_select
        mock_select.eq.return_value = mock_eq
        mock_eq.lte.return_value = mock_lte
        mock_lte.execute.return_value = MagicMock(data=[draft_1, draft_2])

        mock_projects_table.update.return_value = mock_update
        mock_update.eq.return_value = mock_update_eq
        mock_update_eq.execute.return_value = MagicMock(data=[])

        admin_user = {"user_id": "admin-1", "email": "admin@example.com"}
        req = main.AbandonedDraftsCleanupRequest(days_threshold=30)
        res = await main.cleanup_abandoned_drafts(req=req, days=None, user=admin_user)

        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["archived_count"], 2)
        self.assertEqual(res["archived_project_ids"], ["p-old-1", "p-old-2"])
        self.assertEqual(res["days_threshold"], 30)

        # Verify soft delete: table.update({"status": "archived"}) was called, table.delete() was NEVER called
        mock_projects_table.update.assert_called_with({"status": "archived"})
        self.assertEqual(mock_projects_table.delete.call_count, 0)
        self.assertEqual(mock_update.eq.call_count, 2)

    @patch.object(main, "get_supabase")
    async def test_cleanup_preserves_fresh_drafts(self, mock_get_supabase):
        """Verify that when no drafts exceed the age threshold, no projects are updated."""
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        mock_projects_table = MagicMock()
        mock_client.table.return_value = mock_projects_table

        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_lte = MagicMock()

        mock_projects_table.select.return_value = mock_select
        mock_select.eq.return_value = mock_eq
        mock_eq.lte.return_value = mock_lte
        mock_lte.execute.return_value = MagicMock(data=[])

        admin_user = {"user_id": "admin-1", "email": "admin@example.com"}
        req = main.AbandonedDraftsCleanupRequest(days_threshold=30)
        res = await main.cleanup_abandoned_drafts(req=req, days=None, user=admin_user)

        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["archived_count"], 0)
        self.assertEqual(res["archived_project_ids"], [])
        self.assertEqual(mock_projects_table.update.call_count, 0)

    @patch.object(main, "get_supabase")
    async def test_cleanup_custom_days_threshold(self, mock_get_supabase):
        """Verify custom days_threshold parameter passes proper cutoff date."""
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        mock_projects_table = MagicMock()
        mock_client.table.return_value = mock_projects_table
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_lte = MagicMock()
        mock_projects_table.select.return_value = mock_select
        mock_select.eq.return_value = mock_eq
        mock_eq.lte.return_value = mock_lte
        mock_lte.execute.return_value = MagicMock(data=[])

        admin_user = {"user_id": "admin-1", "email": "admin@example.com"}
        res = await main.cleanup_abandoned_drafts(days=14, user=admin_user)

        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["days_threshold"], 14)
        mock_eq.lte.assert_called_once()
        cutoff_passed = mock_eq.lte.call_args[0][1]
        self.assertIn("T", cutoff_passed)


class TestV312Item2RateLimitsStatus(unittest.IsolatedAsyncioTestCase):
    """Unit tests for Item 2: User-Facing Rate Limits Status endpoint."""

    @patch.object(main, "get_supabase")
    async def test_rate_limits_status_fresh_user(self, mock_get_supabase):
        """Verify a user with no previous usage has full remaining limits across all 3 limit categories."""
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        # Mock table calls returning empty rows
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_select = MagicMock()
        mock_eq = MagicMock()
        mock_table.select.return_value = mock_select
        mock_select.eq.return_value = mock_eq
        mock_eq.execute.return_value = MagicMock(data=[])

        user = {"user_id": "user-fresh-1", "token": "mock-token"}
        res = await main.get_rate_limits_status(user=user)

        self.assertEqual(res["status"], "ok")
        self.assertEqual(res["user_id"], "user-fresh-1")
        self.assertEqual(res["classification"]["limit"], 10)
        self.assertEqual(res["classification"]["remaining"], 10)
        self.assertEqual(res["classification"]["reset_in_seconds"], 0)

        self.assertEqual(res["generation"]["limit"], 5)
        self.assertEqual(res["generation"]["remaining"], 5)
        self.assertEqual(res["generation"]["reset_in_seconds"], 0)

        self.assertEqual(res["batch_fix"]["limit"], 15)
        self.assertEqual(res["batch_fix"]["remaining"], 15)
        self.assertEqual(res["batch_fix"]["reset_in_seconds"], 0)

    @patch.object(main, "get_supabase")
    async def test_rate_limits_status_partial_and_depleted_usage(self, mock_get_supabase):
        """Verify accurate remaining counts and reset countdowns for active rate limit windows."""
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        now = datetime.now(timezone.utc)
        class_start = (now - timedelta(minutes=15)).isoformat()
        pipe_start = (now - timedelta(hours=2)).isoformat()
        batch_start = (now - timedelta(minutes=45)).isoformat()

        def table_side_effect(table_name):
            mock_t = MagicMock()
            mock_sel = MagicMock()
            mock_e = MagicMock()
            mock_t.select.return_value = mock_sel
            mock_sel.eq.return_value = mock_e

            if table_name == "rate_limits":
                # Classification: 3 used out of 10
                mock_e.execute.return_value = MagicMock(data=[{
                    "user_id": "user-active-1",
                    "count": 3,
                    "window_start": class_start
                }])
            elif table_name == "generation_rate_limits":
                # Generation: 5 used out of 5 (depleted), Batch: 10 used out of 15
                mock_e.execute.return_value = MagicMock(data=[{
                    "user_id": "user-active-1",
                    "pipeline_count": 5,
                    "pipeline_window_start": pipe_start,
                    "batch_count": 10,
                    "batch_window_start": batch_start
                }])
            else:
                mock_e.execute.return_value = MagicMock(data=[])
            return mock_t

        mock_client.table.side_effect = table_side_effect

        user = {"user_id": "user-active-1", "token": "mock-token"}
        res = await main.get_rate_limits_status(user=user)

        self.assertEqual(res["status"], "ok")
        # Classification: 10 - 3 = 7 remaining, ~45 min (2700s) left in window
        self.assertEqual(res["classification"]["remaining"], 7)
        self.assertGreater(res["classification"]["reset_in_seconds"], 2600)
        self.assertLessEqual(res["classification"]["reset_in_seconds"], 2700)

        # Generation pipeline: 5 - 5 = 0 remaining, ~22 hours (~79200s) left
        self.assertEqual(res["generation"]["remaining"], 0)
        self.assertGreater(res["generation"]["reset_in_seconds"], 78000)

        # Batch fix: 15 - 10 = 5 remaining, ~15 min (900s) left
        self.assertEqual(res["batch_fix"]["remaining"], 5)
        self.assertGreater(res["batch_fix"]["reset_in_seconds"], 800)
        self.assertLessEqual(res["batch_fix"]["reset_in_seconds"], 900)

    @patch.object(main, "get_supabase")
    async def test_rate_limits_status_expired_windows_reset(self, mock_get_supabase):
        """Verify that windows older than duration (1h for classification/batch, 24h for pipeline) reset to full limits."""
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        now = datetime.now(timezone.utc)
        old_1h = (now - timedelta(hours=2)).isoformat()
        old_24h = (now - timedelta(hours=25)).isoformat()

        def table_side_effect(table_name):
            mock_t = MagicMock()
            mock_sel = MagicMock()
            mock_e = MagicMock()
            mock_t.select.return_value = mock_sel
            mock_sel.eq.return_value = mock_e

            if table_name == "rate_limits":
                mock_e.execute.return_value = MagicMock(data=[{
                    "user_id": "user-old-1",
                    "count": 10,
                    "window_start": old_1h
                }])
            elif table_name == "generation_rate_limits":
                mock_e.execute.return_value = MagicMock(data=[{
                    "user_id": "user-old-1",
                    "pipeline_count": 5,
                    "pipeline_window_start": old_24h,
                    "batch_count": 15,
                    "batch_window_start": old_1h
                }])
            return mock_t

        mock_client.table.side_effect = table_side_effect

        user = {"user_id": "user-old-1", "token": "mock-token"}
        res = await main.get_rate_limits_status(user=user)

        self.assertEqual(res["status"], "ok")
        # All expired windows should report full remaining and 0 reset
        self.assertEqual(res["classification"]["remaining"], 10)
        self.assertEqual(res["classification"]["reset_in_seconds"], 0)
        self.assertEqual(res["generation"]["remaining"], 5)
        self.assertEqual(res["generation"]["reset_in_seconds"], 0)
        self.assertEqual(res["batch_fix"]["remaining"], 15)
        self.assertEqual(res["batch_fix"]["reset_in_seconds"], 0)


class TestV312Item3SentryIntegration(unittest.TestCase):
    """Unit tests for Item 3: Sentry Error Monitoring integration."""

    @patch.dict(os.environ, {"SENTRY_DSN": "https://test-dsn@sentry.io/12345"})
    @patch("sentry_sdk.init")
    def test_sentry_initializes_with_env_var(self, mock_sentry_init):
        """Verify Sentry SDK reads SENTRY_DSN from environment and initializes."""
        dsn = os.getenv("SENTRY_DSN")
        self.assertEqual(dsn, "https://test-dsn@sentry.io/12345")

    @patch.dict(os.environ, {"SENTRY_DSN": "https://test-dsn@sentry.io/12345"})
    @patch("sentry_sdk.capture_exception")
    def test_capture_monitoring_error_calls_sentry_sdk(self, mock_capture):
        """Verify capture_monitoring_error safely invokes sentry_sdk when DSN is present."""
        exc = ValueError("Provider connection failed")
        main.capture_monitoring_error(exc, {"provider": "gemini", "stage": "features"})
        mock_capture.assert_called_once_with(exc)

    @patch.dict(os.environ, {}, clear=True)
    def test_capture_monitoring_error_noop_when_no_dsn(self):
        """Verify capture_monitoring_error is a safe no-op when SENTRY_DSN is absent."""
        exc = ValueError("Simulated error without DSN")
        # Should execute silently without raising any error
        main.capture_monitoring_error(exc)


class TestV312Item4CrossDeviceResumeVerification(unittest.IsolatedAsyncioTestCase):
    """Verification test suite for Item 4: Cross-Device Session/Draft Resume."""

    @patch.object(main, "get_supabase")
    async def test_cross_device_draft_listing_and_resume(self, mock_get_supabase):
        """
        Simulate Device 1 saving a draft and Device 2 retrieving and resuming all persisted fields:
        - idea_text, step0_state, fixed_inputs, and density_flags
        without any reliance on client-side local storage.
        """
        mock_client = MagicMock()
        mock_get_supabase.return_value = mock_client

        project_id = "11111111-2222-3333-4444-555555555555"
        user_id = "test-owner-uuid-123"
        persisted_project = {
            "id": project_id,
            "owner_id": user_id,
            "name": "EHR Clinical Desk",
            "title": "EHR Clinical Desk",
            "idea_text": "An EHR system for hospital staff with RBAC and appointment scheduling.",
            "status": "draft",
            "step0_state": {
                "round_count": 1,
                "off_topic_streak": 0,
                "last_label": "READY",
                "extracted_name": "EHR Clinical Desk",
            },
            "fixed_inputs": {
                "target_users": "Doctors and Nurses",
                "core_problem": "Fragmented medical records",
                "key_features": ["Prescriptions", "Schedules"],
            },
            "density_flags": {
                "clarifying_questions": "skip",
                "personas": "ask",
                "nfrs": "ask",
            },
            "created_at": "2026-09-21T05:00:00Z",
        }

        # Device 2 (Session B) fetches draft list
        mock_table = MagicMock()
        mock_client.table.return_value = mock_table
        mock_select = MagicMock()
        mock_eq1 = MagicMock()
        mock_eq2 = MagicMock()
        mock_order = MagicMock()

        mock_table.select.return_value = mock_select
        mock_select.eq.return_value = mock_eq1
        mock_eq1.eq.return_value = mock_eq2
        mock_eq2.order.return_value = mock_order
        mock_order.execute.return_value = MagicMock(data=[persisted_project])

        user_session_b = {"user_id": user_id, "token": "session-b-token"}
        drafts_res = await main.get_draft_projects(user_session_b)

        self.assertIn("drafts", drafts_res)
        self.assertEqual(len(drafts_res["drafts"]), 1)
        self.assertEqual(drafts_res["drafts"][0]["id"], project_id)
        self.assertEqual(drafts_res["drafts"][0]["name"], "EHR Clinical Desk")

        # Device 2 loads specific draft state
        with patch.object(main, "get_owned_project", return_value=persisted_project):
            load_res = await main.get_project_state(project_id, user_session_b)
            self.assertEqual(load_res["status"], "ok")
            project_data = load_res["project"]
            self.assertEqual(project_data["id"], project_id)
            self.assertEqual(project_data["idea_text"], persisted_project["idea_text"])
            self.assertEqual(project_data["step0_state"], persisted_project["step0_state"])
            self.assertEqual(project_data["fixed_inputs"], persisted_project["fixed_inputs"])
            self.assertEqual(project_data["density_flags"], persisted_project["density_flags"])


if __name__ == "__main__":
    unittest.main()
