import React, { useState } from 'react';
import { ShieldCheck, AlertTriangle, Cpu, Terminal, ArrowRight, Play, CheckCircle2, FileCode2, Layers, Search, RefreshCw } from 'lucide-react';

export default function LandingScreen({ setActiveScreen, setProject, sampleProjects, conflicts }) {
  const [heroPrompt, setHeroPrompt] = useState("Building a collaborative real-time drawing canvas for students using serverless Vercel free tier and stateful WebSockets.");
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationState, setSimulationState] = useState('IDLE'); // IDLE, PARSING, CONFLICT_DETECTED, VALIDATED

  const handleSimulate = (promptText) => {
    setHeroPrompt(promptText);
    setIsSimulating(true);
    setSimulationState('PARSING');

    setTimeout(() => {
      setSimulationState('CONFLICT_DETECTED');
      setIsSimulating(false);
    }, 1200);
  };

  return (
    <div style={{ paddingBottom: '60px' }}>
      
      {/* CAD Grid Top Header Notice */}
      <div style={{
        borderBottom: '1px solid var(--border-light)',
        background: 'var(--bg-surface-subtle)',
        padding: '6px 20px',
        fontSize: '11px',
        fontFamily: 'var(--font-mono)',
        color: 'var(--ink-secondary)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>[DRAFTING TABLE GRID: 100mm x 100mm] // SPECIFICATION VALIDATOR v2.4</div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <span>STATUS: ALL INVARIANTS ACTIVE</span>
          <span style={{ color: 'var(--accent-orange)' }}>● 1 CRITICAL CONFLICT TRAPPED</span>
        </div>
      </div>

      {/* Hero Section — Core Tension & Technical Drafting Studio */}
      <section style={{ padding: '40px 20px', maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', alignItems: 'start' }}>
          
          {/* Left Column: Direct Engineer Copy & Core Value */}
          <div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <span className="coord-tag orange">[PRECISION ENGINEERING]</span>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--line-cyan)' }}>
                STOP VIBE-CODING BLIND
              </span>
            </div>

            <h1 className="font-head" style={{ fontSize: '38px', lineHeight: 1.15, marginBottom: '16px', letterSpacing: '-0.03em' }}>
              Catches conflicting requirements <span style={{ color: 'var(--accent-orange)', textDecoration: 'underline var(--accent-orange)' }}>before</span> you write code.
            </h1>

            <p style={{ fontSize: '15px', color: 'var(--ink-secondary)', marginBottom: '24px', lineHeight: 1.6 }}>
              MimarAi acts as your lead architect. It interviews you about your stack, flags impossible engineering tradeoffs (like <em>stateful WebSockets on serverless free tiers</em>), and outputs agent-ready spec files, ER diagrams, and live MCP schemas for Cursor and Claude Code.
            </p>

            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '32px' }}>
              <button 
                onClick={() => setActiveScreen('interview')}
                className="btn-cad btn-cad-primary"
                style={{ padding: '12px 24px', fontSize: '13px' }}
              >
                <span>START ARCHITECT INTERVIEW</span>
                <ArrowRight size={16} />
              </button>

              <button 
                onClick={() => setActiveScreen('conflict')}
                className="btn-cad"
                style={{ padding: '12px 20px', fontSize: '13px' }}
              >
                <AlertTriangle size={15} color="var(--accent-orange)" />
                <span>VIEW CAUGHT CONFLICTS</span>
              </button>
            </div>

            {/* Architectural Rigor Metrics */}
            <div className="cad-box cad-box-ticks" style={{ padding: '16px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px' }}>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--accent-orange)' }}>0%</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>AI SPARKLES / FLUFF</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--line-cyan)' }}>100%</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>MCP SPEC RIGOR</div>
              </div>
              <div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '20px', fontWeight: 700, color: 'var(--slate-green)' }}>14</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>CONFLICT RULES</div>
              </div>
            </div>
          </div>

          {/* Right Column: Live Interactive Tension Showcase */}
          <div className="cad-box cad-box-ticks" style={{ padding: '20px', background: 'var(--bg-surface-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={14} color="var(--accent-orange)" />
                <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700 }}>LIVE REQUIREMENT VALIDATOR ENGINE</span>
              </div>
              <span className="coord-tag">[INPUT-SIM-01]</span>
            </div>

            {/* Prompt input simulation */}
            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-muted)', marginBottom: '6px' }}>
                INPUT BRIEF / PROMPT IDEA:
              </label>
              <textarea
                value={heroPrompt}
                onChange={(e) => setHeroPrompt(e.target.value)}
                rows={3}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-strong)',
                  color: 'var(--ink-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  padding: '10px',
                  borderRadius: '2px',
                  resize: 'none'
                }}
              />
            </div>

            {/* Presets */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button 
                onClick={() => handleSimulate("Building a collaborative real-time canvas on Vercel free tier with Socket.io.")}
                className="btn-cad"
                style={{ padding: '4px 8px', fontSize: '10px' }}
              >
                Sample 1: WebSockets + Serverless
              </button>
              <button 
                onClick={() => handleSimulate("High throughput microservices API with SQLite in-memory file persistence.")}
                className="btn-cad"
                style={{ padding: '4px 8px', fontSize: '10px' }}
              >
                Sample 2: SQLite + Distributed Write
              </button>
            </div>

            {/* Action button */}
            <button
              onClick={() => handleSimulate(heroPrompt)}
              disabled={isSimulating}
              className="btn-cad btn-cad-primary"
              style={{ width: '100%', padding: '10px', fontSize: '12px', marginBottom: '16px' }}
            >
              {isSimulating ? <RefreshCw size={14} className="animate-pulse-subtle" /> : <Search size={14} />}
              <span>{isSimulating ? 'ANALYZING TAXONOMY & INFRASTRUCTURE...' : 'RUN STRUCTURAL VALIDATION'}</span>
            </button>

            {/* Simulation Result Output Pane */}
            <div style={{ border: '1px solid var(--border-light)', background: 'var(--bg-surface-subtle)', padding: '14px', borderRadius: '2px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span className="font-mono" style={{ fontSize: '11px', color: 'var(--line-cyan)' }}>LINT RESULT OUTPUT:</span>
                <span className="font-mono" style={{ fontSize: '11px' }}>
                  {simulationState === 'IDLE' && 'READY'}
                  {simulationState === 'PARSING' && 'RUNNING TAXONOMY CHECKS...'}
                  {simulationState === 'CONFLICT_DETECTED' && <span style={{ color: 'var(--accent-orange)' }}>1 CONTRADICTION CAUGHT</span>}
                </span>
              </div>

              {simulationState === 'CONFLICT_DETECTED' && (
                <div className="proofreader-box" style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent-orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '12px', marginBottom: '6px' }}>
                    <AlertTriangle size={15} />
                    <span>[FLAG REF-042]: STATEFUL SOCKET vs SERVERLESS LAMBDA</span>
                  </div>
                  <p style={{ fontSize: '12px', lineHeight: 1.4, color: 'var(--ink-primary)', marginBottom: '8px' }}>
                    Vercel Free serverless lambdas close TCP connections after 10s. Native Socket.io cannot maintain canvas cursor sync.
                  </p>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button 
                      onClick={() => setActiveScreen('conflict')} 
                      className="btn-cad btn-cad-primary" 
                      style={{ padding: '4px 10px', fontSize: '10px' }}
                    >
                      APPLY FIX: MIGRATE TO FLY.IO
                    </button>
                    <button 
                      onClick={() => setActiveScreen('spec')} 
                      className="btn-cad" 
                      style={{ padding: '4px 10px', fontSize: '10px' }}
                    >
                      VIEW REVISED SPEC
                    </button>
                  </div>
                </div>
              )}

              {simulationState === 'IDLE' && (
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-muted)', textAlign: 'center', padding: '12px 0' }}>
                  Click "Run Structural Validation" or enter a project idea to catch conflicts before opening Cursor.
                </div>
              )}
            </div>

          </div>

        </div>
      </section>

      {/* Section 2: Technical Workflow (CAD Drafting Table Metaphor) */}
      <section style={{ borderTop: '1px solid var(--border-strong)', borderBottom: '1px solid var(--border-strong)', background: 'var(--bg-surface-elevated)', padding: '40px 20px' }}>
        <div style={{ maxWidth: '1280px', margin: '0 auto' }}>
          
          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <span className="coord-tag">[THE DRAFTING PIPELINE]</span>
            <h2 className="font-head" style={{ fontSize: '26px', marginTop: '8px' }}>
              How MimarAi Replaces Vibe-Coding with Blueprint Rigor
            </h2>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '20px' }}>
                     {/* Step 1 */}
            <div className="cad-box cad-box-ticks" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-orange)' }}>01</span>
                <span className="coord-tag">[INTERVIEW]</span>
              </div>
              <h3 className="font-head" style={{ fontSize: '16px', marginBottom: '8px' }}>Taxonomy Interview</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                Questions targeted to your project scale. Fills in data models, auth constraints, deployment tiers, and sync protocols systematically.
              </p>
            </div>

            {/* Step 2 */}
            <div className="cad-box cad-box-ticks" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--accent-orange)' }}>02</span>
                <span className="coord-tag orange">[PROOFREAD]</span>
              </div>
              <h3 className="font-head" style={{ fontSize: '16px', marginBottom: '8px' }}>Conflict Linter</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                Cross-examines requirement combinations against 140+ architectural rules. Flags silent failure modes before code is written.
              </p>
            </div>

            {/* Step 3 */}
            <div className="cad-box cad-box-ticks" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--line-cyan)' }}>03</span>
                <span className="coord-tag">[BLUEPRINT]</span>
              </div>
              <h3 className="font-head" style={{ fontSize: '16px', marginBottom: '8px' }}>Spec & ER Diagrams</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                Generates crisp orthogonal diagrams, invariant tables, and numbered specification sections (`REQ-AUTH-01`).
              </p>
            </div>

            {/* Step 4 */}
            <div className="cad-box cad-box-ticks" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span className="font-mono" style={{ fontSize: '18px', fontWeight: 700, color: 'var(--slate-green)' }}>04</span>
                <span className="coord-tag green">[MCP AGENT]</span>
              </div>
              <h3 className="font-head" style={{ fontSize: '16px', marginBottom: '8px' }}>Cursor / Claude Agent Sync</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', lineHeight: 1.5 }}>
                Exposes a local MCP endpoint (`mcp://localhost:8080`). Your AI agent reads exact spec rules without hallucinating.
              </p>
            </div>

          </div>

        </div>
      </section>

      {/* Section 3: Sample Architectural Specs Showcase */}
      <section style={{ padding: '40px 20px', maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <span className="coord-tag">[SAMPLE SPECIFICATIONS]</span>
            <h2 className="font-head" style={{ fontSize: '24px', marginTop: '6px' }}>Ready-to-Draft Blueprint Templates</h2>
          </div>
          <button onClick={() => setActiveScreen('interview')} className="btn-cad btn-cad-primary">
            <span>DRAFT CUSTOM PROJECT</span>
            <ArrowRight size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '20px' }}>
          {sampleProjects.map(proj => (
            <div 
              key={proj.id}
              className="cad-box cad-box-ticks"
              style={{ padding: '20px', cursor: 'pointer', border: '1px solid var(--border-strong)' }}
              onClick={() => {
                setProject(proj);
                setActiveScreen('spec');
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="coord-tag">{proj.category}</span>
                <span className={`coord-tag ${proj.status === 'REQUIRES_FIX' ? 'orange' : 'green'}`}>
                  {proj.status}
                </span>
              </div>

              <h3 className="font-head" style={{ fontSize: '18px', marginBottom: '6px' }}>{proj.name}</h3>
              <p style={{ fontSize: '13px', color: 'var(--ink-secondary)', marginBottom: '16px' }}>{proj.description}</p>

              <div style={{ borderTop: '1px dashed var(--border-light)', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-muted)' }}>
                <span>TAXONOMY: {proj.taxonomyScore}</span>
                <span style={{ color: 'var(--line-cyan)' }}>LOAD SPEC DOC →</span>
              </div>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
