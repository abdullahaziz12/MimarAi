import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft, PlusCircle, HelpCircle, Layers, Database, Shield, Server, RefreshCw } from 'lucide-react';

export default function InterviewScreen({ setActiveScreen, taxonomy, interviewSteps, project }) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [answers, setAnswers] = useState({
    'tax-auth': 'JWT HMAC-SHA256',
    'tax-data': 'PostgreSQL 16 (Relational)',
    'tax-sync': 'Long-lived WebSockets',
    'tax-host': 'Vercel Free Tier'
  });
  const [customNote, setCustomNote] = useState('');

  const currentStep = interviewSteps[currentStepIndex] || interviewSteps[0];
  const isConflictTriggered = answers['tax-sync'] === 'Long-lived WebSockets' && answers['tax-host'] === 'Vercel Free Tier';

  const handleSelectOption = (stepKey, optionId) => {
    setAnswers(prev => ({
      ...prev,
      [stepKey]: optionId
    }));
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '24px 20px 60px' }}>
      
      {/* Header Bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '1px solid var(--border-light)', paddingBottom: '12px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="coord-tag">[STEP {currentStepIndex + 1} OF {interviewSteps.length}]</span>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--line-cyan)' }}>
              PROJECT: {project.name}
            </span>
          </div>
          <h1 className="font-head" style={{ fontSize: '24px', marginTop: '4px' }}>
            Architectural Requirements Interview
          </h1>
        </div>

        {/* Action controls */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {isConflictTriggered && (
            <button 
              onClick={() => setActiveScreen('conflict')} 
              className="btn-cad btn-cad-primary" 
              style={{ background: 'var(--accent-orange)' }}
            >
              <AlertTriangle size={14} />
              <span>1 CONFLICT DETECTED — REVIEW</span>
            </button>
          )}

          <button 
            onClick={() => setActiveScreen('spec')} 
            className="btn-cad"
          >
            <span>PREVIEW SPEC</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '24px' }}>
        
        {/* Left Sidebar: Visible Requirements Taxonomy Map */}
        <div className="cad-box cad-box-ticks" style={{ padding: '16px', background: 'var(--bg-surface-elevated)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderBottom: '1px solid var(--border-light)', paddingBottom: '8px', marginBottom: '16px' }}>
            <Layers size={14} color="var(--line-cyan)" />
            <span className="font-mono" style={{ fontSize: '12px', fontWeight: 700 }}>
              REQUIREMENTS TAXONOMY MAP
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {taxonomy.map((item, idx) => {
              const isSelected = idx === currentStepIndex;
              const hasConflict = item.status === 'CONFLICT' || (item.id === 'tax-sync' && isConflictTriggered);
              
              return (
                <div
                  key={item.id}
                  onClick={() => setCurrentStepIndex(idx < interviewSteps.length ? idx : 0)}
                  style={{
                    border: isSelected ? '1px solid var(--line-cyan)' : '1px solid var(--border-light)',
                    background: isSelected ? 'var(--bg-surface-subtle)' : 'transparent',
                    padding: '10px 12px',
                    borderRadius: '2px',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700 }}>
                      {idx + 1}. {item.title}
                    </span>
                    <span className={`coord-tag ${hasConflict ? 'orange' : 'green'}`} style={{ fontSize: '9px' }}>
                      {hasConflict ? 'FLAG' : item.status}
                    </span>
                  </div>

                  <div style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--ink-muted)', display: 'flex', justifyContent: 'space-between' }}>
                    <span>{item.count}</span>
                    <span style={{ color: 'var(--line-cyan)' }}>
                      {answers[item.id] ? answers[item.id].slice(0, 18) + '...' : 'Pending'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Realtime conflict alert notice */}
          {isConflictTriggered && (
            <div className="proofreader-box" style={{ marginTop: '20px', padding: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--accent-orange)', fontWeight: 700, fontFamily: 'var(--font-mono)', fontSize: '11px', marginBottom: '4px' }}>
                <AlertTriangle size={13} />
                <span>[CONFLICT CAUGHT]</span>
              </div>
              <p style={{ fontSize: '11px', lineHeight: 1.4, color: 'var(--ink-primary)' }}>
                WebSockets + Vercel Serverless hosting contradiction detected.
              </p>
              <button 
                onClick={() => setActiveScreen('conflict')}
                className="btn-cad btn-cad-primary" 
                style={{ width: '100%', marginTop: '8px', padding: '4px 8px', fontSize: '10px' }}
              >
                OPEN PROOFREADER MARKUP
              </button>
            </div>
          )}
        </div>

        {/* Right Main Pane: Structured Question Stepper */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Question Card */}
          <div className="cad-box cad-box-ticks" style={{ padding: '24px', background: 'var(--bg-surface-elevated)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span className="coord-tag orange">[{currentStep.category.toUpperCase()}]</span>
              <span className="font-mono" style={{ fontSize: '11px', color: 'var(--ink-muted)' }}>
                RULE_SET: [TAXONOMY_V2]
              </span>
            </div>

            <h2 className="font-head" style={{ fontSize: '20px', marginBottom: '20px', lineHeight: 1.3 }}>
              {currentStep.question}
            </h2>

            {/* Option Radio/Cards */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
              {currentStep.options.map(opt => {
                const isSelected = answers[currentStep.category] === opt.id || currentStep.selectedOption === opt.id;
                
                return (
                  <div
                    key={opt.id}
                    onClick={() => handleSelectOption(currentStep.category, opt.id)}
                    style={{
                      border: isSelected ? '1px solid var(--accent-orange)' : '1px solid var(--border-strong)',
                      background: isSelected ? 'var(--accent-orange-bg)' : 'var(--bg-surface-subtle)',
                      padding: '14px 16px',
                      borderRadius: '2px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '12px',
                      transition: 'all 0.15s ease'
                    }}
                  >
                    <div style={{
                      width: '16px',
                      height: '16px',
                      borderRadius: '50%',
                      border: isSelected ? '4px solid var(--accent-orange)' : '2px solid var(--ink-muted)',
                      marginTop: '2px'
                    }} />

                    <div>
                      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '13px', fontWeight: 600, color: 'var(--ink-primary)' }}>
                        {opt.label}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Engineering Rationale Note */}
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '16px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--line-cyan)', marginBottom: '6px' }}>
                <HelpCircle size={12} />
                <span>ARCHITECT RATIONALE:</span>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--ink-secondary)', fontStyle: 'italic' }}>
                "{currentStep.rationale}"
              </p>
            </div>

            {/* Custom Student Note input */}
            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: '11px', color: 'var(--ink-muted)', marginBottom: '4px' }}>
                ADDITIONAL INVARIANTS / CUSTOM CONSTRAINTS (OPTIONAL):
              </label>
              <input
                type="text"
                placeholder="e.g. Must support max 50 concurrent canvas rooms for student testing..."
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--bg-surface-subtle)',
                  border: '1px solid var(--border-light)',
                  color: 'var(--ink-primary)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12px',
                  padding: '8px 12px',
                  borderRadius: '2px'
                }}
              />
            </div>

            {/* Stepper Navigation Buttons */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                disabled={currentStepIndex === 0}
                onClick={() => setCurrentStepIndex(prev => Math.max(0, prev - 1))}
                className="btn-cad"
                style={{ opacity: currentStepIndex === 0 ? 0.5 : 1 }}
              >
                <ArrowLeft size={14} />
                <span>PREVIOUS QUESTION</span>
              </button>

              <button
                onClick={() => {
                  if (currentStepIndex < interviewSteps.length - 1) {
                    setCurrentStepIndex(prev => prev + 1);
                  } else {
                    setActiveScreen('conflict');
                  }
                }}
                className="btn-cad btn-cad-primary"
              >
                <span>{currentStepIndex === interviewSteps.length - 1 ? 'RUN CONFLICT CHECK' : 'NEXT QUESTION'}</span>
                <ArrowRight size={14} />
              </button>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}
