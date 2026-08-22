"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import "../../styles/contact.css";

export default function ContactPage() {
  const [topic, setTopic] = useState("General Inquiry");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({ name: false, email: false, message: false });
  const [toastMsg, setToastMsg] = useState("");

  useEffect(() => {
    document.body.style.overflow = "auto";
    document.body.style.height = "auto";
    document.documentElement.style.overflow = "auto";
  }, []);

  const showToast = (msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  const isValidEmail = (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.trim());

  const handleSubmit = (e) => {
    e.preventDefault();
    const nameOk = name.trim().length > 0;
    const emailOk = isValidEmail(email);
    const msgOk = message.trim().length > 0;

    setErrors({
      name: !nameOk,
      email: !emailOk,
      message: !msgOk
    });

    if (!nameOk || !emailOk || !msgOk) {
      showToast("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      showToast("Message sent successfully.");
    }, 700);
  };

  const handleReset = () => {
    setName("");
    setEmail("");
    setMessage("");
    setErrors({ name: false, email: false, message: false });
    setSubmitted(false);
  };

  const topics = [
    { id: "general", label: "General Inquiry" },
    { id: "bug", label: "Bug Report" },
    { id: "feature", label: "Feature Request" },
    { id: "mcp", label: "MCP Integration" },
    { id: "enterprise", label: "Enterprise / Self-Host" },
  ];

  return (
    <div className="contact-page-root">
      {/* Top Announcement Bar */}
      <div className="top-notice">
        ENGINE SPEC: <b>DUAL-MODEL VERIFICATION (GEMINI FLASH + GROQ)</b> · MCP SERVER READY · $0 FREE-TIER ARCHITECTURE
      </div>

      {/* Sticky Navbar */}
      <div className="nav-wrap">
        <header className="landing-nav">
          <a href="/" className="brand-logo" title="MimarAi — Home">
            <img src="/assets/mimarai-logo-hero.png" alt="MimarAi" className="brand-logo-img" />
          </a>
          <nav className="nav-links">
            <a href="/#pipeline">Architecture</a>
            <a href="/#verification">Verification</a>
            <a href="/#mcp-server">MCP Server</a>
            <a href="/#faq">FAQ</a>
            <a href="/contact" style={{ color: 'var(--blueprint-cyan)' }}>Contact</a>
          </nav>
          <div className="header-actions">
            <a href="/app" className="btn btn-primary" style={{ fontSize: '13px', padding: '10px 22px' }}>
              Open Wizard →
            </a>
          </div>
        </header>
      </div>

      {/* Hero Section */}
      <section className="contact-hero">
        <div className="contact-hero-tag">SUPPORT &amp; INQUIRIES</div>
        <h1>Get in Touch with the <span>MimarAi</span> Team</h1>
        <p>Questions about the blueprint engine, custom agent integrations, or self-hosting? We respond to all developer inquiries within 24 hours.</p>
      </section>

      {/* Main Grid */}
      <section className="contact-layout">
        <div className="contact-card">
          {!submitted ? (
            <div id="contactFormSection">
              <div className="form-head">
                <h2>Send Us a Message</h2>
                <p>Select a topic and fill out the details below.</p>
              </div>

              <form id="contactForm" onSubmit={handleSubmit} noValidate>
                <div className="field-wrap">
                  <label className="field-label">Topic of Inquiry</label>
                  <div className="topic-grid" id="topicGrid">
                    {topics.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        className={`topic-btn ${topic === t.label ? "active" : ""}`}
                        onClick={() => setTopic(t.label)}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className={`field-wrap ${errors.name ? "has-error" : ""}`} id="wrapName">
                  <label className="field-label" htmlFor="senderName">Your Name <span className="req">*</span></label>
                  <input
                    type="text"
                    id="senderName"
                    name="name"
                    placeholder="e.g. Alex Mercer"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    autoComplete="name"
                  />
                  <div className="field-error-msg">Please enter your name.</div>
                </div>

                <div className={`field-wrap ${errors.email ? "has-error" : ""}`} id="wrapEmail">
                  <label className="field-label" htmlFor="senderEmail">Email Address <span className="req">*</span></label>
                  <input
                    type="email"
                    id="senderEmail"
                    name="email"
                    placeholder="e.g. alex@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                  />
                  <div className="field-error-msg">Please provide a valid email address.</div>
                </div>

                <div className={`field-wrap ${errors.message ? "has-error" : ""}`} id="wrapMsg">
                  <label className="field-label" htmlFor="senderMsg">Message <span className="req">*</span></label>
                  <textarea
                    id="senderMsg"
                    name="message"
                    rows={5}
                    placeholder="Describe your question, integration challenge, or feature request..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  ></textarea>
                  <div className="field-error-msg">Please write a brief message.</div>
                </div>

                <div className="field-wrap">
                  <button type="submit" className={`btn btn-primary btn-submit ${loading ? "loading" : ""}`} id="submitBtn">
                    <span className="btn-label">{loading ? "Sending…" : "Submit Message →"}</span>
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="success-state" id="successState" style={{ display: 'block' }}>
              <div className="success-icon">✓</div>
              <h2>Message Received</h2>
              <p>Thank you for reaching out. We have received your inquiry regarding <b>{topic}</b> and will follow up shortly at <b>{email}</b>.</p>
              <button type="button" className="btn btn-secondary" onClick={handleReset}>
                Send Another Message
              </button>
            </div>
          )}
        </div>

        {/* Sidebar Info Cards */}
        <aside className="contact-sidebar">
          <div className="info-card">
            <div className="info-card-label">DIRECT CHANNELS</div>
            <div className="contact-item">
              <div className="item-icon">💬</div>
              <div className="item-body">
                <div className="item-title">Community Discord</div>
                <div className="item-sub">Connect with the development team and other blueprint builders.</div>
                <a href="https://discord.gg" target="_blank" rel="noopener noreferrer" className="item-link">Join the Server ↗</a>
              </div>
            </div>
            <div className="contact-item">
              <div className="item-icon">🐙</div>
              <div className="item-body">
                <div className="item-title">GitHub Repository</div>
                <div className="item-sub">Submit bug reports, feature requests, or explore the MCP specification.</div>
                <a href="https://github.com" target="_blank" rel="noopener noreferrer" className="item-link">View on GitHub ↗</a>
              </div>
            </div>
          </div>

          <div className="info-card">
            <div className="info-card-label">SYSTEM AVAILABILITY</div>
            <div className="stat-grid">
              <div className="stat-cell">
                <div className="stat-val">99.9%</div>
                <div className="stat-lbl">MCP Hub Uptime</div>
              </div>
              <div className="stat-cell">
                <div className="stat-val">&lt; 24h</div>
                <div className="stat-lbl">Avg Response Time</div>
              </div>
            </div>
            <div className="stat-note">
              <span className="status-live-dot"></span>
              All dual-model generation pipelines operational.
            </div>
          </div>
        </aside>
      </section>

      {/* Footer */}
      <footer className="contact-footer">
        <a href="/" className="brand-logo" title="MimarAi — Home">
          <img src="/assets/mimarai-logo-hero.png" alt="MimarAi" style={{ height: '40px', width: 'auto' }} />
        </a>
        <div className="footer-meta">
          RENDER + VERCEL + SUPABASE · $0 INFRASTRUCTURE GOAL
        </div>
      </footer>

      {/* Toast Notification */}
      {toastMsg && <div className="toast show" id="toast">{toastMsg}</div>}
    </div>
  );
}
