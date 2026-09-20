import unittest
from typing import Dict, Any
from backend.main import normalize_feature_schema, evaluate_code_level_quality


class TestFix4NormalizationAndAdjusted(unittest.TestCase):

    def test_normalize_feature_schema_complete_feature(self):
        feat = {
            "id": "feat-1",
            "name": "Audit Logging",
            "description": "Logs all healthcare personnel data access events to immutable ledger.",
            "provenance": "user_originated",
            "business_rules": ["Retain logs for 7 years"],
            "data_touched": ["audit_logs"],
            "actor_role": ["compliance_officer"],
            "acceptance_criteria": ["Given an access event When recorded Then verify row in audit_logs table"],
            "exclusions": ["Does not log read events on public pages"],
            "priority": "must_have"
        }
        res = normalize_feature_schema(feat)
        self.assertIsInstance(res, dict)
        self.assertEqual(res["name"], "Audit Logging")
        # No defaulted fields
        self.assertNotIn("defaulted_fields", res.get("quality_flags", {}))
        failed_check_names = [
            fc if isinstance(fc, str) else fc.get("check")
            for fc in res["quality_flags"].get("failed_checks", [])
        ]
        self.assertNotIn("incomplete_model_output", failed_check_names)

    def test_normalize_feature_schema_tracks_defaulted_fields(self):
        # Empty feature missing name, description, business_rules, data_touched, actor_role, exclusions
        raw_feat = {
            "id": "feat-2",
            "acceptance_criteria": ["Given request When processed Then return 200"]
        }
        res = normalize_feature_schema(raw_feat)
        self.assertIsInstance(res, dict)
        self.assertEqual(res["name"], "Unnamed Feature")
        self.assertEqual(res["description"], "")
        
        qflags = res.get("quality_flags", {})
        defaulted = qflags.get("defaulted_fields", [])
        self.assertIn("name", defaulted)
        self.assertIn("description", defaulted)
        self.assertIn("business_rules", defaulted)
        self.assertIn("data_touched", defaulted)
        self.assertIn("actor_role", defaulted)
        self.assertIn("exclusions", defaulted)
        
        # acceptance_criteria MUST NOT be in defaulted_fields (handled by complete check)
        self.assertNotIn("acceptance_criteria", defaulted)

        failed_checks = qflags.get("failed_checks", [])
        incomplete_fc = next((fc for fc in failed_checks if isinstance(fc, dict) and fc.get("check") == "incomplete_model_output"), None)
        self.assertIsNotNone(incomplete_fc)
        self.assertIn("name", incomplete_fc.get("fields_involved", []))
        self.assertIn("business_rules", incomplete_fc.get("fields_involved", []))
        self.assertFalse(incomplete_fc.get("survived_fix_pass"))

    def test_normalize_feature_schema_always_returns_dict(self):
        # Completely empty input
        res1 = normalize_feature_schema({})
        self.assertIsInstance(res1, dict)
        self.assertEqual(res1["id"], "feat-1")
        self.assertEqual(res1["name"], "Unnamed Feature")

        # None-like fields input
        res2 = normalize_feature_schema({"name": None, "business_rules": None, "priority": None})
        self.assertIsInstance(res2, dict)
        self.assertEqual(res2["priority"], "must_have")


if __name__ == "__main__":
    unittest.main()
