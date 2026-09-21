"use client";

import React, { useState, useMemo } from 'react';
import { useMimarStore } from '../../store/mimarStore';
import ReviewCommentSheet from '../ReviewCommentSheet';

export default function StructureScreen() {
  const {
    currentScreen,
    structureData,
    structureGenerated,
    structureGenerating,
    structureAccepted,
    structureComments,
    structureValidationResult,
    structureSurvivedFixPass,
    rejectedFeatures,
    structureHasRefreshToken,
    operationRunning,
    generateStructure,
    acceptStructure,
    addComment,
    deleteComment,
    setOpenReviewSheetStage
  } = useMimarStore();

  const [activeCommentId, setActiveCommentId] = useState(null);
  const [commentText, setCommentText] = useState('');
  const [openFolders, setOpenFolders] = useState({});

  const isActive = currentScreen === 'structure';
  const commentCount = Object.keys(structureComments).length;
  const isAuditRejected = !!rejectedFeatures['f3'];

  const toggleFolder = (folder) => {
    setOpenFolders(prev => ({
      ...prev,
      [folder]: prev[folder] === undefined ? false : !prev[folder]
    }));
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

  // Transform flat structureData into grouped folder tree
  const treeData = useMemo(() => {
    const raw = structureData || (structureHasRefreshToken ? {
      "src/routes/loan.py": ["Loan & Interest Management"],
      "src/routes/auth.py": ["Role-Based Access Control", "Adjusted — Please Review"],
      "src/models/loan.py": ["Loan & Interest Management"],
      ...(!isAuditRejected ? { "src/models/audit_log.py": ["Audit Logging"] } : {}),
      "src/models/refresh_token.py": ["Role-Based Access Control"]
    } : {
      "src/routes/loan.py": ["Loan & Interest Management"],
      "src/routes/auth.py": ["Role-Based Access Control"],
      "src/models/loan.py": ["Loan & Interest Management"],
      ...(!isAuditRejected ? { "src/models/audit_log.py": ["Audit Logging"] } : {})
    });

    const folders = {};
    const allFeatures = new Set();

    Object.entries(raw).forEach(([filePath, featureList]) => {
      const normalizedPath = filePath.replace(/\\/g, '/');
      const parts = normalizedPath.split('/');
      let folderName = 'root';
      let fileName = normalizedPath;
      if (parts.length > 1) {
        folderName = parts.slice(0, -1).join('/');
        fileName = parts[parts.length - 1];
      }

      if (!folders[folderName]) {
        folders[folderName] = [];
      }

      const feats = Array.isArray(featureList) ? featureList : [featureList].filter(Boolean);
      feats.forEach(f => allFeatures.add(f));

      folders[folderName].push({
        id: normalizedPath,
        filePath: normalizedPath,
        fileName,
        features: feats
      });
    });

    return {
      folders,
      totalFiles: Object.keys(raw).length,
      featuresMappedCount: allFeatures.size
    };
  }, [structureData, structureHasRefreshToken, isAuditRejected]);

  return (
    <div className={`screen scrollable ${isActive ? 'active' : ''} ${structureAccepted ? 'readonly-mode' : ''}`} id="screen-structure">
      <div className="doc-screen-inner">
        <div className="toolbar">
          <div className="toolbar-left">
            <div className="label">Step 03 · File Layout Review</div>
            <h2>Project Structure</h2>
            <div className="sub">
              <span id="structMeta">{treeData.totalFiles} FILES · {treeData.featuresMappedCount} FEATURES MAPPED</span>
              {structureAccepted && (
                <span className="accepted-badge" id="structAcceptedBadge" style={{ display: 'inline-flex' }}>
                  <span className="ab-dot"></span>ACCEPTED &amp; LOCKED
                </span>
              )}
              {structureSurvivedFixPass && (
                <span className="flag-tag" style={{ marginLeft: 8 }}>AI Auto-Corrected</span>
              )}
            </div>
          </div>
          <div className="toolbar-actions">
            {!structureData && !structureGenerating && !structureAccepted && (
              <button
                type="button"
                className="btn btn-secondary"
                id="generateStructBtn"
                onClick={() => generateStructure()}
                disabled={operationRunning}
              >
                <span>⚡ Re-generate Structure</span>
              </button>
            )}
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
              disabled={structureAccepted || operationRunning || structureGenerating}
              onClick={() => acceptStructure()}
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
              Generated from your accepted feature list following standard architecture conventions. Click any file to comment.
            </div>

            {/* AI Generation In Progress State */}
            {structureGenerating && (
              <div style={{
                padding: '20px',
                marginBottom: '20px',
                background: 'rgba(124, 58, 237, 0.08)',
                border: '1px solid rgba(124, 58, 237, 0.25)',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '16px'
              }}>
                <div style={{
                  width: '24px',
                  height: '24px',
                  border: '3px solid rgba(124, 58, 237, 0.3)',
                  borderTopColor: '#7c3aed',
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite'
                }} />
                <div>
                  <div style={{ fontWeight: 600, color: '#c084fc', marginBottom: '4px' }}>
                    AI Software Architect Generating Structure…
                  </div>
                  <div style={{ fontSize: '13px', color: '#94a3b8' }}>
                    Synthesizing Model A (Gemini) + Model B (Groq), diffing proposals, and validating directory conventions against your active features.
                  </div>
                </div>
              </div>
            )}

            {/* Validation Telemetry Card if available */}
            {structureValidationResult && (
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '10px',
                marginBottom: '20px',
                padding: '12px 16px',
                background: 'rgba(30, 41, 59, 0.6)',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                fontSize: '12px'
              }}>
                <span style={{ color: '#94a3b8' }}>Validation Checks:</span>
                <span style={{ color: structureValidationResult.convention_adherence?.passed ? '#34d399' : '#f87171' }}>
                  ✓ Convention Adherence: {structureValidationResult.convention_adherence?.passed ? 'Passed' : 'Adjusted'}
                </span>
                <span style={{ color: '#94a3b8' }}>·</span>
                <span style={{ color: structureValidationResult.completeness?.passed ? '#34d399' : '#fbbf24' }}>
                  ✓ Completeness: {structureValidationResult.completeness?.passed ? '100% Features Mapped' : 'Review Required'}
                </span>
                <span style={{ color: '#94a3b8' }}>·</span>
                <span style={{ color: structureValidationResult.no_conflicting_assignments?.passed ? '#34d399' : '#f87171' }}>
                  ✓ No Conflicting Assignments: Passed
                </span>
              </div>
            )}

            {/* Dynamic Folder and File Tree */}
            <div className="tree" id="tree">
              {Object.entries(treeData.folders).map(([folderName, files]) => {
                const isOpen = openFolders[folderName] !== false;
                const folderKey = folderName.replace(/[^a-zA-Z0-9]/g, '_');

                return (
                  <div key={folderName} style={{ marginBottom: '12px' }}>
                    {/* Folder Header */}
                    <div
                      className={`folder-row ${isOpen ? 'open' : ''}`}
                      data-target={`g-${folderKey}`}
                      onClick={() => toggleFolder(folderName)}
                    >
                      <svg className="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M9 18l6-6-6-6" />
                      </svg>
                      <svg className="folder-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                      </svg>
                      <span className="fname">{folderName === 'root' ? './' : `${folderName}/`}</span>
                      <span className="fcount" id={`${folderKey}Count`}>
                        {files.length} {files.length === 1 ? 'file' : 'files'}
                      </span>
                    </div>

                    {/* Folder Files Group */}
                    <div className={`file-group ${isOpen ? 'open' : ''}`} id={`g-${folderKey}`}>
                      {files.map((file) => {
                        const lastDot = file.fileName.lastIndexOf('.');
                        const baseName = lastDot > 0 ? file.fileName.substring(0, lastDot) : file.fileName;
                        const ext = lastDot > 0 ? file.fileName.substring(lastDot) : '';
                        const isCommented = Boolean(structureComments[file.filePath] || structureComments[file.id]);
                        const isAiAdded = file.features.some(f =>
                          String(f).toLowerCase().includes('ai-added') ||
                          String(f).toLowerCase().includes('audit')
                        );

                        return (
                          <React.Fragment key={file.filePath}>
                            <div
                              className={`file-row ${isCommented ? 'commented' : ''}`}
                              data-id={file.id}
                              data-path={file.filePath}
                            >
                              <svg className="file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <path d="M14 2v6h6" />
                              </svg>
                              <div className="file-main">
                                <div className="file-path">
                                  {baseName}<span className="dim">{ext}</span>
                                </div>
                                <div className="file-tags">
                                  {file.features.map((feat, fIdx) => (
                                    <span key={fIdx} className="feature-tag">{feat}</span>
                                  ))}
                                  {isAiAdded && <span className="ai-tag">AI-added</span>}
                                </div>
                              </div>
                              <div
                                className="comment-trigger"
                                data-icon
                                onClick={() => handleOpenComposer(file.filePath, file.filePath)}
                                title="Add review comment"
                              >
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                                </svg>
                              </div>
                            </div>

                            {/* Inline Comment Composer for this exact file */}
                            {activeCommentId === file.filePath && (
                              <div className="composer" id={`liveComposer_${file.id.replace(/[^a-zA-Z0-9]/g, '_')}`}>
                                <textarea
                                  value={commentText}
                                  onChange={(e) => setCommentText(e.target.value)}
                                  placeholder={`Leave a comment on ${file.filePath}…`}
                                  autoFocus
                                />
                                <div className="composer-actions">
                                  {(structureComments[file.filePath] || structureComments[file.id]) && (
                                    <button
                                      className="danger-btn"
                                      onClick={() => handleDeleteComment(file.filePath)}
                                    >
                                      Delete
                                    </button>
                                  )}
                                  <span style={{ flex: 1 }}></span>
                                  <button
                                    className="ghost-btn"
                                    onClick={() => setActiveCommentId(null)}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    className="solid-btn"
                                    onClick={() => handleSaveComment(file.filePath, file.filePath)}
                                  >
                                    {(structureComments[file.filePath] || structureComments[file.id]) ? 'Update Comment' : 'Add Comment'}
                                  </button>
                                </div>
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
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
