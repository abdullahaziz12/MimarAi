"use client";

import React, { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../context/AuthContext";
import HeaderAvatar from "../components/HeaderAvatar";
import { getBackendApiUrl, getBackendUrlStatus } from "../lib/backendConfig";
import "../styles/landing.css";
import "../styles/auth.css";

export default function LandingPage() {
  const router = useRouter();
  const { user, session } = useAuth();

  const [drafts, setDrafts] = React.useState([]);
  const [draftsError, setDraftsError] = React.useState(null);

  useEffect(() => {
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.overflow = "auto";

    if (user) {
      try {
        const backendStatus = getBackendUrlStatus();
        if (!backendStatus.configured) {
          return;
        }

        fetch(getBackendApiUrl("/api/projects/drafts"), {
          headers: session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {},
        })
          .then(async (res) => {
            if (res.ok) {
              const data = await res.json();
              if (data && data.drafts) {
                setDrafts(data.drafts);
                setDraftsError(null);
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              setDraftsError(errData.message || errData.detail || "Unable to load draft projects.");
            }
          })
          .catch((err) => {
            setDraftsError("Unable to connect to service for pending drafts.");
          });
      } catch {
        // Missing env config fails loudly at source; no hidden stale fallback.
      }
    }

    try {
      const msg = sessionStorage.getItem("mimarai_toast");
      if (msg) {
        sessionStorage.removeItem("mimarai_toast");
        const t = document.getElementById("toast");
        if (t) {
          t.textContent = msg;
          t.classList.add("show");
          setTimeout(() => {
            t.classList.remove("show");
          }, 3000);
        }
      }
    } catch (e) {}
  }, [user, session]);

  const handleCtaClick = (e) => {
    if (!user) {
      e.preventDefault();
      router.push("/login?redirectTo=/app");
    }
  };

  return (
    <div className="landing-page-root">
      {/* Top System Status Notice */}
      <div className="top-notice">
        ENGINE SPEC: <b>DUAL-MODEL VERIFICATION (GEMINI FLASH + GROQ)</b> · MCP
        SERVER READY · $0 FREE-TIER ARCHITECTURE
      </div>

      {/* Global Header (Sticky — stays at top when scrolling) */}
      <div className="nav-wrap">
        <header className="landing-nav">
          <a
            href="/"
            className="brand-logo"
            title="MimarAi — The Blueprint Studio"
          >
            <img
              src="/assets/mimarai-logo-hero.png"
              alt="MimarAi — The Blueprint Studio"
              className="brand-logo-img"
            />
          </a>
          <div
            className="nav-links"
            style={{ display: "flex", alignItems: "center", gap: "16px" }}
          >
            <a href="#how-it-works">Workflow</a>
            <a href="#architecture">Architecture</a>
            <a href="#mcp-server">MCP Server</a>
            <a href="/contact">Contact Us</a>
            <Link
              href="/app"
              onClick={handleCtaClick}
              className={`btn btn-primary ${!user ? "btn-disabled" : ""}`}
              title={
                !user
                  ? "Please log in to open the Blueprint Wizard"
                  : "Open Blueprint Wizard"
              }
            >
              Open Blueprint Wizard →
            </Link>
            <HeaderAvatar />
          </div>
        </header>
      </div>

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-left">
          <div className="hero-badge">
            <div className="hero-badge-dot"></div>
            <span>The Architectural Layer for AI Coding</span>
          </div>

          <h1>
            Stop <span>vibe-coding</span> blind. Architect first.
          </h1>

          <p className="hero-lead">
            MimarAi is the planning-and-verification layer that sits in front of
            Claude Code, Cursor, and Antigravity. It interviews you, runs
            independent dual-model AI pipelines to cross-check requirements, and
            locks deterministic specifications before a single line of code is
            written.
          </p>

          <div className="hero-cta-group">
            <Link
              href="/app"
              onClick={handleCtaClick}
              className={`btn btn-primary ${!user ? "btn-disabled" : ""}`}
              style={{ fontSize: "13px", padding: "13px 26px" }}
              title={
                !user
                  ? "Please log in to enter the Blueprint Wizard"
                  : "Enter Blueprint Wizard"
              }
            >
              Enter Blueprint Wizard →
            </Link>
            <a
              href="#how-it-works"
              className="btn btn-outline"
              style={{ fontSize: "13px", padding: "13px 22px" }}
            >
              Explore the 6-Step Flow
            </a>
          </div>

          {/* Phase 9: Draft Loading Error Display */}
          {user && draftsError && (
            <div
              style={{
                marginTop: "20px",
                padding: "12px 14px",
                borderRadius: "8px",
                background: "rgba(239, 68, 68, 0.12)",
                border: "1px solid rgba(239, 68, 68, 0.4)",
                maxWidth: "520px",
                color: "#FCA5A5",
                fontSize: "12px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              }}
            >
              <span style={{ fontSize: "14px" }}>⚠️</span>
              <span>Failed to load pending drafts: {draftsError}</span>
            </div>
          )}

          {/* Phase 9: Continue Draft Projects */}
          {user && !draftsError && drafts.length > 0 && (
            <div
              style={{
                marginTop: "20px",
                padding: "14px",
                borderRadius: "8px",
                background: "rgba(15, 23, 42, 0.8)",
                border: "1px solid rgba(56, 189, 248, 0.25)",
                maxWidth: "520px",
              }}
            >
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: "700",
                  color: "#38BDF8",
                  fontFamily: "var(--font-mono, monospace)",
                  marginBottom: "8px",
                }}
              >
                📁 CONTINUE PENDING DRAFT PROJECT
              </div>
              {drafts.slice(0, 3).map((draft) => (
                <div
                  key={draft.id}
                  onClick={() => {
                    import("../store/mimarStore").then(({ useMimarStore }) => {
                      const store = useMimarStore.getState();
                      store.setProjectId(draft.id);
                      if (draft.idea_text) store.setIdeaText(draft.idea_text);
                      if (draft.step0_state)
                        store.setStep0State(draft.step0_state);
                      if (draft.fixed_inputs)
                        store.setFixedInputs(draft.fixed_inputs);
                      router.push("/app");
                    });
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    background: "rgba(30, 41, 59, 0.6)",
                    border: "1px solid rgba(148, 163, 184, 0.2)",
                    marginBottom: "6px",
                    cursor: "pointer",
                  }}
                >
                  <span
                    style={{
                      fontSize: "12px",
                      color: "#E2E8F0",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: "340px",
                    }}
                  >
                    {draft.idea_text || draft.title || "Untitled Draft Project"}
                  </span>
                  <span
                    style={{
                      fontSize: "11px",
                      color: "#38BDF8",
                      fontWeight: "600",
                    }}
                  >
                    Resume →
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="hero-proof">
            <div className="proof-item">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Dual-Model Cross-Check</span>
            </div>
            <div className="proof-item">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Deterministic CAD Renderer</span>
            </div>
            <div className="proof-item">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Live MCP Server Hub</span>
            </div>
          </div>
        </div>

        {/* CAD Blueprint Visual Mockup */}
        <div className="hero-cad">
          <div className="cad-head">
            <span>DWG NO: MIMAR-ARCH-2026</span>
            <span style={{ color: "var(--accent-orange)", fontWeight: 600 }}>
              ● STATUS: LOCKED
            </span>
          </div>
          <div className="cad-content">
            <div className="cad-line">
              <span className="cad-c">
                // 1. Fixed Architecture Constraints
              </span>
            </div>
            <div className="cad-line">
              <span className="cad-k">stack</span>:{" "}
              <span className="cad-v">"Next.js + FastAPI + SQLAlchemy"</span>
            </div>
            <div className="cad-line">
              <span className="cad-k">database</span>:{" "}
              <span className="cad-v">"Supabase PostgreSQL (RLS)"</span>
            </div>
            <div className="cad-line">
              <span className="cad-k">deployment</span>:{" "}
              <span className="cad-v">"Vercel (Edge) + Render (FastAPI)"</span>
            </div>
            <div className="cad-line" style={{ marginTop: "12px" }}>
              <span className="cad-c">
                // 2. Cross-Checked Features (Gemini + Groq)
              </span>
            </div>
            <div className="cad-line">
              <span className="cad-k">features</span>: [
            </div>
            <div className="cad-line">
              &nbsp;&nbsp;
              <span className="cad-v">"Role-Based Access Control (RBAC)"</span>,
            </div>
            <div className="cad-line">
              &nbsp;&nbsp;
              <span className="cad-v">"Loan &amp; Interest Management"</span>,
            </div>
            <div className="cad-line">
              &nbsp;&nbsp;
              <span className="cad-v">"Asynchronous Audit Logging"</span>,
            </div>
            <div className="cad-line">
              &nbsp;&nbsp;
              <span className="cad-v">"Automated Nightly Interest Cron"</span>
            </div>
            <div className="cad-line">]</div>
            <div className="cad-line" style={{ marginTop: "12px" }}>
              <span className="cad-c">// 3. Drift-Check Machine Map</span>
            </div>
            <div className="cad-line">
              <span className="cad-k">mcp_tools</span>: [
              <span className="cad-v">"get_plan"</span>,{" "}
              <span className="cad-v">"check_drift"</span>]
            </div>
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="section" id="how-it-works">
        <div className="section-header">
          <div className="section-label">THE 6-STAGE ENGINE</div>
          <h2 className="section-title">The MimarAi Blueprint Workflow</h2>
          <p className="section-desc">
            Each stage runs through dual-AI validation. Accepting locks the
            specification to prevent downstream state corruption.
          </p>
        </div>

        <div className="flow-grid">
          {/* 01 */}
          <div className="flow-card">
            <div className="flow-num">
              <span>01 · INTERVIEW</span>
              <span className="flow-step-tag">INPUT ENGINE</span>
            </div>
            <h3 className="flow-title">Idea &amp; Tech Constraints</h3>
            <p className="flow-body">
              Interview with Mimar Architect Linter. Capture tech stack,
              database, APIs, and scope in full viewport without zoom clutter.
            </p>
          </div>

          {/* 02 */}
          <div className="flow-card">
            <div className="flow-num">
              <span>02 · PLAN REVIEW</span>
              <span className="flow-step-tag">DUAL-MODEL DRAFT</span>
            </div>
            <h3 className="flow-title">Cross-Checked Features</h3>
            <p className="flow-body">
              Gemini and Groq draft independently in parallel. Diffs catch
              omissions. User leaves inline comments; revision returns to
              interview.
            </p>
          </div>

          {/* 03 */}
          <div className="flow-card">
            <div className="flow-num">
              <span>03 · STRUCTURE</span>
              <span className="flow-step-tag">FILE TREE MAP</span>
            </div>
            <h3 className="flow-title">Project Layout JSON</h3>
            <p className="flow-body">
              Accepted features map to standard routes, models, and schemas.
              Produces the machine-readable JSON tree for the Drift-Checker.
            </p>
          </div>

          {/* 04 */}
          <div className="flow-card">
            <div className="flow-num">
              <span>04 · SCHEMA JSON</span>
              <span className="flow-step-tag">CLEAN DATA</span>
            </div>
            <h3 className="flow-title">Schema &amp; Architecture JSON</h3>
            <p className="flow-body">
              Database tables, primary/foreign keys, and microservices formulate
              clean reviewable JSON before anything is rendered.
            </p>
          </div>

          {/* 05 */}
          <div className="flow-card">
            <div className="flow-num">
              <span>05 · DIAGRAMS</span>
              <span className="flow-step-tag">CAD RENDERER</span>
            </div>
            <h3 className="flow-title">Rendered Blueprints</h3>
            <p className="flow-body">
              Deterministic SVG CAD engine draws ERD &amp; Architecture
              diagrams. Ask AI chat handles cosmetic vs structural changes with
              force-override.
            </p>
          </div>

          {/* 06 */}
          <div className="flow-card">
            <div className="flow-num">
              <span>06 · MCP DISPATCH</span>
              <span className="flow-step-tag">AGENT READY</span>
            </div>
            <h3 className="flow-title">Consolidated Plan &amp; Hub</h3>
            <p className="flow-body">
              Merged specification locks completely. Dispatched live to Claude
              Code, Cursor, or Antigravity via passive MCP server connection.
            </p>
          </div>
        </div>
      </section>

      {/* Why MimarAi Differentiators */}
      <section className="section" id="architecture">
        <div className="section-header">
          <div className="section-label">WHY IT'S DIFFERENT</div>
          <h2 className="section-title">
            Engineered to Prevent AI Hallucinations
          </h2>
          <p className="section-desc">
            Why single-prompt AI coding fails, and how MimarAi's
            dual-independent architecture guarantees consistency.
          </p>
        </div>

        <div className="diff-grid">
          <div className="diff-card">
            <div className="diff-icon">⚡</div>
            <h3 className="diff-title">Dual-Independent AI Drafts</h3>
            <p className="diff-body">
              Gemini Flash and Groq draft in parallel without seeing each
              other's work. Independent drafting catches omissions and blind
              spots, not just syntax errors.
            </p>
          </div>

          <div className="diff-card">
            <div className="diff-icon">📐</div>
            <h3 className="diff-title">Deterministic CAD Engine</h3>
            <p className="diff-body">
              The AI produces structured JSON, but a mechanical SVG blueprint
              engine draws the diagrams. Eliminates diagram hallucinations and
              illogical relationships.
            </p>
          </div>

          <div className="diff-card">
            <div className="diff-icon">🛡</div>
            <h3 className="diff-title">State Integrity &amp; Drift Checks</h3>
            <p className="diff-body">
              Locked stages become strictly read-only. Post-implementation
              Drift-Check verifies actual codebase against the accepted
              structure and schema JSON.
            </p>
          </div>
        </div>

        {/* Comparison */}
        <div className="compare-wrap">
          <div className="compare-col">
            <div className="compare-head bad">✕ VIBE-CODING WITHOUT MIMAR</div>
            <ul className="compare-list bad">
              <li>
                Agent hallucinates folder structure and invents contradictory
                routes.
              </li>
              <li>
                Database schemas miss foreign keys or use wrong data types.
              </li>
              <li>
                Scope creep and forgotten core requirements during long prompts.
              </li>
              <li>
                Zero verification mechanism to check if code matches the initial
                goal.
              </li>
            </ul>
          </div>

          <div className="compare-col">
            <div className="compare-head good">
              ✓ PRECISION ARCHITECTURE WITH MIMAR
            </div>
            <ul className="compare-list good">
              <li>
                Deterministic file-to-feature mapping before any code is
                generated.
              </li>
              <li>
                Referential integrity validated across all tables and services.
              </li>
              <li>
                Live MCP Server tool <code>get_implementation_plan</code>{" "}
                provides clean context.
              </li>
              <li>
                Post-implementation <code>check_drift</code> flags missed or
                adjusted features.
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* CTA Banner Section */}
      <section className="section" id="mcp-server">
        <div className="cta-banner">
          <h2>Ready to build with validated blueprints?</h2>
          <p>
            Enter the Blueprint Wizard, run your concept through the dual-model
            pipeline, and connect your coding agent in under five minutes.
          </p>
          <Link
            href="/app"
            onClick={handleCtaClick}
            className={`btn btn-primary ${!user ? "btn-disabled" : ""}`}
            style={{ fontSize: "13.5px", padding: "14px 30px" }}
            title={
              !user
                ? "Please log in to open the Blueprint Wizard"
                : "Open Blueprint Wizard"
            }
          >
            Open Blueprint Wizard →
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <a
            href="/"
            title="MimarAi — The Blueprint Studio"
            style={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            <img
              src="/assets/mimarai-logo-hero.png"
              alt="MimarAi Logo"
              style={{
                height: "46px",
                width: "auto",
                objectFit: "contain",
                borderRadius: "6px",
                display: "block",
              }}
            />
          </a>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-secondary)",
            letterSpacing: ".06em",
          }}
        >
          BACK4APP + VERCEL + SUPABASE · $0 INFRASTRUCTURE GOAL
        </div>
      </footer>

      {/* Toast Notification */}
      <div className="toast" id="toast"></div>
    </div>
  );
}
