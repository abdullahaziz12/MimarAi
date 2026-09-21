import os
import sys
import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from main import (
    app,
    normalize_structure_dict,
    diff_structure_proposals,
    evaluate_structure_code_level,
    validate_structure_with_groq,
    fix_structure_pass
)

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_PROJECT_ID = "11111111-1111-1111-1111-111111111111"
AUTH_HEADER = {"Authorization": "Bearer dummy-token"}


@pytest.fixture
def mock_auth():
    with patch("main.get_current_user", return_value={"user_id": TEST_USER_ID, "token": "dummy-token", "email": "test@mimarai.com"}):
        yield


@pytest.fixture
def mock_db():
    project_record = {
        "id": TEST_PROJECT_ID,
        "owner_id": TEST_USER_ID,
        "title": "Loan Desk Studio",
        "idea_text": "An automated loan origination and risk underwriting system.",
        "status": "draft",
        "fixed_inputs": {
            "stack": "FastAPI + React",
            "database": "PostgreSQL",
            "deployment": "Docker",
            "apis": "Stripe"
        },
        "generation_state": {
            "features": [
                {
                    "id": "feat-1",
                    "name": "Loan Application Intake",
                    "description": "Applicant submits KYC and financials",
                    "source": "user_originated"
                },
                {
                    "id": "feat-2",
                    "name": "Risk Scoring Engine",
                    "description": "Calculates credit score and loan limits",
                    "source": "ai_inferred"
                },
                {
                    "id": "feat-3",
                    "name": "Audit Logging",
                    "description": "Immutable activity audit trail",
                    "source": "ai_inferred"
                }
            ],
            "rejected_feature_ids": []
        },
        "structure_state": {
            "attempts": [],
            "candidate_structure": None,
            "accepted_structure": None,
            "status": "draft"
        }
    }

    mock_client = MagicMock()

    # Table mock dispatch
    def mock_table(table_name):
        tbl = MagicMock()
        if table_name == "projects":
            # select
            sel = MagicMock()
            eq1 = MagicMock()
            eq2 = MagicMock()
            eq2.execute.return_value = MagicMock(data=[project_record])
            eq1.eq.return_value = eq2
            sel.eq.return_value = eq1
            tbl.select.return_value = sel

            # update
            upd = MagicMock()
            upd_eq = MagicMock()
            
            def handle_update(payload):
                res_mock = MagicMock()
                def exec_update():
                    project_record.update(payload)
                    return MagicMock(data=[project_record])
                res_mock.execute = exec_update
                res_mock.eq.return_value = res_mock
                return res_mock

            tbl.update.side_effect = handle_update

        elif table_name == "comments":
            sel = MagicMock()
            eq_proj = MagicMock()
            ord_res = MagicMock()
            comments_store = []
            
            ord_res.execute.return_value = MagicMock(data=comments_store)
            eq_proj.order.return_value = ord_res
            sel.eq.return_value = eq_proj
            tbl.select.return_value = sel

            def handle_insert(row):
                comments_store.append(row)
                ins_mock = MagicMock()
                ins_mock.execute.return_value = MagicMock(data=[row])
                return ins_mock

            tbl.insert.side_effect = handle_insert

        return tbl

    mock_client.table.side_effect = mock_table

    with patch("main.get_supabase", return_value=mock_client):
        yield project_record, mock_client


# ============================================================================
# 1. Prerequisite Accept Features Gate Tests
# ============================================================================

def test_accept_features_gate_success(mock_auth, mock_db):
    """Test POST /api/projects/{project_id}/accept-features locks features and transitions status."""
    project_record, _ = mock_db
    client = TestClient(app)

    resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/accept-features", headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["project_status"] == "features_accepted"
    assert data["features_locked"] is True
    assert data["active_features_count"] == 3
    assert project_record["status"] == "features_accepted"
    assert project_record["generation_state"]["features_locked"] is True


def test_accept_features_empty_active_features_rejected(mock_auth, mock_db):
    """Test accept-features fails if all features are rejected."""
    project_record, _ = mock_db
    project_record["generation_state"]["rejected_feature_ids"] = ["feat-1", "feat-2", "feat-3"]
    client = TestClient(app)

    resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/accept-features", headers=AUTH_HEADER)
    assert resp.status_code == 400
    msg = resp.json().get("message") or resp.json().get("detail") or ""
    assert "no active features found" in msg.lower()


def test_generate_rejected_when_features_accepted_and_locked(mock_auth, mock_db):
    """Test POST /api/projects/{project_id}/generate blocks overwrite once features are locked."""
    project_record, _ = mock_db
    project_record["status"] = "features_accepted"
    project_record["generation_state"]["features_locked"] = True
    client = TestClient(app)

    resp = client.post(
        f"/api/projects/{TEST_PROJECT_ID}/generate",
        json={"idea_text": "Updated idea"},
        headers=AUTH_HEADER
    )
    assert resp.status_code == 400
    msg = resp.json().get("message") or resp.json().get("detail") or ""
    assert "already accepted and locked" in msg


# ============================================================================
# 2. Dual-Independent Draft Generation Tests
# ============================================================================

@pytest.mark.asyncio
async def test_dual_draft_structure_generation_independent_proposals(mock_auth, mock_db):
    """Test POST /api/projects/{project_id}/structure/generate produces two distinct drafts."""
    project_record, _ = mock_db
    project_record["status"] = "features_accepted"
    project_record["generation_state"]["features_locked"] = True

    model_a_mock = {
        "structure": {
            "src/routes/loans.py": ["Loan Application Intake"],
            "src/services/risk.py": ["Risk Scoring Engine"],
            "src/models/audit.py": ["Audit Logging"]
        }
    }
    model_b_mock = {
        "structure": {
            "src/api/v1/loan_router.py": ["Loan Application Intake"],
            "src/engine/scoring.py": ["Risk Scoring Engine"],
            "src/db/audit_log.py": ["Audit Logging"]
        }
    }

    groq_val_mock = {
        "is_valid": True,
        "convention_adherence": {"passed": True, "reason": "Follows standard FastAPI routes/ layout."},
        "completeness": {"passed": True, "unmapped_features": []},
        "no_conflicting_assignments": {"passed": True, "conflicts": []}
    }

    with patch("main.call_gemini_api", new=AsyncMock(return_value=model_a_mock)), \
         patch("main.call_groq_json", new=AsyncMock(side_effect=[model_b_mock, groq_val_mock])):

        client = TestClient(app)
        resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/structure/generate", headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert "src/routes/loans.py" in data["model_a_draft"]["structure"]
        assert "src/api/v1/loan_router.py" in data["model_b_draft"]["structure"]
        assert len(data["diff_conflicts"]) > 0
        assert data["validation_result"]["is_valid"] is True
        assert data["survived_fix_pass"] is False
        assert len(project_record["structure_state"]["attempts"]) == 1


# ============================================================================
# 3. Diff & Conflict Detection Unit Tests
# ============================================================================

def test_diff_structure_proposals_detects_file_and_mapping_differences():
    """Test diff_structure_proposals accurately surfaces file differences and conflicting feature mappings."""
    draft_a = {
        "structure": {
            "src/routes/loans.py": ["Loan Application Intake"],
            "src/services/risk.py": ["Risk Scoring Engine"]
        }
    }
    draft_b = {
        "structure": {
            "src/api/loans.py": ["Loan Application Intake"],
            "src/services/risk.py": ["Risk Scoring Engine", "Extra Feature"]
        }
    }

    conflicts = diff_structure_proposals(draft_a, draft_b)
    assert len(conflicts) > 0
    conflict_types = [c["type"] for c in conflicts]
    assert "file_set_difference" in conflict_types
    assert "feature_mapping_difference" in conflict_types
    assert "file_responsibility_difference" in conflict_types


# ============================================================================
# 4. Structure Validation (Convention, Completeness, No-Conflicts) Tests
# ============================================================================

def test_convention_adherence_validation_flags_wrong_extension():
    """Test convention adherence fails if Python/FastAPI project has no .py files."""
    active_features = [{"id": "feat-1", "name": "Loan Intake"}]
    fixed_inputs = {"stack": "FastAPI + PostgreSQL"}
    invalid_structure = {
        "src/routes/loans.js": ["Loan Intake"]
    }

    eval_res = evaluate_structure_code_level(invalid_structure, active_features, fixed_inputs)
    assert eval_res["convention_adherence"]["passed"] is False
    assert "no .py source files" in eval_res["convention_adherence"]["reason"]


def test_completeness_validation_flags_unmapped_features():
    """Test completeness validation fails if an active feature is omitted from structure."""
    active_features = [
        {"id": "feat-1", "name": "Loan Application Intake"},
        {"id": "feat-2", "name": "Risk Scoring Engine"}
    ]
    fixed_inputs = {"stack": "FastAPI"}
    incomplete_structure = {
        "src/routes/loans.py": ["Loan Application Intake"]
    }

    eval_res = evaluate_structure_code_level(incomplete_structure, active_features, fixed_inputs)
    assert eval_res["completeness"]["passed"] is False
    assert "Risk Scoring Engine" in eval_res["completeness"]["unmapped_features"]
    assert eval_res["is_valid"] is False


def test_no_conflicting_assignments_flags_contradictory_mappings():
    """Test no conflicting assignments flags UI presentation components inside database migrations."""
    active_features = [{"id": "feat-1", "name": "Loan Intake UI Screen"}]
    fixed_inputs = {"stack": "FastAPI"}
    conflicting_structure = {
        "migrations/versions/001_schema.sql": ["Loan Intake UI Screen"]
    }

    eval_res = evaluate_structure_code_level(conflicting_structure, active_features, fixed_inputs)
    assert eval_res["no_conflicting_assignments"]["passed"] is False
    assert len(eval_res["no_conflicting_assignments"]["conflicts"]) > 0


# ============================================================================
# 5. One-Fix-Pass-Then-Final-Validation Cycle Tests
# ============================================================================

@pytest.mark.asyncio
async def test_structure_generation_triggers_single_fix_pass_on_validation_failure(mock_auth, mock_db):
    """Test that invalid initial structure triggers 1 fix pass and 1 final re-validation."""
    project_record, _ = mock_db
    project_record["status"] = "features_accepted"
    project_record["generation_state"]["features_locked"] = True

    # Initial invalid Model A draft (missing Audit Logging)
    model_a_initial = {
        "structure": {
            "src/routes/loans.py": ["Loan Application Intake"]
        }
    }
    model_b_initial = {
        "structure": {
            "src/api/v1/loans.py": ["Loan Application Intake", "Audit Logging"]
        }
    }

    # Fixed Model A draft after 1 fix pass
    model_a_fixed = {
        "structure": {
            "src/routes/loans.py": ["Loan Application Intake"],
            "src/services/risk.py": ["Risk Scoring Engine"],
            "src/models/audit.py": ["Audit Logging"]
        }
    }

    groq_val_pass = {
        "is_valid": True,
        "convention_adherence": {"passed": True, "reason": "Valid FastAPI structure"},
        "completeness": {"passed": True, "unmapped_features": []},
        "no_conflicting_assignments": {"passed": True, "conflicts": []}
    }

    # Model A call 1 (initial), Model A call 2 (fix pass)
    with patch("main.call_gemini_api", new=AsyncMock(side_effect=[model_a_initial, model_a_fixed])), \
         patch("main.call_groq_json", new=AsyncMock(side_effect=[model_b_initial, groq_val_pass, groq_val_pass])):

        client = TestClient(app)
        resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/structure/generate", headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert data["survived_fix_pass"] is True
        assert "src/models/audit.py" in data["candidate_structure"]["structure"]


# ============================================================================
# 6. Structure Acceptance & Lock Endpoint Tests
# ============================================================================

def test_structure_acceptance_locks_accepted_structure(mock_auth, mock_db):
    """Test POST /api/projects/{project_id}/structure/accept locks accepted_structure in JSON tree format."""
    project_record, _ = mock_db
    project_record["status"] = "features_accepted"
    project_record["structure_state"]["candidate_structure"] = {
        "structure": {
            "src/routes/loans.py": ["Loan Application Intake"],
            "src/services/risk.py": ["Risk Scoring Engine"],
            "src/models/audit.py": ["Audit Logging"]
        }
    }

    client = TestClient(app)
    resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/structure/accept", headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["project_status"] == "structure_accepted"
    assert "src/routes/loans.py" in data["accepted_structure"]["structure"]
    assert project_record["status"] == "structure_accepted"
    assert project_record["structure_state"]["status"] == "accepted"


def test_get_structure_endpoint(mock_auth, mock_db):
    """Test GET /api/projects/{project_id}/structure returns structure state."""
    project_record, _ = mock_db
    project_record["structure_state"]["candidate_structure"] = {"structure": {"src/main.py": ["Init"]}}

    client = TestClient(app)
    resp = client.get(f"/api/projects/{TEST_PROJECT_ID}/structure", headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "structure_state" in data
    assert data["structure_state"]["candidate_structure"]["structure"] == {"src/main.py": ["Init"]}


# ============================================================================
# 7. Comment Reuse with stage="structure" Tests
# ============================================================================

def test_comments_reuse_existing_endpoint_with_stage_structure(mock_auth, mock_db):
    """Test that existing comments endpoint handles stage='structure' without new tables or endpoints."""
    client = TestClient(app)
    comment_payload = {
        "target_feature_id": "feat-1",
        "text": "Please place loan routers inside src/api/v1/ instead of src/routes/",
        "stage": "structure"
    }

    resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/comments", json=comment_payload, headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "structure"
    assert data["text"] == comment_payload["text"]


# ============================================================================
# 8. Terminal Live Test Script Local Verification Test
# ============================================================================

def test_live_test_script_token_safety_and_structure():
    """Verify that scripts/test_v4_project_structure_live.py exists and strictly enforces token safety."""
    script_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "test_v4_project_structure_live.py")
    assert os.path.exists(script_path), "Terminal live test script must exist."

    with open(script_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Token must be read only from $env:MIMARAI_TEST_TOKEN
    assert "MIMARAI_TEST_TOKEN" in content
    assert "MIMARAI_BACKEND_URL" in content
    # Script must not hardcode real secret strings
    assert "Bearer eyJ" not in content
    # Output must target Requirements/Project_Structure_Test.md
    assert "Project_Structure_Test.md" in content
