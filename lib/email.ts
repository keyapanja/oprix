import "server-only";
import nodemailer from "nodemailer";

// SMTP is optional. If it isn't configured, emails are logged to the server
// console (dev fallback) so the invite flow is still fully testable.

function transporter() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;
  const port = Number(process.env.SMTP_PORT ?? 587);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

export function appUrl(path: string): string {
  const base = process.env.APP_URL ?? "http://localhost:3000";
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

export async function sendMail(opts: {
  to: string;
  subject: string;
  html: string;
}): Promise<{ delivered: boolean }> {
  const t = transporter();
  if (!t) {
    console.log(
      `\n[email:dev] (SMTP not configured)\n  To: ${opts.to}\n  Subject: ${opts.subject}\n  ${opts.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()}\n`,
    );
    return { delivered: false };
  }
  await t.sendMail({
    from: process.env.SMTP_FROM ?? "Oprix <no-reply@oprix.app>",
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  });
  return { delivered: true };
}

export async function sendInviteEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  link: string;
}): Promise<{ delivered: boolean }> {
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#059669;margin:0 0 8px">Welcome to ${escapeHtml(opts.companyName)}</h2>
    <p style="color:#334155;font-size:14px;line-height:1.6">
      Hi ${escapeHtml(opts.name)}, you've been added to <strong>${escapeHtml(opts.companyName)}</strong>
      on Oprix. Set your password to access your account.
    </p>
    <p style="margin:24px 0">
      <a href="${opts.link}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">
        Set your password
      </a>
    </p>
    <p style="color:#94a3b8;font-size:12px;line-height:1.6">
      This link expires in 7 days. If the button doesn't work, copy this URL:<br>
      <span style="color:#475569">${opts.link}</span>
    </p>
  </div>`;
  return sendMail({
    to: opts.to,
    subject: `You've been added to ${opts.companyName} on Oprix`,
    html,
  });
}

export async function sendPasswordResetEmail(opts: {
  to: string;
  name: string;
  companyName: string;
  link: string;
}): Promise<{ delivered: boolean }> {
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#059669;margin:0 0 8px">Reset your password</h2>
    <p style="color:#334155;font-size:14px;line-height:1.6">
      Hi ${escapeHtml(opts.name)}, we got a request to reset your Oprix password for
      <strong>${escapeHtml(opts.companyName)}</strong>. Choose a new one below.
    </p>
    <p style="margin:24px 0">
      <a href="${opts.link}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">
        Reset password
      </a>
    </p>
    <p style="color:#94a3b8;font-size:12px;line-height:1.6">
      This link expires in 1 hour. If you didn't request this, ignore this email — your password won't change.<br>
      If the button doesn't work, copy this URL:<br>
      <span style="color:#475569">${opts.link}</span>
    </p>
  </div>`;
  return sendMail({ to: opts.to, subject: "Reset your Oprix password", html });
}

export async function sendTaskAssignedEmail(opts: {
  to: string;
  name: string;
  taskName: string;
  projectName: string;
  assignerName: string;
  dueDate: string | null;
  link: string;
}): Promise<{ delivered: boolean }> {
  const html = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <h2 style="color:#059669;margin:0 0 8px">New task assigned</h2>
    <p style="color:#334155;font-size:14px;line-height:1.6">
      Hi ${escapeHtml(opts.name)}, <strong>${escapeHtml(opts.assignerName)}</strong> assigned you a task
      in <strong>${escapeHtml(opts.projectName)}</strong>.
    </p>
    <div style="background:#f1f5f9;border-radius:10px;padding:14px 16px;margin:16px 0">
      <p style="margin:0;color:#0f172a;font-size:15px;font-weight:600">${escapeHtml(opts.taskName)}</p>
      ${opts.dueDate ? `<p style="margin:6px 0 0;color:#64748b;font-size:13px">Due ${escapeHtml(opts.dueDate)}</p>` : ""}
    </div>
    <p style="margin:24px 0">
      <a href="${opts.link}" style="background:#059669;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-size:14px;font-weight:600;display:inline-block">
        View task
      </a>
    </p>
    <p style="color:#94a3b8;font-size:12px;line-height:1.6">
      If the button doesn't work, copy this URL:<br>
      <span style="color:#475569">${opts.link}</span>
    </p>
  </div>`;
  return sendMail({ to: opts.to, subject: `New task assigned: ${opts.taskName}`, html });
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}
