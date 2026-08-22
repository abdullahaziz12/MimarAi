"use client";

import React, { useState } from 'react';
import { useMimarStore } from '../../store/mimarStore';
import ReviewCommentSheet from '../ReviewCommentSheet';

export default function DiagramScreen() {
  const {
    currentScreen,
    diagramJsonAccepted,
    diagramJsonComments,
    rejectedFeatures,
    operationRunning,
    addComment,
    deleteComment,
    acceptDiagramJson,
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

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''} ${diagramJsonAccepted ? 'readonly-mode' : ''}`} id="screen-diagram">
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 04 · Schema JSON Review</div>
            <h2>Schema &amp; Architecture JSON</h2>
            <div className="sub">
              <span>{isAuditRejected ? '2 TABLES · 3 SERVICES' : '3 TABLES · 3 SERVICES'}</span>
              {diagramJsonAccepted && (
                <span className="accepted-badge" id="diagramJsonAcceptedBadge" style={{ display: 'inline-flex' }}>
                  <span className="ab-dot"></span>ACCEPTED &amp; LOCKED
                </span>
              )}
            </div>
          </div>
          <div className="toolbar-actions">
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
              disabled={diagramJsonAccepted || operationRunning}
              onClick={acceptDiagramJson}
              title={commentCount > 0 && !diagramJsonAccepted ? `Cannot accept with ${commentCount} pending review comment(s). Submit comments for AI revision, or delete comments to accept.` : ''}
            >
              {diagramJsonAccepted ? '✓ JSON Accepted' : 'Accept & Render →'}
            </button>
          </div>
        </div>

        <div className="doc-scroll-area">
          <div className="screen-body diagram-screen-body" id="docDiagram">
            <div className="doc-title">Database Schema &amp; Microservices JSON</div>
            <div className="doc-sub">
              Drafted from locked features and project inputs. This is the structured JSON before rendering. Comment on any entity before CAD drawings are drafted.
            </div>

            <div className="section-label">Database Schema</div>

            {/* users table */}
            <div
              className={`table-card ${diagramJsonComments['t-users'] ? 'commented' : ''}`}
              data-id="t-users"
            >
              <div className="table-head">
                <svg className="tbl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="8" ry="3" />
                  <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                </svg>
                <span className="table-name">users</span>
                <span className="table-rowcount">4 cols</span>
              </div>
              <div className="col-list">
                <div className="col-row"><span className="col-name">id</span><span className="col-type">uuid</span><span className="col-flag pk">PK</span></div>
                <div className="col-row"><span className="col-name">email</span><span className="col-type">text, unique</span></div>
                <div className="col-row"><span className="col-name">role</span><span className="col-type">enum(admin, officer, auditor)</span></div>
                <div className="col-row"><span className="col-name">created_at</span><span className="col-type">timestamptz</span></div>
              </div>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('t-users', 'Table: users')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 't-users' && (
              <div className="composer" id="liveComposer_diagram">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {diagramJsonComments['t-users'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('t-users')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('t-users', 'Table: users')}>
                    {diagramJsonComments['t-users'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            {/* loans table */}
            <div
              className={`table-card ${diagramJsonComments['t-loans'] ? 'commented' : ''}`}
              data-id="t-loans"
            >
              <div className="table-head">
                <svg className="tbl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <ellipse cx="12" cy="5" rx="8" ry="3" />
                  <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                </svg>
                <span className="table-name">loans</span>
                <span className="table-rowcount">5 cols</span>
              </div>
              <div className="col-list">
                <div className="col-row"><span className="col-name">id</span><span className="col-type">uuid</span><span className="col-flag pk">PK</span></div>
                <div className="col-row"><span className="col-name">borrower_id</span><span className="col-type">uuid → users.id</span><span className="col-flag fk">FK</span></div>
                <div className="col-row"><span className="col-name">principal</span><span className="col-type">numeric(12,2)</span></div>
                <div className="col-row"><span className="col-name">interest_rate</span><span className="col-type">numeric(5,2)</span></div>
                <div className="col-row"><span className="col-name">status</span><span className="col-type">enum(pending, approved, closed)</span></div>
              </div>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('t-loans', 'Table: loans')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 't-loans' && (
              <div className="composer" id="liveComposer_diagram">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {diagramJsonComments['t-loans'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('t-loans')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('t-loans', 'Table: loans')}>
                    {diagramJsonComments['t-loans'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            {/* audit_logs table (if not rejected) */}
            {!isAuditRejected && (
              <div
                className={`table-card ${diagramJsonComments['t-audit'] ? 'commented' : ''}`}
                data-id="t-audit"
              >
                <div className="table-head">
                  <svg className="tbl-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <ellipse cx="12" cy="5" rx="8" ry="3" />
                    <path d="M4 5v6c0 1.66 3.58 3 8 3s8-1.34 8-3V5M4 11v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6" />
                  </svg>
                  <span className="table-name">audit_logs</span>
                  <span className="table-rowcount">4 cols</span>
                </div>
                <div className="col-list">
                  <div className="col-row"><span className="col-name">id</span><span className="col-type">uuid</span><span className="col-flag pk">PK</span></div>
                  <div className="col-row"><span className="col-name">actor_id</span><span className="col-type">uuid → users.id</span><span className="col-flag fk">FK</span></div>
                  <div className="col-row"><span className="col-name">action</span><span className="col-type">text</span></div>
                  <div className="col-row"><span className="col-name">occurred_at</span><span className="col-type">timestamptz</span></div>
                </div>
                <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('t-audit', 'Table: audit_logs')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </div>
              </div>
            )}
            {activeCommentId === 't-audit' && (
              <div className="composer" id="liveComposer_diagram">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {diagramJsonComments['t-audit'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('t-audit')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('t-audit', 'Table: audit_logs')}>
                    {diagramJsonComments['t-audit'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className="section-label">System Architecture Services</div>

            <div className="service-grid">
              <div className={`service-card ${diagramJsonComments['s-gateway'] ? 'commented' : ''}`} data-id="s-gateway">
                <svg className="svc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="3" y="4" width="18" height="16" rx="2" />
                  <path d="M3 9h18" />
                </svg>
                <div className="svc-name">API Gateway</div>
                <div className="svc-desc">Routes incoming client requests to Auth and Loan services; handles rate limiting &amp; edge auth.</div>
                <div className="svc-tags"><span className="proto-tag">HTTPS</span><span className="proto-tag">Next.js Edge</span></div>
                <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('s-gateway', 'Service: API Gateway')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </div>
              </div>
              {activeCommentId === 's-gateway' && (
                <div className="composer" id="liveComposer_diagram">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Leave a comment on this item…"
                    autoFocus
                  />
                  <div className="composer-actions">
                    {diagramJsonComments['s-gateway'] && (
                      <button className="danger-btn" onClick={() => handleDeleteComment('s-gateway')}>Delete</button>
                    )}
                    <span style={{ flex: 1 }}></span>
                    <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                    <button className="solid-btn" onClick={() => handleSaveComment('s-gateway', 'Service: API Gateway')}>
                      {diagramJsonComments['s-gateway'] ? 'Update Comment' : 'Add Comment'}
                    </button>
                  </div>
                </div>
              )}

              <div className={`service-card ${diagramJsonComments['s-auth'] ? 'commented' : ''}`} data-id="s-auth">
                <svg className="svc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="5" y="11" width="14" height="9" rx="2" />
                  <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                </svg>
                <div className="svc-name">Auth Service</div>
                <div className="svc-desc">Issues and validates session tokens; enforces role-based access control per scope.</div>
                <div className="svc-tags"><span className="proto-tag">HTTPS</span><span className="proto-tag">FastAPI · JWT</span></div>
                <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('s-auth', 'Service: Auth Service')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </div>
              </div>
              {activeCommentId === 's-auth' && (
                <div className="composer" id="liveComposer_diagram">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Leave a comment on this item…"
                    autoFocus
                  />
                  <div className="composer-actions">
                    {diagramJsonComments['s-auth'] && (
                      <button className="danger-btn" onClick={() => handleDeleteComment('s-auth')}>Delete</button>
                    )}
                    <span style={{ flex: 1 }}></span>
                    <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                    <button className="solid-btn" onClick={() => handleSaveComment('s-auth', 'Service: Auth Service')}>
                      {diagramJsonComments['s-auth'] ? 'Update Comment' : 'Add Comment'}
                    </button>
                  </div>
                </div>
              )}

              <div className={`service-card ${diagramJsonComments['s-loan'] ? 'commented' : ''}`} data-id="s-loan">
                <svg className="svc-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v20M2 12h20" />
                </svg>
                <div className="svc-name">Loan Service</div>
                <div className="svc-desc">Handles loan approval flow, state transitions, and background nightly interest calculations.</div>
                <div className="svc-tags"><span className="proto-tag">HTTPS</span><span className="proto-tag">FastAPI · Cron</span></div>
                <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('s-loan', 'Service: Loan Service')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </div>
              </div>
              {activeCommentId === 's-loan' && (
                <div className="composer" id="liveComposer_diagram">
                  <textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Leave a comment on this item…"
                    autoFocus
                  />
                  <div className="composer-actions">
                    {diagramJsonComments['s-loan'] && (
                      <button className="danger-btn" onClick={() => handleDeleteComment('s-loan')}>Delete</button>
                    )}
                    <span style={{ flex: 1 }}></span>
                    <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                    <button className="solid-btn" onClick={() => handleSaveComment('s-loan', 'Service: Loan Service')}>
                      {diagramJsonComments['s-loan'] ? 'Update Comment' : 'Add Comment'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="callout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p>
                Accepting this JSON hands the definitions to our deterministic CAD blueprint engine to produce the visual System Architecture and Database ERD diagrams. <b>The AI never draws the diagrams directly.</b>
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
