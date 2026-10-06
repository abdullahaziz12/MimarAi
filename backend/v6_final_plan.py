"""
MimarAi V6.0 Final Plan Consolidation Logic Module.
Strictly implements Requirements/18_V6_Final_Plan_Consolidation_Logic.md.

Includes:
1. Pure functions for tokenization, Jaccard similarity, and generic-phrase blocklisting.
2. Step 1 deterministic consolidation with cross_reference_gaps detection.
3. Step 2 diff/merge matching algorithm with conflict detection.
4. Quality validation against quality_flags (traceable, non_duplicate, reasoned, actionable).
5. Lock-blocking rule evaluator (§7).
"""

import re
import uuid
from typing import Any, Dict, List, Optional, Set, Tuple

# ============================================================================
# Constants & Allowlists
# ============================================================================

STOPWORDS: Set[str] = {
    "a", "an", "the", "and", "or", "but", "if", "then", "else", "when", "at", "from",
    "by", "for", "with", "about", "against", "between", "into", "through", "during",
    "before", "after", "above", "below", "to", "of", "up", "down", "in", "out", "on",
    "off", "over", "under", "again", "further", "then", "once", "here", "there", "all",
    "any", "both", "each", "few", "more", "most", "other", "some", "such", "no", "nor",
    "not", "only", "own", "same", "so", "than", "too", "very", "s", "t", "can", "will",
    "just", "don", "should", "now", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "having", "do", "does", "did", "doing", "this", "that", "these", "those"
}

GENERIC_PHRASE_BLOCKLIST: List[str] = [
    "be secure",
    "follow best practices",
    "handle errors properly",
    "ensure data is safe",
    "validate all inputs",
    "maintain high security",
    "ensure proper error handling",
    "ensure system stability",
    "write clean code",
    "ensure fast performance",
    "secure the application",
    "proper error handling",
    "ensure security",
    "follow standards"
]

INFRA_ALLOWLIST: Set[str] = {
    "database",
    "auth_middleware",
    "api_gateway",
    "cache",
    "queue",
    "logging",
    "deployment_config"
}


# ============================================================================
# Pure Helper Functions (Unit-Tested)
# ============================================================================

def tokenize_text(text: str, remove_stopwords: bool = False) -> Set[str]:
    """
    Tokenize text: lowercase, remove punctuation, split on whitespace.
    Optionally filter out English stopwords.
    """
    if not text or not isinstance(text, str):
        return set()
    cleaned = re.sub(r"[^\w\s]", " ", text.lower())
    tokens = [t.strip() for t in cleaned.split() if t.strip()]
    if remove_stopwords:
        tokens = [t for t in tokens if t not in STOPWORDS]
    return set(tokens)


def calculate_jaccard_similarity(text_a: str, text_b: str, remove_stopwords: bool = False) -> float:
    """
    Compute token-level Jaccard similarity: |A ∩ B| / |A ∪ B|.
    If both token sets are empty, returns 1.0. If one is empty, returns 0.0.
    """
    tokens_a = tokenize_text(text_a, remove_stopwords=remove_stopwords)
    tokens_b = tokenize_text(text_b, remove_stopwords=remove_stopwords)
    if not tokens_a and not tokens_b:
        return 1.0
    if not tokens_a or not tokens_b:
        return 0.0
    intersection = tokens_a.intersection(tokens_b)
    union = tokens_a.union(tokens_b)
    return len(intersection) / len(union)


def is_generic_phrase(text: str, blocklist: Optional[List[str]] = None, threshold: float = 0.8) -> Tuple[bool, Optional[str]]:
    """
    Checks if text exact/near matches any phrase in generic-phrase blocklist (Jaccard >= threshold).
    """
    if blocklist is None:
        blocklist = GENERIC_PHRASE_BLOCKLIST
    for phrase in blocklist:
        sim = calculate_jaccard_similarity(text, phrase, remove_stopwords=False)
        if sim >= threshold:
            return True, phrase
    return False, None


# ============================================================================
# Quality Validation (§6)
# ============================================================================

def evaluate_finding_quality(entry: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Validates a single finding entry against traceable, reasoned, and actionable checks.
    """
    failed_checks: List[Dict[str, Any]] = []

    # 1. Traceable: non-empty related_feature_ids or related_structure_node_ids
    feat_ids = entry.get("related_feature_ids") or []
    node_ids = entry.get("related_structure_node_ids") or []
    if not feat_ids and not node_ids:
        failed_checks.append({
            "check": "traceable",
            "reason": "Finding must be linked to at least one related feature ID or structure node ID.",
            "fields_involved": ["related_feature_ids", "related_structure_node_ids"],
            "survived_fix_pass": False
        })

    # 2. Reasoned: mandatory non-null and non-empty when provenance == "ai_inferred"
    provenance = str(entry.get("provenance") or "").strip().lower()
    if provenance == "ai_inferred":
        reasoning = entry.get("reasoning")
        if reasoning is None or not str(reasoning).strip():
            failed_checks.append({
                "check": "reasoned",
                "reason": "AI-inferred finding is missing mandatory architectural reasoning.",
                "fields_involved": ["reasoning", "provenance"],
                "survived_fix_pass": False
            })

    # 3. Actionable: under 6 words or matches generic phrase blocklist
    desc = str(entry.get("description") or "").strip()
    words = [w for w in re.sub(r"[^\w\s]", " ", desc).split() if w]
    if len(words) < 6:
        failed_checks.append({
            "check": "actionable",
            "reason": f"Finding description is under 6 words ({len(words)} words found) and lacks actionable technical specificity.",
            "fields_involved": ["description"],
            "survived_fix_pass": False
        })
    else:
        is_gen, phrase = is_generic_phrase(desc)
        if is_gen:
            failed_checks.append({
                "check": "actionable",
                "reason": f"Finding description matches generic non-actionable phrase blocklist pattern ('{phrase}').",
                "fields_involved": ["description"],
                "survived_fix_pass": False
            })

    return failed_checks


def evaluate_directive_quality(entry: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Validates a single mandatory directive against traceable and actionable checks.
    """
    failed_checks: List[Dict[str, Any]] = []

    # 1. Traceable: non-empty source_ref_id
    source_ref = entry.get("source_ref_id")
    if not source_ref or not str(source_ref).strip():
        failed_checks.append({
            "check": "traceable",
            "reason": "Mandatory directive must have a non-empty source_ref_id tracing to its origin.",
            "fields_involved": ["source_ref_id"],
            "survived_fix_pass": False
        })

    # 2. Actionable: under 6 words or matches generic phrase blocklist
    directive_text = str(entry.get("directive") or "").strip()
    words = [w for w in re.sub(r"[^\w\s]", " ", directive_text).split() if w]
    if len(words) < 6:
        failed_checks.append({
            "check": "actionable",
            "reason": f"Directive is under 6 words ({len(words)} words found) and lacks actionable technical specificity.",
            "fields_involved": ["directive"],
            "survived_fix_pass": False
        })
    else:
        is_gen, phrase = is_generic_phrase(directive_text)
        if is_gen:
            failed_checks.append({
                "check": "actionable",
                "reason": f"Directive matches generic non-actionable phrase blocklist pattern ('{phrase}').",
                "fields_involved": ["directive"],
                "survived_fix_pass": False
            })

    return failed_checks


def validate_v6_list_non_duplicate(
    entries: List[Dict[str, Any]],
    text_key: str = "title",
    threshold: float = 0.8
) -> Tuple[List[Dict[str, Any]], List[int], List[Dict[str, Any]]]:
    """
    Pure function: checks a list for token-level Jaccard duplicates (>= threshold).
    Returns (cleaned_entries, duplicate_indices, failed_checks).
    """
    cleaned: List[Dict[str, Any]] = []
    duplicate_indices: List[int] = []
    failed_checks: List[Dict[str, Any]] = []

    for idx, entry in enumerate(entries):
        text = str(entry.get(text_key) or "").strip()
        is_dup = False
        for prior_entry in cleaned:
            prior_text = str(prior_entry.get(text_key) or "").strip()
            sim = calculate_jaccard_similarity(text, prior_text, remove_stopwords=False)
            if sim >= threshold:
                is_dup = True
                failed_checks.append({
                    "check": "non_duplicate",
                    "reason": f"Entry '{text}' is a near-duplicate of earlier entry '{prior_text}' (similarity: {sim:.2f} >= {threshold}).",
                    "fields_involved": [text_key],
                    "survived_fix_pass": False
                })
                break

        if is_dup:
            duplicate_indices.append(idx)
        else:
            cleaned.append(entry)

    return cleaned, duplicate_indices, failed_checks


def evaluate_v6_quality_validation(
    exception_handling: List[Dict[str, Any]],
    security_considerations: List[Dict[str, Any]],
    mandatory_directives: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Full V6 Quality Validation suite evaluating:
    - traceable
    - non_duplicate
    - reasoned
    - actionable
    Across all 3 collections separately.
    """
    all_failed_checks: List[Dict[str, Any]] = []

    # 1. Non-duplicate pass across each list separately
    clean_exc, dup_exc_idx, exc_dup_fails = validate_v6_list_non_duplicate(exception_handling, text_key="title")
    clean_sec, dup_sec_idx, sec_dup_fails = validate_v6_list_non_duplicate(security_considerations, text_key="title")
    clean_dir, dup_dir_idx, dir_dup_fails = validate_v6_list_non_duplicate(mandatory_directives, text_key="directive")

    all_failed_checks.extend(exc_dup_fails)
    all_failed_checks.extend(sec_dup_fails)
    all_failed_checks.extend(dir_dup_fails)

    # 2. Individual quality evaluations on non-duplicate entries
    for item in clean_exc:
        fails = evaluate_finding_quality(item)
        all_failed_checks.extend(fails)

    for item in clean_sec:
        fails = evaluate_finding_quality(item)
        all_failed_checks.extend(fails)

    for item in clean_dir:
        fails = evaluate_directive_quality(item)
        all_failed_checks.extend(fails)

    # Calculate boolean flags per check
    check_names = {f["check"] for f in all_failed_checks}
    quality_flags = {
        "traceable": "traceable" not in check_names,
        "non_duplicate": "non_duplicate" not in check_names,
        "reasoned": "reasoned" not in check_names,
        "actionable": "actionable" not in check_names,
        "overall_pass": len(all_failed_checks) == 0,
        "failed_checks": all_failed_checks
    }

    return {
        "quality_flags": quality_flags,
        "cleaned_exception_handling": clean_exc,
        "cleaned_security_considerations": clean_sec,
        "cleaned_mandatory_directives": clean_dir,
    }


# ============================================================================
# Step 1 — Deterministic Consolidation (§4)
# ============================================================================

def parse_v4_structure_to_nodes(raw_accepted: Any) -> List[Dict[str, Any]]:
    """
    Parses real V4 accepted structure ({filepath: [features]}) into a list of structure nodes:
    one node per file path: node_id = <file path>, mapped_features = <its features array>.
    No type field is synthesized or guessed from filenames (§4).
    """
    if not isinstance(raw_accepted, dict):
        return []

    struct_dict = raw_accepted
    if "structure" in struct_dict and isinstance(struct_dict["structure"], dict):
        struct_dict = struct_dict["structure"]

    nodes: List[Dict[str, Any]] = []
    for filepath, features in struct_dict.items():
        if not isinstance(filepath, str) or not filepath.strip():
            continue
        cleaned_path = filepath.strip()
        if isinstance(features, list):
            mapped = [str(f).strip() for f in features if f is not None and not isinstance(f, dict) and str(f).strip()]
        elif isinstance(features, str) and features.strip():
            mapped = [features.strip()]
        else:
            mapped = []
        nodes.append({
            "node_id": cleaned_path,
            "mapped_features": mapped
        })
    return nodes


def step1_consolidate_plan(
    features: List[Dict[str, Any]],
    structure_nodes: List[Dict[str, Any]],
    diagram_state: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Pure Python deterministic consolidation.
    Builds consolidated_summary and computes cross_reference_gaps:
    - feature_not_in_structure: active feature maps to 0 structure nodes (hard blocker)
    - structure_node_no_feature: structure node maps to 0 features (informational-only)
    """
    feature_summaries = []
    feature_id_set = set()
    feature_name_map = {}

    for f in features:
        fid = str(f.get("id") or "")
        fname = str(f.get("name") or "")
        feature_id_set.add(fid)
        if fname:
            feature_name_map[fname.lower()] = fid
        feature_summaries.append({
            "feature_id": fid,
            "title": fname,
            "priority": f.get("priority", "must_have"),
            "actor_role": f.get("actor_role", [])
        })

    node_summaries = []
    mapped_feature_ids_overall = set()

    for n in structure_nodes:
        nid = str(n.get("node_id") or n.get("id") or "")
        raw_maps = n.get("mapped_features") or n.get("maps_to_features") or []
        resolved_maps = []
        for m in raw_maps:
            m_str = str(m).strip()
            if m_str in feature_id_set:
                resolved_maps.append(m_str)
                mapped_feature_ids_overall.add(m_str)
            elif m_str.lower() in feature_name_map:
                resolved_fid = feature_name_map[m_str.lower()]
                resolved_maps.append(resolved_fid)
                mapped_feature_ids_overall.add(resolved_fid)
            else:
                found_match = None
                for fname, fid in feature_name_map.items():
                    if fname and (fname in m_str.lower() or m_str.lower() in fname):
                        found_match = fid
                        break
                if found_match:
                    resolved_maps.append(found_match)
                    mapped_feature_ids_overall.add(found_match)
                else:
                    resolved_maps.append(m_str)

        node_entry: Dict[str, Any] = {
            "node_id": nid,
            "maps_to_features": resolved_maps
        }
        if n.get("type"):
            node_entry["type"] = str(n["type"]).lower()
        node_summaries.append(node_entry)

    # Cross-reference gaps detection
    gaps = []

    # 1. feature_not_in_structure (hard blocker)
    for f in features:
        fid = str(f.get("id") or "")
        fname = str(f.get("name") or "")
        if fid not in mapped_feature_ids_overall and fname.lower() not in [m.lower() for n in node_summaries for m in n["maps_to_features"]]:
            gaps.append({
                "type": "feature_not_in_structure",
                "feature_id": fid,
                "title": fname
            })

    # 2. structure_node_no_feature (informational-only)
    for n in node_summaries:
        if not n["maps_to_features"]:
            gap_item: Dict[str, Any] = {
                "type": "structure_node_no_feature",
                "node_id": n["node_id"]
            }
            if "type" in n:
                gap_item["node_type"] = n["type"]
            gaps.append(gap_item)

    diagram_refs = {
        "erd_id": diagram_state.get("accepted_schema_id") or "erd-v5",
        "architecture_id": diagram_state.get("accepted_architecture_id") or "arch-v5"
    }

    return {
        "features": feature_summaries,
        "structure_nodes": node_summaries,
        "diagram_refs": diagram_refs,
        "cross_reference_gaps": gaps
    }


# ============================================================================
# Step 2 — Diff/Merge Algorithm (§5.1)
# ============================================================================

def diff_merge_findings(
    draft_a_findings: List[Dict[str, Any]],
    draft_b_findings: List[Dict[str, Any]],
    category: str
) -> List[Dict[str, Any]]:
    """
    Diff/merge algorithm for exception_handling and security_considerations:
    Two findings match if:
    1. Same category
    2. Overlapping related_feature_ids / related_structure_node_ids
    3. Token-level Jaccard similarity of title (stopwords removed) >= 0.5
    """
    merged: List[Dict[str, Any]] = []
    matched_b_indices: Set[int] = set()

    for item_a in draft_a_findings:
        title_a = str(item_a.get("title") or "")
        feats_a = set(item_a.get("related_feature_ids") or [])
        nodes_a = set(item_a.get("related_structure_node_ids") or [])

        match_found = False
        for b_idx, item_b in enumerate(draft_b_findings):
            if b_idx in matched_b_indices:
                continue

            title_b = str(item_b.get("title") or "")
            feats_b = set(item_b.get("related_feature_ids") or [])
            nodes_b = set(item_b.get("related_structure_node_ids") or [])

            # Check overlap on IDs
            has_id_overlap = bool(feats_a.intersection(feats_b)) or bool(nodes_a.intersection(nodes_b))
            if not has_id_overlap and (feats_a or feats_b or nodes_a or nodes_b):
                continue

            # Check title similarity
            title_sim = calculate_jaccard_similarity(title_a, title_b, remove_stopwords=True)
            if title_sim >= 0.5:
                # MATCH! Merge them
                matched_b_indices.add(b_idx)
                match_found = True

                desc_a = str(item_a.get("description") or "")
                desc_b = str(item_b.get("description") or "")
                reasoning_a = str(item_a.get("reasoning") or "")
                reasoning_b = str(item_b.get("reasoning") or "")

                # Keep entry with longer non-null reasoning/description
                score_a = len(reasoning_a) + len(desc_a)
                score_b = len(reasoning_b) + len(desc_b)
                chosen_base = item_a if score_a >= score_b else item_b

                # Union related IDs
                union_feats = sorted(list(feats_a.union(feats_b)))
                union_nodes = sorted(list(nodes_a.union(nodes_b)))

                # Conflict detection: check if descriptions differ significantly or oppose
                desc_sim = calculate_jaccard_similarity(desc_a, desc_b, remove_stopwords=False)
                # If title matched but descriptions are very distinct (similarity < 0.3) or have conflicting severities
                severity_a = item_a.get("severity", "medium")
                severity_b = item_b.get("severity", "medium")
                has_conflict = (desc_sim < 0.3 and len(desc_a) > 10 and len(desc_b) > 10) or (severity_a == "critical" and severity_b in ("low", "medium"))

                merged_item = dict(chosen_base)
                merged_item["id"] = chosen_base.get("id") or str(uuid.uuid4())
                merged_item["category"] = category
                merged_item["related_feature_ids"] = union_feats
                merged_item["related_structure_node_ids"] = union_nodes
                merged_item["conflict"] = bool(has_conflict)
                merged.append(merged_item)
                break

        if not match_found:
            item_copy = dict(item_a)
            item_copy["id"] = item_copy.get("id") or str(uuid.uuid4())
            item_copy["category"] = category
            item_copy["conflict"] = False
            merged.append(item_copy)

    # Append unmatched from Draft B
    for b_idx, item_b in enumerate(draft_b_findings):
        if b_idx not in matched_b_indices:
            item_copy = dict(item_b)
            item_copy["id"] = item_copy.get("id") or str(uuid.uuid4())
            item_copy["category"] = category
            item_copy["conflict"] = False
            merged.append(item_copy)

    return merged


def diff_merge_directives(
    draft_a_directives: List[Dict[str, Any]],
    draft_b_directives: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Diff/merge algorithm for mandatory_directives:
    Match on source_ref_id + token-level Jaccard similarity of directive (stopwords removed) >= 0.5.
    """
    merged: List[Dict[str, Any]] = []
    matched_b_indices: Set[int] = set()

    for item_a in draft_a_directives:
        ref_a = str(item_a.get("source_ref_id") or "").strip()
        dir_a = str(item_a.get("directive") or "")

        match_found = False
        for b_idx, item_b in enumerate(draft_b_directives):
            if b_idx in matched_b_indices:
                continue

            ref_b = str(item_b.get("source_ref_id") or "").strip()
            dir_b = str(item_b.get("directive") or "")

            if ref_a and ref_b and ref_a == ref_b:
                sim = calculate_jaccard_similarity(dir_a, dir_b, remove_stopwords=True)
                if sim >= 0.5:
                    matched_b_indices.add(b_idx)
                    match_found = True
                    chosen_base = item_a if len(dir_a) >= len(dir_b) else item_b
                    merged_item = dict(chosen_base)
                    merged_item["id"] = chosen_base.get("id") or str(uuid.uuid4())
                    merged_item["non_negotiable"] = True
                    merged.append(merged_item)
                    break

        if not match_found:
            item_copy = dict(item_a)
            item_copy["id"] = item_copy.get("id") or str(uuid.uuid4())
            item_copy["non_negotiable"] = True
            merged.append(item_copy)

    for b_idx, item_b in enumerate(draft_b_directives):
        if b_idx not in matched_b_indices:
            item_copy = dict(item_b)
            item_copy["id"] = item_copy.get("id") or str(uuid.uuid4())
            item_copy["non_negotiable"] = True
            merged.append(item_copy)

    return merged


def diff_merge_final_plan_drafts(
    draft_a: Dict[str, Any],
    draft_b: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Merges independent AI drafts into a single candidate final plan.
    Assigns fresh, guaranteed-unique sequential IDs to every entry in each list
    (exc-1..N, sec-1..N, dir-1..N) to prevent ID collisions from independent drafts.
    """
    exc_a = draft_a.get("exception_handling") or []
    exc_b = draft_b.get("exception_handling") or []
    merged_exc = diff_merge_findings(exc_a, exc_b, category="exception_handling")

    sec_a = draft_a.get("security_considerations") or []
    sec_b = draft_b.get("security_considerations") or []
    merged_sec = diff_merge_findings(sec_a, sec_b, category="security")

    dir_a = draft_a.get("mandatory_directives") or []
    dir_b = draft_b.get("mandatory_directives") or []
    merged_dir = diff_merge_directives(dir_a, dir_b)

    # Reassign fresh guaranteed-unique IDs to prevent collisions between drafts
    for idx, item in enumerate(merged_exc, start=1):
        item["id"] = f"exc-{idx}"

    for idx, item in enumerate(merged_sec, start=1):
        item["id"] = f"sec-{idx}"

    for idx, item in enumerate(merged_dir, start=1):
        item["id"] = f"dir-{idx}"

    return {
        "exception_handling": merged_exc,
        "security_considerations": merged_sec,
        "mandatory_directives": merged_dir
    }


# ============================================================================
# Lock Blocking Rules Evaluator (§7)
# ============================================================================

def check_final_plan_lock_blockers(
    consolidated_summary: Dict[str, Any],
    exception_handling: List[Dict[str, Any]],
    security_considerations: List[Dict[str, Any]],
    resolved_comment_ids: Set[str]
) -> List[str]:
    """
    Evaluates lock-blocking conditions independently (§7):
    1. Any feature_not_in_structure gap is open.
    2. Any exception_handling or security_considerations entry with severity = critical
       is not marked resolved via comments.
    (structure_node_no_feature gaps are informational-only and never block lock).
    """
    blockers: List[str] = []

    # 1: Evaluate cross_reference_gaps (ONLY feature_not_in_structure blocks)
    gaps = consolidated_summary.get("cross_reference_gaps") or []
    for gap in gaps:
        gap_type = gap.get("type")
        if gap_type == "feature_not_in_structure":
            fid = gap.get("feature_id") or "unknown"
            ftitle = gap.get("title") or ""
            blockers.append(f"Open feature_not_in_structure gap: Feature '{fid}' ({ftitle}) is not mapped to any structure node.")

    # 2: Evaluate unresolved critical severity findings
    for item in (exception_handling or []) + (security_considerations or []):
        sev = str(item.get("severity") or "").lower()
        if sev == "critical":
            item_id = str(item.get("id") or "")
            if item_id not in resolved_comment_ids:
                title = item.get("title") or item_id
                cat = item.get("category") or "review finding"
                blockers.append(f"Unresolved critical {cat}: '{title}' (ID: {item_id}) has not been marked resolved via comments.")

    return blockers
