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
    process_diagram_ask_ai,
    generate_mermaid_erd,
    generate_mermaid_architecture
)

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_PROJECT_ID = "33333333-3333-3333-3333-333333333333"
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
        "title": "Loan Automation Matrix",
        "idea_text": "An enterprise lending management system managing borrower intake, loan underwriting, and audit logging.",
        "status": "structure_accepted",
        "fixed_inputs": {
            "stack": "FastAPI + React",
            "database": "PostgreSQL",
            "deployment": "Docker"
        },
        "generation_state": {
            "features": [
                {
                    "id": "feat-loan",
                    "name": "Loan Application & Underwriting",
                    "description": "Processes borrower loan applications, principal calculations, and lifecycle states in loans table.",
                    "data_touched": ["users", "loans"],
                    "business_rules": ["Interest rate cannot exceed 25%", "Loans must link to valid borrower in users table"],
                    "source": "user_originated"
                },
                {
                    "id": "feat-auth",
                    "name": "User Authentication & RBAC",
                    "description": "Manages user credentials and roles in users table.",
                    "data_touched": ["users"],
                    "business_rules": ["Password must be hashed with bcrypt"],
                    "source": "ai_inferred"
                }
            ],
            "rejected_feature_ids": [],
            "features_locked": True
        },
        "structure_state": {
            "attempts": [],
            "candidate_structure": {
                "structure": {
                    "src/routes/loan.py": ["Loan Application & Underwriting"],
                    "src/models/loan.py": ["Loan Application & Underwriting"],
                    "src/routes/auth.py": ["User Authentication & RBAC"],
                    "src/models/user.py": ["User Authentication & RBAC"]
                }
            },
            "accepted_structure": {
                "structure": {
                    "src/routes/loan.py": ["Loan Application & Underwriting"],
                    "src/models/loan.py": ["Loan Application & Underwriting"],
                    "src/routes/auth.py": ["User Authentication & RBAC"],
                    "src/models/user.py": ["User Authentication & RBAC"]
                }
            },
            "status": "accepted"
        },
        "diagram_state": {
            "attempts": [],
            "candidate_draft": {
                "schema": {
                    "tables": [
                        {
                            "name": "users",
                            "description": "User accounts and authentication credentials.",
                            "columns": [
                                {"name": "id", "type": "uuid", "is_primary_key": True, "nullable": False},
                                {"name": "email", "type": "varchar(255)", "is_primary_key": False, "nullable": False}
                            ],
                            "primary_key": "id",
                            "foreign_keys": [],
                            "mapped_features": ["User Authentication & RBAC"]
                        },
                        {
                            "name": "loans",
                            "description": "Loan applications and payment schedules.",
                            "columns": [
                                {"name": "id", "type": "uuid", "is_primary_key": True, "nullable": False},
                                {"name": "borrower_id", "type": "uuid", "is_primary_key": False, "is_foreign_key": True, "references": "users.id", "nullable": False},
                                {"name": "amount", "type": "numeric(12,2)", "is_primary_key": False, "nullable": False}
                            ],
                            "primary_key": "id",
                            "foreign_keys": [{"column": "borrower_id", "references_table": "users", "references_column": "id"}],
                            "mapped_features": ["Loan Application & Underwriting"]
                        }
                    ]
                },
                "architecture": {
                    "services": [
                        {
                            "name": "API Gateway",
                            "layer": "api",
                            "protocol": "HTTPS",
                            "port": 8000,
                            "dependencies": ["Loan Service", "Auth Service"],
                            "mapped_features": ["User Authentication & RBAC", "Loan Application & Underwriting"]
                        },
                        {
                            "name": "Loan Service",
                            "layer": "service",
                            "protocol": "HTTPS",
                            "port": 8002,
                            "dependencies": [],
                            "mapped_features": ["Loan Application & Underwriting"]
                        },
                        {
                            "name": "Auth Service",
                            "layer": "service",
                            "protocol": "HTTPS",
                            "port": 8001,
                            "dependencies": [],
                            "mapped_features": ["User Authentication & RBAC"]
                        }
                    ]
                },
                "exception_handling": {
                    "feature_rules": [
                        {
                            "feature_name": "Loan Application & Underwriting",
                            "failure_modes": [
                                {
                                    "error_type": "insufficient_credit",
                                    "handling_layer": "validation_layer",
                                    "error_response_shape": {"status": 400, "code": "CREDIT_REJECTED", "message": "Credit score below minimum."},
                                    "retryable": False,
                                    "logging": "warning"
                                }
                            ]
                        }
                    ],
                    "global_standard": {
                        "error_response_shape": {"status": "integer", "code": "string", "message": "string"},
                        "logging_standard": "structured_json"
                    }
                },
                "security": {
                    "access_control_rules": [
                        {
                            "resource": "/api/loans",
                            "allowed_roles": ["borrower", "officer", "admin"],
                            "action": "read_write"
                        }
                    ],
                    "cross_cutting": {
                        "authentication_method": "JWT Bearer Token",
                        "secrets_handling": "Environment Variables",
                        "transport_security": "HTTPS/TLS 1.3",
                        "row_level_security": "Enabled"
                    }
                }
            },
            "accepted_schema": None,
            "accepted_architecture": None,
            "accepted_exception_handling": None,
            "accepted_security": None,
            "mermaid_erd": None,
            "mermaid_architecture": None,
            "ask_ai_history": [],
            "status": "draft"
        }
    }

    mock_client = MagicMock()
    comments_store = []

    def mock_table(table_name):
        tbl = MagicMock()
        if table_name == "projects":
            sel = MagicMock()
            eq1 = MagicMock()
            eq2 = MagicMock()
            eq2.execute.return_value = MagicMock(data=[project_record])
            eq1.eq.return_value = eq2
            sel.eq.return_value = eq1
            tbl.select.return_value = sel

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
        yield project_record, mock_client, comments_store


# ============================================================================
# 1. Prerequisite Gate Check Tests
# ============================================================================

def test_ask_ai_prerequisite_fails_when_no_diagram_draft_exists(mock_auth, mock_db):
    """Test POST /api/projects/{project_id}/diagram/ask-ai rejects with 400 when diagram_state has no drafts."""
    project_record, _, _ = mock_db
    project_record["diagram_state"]["candidate_draft"] = None
    project_record["diagram_state"]["attempts"] = []

    client = TestClient(app)
    resp = client.post(
        f"/api/projects/{TEST_PROJECT_ID}/diagram/ask-ai",
        headers=AUTH_HEADER,
        json={"message": "Rename users table column email to user_email"}
    )
    assert resp.status_code == 400
    err_body = resp.json()
    err_msg = err_body.get("message") or err_body.get("detail") or ""
    assert "no diagram draft" in err_msg.lower()


# ============================================================================
# 2. Cosmetic Change Path Tests
# ============================================================================

def test_ask_ai_cosmetic_change_applied_directly(mock_auth, mock_db):
    """
    Test cosmetic change (e.g. column rename) is classified as 'cosmetic',
    applied directly without confirmation, re-renders Mermaid immediately,
    and updates diagram_state.ask_ai_history.
    """
    project_record, _, _ = mock_db
    client = TestClient(app)

    cosmetic_ai_response = {
        "classification": "cosmetic",
        "refused": False,
        "requires_confirmation": False,
        "forced_override_confirmed": None,
        "explanation": "Renamed column 'email' to 'user_email' in 'users' table.",
        "conflicting_features": [],
        "conflicting_structure": [],
        "updated_schema": {
            "tables": [
                {
                    "name": "users",
                    "description": "User accounts and authentication credentials.",
                    "columns": [
                        {"name": "id", "type": "uuid", "is_primary_key": True, "nullable": False},
                        {"name": "user_email", "type": "varchar(255)", "is_primary_key": False, "nullable": False}
                    ],
                    "primary_key": "id",
                    "foreign_keys": [],
                    "mapped_features": ["User Authentication & RBAC"]
                },
                project_record["diagram_state"]["candidate_draft"]["schema"]["tables"][1]
            ]
        },
        "updated_architecture": project_record["diagram_state"]["candidate_draft"]["architecture"],
        "propagated_changes": []
    }

    with patch("main.process_diagram_ask_ai", new=AsyncMock(return_value=cosmetic_ai_response)):
        resp = client.post(
            f"/api/projects/{TEST_PROJECT_ID}/diagram/ask-ai",
            headers=AUTH_HEADER,
            json={"message": "Rename users table column email to user_email"}
        )

    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "ok"
    assert data["classification"] == "cosmetic"
    assert data["refused"] is False
    assert data["requires_confirmation"] is False
    assert "user_email" in json.dumps(data["schema"])
    assert "USER_EMAIL" in data["mermaid_erd"].upper()

    # Verify history recorded
    assert len(data["ask_ai_history"]) == 1
    assert data["ask_ai_history"][0]["classification"] == "cosmetic"
    assert data["ask_ai_history"][0]["refused"] is False

    # Verify features and structure were NOT flagged with manually_amended
    for f in project_record["generation_state"]["features"]:
        assert f.get("manually_amended") is not True
    assert project_record["structure_state"].get("manually_amended") is not True


# ============================================================================
# 3. Structural Conflict Default Refusal Tests
# ============================================================================

def test_ask_ai_structural_conflict_refused_by_default(mock_auth, mock_db):
    """
    Test structural conflict (e.g. dropping loans table that locked feature depends on)
    is refused by default when confirm_override is False / omitted.
    Returns clear reason, conflicting feature reference, and does NOT mutate working state.
    """
    project_record, _, _ = mock_db
    client = TestClient(app)

    conflict_ai_response = {
        "classification": "structural_conflict",
        "refused": True,
        "requires_confirmation": True,
        "forced_override_confirmed": False,
        "explanation": "Cannot remove 'loans' table because locked feature 'Loan Application & Underwriting' (feat-loan) relies on it in data_touched.",
        "conflicting_features": [
            {"id": "feat-loan", "name": "Loan Application & Underwriting", "reason": "Feature accesses loans table"}
        ],
        "conflicting_structure": [
            {"path": "src/models/loan.py", "reason": "Structure file maps to Loan feature and table"}
        ],
        "updated_schema": project_record["diagram_state"]["candidate_draft"]["schema"],
        "updated_architecture": project_record["diagram_state"]["candidate_draft"]["architecture"],
        "propagated_changes": []
    }

    with patch("main.process_diagram_ask_ai", new=AsyncMock(return_value=conflict_ai_response)):
        resp = client.post(
            f"/api/projects/{TEST_PROJECT_ID}/diagram/ask-ai",
            headers=AUTH_HEADER,
            json={"message": "Remove the loans table from schema", "confirm_override": False}
        )

    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "refused"
    assert data["classification"] == "structural_conflict"
    assert data["refused"] is True
    assert data["requires_confirmation"] is True
    assert "cannot remove 'loans' table" in data["explanation"].lower()
    assert len(data["conflicting_features"]) == 1
    assert data["conflicting_features"][0]["id"] == "feat-loan"

    # Verify working schema was NOT modified
    tables = [t["name"] for t in project_record["diagram_state"]["candidate_draft"]["schema"]["tables"]]
    assert "loans" in tables

    # Verify history recorded the refusal
    assert len(data["ask_ai_history"]) == 1
    assert data["ask_ai_history"][0]["classification"] == "structural_conflict"
    assert data["ask_ai_history"][0]["refused"] is True


# ============================================================================
# 4. Structural Conflict Forced Override Flow & Propagation Tests
# ============================================================================

def test_ask_ai_forced_override_propagates_to_features_and_structure(mock_auth, mock_db):
    """
    Test structural conflict with confirm_override=True:
    1. Removes conflicting table from schema.
    2. Propagates upstream into Features (updates data_touched, rewrites description, sets manually_amended=True on feature).
    3. Propagates upstream into Structure (updates file mappings, sets manually_amended=True on structure).
    4. Sets manually_amended=True on diagram_state.
    5. Regenerates Mermaid ERD.
    6. Records propagated_changes in ask_ai_history.
    """
    project_record, _, _ = mock_db
    client = TestClient(app)

    override_ai_response = {
        "classification": "structural_conflict",
        "refused": False,
        "requires_confirmation": False,
        "forced_override_confirmed": True,
        "explanation": "Forced override confirmed: removed 'loans' table, updated feature 'Loan Application & Underwriting' data_touched, and removed loan file mappings from structure.",
        "conflicting_features": [],
        "conflicting_structure": [],
        "updated_schema": {
            "tables": [
                project_record["diagram_state"]["candidate_draft"]["schema"]["tables"][0] # Only users table remains
            ]
        },
        "updated_architecture": {
            "services": [
                project_record["diagram_state"]["candidate_draft"]["architecture"]["services"][0],
                project_record["diagram_state"]["candidate_draft"]["architecture"]["services"][2] # Removed Loan Service
            ]
        },
        "updated_features": [
            {
                "id": "feat-loan",
                "name": "Loan Application & Underwriting (Amended)",
                "description": "Processes borrower loan applications via external provider integration.",
                "data_touched": ["users"], # 'loans' removed
                "business_rules": ["Interest rate cannot exceed 25%"],
                "manually_amended": True
            }
        ],
        "updated_structure": {
            "src/routes/auth.py": ["User Authentication & RBAC"],
            "src/models/user.py": ["User Authentication & RBAC"]
        },
        "propagated_changes": [
            {
                "target": "feature",
                "id": "feat-loan",
                "field": "data_touched",
                "old_value": "['users', 'loans']",
                "new_value": "['users']"
            },
            {
                "target": "structure",
                "id": "src/models/loan.py",
                "field": "file_mapping",
                "old_value": "['Loan Application & Underwriting']",
                "new_value": "deleted"
            }
        ]
    }

    with patch("main.process_diagram_ask_ai", new=AsyncMock(return_value=override_ai_response)):
        resp = client.post(
            f"/api/projects/{TEST_PROJECT_ID}/diagram/ask-ai",
            headers=AUTH_HEADER,
            json={"message": "Remove the loans table from schema", "confirm_override": True}
        )

    assert resp.status_code == 200
    data = resp.json()

    assert data["status"] == "ok"
    assert data["classification"] == "structural_conflict"
    assert data["refused"] is False
    assert data["forced_override_confirmed"] is True
    assert len(data["propagated_changes"]) == 2

    # 1. Verify schema updated
    remaining_tables = [t["name"] for t in data["schema"]["tables"]]
    assert "loans" not in remaining_tables
    assert "users" in remaining_tables
    assert "LOANS" not in data["mermaid_erd"].upper()

    # 2. Verify Feature Record Updated & Marked manually_amended
    features = project_record["generation_state"]["features"]
    loan_feat = next(f for f in features if f["id"] == "feat-loan")
    assert loan_feat["manually_amended"] is True
    assert "loans" not in loan_feat["data_touched"]
    assert "external provider" in loan_feat["description"]
    assert project_record["generation_state"]["manually_amended"] is True

    # 3. Verify Structure Record Updated & Marked manually_amended
    struct = project_record["structure_state"]["accepted_structure"]["structure"]
    assert "src/models/loan.py" not in struct
    assert "src/routes/auth.py" in struct
    assert project_record["structure_state"]["manually_amended"] is True

    # 4. Verify Diagram State Marked manually_amended
    assert project_record["diagram_state"]["manually_amended"] is True

    # 5. Verify ask_ai_history
    hist = data["ask_ai_history"]
    assert len(hist) == 1
    assert hist[0]["forced_override_confirmed"] is True
    assert len(hist[0]["propagated_changes"]) == 2


# ============================================================================
# 5. Comment System Separation Test
# ============================================================================

def test_ask_ai_is_strictly_separate_from_review_comments_table(mock_auth, mock_db):
    """
    Test that Ask AI messages are purely conversational edits and do NOT insert
    rows into the comments table or endpoint.
    """
    project_record, mock_client, comments_store = mock_db
    client = TestClient(app)

    cosmetic_ai_response = {
        "classification": "cosmetic",
        "refused": False,
        "requires_confirmation": False,
        "forced_override_confirmed": None,
        "explanation": "Added index on users email column.",
        "updated_schema": project_record["diagram_state"]["candidate_draft"]["schema"],
        "updated_architecture": project_record["diagram_state"]["candidate_draft"]["architecture"],
        "propagated_changes": []
    }

    with patch("main.process_diagram_ask_ai", new=AsyncMock(return_value=cosmetic_ai_response)):
        resp = client.post(
            f"/api/projects/{TEST_PROJECT_ID}/diagram/ask-ai",
            headers=AUTH_HEADER,
            json={"message": "Add an index on users email column"}
        )

    assert resp.status_code == 200
    assert len(comments_store) == 0

    # Query comments endpoint
    resp_comments = client.get(f"/api/projects/{TEST_PROJECT_ID}/comments", headers=AUTH_HEADER)
    assert resp_comments.status_code == 200
    assert resp_comments.json()["comments"] == []
