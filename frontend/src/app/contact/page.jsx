"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import HeaderAvatar from "../../components/HeaderAvatar";
import { getBackendApiUrl, getBackendUrlStatus } from "../../lib/backendConfig";
import "../../styles/contact.css";
import "../../styles/auth.css";

export default function ContactPage() {
  const [selectedTopic, setSelectedTopic] = useState("General Inquiry");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({
    name: false,
    email: false,
    message: false,
  });
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const nameOk = name.trim().length > 0;
    const emailOk = isValidEmail(email);
    const msgOk = message.trim().length > 0;

    setErrors({
      name: !nameOk,
      email: !emailOk,
      message: !msgOk,
    });

    if (!nameOk || !emailOk || !msgOk) {
      showToast("Please fill in all required fields.");
      return;
    }

    setLoading(true);
    const payload = {
      name: name.trim(),
      email: email.trim(),
      topic: selectedTopic,
      message: message.trim(),
    };

    try {
      const backendStatus = getBackendUrlStatus();
      if (!backendStatus.configured) {
        throw new Error("Backend not configured");
      }

      // Prefer the live backend endpoint to avoid routing through the local Next API.
      let res = await fetch(getBackendApiUrl("/contact"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      // Fallback to the local Next API only if the live backend is unavailable.
      if (!res.ok) {
        res = await fetch("/api/contact", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      if (!res.ok) throw new Error("Server error");
      setSubmitted(true);
      showToast("Message sent successfully.");
    } catch (err) {
      showToast(
        "Failed to send message. Please try again or email us directly.",
      );
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setName("");
    setEmail("");
    setMessage("");
    setErrors({ name: false, email: false, message: false });
    setSubmitted(false);
  };

  const topics = [
    "General Inquiry",
    "Bug Report",
    "Feature Suggestion",
    "MCP / Architecture",
  ];

  return (
    <div className="contact-page-root">
      {/* Top Announcement Bar */}
      <div className="top-notice">
        ENGINE SPEC: <b>DUAL-MODEL VERIFICATION (GEMINI FLASH + GROQ)</b> · MCP
        SERVER READY · $0 FREE-TIER ARCHITECTURE
      </div>

      {/* Sticky Navbar */}
      <div className="nav-wrap">
        <header className="landing-nav">
          <a
            href="/"
            className="brand-logo"
            title="MimarAi — The Blueprint Studio"
          >
            <img
              src="/assets/mimarai-logo-hero.png"
              alt="MimarAi Logo"
              className="brand-logo-img"
            />
          </a>
          <div
            className="nav-links"
            style={{ display: "flex", alignItems: "center", gap: "16px" }}
          >
            <a href="/#how-it-works">Workflow</a>
            <a href="/#architecture">Architecture</a>
            <a href="/#mcp-server">MCP Server</a>
            <a href="/contact" className="active">
              Contact Us
            </a>
            <Link href="/app" className="btn btn-primary">
              Open Blueprint Wizard →
            </Link>
            <HeaderAvatar />
          </div>
        </header>
      </div>

      {/* Main Content */}
      <main className="main-wrap">
        <div className="contact-hero">
          <div className="contact-tag">Feedback &amp; Support</div>
          <h1>Contact the MimarAi Team</h1>
          <p>
            Have questions about the dual-model architecture pipeline,
            discovered a bug, or want to suggest an MCP integration? Send us a
            message.
          </p>
        </div>

        <div className="contact-layout">
          {/* Form Card */}
          <section className="contact-card">
            {!submitted ? (
              <div id="formSection">
                <h2 className="card-title">Send a Message</h2>
                <p className="card-sub">
                  All fields are required. We review inquiries daily.
                </p>

                <form id="contactForm" onSubmit={handleSubmit} noValidate>
                  <p
                    style={{
                      margin: "0 0 18px",
                      fontSize: "12px",
                      lineHeight: 1.5,
                      color: "var(--ink-secondary)",
                    }}
                  >
                    For fastest follow-up, email{" "}
                    <a
                      href="mailto:mimarai.support@gmail.com"
                      style={{
                        color: "var(--blueprint-cyan)",
                        textDecoration: "none",
                      }}
                    >
                      mimarai.support@gmail.com
                    </a>{" "}
                    and check your spam or junk folder if the auto-reply does
                    not appear quickly.
                  </p>

                  {/* Topic Selector */}
                  <div className="topic-group">
                    <span className="topic-label">Inquiry Type</span>
                    <div className="topic-pills">
                      {topics.map((t) => (
                        <button
                          key={t}
                          type="button"
                          className={`topic-btn ${selectedTopic === t ? "active" : ""}`}
                          onClick={() => setSelectedTopic(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Name and Email Row */}
                  <div className="form-grid">
                    <div
                      className={`form-field ${errors.name ? "has-error" : ""}`}
                      id="fieldWrapName"
                    >
                      <label className="field-label" htmlFor="inputName">
                        <span>
                          Name<span className="req">*</span>
                        </span>
                      </label>
                      <input
                        type="text"
                        id="inputName"
                        className="input-text"
                        placeholder="Your name"
                        value={name}
                        onChange={(e) => {
                          setName(e.target.value);
                          if (errors.name && e.target.value.trim().length > 0) {
                            setErrors((prev) => ({ ...prev, name: false }));
                          }
                        }}
                        autoComplete="name"
                      />
                      <span className="error-hint">
                        Please enter your name.
                      </span>
                    </div>

                    <div
                      className={`form-field ${errors.email ? "has-error" : ""}`}
                      id="fieldWrapEmail"
                    >
                      <label className="field-label" htmlFor="inputEmail">
                        <span>
                          Email<span className="req">*</span>
                        </span>
                      </label>
                      <input
                        type="email"
                        id="inputEmail"
                        className="input-text"
                        placeholder="you@company.com"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          if (errors.email && isValidEmail(e.target.value)) {
                            setErrors((prev) => ({ ...prev, email: false }));
                          }
                        }}
                        autoComplete="email"
                      />
                      <span className="error-hint">
                        Please enter a valid email address.
                      </span>
                    </div>
                  </div>

                  {/* Message Area */}
                  <div
                    className={`form-field ${errors.message ? "has-error" : ""}`}
                    id="fieldWrapMessage"
                  >
                    <label className="field-label" htmlFor="inputMessage">
                      <span>
                        Message<span className="req">*</span>
                      </span>
                    </label>
                    <textarea
                      id="inputMessage"
                      className="input-area"
                      placeholder="Write message or report bug or suggest new feature"
                      value={message}
                      onChange={(e) => {
                        setMessage(e.target.value);
                        if (
                          errors.message &&
                          e.target.value.trim().length > 0
                        ) {
                          setErrors((prev) => ({ ...prev, message: false }));
                        }
                      }}
                    ></textarea>
                    <span className="error-hint">
                      Please enter your message before submitting.
                    </span>
                  </div>

                  {/* Form Bottom */}
                  <div className="form-bottom">
                    <span
                      style={{ fontSize: "12px", color: "var(--ink-muted)" }}
                    >
                      Directly routed to core developers
                    </span>
                    <button
                      type="submit"
                      className={`btn-submit ${loading ? "loading" : ""}`}
                      id="submitBtn"
                      disabled={loading}
                    >
                      <span className="spinner"></span>
                      <span className="btn-label">
                        {loading ? "Sending…" : "Submit Message →"}
                      </span>
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              /* Success Confirmation */
              <div
                className="success-view"
                id="successView"
                style={{ display: "block" }}
              >
                <div className="success-badge">✓</div>
                <h2>Message Sent Successfully</h2>
                <p>
                  Thank you for reaching out. We have logged your submission and
                  will get back to you shortly.
                </p>
                <p style={{ color: "var(--ink-secondary)", fontSize: "13px" }}>
                  If you do not see our follow-up email in a few minutes, please
                  check your spam or junk folder.
                </p>
                <button
                  type="button"
                  className="btn-reset"
                  id="btnReset"
                  onClick={handleReset}
                >
                  Send Another Message
                </button>
              </div>
            )}
          </section>

          {/* Channels & Info Column */}
          <aside className="channels-col">
            <div className="channel-box">
              <div className="channel-box-title">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                <span>Response &amp; Channels</span>
              </div>
              <div className="channel-item">
                <span className="channel-label">Email Support</span>
                <a
                  href="mailto:mimarai.support@gmail.com"
                  className="channel-val"
                  style={{ textDecoration: "none", color: "inherit" }}
                >
                  mimarai.support@gmail.com
                </a>
              </div>
              <div className="channel-item">
                <span className="channel-label">Response Time</span>
                <span className="channel-val">&lt; 24 business hours</span>
              </div>
              <div className="channel-item">
                <span className="channel-label">MCP Server Status</span>
                <span className="channel-val online">
                  ● All Systems Operational
                </span>
              </div>
            </div>

            <div className="channel-box">
              <div className="channel-box-title">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                </svg>
                <span>Community &amp; Code</span>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  color: "var(--ink-secondary)",
                  lineHeight: "1.55",
                  margin: "0 0 12px",
                }}
              >
                For public discussions, architectural RFCs, and bug reports, you
                can also open an issue on our GitHub repository.
              </p>
              <a
                href="https://github.com/abdullahaziz12/MimarAi"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "12px",
                  color: "var(--blueprint-cyan)",
                  textDecoration: "none",
                }}
              >
                github.com/abdullahaziz12/MimarAi
              </a>
            </div>
          </aside>
        </div>
      </main>

      {/* Footer */}
      <footer className="landing-footer">
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <a
            href="/"
            title="MimarAi — The Blueprint Studio"
            style={{
              display: "inline-flex",
              alignItems: "center",
              textDecoration: "none",
            }}
          >
            <img
              src="/assets/mimarai-logo-hero.png"
              alt="MimarAi Logo"
              style={{
                height: "46px",
                width: "auto",
                objectFit: "contain",
                borderRadius: "6px",
                display: "block",
              }}
            />
          </a>
        </div>
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "11px",
            color: "var(--ink-secondary)",
            letterSpacing: ".06em",
          }}
        >
          BACK4APP + VERCEL + SUPABASE · $0 INFRASTRUCTURE GOAL
        </div>
      </footer>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="toast show" id="toast">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
