"use client";

import React, { useState } from 'react';
import { useMimarStore, sleep } from '../../store/mimarStore';

export default function McpScreen() {
  const {
    currentScreen,
    mcpToken,
    rejectedFeatures,
    setMcpToken,
    showToast
  } = useMimarStore();

  const [copiedToken, setCopiedToken] = useState(false);
  const [copiedAgent, setCopiedAgent] = useState(null);
  const [driftRunning, setDriftRunning] = useState(false);
  const [driftReport, setDriftReport] = useState(null);

  const isActive = currentScreen === 'mcp';
  const isAuditRejected = !!rejectedFeatures['f3'];

  const handleCopyToken = () => {
    navigator.clipboard?.writeText(mcpToken).catch(() => {});
    setCopiedToken(true);
    showToast("MCP project token copied to clipboard.");
    setTimeout(() => setCopiedToken(false), 2500);
  };

  const handleRegenerateToken = () => {
    const confirmRegen = window.confirm(
      "Regenerate MCP token? Any existing agent connections using the old token will stop working."
    );
    if (!confirmRegen) return;
    const newToken =
      'mim_live_' +
      Math.random().toString(36).substring(2, 10) +
      Math.random().toString(36).substring(2, 10);
    setMcpToken(newToken);
    showToast("New project token generated (stored securely hashed).");
  };

  const handleCopyAgentConfig = (agent) => {
    let snippet = '';
    if (agent === 'claude') {
      snippet = `// CLAUDE.md\n{\n  "mcpServers": {\n    "mimarai": {\n      "url": "https://mimaraibackend-euj86d7p.b4a.run/mcp",\n      "headers": { "Authorization": "Bearer ${mcpToken}" }\n    }\n  }\n}`;
    } else if (agent === 'cursor') {
      snippet = `// .cursorrules / mcp.json\n{\n  "mcpServers": {\n    "mimarai": {\n      "url": "https://mimaraibackend-euj86d7p.b4a.run/mcp",\n      "token": "${mcpToken}"\n    }\n  }\n}`;
    } else {
      snippet = `// AGENTS.md\n{\n  "tools": ["get_implementation_plan", "check_drift"],\n  "server": "https://mimaraibackend-euj86d7p.b4a.run/mcp",\n  "auth_token": "${mcpToken}"\n}`;
    }
    navigator.clipboard?.writeText(snippet).catch(() => {});
    setCopiedAgent(agent);
    showToast(`Config snippet for ${agent.toUpperCase()} copied with project token.`);
    setTimeout(() => setCopiedAgent(null), 2200);
  };

  const handleDownloadPlan = () => {
    showToast("Generating standalone machine-readable Implementation Plan JSON package…");
    const structExport = {
      "src/routes/loan.py": ["Loan & Interest Management"],
      "src/models/loan.py": ["Loan & Interest Management"],
      "src/routes/auth.py": ["Role-Based Access Control"],
      "src/models/refresh_token.py": ["Role-Based Access Control"]
    };
    if (!isAuditRejected) {
      structExport["src/models/audit_log.py"] = ["Audit Logging"];
    }
    const schemaTables = isAuditRejected ? ["users", "loans"] : ["users", "loans", "audit_logs"];

    setTimeout(() => {
      const fakeBlob = new Blob(
        [
          JSON.stringify(
            {
              project: "MimarAi — Loan Desk",
              version: "1.0-validated",
              validated_by: ["Gemini Flash", "Groq Llama 3.3"],
              structure: structExport,
              schema: {
                tables: schemaTables,
                services: ["API Gateway", "Auth Service", "Loan Service"]
              }
            },
            null,
            2
          )
        ],
        { type: 'application/json' }
      );
      const url = URL.createObjectURL(fakeBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'MimarAi_Implementation_Plan_Validated.json';
      a.click();
      URL.revokeObjectURL(url);
      showToast("Implementation Plan downloaded successfully.");
    }, 600);
  };

  const handleRunDrift = async () => {
    setDriftRunning(true);
    showToast("Scanning codebase against structure map & schema JSON (Gemini + Groq cross-check)…");
    await sleep(1400);
    setDriftReport(true);
    setDriftRunning(false);
    showToast("Drift Report generated: 2 Implemented, 1 Adjusted, 1 Not Started.");
  };

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''}`} id="screen-mcp">
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 07 · Live Agent Interface</div>
            <h2>Model Context Protocol (MCP) Server</h2>
            <div className="sub">LIVE PASSIVE SERVER · HOSTED ON RENDER · PER-PROJECT SCOPED</div>
          </div>
          <div className="toolbar-actions">
            <button
              type="button"
              className="btn btn-outline"
              id="pdfDownloadBtn"
              onClick={handleDownloadPlan}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download Plan (JSON/PDF)
            </button>
          </div>
        </div>

        <div className="doc-scroll-area">
          <div className="mcp-body">
            {/* Live Status */}
            <div className="mcp-status-bar">
              <div className="mcp-status-indicator">
                <div className="mcp-dot connected"></div>
                <span>MCP SERVER: ACTIVE &amp; READY</span>
              </div>
              <div className="mcp-status-url">
                ENDPOINT: <code>https://mimaraibackend-euj86d7p.b4a.run/mcp</code>
              </div>
            </div>

            {/* 1. Per-Project Authentication */}
            <div className="mcp-section">
              <div className="mcp-section-head">
                <div className="mcp-section-title">1. Per-Project Authentication Token</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
                  SCOPED TO PROJECT: LOAN-DESK-01
                </span>
              </div>
              <div className="mcp-section-body">
                <div className="token-row">
                  <span className="token-value" id="tokenValue">
                    {copiedToken ? mcpToken : mcpToken.slice(0, 8) + '••••••••••••••••'}
                  </span>
                  <div className="token-actions">
                    <button
                      type="button"
                      className="token-btn copy-btn"
                      id="copyTokenBtn"
                      onClick={handleCopyToken}
                    >
                      {copiedToken ? '✓ COPIED' : 'Copy Token'}
                    </button>
                    <button
                      type="button"
                      className="token-btn regen-btn"
                      id="regenTokenBtn"
                      onClick={handleRegenerateToken}
                    >
                      ↻ Regenerate
                    </button>
                  </div>
                </div>
                <div className="token-note">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="16" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12.01" y2="8" />
                  </svg>
                  <span>
                    Tokens are stored hashed in Supabase. Never shared across projects. Rate limit: 20–30 req/hour per token.
                  </span>
                </div>

                {/* Rate limit meter */}
                <div className="rate-bar-wrap">
                  <div className="rate-bar">
                    <div className="rate-bar-fill" style={{ width: '14%' }}></div>
                  </div>
                  <span className="rate-label">4 / 30 req used this hour</span>
                </div>
              </div>
            </div>

            {/* 2. Connect Your Coding Agent */}
            <div className="mcp-section">
              <div className="mcp-section-head">
                <div className="mcp-section-title">2. Connect Your Agent</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
                  AUTO-CONFIG SNIPPETS
                </span>
              </div>
              <div className="mcp-section-body">
                <div className="agent-grid">
                  {/* Claude Code */}
                  <div className="agent-card">
                    <div className="agent-card-head">
                      <span className="agent-name">Claude Code</span>
                      <button
                        type="button"
                        className={`agent-copy-btn ${copiedAgent === 'claude' ? 'copied' : ''}`}
                        data-agent="claude"
                        onClick={() => handleCopyAgentConfig('claude')}
                      >
                        {copiedAgent === 'claude' ? '✓ COPIED' : 'Copy Config'}
                      </button>
                    </div>
                    <div className="agent-code">
                      <span className="code-comment">// CLAUDE.md</span>
                      {`\n{\n  `}
                      <span className="code-key">"mcpServers"</span>
                      {`: {\n    `}
                      <span className="code-key">"mimarai"</span>
                      {`: {\n      `}
                      <span className="code-key">"url"</span>
                      {`: `}
                      <span className="code-val">"https://mimarai-backend.onrender.com/mcp"</span>
                      {`,\n      `}
                      <span className="code-key">"headers"</span>
                      {`: { `}
                      <span className="code-key">"Authorization"</span>
                      {`: `}
                      <span className="code-val">"Bearer mim_live_..."</span>
                      {` }\n    }\n  }\n}`}
                    </div>
                  </div>

                  {/* Cursor */}
                  <div className="agent-card">
                    <div className="agent-card-head">
                      <span className="agent-name">Cursor</span>
                      <button
                        type="button"
                        className={`agent-copy-btn ${copiedAgent === 'cursor' ? 'copied' : ''}`}
                        data-agent="cursor"
                        onClick={() => handleCopyAgentConfig('cursor')}
                      >
                        {copiedAgent === 'cursor' ? '✓ COPIED' : 'Copy Config'}
                      </button>
                    </div>
                    <div className="agent-code">
                      <span className="code-comment">// .cursorrules / mcp.json</span>
                      {`\n{\n  `}
                      <span className="code-key">"mcpServers"</span>
                      {`: {\n    `}
                      <span className="code-key">"mimarai"</span>
                      {`: {\n      `}
                      <span className="code-key">"url"</span>
                      {`: `}
                      <span className="code-val">"https://mimarai-backend.onrender.com/mcp"</span>
                      {`,\n      `}
                      <span className="code-key">"token"</span>
                      {`: `}
                      <span className="code-val">"mim_live_..."</span>
                      {`\n    }\n  }\n}`}
                    </div>
                  </div>

                  {/* Antigravity */}
                  <div className="agent-card">
                    <div className="agent-card-head">
                      <span className="agent-name">Antigravity</span>
                      <button
                        type="button"
                        className={`agent-copy-btn ${copiedAgent === 'antigravity' ? 'copied' : ''}`}
                        data-agent="antigravity"
                        onClick={() => handleCopyAgentConfig('antigravity')}
                      >
                        {copiedAgent === 'antigravity' ? '✓ COPIED' : 'Copy Config'}
                      </button>
                    </div>
                    <div className="agent-code">
                      <span className="code-comment">// AGENTS.md</span>
                      {`\n{\n  `}
                      <span className="code-key">"tools"</span>
                      {`: [`}
                      <span className="code-val">"get_plan"</span>
                      {`, `}
                      <span className="code-val">"drift"</span>
                      {`],\n  `}
                      <span className="code-key">"server"</span>
                      {`: `}
                      <span className="code-val">"https://mimarai.../mcp"</span>
                      {`,\n  `}
                      <span className="code-key">"auth_token"</span>
                      {`: `}
                      <span className="code-val">"mim_live_..."</span>
                      {`\n}`}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* 3. Exposed MCP Tools */}
            <div className="mcp-section">
              <div className="mcp-section-head">
                <div className="mcp-section-title">3. Exposed MCP Tools</div>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-muted)' }}>
                  PASSIVE TOOL INTERFACES
                </span>
              </div>
              <div className="mcp-section-body">
                <div className="tool-block">
                  <div className="tool-sig">
                    <span className="fn-name">get_implementation_plan</span>(
                    <span className="fn-param">project_id</span>: string)
                  </div>
                  <div className="tool-desc">
                    Returns the accepted, locked implementation plan containing verified features, constraints, structure JSON map, and schema/microservices architecture.
                  </div>
                  <div className="tool-returns">
                    <span className="tool-returns-label">RETURNS:</span> JSON (features[], structure{}, schema{}, services[])
                  </div>
                </div>

                <div className="tool-block">
                  <div className="tool-sig">
                    <span className="fn-name">check_drift</span>(
                    <span className="fn-param">project_id</span>: string)
                  </div>
                  <div className="tool-desc">
                    Executes the dual-model drift verification against your codebase, comparing actual files, functions, and DB schemas against the accepted blueprint.
                  </div>
                  <div className="tool-returns">
                    <span className="tool-returns-label">RETURNS:</span> DriftReport &#123; status: Implemented | Adjusted | Missing | Not Started &#125;
                  </div>
                </div>
              </div>
            </div>

            {/* 4. Post-Implementation Drift Check */}
            <div className="mcp-section">
              <div className="mcp-section-head">
                <div className="mcp-section-title">4. Post-Implementation Drift-Check</div>
                <button
                  type="button"
                  className="btn btn-primary"
                  id="runDriftBtn"
                  style={{ fontSize: '10.5px', padding: '6px 12px' }}
                  disabled={driftRunning}
                  onClick={handleRunDrift}
                >
                  {driftRunning ? 'Running Dual-Model Drift Check…' : driftReport ? 'Re-Run Drift Check' : 'Run Drift Check Now'}
                </button>
              </div>
              <div className="mcp-section-body">
                <p style={{ margin: '0 0 12px', fontSize: '12.5px', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                  Verify that your coding agent implemented the plan accurately without hallucinating diverging architecture or skipping constraints. Uses dual-model Gemini + Groq cross-check.
                </p>
                <div className="drift-report" id="driftReport">
                  {!driftReport ? (
                    <div className="empty-state" style={{ padding: '18px 0' }}>
                      No drift check executed for this session yet. Click 'Run Drift Check Now' to scan codebase.
                    </div>
                  ) : (
                    <>
                      <div className="drift-item">
                        <span className="drift-badge implemented">✅ Implemented</span>
                        <div className="drift-main">
                          <div className="drift-name">Role-Based Access Control</div>
                          <div className="drift-desc">src/routes/auth.py &amp; models/refresh_token.py verified. JWT scoping enforced.</div>
                        </div>
                      </div>
                      <div className="drift-item">
                        <span className="drift-badge implemented">✅ Implemented</span>
                        <div className="drift-main">
                          <div className="drift-name">Database Schema Conformance</div>
                          <div className="drift-desc">3 tables (users, loans, audit_logs) match accepted column types and PK/FK constraints.</div>
                        </div>
                      </div>
                      <div className="drift-item">
                        <span className="drift-badge adjusted">⚠ Adjusted — Please Review</span>
                        <div className="drift-main">
                          <div className="drift-name">Loan &amp; Interest Management</div>
                          <div className="drift-desc">Interest calculation interval set to hourly instead of nightly cron. Requires approval.</div>
                        </div>
                      </div>
                      <div className="drift-item">
                        <span className="drift-badge not-started">⚪ Not Started</span>
                        <div className="drift-main">
                          <div className="drift-name">Automated Audit Log Rotation</div>
                          <div className="drift-desc">No code found in codebase yet — scheduled for subsequent agent sprint.</div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
