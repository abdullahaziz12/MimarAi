// MimarAi — Mock Project Specifications & Architectural Models Data

export const SAMPLE_PROJECTS = [
  {
    id: "proj-01",
    name: "Collaborative Realtime Canvas & Chat",
    tagline: "Multi-user whiteboard with live chat and state sync",
    category: "Fullstack / Realtime",
    status: "REQUIRES_FIX",
    conflictsFound: 2,
    taxonomyScore: "85%",
    description: "A final year capstone app allowing students to draw on a synchronized vector canvas while exchanging direct voice and text messages."
  },
  {
    id: "proj-02",
    name: "Autonomous Code Execution Sandbox",
    tagline: "Isolated Docker container runner with live telemetry",
    category: "DevOps / Microservices",
    status: "VALIDATED",
    conflictsFound: 0,
    taxonomyScore: "100%",
    description: "Multi-tenant code runner executing untrusted Python/C++ snippets with CPU isolation and websocket log streaming."
  },
  {
    id: "proj-03",
    name: "Distributed E-Commerce API Gateway",
    tagline: "Event-driven micro-commerce with Postgres & Redis",
    category: "Backend / Distributed Systems",
    status: "VALIDATED",
    conflictsFound: 0,
    taxonomyScore: "94%",
    description: "High-throughput store backend handling Stripe webhooks, inventory locks, and JWT session rotation."
  }
];

export const INTERVIEW_TAXONOMY = [
  { id: "tax-auth", title: "Auth & Access", status: "COMPLETE", count: "3/3 fields" },
  { id: "tax-data", title: "Data Layer", status: "COMPLETE", count: "4/4 fields" },
  { id: "tax-sync", title: "Real-time Sync", status: "CONFLICT", count: "Flagged" },
  { id: "tax-host", title: "Deployment Target", status: "IN_PROGRESS", count: "2/3 fields" },
  { id: "tax-api", title: "API Protocol", status: "PENDING", count: "0/2 fields" },
  { id: "tax-scale", title: "Scaling & SLA", status: "PENDING", count: "0/2 fields" }
];

export const INTERVIEW_STEPS = [
  {
    stepIndex: 1,
    category: "Data Layer & Persistence",
    question: "What is your primary data persistence model and expected write velocity?",
    options: [
      { id: "rel-pg", label: "PostgreSQL (Relational, Strict ACID, SQL Join heavy)" },
      { id: "nosql-mongo", label: "MongoDB (Document based, schema-less, rapid prototyping)" },
      { id: "ephemeral-redis", label: "In-Memory Redis only (Fastest latency, volatile)" }
    ],
    selectedOption: "rel-pg",
    rationale: "PostgreSQL selected for relational constraints and ACID compliance on canvas user objects."
  },
  {
    stepIndex: 2,
    category: "Real-time Synchronization",
    question: "How should state changes (cursor movements, chat messages) propagate between active clients?",
    options: [
      { id: "ws-stateful", label: "Long-lived WebSockets / Socket.io (Stateful connection server)" },
      { id: "sse-one-way", label: "Server-Sent Events (SSE) (One-way stream + HTTP POST)" },
      { id: "poll-rest", label: "Standard REST HTTP Polling (Every 2000ms)" }
    ],
    selectedOption: "ws-stateful",
    rationale: "Stateful WebSockets selected for <50ms cursor coordinate synchronization."
  },
  {
    stepIndex: 3,
    category: "Deployment & Infrastructure",
    question: "What is your target hosting platform for your zero-budget student capstone project?",
    options: [
      { id: "vercel-free", label: "Vercel Free Tier (Serverless Edge / Lambdas with 10s max duration)" },
      { id: "fly-io", label: "Fly.io / Render (Persistent micro-VM background container)" },
      { id: "aws-ec2", label: "Dedicated AWS EC2 t3.micro (Manual Nginx reverse proxy)" }
    ],
    selectedOption: "vercel-free",
    rationale: "Vercel Free Tier selected for zero cost and automated GitHub CI/CD deployments."
  }
];

export const CAUGHT_CONFLICTS = [
  {
    id: "CRIT-CONF-042",
    ruleRef: "RULE-ARCH-INFRA-09",
    severity: "CRITICAL CONTRADICTION",
    title: "Stateful WebSocket Real-time Sync vs Serverless Free-Tier Hosting",
    requirementA: {
      reqId: "REQ-SYNC-01",
      name: "Long-Lived WebSockets",
      details: "Persistent TCP connection handling active drawing sessions and cursor coordinates."
    },
    requirementB: {
      reqId: "REQ-HOST-03",
      name: "Vercel Free Serverless Hosting",
      details: "Stateless Lambda functions terminated after 10-30 seconds of execution."
    },
    rootCauseAnalysis: "Vercel Serverless Functions do not support persistent stateful TCP sockets without an external WebSocket gateway service (e.g. Supabase Realtime, Pusher, or Socket.io on a VM). Deploying native Socket.io on Vercel Lambdas will result in immediate socket disconnections and broken canvas sync.",
    architecturalImpact: [
      "Clients will repeatedly reconnect every 10 seconds causing high CPU load.",
      "In-memory drawing state will be lost whenever Vercel cold-starts a new container instance.",
      "Students will waste 20+ hours debugging websocket handshake timeouts in Cursor/Claude."
    ],
    suggestedFixes: [
      {
        id: "fix-flyio",
        name: "Migrate Hosting to Render / Fly.io (Recommended)",
        description: "Keep stateful WebSocket server architecture. Deploy Node.js server as a 24/7 container on Fly.io free tier.",
        changes: ["REQ-HOST-03 updated to Fly.io Docker container target", "Added Redis adapter for multi-instance pub/sub"]
      },
      {
        id: "fix-pusher",
        name: "Switch to Managed WebSocket Gateway (Pusher / Supabase)",
        description: "Keep Vercel Serverless hosting. Offload stateful websocket connections to Pusher Free Tier or Supabase Realtime.",
        changes: ["REQ-SYNC-01 updated to Pusher Managed WebSocket API", "REQ-HOST-03 retained as Vercel Serverless"]
      }
    ]
  }
];

export const STRUCTURED_SPEC = {
  header: {
    docId: "SPEC-MIMAR-2026-089A",
    title: "Collaborative Realtime Canvas Specification",
    version: "1.0.4-VALIDATED",
    architect: "MimarAi Automated Rules Engine v2.4",
    targetStack: "React 19 + Node.js + Socket.io + PostgreSQL + Redis"
  },
  sections: [
    {
      sectionId: "SEC-1.0",
      title: "1.0 System Architecture Overview",
      content: "The system is structured as a decoupled client-server architecture utilizing an express Node.js WebSocket engine for binary vector updates, paired with PostgreSQL for durable project persistence and Redis for ephemeral room session caching.",
      items: []
    },
    {
      sectionId: "SEC-2.0",
      title: "2.0 Functional Requirements (Numbering Invariants)",
      items: [
        {
          id: "REQ-AUTH-001",
          priority: "MUST HAVE",
          description: "System shall issue HMAC-SHA256 Signed JWT session tokens valid for 24 hours.",
          compliance: "PASSED (Validated)"
        },
        {
          id: "REQ-SYNC-002",
          priority: "MUST HAVE",
          description: "WebSocket engine shall broadcast cursor position vector [x, y, color] at 60Hz delta rate.",
          compliance: "PASSED (Resolved via Fly.io container target)"
        },
        {
          id: "REQ-DATA-003",
          priority: "MUST HAVE",
          description: "PostgreSQL instance shall record drawing history snapshots every 50 vector mutations.",
          compliance: "PASSED (Validated)"
        },
        {
          id: "REQ-PERF-004",
          priority: "SHOULD HAVE",
          description: "Initial canvas hydration payload size shall not exceed 2.5MB over compressed TLS 1.3.",
          compliance: "PASSED (Validated)"
        }
      ]
    },
    {
      sectionId: "SEC-3.0",
      title: "3.0 Data Models & Key Schema Standard",
      codeSnippet: `// Schema Invariant generated for AI Agent ingestion
interface CanvasRoom {
  room_id: string; // UUIDv4
  owner_id: string; // Ref User.id
  title: string; // max 64 chars
  max_participants: number; // default 10
  is_locked: boolean;
  created_at: string; // ISO 8601 UTC
}

interface VectorStroke {
  stroke_id: string;
  room_id: string;
  points: Array<{ x: number; y: number }>;
  color_hex: string;
  stroke_width: number;
  author_id: string;
}`
    },
    {
      sectionId: "SEC-4.0",
      title: "4.0 API Endpoints & Transport Protocols",
      apiEndpoints: [
        { method: "POST", path: "/api/v1/rooms", desc: "Create new canvas session", auth: "Bearer JWT" },
        { method: "GET", path: "/api/v1/rooms/:id", desc: "Fetch initial room state & vector history", auth: "Bearer JWT" },
        { method: "WS", path: "wss://sync.mimar.app/v1/rooms/:id/stream", desc: "Binary WebSocket delta stream", auth: "Query Token" }
      ]
    }
  ]
};

export const ER_DIAGRAM_MODEL = {
  entities: [
    {
      id: "ent-users",
      name: "users",
      type: "ENTITY",
      coords: { x: 50, y: 50 },
      fields: [
        { name: "id", type: "UUID", pk: true },
        { name: "email", type: "VARCHAR(255)", unique: true },
        { name: "password_hash", type: "VARCHAR(60)" },
        { name: "created_at", type: "TIMESTAMPTZ" }
      ]
    },
    {
      id: "ent-canvas_rooms",
      name: "canvas_rooms",
      type: "ENTITY",
      coords: { x: 420, y: 50 },
      fields: [
        { name: "id", type: "UUID", pk: true },
        { name: "owner_id", type: "UUID", fk: true, ref: "users.id" },
        { name: "title", type: "VARCHAR(128)" },
        { name: "is_archived", type: "BOOLEAN" }
      ]
    },
    {
      id: "ent-strokes",
      name: "vector_strokes",
      type: "ENTITY",
      coords: { x: 420, y: 320 },
      fields: [
        { name: "id", type: "UUID", pk: true },
        { name: "room_id", type: "UUID", fk: true, ref: "canvas_rooms.id" },
        { name: "author_id", type: "UUID", fk: true, ref: "users.id" },
        { name: "points_json", type: "JSONB" },
        { name: "sequence_num", type: "BIGINT" }
      ]
    }
  ],
  relationships: [
    { from: "ent-users", to: "ent-canvas_rooms", label: "1 : N (owns)", type: "ONE_TO_MANY" },
    { from: "ent-canvas_rooms", to: "ent-strokes", label: "1 : N (contains)", type: "ONE_TO_MANY" },
    { from: "ent-users", to: "ent-strokes", label: "1 : N (authors)", type: "ONE_TO_MANY" }
  ]
};

export const ARCHITECTURE_DIAGRAM_MODEL = {
  nodes: [
    { id: "node-client", label: "React 19 SPA (Client)", sub: "Browser Canvas Engine", category: "FRONTEND", x: 60, y: 160 },
    { id: "node-proxy", label: "Nginx Gateway", sub: "TLS Termination & Proxy", category: "GATEWAY", x: 300, y: 160 },
    { id: "node-ws", label: "Node.js WS Service", sub: "Socket.io Stateful Cluster", category: "SERVICE", x: 560, y: 80 },
    { id: "node-rest", label: "Express REST API", sub: "Auth & Spec Endpoints", category: "SERVICE", x: 560, y: 240 },
    { id: "node-redis", label: "Redis 7 Cluster", sub: "Room Pub/Sub & Caching", category: "CACHE", x: 840, y: 80 },
    { id: "node-pg", label: "PostgreSQL 16", sub: "Durable Vector Storage", category: "DATABASE", x: 840, y: 240 }
  ],
  connections: [
    { from: "node-client", to: "node-proxy", label: "WSS / HTTPS" },
    { from: "node-proxy", to: "node-ws", label: "/ws/v1 (TCP)" },
    { from: "node-proxy", to: "node-rest", label: "/api/v1 (HTTP)" },
    { from: "node-ws", to: "node-redis", label: "Pub/Sub Sync" },
    { from: "node-rest", to: "node-pg", label: "pg-pool SQL" }
  ]
};

export const MCP_AGENT_CONFIG = {
  protocolVersion: "2024-11-05",
  serverName: "MimarAi Technical Spec Server",
  endpointUri: "mcp://localhost:8080/v1/mimar-spec",
  bearerToken: "mmr_live_9f82a17b0c9342ef8910a",
  status: "ACTIVE_CONNECTED",
  activeAgent: "Cursor AI (VS Code Extension) & Claude Code CLI",
  capabilities: [
    "tools/list_requirements",
    "tools/get_er_schema",
    "tools/validate_code_against_spec",
    "prompts/get_architectural_rules"
  ],
  jsonSchemaPreview: `{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MimarAiSpecContext",
  "type": "object",
  "required": ["docId", "invariants", "schemaModels"],
  "properties": {
    "docId": { "type": "string", "example": "SPEC-MIMAR-2026-089A" },
    "resolvedConflicts": { "type": "array", "items": { "type": "string" } },
    "stack": {
      "type": "object",
      "properties": {
        "db": "PostgreSQL 16",
        "realtime": "Fly.io Node.js WebSockets",
        "cache": "Redis 7"
      }
    }
  }
}`,
  simulatedLogs: [
    { timestamp: "02:14:02.102", agent: "Cursor Agent", action: "CALL tools/get_er_schema", status: "200 OK (0.4ms)", detail: "Fetched users, canvas_rooms, vector_strokes tables" },
    { timestamp: "02:14:05.419", agent: "Claude Code CLI", action: "VERIFY_CODE src/api/socket.js", status: "PASSED", detail: "Checked against RULE-ARCH-INFRA-09: No serverless cold-start violations found." },
    { timestamp: "02:14:08.890", agent: "Cursor Agent", action: "FETCH prompts/get_architectural_rules", status: "200 OK (0.2ms)", detail: "Injected 4 MUST_HAVE requirement constraints into system prompt context." }
  ]
};
