// ============ Sending emails ============

const nodemailer = require("nodemailer");

const APP_URL = (process.env.APP_URL || "http://localhost:3000").replace(/\/$/, "");
const MAIL_FROM = process.env.MAIL_FROM || "InventoryX <inventory@example.com>";

let transporterPromise = null;
let usingTestInbox = false;


// ============ Connect to the email server (company email or test inbox) ============

async function createTransporter() {
  if (process.env.SMTP_HOST) {
    console.log(`Emails will be sent through ${process.env.SMTP_HOST}`);
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  const testAccount = await nodemailer.createTestAccount();
  usingTestInbox = true;
  console.log("No company email settings found, so emails go to a free test inbox (nothing is really delivered).");

  return nodemailer.createTransport({
    host: testAccount.smtp.host,
    port: testAccount.smtp.port,
    secure: testAccount.smtp.secure,
    auth: {
      user: testAccount.user,
      pass: testAccount.pass
    }
  });
}

function getTransporter() {
  if (!transporterPromise) {
    transporterPromise = createTransporter().catch(function (error) {
      transporterPromise = null;
      throw error;
    });
  }
  return transporterPromise;
}

async function sendMail(message) {
  try {
    const transporter = await getTransporter();
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to: message.to,
      cc: message.cc,
      subject: message.subject,
      text: message.text,
      html: message.html
    });

    const previewUrl = usingTestInbox ? nodemailer.getTestMessageUrl(info) : null;
    console.log(`Email sent: "${message.subject}" to ${message.to}${previewUrl ? `\n   Preview: ${previewUrl}` : ""}`);

    return { ok: true, previewUrl: previewUrl };
  } catch (error) {
    console.error(`Could not send the email "${message.subject}":`, error.message);
    return { ok: false };
  }
}


// ============ Helpers ============

function escapeHTML(value) {
  return String(value === null || value === undefined ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseEmailList(text) {
  const valid = [];
  const invalid = [];

  for (const part of String(text || "").split(/[,;\s]+/)) {
    const email = part.trim().toLowerCase();
    if (email === "") continue;

    if (!isValidEmail(email)) {
      invalid.push(part.trim());
    } else if (!valid.includes(email)) {
      valid.push(email);
    }
  }

  return { valid: valid, invalid: invalid };
}

function formatDateTime(isoText) {
  if (!isoText) return "—";
  return new Date(isoText).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function countByType(assignments) {
  const counts = {};
  for (const assignment of assignments) {
    counts[assignment.name] = (counts[assignment.name] || 0) + 1;
  }
  return counts;
}


// ============ Email layout ============

function wrapEmail(title, bodyHtml) {
  return `
    <div style="font-family: Arial, sans-serif; color: #333; max-width: 640px; margin: 0 auto;">
      <div style="background: #1a3c6e; color: white; padding: 18px 24px; border-radius: 10px 10px 0 0;">
        <strong style="font-size: 18px;">InventoryX</strong>
        <div style="font-size: 13px; opacity: 0.85;">${escapeHTML(title)}</div>
      </div>
      <div style="border: 1px solid #e6e8ec; border-top: none; padding: 24px; border-radius: 0 0 10px 10px;">
        ${bodyHtml}
        <p style="margin-top: 28px; color: #888; font-size: 12px;">This email was sent automatically by InventoryX.</p>
      </div>
    </div>
  `;
}

function eventDetailsHtml(event) {
  return `
    <table style="border-collapse: collapse; margin: 12px 0 20px; font-size: 14px;">
      <tr><td style="padding: 4px 16px 4px 0; color: #666;">Event</td><td><strong>${escapeHTML(event.name)}</strong></td></tr>
      <tr><td style="padding: 4px 16px 4px 0; color: #666;">Dates</td><td>${escapeHTML(event.dates)}</td></tr>
      <tr><td style="padding: 4px 16px 4px 0; color: #666;">Location</td><td>${escapeHTML(event.location)}</td></tr>
      <tr><td style="padding: 4px 16px 4px 0; color: #666;">Requested by</td><td>${escapeHTML(event.requestedBy)}</td></tr>
    </table>
  `;
}

function buttonHtml(link, label) {
  return `<p><a href="${link}" style="display: inline-block; background: #4f46e5; color: white; padding: 10px 18px; border-radius: 8px; text-decoration: none; font-weight: bold;">${escapeHTML(label)}</a></p>`;
}


// ============ 1. New request alert (to the inventory team) ============

async function sendNewRequestEmail(event, recipients) {
  if (!recipients || recipients.length === 0) {
    return { ok: false };
  }

  const link = `${APP_URL}/event-detail.html?id=${encodeURIComponent(event.id)}&tab=inventory`;

  let itemsHtml = "";
  const itemLines = [];
  for (const item of event.itemsList) {
    itemsHtml += `<li>${item.qty} × ${escapeHTML(item.name)}</li>`;
    itemLines.push(`- ${item.qty} x ${item.name}`);
  }

  const html = wrapEmail("New inventory request", `
    <p>A new inventory request has been submitted.</p>
    ${eventDetailsHtml(event)}
    <p><strong>Items requested:</strong></p>
    <ul>${itemsHtml}</ul>
    ${event.notes ? `<p><strong>Notes:</strong> ${escapeHTML(event.notes)}</p>` : ""}
    ${buttonHtml(link, "Review request")}
  `);

  const text = [
    "A new inventory request has been submitted.",
    "",
    `Event: ${event.name}`,
    `Dates: ${event.dates}`,
    `Location: ${event.location}`,
    `Requested by: ${event.requestedBy}`,
    "",
    "Items requested:",
    ...itemLines,
    "",
    `Review it here: ${link}`
  ].join("\n");

  return sendMail({
    to: recipients.join(", "),
    subject: `New inventory request: ${event.name}`,
    text: text,
    html: html
  });
}


// ============ 2. Assignment confirmation (to the requester) ============

async function sendAssignmentEmail(event, ccList) {
  const counts = countByType(event.assignments);

  let summaryHtml = "";
  const summaryLines = [];
  for (const name in counts) {
    summaryHtml += `<li>${counts[name]} × ${escapeHTML(name)}</li>`;
    summaryLines.push(`- ${counts[name]} x ${name}`);
  }

  let rowsHtml = "";
  const rowLines = [];
  let rowNumber = 0;
  for (const assignment of event.assignments) {
    rowNumber++;
    rowsHtml += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: #999;">${rowNumber}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${escapeHTML(assignment.serial)}</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHTML(assignment.name)}</td>
      </tr>
    `;
    rowLines.push(`${rowNumber}. ${assignment.serial} (${assignment.name})`);
  }

  const html = wrapEmail("Devices assigned to your event", `
    <p>Hi ${escapeHTML(event.requestedBy)},</p>
    <p>The following devices have been assigned to your event. Please check them when you receive them, and return <strong>all</strong> devices to the inventory team after the event.</p>
    ${eventDetailsHtml(event)}
    <p><strong>Summary:</strong></p>
    <ul>${summaryHtml}</ul>
    <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
      <tr style="background: #f7f9fc; text-align: left;">
        <th style="padding: 8px;">#</th>
        <th style="padding: 8px;">Serial Number</th>
        <th style="padding: 8px;">Type</th>
      </tr>
      ${rowsHtml}
    </table>
    <p style="margin-top: 20px;">If anything is missing or doesn't work, please contact the inventory team right away.</p>
  `);

  const text = [
    `Hi ${event.requestedBy},`,
    "",
    "The following devices have been assigned to your event. Please return all devices after the event.",
    "",
    `Event: ${event.name}`,
    `Dates: ${event.dates}`,
    `Location: ${event.location}`,
    "",
    "Summary:",
    ...summaryLines,
    "",
    "Devices:",
    ...rowLines
  ].join("\n");

  return sendMail({
    to: event.requesterEmail,
    cc: ccList.length > 0 ? ccList.join(", ") : undefined,
    subject: `Devices assigned: ${event.name} (${event.dates})`,
    text: text,
    html: html
  });
}


// ============ 3. Return summary when an event closes ============

async function sendEventClosedEmail(event) {
  if (!event.requesterEmail) {
    return { ok: false };
  }

  const ccList = parseEmailList(event.ccEmails).valid;
  const colors = { Returned: "#1e7a4c", Damaged: "#a15c00", Lost: "#b42323" };
  const totals = { Returned: 0, Damaged: 0, Lost: 0 };

  let rowsHtml = "";
  const rowLines = [];
  for (const assignment of event.assignments) {
    const status = assignment.returnStatus || "Not recorded";
    if (totals[status] !== undefined) {
      totals[status]++;
    }

    rowsHtml += `
      <tr>
        <td style="padding: 8px; border-bottom: 1px solid #eee;"><strong>${escapeHTML(assignment.serial)}</strong></td>
        <td style="padding: 8px; border-bottom: 1px solid #eee;">${escapeHTML(assignment.name)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: ${colors[status] || "#555"}; font-weight: bold;">${escapeHTML(status)}</td>
        <td style="padding: 8px; border-bottom: 1px solid #eee; color: #555;">${escapeHTML(assignment.note || "")}</td>
      </tr>
    `;
    rowLines.push(`${assignment.serial} (${assignment.name}): ${status}${assignment.note ? ` - ${assignment.note}` : ""}`);
  }

  const problemNote = totals.Lost + totals.Damaged > 0
    ? `<p style="padding: 12px 14px; background: #fdeaea; color: #b42323; border-radius: 8px;"><strong>${totals.Lost} lost and ${totals.Damaged} damaged device(s)</strong> were recorded for this event. Please contact the inventory team if you have more information.</p>`
    : `<p style="padding: 12px 14px; background: #e3f6ec; color: #1e7a4c; border-radius: 8px;">All devices were returned. Thank you!</p>`;

  const html = wrapEmail("Event closed: return summary", `
    <p>Hi ${escapeHTML(event.requestedBy)},</p>
    <p>The event below has been closed. Here is how every device came back.</p>
    ${eventDetailsHtml(event)}
    ${problemNote}
    <table style="border-collapse: collapse; width: 100%; font-size: 14px;">
      <tr style="background: #f7f9fc; text-align: left;">
        <th style="padding: 8px;">Serial Number</th>
        <th style="padding: 8px;">Type</th>
        <th style="padding: 8px;">Return Status</th>
        <th style="padding: 8px;">Note</th>
      </tr>
      ${rowsHtml}
    </table>
    <p style="margin-top: 16px; color: #666; font-size: 13px;">Closed on ${escapeHTML(formatDateTime(event.closedAt))}.</p>
  `);

  const text = [
    `Hi ${event.requestedBy},`,
    "",
    `The event "${event.name}" has been closed.`,
    `Returned: ${totals.Returned}, Damaged: ${totals.Damaged}, Lost: ${totals.Lost}`,
    "",
    ...rowLines
  ].join("\n");

  return sendMail({
    to: event.requesterEmail,
    cc: ccList.length > 0 ? ccList.join(", ") : undefined,
    subject: `Event closed: ${event.name} - return summary`,
    text: text,
    html: html
  });
}


module.exports = {
  parseEmailList: parseEmailList,
  sendNewRequestEmail: sendNewRequestEmail,
  sendAssignmentEmail: sendAssignmentEmail,
  sendEventClosedEmail: sendEventClosedEmail
};