import React from 'react';
import { Terminal, Shield, Cpu, RefreshCcw } from 'lucide-react';

export default function DraftingFooter({ activeScreen, setActiveScreen, theme, project }) {
  return (
    <footer style={{
      borderTop: '1px solid var(--border-strong)',
      background: 'var(--bg-surface-elevated)',
      padding: '8px 20px',
      position: 'fixed',
      bottom: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      fontFamily: 'var(--font-mono)',
      fontSize: '11px',
      color: 'var(--ink-secondary)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      flexWrap: 'wrap',
      gap: '12px'
    }}>
      {/* Left: Active Screen & CAD Crosshairs */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--slate-green)', display: 'inline-block' }} />
          <span style={{ color: 'var(--ink-primary)', fontWeight: 700 }}>ACTIVE SCREEN: {activeScreen.toUpperCase()}</span>
        </div>

        <div style={{ color: 'var(--line-cyan)' }}>
          [CAD COORD: X: 420.50, Y: 1080.00]
        </div>

        <div>
          ACTIVE PROJECT: <span style={{ color: 'var(--accent-orange)' }}>{project.name}</span>
        </div>
      </div>

      {/* Right: Architectural Rules & Shortcuts */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <span onClick={() => setActiveScreen('landing')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>[1: LANDING]</span>
          <span onClick={() => setActiveScreen('interview')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>[2: INTERVIEW]</span>
          <span onClick={() => setActiveScreen('conflict')} style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--accent-orange)' }}>[3: CONFLICTS]</span>
          <span onClick={() => setActiveScreen('spec')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>[4: SPEC]</span>
          <span onClick={() => setActiveScreen('diagram')} style={{ cursor: 'pointer', textDecoration: 'underline' }}>[5: DIAGRAMS]</span>
          <span onClick={() => setActiveScreen('mcp')} style={{ cursor: 'pointer', textDecoration: 'underline', color: 'var(--slate-green)' }}>[6: MCP]</span>
        </div>

        <div className="coord-tag">
          THEME: {theme.toUpperCase()}
        </div>
      </div>
    </footer>
  );
}
