import React from 'react';
import { Layers, FileText, AlertTriangle, GitBranch, Cpu, Play, Sun, Moon, ArrowRight, CheckCircle2 } from 'lucide-react';

export default function Navbar({ activeScreen, setActiveScreen, theme, setTheme, project, setProject, sampleProjects }) {
  const screens = [
    { id: 'landing', label: '01: LANDING', icon: Layers },
    { id: 'interview', label: '02: INTERVIEW', icon: FileText },
    { id: 'conflict', label: '03: CONFLICTS', icon: AlertTriangle, badge: '1 FLAG' },
    { id: 'spec', label: '04: SPEC DOC', icon: FileText },
    { id: 'diagram', label: '05: DIAGRAMS', icon: GitBranch },
    { id: 'mcp', label: '06: MCP AGENT', icon: Cpu, badge: 'LIVE' }
  ];

  return (
    <header style={{
      borderBottom: '1px solid var(--border-strong)',
      background: 'var(--bg-surface-elevated)',
      padding: '8px 16px',
      position: 'sticky',
      top: 0,
      zIndex: 100
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
        
        {/* Brand & Coordinate Metadata */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div 
            onClick={() => setActiveScreen('landing')}
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '10px', 
              cursor: 'pointer',
              textDecoration: 'none'
            }}
          >
            <div style={{
              width: '30px',
              height: '30px',
              background: 'var(--accent-orange)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#FFFFFF',
              fontWeight: 800,
              fontFamily: 'var(--font-mono)',
              fontSize: '14px',
              borderRadius: '2px',
              boxShadow: '0 0 8px rgba(232, 89, 46, 0.4)'
            }}>
              M
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: '16px', letterSpacing: '-0.02em', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>MIMAR AI</span>
                <span className="coord-tag">THE BLUEPRINT STUDIO</span>
              </div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)' }}>
                SYS_REF: [MIMAR-CAD-2.4.0] // STRUCTURAL REQUISITION ENGINE
              </div>
            </div>
          </div>

          {/* Project Switcher Select */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginLeft: '12px' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--line-cyan)' }}>[PROJ]:</span>
            <select
              value={project.id}
              onChange={(e) => {
                const found = sampleProjects.find(p => p.id === e.target.value);
                if (found) setProject(found);
              }}
              style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-light)',
                color: 'var(--ink-primary)',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                padding: '4px 8px',
                borderRadius: '2px',
                cursor: 'pointer'
              }}
            >
              {sampleProjects.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.status})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 6 Core Navigation Screens */}
        <nav style={{ display: 'flex', alignItems: 'center', gap: '4px', overflowX: 'auto', paddingBottom: '2px' }}>
          {screens.map(screen => {
            const Icon = screen.icon;
            const isActive = activeScreen === screen.id;
            return (
              <button
                key={screen.id}
                onClick={() => setActiveScreen(screen.id)}
                className={`btn-cad ${isActive ? 'btn-cad-primary' : 'btn-cad-ghost'}`}
                style={{
                  padding: '6px 10px',
                  fontSize: '11px',
                  position: 'relative',
                  border: isActive ? '1px solid var(--accent-orange)' : '1px solid transparent'
                }}
              >
                <Icon size={13} style={{ color: isActive ? '#FFFFFF' : 'var(--line-cyan)' }} />
                <span>{screen.label}</span>
                {screen.badge && (
                  <span 
                    className={`coord-tag ${screen.id === 'conflict' ? 'orange' : 'green'}`}
                    style={{ fontSize: '9px', padding: '1px 4px', marginLeft: '2px' }}
                  >
                    {screen.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Theme Switcher & Direct CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button
            onClick={() => setTheme(theme === 'blueprint' ? 'paper' : 'blueprint')}
            className="btn-cad"
            title="Toggle between Blueprint Navy and Drafting Paper themes"
            style={{ padding: '6px 10px', fontSize: '11px' }}
          >
            {theme === 'blueprint' ? <Sun size={13} color="var(--accent-orange)" /> : <Moon size={13} color="var(--line-cyan)" />}
            <span className="font-mono">{theme === 'blueprint' ? 'DRAFTING PAPER' : 'BLUEPRINT INK'}</span>
          </button>

          <button
            onClick={() => setActiveScreen('interview')}
            className="btn-cad btn-cad-primary"
            style={{ padding: '6px 12px', fontSize: '11px' }}
          >
            <span>DRAFT NEW SPEC</span>
            <ArrowRight size={13} />
          </button>
        </div>
      </div>
    </header>
  );
}
