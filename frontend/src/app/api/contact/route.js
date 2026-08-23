import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export async function POST(req) {
  try {
    const body = await req.json();
    const { name, email, topic, message } = body;

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: 'Name, email, and message are required.' },
        { status: 422 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      return NextResponse.json(
        { error: 'Invalid email address.' },
        { status: 422 }
      );
    }

    const safeName = escapeHtml(name.trim());
    const safeEmail = escapeHtml(email.trim());
    const safeTopic = escapeHtml((topic || 'General Inquiry').trim());
    const safeMessage = escapeHtml(message.trim());

    // 1. Save to Supabase DB if credentials are configured
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://tgyupsejfuvglbwjneob.supabase.co';
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRneXVwc2VqZnV2Z2xid2puZW9iIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MTY4NDksImV4cCI6MjEwMjk5Mjg0OX0.vX_RvoGRxaHYtijcjaybDkI4x35FF63uv2rVJsj6Yvo';
    
    let dbSaved = false;
    try {
      const supabase = createClient(supabaseUrl, supabaseKey);
      const { error } = await supabase.from('contact_messages').insert({
        name: name.trim(),
        email: email.trim(),
        topic: (topic || 'General Inquiry').trim(),
        message: message.trim(),
      });
      if (!error) dbSaved = true;
    } catch (dbErr) {
      console.warn('[CONTACT API DB WARNING]', dbErr);
    }

    // 2. Email Dispatcher via Gmail SMTP
    const gmailUser = process.env.GMAIL_USER || 'support.mimarai@gmail.com';
    const gmailPass = (process.env.GMAIL_APP_PASSWORD || 'vllyflcyxihdesjs').replace(/\s+/g, '');

    let emailSent = false;
    if (gmailPass && gmailUser) {
      try {
        const transporter = nodemailer.createTransport({
          service: 'gmail',
          auth: {
            user: gmailUser,
            pass: gmailPass,
          },
        });

        // A. Notification Email to support.mimarai@gmail.com
        const notifSubject = `New ${safeTopic} — MimarAI Contact Form`;
        const notifHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #0F172A; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0B0F19; padding: 24px; border-radius: 8px; color: #F8FAFC; border: 1px solid #1E293B;">
    <h2 style="color: #38BDF8; margin-top: 0;">New Contact Form Submission</h2>
    <p><strong>From:</strong> ${safeName} (&lt;<a href="mailto:${safeEmail}" style="color: #38BDF8;">${safeEmail}</a>&gt;)</p>
    <p><strong>Inquiry Type:</strong> ${safeTopic}</p>
    <div style="background: #161F32; padding: 16px; border-left: 3px solid #38BDF8; border-radius: 4px; margin: 20px 0;">
      <div style="font-size: 11px; color: #94A3B8; font-family: monospace; text-transform: uppercase; margin-bottom: 6px;">Message Payload:</div>
      <div style="color: #E2E8F0; white-space: pre-wrap;">"${safeMessage}"</div>
    </div>
    <hr style="border: 0; border-top: 1px solid #1E293B; margin: 20px 0;">
    <p style="font-size: 12px; color: #94A3B8; margin-bottom: 0;">MimarAI Production Pipeline — Automated Notification</p>
  </div>
</body>
</html>`;

        const notifText = `New Contact Form Submission\n\nFrom: ${name.trim()} (${email.trim()})\nInquiry Type: ${safeTopic}\n\nMessage:\n"${message.trim()}"\n\nMimarAI Production Pipeline — Automated Notification`;

        // B. Auto-Reply Email to user
        const userSubject = `We received your message — MimarAI`;
        const userHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #0F172A; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: #0B0F19; padding: 24px; border-radius: 8px; color: #F8FAFC; border: 1px solid #1E293B;">
    <h2 style="color: #38BDF8; margin-top: 0;">MimarAI Support Confirmation</h2>
    <p>Hi <strong>${safeName}</strong>,</p>
    <p>Thanks for reaching out to MimarAI! This confirms we've received your <strong>${safeTopic}</strong> and it's now in our queue.</p>
    <p>Our team reviews inquiries daily and typically responds within 24 business hours. If your message included a bug report, feel free to also open an issue on our GitHub repository for faster visibility:</p>
    <p style="margin: 16px 0;">
      <a href="https://github.com/abdullahaziz12/MimarAi" style="color: #38BDF8; font-weight: 600; text-decoration: underline;">github.com/abdullahaziz12/MimarAi</a>
    </p>
    <div style="background: #161F32; padding: 16px; border-left: 3px solid #38BDF8; border-radius: 4px; margin: 20px 0;">
      <div style="font-size: 11px; color: #94A3B8; font-family: monospace; text-transform: uppercase; margin-bottom: 6px;">For reference, here's what you sent us:</div>
      <div style="color: #E2E8F0; white-space: pre-wrap;">"${safeMessage}"</div>
    </div>
    <p>We'll follow up soon.</p>
    <hr style="border: 0; border-top: 1px solid #1E293B; margin: 24px 0;">
    <p style="font-size: 13px; color: #94A3B8; margin-bottom: 0;">
      <strong>The MimarAI Team</strong><br>
      Support: <a href="mailto:support.mimarai@gmail.com" style="color: #38BDF8;">support.mimarai@gmail.com</a>
    </p>
  </div>
</body>
</html>`;

        const userText = `Hi ${name.trim()},\n\nThanks for reaching out to MimarAI! This confirms we've received your ${safeTopic} and it's now in our queue.\n\nOur team reviews inquiries daily and typically responds within 24 business hours. If your message included a bug report, feel free to also open an issue on our GitHub repository for faster visibility:\nhttps://github.com/abdullahaziz12/MimarAi\n\nFor reference, here's what you sent us:\n"${message.trim()}"\n\nWe'll follow up soon.\n\nThe MimarAI Team\nSupport: support.mimarai@gmail.com`;

        // Send Notification Email
        try {
          await transporter.sendMail({
            from: `"MimarAI Support" <${gmailUser}>`,
            to: 'support.mimarai@gmail.com',
            subject: notifSubject,
            text: notifText,
            html: notifHtml,
          });
        } catch (nErr) {
          console.error('[NOTIF MAIL ERROR]', nErr);
        }

        // Send User Confirmation Auto-Reply
        try {
          await transporter.sendMail({
            from: `"MimarAI Support" <${gmailUser}>`,
            to: email.trim(),
            subject: userSubject,
            text: userText,
            html: userHtml,
          });
          emailSent = true;
        } catch (uErr) {
          console.error('[USER CONFIRMATION MAIL ERROR]', uErr);
        }
      } catch (mailErr) {
        console.error('[CONTACT API GENERAL MAIL ERROR]', mailErr);
      }
    }

    return NextResponse.json({
      status: 'ok',
      message: 'Message received. We will get back to you shortly.',
      email_sent: emailSent,
      db_saved: dbSaved,
    });
  } catch (err) {
    console.error('[CONTACT API ERROR]', err);
    return NextResponse.json(
      { error: 'Failed to process contact submission.' },
      { status: 500 }
    );
  }
}
