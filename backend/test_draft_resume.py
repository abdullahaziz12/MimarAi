import pytest
from fastapi.testclient import TestClient
from unittest.mock import MagicMock, patch
import uuid

from backend.main import app


@pytest.fixture
def client():
    return TestClient(app)


def test_get_project_state_unauthorized(client):
    test_project_id = str(uuid.uuid4())
    res = client.get(f"/api/projects/{test_project_id}")
    assert res.status_code == 401
    data = res.json()
    assert data.get("status") == "error"
    assert data.get("error_type") == "unauthorized"


def test_get_project_state_not_found(client):
    test_project_id = str(uuid.uuid4())
    test_user_id = str(uuid.uuid4())

    mock_supabase = MagicMock()
    mock_table = MagicMock()
    mock_supabase.table.return_value = mock_table
    mock_select = MagicMock()
    mock_table.select.return_value = mock_select
    mock_eq1 = MagicMock()
    mock_select.eq.return_value = mock_eq1
    mock_eq2 = MagicMock()
    mock_eq1.eq.return_value = mock_eq2
    mock_eq2.execute.return_value = MagicMock(data=[])

    with patch("backend.main.get_current_user", return_value={"user_id": test_user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase):
        res = client.get(
            f"/api/projects/{test_project_id}",
            headers={"Authorization": "Bearer test-token"}
        )
        assert res.status_code == 404
        data = res.json()
        assert data.get("status") == "error"
        assert data.get("error_type") == "not_found"


def test_get_project_state_success(client):
    test_project_id = str(uuid.uuid4())
    test_user_id = str(uuid.uuid4())

    mock_project = {
        "id": test_project_id,
        "owner_id": test_user_id,
        "name": "E-Commerce Microservice",
        "title": "E-Commerce Platform",
        "idea_text": "A scalable multi-tenant e-commerce marketplace.",
        "status": "draft",
        "step0_state": {
            "round_count": 0,
            "off_topic_streak": 0,
            "last_label": "READY",
            "last_sub_case": None,
            "extracted_name": "E-Commerce Platform",
            "last_contradiction_result": {"contradiction": False}
        },
        "fixed_inputs": {
            "stack": "Next.js + FastAPI",
            "database": "Supabase PostgreSQL",
            "deployment": "Vercel + Render",
            "apis": "Stripe"
        },
        "generation_state": {},
        "density_flags": {
            "clarifying_questions": "full",
            "personas": "ask",
            "nfrs": "ask"
        },
        "personas": {
            "answer": "Store owners and buyers",
            "captured_at": "2026-09-19T00:00:00Z"
        },
        "nfrs": {
            "scale": "thousands_plus",
            "data_sensitivity": "sensitive",
            "availability": "needs_to_be_reliable"
        },
        "lightweight_draft": {
            "attempt": 1,
            "draft_features": ["Storefront", "Cart & Checkout", "Inventory Sync"],
            "final_status": "accepted"
        },
        "created_at": "2026-09-19T00:00:00Z"
    }

    mock_cqs = [
        {"id": "cq-1", "question": "What payment methods?", "answer": "Stripe & PayPal", "round": 1, "created_at": "2026-09-19T00:01:00Z"}
    ]

    mock_supabase = MagicMock()

    def mock_table_handler(table_name):
        mock_t = MagicMock()
        if table_name == "projects":
            mock_sel = MagicMock()
            mock_t.select.return_value = mock_sel
            mock_eq1 = MagicMock()
            mock_sel.eq.return_value = mock_eq1
            mock_eq2 = MagicMock()
            mock_eq1.eq.return_value = mock_eq2
            mock_eq2.execute.return_value = MagicMock(data=[mock_project])
        elif table_name == "clarifying_questions":
            mock_sel = MagicMock()
            mock_t.select.return_value = mock_sel
            mock_eq = MagicMock()
            mock_sel.eq.return_value = mock_eq
            mock_order = MagicMock()
            mock_eq.order.return_value = mock_order
            mock_order.execute.return_value = MagicMock(data=mock_cqs)
        return mock_t

    mock_supabase.table.side_effect = mock_table_handler

    with patch("backend.main.get_current_user", return_value={"user_id": test_user_id, "token": "test-token"}), \
         patch("backend.main.get_supabase", return_value=mock_supabase):
        res = client.get(
            f"/api/projects/{test_project_id}",
            headers={"Authorization": "Bearer test-token"}
        )
        assert res.status_code == 200
        data = res.json()
        assert data.get("status") == "ok"
        p = data.get("project")
        assert p is not None
        assert p["id"] == test_project_id
        assert p["idea_text"] == "A scalable multi-tenant e-commerce marketplace."
        assert p["fixed_inputs"]["stack"] == "Next.js + FastAPI"
        assert p["personas"]["answer"] == "Store owners and buyers"
        assert p["nfrs"]["scale"] == "thousands_plus"
        assert p["lightweight_draft"]["final_status"] == "accepted"
        assert len(p["clarifying_questions"]) == 1
        assert p["clarifying_questions"][0]["answer"] == "Stripe & PayPal"
