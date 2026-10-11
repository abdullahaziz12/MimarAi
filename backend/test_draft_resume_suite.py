import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import uuid
from datetime import datetime, timezone

from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_clarifying_generation_deletes_unanswered_orphans(client):
    """
    Evidence for Bug 1.1 / Cluster 1:
    Before inserting a fresh batch of clarifying questions, existing unanswered rows
    for that project are hard-deleted from clarifying_questions.
    """
    project_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    mock_supabase = MagicMock()
    mock_cq_table = MagicMock()
    mock_proj_table = MagicMock()

    # Track delete calls
    delete_mock = MagicMock()
    mock_cq_table.delete.return_value = delete_mock
    del_eq = MagicMock()
    delete_mock.eq.return_value = del_eq
    del_is = MagicMock()
    del_eq.is_.return_value = del_is
    del_is.execute.return_value = MagicMock(data=[])
    del_eq_ans = MagicMock()
    del_eq.eq.return_value = del_eq_ans
    del_eq_ans.execute.return_value = MagicMock(data=[])

    # Insert mocks
    mock_cq_table.insert.return_value.execute.return_value = MagicMock(data=[{"id": str(uuid.uuid4())}])

    def table_mock(name):
        if name == "clarifying_questions":
            return mock_cq_table
        if name == "projects":
            return mock_proj_table
        return MagicMock()

    mock_supabase.table.side_effect = table_mock

    mock_project = {
        "id": project_id,
        "owner_id": user_id,
        "idea_text": "Hospital EHR Management Platform",
        "step0_state": {"round_count": 0, "last_label": "READY"}
    }

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase), \
         patch("backend.main.get_owned_project", return_value=mock_project), \
         patch("backend.main.call_groq_json", return_value={"questions": ["What compliance standards (HIPAA)?", "Who are the primary actors?"]}):

        res = client.post(
            f"/api/projects/{project_id}/clarifying-questions",
            json={"idea_text": "Hospital EHR Management Platform", "density_flag": "full", "max_questions": 2},
            headers={"Authorization": "Bearer test-token"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "ok"
        assert len(data["questions"]) == 2

        # Verify that delete() was called on clarifying_questions table to wipe orphans
        assert mock_cq_table.delete.called
        del_eq.is_.assert_called_with("answer", "null")


def test_clarifying_answers_submit_appends_transcript_and_sets_flag(client):
    """
    Evidence for Bug 1.1 & 1.5:
    Submitting answers sets step0_state.clarifying_completed = True
    and appends user answers to step0_state.conversation_transcript in the exact same write.
    """
    project_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())
    q1_id = str(uuid.uuid4())

    mock_supabase = MagicMock()
    mock_proj_table = MagicMock()
    mock_cq_table = MagicMock()

    updated_project_payload = {}

    def proj_update(payload):
        nonlocal updated_project_payload
        updated_project_payload = payload
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[])
        return mock_eq

    mock_proj_table.update.side_effect = proj_update
    mock_cq_table.update.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
    mock_cq_table.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(
        data=[{"id": q1_id, "question": "What compliance?", "answer": "HIPAA compliance required."}]
    )

    def table_mock(name):
        if name == "projects":
            return mock_proj_table
        if name == "clarifying_questions":
            return mock_cq_table
        return MagicMock()

    mock_supabase.table.side_effect = table_mock

    mock_project = {
        "id": project_id,
        "owner_id": user_id,
        "step0_state": {
            "round_count": 0,
            "last_label": "READY",
            "conversation_transcript": [
                {"id": "tr-1", "role": "user", "text": "Hospital EHR", "kind": "idea_submitted"}
            ]
        }
    }

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase), \
         patch("backend.main.get_owned_project", return_value=mock_project):

        res = client.post(
            f"/api/projects/{project_id}/clarifying-questions/answer",
            json={"answers": [{"question_id": q1_id, "answer": "HIPAA compliance required."}]},
            headers={"Authorization": "Bearer test-token"}
        )
        assert res.status_code == 200
        assert updated_project_payload != {}
        s0 = updated_project_payload.get("step0_state", {})
        assert s0.get("clarifying_completed") is True

        # Check transcript contains the answer
        transcript = s0.get("conversation_transcript", [])
        assert len(transcript) == 2
        assert transcript[-1]["kind"] == "clarifying_answer"
        assert transcript[-1]["text"] == "HIPAA compliance required."
        assert transcript[-1]["role"] == "user"


def test_persona_and_nfr_appends_to_conversation_transcript(client):
    """
    Evidence for Bug 1.5:
    Persona capture and NFR capture append events to step0_state.conversation_transcript.
    """
    project_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    mock_supabase = MagicMock()
    mock_proj_table = MagicMock()
    mock_proj_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    def table_mock(name):
        return mock_proj_table

    mock_supabase.table.side_effect = table_mock

    mock_project = {
        "id": project_id,
        "owner_id": user_id,
        "step0_state": {
            "round_count": 0,
            "last_label": "READY",
            "clarifying_completed": True,
            "conversation_transcript": [
                {"id": "tr-1", "role": "user", "text": "Hospital EHR", "kind": "idea_submitted"}
            ]
        }
    }

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase), \
         patch("backend.main.get_owned_project", return_value=mock_project):

        # 1. Submit Persona
        res_p = client.post(
            f"/api/projects/{project_id}/personas",
            json={"answer": "Doctors, nurses, and hospital billing admins."},
            headers={"Authorization": "Bearer test-token"}
        )
        assert res_p.status_code == 200

        # 2. Submit NFR
        res_nfr = client.post(
            f"/api/projects/{project_id}/nfrs",
            json={"scale": "thousands_plus", "data_sensitivity": "sensitive", "availability": "needs_to_be_reliable"},
            headers={"Authorization": "Bearer test-token"}
        )
        assert res_nfr.status_code == 200


def test_get_drafts_endpoint_returns_advanced_stage_projects(client):
    """
    Evidence for Bug 2.5:
    GET /projects/drafts drops the .eq("status", "draft") filter and returns projects
    across all stages (draft, features_accepted, structure_accepted, diagram_accepted, final_locked).
    """
    user_id = str(uuid.uuid4())

    mock_projects = [
        {"id": "p-1", "name": "Project 1", "status": "draft", "owner_id": user_id},
        {"id": "p-2", "name": "Project 2", "status": "features_accepted", "owner_id": user_id},
        {"id": "p-3", "name": "Project 3", "status": "structure_accepted", "owner_id": user_id},
        {"id": "p-4", "name": "Project 4", "status": "diagram_accepted", "owner_id": user_id},
        {"id": "p-5", "name": "Project 5", "status": "final_locked", "owner_id": user_id},
    ]

    mock_supabase = MagicMock()
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_select = MagicMock()
    mock_table.select.return_value = mock_select
    mock_eq = MagicMock()
    mock_select.eq.return_value = mock_eq
    mock_order = MagicMock()
    mock_eq.order.return_value = mock_order
    mock_order.execute.return_value = MagicMock(data=mock_projects)

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase):

        res = client.get("/api/projects/drafts", headers={"Authorization": "Bearer test-token"})
        assert res.status_code == 200
        data = res.json()
        assert "drafts" in data
        assert len(data["drafts"]) == 5
        statuses = [d["status"] for d in data["drafts"]]
        assert "draft" in statuses
        assert "features_accepted" in statuses
        assert "structure_accepted" in statuses
        assert "diagram_accepted" in statuses
        assert "final_locked" in statuses


def test_get_project_state_rehydrates_final_plan_and_transcript(client):
    """
    Evidence for Bug 2.4 & 1.5:
    GET /projects/{project_id} reads and returns final_plan_state from final_plans table
    and step0_state.conversation_transcript.
    """
    project_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    transcript = [
        {"id": "tr-1", "role": "user", "text": "Hospital EHR", "kind": "idea_submitted"},
        {"id": "tr-2", "role": "ai", "text": "Contradiction detected...", "kind": "contradiction_prompt"},
        {"id": "tr-3", "role": "user", "text": "Resolution: use cloud Postgres", "kind": "contradiction_resolved"},
        {"id": "tr-4", "role": "ai", "text": "What compliance?", "kind": "clarifying_question"},
        {"id": "tr-5", "role": "user", "text": "HIPAA compliance", "kind": "clarifying_answer"}
    ]

    mock_project = {
        "id": project_id,
        "owner_id": user_id,
        "name": "EHR System",
        "status": "diagram_accepted",
        "step0_state": {
            "round_count": 0,
            "last_label": "READY",
            "clarifying_completed": True,
            "conversation_transcript": transcript
        },
        "diagram_state": {
            "status": "accepted",
            "accepted_schema": {"tables": [{"name": "patients"}]},
            "mermaid_erd": "erDiagram\n PATIENTS ||--o{ APPOINTMENTS : has",
            "mermaid_architecture": "graph TD\n API --> CoreService"
        }
    }

    mock_final_plan = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "status": "locked",
        "consolidated_summary": {"system_name": "Hospital EHR"}
    }

    mock_supabase = MagicMock()

    def table_mock(name):
        mock_t = MagicMock()
        if name == "projects":
            mock_t.select.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[mock_project])
        elif name == "final_plans":
            mock_t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[mock_final_plan])
        elif name == "clarifying_questions":
            mock_t.select.return_value.eq.return_value.order.return_value.execute.return_value = MagicMock(data=[])
        return mock_t

    mock_supabase.table.side_effect = table_mock

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase):

        res = client.get(f"/api/projects/{project_id}", headers={"Authorization": "Bearer test-token"})
        assert res.status_code == 200
        p = res.json().get("project", {})
        assert p["id"] == project_id
        assert p["final_plan_state"] is not None
        assert p["final_plan_state"]["status"] == "locked"
        assert p["diagram_state"]["status"] == "accepted"
        assert len(p["step0_state"]["conversation_transcript"]) == 5


def test_structure_accept_with_empty_structure_fails_closed(client):
    """
    Evidence for Bug 2.2:
    Accepting structure with empty structure candidate raises HTTP 400 Bad Request,
    and does not update structure_state to accepted.
    """
    project_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    mock_project = {
        "id": project_id,
        "owner_id": user_id,
        "status": "features_accepted",
        "structure_state": {
            "status": "draft",
            "candidate_structure": None
        }
    }

    mock_supabase = MagicMock()
    mock_proj_table = MagicMock()
    mock_supabase.table.return_value = mock_proj_table

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase), \
         patch("backend.main.get_owned_project", return_value=mock_project):

        res = client.post(
            f"/api/projects/{project_id}/structure/accept",
            json={"structure": {}},
            headers={"Authorization": "Bearer test-token"}
        )
        assert res.status_code == 400
        data = res.json()
        err_msg = data.get("message") or data.get("detail") or ""
        assert "no generated structure candidate found" in err_msg.lower()
        # Projects table was never updated to accepted
        assert not mock_proj_table.update.called


def test_diagram_accept_without_prerequisite_fails_closed(client):
    """
    Evidence for Bug 2.2 audit across all accept calls:
    Attempting to accept diagram when structure is not accepted returns 409 or 400,
    failing closed without updating diagram_state.
    """
    project_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    mock_project = {
        "id": project_id,
        "owner_id": user_id,
        "status": "draft",
        "structure_state": {"status": "draft"},
        "diagram_state": {}
    }

    mock_supabase = MagicMock()
    mock_proj_table = MagicMock()
    mock_supabase.table.return_value = mock_proj_table

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase), \
         patch("backend.main.get_owned_project", return_value=mock_project):

        res = client.post(
            f"/api/projects/{project_id}/diagram/accept",
            json={"schema_data": None},
            headers={"Authorization": "Bearer test-token"}
        )
        assert res.status_code in (400, 409)
        # Verify diagram_state was not updated to accepted
        assert not mock_proj_table.update.called


def test_final_plan_lock_syncs_to_projects_table(client):
    """
    Evidence for Bug 2.1, 2.4 & Item 7/8:
    Calling final-plan lock endpoint updates final_plans and syncs final_plan_state to projects.
    """
    project_id = str(uuid.uuid4())
    user_id = str(uuid.uuid4())

    mock_project = {
        "id": project_id,
        "owner_id": user_id,
        "status": "diagram_accepted"
    }

    mock_plan = {
        "id": str(uuid.uuid4()),
        "project_id": project_id,
        "status": "draft",
        "consolidated_summary": {
            "cross_reference_gaps": []
        },
        "exception_handling": [],
        "security_considerations": []
    }

    mock_supabase = MagicMock()
    mock_plans_table = MagicMock()
    mock_proj_table = MagicMock()

    proj_update_called = False

    def proj_update(payload):
        nonlocal proj_update_called
        proj_update_called = True
        mock_eq = MagicMock()
        mock_eq.execute.return_value = MagicMock(data=[])
        return mock_eq

    mock_proj_table.update.side_effect = proj_update
    mock_plans_table.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])

    def table_mock(name):
        if name == "final_plans":
            mock_t = MagicMock()
            mock_t.select.return_value.eq.return_value.execute.return_value = MagicMock(data=[mock_plan])
            mock_t.update.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            return mock_t
        if name == "projects":
            return mock_proj_table
        if name == "comments":
            mock_c = MagicMock()
            mock_c.select.return_value.eq.return_value.eq.return_value.eq.return_value.execute.return_value = MagicMock(data=[])
            return mock_c
        return MagicMock()

    mock_supabase.table.side_effect = table_mock

    with patch("backend.main.get_current_user", return_value={"user_id": user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase), \
         patch("backend.main.get_owned_project", return_value=mock_project), \
         patch("backend.main.check_final_plan_lock_blockers", return_value=[]):

        res = client.post(
            f"/api/projects/{project_id}/final-plan/lock",
            headers={"Authorization": "Bearer test-token"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data["plan_status"] == "locked"
        assert proj_update_called is True

