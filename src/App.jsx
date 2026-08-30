import React, { useState, useEffect } from 'react';
import Navbar from './components/Navbar';
import LandingScreen from './components/LandingScreen';
import InterviewScreen from './components/InterviewScreen';
import ConflictScreen from './components/ConflictScreen';
import SpecScreen from './components/SpecScreen';
import DiagramScreen from './components/DiagramScreen';
import McpExportScreen from './components/McpExportScreen';
import DraftingFooter from './components/DraftingFooter';

import {
  SAMPLE_PROJECTS,
  INTERVIEW_TAXONOMY,
  INTERVIEW_STEPS,
  CAUGHT_CONFLICTS,
  STRUCTURED_SPEC,
  ER_DIAGRAM_MODEL,
  ARCHITECTURE_DIAGRAM_MODEL,
  MCP_AGENT_CONFIG
} from './data/mockProjectData';

import './styles/blueprint.css';

export default function App() {
  const [activeScreen, setActiveScreen] = useState('landing'); // landing, interview, conflict, spec, diagram, mcp
  const [theme, setTheme] = useState('blueprint'); // blueprint (dark navy) vs paper (warm off-white)
  const [selectedProject, setSelectedProject] = useState(SAMPLE_PROJECTS[0]);

  // Sync theme to root <html> attribute
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Global keyboard shortcuts for quick CAD navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      
      if (e.key === '1') setActiveScreen('landing');
      if (e.key === '2') setActiveScreen('interview');
      if (e.key === '3') setActiveScreen('conflict');
      if (e.key === '4') setActiveScreen('spec');
      if (e.key === '5') setActiveScreen('diagram');
      if (e.key === '6') setActiveScreen('mcp');
      if (e.key.toLowerCase() === 't') setTheme(prev => prev === 'blueprint' ? 'paper' : 'blueprint');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Top Technical CAD Navigation Bar */}
      <Navbar
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        theme={theme}
        setTheme={setTheme}
        project={selectedProject}
        setProject={setSelectedProject}
        sampleProjects={SAMPLE_PROJECTS}
      />

      {/* Main Screen Views */}
      <main style={{ flex: 1 }}>
        {activeScreen === 'landing' && (
          <LandingScreen
            setActiveScreen={setActiveScreen}
            setProject={setSelectedProject}
            sampleProjects={SAMPLE_PROJECTS}
            conflicts={CAUGHT_CONFLICTS}
          />
        )}

        {activeScreen === 'interview' && (
          <InterviewScreen
            setActiveScreen={setActiveScreen}
            taxonomy={INTERVIEW_TAXONOMY}
            interviewSteps={INTERVIEW_STEPS}
            project={selectedProject}
          />
        )}

        {activeScreen === 'conflict' && (
          <ConflictScreen
            setActiveScreen={setActiveScreen}
            conflicts={CAUGHT_CONFLICTS}
            project={selectedProject}
          />
        )}

        {activeScreen === 'spec' && (
          <SpecScreen
            setActiveScreen={setActiveScreen}
            specData={STRUCTURED_SPEC}
            project={selectedProject}
          />
        )}

        {activeScreen === 'diagram' && (
          <DiagramScreen
            setActiveScreen={setActiveScreen}
            erModel={ER_DIAGRAM_MODEL}
            archModel={ARCHITECTURE_DIAGRAM_MODEL}
            project={selectedProject}
          />
        )}

        {activeScreen === 'mcp' && (
          <McpExportScreen
            mcpConfig={MCP_AGENT_CONFIG}
            project={selectedProject}
          />
        )}
      </main>

      {/* Bottom Technical CAD Drafting Status Bar */}
      <DraftingFooter
        activeScreen={activeScreen}
        setActiveScreen={setActiveScreen}
        theme={theme}
        project={selectedProject}
      />

    </div>
  );
}
