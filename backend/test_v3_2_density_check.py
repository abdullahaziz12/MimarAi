import os
import sys
import time
import unittest
from unittest.mock import patch, MagicMock

sys.path.insert(0, os.path.dirname(__file__))
import main


class TestV32DensityCheck(unittest.TestCase):
    def test_minimal_sparse_idea(self):
        """Minimal idea under 20 words with no keywords -> full/ask/ask"""
        idea = "A simple notes app."
        flags = main.compute_density_flags(idea)
        self.assertEqual(flags, {
            "clarifying_questions": "full",
            "personas": "ask",
            "nfrs": "ask"
        })

    def test_short_idea_with_persona_enforces_length_gate(self):
        """Short idea (<20 words) with persona keyword skips personas, but MUST NOT skip clarifying questions"""
        idea = "An admin tool for inventory management."
        flags = main.compute_density_flags(idea)
        self.assertEqual(flags, {
            "clarifying_questions": "full",
            "personas": "skip",
            "nfrs": "ask"
        })

    def test_short_idea_with_one_generic_role_still_asks_for_personas(self):
        """A single generic role mention without an action is not a persona description."""
        idea = "A banking app for employees."
        flags = main.compute_density_flags(idea)
        self.assertEqual(flags["personas"], "ask")

    def test_moderate_idea_with_personas(self):
        """Moderate idea (20-45 words) with personas -> partial/skip/ask"""
        idea = (
            "A dental clinic appointment booking system where patients can book appointments "
            "with their preferred doctors and staff can organize the calendar and schedules daily."
        )
        flags = main.compute_density_flags(idea)
        self.assertEqual(flags, {
            "clarifying_questions": "partial",
            "personas": "skip",
            "nfrs": "ask"
        })

    def test_moderate_idea_scale_only(self):
        """Moderate idea with scale keywords but no sensitivity -> nfrs: ask"""
        idea = (
            "A distributed image hosting service designed to process 50,000 requests per second "
            "across regional load balanced servers with high traffic and low latency."
        )
        flags = main.compute_density_flags(idea)
        self.assertEqual(flags, {
            "clarifying_questions": "partial",
            "personas": "ask",
            "nfrs": "ask"
        })

    def test_moderate_idea_sensitivity_only(self):
        """Moderate idea with sensitivity keywords but no scale or personas -> partial/ask/ask"""
        idea = (
            "A telemetry data pipeline system that archives sensitive health diagnostic streams "
            "and medical history data with HIPAA compliant encrypted database storage across secure environments."
        )
        flags = main.compute_density_flags(idea)
        self.assertEqual(flags, {
            "clarifying_questions": "partial",
            "personas": "ask",
            "nfrs": "ask"
        })

    def test_dense_idea_with_all_dimensions(self):
        """Dense idea (>=45 words, >=3 clauses) covering personas, scale, and sensitivity -> skip/skip/skip"""
        idea = (
            "A secure, high-throughput HIPAA-compliant healthcare and banking platform engineered "
            "to process 50,000 daily financial transactions and confidential patient medical records; "
            "doctors, patients, and administrators access dedicated portals using distinct role-based permissions; "
            "the system handles high traffic with low latency and encrypted database storage."
        )
        flags = main.compute_density_flags(idea)
        self.assertEqual(flags, {
            "clarifying_questions": "skip",
            "personas": "skip",
            "nfrs": "skip"
        })

    def test_resolved_answer_combined_in_density_check(self):
        """Resolved answer from Round 2 contradiction scan contributes to density check"""
        idea = "A dental clinic appointment booking system."
        resolved = (
            "The system allows patients to book slots with doctors while administrators manage "
            "50,000 daily requests and confidential medical records securely."
        )
        flags = main.compute_density_flags(idea, resolved_answer=resolved)
        self.assertEqual(flags["personas"], "skip")
        self.assertEqual(flags["nfrs"], "skip")
        self.assertIn(flags["clarifying_questions"], ["partial", "skip"])

    def test_invalid_and_empty_inputs(self):
        """Empty string, None, or non-string types return safe default flags"""
        self.assertEqual(main.compute_density_flags(""), main.DEFAULT_DENSITY_FLAGS)
        self.assertEqual(main.compute_density_flags(None), main.DEFAULT_DENSITY_FLAGS)
        self.assertEqual(main.compute_density_flags(12345), main.DEFAULT_DENSITY_FLAGS)
        self.assertEqual(main.compute_density_flags({"idea": "bad"}), main.DEFAULT_DENSITY_FLAGS)

    def test_fail_safe_fallback_on_internal_exception(self):
        """Forced internal regex exception triggers safe fallback: full/ask/ask"""
        with patch("re.search", side_effect=RuntimeError("Forced internal regex engine failure")):
            flags = main.compute_density_flags("A complex HIPAA banking app for doctors and users with 50,000 daily transactions.")
            self.assertEqual(flags, {
                "clarifying_questions": "full",
                "personas": "ask",
                "nfrs": "ask"
            })

    def test_latency_negligible(self):
        """Synchronous heuristic must complete in well under 50ms (benchmark 500 iterations)"""
        dense_idea = (
            "A secure, high-throughput HIPAA-compliant healthcare and banking platform engineered "
            "to process 50,000 daily financial transactions and confidential patient medical records; "
            "doctors, patients, and administrators access dedicated portals using distinct role-based permissions."
        )
        t0 = time.perf_counter()
        for _ in range(500):
            main.compute_density_flags(dense_idea)
        elapsed_total = time.perf_counter() - t0
        avg_per_call_ms = (elapsed_total / 500) * 1000

        # Assert single call is well under 50ms (typically <0.1ms)
        self.assertLess(avg_per_call_ms, 50.0)
        print(f"\n[Density Check Benchmark] 500 iterations took {elapsed_total:.4f}s total (Avg: {avg_per_call_ms:.4f}ms/call)")

    def test_contradiction_scan_endpoint_returns_density_flags(self):
        """Contradiction scan endpoint includes density_flags in response payload and updates DB"""
        from fastapi.testclient import TestClient
        client = TestClient(main.app)

        mock_user = {"user_id": "u-123", "token": "tok"}
        main.app.dependency_overrides[main.get_current_user] = lambda: mock_user

        mock_project = {
            "id": "p-123",
            "owner_id": "u-123",
            "idea_text": "A dental clinic system for doctors and patients",
            "step0_state": {}
        }
        mock_sb = MagicMock()
        mock_q = MagicMock()
        mock_q.select.return_value = mock_q
        mock_q.eq.return_value = mock_q
        mock_q.execute.return_value = MagicMock(data=[mock_project])
        mock_q.update.return_value = mock_q
        mock_q.insert.return_value = mock_q
        mock_sb.table.return_value = mock_q

        with patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=mock_project), \
             patch.object(main, "call_groq_json", return_value={"contradiction": False}):
            
            resp = client.post(
                "/api/projects/p-123/contradiction-scan",
                headers={"Authorization": "Bearer tok"},
                json={"idea_text": "A dental clinic appointment booking system where doctors manage appointments and patients view schedules.", "round": 1}
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("density_flags", data)
            self.assertEqual(data["density_flags"]["personas"], "skip")
            self.assertIn("clarifying_questions", data["density_flags"])
            self.assertIn("nfrs", data["density_flags"])


if __name__ == "__main__":
    unittest.main()
