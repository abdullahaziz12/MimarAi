# Multi-Version Live Server Test Report
**Target Server URL:** `https://mimaraibackend-wp3pzqzb.b4a.run`
**Execution Timestamp:** `2026-09-17T18:10:01.170593+00:00`
**Test Mode:** Real Live HTTP Requests (Zero Mocks)

---
## 1. Backend Preview Liveness Check
- **Endpoint:** `GET https://mimaraibackend-wp3pzqzb.b4a.run/health`
- **HTTP Status:** `200`
- **Response:** `{"status":"ok"}`
- **Result:** [PASS] Backend is live and responsive.

## 2. Version 3.3 — Clarifying Questions Live Verification
### Test 2.1: Generate Clarifying Questions
- **Endpoint:** `POST /api/projects/b668e3df-2130-4a1d-a41b-603b554c6316/clarifying-questions`
- **HTTP Status:** `200`
```json
{
  "status": "ok",
  "density_flag": "full",
  "questions": [
    {
      "id": "976537c0-39c8-4576-8661-80355837f87e",
      "question": "Should the inspection workflow enforce a mandatory photo attachment for each checklist item, and if so, must the photo be timestamped and geotagged to verify location?"
    },
    {
      "id": "a987ebdb-21ae-4a6e-a7d9-0fb53ea95e1f",
      "question": "When an inspection item fails, does the system need to automatically generate a remediation task with assigned contractor, deadline, and a follow\u2011up re\u2011inspection request linked to the original photo evidence?"
    },
    {
      "id": "23a7db95-073a-4f94-9259-2d371757420d",
      "question": "Will the platform support multi\u2011party electronic sign\u2011off (e.g., inspector, listing agent, property owner) where each signature requires a final photo of the signed document, and should the signatures be stored with versioned audit trails?"
    }
  ]
}
```
### Test 2.2: Submit Clarifying Answers
- **Endpoint:** `POST /api/projects/b668e3df-2130-4a1d-a41b-603b554c6316/clarifying-questions/answer`
- **HTTP Status:** `200`
```json
{
  "status": "ok",
  "message": "Clarifying answers saved successfully.",
  "updated_count": 1
}
```
### Test 2.3: Retrieve Persisted Clarifying Questions
- **Endpoint:** `GET /api/projects/b668e3df-2130-4a1d-a41b-603b554c6316/clarifying-questions`
- **HTTP Status:** `200`
```json
{
  "questions": [
    {
      "id": "976537c0-39c8-4576-8661-80355837f87e",
      "project_id": "b668e3df-2130-4a1d-a41b-603b554c6316",
      "question": "Should the inspection workflow enforce a mandatory photo attachment for each checklist item, and if so, must the photo be timestamped and geotagged to verify location?",
      "answer": "Inspectors create checklist items, clients view completed PDF reports.",
      "round": 1,
      "created_at": "2026-09-17T18:10:11.419649+00:00"
    },
    {
      "id": "a987ebdb-21ae-4a6e-a7d9-0fb53ea95e1f",
      "project_id": "b668e3df-2130-4a1d-a41b-603b554c6316",
      "question": "When an inspection item fails, does the system need to automatically generate a remediation task with assigned contractor, deadline, and a follow\u2011up re\u2011inspection request linked to the original photo evidence?",
      "answer": null,
      "round": 1,
      "created_at": "2026-09-17T18:10:12.113152+00:00"
    },
    {
      "id": "23a7db95-073a-4f94-9259-2d371757420d",
      "project_id": "b668e3df-2130-4a1d-a41b-603b554c6316",
      "question": "Will the platform support multi\u2011party electronic sign\u2011off (e.g., inspector, listing agent, property owner) where each signature requires a final photo of the signed document, and should the signatures be stored with versioned audit trails?",
      "answer": null,
      "round": 1,
      "created_at": "2026-09-17T18:10:12.812855+00:00"
    }
  ]
}
```
- **Result:** [PASS] V3.3 Clarifying Questions fully operational on live server.

## 3. Version 3.4 & 3.5 — Persona & NFR Capture Live Verification
### Test 3.1: Submit User Personas (V3.4)
- **Endpoint:** `POST /api/projects/d6ae8d47-096f-4ca2-93bb-6c76ba257668/personas`
- **HTTP Status:** `200`
```json
{
  "status": "ok",
  "message": "Persona details saved successfully.",
  "personas": {
    "answer": "Principal investigators monitor trial protocols, patients log daily dosage, clinical coordinators track adherence.",
    "captured_at": "2026-09-17T18:10:24.401132+00:00"
  }
}
```
### Test 3.2: Submit Non-Functional Requirements (V3.5)
- **Endpoint:** `POST /api/projects/d6ae8d47-096f-4ca2-93bb-6c76ba257668/nfrs`
- **HTTP Status:** `200`
```json
{
  "status": "ok",
  "message": "NFR details saved successfully.",
  "nfrs": {
    "scale": "thousands_plus",
    "data_sensitivity": "sensitive",
    "availability": "mission_critical",
    "captured_at": "2026-09-17T18:10:26.311696+00:00"
  }
}
```
### Test 3.3: Fetch Persisted Persona & NFR Records
- Persona Status: `200`, Data: `{"personas": {"answer": "Principal investigators monitor trial protocols, patients log daily dosage, clinical coordinators track adherence.", "captured_at": "2026-09-17T18:10:24.401132+00:00"}}`
- NFR Status: `200`, Data: `{"nfrs": {"scale": "thousands_plus", "captured_at": "2026-09-17T18:10:26.311696+00:00", "availability": "mission_critical", "data_sensitivity": "sensitive"}}`
- **Result:** [PASS] V3.4 Persona & V3.5 NFR endpoints fully operational on live server.

## 4. Version 3.8 — Lightweight Confirm Draft Live Verification
### Test 4.1: Generate Lightweight Draft Attempt 1
- **Endpoint:** `POST /api/projects/853c831a-6d77-4d36-9bc8-f6d41c162a57/lightweight-draft`
- **HTTP Status:** `200`
```json
{
  "status": "ok",
  "draft_features": [
    "Member portal for sign\u2011up, subscription plans, and profile management",
    "Trainer calendar with availability settings and client booking capabilities",
    "Automated recurring payment processing and invoicing for memberships and sessions",
    "Class schedule creation, enrollment, and capacity tracking",
    "Real\u2011time notifications (email/SMS) for bookings, cancellations, and payment reminders",
    "Dashboard analytics for attendance, revenue, and trainer utilization"
  ],
  "attempt": 1
}
```
### Test 4.2: Reject Attempt 1 with Correction
- **Endpoint:** `POST /api/projects/853c831a-6d77-4d36-9bc8-f6d41c162a57/lightweight-draft/respond`
- **HTTP Status:** `200`
```json
{
  "status": "retry",
  "attempt": 1,
  "proceed_to_generation": false,
  "lightweight_draft_flagged": false
}
```
### Test 4.3: Generate Lightweight Draft Attempt 2 (Folded Correction)
- **Endpoint:** `POST /api/projects/853c831a-6d77-4d36-9bc8-f6d41c162a57/lightweight-draft`
- **HTTP Status:** `200`
```json
{
  "status": "ok",
  "draft_features": [
    "Member subscription management with tiered plans and automated renewals",
    "Trainer scheduling and booking system with calendar integration",
    "QR code door access control for members and staff, linked to active subscriptions",
    "Secure payment processing, invoicing, and refund handling",
    "Reporting and analytics dashboard for usage, revenue, and trainer performance"
  ],
  "attempt": 2
}
```
### Test 4.4: Confirm Attempt 2
- **Endpoint:** `POST /api/projects/853c831a-6d77-4d36-9bc8-f6d41c162a57/lightweight-draft/respond`
- **HTTP Status:** `200`
```json
{
  "status": "confirmed",
  "attempt": 2,
  "proceed_to_generation": true,
  "lightweight_draft_flagged": false
}
```
### Test 4.5: 2-Attempt Cap Reached (Proceeds with Flagged: True)
- **Endpoint:** `POST /api/projects/1c679d5f-b29b-4eb4-9156-632507ac4569/lightweight-draft/respond`
- **HTTP Status:** `200`
```json
{
  "status": "proceeded_after_cap",
  "attempt": 2,
  "proceed_to_generation": true,
  "lightweight_draft_flagged": true
}
```
### Test 4.6: Authoritative DB Record Query for Cap Exhaustion
- **Endpoint:** `GET /api/projects/1c679d5f-b29b-4eb4-9156-632507ac4569/lightweight-draft`
- **HTTP Status:** `200`
```json
{
  "lightweight_draft": {
    "attempts": [
      {
        "attempt": 1,
        "created_at": "2026-09-17T18:10:57.355316+00:00",
        "user_response": "rejected",
        "draft_features": [
          "Real-time inventory tracking with barcode/RFID scanning support",
          "Order management system for creating, assigning, and monitoring pick/pack/shipping tasks",
          "Shipment scheduling and carrier integration for inbound and outbound logistics",
          "Role-based access control for warehouse staff, managers, and external partners",
          "Analytics dashboard with reports on stock levels, order fulfillment rates, and operational efficiency"
        ],
        "correction_text": "Fix A"
      },
      {
        "attempt": 2,
        "created_at": "2026-09-17T18:11:02.562196+00:00",
        "user_response": "rejected",
        "draft_features": [
          "Real-time inventory tracking across multiple warehouse locations",
          "Order management workflow from receipt to picking, packing, and shipping",
          "Shipment and carrier integration for tracking deliveries and generating labels",
          "Dashboard and reporting tools for stock levels, order status, and performance metrics",
          "User role management with permissions for staff, managers, and external partners"
        ],
        "correction_text": "Fix B"
      }
    ],
    "final_status": "proceeded_after_cap",
    "lightweight_draft_flagged": true
  }
}
```
- **Result:** [PASS] V3.8 Lightweight Confirm Draft fully verified on live server.

---
## Summary Table of Live Server Verification
| Version | Component | Live Endpoints Tested | Result |
|---|---|---|---|
| **V3.3** | Clarifying Questions | `POST /clarifying-questions`, `POST /answer`, `GET /clarifying-questions` | **PASS** |
| **V3.4 & V3.5** | Personas & NFRs | `POST /personas`, `POST /nfrs`, `GET /personas`, `GET /nfrs` | **PASS** |
| **V3.8** | Lightweight Draft | `POST /lightweight-draft`, `POST /respond`, `GET /lightweight-draft` | **PASS** |
