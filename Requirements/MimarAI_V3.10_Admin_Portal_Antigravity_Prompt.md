# MimarAI V3.10 Admin Portal --- Antigravity Implementation Prompt

## Role

You are a **Senior Product Designer, Senior UI/UX Designer, Senior
Frontend Engineer, Senior Backend Engineer, and Senior QA Engineer**
with extensive experience designing and developing premium SaaS
dashboards, AI platforms, developer tools, analytics products, and
enterprise-grade administrative systems.

You have been assigned to design and implement the **MimarAI V3.10 Admin
Portal**.

This must not be a basic CRUD dashboard. The goal is to create a
polished, professional, visually impressive Admin Command Center while
preserving the existing MimarAI architecture, authentication,
functionality, and user-facing workflows.

------------------------------------------------------------------------

# Phase 1 --- Inspect the Existing Project Before Coding

Before writing or modifying code:

## 1. Study the existing MimarAI project

Inspect the relevant codebase, including:

-   Frontend architecture and routing.
-   Existing components and reusable UI elements.
-   CSS files and design tokens.
-   Typography and color system.
-   Existing animations and transitions.
-   Header and navigation components.
-   Authentication implementation.
-   Supabase integration.
-   API service functions.
-   Backend architecture.
-   Error-handling patterns.
-   Responsive layouts.

Locate the actual paths in the repository. Do not assume that every
listed path exists.

Relevant areas may include:

``` text
frontend/src/
frontend/src/app/
frontend/src/components/
frontend/src/store/
frontend/src/styles/
backend/
Requirements/
```

## 2. Read the Admin Portal specification

Read this file completely before doing anything else:

``` text
Requirements/10_Admin_Portal_Logic.md
```

This specification is the source of truth for:

-   Admin authentication and authorization.
-   Admin API endpoints.
-   Analytics data.
-   Database tables.
-   Session tracking.
-   AI-call logging.
-   Generation-event logging.
-   Scope limitations.

Do not replace the documented functionality with assumptions.

## 3. Determine the current implementation status

Before implementing anything, identify:

-   Which Admin Portal backend endpoints already exist.
-   Which database tables already exist.
-   Whether the admin frontend has already been started.
-   Which components can be reused.
-   Which APIs are functional or missing.
-   Whether the database migration has been applied.
-   Whether the existing authentication system works correctly.

Do not rebuild functionality that already exists.

At the end of this phase, provide a brief implementation-status report.

**Do not modify code until this initial assessment is complete.**

------------------------------------------------------------------------

# Phase 2 --- Design Direction

## Design objective

Create:

> **MimarAI Command Center --- Precision Architecture & Planning
> Intelligence**

The dashboard should communicate:

-   Intelligence.
-   Precision.
-   Technical sophistication.
-   Trust.
-   Data transparency.
-   Professionalism.
-   Operational control.

It should feel like a real product used by the creator of an advanced AI
architecture platform.

## Existing MimarAI brand

The existing MimarAI interface uses:

-   Dark navy backgrounds.
-   Blueprint-inspired visuals.
-   Cyan accents.
-   Orange action elements.
-   Technical typography.
-   Subtle grid patterns.
-   Architectural and developer-tool aesthetics.

Preserve this identity.

However, do not blindly copy the interview screen. The Admin Portal is a
distinct product experience within MimarAI and should have its own
visual hierarchy.

You may evolve the visual language where necessary to make the dashboard
more attractive, refined, and functional.

### Core design rule

Use the existing MimarAI theme as the foundation, but elevate it into a
premium, distinctive Admin Command Center rather than producing a
generic AI-generated dashboard.

Do not sacrifice usability for visual effects.

------------------------------------------------------------------------

# Phase 3 --- UI/UX Requirements

## Overall visual quality

The dashboard must look intentionally designed.

Avoid:

-   Generic AI-generated dashboard layouts.
-   Excessive glowing borders.
-   Random gradients.
-   Unnecessary glassmorphism.
-   Overuse of neon colors.
-   Excessive rounded cards.
-   Repetitive statistic boxes.
-   Huge meaningless headings.
-   Random decorative icons.
-   Unnecessary animations.
-   Stock dashboard templates.
-   Visual clutter.

Use:

-   A strong spacing system.
-   Clear visual hierarchy.
-   Consistent alignment.
-   Professional typography.
-   Meaningful grouping.
-   Carefully designed loading, empty, and error states.
-   Subtle depth.
-   Refined borders.
-   Appropriate contrast.
-   Consistent component sizing.

Every visual element must have a purpose.

## Admin experience

Design a coherent dashboard experience with appropriate navigation and
information hierarchy.

The Admin Portal must provide access to the functionality specified in:

``` text
Requirements/10_Admin_Portal_Logic.md
```

This includes:

-   User statistics.
-   Generation success-rate analytics.
-   Session activity.
-   AI provider usage.
-   Admin access verification.

Do not invent fake analytics to fill empty spaces.

------------------------------------------------------------------------

# Phase 4 --- Data Visualization

Act as an experienced data-visualization designer.

Use charts only when they communicate useful information.

Possible visualizations include:

-   User growth over time.
-   Successful versus failed generations.
-   Session activity.
-   AI provider usage.
-   Stage-wise AI-call distribution.
-   Provider comparison.
-   Activity timelines.

Requirements:

-   Use consistent chart scales.
-   Make tooltips informative.
-   Display loading states.
-   Display meaningful empty states.
-   Handle missing or incomplete data correctly.
-   Make charts responsive.
-   Keep text readable.
-   Avoid unnecessary pie charts.
-   Avoid misleading visualizations.

## Metric accuracy

Respect the maturity distinctions in the specification:

-   User counts are derived from existing authentication data.
-   Generation success rates depend on generation-event instrumentation.
-   Session activity is an approximation based on heartbeats.
-   AI usage represents call counts, not dollar costs, unless real
    pricing configuration exists.

Communicate these limitations clearly through concise tooltips or
labels, for example:

> Session duration is estimated from activity heartbeats.

> AI usage represents provider call frequency. Cost estimation is not
> currently available.

Never invent statistics, costs, or historical data.

------------------------------------------------------------------------

# Phase 5 --- Animations and Interactions

Add subtle, purposeful, professional animations where they improve the
experience.

Recommended interactions:

-   Smooth dashboard entrance.
-   Subtle staggered appearance of major sections.
-   Gentle number transitions when real data loads.
-   Subtle hover elevation on interactive cards.
-   Smooth active-navigation transitions.
-   Elegant sidebar collapse/expand behavior if implemented.
-   Smooth chart rendering.
-   Clean tooltip transitions.
-   Non-disruptive refresh indicators.
-   Preserve existing data while refreshing when appropriate.
-   Smooth route transitions where compatible with the framework.

Avoid:

-   Constant pulsing elements.
-   Distracting moving backgrounds.
-   Excessive glowing effects.
-   Slow transitions that hinder productivity.
-   Animations that interfere with data readability.
-   Animations that compromise accessibility.

Respect:

``` css
prefers-reduced-motion
```

------------------------------------------------------------------------

# Phase 6 --- Remove the "AI-Generated" Look

This is a major priority.

Review every section and ask:

> Would an experienced SaaS product designer intentionally design this
> interface this way?

If not, improve it.

Specific expectations:

-   Use a consistent spacing scale.
-   Use a deliberate type hierarchy.
-   Avoid unnecessary text.
-   Use meaningful, professional microcopy.
-   Ensure every button has a clear purpose.
-   Use meaningful icons.
-   Avoid random decorative elements.
-   Maintain a coherent visual rhythm.
-   Make the dashboard feel like a real operational tool.

The dashboard should be visually impressive because of design quality,
not excessive effects.

------------------------------------------------------------------------

# Phase 7 --- Authentication and Security

Use the existing Supabase authentication system.

Do not create:

-   A separate admin password.
-   A separate admin signup system.
-   A second authentication mechanism.
-   A frontend-only security system.

## Authorization requirements

Admin access must be enforced on the backend through the existing
authentication flow and an email allowlist.

The backend must verify:

1.  The user has a valid authenticated session.
2.  The authenticated user's email exists in `admin_allowlist`.

Unauthorized users must receive `403 Forbidden`.

Every admin API endpoint must enforce admin authorization.

The frontend route guard is not a substitute for backend security.

Do not weaken existing authentication or authorization.

------------------------------------------------------------------------

# Phase 8 --- Backend Implementation

Inspect the existing backend and implement only the functionality
required by the Admin Portal specification.

Requirements:

-   Follow the existing FastAPI architecture.
-   Reuse existing authentication dependencies.
-   Follow existing error-handling conventions.
-   Use proper request validation.
-   Respect ownership and access-control boundaries.
-   Avoid exposing sensitive information.
-   Never log secrets or authentication tokens.
-   Use appropriate database queries.
-   Handle missing data gracefully.
-   Preserve existing API behavior.

Verify or implement only where necessary:

``` text
GET /api/admin/me
GET /api/admin/users
GET /api/admin/success-rate
GET /api/admin/sessions
GET /api/admin/ai-usage
```

Do not fabricate analytics.

If instrumentation is missing:

-   Identify what is missing.
-   Implement it only if it is within the approved scope.
-   Clearly distinguish actual data from estimates.
-   Do not claim accuracy that the underlying data cannot support.

## Database migrations

Do not run migrations against the live Supabase database without
explicit permission.

If new tables are required:

-   Prepare the SQL migration.
-   Validate the SQL locally where possible.
-   Provide the exact SQL for manual execution.
-   Do not invent the administrator's email address.
-   Do not seed an admin account without explicit confirmation.

------------------------------------------------------------------------

# Phase 9 --- Testing and Quality Assurance

Before declaring the implementation complete, verify:

## Frontend

-   Dashboard loading.
-   Unauthorized-user handling.
-   Loading states.
-   Empty states.
-   Error states.
-   Missing-data handling.
-   Responsive layout.
-   Button functionality.
-   Navigation.
-   Animation behavior.
-   Accessibility.
-   No regressions in existing user-facing features.

## Backend

-   Admin authentication.
-   Admin authorization.
-   Rejection of non-admin users.
-   Admin API responses.
-   Input validation.
-   Database error handling.
-   Metric calculations.
-   Existing API regression safety.

## Build verification

Run the appropriate frontend build and backend test commands based on
the actual project setup.

Never claim that tests passed unless they were actually executed and
produced real output.

If a test cannot be run, state:

> NOT VERIFIED --- REQUIRES MANUAL TESTING.

------------------------------------------------------------------------

# Phase 10 --- Development Workflow

Before making changes:

1.  Inspect the repository.
2.  Review the current Git branch.
3.  Create a dedicated V3.10 feature branch if appropriate.
4.  Keep changes logically organized.
5.  Avoid modifying unrelated files.
6.  Preserve the existing interview pipeline.
7.  Do not merge into `main` without explicit approval.

Do not unnecessarily modify:

-   Existing interview logic.
-   Existing user-facing workflows.
-   Existing authentication behavior.
-   Existing database structures.
-   Existing API contracts.

If an out-of-scope change is necessary, explain why before making it.

------------------------------------------------------------------------

# Phase 11 --- Final Quality Standard

Before presenting the implementation, evaluate it honestly:

-   Does the Admin Portal look like a premium, professionally designed
    product rather than a generic dashboard?
-   Does the visual design feel like a natural evolution of MimarAI?
-   Does every displayed metric represent real data?
-   Are limitations communicated clearly?
-   Is the interface attractive without compromising usability?
-   Has existing functionality been preserved?

If the result looks generic, refine it.

------------------------------------------------------------------------

# Required Final Report

When the work is complete, provide a structured report containing:

## 1. Design changes

-   New visual direction.
-   Components created or modified.
-   Typography and color changes.
-   Animation and transition details.
-   Responsive design improvements.

## 2. Frontend implementation

-   Files created.
-   Files modified.
-   Routes added.
-   Components added.
-   API integrations.

## 3. Backend implementation

-   Endpoints added or modified.
-   Authentication changes.
-   Authorization implementation.
-   Database queries.
-   Error-handling changes.

## 4. Database changes

-   Required tables.
-   Exact SQL migrations.
-   Manual setup requirements.

## 5. Testing

-   Tests actually executed.
-   Real test output.
-   Known issues.
-   Untested areas.

## 6. Scope protection

-   Confirmation that existing interview functionality was preserved.
-   Any unrelated changes and their justification.

## 7. Preview

-   Provide the preview URL if one is available.

------------------------------------------------------------------------

# Final Instruction

Do not rush into coding.

Follow this order:

1.  Understand the project.
2.  Inspect the current implementation.
3.  Report what already exists and what is missing.
4.  Design the Admin Portal.
5.  Implement the required functionality.
6.  Test it.
7.  Report only verified results.

Priority order:

``` text
1. Functional correctness
2. Security
3. Data accuracy
4. Professional UI/UX
5. Visual polish
6. Performance
7. Maintainability
```

Build an Admin Portal that feels like a real **MimarAI Command Center**,
not a generic AI-generated dashboard.

**Start with the initial inspection and implementation-status report. Do
not modify code until that report is complete.**
