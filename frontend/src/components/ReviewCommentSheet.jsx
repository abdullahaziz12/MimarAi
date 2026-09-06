"use client";

import React from "react";
import { useMimarStore, REVISION_META } from "../store/mimarStore";
import { useAuth } from "../context/AuthContext";

export default function ReviewCommentSheet({ stage }) {
  const { session } = useAuth();
  const {
    openReviewSheetStage,
    setOpenReviewSheetStage,
    planComments,
    structureComments,
    diagramJsonComments,
    finalComments,
    deleteComment,
    showScreen,
    runRevisionPipeline,
    operationRunning,
  } = useMimarStore();

  const isOpen = openReviewSheetStage === stage;
  const store =
    stage === "plan"
      ? planComments
      : stage === "structure"
        ? structureComments
        : stage === "diagram"
          ? diagramJsonComments
          : finalComments;

  const count = Object.keys(store).length;
  const meta = REVISION_META[stage] || {
    noun: "Stage",
    revising: "REVISING",
    review: "REVIEW",
  };

  const handleClose = () => {
    setOpenReviewSheetStage(null);
  };

  const handleSubmit = async () => {
    if (count === 0 || operationRunning) return;
    handleClose();
    showScreen("interview", {
      isRevision: true,
      revisionContext: {
        targetStage: stage,
        noun: meta.noun,
        pendingComments: { ...store },
      },
    });
    runRevisionPipeline(stage, session?.access_token || null);
  };

  return (
    <>
      <div
        className={`sheet-backdrop ${isOpen ? "open" : ""}`}
        id={`sheetBackdrop${stage.charAt(0).toUpperCase() + stage.slice(1)}`}
        onClick={handleClose}
      ></div>

      <div
        className={`sheet ${isOpen ? "open" : ""}`}
        id={`reviewSheet${stage.charAt(0).toUpperCase() + stage.slice(1)}`}
      >
        <div className="sheet-head">
          <div className="sheet-title">Review Comments &amp; AI Directives</div>
          <div className="sheet-sub">
            {count} {count === 1 ? "COMMENT PENDING" : "COMMENTS PENDING"}
          </div>
        </div>

        <div className="sheet-body">
          {count === 0 ? (
            <div className="empty-state">
              No comments pending on this stage. Click any row or item in the
              document to leave inline feedback.
            </div>
          ) : (
            Object.entries(store).map(([id, c]) => (
              <div key={id} className="comment-card">
                <div className="comment-quote">"{c.quote}"</div>
                <div className="comment-body">{c.text}</div>
                <div className="comment-row-actions">
                  <button
                    onClick={() => {
                      handleClose();
                      const el = document.querySelector(`[data-id="${id}"]`);
                      if (el) {
                        el.scrollIntoView({
                          block: "center",
                          behavior: "smooth",
                        });
                        const trigger = el.querySelector(".comment-trigger");
                        if (trigger) trigger.click();
                      }
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="danger"
                    onClick={() => deleteComment(stage, id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="sheet-foot">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleClose}
          >
            Close
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={count === 0 || operationRunning}
            onClick={handleSubmit}
          >
            {count === 0
              ? "Submit comments"
              : `Submit ${count} comment${count > 1 ? "s" : ""} →`}
          </button>
        </div>
      </div>
    </>
  );
}
