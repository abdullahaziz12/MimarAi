"use client";

import React, { useState } from 'react';
import { useMimarStore } from '../../store/mimarStore';
import ReviewCommentSheet from '../ReviewCommentSheet';

export default function FinalScreen() {
  const {
    currentScreen,
    finalAccepted,
    finalComments,
    rejectedFeatures,
    operationRunning,
    addComment,
    deleteComment,
    acceptFinalPlan,
    setOpenReviewSheetStage
  } = useMimarStore();

  const [activeCommentId, setActiveCommentId] = useState(null);
  const [commentText, setCommentText] = useState('');

  const isActive = currentScreen === 'final';
  const commentCount = Object.keys(finalComments).length;

  const isAuditRejected = !!rejectedFeatures['f3'];
  const isRecalcRejected = !!rejectedFeatures['f4'];

  const handleOpenComposer = (id, quote) => {
    if (finalAccepted) return;
    setActiveCommentId(id);
    setCommentText(finalComments[id]?.text || '');
  };

  const handleSaveComment = (id, quote) => {
    const trimmed = commentText.trim();
    if (!trimmed) {
      setActiveCommentId(null);
      return;
    }
    addComment('final', id, trimmed, quote);
    setActiveCommentId(null);
  };

  const handleDeleteComment = (id) => {
    deleteComment('final', id);
    setActiveCommentId(null);
  };

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''} ${finalAccepted ? 'readonly-mode' : ''}`} id="screen-final">
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 06 · Consolidated Plan Review</div>
            <h2>Final Implementation Plan</h2>
            <div className="sub">
              <span>FEATURES · STRUCTURE · DIAGRAM — MERGED &amp; VERIFIED</span>
              {finalAccepted && (
                <span className="accepted-badge" id="finalAcceptedBadge" style={{ display: 'inline-flex' }}>
                  <span className="ab-dot"></span>LOCKED SPEC
                </span>
              )}
            </div>
          </div>
          <div className="toolbar-actions">
            {!finalAccepted && (
              <button
                type="button"
                className="btn btn-secondary"
                id="reviewBtnFinal"
                onClick={() => setOpenReviewSheetStage('final')}
              >
                <span>Review Comments</span>
                {commentCount > 0 && (
                  <span className="badge-ct" id="reviewBadgeFinal" style={{ display: 'inline-block' }}>
                    {commentCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`btn ${finalAccepted ? 'btn-success' : 'btn-primary'} ${commentCount > 0 && !finalAccepted ? 'disabled-by-comments' : ''}`}
              id="acceptBtnFinal"
              disabled={finalAccepted || operationRunning}
              onClick={acceptFinalPlan}
              title={commentCount > 0 && !finalAccepted ? `Cannot dispatch plan with ${commentCount} pending comment(s). Click "Review Comments" to submit them for AI revision, or delete your comments to dispatch.` : ''}
            >
              {finalAccepted ? '✓ Dispatched to Agent' : 'Send to Agent →'}
            </button>
          </div>
        </div>

        <div className="doc-scroll-area">
          <div className="screen-body" id="docFinal">
            <div className="doc-title">Consolidated Blueprint Specification</div>
            <div className="doc-sub">
              The complete, verified plan handed to your coding agent via live MCP Server or standalone PDF package. Click any line to comment before final dispatch.
            </div>

            <div className="section-label">Section 1: Accepted Features &amp; Constraints</div>

            <div className={`block ${finalComments['ff1'] ? 'commented' : ''}`} data-id="ff1">
              <div className="feature-row"><span className="feature-name">Role-Based Access Control</span></div>
              <span className="kv">Admins, loan officers, and auditors each get scoped JWT permissions.</span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('ff1', 'Role-Based Access Control')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'ff1' && (
              <div className="composer" id="liveComposer_final">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {finalComments['ff1'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('ff1')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('ff1', 'Role-Based Access Control')}>
                    {finalComments['ff1'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className={`block ${finalComments['ff2'] ? 'commented' : ''}`} data-id="ff2">
              <div className="feature-row"><span className="feature-name">Loan &amp; Interest Management</span></div>
              <span className="kv">Create, approve, and track loans with configurable interest rules and validation.</span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('ff2', 'Loan & Interest Management')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'ff2' && (
              <div className="composer" id="liveComposer_final">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {finalComments['ff2'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('ff2')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('ff2', 'Loan & Interest Management')}>
                    {finalComments['ff2'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            {!isAuditRejected && (
              <div className={`block ${finalComments['ff3'] ? 'commented' : ''}`} data-id="ff3">
                <div className="feature-row"><span className="feature-name">Audit Logging</span><span className="ai-tag">AI-added</span></div>
                <span className="kv">Every approval and rate change is recorded asynchronously with actor and timestamp.</span>
                <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('ff3', 'Audit Logging')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </div>
              </div>
            )}
            {activeCommentId === 'ff3' && (
              <div className="composer" id="liveComposer_final">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {finalComments['ff3'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('ff3')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('ff3', 'Audit Logging')}>
                    {finalComments['ff3'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            {!isRecalcRejected && (
              <div className={`block ${finalComments['ff4'] ? 'commented' : ''}`} data-id="ff4">
                <div className="feature-row"><span className="feature-name">Automated Interest Recalculation</span><span className="ai-tag">AI-added</span></div>
                <span className="kv">Recalculates outstanding balances nightly against the rate table via background cron.</span>
                <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('ff4', 'Automated Interest Recalculation')}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                  </svg>
                </div>
              </div>
            )}
            {activeCommentId === 'ff4' && (
              <div className="composer" id="liveComposer_final">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {finalComments['ff4'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('ff4')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('ff4', 'Automated Interest Recalculation')}>
                    {finalComments['ff4'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className="section-label">Section 2: Accepted Structure JSON Tree</div>
            <div className={`block ${finalComments['ffs1'] ? 'commented' : ''}`} data-id="ffs1">
              <span className="kv">Deterministic file-to-feature mapping parsed directly by the Drift-Checker:</span>
              <div className="json-summary">
                {`{`}
                <br />
                &nbsp;&nbsp;<span className="jk">"src/routes/loan.py"</span>: ["Loan &amp; Interest Management"],
                <br />
                &nbsp;&nbsp;<span className="jk">"src/models/loan.py"</span>: ["Loan &amp; Interest Management"],
                <br />
                &nbsp;&nbsp;<span className="jk">"src/routes/auth.py"</span>: ["Role-Based Access Control"],
                <br />
                &nbsp;&nbsp;<span className="jk">"src/models/refresh_token.py"</span>: ["Role-Based Access Control"]
                {!isAuditRejected && (
                  <>
                    ,<br />
                    &nbsp;&nbsp;<span className="jk">"src/models/audit_log.py"</span>: ["Audit Logging"]
                  </>
                )}
                <br />
                {`}`}
              </div>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('ffs1', 'Accepted Structure JSON Tree')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'ffs1' && (
              <div className="composer" id="liveComposer_final">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {finalComments['ffs1'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('ffs1')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('ffs1', 'Accepted Structure JSON Tree')}>
                    {finalComments['ffs1'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className="section-label">Section 3: Accepted Schema &amp; Microservices</div>
            <div className={`block ${finalComments['ffd1'] ? 'commented' : ''}`} data-id="ffd1">
              <span className="kv">
                {isAuditRejected ? (
                  <>
                    <b>2 database tables</b> (<code>users</code>, <code>loans</code>) &amp; <b>3 microservices</b> (<code>API Gateway</code>, <code>Auth Service</code>, <code>Loan Service</code>). Committed on diagram acceptance.
                  </>
                ) : (
                  <>
                    <b>3 database tables</b> (<code>users</code>, <code>loans</code>, <code>audit_logs</code>) &amp; <b>3 microservices</b> (<code>API Gateway</code>, <code>Auth Service</code>, <code>Loan Service</code>). Committed on diagram acceptance.
                  </>
                )}
              </span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('ffd1', 'Accepted Schema & Microservices')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'ffd1' && (
              <div className="composer" id="liveComposer_final">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {finalComments['ffd1'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('ffd1')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('ffd1', 'Accepted Schema & Microservices')}>
                    {finalComments['ffd1'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className="callout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p>
                Click <b>Send to Agent</b> to dispatch this validated spec to your live MCP server hub, or download the machine-readable plan package.
              </p>
            </div>
          </div>
        </div>

        {/* REVIEW SHEET */}
        <ReviewCommentSheet stage="final" />
      </div>
    </div>
  );
}
