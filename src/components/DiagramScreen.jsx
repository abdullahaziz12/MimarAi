import React, { useState } from 'react';
import { GitBranch, Database, Layers, Download, ZoomIn, ZoomOut, Maximize2, ShieldCheck, ArrowRight } from 'lucide-react';

export default function DiagramScreen({ setActiveScreen, erModel, archModel, project }) {
  const [diagramType, setDiagramType] = useState('ER'); // 'ER' or 'ARCHITECTURE'
  const [zoomLevel, setZoomLevel] = useState(1);

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* CAD Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="coord-tag green">[TECHNICAL DRAFTING CANVAS]</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--line-cyan)' }}>
              SCALE: 1:1 // VECTOR ORTHOGONAL RENDER
            </span>
          </div>
          <h1 className="font-head" style={{ fontSize: '24px', marginTop: '4px' }}>
            {diagramType === 'ER' ? 'Entity-Relationship (ER) Schema Blueprint' : 'System Architecture Blueprint'}
          </h1>
        </div>

        {/* Action Controls */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button 
            onClick={() => setActiveScreen('mcp')} 
            className="btn-cad btn-cad-primary"
          >
            <span>EXPORT TO MCP AGENT</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Blueprint Control Toolbar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', background: 'var(--bg-surface-elevated)', padding: '10px 16px', border: '1px solid var(--border-strong)', borderRadius: '2px', flexWrap: 'wrap', gap: '12px' }}>
        
        {/* View Switcher */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => setDiagramType('ER')}
            className={`btn-cad ${diagramType === 'ER' ? 'btn-cad-primary' : 'btn-cad-ghost'}`}
            style={{ padding: '6px 12px', fontSize: '11px' }}
          >
            <Database size={13} />
            <span>ER SCHEMAS (DATA LAYER)</span>
          </button>

          <button
            onClick={() => setDiagramType('ARCHITECTURE')}
            className={`btn-cad ${diagramType === 'ARCHITECTURE' ? 'btn-cad-primary' : 'btn-cad-ghost'}`}
            style={{ padding: '6px 12px', fontSize: '11px' }}
          >
            <GitBranch size={13} />
            <span>SYSTEM ARCHITECTURE</span>
          </button>
        </div>

        {/* Zoom Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.1))} className="btn-cad" style={{ padding: '4px 8px' }}>
            <ZoomOut size={13} />
          </button>
          <span className="font-mono" style={{ fontSize: '11px', color: 'var(--line-cyan)' }}>
            {(zoomLevel * 100).toFixed(0)}%
          </span>
          <button onClick={() => setZoomLevel(prev => Math.min(1.4, prev + 0.1))} className="btn-cad" style={{ padding: '4px 8px' }}>
            <ZoomIn size={13} />
          </button>
          <button onClick={() => setZoomLevel(1)} className="btn-cad" style={{ padding: '4px 8px' }}>
            RESET
          </button>
        </div>

      </div>

      {/* Interactive Blueprint Canvas Area */}
      <div className="cad-box cad-box-ticks blueprint-grid-bg" style={{
        minHeight: '520px',
        padding: '30px',
        position: 'relative',
        overflow: 'auto',
        border: '1px solid var(--border-strong)'
      }}>
        
        {/* CAD Coordinate Markers overlay */}
        <div style={{ position: 'absolute', top: 8, left: 12, fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--line-cyan)', pointerEvents: 'none' }}>
          [CAD CANVAS ORIGIN: X:0, Y:0] // ORTHOGONAL GRID 20px
        </div>

        <div style={{ position: 'absolute', top: 8, right: 12, fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)', pointerEvents: 'none' }}>
          [INVARIANT: STRICT PK/FK CONSTRAINTS]
        </div>

        {/* Scalable Vector Blueprint Area */}
        <div style={{ transform: `scale(${zoomLevel})`, transformOrigin: 'top left', transition: 'transform 0.15s ease' }}>
          
          {diagramType === 'ER' ? (
            /* ER Diagram Vector Render */
            <div style={{ position: 'relative', minWidth: '900px', minHeight: '480px' }}>
              
              {/* SVG Orthogonal Connector Lines */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--line-cyan)" />
                  </marker>
                </defs>

                {/* Line 1: users to canvas_rooms */}
                <path d="M 270 90 L 420 90" stroke="var(--line-cyan)" strokeWidth="2" strokeDasharray="4 2" markerEnd="url(#arrow)" />
                <text x="330" y="80" fill="var(--line-cyan)" fontSize="10" fontFamily="IBM Plex Mono">1 : N (owns)</text>

                {/* Line 2: canvas_rooms to vector_strokes */}
                <path d="M 520 230 L 520 320" stroke="var(--line-cyan)" strokeWidth="2" markerEnd="url(#arrow)" />
                <text x="530" y="275" fill="var(--line-cyan)" fontSize="10" fontFamily="IBM Plex Mono">1 : N (contains)</text>

                {/* Line 3: users to vector_strokes */}
                <path d="M 160 230 L 160 380 L 420 380" stroke="var(--line-cyan-subtle)" strokeWidth="1.5" strokeDasharray="3 3" />
                <text x="260" y="370" fill="var(--ink-muted)" fontSize="9" fontFamily="IBM Plex Mono">1 : N (authors)</text>
              </svg>

              {/* Entity Box 1: users */}
              {erModel.entities.map(ent => (
                <div
                  key={ent.id}
                  className="cad-box"
                  style={{
                    position: 'absolute',
                    left: `${ent.coords.x}px`,
                    top: `${ent.coords.y}px`,
                    width: '220px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--line-cyan)',
                    boxShadow: '0 4px 12px rgba(0,0,0,0.2)'
                  }}
                >
                  <div style={{ background: 'rgba(92, 138, 166, 0.15)', padding: '6px 10px', borderBottom: '1px solid var(--line-cyan)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                      TABLE: {ent.name}
                    </span>
                    <span className="coord-tag" style={{ fontSize: '8px' }}>SQL</span>
                  </div>

                  <div style={{ padding: '8px' }}>
                    {ent.fields.map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontFamily: 'var(--font-mono)', padding: '3px 0', borderBottom: i < ent.fields.length - 1 ? '1px dashed var(--border-light)' : 'none' }}>
                        <span style={{ color: f.pk ? 'var(--accent-orange)' : f.fk ? 'var(--line-cyan)' : 'var(--ink-primary)', fontWeight: f.pk || f.fk ? 700 : 400 }}>
                          {f.pk && '[PK] '}
                          {f.fk && '[FK] '}
                          {f.name}
                        </span>
                        <span style={{ color: 'var(--ink-muted)' }}>{f.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}

            </div>
          ) : (
            /* System Architecture Visualizer */
            <div style={{ position: 'relative', minWidth: '950px', minHeight: '480px' }}>
              
              {/* Vector Orthogonal Connection Lines */}
              <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
                <defs>
                  <marker id="arch-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--accent-orange)" />
                  </marker>
                </defs>

                {/* Client -> Proxy */}
                <path d="M 210 200 L 300 200" stroke="var(--accent-orange)" strokeWidth="2" markerEnd="url(#arch-arrow)" />
                <text x="225" y="190" fill="var(--accent-orange)" fontSize="9" fontFamily="IBM Plex Mono">WSS / HTTPS</text>

                {/* Proxy -> WS Service */}
                <path d="M 450 180 L 560 120" stroke="var(--line-cyan)" strokeWidth="2" />
                <text x="470" y="140" fill="var(--line-cyan)" fontSize="9" fontFamily="IBM Plex Mono">TCP Socket</text>

                {/* Proxy -> REST API */}
                <path d="M 450 220 L 560 270" stroke="var(--line-cyan)" strokeWidth="2" />
                <text x="470" y="260" fill="var(--line-cyan)" fontSize="9" fontFamily="IBM Plex Mono">HTTP / REST</text>

                {/* WS -> Redis */}
                <path d="M 710 120 L 840 120" stroke="var(--line-cyan)" strokeWidth="2" strokeDasharray="4 2" />
                <text x="745" y="110" fill="var(--line-cyan)" fontSize="9" fontFamily="IBM Plex Mono">Pub/Sub</text>

                {/* REST -> Postgres */}
                <path d="M 710 280 L 840 280" stroke="var(--slate-green)" strokeWidth="2" />
                <text x="745" y="270" fill="var(--slate-green)" fontSize="9" fontFamily="IBM Plex Mono">SQL Pool</text>
              </svg>

              {/* Architecture Nodes */}
              {archModel.nodes.map(node => (
                <div
                  key={node.id}
                  className="cad-box cad-box-ticks"
                  style={{
                    position: 'absolute',
                    left: `${node.x}px`,
                    top: `${node.y}px`,
                    width: '170px',
                    background: 'var(--bg-surface-elevated)',
                    border: '1px solid var(--border-strong)',
                    padding: '12px'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="coord-tag" style={{ fontSize: '8px' }}>{node.category}</span>
                  </div>
                  <div className="font-head" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '2px' }}>
                    {node.label}
                  </div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>
                    {node.sub}
                  </div>
                </div>
              ))}

            </div>
          )}

        </div>

      </div>

    </div>
  );
}
