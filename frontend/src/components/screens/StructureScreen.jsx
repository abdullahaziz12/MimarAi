"use client";

import React, { useState } from 'react';
import { useMimarStore } from '../../store/mimarStore';
import ReviewCommentSheet from '../ReviewCommentSheet';

export default function StructureScreen() {
  const {
    currentScreen,
    structureAccepted,
    structureComments,
    rejectedFeatures,
    structureHasRefreshToken,
    operationRunning,
    addComment,
    deleteComment,
    acceptStructure,
    setOpenReviewSheetStage
  } = useMimarStore();

  const [activeCommentId, setActiveCommentId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [openFolders, setOpenFolders] = useState({ routes: true, models: true });

  const isActive = currentScreen === 'structure';
  const commentCount = Object.keys(structureComments).length;
  const isAuditRejected = !!rejectedFeatures['f3'];

  const toggleFolder = (folder) => {
    setOpenFolders(prev => ({ ...prev, [folder]: !prev[folder] }));
  };

  const handleOpenComposer = (id, quote) => {
    if (structureAccepted) return;
    setActiveCommentId(id);
    setCommentText(structureComments[id]?.text || '');
  };

  const handleSaveComment = (id, quote) => {
    const trimmed = commentText.trim();
    if (!trimmed) {
      setActiveCommentId(null);
      return;
    }
    addComment('structure', id, trimmed, quote);
    setActiveCommentId(null);
  };

  const handleDeleteComment = (id) => {
    deleteComment('structure', id);
    setActiveCommentId(null);
  };

  // Compute stats
  let totalFiles = isAuditRejected ? 3 : 4;
  let featuresMapped = isAuditRejected ? 2 : 3;
  if (structureHasRefreshToken) {
    totalFiles += 1;
  }

  let modelsCountText = isAuditRejected ? '1 file' : '2 files';
  if (structureHasRefreshToken) {
    modelsCountText = isAuditRejected ? '2 files' : '3 files';
  }

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''} ${structureAccepted ? 'readonly-mode' : ''}`} id="screen-structure">
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 03 · File Layout Review</div>
            <h2>Project Structure</h2>
            <div className="sub">
              <span id="structMeta">{totalFiles} FILES · {featuresMapped} FEATURES MAPPED</span>
              {structureAccepted && (
                <span className="accepted-badge" id="structAcceptedBadge" style={{ display: 'inline-flex' }}>
                  <span className="ab-dot"></span>ACCEPTED &amp; LOCKED
                </span>
              )}
            </div>
          </div>
          <div className="toolbar-actions">
            {!structureAccepted && (
              <button
                type="button"
                className="btn btn-secondary"
                id="reviewBtnStruct"
                onClick={() => setOpenReviewSheetStage('structure')}
              >
                <span>Review Comments</span>
                {commentCount > 0 && (
                  <span className="badge-ct" id="reviewBadgeStruct" style={{ display: 'inline-block' }}>
                    {commentCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`btn ${structureAccepted ? 'btn-success' : 'btn-primary'} ${commentCount > 0 && !structureAccepted ? 'disabled-by-comments' : ''}`}
              id="acceptBtnStruct"
              disabled={structureAccepted || operationRunning}
              onClick={acceptStructure}
              title={commentCount > 0 && !structureAccepted ? `Cannot accept with ${commentCount} pending review comment(s). Submit comments for AI revision, or delete comments to accept.` : ''}
            >
              {structureAccepted ? '✓ Structure Accepted' : 'Accept Structure →'}
            </button>
          </div>
        </div>

        <div className="doc-scroll-area">
          <div className="screen-body" id="docStruct">
            <div className="doc-title">File &amp; Folder Map</div>
            <div className="doc-sub">
              Generated from your accepted feature list following standard FastAPI patterns. Click any file to comment.
            </div>

            <div className="section-label">src/</div>
            <div className="tree" id="tree">
              {/* Routes Folder */}
              <div
                className={`folder-row ${openFolders.routes ? 'open' : ''}`}
                data-target="g-routes"
                onClick={() => toggleFolder('routes')}
              >
                <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <svg className="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
                <span className="fname">routes/</span>
                <span className="fcount" id="routesCount">2 files</span>
              </div>
              <div className={`file-group ${openFolders.routes ? 'open' : ''}`} id="g-routes">
                <div
                  className={`file-row ${structureComments['f-loan-route'] ? 'commented' : ''}`}
                  data-id="f-loan-route"
                  data-path="src/routes/loan.py"
                >
                  <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <div className="file-main">
                    <div className="file-path">loan<span className="dim">.py</span></div>
                    <div className="file-tags"><span className="feature-tag">Loan &amp; Interest Management</span></div>
                  </div>
                  <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f-loan-route', 'src/routes/loan.py')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                </div>
                {activeCommentId === 'f-loan-route' && (
                  <div className="composer" id="liveComposer_structure">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Leave a comment on this item…"
                      autoFocus
                    />
                    <div className="composer-actions">
                      {structureComments['f-loan-route'] && (
                        <button className="danger-btn" onClick={() => handleDeleteComment('f-loan-route')}>Delete</button>
                      )}
                      <span style={{ flex: 1 }}></span>
                      <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                      <button className="solid-btn" onClick={() => handleSaveComment('f-loan-route', 'src/routes/loan.py')}>
                        {structureComments['f-loan-route'] ? 'Update Comment' : 'Add Comment'}
                      </button>
                    </div>
                  </div>
                )}

                <div
                  className={`file-row ${structureComments['f-auth-route'] ? 'commented' : ''}`}
                  data-id="f-auth-route"
                  data-path="src/routes/auth.py"
                >
                  <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <div className="file-main">
                    <div className="file-path">auth<span className="dim">.py</span></div>
                    <div className="file-tags" id="authTags">
                      <span className="feature-tag">Role-Based Access Control</span>
                      {!structureHasRefreshToken && <span className="flag-tag" id="authFlag">Adjusted — Please Review</span>}
                    </div>
                  </div>
                  <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f-auth-route', 'src/routes/auth.py')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                </div>
                {activeCommentId === 'f-auth-route' && (
                  <div className="composer" id="liveComposer_structure">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Leave a comment on this item…"
                      autoFocus
                    />
                    <div className="composer-actions">
                      {structureComments['f-auth-route'] && (
                        <button className="danger-btn" onClick={() => handleDeleteComment('f-auth-route')}>Delete</button>
                      )}
                      <span style={{ flex: 1 }}></span>
                      <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                      <button className="solid-btn" onClick={() => handleSaveComment('f-auth-route', 'src/routes/auth.py')}>
                        {structureComments['f-auth-route'] ? 'Update Comment' : 'Add Comment'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Models Folder */}
              <div
                className={`folder-row ${openFolders.models ? 'open' : ''}`}
                data-target="g-models"
                onClick={() => toggleFolder('models')}
              >
                <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M9 18l6-6-6-6" />
                </svg>
                <svg className="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
                <span className="fname">models/</span>
                <span className="fcount" id="modelsCount">{modelsCountText}</span>
              </div>
              <div className={`file-group ${openFolders.models ? 'open' : ''}`} id="g-models">
                <div
                  className={`file-row ${structureComments['f-loan-model'] ? 'commented' : ''}`}
                  data-id="f-loan-model"
                  data-path="src/models/loan.py"
                >
                  <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <path d="M14 2v6h6" />
                  </svg>
                  <div className="file-main">
                    <div className="file-path">loan<span className="dim">.py</span></div>
                    <div className="file-tags"><span className="feature-tag">Loan &amp; Interest Management</span></div>
                  </div>
                  <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f-loan-model', 'src/models/loan.py')}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                    </svg>
                  </div>
                </div>
                {activeCommentId === 'f-loan-model' && (
                  <div className="composer" id="liveComposer_structure">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Leave a comment on this item…"
                      autoFocus
                    />
                    <div className="composer-actions">
                      {structureComments['f-loan-model'] && (
                        <button className="danger-btn" onClick={() => handleDeleteComment('f-loan-model')}>Delete</button>
                      )}
                      <span style={{ flex: 1 }}></span>
                      <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                      <button className="solid-btn" onClick={() => handleSaveComment('f-loan-model', 'src/models/loan.py')}>
                        {structureComments['f-loan-model'] ? 'Update Comment' : 'Add Comment'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Audit Log Model if not rejected */}
                {!isAuditRejected && (
                  <div
                    className={`file-row ${structureComments['f-audit-model'] ? 'commented' : ''}`}
                    data-id="f-audit-model"
                    data-path="src/models/audit_log.py"
                  >
                    <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <div className="file-main">
                      <div className="file-path">audit_log<span className="dim">.py</span></div>
                      <div className="file-tags">
                        <span className="feature-tag">Audit Logging</span>
                        <span className="ai-tag">AI-added</span>
                      </div>
                    </div>
                    <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f-audit-model', 'src/models/audit_log.py')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>
                  </div>
                )}
                {activeCommentId === 'f-audit-model' && (
                  <div className="composer" id="liveComposer_structure">
                    <textarea
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value)}
                      placeholder="Leave a comment on this item…"
                      autoFocus
                    />
                    <div className="composer-actions">
                      {structureComments['f-audit-model'] && (
                        <button className="danger-btn" onClick={() => handleDeleteComment('f-audit-model')}>Delete</button>
                      )}
                      <span style={{ flex: 1 }}></span>
                      <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                      <button className="solid-btn" onClick={() => handleSaveComment('f-audit-model', 'src/models/audit_log.py')}>
                        {structureComments['f-audit-model'] ? 'Update Comment' : 'Add Comment'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Optional token model if revision applied */}
                {structureHasRefreshToken && (
                  <div
                    className="file-row new-file"
                    id="f-token-model"
                    data-id="f-token-model"
                    data-path="src/models/refresh_token.py"
                  >
                    <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                      <path d="M14 2v6h6" />
                    </svg>
                    <div className="file-main">
                      <div className="file-path">refresh_token<span className="dim">.py</span></div>
                      <div className="file-tags">
                        <span className="feature-tag">Role-Based Access Control</span>
                        <span className="ai-tag">AI-added</span>
                      </div>
                    </div>
                    <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f-token-model', 'src/models/refresh_token.py')}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="callout">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="9" />
                <path d="M12 8v5M12 16h.01" />
              </svg>
              <p>
                This structure forms the machine-readable <code>structure</code> JSON map that the <b>Drift-Checker</b> parses after implementation to verify that all features are implemented in their expected file locations.
              </p>
            </div>
          </div>
        </div>

        {/* REVIEW SHEET */}
        <ReviewCommentSheet stage="structure" />
      </div>
    </div>
  );
}
