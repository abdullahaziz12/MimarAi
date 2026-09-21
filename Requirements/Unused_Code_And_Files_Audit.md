# MimarAI — Unused Code & Files Audit Report
**Forensic Repository Cleanup Audit (Audit Only — No Modifications)**

---

## 1. Audit Metadata

- **Audit Date & Time:** 2026-09-22T02:15:00+05:00
- **Git Branch:** `v4-structure-generation`
- **Current Commit:** `1a8aac3`
- **Repository State:** Clean (`git status --short` showed 0 unstaged modifications prior to this audit)
- **Deployment Targets Audited:**
  - **Frontend:** Next.js 14 App Router (Root Directory: `frontend/`, deployed to Vercel)
  - **Backend:** FastAPI REST API (`backend/main.py`, deployed to Back4App / Render)
  - **Database:** Supabase PostgreSQL with RLS
- **Audit Scope:** Full repository scan covering all frontend pages, components, screens, Zustand state actions, hooks, styles, static assets, backend routes, services, schemas, unit tests, verification scripts, package manifests, and documentation.

---

## 2. Executive Summary

This repository-wide forensic audit evaluated all 170+ tracked files across the codebase to identify obsolete artifacts, duplicated implementations, unused dependencies, abandoned scratch scripts, and unreferenced static assets.

Because the **frontend UI was designed and created in advance** while the backend is undergoing phased implementation (V3 Interview Pipeline completed, V4 Structure Generation completed, Diagrams / MCP / Verification planned for future versions), **no frontend screen or state model was marked unused merely because its backend endpoint is pending**.

### Findings Summary
- **Definitely Unused Candidates:** **36 files** (Detached Vite prototype, superseded static HTML/JS/CSS files, duplicate root assets, unreferenced boilerplate SVGs, and obsolete one-off porting scripts)
- **Very Likely Unused Candidates:** **24 items** (Unreferenced asset variants in `frontend/public/assets/`, redundant root documentation duplicates, obsolete root debug summaries)
- **Possibly Unused / Human Review Required:** **10 items** (Standalone test verification scripts from prior version checkpoints, store actions with 0 external UI callers, `.gitignore` malformed syntax)
- **Duplicate / Legacy Implementations:** **4 major subsystems** (Vite CAD prototype vs Next.js App Router; Root static HTML/JS vs Next.js JSX components; Root `assets/` vs `frontend/public/assets/`; Root Markdown reports vs `Requirements/`)
- **Suspicious Dependencies:** **8 dependencies** (7 in root `package.json` belonging to the detached Vite prototype; 1 in `frontend/package.json` (`nodemailer`))

---

## 3. DEFINITELY UNUSED

The following items have zero incoming imports, zero route registrations, zero runtime references, and no reachable path from either the Next.js production frontend or the FastAPI backend:

---

### 3.1. Detached Vite Mockup Application (`src/` directory, `vite.config.js`, `index.html`, root `package.json`)

#### File / Code:
1. `src/App.jsx`
2. `src/main.jsx`
3. `src/App.css`
4. `src/index.css`
5. `src/styles/blueprint.css`
6. `src/data/mockProjectData.js`
7. `src/components/Navbar.jsx`
8. `src/components/LandingScreen.jsx`
9. `src/components/InterviewScreen.jsx`
10. `src/components/ConflictScreen.jsx`
11. `src/components/SpecScreen.jsx`
12. `src/components/DiagramScreen.jsx`
13. `src/components/McpExportScreen.jsx`
14. `src/components/DraftingFooter.jsx`
15. `src/assets/hero.png`
16. `src/assets/react.svg`
17. `src/assets/vite.svg`
18. `index.html` (root)
19. `vite.config.js` (root)
20. `package.json` (root)

- **Type:** Subsystem / Prototype Application (Vite + React 19)
- **Evidence:**
  - Vercel builds exclusively from `frontend/` using Next.js 14 App Router (`frontend/package.json`).
  - Repository-wide AST reference search confirms `frontend/` never imports from `../src/`, `mockProjectData.js`, `blueprint.css`, or root `index.html`.
  - `src/App.jsx` uses local hardcoded state and mock data (`SAMPLE_PROJECTS`, `INTERVIEW_TAXONOMY`) rather than the active Zustand store (`frontend/src/store/mimarStore.js`) and Supabase auth context.
  - `src/assets/react.svg` and `src/assets/vite.svg` are default Vite starter template boilerplate assets with 0 references.
  - Git history (`git log --follow -- src/App.jsx`) shows these files were imported in commit `bebf336` as an isolated blueprint mock CAD interface and have never been wired to the production Next.js pipeline.
- **Confidence:** `DEFINITELY UNUSED`

---

### 3.2. Superseded Static HTML/JS/CSS Prototype Artifacts

#### File / Code:
21. `app.html` (60 KB)
22. `app.js` (86 KB, 1,995 lines)
23. `app.css` (70 KB, 2,520 lines)
24. `contact.html` (25 KB)
25. `contact_preview.html` (25 KB)

- **Type:** Static HTML / Vanilla JS / CSS Prototype Files
- **Evidence:**
  - These files were the original raw HTML/JS/CSS designs ported to React JSX via `scripts/port_pages.py` in the initial commit (`3ce32e6`).
  - Next.js App Router renders pages dynamically via `frontend/src/app/page.jsx` (`/`), `frontend/src/app/app/page.jsx` (`/app`), `frontend/src/app/contact/page.jsx` (`/contact`), `frontend/src/app/login/page.jsx` (`/login`), and `frontend/src/app/admin/page.jsx` (`/admin`).
  - No server routes or Next.js middleware reference `app.html`, `app.js`, `contact.html`, or `contact_preview.html`.
  - `contact_preview.html` has 0 references across the entire repository.
- **Confidence:** `DEFINITELY UNUSED`

---

### 3.3. Redundant Root Assets Directory (`assets/`)

#### File / Code:
26. `assets/` (22 PNG image files, ~3.2 MB total)

- **Type:** Static Assets Directory Duplicate
- **Evidence:**
  - All 22 PNG assets (`mimarai-banner-dark.png`, `mimarai-logo-dark.png`, `mimarai-mark.png`, etc.) are byte-for-byte duplicates of the files located in `frontend/public/assets/`.
  - Next.js serves static assets only from `frontend/public/`.
  - The root `assets/` directory is outside the Next.js public directory and cannot be served by the web application.
- **Confidence:** `DEFINITELY UNUSED`

---

### 3.4. Root Standalone Image & Public Icons

#### File / Code:
27. `image.png` (206 KB, root directory)
28. `public/favicon.svg` (root directory)
29. `public/icons.svg` (root directory)

- **Type:** Root Static Assets
- **Evidence:**
  - `image.png`: Repository-wide grep finds 0 references across all codebase files.
  - `public/favicon.svg` and `public/icons.svg`: Next.js uses `frontend/public/assets/mimarai-favicon.png` configured in `frontend/src/app/layout.jsx`. The root `public/` directory is outside the Next.js root directory and is never accessed.
- **Confidence:** `DEFINITELY UNUSED`

---

### 3.5. Obsolete One-Off Transformation Scripts

#### File / Code:
30. `scripts/port_pages.py` (354 lines)
31. `scripts/encapsulate_styles.py` (114 lines)
32. `scripts/scope_css.py` (72 lines)
33. `scripts/test_gemini_key.py` (85 lines)

- **Type:** Maintenance / Porting Python Scripts
- **Evidence:**
  - `scripts/port_pages.py`: Explicitly written to parse `index.html`, `app.html`, `contact.html` and generate Next.js JSX files during initial migration (commit `3ce32e6`). Once the Next.js pages were created and evolved through V1-V4, this script became obsolete.
  - `scripts/encapsulate_styles.py` and `scripts/scope_css.py`: One-off utility scripts used during initial CSS migration.
  - `scripts/test_gemini_key.py`: Ad-hoc scratch testing script created to probe Gemini keys, superseded by the automated health checks and unit tests (`test_gemini_config.py`).
- **Confidence:** `DEFINITELY UNUSED`

---

## 4. VERY LIKELY UNUSED

The following items are unreferenced by active application runtime code and documentation, but are retained in the repository:

---

### 4.1. Unreferenced Logo & Mark Variations in `frontend/public/assets/`

#### Files:
1. `frontend/public/assets/mimarai-banner-dark.png`
2. `frontend/public/assets/mimarai-banner-light.png`
3. `frontend/public/assets/mimarai-logo-dark-bg.png`
4. `frontend/public/assets/mimarai-logo-dark-original.png`
5. `frontend/public/assets/mimarai-logo-dark-tight.png`
6. `frontend/public/assets/mimarai-logo-dark.png`
7. `frontend/public/assets/mimarai-logo-direct-crop.png`
8. `frontend/public/assets/mimarai-logo-light-bg.png`
9. `frontend/public/assets/mimarai-logo-light-tight.png`
10. `frontend/public/assets/mimarai-logo-on-dark.png`
11. `frontend/public/assets/mimarai-logo-on-light.png`
12. `frontend/public/assets/mimarai-logo-white.png`
13. `frontend/public/assets/mimarai-mark-dark.png`
14. `frontend/public/assets/mimarai-mark-light.png`
15. `frontend/public/assets/mimarai-mark-on-dark.png`
16. `frontend/public/assets/mimarai-mark-on-light.png`
17. `frontend/public/assets/mimarai-mark-raw.png`
18. `frontend/public/assets/mimarai-mark-white.png`
19. `frontend/public/assets/mimarai-mark.png`

- **Type:** Brand Design Asset Variants (~2.8 MB)
- **Evidence:**
  - A comprehensive codebase scan across all `.jsx`, `.js`, `.css`, and `.html` files in `frontend/src` showed that **only 3 assets** are actually referenced:
    1. `mimarai-favicon.png` (used in `frontend/src/app/layout.jsx`)
    2. `mimarai-logo-hero.png` (used in `frontend/src/app/page.jsx`, `frontend/src/app/contact/page.jsx`, `frontend/src/components/AppHeader.jsx`)
    3. `mimarai-mark-ultra.png` (used in `frontend/src/components/AppHeader.jsx`)
  - The remaining 19 variants are unreferenced design iterations.
- **Confidence:** `VERY LIKELY UNUSED`

---

### 4.2. Root Duplicate Markdown Reports

#### Files:
20. `MIMARAI_FRONTEND_MASTER_REFERENCE.md` (root directory)
21. `V3_DIAGNOSTIC_REPORT.md` (root directory)
22. `INTERVIEW_DEBUG_SUMMARY.md` (root directory)
23. `LIVE_TEST_REPORT_V3_3_V3_5_V3_8.md` (root directory)
24. `Requirements/mimarai-flow-desktop.html` (116 KB)

- **Type:** Documentation & Debug Reports
- **Evidence:**
  - `MIMARAI_FRONTEND_MASTER_REFERENCE.md` (root) is an exact duplicate of `Requirements/MIMARAI_FRONTEND_MASTER_REFERENCE.md`.
  - `V3_DIAGNOSTIC_REPORT.md` (root) is an exact duplicate of `Requirements/V3_DIAGNOSTIC_REPORT.md`.
  - `INTERVIEW_DEBUG_SUMMARY.md` and `LIVE_TEST_REPORT_V3_3_V3_5_V3_8.md` are transient debugging logs and point-in-time test reports from previous development sessions.
  - `Requirements/mimarai-flow-desktop.html` is a standalone HTML mockup export from early design sessions.
- **Confidence:** `VERY LIKELY UNUSED`

---

## 5. POSSIBLY UNUSED — HUMAN REVIEW REQUIRED

The following items appear uncalled by active code, but require human architectural confirmation before any cleanup:

---

### 5.1. Uncalled Actions in `frontend/src/store/mimarStore.js`

#### Code:
1. `setInterviewMode(mode)` (lines 201-203)
2. `setIsAskDrawerOpen(isOpen)` (lines 205-207)
3. `setProjectId(id)` (lines 212-214)
4. `resetStep0()` (lines 222-227)
5. `personaAnswer(index, value)` (lines 622-632)

- **Type:** Zustand Store Actions
- **Evidence:**
  - Static AST scan across `frontend/src/` confirms 0 components call `setInterviewMode`, `setIsAskDrawerOpen`, `setProjectId`, or `resetStep0` directly.
  - Components either mutate state through larger workflow actions (e.g. `submitIdea`, `restoreProjectDraft`, `resetProject`) or use local state.
  - `setIsAskDrawerOpen` was designed for a side-drawer AI modification panel mentioned in earlier specs but not currently rendered in the active UI layout.
- **Uncertainty / Human Decision:** These actions may be intentionally reserved for upcoming UI controls or future revision workflows.
- **Confidence:** `POSSIBLY UNUSED`

---

### 5.2. Historical Live Verification Scripts in `scripts/` and `backend/`

#### Files:
6. `scripts/verify_item1_cleanup.py`
7. `scripts/verify_item2_rate_limits.py`
8. `scripts/verify_item4_cross_device.py`
9. `scripts/verify_failed_endpoints.py`
10. `scripts/verify_generate_and_services.py`
11. `backend/generate_multi_version_live_report.py`
12. `backend/verify_live_evidence.py`
13. `backend/verify_live_v3_8.py`

- **Type:** Point-in-time Manual QA Scripts
- **Evidence:**
  - These scripts were created for specific historical verification runs (e.g. V3.8, V3.11, V3.12 reliability items) and are not part of the standard `pytest` automated test suite.
  - Automated CI/CD runs `pytest backend/`, which executes the formal test suite (`test_admin_portal.py`, `test_v4_structure_generation.py`, etc.).
- **Uncertainty / Human Decision:** The project owner may wish to retain these scripts as reference artifacts or manual verification tools.
- **Confidence:** `POSSIBLY UNUSED`

---

### 5.3. Malformed First Line in `.gitignore`

#### Code:
- Line 1 of `.gitignore`:
  ```text
  git restore --source=HEAD -- <the two deleted root docs># Dependencies
  ```
- **Type:** Configuration Glitch
- **Evidence:** A git restore terminal command was accidentally pasted into the top of `.gitignore`, corrupting the `# Dependencies` comment header.
- **Confidence:** `POSSIBLY UNUSED / REQUIRES CLEANUP`

---

## 6. DUPLICATE / LEGACY IMPLEMENTATIONS

The audit identified 4 major duplicated or superseded subsystems across the repository:

```
+----------------------------------------------------+----------------------------------------------------+
| Active / Production Implementation                 | Duplicate / Superseded Implementation              |
+----------------------------------------------------+----------------------------------------------------+
| frontend/ (Next.js 14 App Router, Zustand, SSR)   | src/ (Detached Vite + React 19 mockup app)         |
| frontend/src/app/ (Next.js JSX Pages & Routes)     | root app.html, app.js, contact.html, index.html   |
| frontend/public/assets/ (Next.js public assets)    | root assets/ (Exact duplicate 22 image files)      |
| Requirements/*.md (Authoritative specs & reports)  | root *.md duplicates (MIMARAI_FRONTEND_MASTER...)  |
+----------------------------------------------------+----------------------------------------------------+
```

### Details:
1. **Frontend Application Framework**:
   - **Active:** `frontend/` contains the full production Next.js application deployed to Vercel.
   - **Superseded:** `src/` contains an early standalone Vite prototype with mock data (`src/data/mockProjectData.js`) and hardcoded screens (`src/components/ConflictScreen.jsx`, `src/components/SpecScreen.jsx`, etc.).
2. **Page Markup**:
   - **Active:** `frontend/src/app/page.jsx`, `frontend/src/app/app/page.jsx`, `frontend/src/app/contact/page.jsx`.
   - **Superseded:** `index.html`, `app.html`, `app.js`, `app.css`, `contact.html`, `contact_preview.html`.
3. **Brand Assets**:
   - **Active:** `frontend/public/assets/` (served by Next.js at `/assets/...`).
   - **Superseded:** `assets/` (root folder, duplicate copies never served by Next.js).
4. **Master Documentation**:
   - **Active:** `Requirements/MIMARAI_FRONTEND_MASTER_REFERENCE.md`, `Requirements/V3_DIAGNOSTIC_REPORT.md`.
   - **Superseded:** Root copies of the same files.

---

## 7. SUSPICIOUS DEPENDENCIES

### 7.1. Root `package.json` (Vite Mockup Manifest)

The root `package.json` defines dependencies for the detached Vite prototype:
- `lucide-react`: `^1.33.0`
- `react`: `^19.2.8`
- `react-dom`: `^19.2.8`
- `@types/react`: `^19.2.17`
- `@types/react-dom`: `^19.2.3`
- `@vitejs/plugin-react`: `^6.0.4`
- `oxlint`: `^1.75.0`
- `vite`: `^8.2.0`

**Finding:** These dependencies are solely utilized by `src/` and `vite.config.js`. They are completely separate from the active production app in `frontend/package.json` (which uses Next.js 14 and React 18).

### 7.2. `frontend/package.json`

- `nodemailer`: `^9.0.5`
  - **Finding:** Used in `frontend/src/app/api/contact/route.js` (Next.js serverless route). Note that the FastAPI backend (`backend/main.py`) also contains native SMTP dispatch logic (`send_smtp_email`). Both endpoints exist in parallel.

### 7.3. `backend/requirements.txt`

All 10 dependencies in `backend/requirements.txt` are **actively imported and used** in `backend/main.py`:
- `fastapi`, `uvicorn`, `supabase`, `python-dotenv`, `pydantic`, `email-validator`, `httpx`, `PyJWT`, `cryptography`, `sentry-sdk`.
- **Finding:** 0 unused dependencies in backend.

---

## 8. SUSPICIOUS ASSETS

| Asset Path | Size | Referenced In Code | Status |
| :--- | :--- | :--- | :--- |
| `image.png` (root) | 206 KB | 0 references | `DEFINITELY UNUSED` |
| `public/favicon.svg` (root) | 9.5 KB | 0 references | `DEFINITELY UNUSED` |
| `public/icons.svg` (root) | 5.0 KB | 0 references | `DEFINITELY UNUSED` |
| `src/assets/react.svg` | 4.1 KB | 0 references | `DEFINITELY UNUSED` |
| `src/assets/vite.svg` | 8.7 KB | 0 references | `DEFINITELY UNUSED` |
| `src/assets/hero.png` | 13.0 KB | Only in `src/App.jsx` | `DEFINITELY UNUSED` |
| `assets/*` (22 root PNGs) | 3.2 MB | 0 references in Next.js | `DEFINITELY UNUSED` (Duplicate of `frontend/public/assets/`) |
| `Requirements/ChatGPT Image Aug 21, 2026, 06_08_14 AM.png` | 885 KB | Attached asset | `POSSIBLY UNUSED` (Historical screenshot) |
| `Requirements/ChatGPT Image Aug 21, 2026, 06_08_29 AM.png` | 1.3 MB | Attached asset | `POSSIBLY UNUSED` (Historical screenshot) |

---

## 9. SUSPICIOUS TESTS / SCRIPTS

| Script Path | Purpose / History | Recommendation |
| :--- | :--- | :--- |
| `scripts/port_pages.py` | One-off HTML to JSX porting utility from V0 | `DEFINITELY UNUSED` |
| `scripts/encapsulate_styles.py` | One-off CSS selector rewriting script | `DEFINITELY UNUSED` |
| `scripts/scope_css.py` | One-off CSS scoping script | `DEFINITELY UNUSED` |
| `scripts/test_gemini_key.py` | Ad-hoc scratch test script for Gemini | `DEFINITELY UNUSED` |
| `scripts/verify_item1_cleanup.py` | One-off manual test runner for V3.12 Item 1 | `POSSIBLY UNUSED` (Reference QA) |
| `scripts/verify_item2_rate_limits.py`| One-off manual test runner for V3.12 Item 2 | `POSSIBLY UNUSED` (Reference QA) |
| `scripts/verify_item4_cross_device.py`| One-off manual test runner for V3.12 Item 4 | `POSSIBLY UNUSED` (Reference QA) |
| `scripts/verify_failed_endpoints.py` | Standalone endpoint verification script | `POSSIBLY UNUSED` (Reference QA) |
| `scripts/verify_generate_and_services.py`| Standalone service verification script | `POSSIBLY UNUSED` (Reference QA) |
| `backend/generate_multi_version_live_report.py` | Multi-version live test generator | `POSSIBLY UNUSED` (Reference QA) |
| `backend/verify_live_evidence.py` | Point-in-time evidence collector | `POSSIBLY UNUSED` (Reference QA) |
| `backend/verify_live_v3_8.py` | V3.8 evidence verification script | `POSSIBLY UNUSED` (Reference QA) |

---

## 10. INTENTIONALLY RETAINED / FUTURE CODE

Per the audit rules, the following files and code blocks appear inactive or lack backend endpoints today, but **MUST BE PRESERVED** because they are documented, intentionally designed components waiting for upcoming pipeline phases:

1. **`frontend/src/components/screens/StructureScreen.jsx`**:
   - The UI screen for V4 Structure Generation review and file tree visualization.
2. **`frontend/src/components/screens/DiagramScreen.jsx`**:
   - The UI screen for Section 6 Diagram Generation (Database ERD & System Architecture review).
3. **`frontend/src/components/screens/RenderScreen.jsx`**:
   - Mermaid.js deterministic rendering engine for architecture diagrams.
4. **`frontend/src/components/screens/FinalScreen.jsx`**:
   - Final implementation plan review and export interface.
5. **`frontend/src/components/screens/McpScreen.jsx`**:
   - Claude / Cursor MCP live server connection interface (Section 7).
6. **`frontend/src/components/ReviewCommentSheet.jsx`**:
   - Reusable commenting drawer used across `PlanScreen`, `StructureScreen`, `DiagramScreen`, and `FinalScreen`.
7. **`scripts/test_v4_project_structure_live.py`**:
   - Self-contained terminal live verification runner for Project Structure Generation (V4).
8. **SQL Migration Scripts (`scripts/v2_migration.sql` through `scripts/v4_structure_migration.sql`)**:
   - Database schema evolution scripts required for reproducing database environments.
9. **All 18 Unit Test Suites in `backend/test_*.py`**:
   - Regression test suites verifying V3 interview logic, rate limits, security, fail-open persistence, and V4 structure generation.

---

## 11. NO-CHANGE VERIFICATION

- **No source code files were deleted.**
- **No existing code or components were modified.**
- **No packages or dependencies were installed or removed.**
- **No Git commits, pushes, or branch resets were performed.**
- **The only file created during this task is this audit report (`Requirements/Unused_Code_And_Files_Audit.md`).**

### Verification Command Output:
```text
$ git status --short
?? Requirements/Unused_Code_And_Files_Audit.md
```
*(Confirms that the repository working tree is completely unmodified except for the single requested audit report document).*
