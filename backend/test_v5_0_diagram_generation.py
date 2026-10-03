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
    normalize_diagram_draft,
    diff_diagram_proposals,
    evaluate_diagram_code_level,
    validate_diagram_with_groq,
    fix_diagram_pass,
    generate_mermaid_erd,
    generate_mermaid_architecture
)

TEST_USER_ID = "00000000-0000-0000-0000-000000000001"
TEST_PROJECT_ID = "22222222-2222-2222-2222-222222222222"
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
        "title": "Hospital Care Matrix",
        "idea_text": "An enterprise hospital management system managing patient intake, doctor triage, and lab telemetry.",
        "status": "structure_accepted",
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
                    "name": "Patient Intake & Triage",
                    "description": "Emergency registration and vitals triage",
                    "source": "user_originated"
                },
                {
                    "id": "feat-2",
                    "name": "Clinical Lab Telemetry",
                    "description": "Real-time blood work and pathology results",
                    "source": "ai_inferred"
                },
                {
                    "id": "feat-3",
                    "name": "Role-Based Access Control",
                    "description": "Multi-tier doctor, nurse, and auditor access",
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
                    "src/routes/intake.py": ["Patient Intake & Triage"],
                    "src/routes/telemetry.py": ["Clinical Lab Telemetry"],
                    "src/routes/auth.py": ["Role-Based Access Control"]
                }
            },
            "accepted_structure": {
                "structure": {
                    "src/routes/intake.py": ["Patient Intake & Triage"],
                    "src/routes/telemetry.py": ["Clinical Lab Telemetry"],
                    "src/routes/auth.py": ["Role-Based Access Control"]
                }
            },
            "status": "accepted"
        },
        "diagram_state": {
            "attempts": [],
            "candidate_draft": None,
            "accepted_schema": None,
            "accepted_architecture": None,
            "accepted_exception_handling": None,
            "accepted_security": None,
            "mermaid_erd": None,
            "mermaid_architecture": None,
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
# 1. Prerequisite Gate Check Tests
# ============================================================================

def test_diagram_generation_prerequisite_gate_success(mock_auth, mock_db):
    """Test diagram generation succeeds when structure_state is accepted."""
    project_record, _ = mock_db
    assert project_record["structure_state"]["status"] == "accepted"

    model_a_mock = {
        "schema": {
            "tables": [
                {
                    "name": "patients",
                    "columns": [{"name": "id", "type": "uuid", "is_primary_key": True, "nullable": False}],
                    "mapped_features": ["Patient Intake & Triage"]
                },
                {
                    "name": "lab_results",
                    "columns": [
                        {"name": "id", "type": "uuid", "is_primary_key": True, "nullable": False},
                        {"name": "patient_id", "type": "uuid", "is_foreign_key": True, "references": "patients.id", "nullable": False}
                    ],
                    "mapped_features": ["Clinical Lab Telemetry"]
                },
                {
                    "name": "users",
                    "columns": [{"name": "id", "type": "uuid", "is_primary_key": True, "nullable": False}],
                    "mapped_features": ["Role-Based Access Control"]
                }
            ]
        },
        "architecture": {
            "services": [
                {"name": "Intake API", "layer": "api", "protocol": "HTTPS", "port": 8000, "dependencies": []},
                {"name": "Telemetry Engine", "layer": "worker", "protocol": "gRPC", "port": 50051, "dependencies": []}
            ]
        },
        "exception_handling": {
            "feature_rules": [
                {"feature_name": "Patient Intake & Triage", "failure_modes": [{"error_type": "invalid_vitals"}]},
                {"feature_name": "Clinical Lab Telemetry", "failure_modes": [{"error_type": "device_timeout"}]},
                {"feature_name": "Role-Based Access Control", "failure_modes": [{"error_type": "unauthorized"}]}
            ],
            "global_standard": {"error_response_shape": {"status": "int", "code": "str", "message": "str"}}
        },
        "security": {
            "access_control_rules": [
                {"resource": "/api/intake", "allowed_roles": ["doctor", "nurse"], "action": "write"},
                {"resource": "/api/telemetry", "allowed_roles": ["doctor"], "action": "read"}
            ]
        }
    }
    model_b_mock = dict(model_a_mock)

    with patch("main.call_gemini_api", new=AsyncMock(return_value=model_a_mock)), \
         patch("main.call_groq_json", new=AsyncMock(return_value=model_b_mock)):

        client = TestClient(app)
        resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/diagram/generate", headers=AUTH_HEADER)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"
        assert len(data["candidate_draft"]["schema"]["tables"]) == 3
        assert len(project_record["diagram_state"]["attempts"]) == 1

    with patch("main.validate_diagram_with_groq", new=AsyncMock(return_value={"is_valid": True})):
        resp_val = client.post(f"/api/projects/{TEST_PROJECT_ID}/diagram/validate", headers=AUTH_HEADER)
        assert resp_val.status_code == 200
        data_val = resp_val.json()
        assert data_val["status"] == "ok"
        assert data_val["validation_result"]["is_valid"] is True


def test_diagram_generation_rejected_when_structure_not_accepted(mock_auth, mock_db):
    """Test diagram generation is rejected with 400 when structure is still draft / unaccepted."""
    project_record, _ = mock_db
    project_record["status"] = "features_accepted"
    project_record["structure_state"]["status"] = "draft"
    project_record["structure_state"]["accepted_structure"] = None

    client = TestClient(app)
    resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/diagram/generate", headers=AUTH_HEADER)
    assert resp.status_code == 400
    msg = resp.json().get("message") or resp.json().get("detail") or ""
    assert "structure must be explicitly accepted" in msg.lower()


# ============================================================================
# 2. Dual-Draft Generation of 4 Artifacts & Diff Tests
# ============================================================================

def test_diff_diagram_proposals_detects_artifact_differences():
    """Test diff_diagram_proposals correctly surfaces table, column, service, exception, and security differences."""
    draft_a = {
        "schema": {
            "tables": [
                {"name": "patients", "columns": [{"name": "id", "type": "uuid"}, {"name": "mrn", "type": "text"}]},
                {"name": "triage", "columns": [{"name": "id", "type": "uuid"}]}
            ]
        },
        "architecture": {
            "services": [
                {"name": "Intake API", "protocol": "HTTPS", "port": 8000},
                {"name": "Worker Service", "protocol": "gRPC", "port": 50051}
            ]
        },
        "exception_handling": {
            "feature_rules": [{"feature_name": "Patient Intake & Triage", "failure_modes": [{"error_type": "invalid_input"}]}]
        },
        "security": {
            "access_control_rules": [{"resource": "/api/patients", "allowed_roles": ["doctor"]}]
        }
    }

    draft_b = {
        "schema": {
            "tables": [
                {"name": "patients", "columns": [{"name": "id", "type": "uuid"}, {"name": "insurance_id", "type": "text"}]},
                {"name": "telemetry", "columns": [{"name": "id", "type": "uuid"}]}
            ]
        },
        "architecture": {
            "services": [
                {"name": "Intake API", "protocol": "HTTPS", "port": 8000},
                {"name": "Analytics Service", "protocol": "HTTPS", "port": 8080}
            ]
        },
        "exception_handling": {
            "feature_rules": [{"feature_name": "Clinical Lab Telemetry", "failure_modes": [{"error_type": "timeout"}]}]
        },
        "security": {
            "access_control_rules": [{"resource": "/api/telemetry", "allowed_roles": ["lab_tech"]}]
        }
    }

    conflicts = diff_diagram_proposals(draft_a, draft_b)
    assert len(conflicts) > 0
    conflict_types = [c["type"] for c in conflicts]
    assert "table_set_difference" in conflict_types
    assert "table_columns_difference" in conflict_types
    assert "service_set_difference" in conflict_types
    assert "exception_coverage_difference" in conflict_types
    assert "security_rules_difference" in conflict_types


# ============================================================================
# 3. Validation Logic Unit Tests (All 6 Checks)
# ============================================================================

def test_validation_flags_broken_referential_integrity():
    """Test code-level validation catches foreign keys pointing to non-existent tables or columns."""
    active_features = [{"id": "feat-1", "name": "Patient Intake"}]
    fixed_inputs = {"stack": "FastAPI + PostgreSQL"}
    invalid_draft = {
        "schema": {
            "tables": [
                {
                    "name": "triage_records",
                    "columns": [
                        {"name": "id", "type": "uuid", "is_primary_key": True},
                        {"name": "patient_id", "type": "uuid", "is_foreign_key": True, "references": "nonexistent_patients.id"}
                    ],
                    "mapped_features": ["Patient Intake"]
                }
            ]
        },
        "architecture": {"services": [{"name": "API", "protocol": "HTTPS"}]},
        "exception_handling": {"feature_rules": [{"feature_name": "Patient Intake", "failure_modes": [{"error_type": "err"}]}], "global_standard": {}},
        "security": {"access_control_rules": [{"resource": "/triage", "allowed_roles": ["doctor"]}]}
    }

    eval_res = evaluate_diagram_code_level(invalid_draft, active_features, fixed_inputs, {})
    assert eval_res["schema_architecture"]["referential_integrity"]["passed"] is False
    assert len(eval_res["schema_architecture"]["referential_integrity"]["broken_foreign_keys"]) > 0
    assert eval_res["is_valid"] is False


def test_validation_flags_unmapped_feature_coverage():
    """Test code-level validation catches features missing from schema tables."""
    active_features = [
        {"id": "feat-1", "name": "Patient Intake"},
        {"id": "feat-2", "name": "Clinical Telemetry"}
    ]
    fixed_inputs = {"stack": "FastAPI + PostgreSQL"}
    incomplete_draft = {
        "schema": {
            "tables": [
                {
                    "name": "patients",
                    "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}],
                    "mapped_features": ["Patient Intake"]
                }
            ]
        },
        "architecture": {"services": [{"name": "API", "protocol": "HTTPS"}]},
        "exception_handling": {
            "feature_rules": [
                {"feature_name": "Patient Intake", "failure_modes": [{"error_type": "err"}]},
                {"feature_name": "Clinical Telemetry", "failure_modes": [{"error_type": "err"}]}
            ],
            "global_standard": {}
        },
        "security": {"access_control_rules": [{"resource": "/patients", "allowed_roles": ["doctor"]}]}
    }

    eval_res = evaluate_diagram_code_level(incomplete_draft, active_features, fixed_inputs, {})
    assert eval_res["schema_architecture"]["feature_coverage"]["passed"] is False
    assert "Clinical Telemetry" in eval_res["schema_architecture"]["feature_coverage"]["unmapped_features"]
    assert eval_res["is_valid"] is False


def test_validation_flags_circular_dependencies():
    """Test validation detects circular dependencies between architecture services."""
    active_features = [{"id": "feat-1", "name": "Patient Intake"}]
    fixed_inputs = {"stack": "FastAPI"}
    circular_draft = {
        "schema": {
            "tables": [{"name": "patients", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}], "mapped_features": ["Patient Intake"]}]
        },
        "architecture": {
            "services": [
                {"name": "ServiceA", "protocol": "HTTPS", "dependencies": ["ServiceB"]},
                {"name": "ServiceB", "protocol": "gRPC", "dependencies": ["ServiceA"]}
            ]
        },
        "exception_handling": {"feature_rules": [{"feature_name": "Patient Intake", "failure_modes": [{"error_type": "err"}]}], "global_standard": {}},
        "security": {"access_control_rules": [{"resource": "/patients", "allowed_roles": ["doctor"]}]}
    }

    eval_res = evaluate_diagram_code_level(circular_draft, active_features, fixed_inputs, {})
    assert eval_res["schema_architecture"]["no_conflicting_dependencies"]["passed"] is False
    assert len(eval_res["schema_architecture"]["no_conflicting_dependencies"]["conflicts"]) > 0


def test_validation_flags_missing_exception_coverage():
    """Test exception handling validation catches missing feature rules."""
    active_features = [
        {"id": "feat-1", "name": "Patient Intake"},
        {"id": "feat-2", "name": "Clinical Telemetry"}
    ]
    fixed_inputs = {"stack": "FastAPI"}
    draft = {
        "schema": {
            "tables": [
                {"name": "patients", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}], "mapped_features": ["Patient Intake", "Clinical Telemetry"]}
            ]
        },
        "architecture": {"services": [{"name": "API", "protocol": "HTTPS"}]},
        "exception_handling": {
            "feature_rules": [{"feature_name": "Patient Intake", "failure_modes": [{"error_type": "invalid_input"}]}],
            "global_standard": {}
        },
        "security": {"access_control_rules": [{"resource": "/patients", "allowed_roles": ["doctor"]}]}
    }

    eval_res = evaluate_diagram_code_level(draft, active_features, fixed_inputs, {})
    assert eval_res["exception_handling"]["coverage"]["passed"] is False
    assert "Clinical Telemetry" in eval_res["exception_handling"]["coverage"]["uncovered_features"]


def test_validation_flags_conflicting_security_policies():
    """Test security validation catches contradictory allow and deny policies for the same role and resource."""
    active_features = [{"id": "feat-1", "name": "Patient Intake"}]
    fixed_inputs = {"stack": "FastAPI"}
    draft = {
        "schema": {
            "tables": [{"name": "patients", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}], "mapped_features": ["Patient Intake"]}]
        },
        "architecture": {"services": [{"name": "API", "protocol": "HTTPS"}]},
        "exception_handling": {"feature_rules": [{"feature_name": "Patient Intake", "failure_modes": [{"error_type": "err"}]}], "global_standard": {}},
        "security": {
            "access_control_rules": [
                {"resource": "/api/patients", "allowed_roles": ["nurse"], "action": "allow_read"},
                {"resource": "/api/patients", "allowed_roles": ["nurse"], "action": "deny_read"}
            ]
        }
    }

    eval_res = evaluate_diagram_code_level(draft, active_features, fixed_inputs, {})
    assert eval_res["security"]["no_conflicting_policies"]["passed"] is False
    assert len(eval_res["security"]["no_conflicting_policies"]["conflicts"]) > 0


# ============================================================================
# 4. One-Fix-Pass-Then-Final-Validation Cycle Tests
# ============================================================================

@pytest.mark.asyncio
async def test_diagram_generation_triggers_single_fix_pass_on_flaw(mock_auth, mock_db):
    """Test that validation failure triggers exactly 1 fix pass and 1 re-validation."""
    project_record, _ = mock_db

    # Initial flawed draft (missing Role-Based Access Control in schema & exception)
    model_a_flawed = {
        "schema": {
            "tables": [
                {"name": "patients", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}], "mapped_features": ["Patient Intake & Triage"]}
            ]
        },
        "architecture": {"services": [{"name": "API", "protocol": "HTTPS"}]},
        "exception_handling": {"feature_rules": [{"feature_name": "Patient Intake & Triage", "failure_modes": [{"error_type": "err"}]}]},
        "security": {"access_control_rules": [{"resource": "/api/intake", "allowed_roles": ["doctor"]}]}
    }

    # Repaired draft after 1 fix pass
    model_a_fixed = {
        "schema": {
            "tables": [
                {"name": "patients", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}], "mapped_features": ["Patient Intake & Triage"]},
                {"name": "telemetry", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}], "mapped_features": ["Clinical Lab Telemetry"]},
                {"name": "users", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}], "mapped_features": ["Role-Based Access Control"]}
            ]
        },
        "architecture": {"services": [{"name": "API", "protocol": "HTTPS"}]},
        "exception_handling": {
            "feature_rules": [
                {"feature_name": "Patient Intake & Triage", "failure_modes": [{"error_type": "err"}]},
                {"feature_name": "Clinical Lab Telemetry", "failure_modes": [{"error_type": "err"}]},
                {"feature_name": "Role-Based Access Control", "failure_modes": [{"error_type": "err"}]}
            ],
            "global_standard": {"error_response_shape": {}}
        },
        "security": {"access_control_rules": [{"resource": "/api/intake", "allowed_roles": ["doctor"]}]}
    }

    # Model A: draft call
    with patch("main.call_gemini_api", new=AsyncMock(return_value=model_a_flawed)), \
         patch("main.call_groq_json", new=AsyncMock(return_value=model_a_flawed)):

        client = TestClient(app)
        resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/diagram/generate", headers=AUTH_HEADER)
        assert resp.status_code == 200

    # Validation: 1 failed val -> 1 fix pass -> 1 passed val
    with patch("main.validate_diagram_with_groq", new=AsyncMock(side_effect=[{"is_valid": False}, {"is_valid": True}])), \
         patch("main.fix_diagram_pass", new=AsyncMock(return_value=model_a_fixed)):

        resp_val = client.post(f"/api/projects/{TEST_PROJECT_ID}/diagram/validate", headers=AUTH_HEADER)
        assert resp_val.status_code == 200
        data_val = resp_val.json()
        assert data_val["survived_fix_pass"] is True
        assert len(data_val["candidate_draft"]["schema"]["tables"]) == 3


# ============================================================================
# 5. Deterministic Mermaid Conversion Function Unit Tests
# ============================================================================

def test_generate_mermaid_erd_syntax_correctness():
    """Test generate_mermaid_erd converts schema JSON into valid Mermaid ERD syntax."""
    schema_sample = {
        "tables": [
            {
                "name": "users",
                "columns": [
                    {"name": "id", "type": "uuid", "is_primary_key": True},
                    {"name": "email", "type": "varchar(255)"},
                    {"name": "role", "type": "text"}
                ],
                "primary_key": "id",
                "foreign_keys": []
            },
            {
                "name": "patients",
                "columns": [
                    {"name": "id", "type": "uuid", "is_primary_key": True},
                    {"name": "user_id", "type": "uuid", "is_foreign_key": True, "references": "users.id"},
                    {"name": "vitals", "type": "jsonb"}
                ],
                "primary_key": "id",
                "foreign_keys": [{"column": "user_id", "references_table": "users", "references_column": "id"}]
            }
        ]
    }

    mermaid_str = generate_mermaid_erd(schema_sample)
    assert "erDiagram" in mermaid_str
    assert "USERS {" in mermaid_str
    assert "PATIENTS {" in mermaid_str
    assert "uuid id PK" in mermaid_str
    assert "uuid user_id FK" in mermaid_str
    assert "USERS ||--o{ PATIENTS" in mermaid_str


def test_generate_mermaid_architecture_syntax_correctness():
    """Test generate_mermaid_architecture converts architecture JSON into valid Mermaid Flowchart syntax."""
    arch_sample = {
        "services": [
            {"name": "Frontend Client", "layer": "Client", "protocol": "HTTPS", "port": 3000, "dependencies": ["API Gateway"]},
            {"name": "API Gateway", "layer": "API", "protocol": "HTTPS", "port": 8000, "dependencies": ["Auth Service", "Intake Service"]},
            {"name": "Auth Service", "layer": "Application", "protocol": "HTTPS", "port": 8001, "dependencies": ["PostgreSQL Database"]},
            {"name": "Intake Service", "layer": "Application", "protocol": "gRPC", "port": 50051, "dependencies": ["PostgreSQL Database"]},
            {"name": "PostgreSQL Database", "layer": "Data", "protocol": "TCP/SQL", "port": 5432, "dependencies": []}
        ]
    }

    mermaid_str = generate_mermaid_architecture(arch_sample)
    assert "flowchart TD" in mermaid_str
    assert 'subgraph Client["Client"]' in mermaid_str
    assert 'subgraph Api["Api"]' in mermaid_str
    assert 'subgraph Data["Data"]' in mermaid_str
    assert "-->" in mermaid_str


# ============================================================================
# 6. Accept / Merge Endpoint Tests (All 4 Artifacts + Mermaid Strings)
# ============================================================================

def test_accept_diagram_locks_all_four_artifacts_and_generates_mermaid(mock_auth, mock_db):
    """Test POST /api/projects/{project_id}/diagram/accept locks all 4 artifacts together and creates Mermaid strings."""
    project_record, _ = mock_db
    project_record["diagram_state"]["candidate_draft"] = {
        "schema": {
            "tables": [
                {"name": "users", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}]},
                {"name": "patients", "columns": [{"name": "id", "type": "uuid", "is_primary_key": True}, {"name": "user_id", "type": "uuid", "is_foreign_key": True, "references": "users.id"}]}
            ]
        },
        "architecture": {
            "services": [
                {"name": "API Gateway", "layer": "api", "protocol": "HTTPS", "port": 8000, "dependencies": ["Database"]},
                {"name": "Database", "layer": "data", "protocol": "TCP/SQL", "port": 5432, "dependencies": []}
            ]
        },
        "exception_handling": {
            "feature_rules": [{"feature_name": "Patient Intake", "failure_modes": [{"error_type": "invalid_input"}]}],
            "global_standard": {"logging_standard": "structured_json"}
        },
        "security": {
            "access_control_rules": [{"resource": "/api/patients", "allowed_roles": ["doctor"], "action": "write"}],
            "cross_cutting": {"authentication_method": "JWT"}
        }
    }

    client = TestClient(app)
    resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/diagram/accept", headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["project_status"] == "diagram_accepted"
    assert "accepted_schema" in data
    assert "accepted_architecture" in data
    assert "accepted_exception_handling" in data
    assert "accepted_security" in data
    assert "mermaid_erd" in data and "erDiagram" in data["mermaid_erd"]
    assert "mermaid_architecture" in data and "flowchart TD" in data["mermaid_architecture"]
    assert project_record["status"] == "diagram_accepted"
    assert project_record["diagram_state"]["status"] == "accepted"


def test_get_diagram_endpoint(mock_auth, mock_db):
    """Test GET /api/projects/{project_id}/diagram returns diagram state."""
    project_record, _ = mock_db
    project_record["diagram_state"]["candidate_draft"] = {"schema": {"tables": []}}

    client = TestClient(app)
    resp = client.get(f"/api/projects/{TEST_PROJECT_ID}/diagram", headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert "diagram_state" in data
    assert data["diagram_state"]["candidate_draft"] == {"schema": {"tables": []}}


# ============================================================================
# 7. Comment Reuse with stage="diagram" Tests
# ============================================================================

def test_comments_reuse_existing_endpoint_with_stage_diagram(mock_auth, mock_db):
    """Test that existing comments endpoint handles stage='diagram' without new tables or endpoints."""
    client = TestClient(app)
    comment_payload = {
        "target_feature_id": "t-patients",
        "text": "Please add emergency_contact_phone column to patients table.",
        "stage": "diagram"
    }

    resp = client.post(f"/api/projects/{TEST_PROJECT_ID}/comments", json=comment_payload, headers=AUTH_HEADER)
    assert resp.status_code == 200
    data = resp.json()
    assert data["stage"] == "diagram"
    assert data["text"] == comment_payload["text"]


# ============================================================================
# 8. Terminal Live Test Script Local Verification Test
# ============================================================================

def test_live_test_script_token_safety_and_structure():
    """Verify that scripts/test_v5_0_diagram_generation_live.py exists and strictly enforces token safety."""
    script_path = os.path.join(os.path.dirname(__file__), "..", "scripts", "test_v5_0_diagram_generation_live.py")
    assert os.path.exists(script_path), "Terminal live test script must exist."

    with open(script_path, "r", encoding="utf-8") as f:
        content = f.read()

    # Token must be read only from $env:MIMARAI_TEST_TOKEN
    assert "MIMARAI_TEST_TOKEN" in content
    assert "MIMARAI_BACKEND_URL" in content
    # Script must not hardcode real secret strings
    assert "Bearer eyJ" not in content
    # Output must target Requirements/V5.0_Testing_Result.md
    assert "V5.0_Testing_Result.md" in content
