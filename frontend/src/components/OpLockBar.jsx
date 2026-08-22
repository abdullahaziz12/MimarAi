"use client";

import React from 'react';
import { useMimarStore } from '../store/mimarStore';

export default function OpLockBar() {
  const { operationRunning, operationLabel } = useMimarStore();

  return (
    <div className={`op-lock-bar ${operationRunning ? 'visible' : ''}`} id="opLockBar">
      <div className="op-spin"></div>
      <span id="opLockText">{operationLabel || 'Processing…'}</span>
      <span style={{ marginLeft: 'auto', opacity: 0.8 }}>
        Single active pipeline enforced · Project state preserved
      </span>
    </div>
  );
}
