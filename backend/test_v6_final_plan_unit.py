"""
Unit tests for V6.0 Final Plan Consolidation pure functions.
Tests cover non_duplicate, actionable, traceable, reasoned, consolidation gaps, diff/merge, and lock blockers.
Compatible with standard unittest and pytest.
"""

import unittest
from backend.v6_final_plan import (
    calculate_jaccard_similarity,
    tokenize_text,
    is_generic_phrase,
    evaluate_finding_quality,
    evaluate_directive_quality,
    validate_v6_list_non_duplicate,
    evaluate_v6_quality_validation,
    step1_consolidate_plan,
    diff_merge_findings,
    diff_merge_directives,
    diff_merge_final_plan_drafts,
    check_final_plan_lock_blockers,
    INFRA_ALLOWLIST,
    GENERIC_PHRASE_BLOCKLIST,
)


class TestNonDuplicateAndActionablePureFunctions(unittest.TestCase):
    """
    Mandatory unit tests specifically required by §4 and §6 of V6.0 Spec:
    - Exact duplicate
    - Near-duplicate paraphrase
    - Two genuinely distinct entries
    - Blocklisted generic phrase
    - Valid specific directive
    """

    def test_exact_duplicate(self):
        """Exact identical text produces Jaccard 1.0 and is flagged as duplicate."""
        entries = [
            {"id": "dir-1", "directive": "All payment amount fields must be stored as integer cents, never floats.", "source_ref_id": "feat-1"},
            {"id": "dir-2", "directive": "All payment amount fields must be stored as integer cents, never floats.", "source_ref_id": "feat-1"}
        ]
        cleaned, dups, failed_checks = validate_v6_list_non_duplicate(entries, text_key="directive", threshold=0.8)
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(dups, [1])
        self.assertEqual(len(failed_checks), 1)
        self.assertEqual(failed_checks[0]["check"], "non_duplicate")
        self.assertEqual(failed_checks[0]["fields_involved"], ["directive"])

    def test_near_duplicate_paraphrase(self):
        """Near-duplicate paraphrase with high token overlap (Jaccard >= 0.8) is flagged."""
        text1 = "Encrypt all customer passwords using bcrypt with at least twelve work factor rounds"
        text2 = "Encrypt customer passwords with bcrypt using at least twelve work factor rounds"
        sim = calculate_jaccard_similarity(text1, text2)
        self.assertGreaterEqual(sim, 0.8)

        entries = [
            {"id": "sec-1", "title": text1, "related_feature_ids": ["feat-auth"]},
            {"id": "sec-2", "title": text2, "related_feature_ids": ["feat-auth"]}
        ]
        cleaned, dups, failed_checks = validate_v6_list_non_duplicate(entries, text_key="title", threshold=0.8)
        self.assertEqual(len(cleaned), 1)
        self.assertEqual(dups, [1])
        self.assertEqual(len(failed_checks), 1)
        self.assertEqual(failed_checks[0]["check"], "non_duplicate")

    def test_two_genuinely_distinct_entries(self):
        """Two genuinely distinct technical entries produce low Jaccard and are not marked duplicate."""
        text1 = "Enforce rate limit of 10 requests per minute on public authentication endpoints."
        text2 = "Store all uploaded medical scan images in encrypted S3 buckets with SSE-KMS."
        sim = calculate_jaccard_similarity(text1, text2)
        self.assertLess(sim, 0.3)

        entries = [
            {"id": "sec-1", "title": text1, "related_feature_ids": ["feat-auth"]},
            {"id": "sec-2", "title": text2, "related_feature_ids": ["feat-storage"]}
        ]
        cleaned, dups, failed_checks = validate_v6_list_non_duplicate(entries, text_key="title", threshold=0.8)
        self.assertEqual(len(cleaned), 2)
        self.assertEqual(len(dups), 0)
        self.assertEqual(len(failed_checks), 0)

    def test_blocklisted_generic_phrase(self):
        """Generic phrases from the blocklist (e.g., 'be secure', 'handle errors properly') fail actionable check."""
        for phrase in ["be secure", "follow best practices", "handle errors properly", "ensure data is safe", "validate all inputs"]:
            is_gen, matched = is_generic_phrase(phrase)
            self.assertTrue(is_gen)
            self.assertIsNotNone(matched)

            entry = {
                "id": "dir-gen",
                "directive": phrase,
                "source_ref_id": "feat-1"
            }
            fails = evaluate_directive_quality(entry)
            actionable_fails = [f for f in fails if f["check"] == "actionable"]
            self.assertGreaterEqual(len(actionable_fails), 1)
            reason = actionable_fails[0]["reason"]
            self.assertTrue("matches generic non-actionable phrase blocklist" in reason or "under 6 words" in reason)

    def test_valid_specific_directive(self):
        """A specific, technical directive with >= 6 words passes actionable check."""
        entry = {
            "id": "dir-valid",
            "directive": "All payment amount fields must be stored as integer cents, never floats.",
            "source_ref_id": "feat-checkout",
            "source": "feature_business_rule",
            "non_negotiable": True
        }
        fails = evaluate_directive_quality(entry)
        self.assertEqual(len(fails), 0)

    def test_short_directive_under_6_words(self):
        """A directive under 6 words fails actionable check."""
        entry = {
            "id": "dir-short",
            "directive": "Use strong passwords.",
            "source_ref_id": "feat-1"
        }
        fails = evaluate_directive_quality(entry)
        actionable_fails = [f for f in fails if f["check"] == "actionable"]
        self.assertEqual(len(actionable_fails), 1)
        self.assertIn("under 6 words", actionable_fails[0]["reason"])


class TestTraceableAndReasonedQuality(unittest.TestCase):
    def test_traceable_missing_source_ref_id(self):
        """Mandatory directive missing source_ref_id fails traceable check."""
        entry = {
            "id": "dir-1",
            "directive": "Database queries must use parameterized statements to prevent SQL injection attacks.",
            "source_ref_id": ""
        }
        fails = evaluate_directive_quality(entry)
        traceable_fails = [f for f in fails if f["check"] == "traceable"]
        self.assertEqual(len(traceable_fails), 1)
        self.assertEqual(traceable_fails[0]["fields_involved"], ["source_ref_id"])

    def test_traceable_missing_related_ids_finding(self):
        """Finding missing both related_feature_ids and related_structure_node_ids fails traceable check."""
        entry = {
            "id": "exc-1",
            "title": "Payment gateway network timeout exception handling",
            "description": "Retry payment processing up to three times with exponential backoff before failing.",
            "related_feature_ids": [],
            "related_structure_node_ids": [],
            "provenance": "derived_from_business_rule"
        }
        fails = evaluate_finding_quality(entry)
        traceable_fails = [f for f in fails if f["check"] == "traceable"]
        self.assertEqual(len(traceable_fails), 1)
        self.assertEqual(traceable_fails[0]["fields_involved"], ["related_feature_ids", "related_structure_node_ids"])

    def test_reasoned_missing_on_ai_inferred(self):
        """AI-inferred finding without reasoning fails reasoned check."""
        entry = {
            "id": "sec-ai",
            "title": "CSRF Token Validation on State-Changing API Endpoints",
            "description": "All state-changing POST and PUT requests must require a valid anti-CSRF token header.",
            "related_feature_ids": ["feat-auth"],
            "provenance": "ai_inferred",
            "reasoning": None
        }
        fails = evaluate_finding_quality(entry)
        reasoned_fails = [f for f in fails if f["check"] == "reasoned"]
        self.assertEqual(len(reasoned_fails), 1)
        self.assertEqual(reasoned_fails[0]["fields_involved"], ["reasoning", "provenance"])

    def test_reasoned_present_on_ai_inferred_passes(self):
        """AI-inferred finding with solid reasoning passes reasoned check."""
        entry = {
            "id": "sec-ai",
            "title": "CSRF Token Validation on State-Changing API Endpoints",
            "description": "All state-changing POST and PUT requests must require a valid anti-CSRF token header.",
            "related_feature_ids": ["feat-auth"],
            "provenance": "ai_inferred",
            "reasoning": "Standard web security measure required for cookie-authenticated browser sessions."
        }
        fails = evaluate_finding_quality(entry)
        reasoned_fails = [f for f in fails if f["check"] == "reasoned"]
        self.assertEqual(len(reasoned_fails), 0)


class TestStep1ConsolidationAndGaps(unittest.TestCase):
    def test_consolidation_detects_feature_not_in_structure_gap(self):
        """Features with zero mapped structure nodes are flagged in cross_reference_gaps."""
        features = [
            {"id": "feat-1", "name": "User Authentication", "priority": "must_have", "actor_role": ["user"]},
            {"id": "feat-2", "name": "Stripe Payments", "priority": "must_have", "actor_role": ["customer"]}
        ]
        structure_nodes = [
            {"node_id": "node-auth", "type": "auth_middleware", "mapped_features": ["feat-1"]}
        ]
        diagram_state = {"accepted_schema_id": "erd-1", "accepted_architecture_id": "arch-1"}

        res = step1_consolidate_plan(features, structure_nodes, diagram_state)
        gaps = res["cross_reference_gaps"]
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0]["type"], "feature_not_in_structure")
        self.assertEqual(gaps[0]["feature_id"], "feat-2")

    def test_consolidation_detects_structure_node_no_feature_gap(self):
        """Structure nodes with zero mapped features are flagged."""
        features = [
            {"id": "feat-1", "name": "User Authentication", "priority": "must_have"}
        ]
        structure_nodes = [
            {"node_id": "node-auth", "type": "auth_middleware", "mapped_features": ["feat-1"]},
            {"node_id": "node-analytics", "type": "analytics_engine", "mapped_features": []}
        ]
        diagram_state = {"accepted_schema_id": "erd-1", "accepted_architecture_id": "arch-1"}

        res = step1_consolidate_plan(features, structure_nodes, diagram_state)
        gaps = res["cross_reference_gaps"]
        self.assertEqual(len(gaps), 1)
        self.assertEqual(gaps[0]["type"], "structure_node_no_feature")
        self.assertEqual(gaps[0]["node_id"], "node-analytics")
        self.assertEqual(gaps[0]["node_type"], "analytics_engine")


class TestDiffMergeAlgorithm(unittest.TestCase):
    def test_diff_merge_matches_similar_findings_and_detects_conflict(self):
        """Matching findings union IDs, pick richer description, and flag conflict when advice disagrees."""
        draft_a = {
            "exception_handling": [
                {
                    "id": "exc-a1",
                    "title": "Payment Timeout Handling Policy",
                    "description": "Always abort payment immediately and send refund webhook without retry.",
                    "related_feature_ids": ["feat-pay"],
                    "related_structure_node_ids": ["node-pay"],
                    "severity": "critical",
                    "provenance": "ai_inferred",
                    "reasoning": "Fast failure prevents duplicate charges."
                }
            ],
            "security_considerations": [],
            "mandatory_directives": []
        }
        draft_b = {
            "exception_handling": [
                {
                    "id": "exc-b1",
                    "title": "Payment Gateway Timeout Handling",
                    "description": "Retry payment up to three times with exponential backoff before failing.",
                    "related_feature_ids": ["feat-pay"],
                    "related_structure_node_ids": ["node-bank"],
                    "severity": "medium",
                    "provenance": "derived_from_business_rule",
                    "reasoning": ""
                }
            ],
            "security_considerations": [],
            "mandatory_directives": []
        }

        merged = diff_merge_final_plan_drafts(draft_a, draft_b)
        merged_exc = merged["exception_handling"]
        self.assertEqual(len(merged_exc), 1)
        self.assertIn("feat-pay", merged_exc[0]["related_feature_ids"])
        self.assertIn("node-pay", merged_exc[0]["related_structure_node_ids"])
        self.assertIn("node-bank", merged_exc[0]["related_structure_node_ids"])
        # Severities critical vs medium + opposing guidance -> conflict should be True
        self.assertTrue(merged_exc[0]["conflict"])

    def test_diff_merge_guarantees_unique_ids_no_collisions(self):
        """Diff/merge guarantees fresh, distinct, sequential IDs with zero ID collisions across all 3 lists."""
        draft_a = {
            "exception_handling": [
                {"id": "exc-1", "title": "Database Connection Timeout Handling", "related_feature_ids": ["feat-1"], "severity": "high"},
                {"id": "exc-2", "title": "Kafka Consumer Lag Exception Recovery", "related_feature_ids": ["feat-2"], "severity": "medium"}
            ],
            "security_considerations": [
                {"id": "sec-1", "title": "JWT Token Signature Verification Policy", "related_feature_ids": ["feat-1"], "severity": "high"},
                {"id": "sec-2", "title": "Rate Limiting on Authentication Endpoints", "related_feature_ids": ["feat-1"], "severity": "medium"}
            ],
            "mandatory_directives": [
                {"id": "dir-1", "directive": "Store all monetary amounts as integer cents.", "source_ref_id": "feat-1", "non_negotiable": True},
                {"id": "dir-2", "directive": "Use parameterized queries for all database interactions.", "source_ref_id": "feat-1", "non_negotiable": True}
            ]
        }
        draft_b = {
            "exception_handling": [
                {"id": "exc-1", "title": "Redis Cache Eviction Failure Handler", "related_feature_ids": ["feat-3"], "severity": "low"},
                {"id": "exc-2", "title": "Stripe Webhook Delivery Failure Handler", "related_feature_ids": ["feat-4"], "severity": "high"}
            ],
            "security_considerations": [
                {"id": "sec-1", "title": "CORS Allowed Origins Restriction Standard", "related_feature_ids": ["feat-3"], "severity": "medium"},
                {"id": "sec-2", "title": "Strict Content Security Policy Header", "related_feature_ids": ["feat-4"], "severity": "high"}
            ],
            "mandatory_directives": [
                {"id": "dir-1", "directive": "Enforce TLS 1.3 encryption on all external network communication.", "source_ref_id": "feat-3", "non_negotiable": True},
                {"id": "dir-2", "directive": "Log all administrative actions into immutable audit trail.", "source_ref_id": "feat-4", "non_negotiable": True}
            ]
        }

        merged = diff_merge_final_plan_drafts(draft_a, draft_b)

        # 1. Exception handling IDs
        exc_ids = [item["id"] for item in merged["exception_handling"]]
        self.assertEqual(len(exc_ids), 4)
        self.assertEqual(len(set(exc_ids)), 4, "Exception handling list contains duplicate IDs!")
        self.assertEqual(exc_ids, ["exc-1", "exc-2", "exc-3", "exc-4"])

        # 2. Security consideration IDs
        sec_ids = [item["id"] for item in merged["security_considerations"]]
        self.assertEqual(len(sec_ids), 4)
        self.assertEqual(len(set(sec_ids)), 4, "Security considerations list contains duplicate IDs!")
        self.assertEqual(sec_ids, ["sec-1", "sec-2", "sec-3", "sec-4"])

        # 3. Mandatory directive IDs
        dir_ids = [item["id"] for item in merged["mandatory_directives"]]
        self.assertEqual(len(dir_ids), 4)
        self.assertEqual(len(set(dir_ids)), 4, "Mandatory directives list contains duplicate IDs!")
        self.assertEqual(dir_ids, ["dir-1", "dir-2", "dir-3", "dir-4"])


class TestLockBlockingRules(unittest.TestCase):
    def test_lock_blocked_by_feature_not_in_structure(self):
        """Open feature_not_in_structure gap blocks lock."""
        summary = {
            "cross_reference_gaps": [
                {"type": "feature_not_in_structure", "feature_id": "feat-orphan", "title": "Orphan Feature"}
            ]
        }
        blockers = check_final_plan_lock_blockers(summary, [], [], set())
        self.assertEqual(len(blockers), 1)
        self.assertIn("feature_not_in_structure", blockers[0])

    def test_lock_blocked_by_non_allowlisted_node_without_feature(self):
        """Open structure_node_no_feature gap on non-allowlisted type blocks lock."""
        summary = {
            "cross_reference_gaps": [
                {"type": "structure_node_no_feature", "node_id": "node-custom", "node_type": "custom_analytics"}
            ]
        }
        blockers = check_final_plan_lock_blockers(summary, [], [], set())
        self.assertEqual(len(blockers), 1)
        self.assertIn("structure_node_no_feature", blockers[0])

    def test_lock_allowed_for_allowlisted_infra_nodes(self):
        """Structure nodes in INFRA_ALLOWLIST without features do NOT block lock."""
        for infra_type in ["database", "auth_middleware", "api_gateway", "cache", "queue", "logging", "deployment_config"]:
            summary = {
                "cross_reference_gaps": [
                    {"type": "structure_node_no_feature", "node_id": f"node-{infra_type}", "node_type": infra_type}
                ]
            }
            blockers = check_final_plan_lock_blockers(summary, [], [], set())
            self.assertEqual(len(blockers), 0)

    def test_lock_blocked_by_unresolved_critical_finding(self):
        """Unresolved critical finding blocks lock until comment resolved."""
        summary = {"cross_reference_gaps": []}
        findings = [
            {"id": "crit-sec-1", "title": "Critical SQL Injection Vulnerability in Custom Search", "severity": "critical", "category": "security"}
        ]
        # Not in resolved comments
        blockers = check_final_plan_lock_blockers(summary, [], findings, resolved_comment_ids=set())
        self.assertEqual(len(blockers), 1)
        self.assertIn("Unresolved critical security", blockers[0])

        # Once resolved via comments
        blockers_resolved = check_final_plan_lock_blockers(summary, [], findings, resolved_comment_ids={"crit-sec-1"})
        self.assertEqual(len(blockers_resolved), 0)


if __name__ == "__main__":
    unittest.main()
