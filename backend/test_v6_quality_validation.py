"""
Pytest suite for V6.0 Quality Validation pure functions (§6).
Tests standalone functions `is_non_duplicate` and `is_actionable` per 18_V6_Final_Plan_Consolidation_Logic.md §6:
1. Exact duplicate
2. Near-duplicate paraphrase
3. Two genuinely distinct entries
4. Blocklisted generic phrases
5. Valid specific directive
6. Short directive under 6 words
7. List-level non-duplicate filtering
8. Full evaluate_v6_quality_validation integration
"""

import pytest
from backend.v6_final_plan import (
    is_non_duplicate,
    is_actionable,
    calculate_jaccard_similarity,
    validate_v6_list_non_duplicate,
    evaluate_v6_quality_validation,
    GENERIC_PHRASE_BLOCKLIST,
)


# ============================================================================
# 1. Exact Duplicate Test
# ============================================================================
def test_exact_duplicate():
    """Exact identical text produces Jaccard similarity 1.0 and is flagged as duplicate (is_non_duplicate=False)."""
    text = "All payment amount fields must be stored as integer cents, never floating point values."
    is_non_dup, sim = is_non_duplicate(text, text, threshold=0.8)
    
    assert is_non_dup is False, f"Expected duplicate detection, got is_non_duplicate={is_non_dup}"
    assert sim == 1.0, f"Expected Jaccard similarity 1.0 for exact duplicate, got {sim}"


# ============================================================================
# 2. Near-Duplicate Paraphrase Test
# ============================================================================
def test_near_duplicate_paraphrase():
    """Near-duplicate paraphrase with high token overlap (Jaccard >= 0.8) is flagged as duplicate."""
    text_a = "Encrypt all customer passwords using bcrypt with at least twelve work factor rounds."
    text_b = "Encrypt customer passwords with bcrypt using at least twelve work factor rounds."
    
    is_non_dup, sim = is_non_duplicate(text_a, text_b, threshold=0.8)
    
    assert sim >= 0.8, f"Expected similarity >= 0.8 for paraphrase, got {sim:.3f}"
    assert is_non_dup is False, "Near-duplicate paraphrase must be flagged as duplicate"


# ============================================================================
# 3. Two Genuinely Distinct Entries Test
# ============================================================================
def test_two_genuinely_distinct_entries():
    """Two genuinely distinct entries produce low Jaccard similarity and pass as non-duplicate."""
    text_a = "Enforce rate limit of 10 requests per minute on public authentication endpoints."
    text_b = "Store all uploaded medical scan images in encrypted S3 buckets with SSE-KMS."
    
    is_non_dup, sim = is_non_duplicate(text_a, text_b, threshold=0.8)
    
    assert sim < 0.3, f"Expected similarity < 0.3 for distinct entries, got {sim:.3f}"
    assert is_non_dup is True, "Distinct technical entries must pass non-duplicate check"


# ============================================================================
# 4. Blocklisted Generic Phrases Test (§6)
# ============================================================================
@pytest.mark.parametrize("generic_phrase", [
    "be secure",
    "follow best practices",
    "handle errors properly",
    "ensure data is safe",
    "validate all inputs",
])
def test_blocklisted_generic_phrase(generic_phrase):
    """Generic phrases from the fixed blocklist must fail actionable check per §6."""
    is_act, reason = is_actionable(generic_phrase)
    
    assert is_act is False, f"Generic phrase '{generic_phrase}' must fail actionable check"
    assert reason is not None
    assert ("generic non-actionable phrase blocklist" in reason) or ("under 6 words" in reason)


# ============================================================================
# 5. Valid Specific Directive Test (§6)
# ============================================================================
def test_valid_specific_directive():
    """A specific, concrete technical directive with >= 6 words passes actionable check."""
    directive = "Validate Stripe-Signature header on every webhook and reject mismatches with HTTP 400."
    is_act, reason = is_actionable(directive)
    
    assert is_act is True, f"Valid specific directive must pass actionable check, failed with: {reason}"
    assert reason is None


# ============================================================================
# 6. Short Directive Under 6 Words Test (§6)
# ============================================================================
def test_short_directive_under_six_words():
    """Directives under 6 words lack technical specificity and must fail actionable check."""
    short_text = "Always validate inputs carefully."
    is_act, reason = is_actionable(short_text)
    
    assert is_act is False, "Directive under 6 words must fail actionable check"
    assert reason is not None
    assert "under 6 words" in reason


# ============================================================================
# 7. List-Level Non-Duplicate Filtering Test (§6)
# ============================================================================
def test_list_level_non_duplicate_filtering():
    """validate_v6_list_non_duplicate drops duplicates in the same list and retains distinct entries."""
    entries = [
        {"id": "dir-1", "directive": "Wrap database modifications in atomic transactions.", "source_ref_id": "feat-1"},
        {"id": "dir-2", "directive": "Wrap database modifications in atomic transactions.", "source_ref_id": "feat-1"},  # exact dup
        {"id": "dir-3", "directive": "Hash user passwords using bcrypt with twelve rounds.", "source_ref_id": "feat-4"},
    ]
    
    cleaned, dup_indices, failed_checks = validate_v6_list_non_duplicate(entries, text_key="directive", threshold=0.8)
    
    assert len(cleaned) == 2, f"Expected 2 unique entries, got {len(cleaned)}"
    assert dup_indices == [1], f"Expected index 1 to be dropped, got {dup_indices}"
    assert len(failed_checks) == 1
    assert failed_checks[0]["check"] == "non_duplicate"


# ============================================================================
# 8. Full Quality Validation Integration Test
# ============================================================================
def test_evaluate_v6_quality_validation_integration():
    """evaluate_v6_quality_validation correctly sets boolean flags and separates quality violations."""
    clean_exc = [
        {
            "id": "exc-1",
            "title": "Payment Gateway Timeout Handling",
            "category": "exception_handling",
            "severity": "high",
            "provenance": "derived_from_business_rule",
            "reasoning": None,
            "description": "Retry payment processing up to three times with exponential backoff before failing.",
            "related_feature_ids": ["feat-1"],
            "related_structure_node_ids": ["src/services/service_1.py"]
        }
    ]
    clean_sec = [
        {
            "id": "sec-1",
            "title": "Bcrypt Password Hashing Standard",
            "category": "security",
            "severity": "high",
            "provenance": "derived_from_business_rule",
            "reasoning": None,
            "description": "Store all user passwords hashed with bcrypt using at least twelve work factor rounds.",
            "related_feature_ids": ["feat-1"],
            "related_structure_node_ids": ["src/services/service_1.py"]
        }
    ]
    clean_dir = [
        {
            "id": "dir-1",
            "directive": "All payment amount fields must be stored as integer cents, never floating point values.",
            "source": "feature_business_rule",
            "source_ref_id": "feat-1",
            "non_negotiable": True
        }
    ]
    
    res = evaluate_v6_quality_validation(clean_exc, clean_sec, clean_dir)
    flags = res["quality_flags"]
    
    assert flags["non_duplicate"] is True
    assert flags["actionable"] is True
    assert flags["traceable"] is True
    assert flags["reasoned"] is True
    assert flags["overall_pass"] is True
    assert len(flags["failed_checks"]) == 0
