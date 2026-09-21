import asyncio
import os
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

import main
from fastapi import HTTPException
from fastapi.testclient import TestClient


class Query:
    def __init__(self, result):
        self.result = result
        self._filters = []

    def select(self, *_args):
        return self

    def eq(self, key, value):
        self._filters.append((key, value))
        return self

    def in_(self, *_args):
        return self

    def update(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def execute(self):
        rows = list(getattr(self.result, "data", []) or [])
        for key, value in self._filters:
            rows = [
                row for row in rows if row.get(key, row) == value or key not in row
            ]
        self._filters = []
        return type("Result", (), {"data": rows})()


class Client:
    def __init__(self, project_result, comment_result=None):
        self.project_result = project_result
        self.comment_result = comment_result or type("Result", (), {"data": []})()

    def table(self, name):
        if name == "projects":
            return Query(self.project_result)
        return Query(self.comment_result)


class SecurityRegressionTests(unittest.TestCase):
    def setUp(self):
        main.service_health_cache.update({"expires_at": 0.0, "data": None})

    def test_scope_matching_uses_complete_tokens(self):
        self.assertTrue(main.has_concrete_project_scope("bank management system"))
        self.assertTrue(main.has_concrete_project_scope("A BANKING app with loan management."))
        self.assertFalse(main.has_concrete_project_scope("bankruptcy reporting"))
        self.assertFalse(main.has_concrete_project_scope("I want an app"))

    def test_owned_project_is_accepted(self):
        project = {"id": "11111111-1111-4111-8111-111111111111", "owner_id": "user-1"}
        client = Client(type("Result", (), {"data": [project]})())
        self.assertEqual(
            main.get_owned_project(client, "user-1", project["id"]),
            project,
        )

    def test_malformed_project_id_is_rejected_before_database_query(self):
        class FailingClient:
            def table(self, *_args):
                raise AssertionError("database should not be queried")

        with self.assertRaisesRegex(HTTPException, "Invalid project ID"):
            main.get_owned_project(FailingClient(), "user-1", "fake-project-id")

    def test_unowned_project_is_rejected(self):
        client = Client(type("Result", (), {"data": []})())
        with self.assertRaisesRegex(HTTPException, "Project not found"):
            main.get_owned_project(
                client,
                "attacker",
                "11111111-1111-4111-8111-111111111111",
            )

    def test_local_draft_is_rejected_before_provider_call(self):
        provider = AsyncMock(side_effect=AssertionError("provider must not be called"))
        client = Client(type("Result", (), {"data": []})())
        with patch.object(main, "get_supabase", return_value=client), patch.object(
            main, "call_gemini_api", provider
        ):
            with self.assertRaisesRegex(HTTPException, "persisted project ID"):
                asyncio.run(
                    main.process_comment_batch(
                        "local-draft-123",
                        main.BatchFixRequest(comments=[{"text": "change it"}]),
                        {"user_id": "user-1", "token": "token"},
                    )
                )
        provider.assert_not_awaited()

    def test_comment_read_requires_owned_project(self):
        client = Client(type("Result", (), {"data": []})())
        with patch.object(main, "get_supabase", return_value=client):
            with self.assertRaisesRegex(HTTPException, "Project not found"):
                asyncio.run(
                    main.get_project_comments(
                        "11111111-1111-4111-8111-111111111111",
                        {"user_id": "other-user", "token": "token"},
                    )
                )

    def test_owner_can_read_owned_project_comments(self):
        project = {"id": "11111111-1111-4111-8111-111111111111", "owner_id": "user-1"}
        comments = type("Result", (), {"data": [{"id": "comment-1"}]})()
        client = Client(type("Result", (), {"data": [project]})(), comments)
        with patch.object(main, "get_supabase", return_value=client):
            result = asyncio.run(
                main.get_project_comments(
                    project["id"],
                    {"user_id": "user-1", "token": "token"},
                )
            )
        self.assertEqual(result, {"comments": [{"id": "comment-1"}]})

    def test_invalid_comment_stage_is_rejected_with_422(self):
        project = {"id": "11111111-1111-4111-8111-111111111111", "owner_id": "user-1"}
        client = TestClient(main.app)

        with patch.object(main, "get_current_user", return_value={"user_id": "user-1", "token": "token"}), patch.object(main, "get_supabase", return_value=MagicMock()), patch.object(main, "get_owned_project", return_value=project):
            response = client.post(
                f"/api/projects/{project['id']}/comments",
                headers={"Authorization": "Bearer token"},
                json={"text": "bad stage", "stage": "structrue"},
            )

        self.assertEqual(response.status_code, 422)

    @patch.object(main, "check_generation_rate_limit")
    @patch.object(main, "call_groq_json", new_callable=AsyncMock)
    @patch.object(main, "call_gemini_api", new_callable=AsyncMock)
    def test_batch_fix_only_processes_comments_for_requested_stage(self, mock_gemini, mock_groq, mock_rate_limit):
        project = {
            "id": "11111111-1111-4111-8111-111111111111",
            "owner_id": "user-1",
            "generation_state": {
                "features": [{"id": "feat-1", "name": "Feature 1", "description": "Base feature", "source": "user_originated"}],
            },
        }
        comment_result = type(
            "Result",
            (),
            {
                "data": [
                    {"id": "comment-features", "project_id": project["id"], "stage": "features", "status": "pending", "text": "feature comment"},
                    {"id": "comment-structure", "project_id": project["id"], "stage": "structure", "status": "pending", "text": "structure comment"},
                ]
            },
        )()
        client = Client(type("Result", (), {"data": [project]})(), comment_result)

        mock_gemini.return_value = {
            "features": [{
                "id": "feat-1",
                "name": "Feature 1",
                "description": "Updated feature",
                "source": "user_originated",
                "business_rules": [],
                "data_touched": [],
                "actor_role": [],
                "acceptance_criteria": [],
                "exclusions": [],
                "priority": "must_have",
                "provenance": "user_originated",
                "reasoning": None,
                "source_model": "gemini",
            }]
        }

        with patch.object(main, "get_supabase", return_value=client), patch.object(main, "get_owned_project", return_value=project):
            result = asyncio.run(
                main.process_comment_batch(
                    project["id"],
                    main.BatchFixRequest(stage="features"),
                    {"user_id": "user-1", "token": "token"},
                )
            )

        self.assertEqual(result["status"], "ok")
        prompt = mock_gemini.await_args.args[1]
        self.assertIn("feature comment", prompt)
        self.assertNotIn("structure comment", prompt)

    def test_service_health_hides_unconfigured_providers(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": "", "GROQ_API_KEY": ""}):
            result = asyncio.run(main.health_services_check())
        self.assertEqual(result["backend"]["status"], "connected")
        self.assertEqual(result["gemini"]["status"], "unavailable")
        self.assertEqual(result["groq"]["status"], "unavailable")

    def test_service_health_checks_models_without_generation(self):
        class Response:
            def __init__(self, status_code, payload):
                self.status_code = status_code
                self.payload = payload

            def json(self):
                return self.payload

        class ProviderClient:
            def __init__(self, **_kwargs):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *_args):
                return False

            async def get(self, url, **_kwargs):
                if "generativelanguage" in url:
                    return Response(200, {})
                return Response(200, {"data": [{"id": "openai/gpt-oss-120b"}]})

            async def post(self, url, **_kwargs):
                if "generativelanguage" in url:
                    return Response(200, {"candidates": [{"content": {"parts": [{"text": "pong"}]}}]})
                return Response(200, {})

        with patch.dict(
            os.environ,
            {
                "GEMINI_API_KEY": "configured",
                "GROQ_API_KEY": "configured",
                "GROQ_MODEL": "openai/gpt-oss-120b",
            },
        ), patch.object(main.httpx, "AsyncClient", ProviderClient):
            result = asyncio.run(main.health_services_check())
        self.assertEqual(result["gemini"]["status"], "connected")
        self.assertEqual(result["groq"]["status"], "connected")


if __name__ == "__main__":
    unittest.main()
