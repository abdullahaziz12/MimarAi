import os
import sys
import unittest
import json
from unittest.mock import AsyncMock, patch, MagicMock

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import main
from fastapi.testclient import TestClient


class TestV39RequirementQualityStandard(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.auth_headers = {"Authorization": "Bearer fake-token"}
        self.mock_user = {
            "user_id": "11111111-1111-4111-8111-111111111111",
            "email": "architect@example.com",
            "role": "authenticated",
            "user_metadata": {},
            "token": "fake-token"
        }
        main.app.dependency_overrides[main.get_current_user] = lambda: self.mock_user

        self.mock_project = {
            "id": "proj-v39-1234",
            "owner_id": "11111111-1111-4111-8111-111111111111",
            "name": "Telehealth Platform",
            "status": "draft",
            "idea_text": "A telehealth platform allowing patients to book video consultations with certified doctors.",
            "fixed_inputs": {
                "stack": "Next.js + FastAPI",
                "database": "PostgreSQL",
                "deployment": "Docker / AWS",
                "apis": "Twilio Video API"
            },
            "step0_state": {},
            "density_flags": {"clarifying_questions": "full", "personas": "ask", "nfrs": "ask"}
        }

    def tearDown(self):
        main.app.dependency_overrides.clear()

    # =========================================================================
    # 1. INDIVIDUAL CODE-LEVEL CHECKS (5 Pure Python Characteristics)
    # =========================================================================

    def test_code_level_check_atomic_failure(self):
        """Atomic check flags descriptions containing compound actions/verbs joined by 'and'."""
        non_atomic_feature = {
            "id": "feat-1",
            "name": "Consultation & Invoicing",
            "description": "Allows patients to book video sessions and also enables doctors to create and send invoice receipts.",
            "source": "user_originated",
            "provenance": "user_originated",
            "business_rules": ["Patient selects doctor slot."],
            "data_touched": ["consultations", "invoices"],
            "actor_role": ["patient", "doctor"],
            "acceptance_criteria": ["Video session starts on time."],
            "exclusions": ["v1 no multi-party calls"],
            "priority": "must_have",
            "reasoning": None
        }
        flags = main.evaluate_code_level_quality(non_atomic_feature)
        self.assertFalse(flags["atomic"], "Compound action feature must fail atomic check")
        self.assertIn("atomic", flags["failed_checks"])

    def test_code_level_check_atomic_success(self):
        """Atomic check passes for single atomic behavior."""
        atomic_feature = {
            "id": "feat-1",
            "name": "Video Consultation Booking",
            "description": "Allows patients to schedule a single video consultation with an available doctor.",
            "source": "user_originated",
            "provenance": "user_originated",
            "business_rules": ["Patient selects doctor slot."],
            "data_touched": ["consultations"],
            "actor_role": ["patient", "doctor"],
            "acceptance_criteria": ["Patient receives confirmation when slot is reserved."],
            "exclusions": ["v1 no recurring slots"],
            "priority": "must_have",
            "reasoning": None
        }
        flags = main.evaluate_code_level_quality(atomic_feature)
        self.assertTrue(flags["atomic"], "Single behavior feature must pass atomic check")
        self.assertNotIn("atomic", flags["failed_checks"])

    def test_code_level_check_complete_failure(self):
        """Complete check flags features with missing or empty acceptance_criteria."""
        incomplete_feature = {
            "id": "feat-2",
            "name": "Patient Profile",
            "description": "Allows patients to view their medical profile.",
            "source": "user_originated",
            "provenance": "user_originated",
            "business_rules": ["Patient must be logged in."],
            "data_touched": ["patient_profile"],
            "actor_role": ["patient"],
            "acceptance_criteria": [],  # Empty criteria
            "exclusions": [],
            "priority": "must_have",
            "reasoning": None
        }
        flags = main.evaluate_code_level_quality(incomplete_feature)
        self.assertFalse(flags["complete"], "Feature with empty acceptance_criteria must fail complete check")
        self.assertIn("complete", flags["failed_checks"])

    def test_code_level_check_traceable_failure_for_ai_inferred_missing_reasoning(self):
        """Traceable check flags ai_inferred features that lack a non-null reasoning field."""
        untraceable_feature = {
            "id": "feat-3",
            "name": "Automated Prescriptions",
            "description": "Generates automated digital prescriptions after a consultation.",
            "source": "ai_inferred",
            "provenance": "ai_inferred",
            "business_rules": ["Doctor signs off digitally."],
            "data_touched": ["prescriptions"],
            "actor_role": ["doctor", "patient"],
            "acceptance_criteria": ["Prescription PDF is generated upon call completion."],
            "exclusions": [],
            "priority": "should_have",
            "reasoning": None  # Violates traceability requirement for ai_inferred
        }
        flags = main.evaluate_code_level_quality(untraceable_feature)
        self.assertFalse(flags["traceable"], "AI-inferred feature without reasoning must fail traceable check")
        self.assertIn("traceable", flags["failed_checks"])

    def test_code_level_check_traceable_success_for_ai_inferred_with_reasoning(self):
        """Traceable check passes for ai_inferred features with non-null reasoning."""
        traceable_feature = {
            "id": "feat-3",
            "name": "Automated Prescriptions",
            "description": "Generates automated digital prescriptions after a consultation.",
            "source": "ai_inferred",
            "provenance": "ai_inferred",
            "business_rules": ["Doctor signs off digitally."],
            "data_touched": ["prescriptions"],
            "actor_role": ["doctor", "patient"],
            "acceptance_criteria": ["Prescription PDF is generated upon call completion."],
            "exclusions": [],
            "priority": "should_have",
            "reasoning": "Required in clinical teleconsultation workflows to deliver valid patient care."
        }
        flags = main.evaluate_code_level_quality(traceable_feature)
        self.assertTrue(flags["traceable"], "AI-inferred feature with reasoning must pass traceable check")
        self.assertNotIn("traceable", flags["failed_checks"])

    def test_code_level_check_independent_failure(self):
        """Independent check flags descriptions referencing another feature by ID/name without standalone context."""
        dependent_feature = {
            "id": "feat-4",
            "name": "Consultation Recording",
            "description": "Requires feat-1 to be started first as described in feat-1 before recording begins.",
            "source": "user_originated",
            "provenance": "user_originated",
            "business_rules": ["Both parties consent."],
            "data_touched": ["recordings"],
            "actor_role": ["doctor", "patient"],
            "acceptance_criteria": ["Recording archive is available in session history."],
            "exclusions": [],
            "priority": "nice_to_have",
            "reasoning": None
        }
        flags = main.evaluate_code_level_quality(dependent_feature)
        self.assertFalse(flags["independent"], "Feature cross-referencing feat-1 in description must fail independent check")
        self.assertIn("independent", flags["failed_checks"])

    def test_code_level_check_feasible_failure(self):
        """Feasible check flags known-impossible absolute claims."""
        infeasible_feature = {
            "id": "feat-5",
            "name": "Real-time Telemetry",
            "description": "Guarantees 100% uptime with zero downtime and zero latency across all mobile devices.",
            "source": "user_originated",
            "provenance": "user_originated",
            "business_rules": ["Direct WebRTC connection."],
            "data_touched": ["video_stream"],
            "actor_role": ["patient", "doctor"],
            "acceptance_criteria": ["Video latency is maintained under 200ms."],
            "exclusions": [],
            "priority": "must_have",
            "reasoning": None
        }
        flags = main.evaluate_code_level_quality(infeasible_feature)
        self.assertFalse(flags["feasible"], "Feature claiming zero downtime / 100% uptime must fail feasible check")
        self.assertIn("feasible", flags["failed_checks"])

    # =========================================================================
    # 2. DIFF / MERGE OVERLAP MATCHING (data_touched + actor_role)
    # =========================================================================

    def test_diff_merge_matching_by_data_touched_and_actor_role_overlap(self):
        """
        Features with completely different names (e.g. 'Doctor Scheduler' vs 'Consultation Booking')
        that touch the same data and actors are correctly recognized as overlapping duplicates.
        """
        feat_gemini = {
            "id": "feat-1",
            "name": "Doctor Scheduler",
            "description": "Schedule consultations with doctors.",
            "data_touched": ["appointments", "doctor_calendar"],
            "actor_role": ["patient (booker)", "doctor (provider)"]
        }
        feat_groq = {
            "id": "feat-groq-1",
            "name": "Consultation Booking Desk",
            "description": "Patients book appointments with available practitioners.",
            "data_touched": ["appointments", "booking_slots"],
            "actor_role": ["patient", "doctor"]
        }
        self.assertTrue(
            main.are_features_overlapping(feat_gemini, feat_groq),
            "Features overlapping on appointments data and patient/doctor actors must match in Step 2 Diff/Merge"
        )

    def test_diff_merge_distinct_features_not_merged(self):
        """Features with different data and actors are kept distinct."""
        feat_consultations = {
            "id": "feat-1",
            "name": "Video Consultation",
            "description": "Live video call between patient and doctor.",
            "data_touched": ["video_session", "call_metadata"],
            "actor_role": ["patient", "doctor"]
        }
        feat_billing = {
            "id": "feat-groq-2",
            "name": "Insurance Claim Processing",
            "description": "Submit reimbursement claims to insurance providers.",
            "data_touched": ["claims", "insurance_policies"],
            "actor_role": ["billing_clerk", "insurance_auditor"]
        }
        self.assertFalse(
            main.are_features_overlapping(feat_consultations, feat_billing),
            "Unrelated features must not be merged"
        )

    # =========================================================================
    # 3. STEP 3 GROQ VALIDATION & QUALITY_FLAGS FOLDING
    # =========================================================================

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "check_generation_rate_limit")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    def test_generation_pipeline_populates_full_v39_schema(
        self, mock_groq, mock_gemini, mock_rate_limit, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        # Mock Gemini Step 1 Draft
        mock_gemini.return_value = {
            "idea_objective": "Synthesized telehealth consultation system",
            "features": [
                {
                    "id": "feat-1",
                    "name": "Video Consultation Booking",
                    "description": "Allows patients to schedule one-on-one video appointments with clinicians.",
                    "source": "user_originated",
                    "business_rules": ["Patient selects slot from doctor availability calendar."],
                    "data_touched": ["appointments", "calendar_slots"],
                    "actor_role": ["patient (booker)", "clinician (host)"],
                    "acceptance_criteria": ["Patient receives instant booking confirmation."],
                    "exclusions": ["v1 does not support multi-party group consultations."],
                    "priority": "must_have",
                    "provenance": "user_originated",
                    "reasoning": None,
                    "source_model": "gemini"
                }
            ]
        }

        # Mock Groq Step 1 Draft, Step 3 Val, Step 5 Val
        mock_groq.side_effect = [
            # Step 1 Groq Draft (inferred feature with reasoning)
            {
                "features": [
                    {
                        "id": "feat-groq-1",
                        "name": "E-Prescription Dispatch",
                        "description": "Enables clinicians to issue verifiable digital prescriptions after a consultation.",
                        "source": "ai_inferred",
                        "business_rules": ["Clinician signs prescription with digital key."],
                        "data_touched": ["prescriptions", "pharmacy_orders"],
                        "actor_role": ["clinician (issuer)", "patient (recipient)"],
                        "acceptance_criteria": ["Digital prescription PDF is generated upon call conclusion."],
                        "exclusions": ["v1 does not interface directly with third-party pharmacy inventory."],
                        "priority": "should_have",
                        "provenance": "ai_inferred",
                        "reasoning": "Standard clinical safety requirement for remote telehealth consultations.",
                        "source_model": "groq"
                    }
                ]
            },
            # Step 3 Groq Validation: valid with no flags
            {
                "is_valid": True,
                "flags": [],
                "feature_evaluations": [
                    {"id": "feat-1", "is_valid": True, "failed_checks": []},
                    {"id": "feat-2", "is_valid": True, "failed_checks": []}
                ]
            },
            # Step 5 Groq Final Validation
            {
                "is_valid": True,
                "flags": [],
                "feature_evaluations": [
                    {"id": "feat-1", "is_valid": True, "failed_checks": []},
                    {"id": "feat-2", "is_valid": True, "failed_checks": []}
                ]
            }
        ]

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/generate",
            headers=self.auth_headers,
            json={
                "idea_text": self.mock_project["idea_text"],
                "fixed_inputs": self.mock_project["fixed_inputs"]
            }
        )

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        gen_state = data["generation_state"]
        features = gen_state["features"]
        self.assertEqual(len(features), 2)

        # Check feat-1 full schema
        f1 = features[0]
        self.assertEqual(f1["id"], "feat-1")
        self.assertEqual(f1["name"], "Video Consultation Booking")
        self.assertEqual(f1["source"], "user_originated")
        self.assertEqual(f1["provenance"], "user_originated")
        self.assertIsNone(f1["reasoning"])
        self.assertEqual(f1["priority"], "must_have")
        self.assertIn("appointments", f1["data_touched"])
        self.assertTrue(len(f1["acceptance_criteria"]) > 0)
        self.assertIn("quality_flags", f1)
        self.assertTrue(f1["quality_flags"]["atomic"])
        self.assertTrue(f1["quality_flags"]["complete"])
        self.assertTrue(f1["quality_flags"]["traceable"])
        self.assertTrue(f1["quality_flags"]["independent"])
        self.assertTrue(f1["quality_flags"]["feasible"])
        self.assertEqual(f1["quality_flags"]["failed_checks"], [])

        # Check feat-2 (Groq AI-inferred) full schema
        f2 = features[1]
        self.assertEqual(f2["provenance"], "ai_inferred")
        self.assertIsNotNone(f2["reasoning"])
        self.assertIn("clinical safety", f2["reasoning"])
        self.assertTrue(f2["quality_flags"]["traceable"])

    # =========================================================================
    # 4. STEP 4 FIX PASS TARGETING QUALITY FLAGS
    # =========================================================================

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "check_generation_rate_limit")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    def test_violation_triggers_fix_pass_and_recovers(
        self, mock_groq, mock_gemini, mock_rate_limit, mock_get_project, mock_supabase
    ):
        mock_get_project.return_value = dict(self.mock_project)
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        # Initial draft contains non-atomic feature
        draft_f1 = {
            "id": "feat-1",
            "name": "Booking and Billing",
            "description": "Allows patients to book sessions and also enables billing clerks to charge cards.",
            "source": "user_originated",
            "business_rules": ["Patient books."],
            "data_touched": ["bookings"],
            "actor_role": ["patient"],
            "acceptance_criteria": ["Booked."],
            "exclusions": [],
            "priority": "must_have",
            "provenance": "user_originated",
            "reasoning": None,
            "source_model": "gemini"
        }

        repaired_f1 = {
            "id": "feat-1",
            "name": "Consultation Booking",
            "description": "Allows patients to reserve an appointment slot.",
            "source": "user_originated",
            "business_rules": ["Patient selects slot."],
            "data_touched": ["bookings"],
            "actor_role": ["patient"],
            "acceptance_criteria": ["Slot is reserved upon confirmation."],
            "exclusions": [],
            "priority": "must_have",
            "provenance": "user_originated",
            "reasoning": None,
            "source_model": "gemini"
        }

        # Gemini: 1st call Step 1 draft, 2nd call Step 4 fix pass
        mock_gemini.side_effect = [
            {"idea_objective": "Telehealth", "features": [draft_f1]},
            {"features": [repaired_f1]}
        ]

        # Groq: Step 1 draft, Step 3 Val (fails unambiguous), Step 5 Val (passes)
        mock_groq.side_effect = [
            {"features": []},  # Step 1 Groq draft
            {
                "is_valid": False,
                "flags": ["Feature contains vague terms"],
                "feature_evaluations": [
                    {"id": "feat-1", "is_valid": False, "failed_checks": ["unambiguous"]}
                ]
            },  # Step 3 Val
            {
                "is_valid": True,
                "flags": [],
                "feature_evaluations": [
                    {"id": "feat-1", "is_valid": True, "failed_checks": []}
                ]
            }   # Step 5 Val
        ]

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/generate",
            headers=self.auth_headers,
            json={
                "idea_text": self.mock_project["idea_text"],
                "fixed_inputs": self.mock_project["fixed_inputs"]
            }
        )

        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        gen_state = data["generation_state"]
        # adjusted_flag was set because fix pass was triggered
        self.assertTrue(gen_state["adjusted_flag"])
        features = gen_state["features"]
        self.assertEqual(len(features), 1)
        self.assertEqual(features[0]["name"], "Consultation Booking")
        self.assertTrue(features[0]["quality_flags"]["atomic"])

    # =========================================================================
    # 5. BACKWARD COMPATIBILITY: PLAN REVIEW & COMMENTS ENDPOINTS
    # =========================================================================

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    def test_reject_feature_with_extended_schema(self, mock_get_project, mock_supabase):
        """Reject feature endpoint toggles rejection without degrading extended schema."""
        proj_with_features = dict(self.mock_project)
        proj_with_features["generation_state"] = {
            "features": [
                {
                    "id": "feat-1",
                    "name": "Feature 1",
                    "description": "Desc 1",
                    "source": "user_originated",
                    "business_rules": ["Rule 1"],
                    "data_touched": ["data_1"],
                    "actor_role": ["user"],
                    "acceptance_criteria": ["Crit 1"],
                    "exclusions": [],
                    "priority": "must_have",
                    "provenance": "user_originated",
                    "reasoning": None,
                    "quality_flags": {"atomic": True, "complete": True, "traceable": True, "independent": True, "feasible": True, "failed_checks": []}
                },
                {
                    "id": "feat-2",
                    "name": "Feature 2",
                    "description": "Desc 2",
                    "source": "ai_inferred",
                    "business_rules": ["Rule 2"],
                    "data_touched": ["data_2"],
                    "actor_role": ["user"],
                    "acceptance_criteria": ["Crit 2"],
                    "exclusions": [],
                    "priority": "should_have",
                    "provenance": "ai_inferred",
                    "reasoning": "Reason 2",
                    "quality_flags": {"atomic": True, "complete": True, "traceable": True, "independent": True, "feasible": True, "failed_checks": []}
                }
            ],
            "rejected_feature_ids": []
        }
        mock_get_project.return_value = proj_with_features
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/features/feat-2/reject",
            headers=self.auth_headers
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertIn("feat-2", data["rejected_feature_ids"])

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "call_gemini_api")
    @patch.object(main, "call_groq_json")
    def test_dependency_order_with_extended_schema(self, mock_groq, mock_gemini, mock_get_project, mock_supabase):
        """Dependency order endpoint orders active features with extended schema correctly."""
        proj_with_features = dict(self.mock_project)
        proj_with_features["generation_state"] = {
            "features": [
                {"id": "feat-1", "name": "Feature 1", "data_touched": ["data_1"], "acceptance_criteria": ["Crit 1"]},
                {"id": "feat-2", "name": "Feature 2", "data_touched": ["data_2"], "acceptance_criteria": ["Crit 2"]}
            ],
            "rejected_feature_ids": []
        }
        mock_get_project.return_value = proj_with_features
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        mock_gemini.return_value = {"dependency_order": ["feat-1", "feat-2"]}
        mock_groq.return_value = {"is_valid": True}

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/dependency-order",
            headers=self.auth_headers
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["dependency_order"], ["feat-1", "feat-2"])

    @patch.object(main, "get_supabase")
    @patch.object(main, "get_owned_project")
    @patch.object(main, "check_generation_rate_limit")
    @patch.object(main, "call_gemini_api")
    def test_comments_batch_fix_preserves_extended_schema(
        self, mock_gemini, mock_rate_limit, mock_get_project, mock_supabase
    ):
        """Comments batch-fix processes user comments and returns features adhering to V3.9 schema."""
        proj_with_features = dict(self.mock_project)
        proj_with_features["generation_state"] = {
            "features": [
                {
                    "id": "feat-1",
                    "name": "Feature 1",
                    "description": "Original summary",
                    "source": "user_originated",
                    "business_rules": ["Original rule"],
                    "data_touched": ["entity_1"],
                    "actor_role": ["user"],
                    "acceptance_criteria": ["Original criterion"],
                    "exclusions": [],
                    "priority": "must_have",
                    "provenance": "user_originated",
                    "reasoning": None
                }
            ]
        }
        mock_get_project.return_value = proj_with_features
        mock_supabase_client = MagicMock()
        mock_supabase.return_value = mock_supabase_client

        mock_gemini.return_value = {
            "features": [
                {
                    "id": "feat-1",
                    "name": "Feature 1 (Updated)",
                    "description": "Updated summary incorporating review feedback.",
                    "source": "user_originated",
                    "business_rules": ["Updated rule 1", "Updated rule 2"],
                    "data_touched": ["entity_1", "entity_2"],
                    "actor_role": ["user", "admin"],
                    "acceptance_criteria": ["Updated testable criterion."],
                    "exclusions": ["v1 boundary"],
                    "priority": "must_have",
                    "provenance": "user_originated",
                    "reasoning": None,
                    "source_model": "gemini"
                }
            ]
        }

        resp = self.client.post(
            f"/api/projects/{self.mock_project['id']}/comments/batch-fix",
            headers=self.auth_headers,
            json={
                "comments": [{"id": "comm-1", "target_feature_id": "feat-1", "text": "Add admin actor"}],
                "current_features": proj_with_features["generation_state"]["features"]
            }
        )
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertEqual(data["status"], "ok")
        updated_features = data["generation_state"]["features"]
        self.assertEqual(len(updated_features), 1)
        f = updated_features[0]
        self.assertEqual(f["name"], "Feature 1 (Updated)")
        self.assertIn("admin", f["actor_role"])
        self.assertIn("quality_flags", f)
        self.assertTrue(f["quality_flags"]["complete"])


if __name__ == "__main__":
    unittest.main()
