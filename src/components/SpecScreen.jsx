import React, { useState } from 'react';
import { FileText, Download, Copy, Check, ArrowRight, ShieldCheck, Database, Code, Terminal, Layers } from 'lucide-react';

export default function SpecScreen({ setActiveScreen, specData, project }) {
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('DOCUMENT'); // DOCUMENT, JSON_SCHEMA, MARKDOWN

  const handleCopySpec = () => {
    const jsonStr = JSON.stringify(specData, null, 2);
    navigator.clipboard.writeText(jsonStr);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* CAD Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="coord-tag green">[STRUCTURED SPECIFICATION]</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--line-cyan)' }}>
              DOC_ID: {specData.header.docId}
            </span>
          </div>
          <h1 className="font-head" style={{ fontSize: '24px', marginTop: '4px' }}>
            {specData.header.title}
          </h1>
        </div>

        {/* Export & Navigation Controls */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={handleCopySpec} 
            className="btn-cad"
          >
            {copied ? <Check size={14} color="var(--slate-green)" /> : <Copy size={14} />}
            <span>{copied ? 'COPIED TO CLIPBOARD' : 'COPY RAW SPEC'}</span>
          </button>

          <button 
            onClick={() => setActiveScreen('diagram')} 
            className="btn-cad btn-cad-primary"
          >
            <span>VIEW ER & ARCH DIAGRAMS</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Blueprint Metadata Header Box */}
      <div className="cad-box cad-box-ticks" style={{ padding: '16px 20px', marginBottom: '24px', background: 'var(--bg-surface-elevated)', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>DOCUMENT VERSION:</div>
          <div className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--slate-green)' }}>{specData.header.version}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>VALIDATED BY:</div>
          <div className="font-mono" style={{ fontSize: '13px', color: 'var(--ink-primary)' }}>{specData.header.architect}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>TARGET TECH STACK:</div>
          <div className="font-mono" style={{ fontSize: '13px', color: 'var(--line-cyan)' }}>{specData.header.targetStack}</div>
        </div>
        <div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>MCP ENDPOINT READY:</div>
          <div className="font-mono" style={{ fontSize: '13px', color: 'var(--accent-orange)' }}>YES (mcp://localhost:8080)</div>
        </div>
      </div>

      {/* View Switcher Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <button
          onClick={() => setActiveTab('DOCUMENT')}
          className={`btn-cad ${activeTab === 'DOCUMENT' ? 'btn-cad-primary' : 'btn-cad-ghost'}`}
          style={{ padding: '6px 12px', fontSize: '11px' }}
        >
          DOCUMENT VIEW
        </button>
        <button
          onClick={() => setActiveTab('JSON_SCHEMA')}
          className={`btn-cad ${activeTab === 'JSON_SCHEMA' ? 'btn-cad-primary' : 'btn-cad-ghost'}`}
          style={{ padding: '6px 12px', fontSize: '11px' }}
        >
          JSON SCHEMA PREVIEW
        </button>
      </div>

      {/* Section Content */}
      {activeTab === 'DOCUMENT' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {specData.sections.map((sec, idx) => (
            <div key={sec.sectionId} className="cad-box cad-box-ticks" style={{ padding: '24px', background: 'var(--bg-surface-elevated)' }}>
              
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
                <h2 className="font-head" style={{ fontSize: '18px', color: 'var(--ink-primary)' }}>
                  {sec.title}
                </h2>
                <span className="coord-tag">[{sec.sectionId}]</span>
              </div>

              {sec.content && (
                <p style={{ fontSize: '13px', lineHeight: 1.6, color: 'var(--ink-secondary)', marginBottom: '16px' }}>
                  {sec.content}
                </p>
              )}

              {/* Requirement ID Table */}
              {sec.items && sec.items.length > 0 && (
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left', color: 'var(--line-cyan)' }}>
                        <th style={{ padding: '8px' }}>REQ ID</th>
                        <th style={{ padding: '8px' }}>PRIORITY</th>
                        <th style={{ padding: '8px' }}>REQUIREMENT SPECIFICATION</th>
                        <th style={{ padding: '8px' }}>LINT STATUS</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.items.map(item => (
                        <tr key={item.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--accent-orange)' }}>{item.id}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <span className="coord-tag">{item.priority}</span>
                          </td>
                          <td style={{ padding: '10px 8px', color: 'var(--ink-primary)' }}>{item.description}</td>
                          <td style={{ padding: '10px 8px' }}>
                            <span className="coord-tag green" style={{ fontSize: '10px' }}>
                              <ShieldCheck size={11} /> {item.compliance}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Code / Schema snippet */}
              {sec.codeSnippet && (
                <div style={{ marginTop: '12px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', background: 'var(--bg-surface-subtle)', padding: '6px 12px', border: '1px solid var(--border-light)', borderBottom: 'none', borderTopLeftRadius: '2px', borderTopRightRadius: '2px' }}>
                    <span className="font-mono" style={{ fontSize: '11px', color: 'var(--line-cyan)' }}>TYPESCRIPT INVARIANTS</span>
                    <span className="font-mono" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>[AGENT-CONSUMABLE]</span>
                  </div>
                  <pre style={{
                    background: 'var(--bg-surface-subtle)',
                    border: '1px solid var(--border-strong)',
                    padding: '16px',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--ink-primary)',
                    overflowX: 'auto',
                    borderRadius: '0 0 2px 2px'
                  }}>
                    <code>{sec.codeSnippet}</code>
                  </pre>
                </div>
              )}

              {/* API Endpoints table */}
              {sec.apiEndpoints && (
                <div style={{ overflowX: 'auto', marginTop: '12px' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border-strong)', textAlign: 'left', color: 'var(--line-cyan)' }}>
                        <th style={{ padding: '8px' }}>METHOD</th>
                        <th style={{ padding: '8px' }}>PATH ROUTE</th>
                        <th style={{ padding: '8px' }}>DESCRIPTION</th>
                        <th style={{ padding: '8px' }}>AUTH transport</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sec.apiEndpoints.map((ep, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border-light)' }}>
                          <td style={{ padding: '8px' }}>
                            <span className={`coord-tag ${ep.method === 'WS' ? 'orange' : 'green'}`}>{ep.method}</span>
                          </td>
                          <td style={{ padding: '8px', color: 'var(--ink-primary)', fontWeight: 600 }}>{ep.path}</td>
                          <td style={{ padding: '8px', color: 'var(--ink-secondary)' }}>{ep.desc}</td>
                          <td style={{ padding: '8px', color: 'var(--line-cyan)' }}>{ep.auth}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

            </div>
          ))}
        </div>
      ) : (
        /* JSON Schema Code View */
        <div className="cad-box cad-box-ticks" style={{ padding: '20px', background: 'var(--bg-surface-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span className="font-mono" style={{ fontSize: '12px', color: 'var(--line-cyan)' }}>RAW AGENT SPECIFICATION JSON:</span>
            <span className="coord-tag">[FORMAT: JSON-RPC 2.0]</span>
          </div>
          <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--ink-primary)', overflowX: 'auto' }}>
            <code>{JSON.stringify(specData, null, 2)}</code>
          </pre>
        </div>
      )}

    </div>
  );
}
