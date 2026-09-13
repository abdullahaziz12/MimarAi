import os
import sys
import unittest
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.dirname(__file__))
import main


class TestV33ClarifyingQuestions(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(main.app)
        self.mock_user = {
            "user_id": "u-test-user-123",
            "email": "tester@mimarai.com",
            "role": "authenticated",
            "token": "valid-token-xyz"
        }
        main.app.dependency_overrides[main.get_current_user] = lambda: self.mock_user

        self.mock_project = {
            "id": "p-test-proj-456",
            "owner_id": "u-test-user-123",
            "name": "Test Project",
            "status": "draft",
            "idea_text": "A dental clinic appointment booking system",
            "step0_state": {},
            "density_flags": {
                "clarifying_questions": "full",
                "personas": "ask",
                "nfrs": "ask"
            }
        }

    def tearDown(self):
        main.app.dependency_overrides.clear()

    def test_skip_density_case_makes_zero_ai_calls(self):
        """When density flag is 'skip', clarifying questions stage returns skipped with 0 AI calls"""
        mock_sb = MagicMock()
        with patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=self.mock_project), \
             patch.object(main, "call_groq_json") as mock_groq:
            
            resp = self.client.post(
                "/api/projects/p-test-proj-456/clarifying-questions",
                headers={"Authorization": "Bearer valid-token-xyz"},
                json={
                    "idea_text": "A secure high traffic banking app for doctors and users with 50000 daily transactions",
                    "density_flags": {
                        "clarifying_questions": "skip",
                        "personas": "skip",
                        "nfrs": "skip"
                    }
                }
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "skipped")
            self.assertEqual(data["questions"], [])
            mock_groq.assert_not_called()

    def test_partial_density_case_generates_reduced_questions(self):
        """When density flag is 'partial', generates 1-2 questions and accounts for existing signals"""
        mock_sb = MagicMock()
        mock_q = MagicMock()
        mock_q.insert.return_value = mock_q
        mock_q.execute.return_value = MagicMock(data=[{"id": "q-1"}])
        mock_sb.table.return_value = mock_q

        mock_groq_response = {
            "questions": [
                "Do appointments require upfront payment or deposit during booking?",
                "Are patient reminders sent via SMS, email, or both?"
            ]
        }

        with patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=self.mock_project), \
             patch.object(main, "call_groq_json", return_value=mock_groq_response) as mock_groq:
            
            resp = self.client.post(
                "/api/projects/p-test-proj-456/clarifying-questions",
                headers={"Authorization": "Bearer valid-token-xyz"},
                json={
                    "idea_text": "A dental clinic appointment booking system where patients book appointments with doctors",
                    "density_flags": {
                        "clarifying_questions": "partial",
                        "personas": "skip",
                        "nfrs": "ask"
                    }
                }
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["density_flag"], "partial")
            self.assertLessEqual(len(data["questions"]), 2)
            
            # Verify system prompt instructed not to ask about personas since personas was 'skip'
            called_sys_prompt = mock_groq.call_args[0][0]
            self.assertIn("User roles and personas are already defined", called_sys_prompt)

    def test_full_density_case_generates_full_question_set(self):
        """When density flag is 'full', generates up to 4 questions"""
        mock_sb = MagicMock()
        mock_q = MagicMock()
        mock_q.insert.return_value = mock_q
        mock_q.execute.return_value = MagicMock(data=[{"id": "q-1"}])
        mock_sb.table.return_value = mock_q

        mock_groq_response = {
            "questions": [
                "What loan interest calculation models must be supported?",
                "Should loan approval require single or multi-tier approval chains?",
                "Do repayments integrate directly with banking ACH or card processors?"
            ]
        }

        with patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=self.mock_project), \
             patch.object(main, "call_groq_json", return_value=mock_groq_response):
            
            resp = self.client.post(
                "/api/projects/p-test-proj-456/clarifying-questions",
                headers={"Authorization": "Bearer valid-token-xyz"},
                json={
                    "idea_text": "A loan management system",
                    "density_flags": {
                        "clarifying_questions": "full",
                        "personas": "ask",
                        "nfrs": "ask"
                    }
                }
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["density_flag"], "full")
            self.assertEqual(len(data["questions"]), 3)

    def test_answer_submission_and_persistence(self):
        """Submitting answers updates clarifying_questions rows and folds into project step0_state"""
        mock_sb = MagicMock()
        mock_q = MagicMock()
        mock_q.select.return_value = mock_q
        mock_q.eq.return_value = mock_q
        mock_q.order.return_value = mock_q
        mock_q.update.return_value = mock_q
        mock_q.execute.return_value = MagicMock(data=[
            {"id": "33333333-3333-3333-3333-333333333333", "question": "What loan terms?", "answer": "Fixed 30-year terms"}
        ])
        mock_sb.table.return_value = mock_q

        with patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=self.mock_project):
            
            resp = self.client.post(
                "/api/projects/p-test-proj-456/clarifying-questions/answer",
                headers={"Authorization": "Bearer valid-token-xyz"},
                json={
                    "answers": [
                        {"question_id": "33333333-3333-3333-3333-333333333333", "answer": "Fixed 30-year terms"}
                    ]
                }
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["status"], "ok")
            self.assertEqual(data["updated_count"], 1)

    def test_get_clarifying_questions_endpoint(self):
        """GET endpoint returns all persisted questions and answers for the project"""
        mock_sb = MagicMock()
        mock_q = MagicMock()
        mock_q.select.return_value = mock_q
        mock_q.eq.return_value = mock_q
        mock_q.order.return_value = mock_q
        mock_q.execute.return_value = MagicMock(data=[
            {"id": "q-1", "question": "Question 1?", "answer": "Answer 1"},
            {"id": "q-2", "question": "Question 2?", "answer": None}
        ])
        mock_sb.table.return_value = mock_q

        with patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=self.mock_project):
            
            resp = self.client.get(
                "/api/projects/p-test-proj-456/clarifying-questions",
                headers={"Authorization": "Bearer valid-token-xyz"}
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("questions", data)
            self.assertEqual(len(data["questions"]), 2)

    def test_fail_closed_error_handling(self):
        """Fail-closed on AI error: returns 502 with error message"""
        mock_sb = MagicMock()
        with patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=self.mock_project), \
             patch.object(main, "call_groq_json", side_effect=Exception("Provider timeout")):
            
            resp = self.client.post(
                "/api/projects/p-test-proj-456/clarifying-questions",
                headers={"Authorization": "Bearer valid-token-xyz"},
                json={"idea_text": "A banking app"}
            )
            self.assertEqual(resp.status_code, 502)

    def test_existing_step0_too_vague_flow_remains_untouched(self):
        """Step 0 TOO_VAGUE classification behavior remains distinct and unchanged"""
        mock_sb = MagicMock()
        mock_q = MagicMock()
        mock_q.select.return_value = mock_q
        mock_q.eq.return_value = mock_q
        mock_q.update.return_value = mock_q
        mock_q.insert.return_value = mock_q
        mock_q.execute.return_value = MagicMock(data=[])
        mock_sb.table.return_value = mock_q

        mock_project = {"id": "00000000-0000-0000-0000-000000000000", "owner_id": "u-test-user-123", "step0_state": {}}
        mock_groq_resp = MagicMock()
        mock_groq_resp.status_code = 200
        mock_groq_resp.json.return_value = {
            "choices": [{"message": {"content": '{"label": "TOO_VAGUE", "sub_case": "no_domain", "extracted_name": "app", "explanation": "Vague"}'}}]
        }

        with patch.dict(os.environ, {"GROQ_API_KEY": "fake-groq-key"}), \
             patch.object(main, "get_supabase", return_value=mock_sb), \
             patch.object(main, "get_owned_project", return_value=mock_project), \
             patch("httpx.AsyncClient.post", return_value=mock_groq_resp):
            resp = self.client.post(
                "/api/interview/classify",
                headers={"Authorization": "Bearer valid-token-xyz"},
                json={
                    "idea_text": "an app",
                    "project_id": "00000000-0000-0000-0000-000000000000"
                }
            )
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertEqual(data["label"], "TOO_VAGUE")



if __name__ == "__main__":
    unittest.main()
