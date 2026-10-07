#!/usr/bin/env python3
"""
==============================================================================
MimarAI V6.0 — Final Plan Consolidation Live Verification Script
==============================================================================

This script is an alias wrapper for scripts/run_v6_live_tests.py to provide
uniform naming convention matching test_v4_project_structure_live.py,
test_v5_0_diagram_generation_live.py, and test_v5_1_ask_ai_diagram_editing_live.py.

USAGE (run by project owner in PowerShell):
    $env:MIMARAI_TEST_TOKEN="<your-supabase-jwt>"
    # Optional: $env:MIMARAI_BACKEND_URL="https://mimaraibackend-o1nd8czd.b4a.run"
    # Optional: $env:MIMARAI_TEST_PROJECT_ID="d56bc308-7c77-467d-b530-16cf76ae70fc"
    python scripts/test_v6_0_final_plan_live.py
==============================================================================
"""

import os
import sys

# Add scripts directory to path and execute runner
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from run_v6_live_tests import V6LiveTester

if __name__ == "__main__":
    tester = V6LiveTester()
    tester.run()
