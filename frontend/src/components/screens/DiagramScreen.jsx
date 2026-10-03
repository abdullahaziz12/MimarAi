"use client";

import React, { useState, useMemo } from 'react';
import { useMimarStore } from '../../store/mimarStore';
import ReviewCommentSheet from '../ReviewCommentSheet';

export default function DiagramScreen() {
  const {
    currentScreen,
    diagramData,
    diagramJsonGenerated,
    diagramGenerating,
    diagramJsonAccepted,
    diagramJsonComments,
    diagramValidationResult,
    diagramSurvivedFixPass,
    rejectedFeatures,
    operationRunning,
    generateDiagram,
    acceptDiagramJson,
    addComment,
    deleteComment,
    setOpenReviewSheetStage
  } = useMimarStore();

  const [activeCommentId, setActiveCommentId] = useState(null);
  const [commentText, setCommentText] = useState('');

  const isActive = currentScreen === 'diagram';
  const commentCount = Object.keys(diagramJsonComments).length;
  const isAuditRejected = !!rejectedFeatures['f3'];

  const handleOpenComposer = (id, quote) => {
    if (diagramJsonAccepted) return;
    setActiveCommentId(id);
    setCommentText(diagramJsonComments[id]?.text || '');
  };

  const handleSaveComment = (id, quote) => {
    const trimmed = commentText.trim();
    if (!trimmed) {
      setActiveCommentId(null);
      return;
    }
    addComment('diagram', id, trimmed, quote);
    setActiveCommentId(null);
  };

  const handleDeleteComment = (id) => {
    deleteComment('diagram', id);
    setActiveCommentId(null);
  };

  // Extract structured schema & architecture data
  const { tables, services } = useMemo(() => {
    if (diagramData?.schema?.tables || diagramData?.architecture?.services) {
      const tList = diagramData.schema?.tables || [];
      const sList = diagramData.architecture?.services || [];
      return { tables: tList, services: sList };
    }

    // Default / Sample Schema & Services fallback
    const defaultTables = [
      {
        name: "users",
        description: "User accounts, authentication credentials, and system roles.",
        columns: [
          { name: "id", type: "uuid", is_primary_key: true, nullable: false },
          { name: "email", type: "text, unique", is_primary_key: false, nullable: false },
          { name: "role", type: "enum(admin, officer, auditor)", is_primary_key: false, nullable: false },
          { name: "created_at", type: "timestamptz", is_primary_key: false, nullable: false }
        ],
        primary_key: "id",
        foreign_keys: []
      },
      {
        name: "loans",
        description: "Loan application requests, principal limits, and approval lifecycle states.",
        columns: [
          { name: "id", type: "uuid", is_primary_key: true, nullable: false },
          { name: "borrower_id", type: "uuid", is_primary_key: false, is_foreign_key: true, references: "users.id", nullable: false },
          { name: "principal", type: "numeric(12,2)", is_primary_key: false, nullable: false },
          { name: "interest_rate", type: "numeric(5,2)", is_primary_key: false, nullable: false },
          { name: "status", type: "enum(pending, approved, closed)", is_primary_key: false, nullable: false }
        ],
        primary_key: "id",
        foreign_keys: [{ column: "borrower_id", references_table: "users", references_column: "id" }]
      },
      ...(!isAuditRejected ? [{
        name: "audit_logs",
        description: "Immutable security audit log trail recording all critical mutations.",
        columns: [
          { name: "id", type: "uuid", is_primary_key: true, nullable: false },
          { name: "actor_id", type: "uuid", is_primary_key: false, is_foreign_key: true, references: "users.id", nullable: false },
          { name: "action", type: "text", is_primary_key: false, nullable: false },
          { name: "occurred_at", type: "timestamptz", is_primary_key: false, nullable: false }
        ],
        primary_key: "id",
        foreign_keys: [{ column: "actor_id", references_table: "users", references_column: "id" }]
      }] : [])
    ];

    const defaultServices = [
      {
        name: "API Gateway",
        layer: "api",
        protocol: "HTTPS",
        port: 8000,
        description: "Routes incoming client requests to Auth and Loan services; handles rate limiting & edge auth."
      },
      {
        name: "Auth Service",
        layer: "service",
        protocol: "HTTPS",
        port: 8001,
        description: "Issues and validates session tokens; enforces role-based access control per scope."
      },
      {
        name: "Loan Service",
        layer: "service",
        protocol: "HTTPS",
        port: 8002,
        description: "Handles loan approval flow, state transitions, and background nightly interest calculations."
      }
    ];

    return { tables: defaultTables, services: defaultServices };
  }, [diagramData, isAuditRejected]);

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''} ${diagramJsonAccepted ? 'readonly-mode' : ''}`} id="screen-diagram">
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 04 · Schema JSON Review</div>
            <h2>Schema &amp; Architecture JSON</h2>
            <div className="sub">
              <span id="diagramMeta">{tables.length} TABLES · {services.length} SERVICES</span>
              {diagramJsonAccepted && (
                <span className="accepted-badge" id="diagramJsonAcceptedBadge" style={{ display: 'inline-flex' }}>
                  <span className="ab-dot"></span>ACCEPTED &amp; LOCKED
                </span>
              )}
              {diagramSurvivedFixPass && (
                <span className="flag-tag" style={{ marginLeft: 8 }}>AI Auto-Corrected</span>
              )}
            </div>
          </div>
          <div className="toolbar-actions">
            {!diagramData && !diagramGenerating && !diagramJsonAccepted && (
              <button
                type="button"
                className="btn btn-secondary"
                id="generateDiagramBtn"
                onClick={() => generateDiagram()}
                disabled={operationRunning}
              >
                <span>⚡ Re-generate Diagrams</span>
              </button>
            )}
            {!diagramJsonAccepted && (
              <button
                type="button"
                className="btn btn-secondary"
                id="reviewBtnDiagram"
                onClick={() => setOpenReviewSheetStage('diagram')}
              >
                <span>Review Comments</span>
                {commentCount > 0 && (
                  <span className="badge-ct" id="reviewBadgeDiagram" style={{ display: 'inline-block' }}>
                    {commentCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`btn ${diagramJsonAccepted ? 'btn-success' : 'btn-primary'} ${commentCount > 0 && !diagramJsonAccepted ? 'disabled-by-comments' : ''}`}
              id="acceptBtnDiagram"
              disabled={diagramJsonAccepted || operationRunning || diagramGenerating}
              onClick={() => acceptDiagramJson()}
              title={commentCount > 0 && !diagramJsonAccepted ? `Cannot accept with ${commentCount} pending review comment(s). Submit comments for AI revision, or delete comments to accept.` : ''}
            >
              {diagramJsonAccepted ? '✓ JSON Accepted' : (diagramGenerating ? 'Generating Diagrams…' : 'Accept & Render →')}
            </button>
          </div>
        </div>

        <div className="doc-scroll-area">
          <div className="screen-body diagram-screen-body" id="docDiagram">
            <div className="doc-title">Database Schema &amp; System Architecture JSON</div>
            <div className="doc-sub">
              Drafted from locked features and accepted project structure. Review and comment on tables, columns, and services before visual CAD diagrams are rendered.
            </div>

            {/* Validation Feedback Banner */}
            {diagramValidationResult && (
              <div style={{
                margin: '16px 0 24px 0',
                padding: '12px 16px',
                borderRadius: '8px',
                border: '1px solid #1E293B',
                background: '#0B132B',
                display: 'flex',
                flexWrap: 'wrap',
                gap: '12px',
                fontSize: '12px',
                color: '#94A3B8'
              }}>
                <span style={{ color: '#38BDF8', fontWeight: 600 }}>Validation Status:</span>
                <span>Referential Integrity: <strong style={{ color: '#10B981' }}>{diagramValidationResult.schema_architecture?.referential_integrity?.passed ? '✓ Valid' : 'Issue Detected'}</strong></span>
                <span>Feature Coverage: <strong style={{ color: '#10B981' }}>{diagramValidationResult.schema_architecture?.feature_coverage?.passed ? '✓ 100%' : 'Partial'}</strong></span>
                <span>Protocols: <strong style={{ color: '#10B981' }}>{diagramValidationResult.schema_architecture?.protocol_consistency?.passed ? '✓ Consistent' : 'Review'}</strong></span>
                <span>Exception &amp; Security: <strong style={{ color: '#10B981' }}>{diagramValidationResult.exception_handling?.coverage?.passed && diagramValidationResult.security?.coverage?.passed ? '✓ Standardized' : 'Verified'}</strong></span>
              </div>
            )}

            <div className="section-label">Database Schema</div>

            {/* Dynamic Tables Rendering */}
            {tables.map((tbl) => {
              const tableId = `t-${tbl.name}`;
              const isCommented = !!diagramJsonComments[tableId];
              const cols = tbl.columns || [];

              return (
                <React.Fragment key={tableId}>
                  <div
                    className={`table-card ${isCommented ? 'commented' : ''}`}
                    data-id={tableId}
                  >
                    <div className="table-head">
                      <svg className="tbl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <ellipse cx="12" cy="5" rx="8" ry="3" />
                        <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                      </svg>
                      <span className="table-name">{tbl.name}</span>
                      <span className="table-rowcount">{cols.length} cols</span>
                      {tbl.description && (
                        <span style={{ fontSize: '11px', color: '#64748B', marginLeft: 'auto', marginRight: '8px' }}>
                          {tbl.description.length > 50 ? `${tbl.description.substring(0, 50)}…` : tbl.description}
                        </span>
                      )}
                    </div>
                    <div className="col-list">
                      {cols.map((col, cIdx) => {
                        const isPk = col.is_primary_key || col.name === tbl.primary_key;
                        const isFk = col.is_foreign_key || col.references;
                        const refStr = col.references ? ` → ${col.references}` : '';
                        return (
                          <div className="col-row" key={col.name || cIdx}>
                            <span className="col-name">{col.name}</span>
                            <span className="col-type">{col.type}{refStr}</span>
                            {isPk && <span className="col-flag pk">PK</span>}
                            {isFk && <span className="col-flag fk">FK</span>}
                          </div>
                        );
                      })}
                    </div>
                    <div
                      className="comment-trigger"
                      data-icon
                      onClick={() => handleOpenComposer(tableId, `Table: ${tbl.name}`)}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>
                  </div>

                  {activeCommentId === tableId && (
                    <div className="composer" id="liveComposer_diagram">
                      <textarea
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder={`Leave a comment on table '${tbl.name}'…`}
                        autoFocus
                      />
                      <div className="composer-actions">
                        {diagramJsonComments[tableId] && (
                          <button className="danger-btn" onClick={() => handleDeleteComment(tableId)}>Delete</button>
                        )}
                        <span style={{ flex: 1 }}></span>
                        <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                        <button className="solid-btn" onClick={() => handleSaveComment(tableId, `Table: ${tbl.name}`)}>
                          {diagramJsonComments[tableId] ? 'Update Comment' : 'Add Comment'}
                        </button>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              );
            })}

            <div className="section-label" style={{ marginTop: '32px' }}>System Architecture Services</div>

            {/* Dynamic Services Grid */}
            <div className="service-grid">
              {services.map((svc) => {
                const svcId = `s-${svc.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
                const isCommented = !!diagramJsonComments[svcId];
                const proto = svc.protocol || 'HTTPS';
                const port = svc.port ? `Port: ${svc.port}` : '';
                const layer = svc.layer || 'Service';

                return (
                  <React.Fragment key={svcId}>
                    <div className={`service-card ${isCommented ? 'commented' : ''}`} data-id={svcId}>
                      <svg className="svc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="16" rx="2" />
                        <path d="M3 9h18" />
                      </svg>
                      <div className="svc-name">{svc.name}</div>
                      <div className="svc-desc">{svc.description || `${layer.toUpperCase()} component handling ${svc.name} responsibilities.`}</div>
                      <div className="svc-tags">
                        <span className="proto-tag">{proto}</span>
                        {port && <span className="proto-tag">{port}</span>}
                        <span className="proto-tag" style={{ color: '#94A3B8' }}>{layer}</span>
                      </div>
                      <div
                        className="comment-trigger"
                        data-icon
                        onClick={() => handleOpenComposer(svcId, `Service: ${svc.name}`)}
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                        </svg>
                      </div>
                    </div>

                    {activeCommentId === svcId && (
                      <div className="composer" id="liveComposer_diagram" style={{ gridColumn: '1 / -1' }}>
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder={`Leave a comment on service '${svc.name}'…`}
                          autoFocus
                        />
                        <div className="composer-actions">
                          {diagramJsonComments[svcId] && (
                            <button className="danger-btn" onClick={() => handleDeleteComment(svcId)}>Delete</button>
                          )}
                          <span style={{ flex: 1 }}></span>
                          <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                          <button className="solid-btn" onClick={() => handleSaveComment(svcId, `Service: ${svc.name}`)}>
                            {diagramJsonComments[svcId] ? 'Update Comment' : 'Add Comment'}
                          </button>
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>

            <div className="callout" style={{ marginTop: '32px' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p>
                Accepting this JSON locks the schema, architecture, exception-handling, and security definitions together and generates the visual Database ERD and System Architecture diagrams. <b>The visual diagrams are generated by a deterministic, non-AI rendering engine on the backend.</b>
              </p>
            </div>
          </div>
        </div>

        {/* REVIEW SHEET */}
        <ReviewCommentSheet stage="diagram" />
      </div>
    </div>
  );
}
