import React, { useState } from 'react';
import { Cpu, Terminal, CheckCircle2, Copy, Play, RefreshCw, Server, ShieldCheck, Zap, ArrowRight } from 'lucide-react';

export default function McpExportScreen({ mcpConfig, project }) {
  const [copied, setCopied] = useState(false);
  const [logs, setLogs] = useState(mcpConfig.simulatedLogs);
  const [isSimulatingCall, setIsSimulatingCall] = useState(false);

  const handleCopyEndpoint = () => {
    navigator.clipboard.writeText(mcpConfig.endpointUri);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSimulateAgentQuery = () => {
    setIsSimulatingCall(true);
    setTimeout(() => {
      const now = new Date();
      const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
      const newLog = {
        timestamp: timeStr,
        agent: 'Cursor Agent (VS Code)',
        action: 'CALL tools/validate_code_against_spec',
        status: '200 OK (0.1ms)',
        detail: `Verified active project ${project.name}: Zero conflict flags in rule set.`
      };
      setLogs(prev => [newLog, ...prev]);
      setIsSimulatingCall(false);
    }, 600);
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* CAD Header Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="coord-tag green">[MODEL CONTEXT PROTOCOL]</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--line-cyan)' }}>
              MCP_PROTOCOL: v{mcpConfig.protocolVersion}
            </span>
          </div>
          <h1 className="font-head" style={{ fontSize: '24px', marginTop: '4px' }}>
            AI Agent Integration Studio (MCP Endpoint)
          </h1>
        </div>

        {/* Status Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="coord-tag green" style={{ padding: '6px 12px', fontSize: '11px' }}>
            <CheckCircle2 size={13} /> CONNECTION ACTIVE
          </span>
        </div>
      </div>

      {/* Main Grid Layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 420px', gap: '24px' }}>
        
        {/* Left Column: Server Endpoint & Live Query Log Simulator */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Server Connection Card */}
          <div className="cad-box cad-box-ticks" style={{ padding: '24px', background: 'var(--bg-surface-elevated)' }}>
            
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Server size={18} color="var(--line-cyan)" />
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700 }}>
                  LOCAL SPECIFICATION SERVER ENDPOINT
                </span>
              </div>
              <span className="coord-tag">[PORT: 8080]</span>
            </div>

            {/* Endpoint Box */}
            <div style={{ background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-strong)', padding: '14px', borderRadius: '2px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', marginBottom: '16px' }}>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', color: 'var(--accent-orange)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {mcpConfig.endpointUri}
              </div>
              <button onClick={handleCopyEndpoint} className="btn-cad" style={{ padding: '6px 12px', fontSize: '11px', flexShrink: 0 }}>
                <Copy size={13} />
                <span>{copied ? 'COPIED' : 'COPY'}</span>
              </button>
            </div>

            {/* Agent Support Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
              <div style={{ border: '1px solid var(--border-light)', padding: '10px', borderRadius: '2px', background: 'var(--bg-surface-subtle)' }}>
                <div className="font-mono" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>CONNECTED CODING AGENTS:</div>
                <div className="font-mono" style={{ fontSize: '12px', color: 'var(--ink-primary)', marginTop: '2px' }}>{mcpConfig.activeAgent}</div>
              </div>
              <div style={{ border: '1px solid var(--border-light)', padding: '10px', borderRadius: '2px', background: 'var(--bg-surface-subtle)' }}>
                <div className="font-mono" style={{ fontSize: '10px', color: 'var(--ink-muted)' }}>BEARER TOKEN AUTH:</div>
                <div className="font-mono" style={{ fontSize: '12px', color: 'var(--line-cyan)', marginTop: '2px' }}>{mcpConfig.bearerToken}</div>
              </div>
            </div>

            {/* Terminal Command Snippet */}
            <div>
              <div className="font-mono" style={{ fontSize: '11px', color: 'var(--ink-muted)', marginBottom: '6px' }}>
                CONNECT VIA CLAUDE CODE CLI / CURSOR MCP CONFIG (.cursor/mcp.json):
              </div>
              <pre style={{
                background: 'var(--bg-surface-subtle)',
                border: '1px solid var(--border-strong)',
                padding: '12px',
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                color: 'var(--ink-primary)',
                overflowX: 'auto',
                borderRadius: '2px'
              }}>
                <code>{`{
  "mcpServers": {
    "mimar-architect": {
      "command": "npx",
      "args": ["-y", "@mimar/mcp-server", "--spec", "${project.id}"]
    }
  }
}`}</code>
              </pre>
            </div>

          </div>

          {/* Live Query Log Stream Simulator */}
          <div className="cad-box cad-box-ticks" style={{ padding: '20px', background: 'var(--bg-surface-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Terminal size={15} color="var(--accent-orange)" />
                <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700 }}>
                  LIVE MCP RPC QUERY STREAM
                </span>
              </div>
              
              <button
                onClick={handleSimulateAgentQuery}
                disabled={isSimulatingCall}
                className="btn-cad btn-cad-primary"
                style={{ padding: '4px 10px', fontSize: '10px' }}
              >
                {isSimulatingCall ? <RefreshCw size={12} className="animate-pulse-subtle" /> : <Play size={12} />}
                <span>SIMULATE CURSOR FETCH</span>
              </button>
            </div>

            {/* Log Output Stream */}
            <div style={{
              background: 'var(--bg-surface-subtle)',
              border: '1px solid var(--border-strong)',
              padding: '12px',
              height: '240px',
              overflowY: 'auto',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              fontFamily: 'var(--font-mono)',
              fontSize: '11px'
            }}>
              {logs.map((log, idx) => (
                <div key={idx} style={{ borderBottom: '1px dashed var(--border-light)', paddingBottom: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--line-cyan)', marginBottom: '2px' }}>
                    <span>[{log.timestamp}] {log.agent}</span>
                    <span style={{ color: 'var(--slate-green)' }}>{log.status}</span>
                  </div>
                  <div style={{ color: 'var(--accent-orange)', fontWeight: 600 }}>
                    ❯ {log.action}
                  </div>
                  <div style={{ color: 'var(--ink-secondary)', fontSize: '10px' }}>
                    {log.detail}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column: Server Capabilities & JSON Schema Preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          
          {/* MCP Capabilities */}
          <div className="cad-box cad-box-ticks" style={{ padding: '20px', background: 'var(--bg-surface-elevated)' }}>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', fontWeight: 700, color: 'var(--line-cyan)', marginBottom: '12px', borderBottom: '1px solid var(--border-light)', paddingBottom: '6px' }}>
              EXPOSED MCP RPC TOOLS:
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {mcpConfig.capabilities.map((cap, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-primary)', padding: '6px', background: 'var(--bg-surface-subtle)', border: '1px solid var(--border-light)', borderRadius: '2px' }}>
                  <Zap size={12} color="var(--accent-orange)" />
                  <span>{cap}</span>
                </div>
              ))}
            </div>
          </div>

          {/* JSON Schema Preview */}
          <div className="cad-box" style={{ padding: '16px', background: 'var(--bg-surface-subtle)' }}>
            <div className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: 'var(--ink-secondary)', marginBottom: '8px' }}>
              MCP SCHEMA INVARIANT:
            </div>
            <pre style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)', overflowX: 'auto', maxHeight: '200px' }}>
              <code>{mcpConfig.jsonSchemaPreview}</code>
            </pre>
          </div>

        </div>

      </div>

    </div>
  );
}
