"use client";

import React from 'react';
import { useMimarStore } from '../store/mimarStore';

export default function AppNav() {
  const {
    currentScreen,
    interviewDone,
    planGenerated,
    planAccepted,
    structureAccepted,
    diagramJsonAccepted,
    diagramAccepted,
    finalAccepted,
    showScreen
  } = useMimarStore();

  const getNavClasses = (target) => {
    let isUnlocked = false;
    let isAccepted = false;

    if (target === 'interview') {
      isUnlocked = true;
      if (interviewDone) isAccepted = true;
    } else if (target === 'plan') {
      isUnlocked = planGenerated;
      isAccepted = planAccepted;
    } else if (target === 'structure') {
      isUnlocked = planAccepted;
      isAccepted = structureAccepted;
    } else if (target === 'diagram') {
      isUnlocked = structureAccepted;
      isAccepted = diagramJsonAccepted;
    } else if (target === 'render') {
      isUnlocked = diagramJsonAccepted;
      isAccepted = diagramAccepted;
    } else if (target === 'final') {
      isUnlocked = diagramAccepted;
      isAccepted = finalAccepted;
    } else if (target === 'mcp') {
      isUnlocked = finalAccepted;
      isAccepted = finalAccepted;
    }

    const classes = ['nav-item'];
    if (isAccepted) classes.push('accepted');
    if (isUnlocked) classes.push('available');
    else classes.push('locked');

    if (currentScreen === target) {
      classes.push('current');
    }
    if (target === 'mcp') {
      classes.push('mcp-item');
    }
    return classes.join(' ');
  };

  return (
    <nav className="app-nav" id="appNav">
      <div
        className={getNavClasses('interview')}
        data-screen="interview"
        data-tooltip="01 · Interview"
        onClick={() => showScreen('interview')}
      >
        <span className="nav-item-num">01</span>
        <span className="nav-item-dot"></span>
      </div>

      <div className="nav-sep"></div>

      <div
        className={getNavClasses('plan')}
        data-screen="plan"
        data-tooltip="02 · Implementation Plan"
        onClick={() => showScreen('plan')}
      >
        <span className="nav-item-num">02</span>
        <span className="nav-item-dot"></span>
      </div>

      <div
        className={getNavClasses('structure')}
        data-screen="structure"
        data-tooltip="03 · Project Structure"
        onClick={() => showScreen('structure')}
      >
        <span className="nav-item-num">03</span>
        <span className="nav-item-dot"></span>
      </div>

      <div
        className={getNavClasses('diagram')}
        data-screen="diagram"
        data-tooltip="04 · Schema JSON"
        onClick={() => showScreen('diagram')}
      >
        <span className="nav-item-num">04</span>
        <span className="nav-item-dot"></span>
      </div>

      <div
        className={getNavClasses('render')}
        data-screen="render"
        data-tooltip="05 · Rendered Diagrams"
        onClick={() => showScreen('render')}
      >
        <span className="nav-item-num">05</span>
        <span className="nav-item-dot"></span>
      </div>

      <div
        className={getNavClasses('final')}
        data-screen="final"
        data-tooltip="06 · Consolidated Plan"
        onClick={() => showScreen('final')}
      >
        <span className="nav-item-num">06</span>
        <span className="nav-item-dot"></span>
      </div>

      <div
        className={getNavClasses('mcp')}
        data-screen="mcp"
        data-tooltip="07 · MCP Server Hub"
        onClick={() => showScreen('mcp')}
      >
        <span className="nav-item-num">MCP</span>
        <span className="nav-item-dot"></span>
      </div>
    </nav>
  );
}
