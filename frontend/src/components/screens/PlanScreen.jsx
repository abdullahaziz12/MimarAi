"use client";

import React, { useState } from 'react';
import { useMimarStore } from '../../store/mimarStore';
import ReviewCommentSheet from '../ReviewCommentSheet';

export default function PlanScreen() {
  const {
    currentScreen,
    planAccepted,
    planComments,
    rejectedFeatures,
    operationRunning,
    toggleFeatureReject,
    addComment,
    deleteComment,
    acceptPlan,
    setOpenReviewSheetStage
  } = useMimarStore();

  const [activeCommentId, setActiveCommentId] = useState(null);
  const [commentText, setCommentText] = useState('');

  const isActive = currentScreen === 'plan';
  const commentCount = Object.keys(planComments).length;

  const handleOpenComposer = (id, quote) => {
    if (planAccepted) return;
    setActiveCommentId(id);
    setCommentText(planComments[id]?.text || '');
  };

  const handleSaveComment = (id, quote) => {
    const trimmed = commentText.trim();
    if (!trimmed) {
      setActiveCommentId(null);
      return;
    }
    addComment('plan', id, trimmed, quote);
    setActiveCommentId(null);
  };

  const handleDeleteComment = (id) => {
    deleteComment('plan', id);
    setActiveCommentId(null);
  };

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''} ${planAccepted ? 'readonly-mode' : ''}`} id="screen-plan">
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 02 · Feature Review</div>
            <h2>Implementation Plan</h2>
            <div className="sub">
              <span>GENERATED VIA DUAL-MODEL PIPELINE</span>
              {planAccepted && (
                <span className="accepted-badge" id="planAcceptedBadge" style={{ display: 'inline-flex' }}>
                  <span className="ab-dot"></span>ACCEPTED &amp; LOCKED
                </span>
              )}
            </div>
          </div>
          <div className="toolbar-actions">
            {!planAccepted && (
              <button
                type="button"
                className="btn btn-secondary"
                id="reviewBtnPlan"
                onClick={() => setOpenReviewSheetStage('plan')}
              >
                <span>Review Comments</span>
                {commentCount > 0 && (
                  <span className="badge-ct" id="reviewBadgePlan" style={{ display: 'inline-block' }}>
                    {commentCount}
                  </span>
                )}
              </button>
            )}
            <button
              type="button"
              className={`btn ${planAccepted ? 'btn-success' : 'btn-primary'} ${commentCount > 0 && !planAccepted ? 'disabled-by-comments' : ''}`}
              id="acceptBtnPlan"
              disabled={planAccepted || operationRunning}
              onClick={acceptPlan}
              title={commentCount > 0 && !planAccepted ? `Cannot accept with ${commentCount} pending review comment(s). Submit comments for AI revision, or delete comments to accept.` : ''}
            >
              {planAccepted ? '✓ Plan Accepted' : 'Accept Plan →'}
            </button>
          </div>
        </div>

        <div className="doc-scroll-area">
          <div className="screen-body" id="docContentPlan">
            <div className="doc-title">MimarAi — "Loan Desk Studio"</div>
            <div className="doc-sub">
              Dual-model cross-checked feature plan. Click any section to comment, or click Accept Plan to lock and progress.
            </div>

            <div className="section-label">Idea &amp; Objective</div>
            <div
              className={`block ${planComments['idea'] ? 'commented' : ''}`}
              data-id="idea"
            >
              A precision-engineering web app that acts as an AI architect for developers and students — it removes "vibe-coding blind" by running an idea through a dual-model pipeline before a single line of code is written.
              <div
                className="comment-trigger"
                data-icon
                onClick={() => handleOpenComposer('idea', 'Idea & Objective')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'idea' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['idea'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('idea')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('idea', 'Idea & Objective')}>
                    {planComments['idea'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className="section-label">Fixed Inputs</div>
            <div className={`block ${planComments['stack'] ? 'commented' : ''}`} data-id="stack">
              <span className="kv">Tech stack — <b>Next.js (App Router) + FastAPI + SQLAlchemy</b></span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('stack', 'Tech stack')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'stack' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['stack'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('stack')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('stack', 'Tech stack')}>
                    {planComments['stack'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className={`block ${planComments['db'] ? 'commented' : ''}`} data-id="db">
              <span className="kv">Database — <b>Supabase (PostgreSQL with RLS)</b></span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('db', 'Database')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'db' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['db'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('db')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('db', 'Database')}>
                    {planComments['db'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className={`block ${planComments['deploy'] ? 'commented' : ''}`} data-id="deploy">
              <span className="kv">Deployment — <b>Vercel (Frontend) + Render (FastAPI / MCP Server)</b></span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('deploy', 'Deployment')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'deploy' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['deploy'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('deploy')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('deploy', 'Deployment')}>
                    {planComments['deploy'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className="section-label">Features</div>
            <div className={`block ${planComments['f1'] ? 'commented' : ''}`} data-id="f1">
              <div className="feature-row"><span className="feature-name">Role-Based Access Control</span></div>
              <span className="kv">Admins, loan officers, and auditors each get strictly scoped JWT permissions.</span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f1', 'Role-Based Access Control')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'f1' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['f1'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('f1')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('f1', 'Role-Based Access Control')}>
                    {planComments['f1'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            <div className={`block ${planComments['f2'] ? 'commented' : ''}`} data-id="f2">
              <div className="feature-row"><span className="feature-name">Loan &amp; Interest Management</span></div>
              <span className="kv">Create, approve, and track loans with configurable interest rules and principal ranges.</span>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f2', 'Loan & Interest Management')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'f2' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['f2'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('f2')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('f2', 'Loan & Interest Management')}>
                    {planComments['f2'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            {/* AI-ADDED FEATURE 3 */}
            <div className={`block ${rejectedFeatures['f3'] ? 'rejected' : ''} ${planComments['f3'] ? 'commented' : ''}`} data-id="f3">
              <div className="feature-row">
                <span className="feature-name">Audit Logging</span>
                <span className="ai-tag">AI-added</span>
                {rejectedFeatures['f3'] && <span className="rejected-chip">REJECTED</span>}
                <div className="feature-actions">
                  <button
                    type="button"
                    className={`feature-action-btn ${rejectedFeatures['f3'] ? 'undo-btn' : 'reject-btn'}`}
                    disabled={planAccepted}
                    onClick={() => toggleFeatureReject('f3')}
                    title={rejectedFeatures['f3'] ? 'Undo rejection and restore this feature' : 'Reject this AI-added feature'}
                  >
                    {rejectedFeatures['f3'] ? 'Undo' : 'Reject'}
                  </button>
                </div>
              </div>
              <span className="kv">Every approval and rate change is recorded asynchronously with actor and timestamp.</span>
              <div className="rejected-msg" style={{ display: rejectedFeatures['f3'] ? 'flex' : 'none' }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>This feature was rejected and will be excluded from the accepted plan.</span>
              </div>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f3', 'Audit Logging')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'f3' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['f3'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('f3')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('f3', 'Audit Logging')}>
                    {planComments['f3'] ? 'Update Comment' : 'Add Comment'}
                  </button>
                </div>
              </div>
            )}

            {/* AI-ADDED FEATURE 4 */}
            <div className={`block ${rejectedFeatures['f4'] ? 'rejected' : ''} ${planComments['f4'] ? 'commented' : ''}`} data-id="f4">
              <div className="feature-row">
                <span className="feature-name">Automated Interest Recalculation</span>
                <span className="ai-tag">AI-added</span>
                {rejectedFeatures['f4'] && <span className="rejected-chip">REJECTED</span>}
                <div className="feature-actions">
                  <button
                    type="button"
                    className={`feature-action-btn ${rejectedFeatures['f4'] ? 'undo-btn' : 'reject-btn'}`}
                    disabled={planAccepted}
                    onClick={() => toggleFeatureReject('f4')}
                    title={rejectedFeatures['f4'] ? 'Undo rejection and restore this feature' : 'Reject this AI-added feature'}
                  >
                    {rejectedFeatures['f4'] ? 'Undo' : 'Reject'}
                  </button>
                </div>
              </div>
              <span className="kv">Recalculates outstanding balances nightly against the rate table via background cron.</span>
              <div className="rejected-msg" style={{ display: rejectedFeatures['f4'] ? 'flex' : 'none' }}>
                <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2.2">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
                <span>This feature was rejected and will be excluded from the accepted plan.</span>
              </div>
              <div className="comment-trigger" data-icon onClick={() => handleOpenComposer('f4', 'Automated Interest Recalculation')}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                </svg>
              </div>
            </div>
            {activeCommentId === 'f4' && (
              <div className="composer" id="liveComposer_plan">
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a comment on this item…"
                  autoFocus
                />
                <div className="composer-actions">
                  {planComments['f4'] && (
                    <button className="danger-btn" onClick={() => handleDeleteComment('f4')}>Delete</button>
                  )}
                  <span style={{ flex: 1 }}></span>
                  <button className="ghost-btn" onClick={() => setActiveCommentId(null)}>Cancel</button>
                  <button className="solid-btn" onClick={() => handleSaveComment('f4', 'Automated Interest Recalculation')}>
                    {planComments['f4'] ? 'Update Comment' : 'Add Comment'}
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
                Accepting this plan locks the feature scope. Next, MimarAi will generate the deterministic file &amp; folder layout conforming to FastAPI standard conventions.
              </p>
            </div>
          </div>
        </div>

        {/* REVIEW SHEET */}
        <ReviewCommentSheet stage="plan" />
      </div>
    </div>
  );
}
