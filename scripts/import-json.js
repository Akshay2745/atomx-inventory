// ============ Copy the JSON data into PostgreSQL (run once) ============

const fs = require("fs");
const path = require("path");
const db = require("../db");

const DATA_FOLDER = path.join(__dirname, "..", "data");
const DEVICE_STATUSES = ["In Office", "Assigned", "Damaged", "Lost"];
const EVENT_STATUSES = ["Requested", "Assigned", "Out at Event", "Closed"];
const RETURN_STATUSES = ["Returned", "Damaged", "Lost"];


function readJson(fileName, fallback) {
  const filePath = path.join(DATA_FOLDER, fileName);
  if (!fs.existsSync(filePath)) {
    return fallback;
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function dateOnly(text) {
  const value = String(text || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}


async function main() {
  await db.runSchema();
  console.log("Tables are ready.");

  const check = await db.query(`
    SELECT (SELECT count(*) FROM categories) +
           (SELECT count(*) FROM devices) +
           (SELECT count(*) FROM events) +
           (SELECT count(*) FROM users) AS total
  `);

  if (Number(check.rows[0].total) > 0) {
    console.log("The database already has data, so nothing was imported (to avoid duplicates).");
    return;
  }

  const settings = readJson("settings.json", { categories: [], types: [] });
  const devices = readJson("devices.json", []);
  const events = readJson("events.json", []);
  const users = readJson("users.json", []);

  const totals = { categories: 0, types: 0, users: 0, events: 0, devices: 0, assignments: 0, skipped: 0 };

  await db.transaction(async function (client) {

    // ---------- Categories ----------
    const categoryIds = {};

    async function ensureCategory(name) {
      const cleanName = String(name || "").trim() || "Uncategorized";
      const key = cleanName.toLowerCase();

      if (!categoryIds[key]) {
        const result = await client.query("INSERT INTO categories (name) VALUES ($1) RETURNING id", [cleanName]);
        categoryIds[key] = result.rows[0].id;
        totals.categories++;
      }
      return categoryIds[key];
    }

    for (const category of settings.categories || []) {
      await ensureCategory(category);
    }

    // ---------- Device types ----------
    const typeIds = {};

    async function ensureType(name, categoryName) {
      const cleanName = String(name || "").trim();
      const key = cleanName.toLowerCase();

      if (!typeIds[key]) {
        const categoryId = await ensureCategory(categoryName);
        const result = await client.query(
          "INSERT INTO device_types (name, category_id) VALUES ($1, $2) RETURNING id",
          [cleanName, categoryId]
        );
        typeIds[key] = result.rows[0].id;
        totals.types++;
      }
      return typeIds[key];
    }

    let types = Array.isArray(settings.types) ? settings.types : [];
    if (types.length === 0 && Array.isArray(settings.deviceTypes)) {
      types = [];
      for (const name of settings.deviceTypes) {
        types.push({ name: name, category: "" });
      }
    }

    for (const type of types) {
      await ensureType(type.name, type.category);
    }

    // ---------- Users ----------
    for (const user of users) {
      await client.query(
        `INSERT INTO users (id, name, email, role, active, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
        [user.id, user.name, user.email, user.role, user.active !== false, user.passwordHash, user.createdAt || null]
      );
      totals.users++;
    }

    // ---------- Events and their requested items ----------
    const eventIds = new Set();
    const today = new Date().toISOString().slice(0, 10);

    for (const event of events) {
      const startDate = dateOnly(event.startDate) || dateOnly(event.createdAt) || today;
      let endDate = dateOnly(event.endDate) || startDate;
      if (endDate < startDate) {
        endDate = startDate;
      }

      await client.query(
        `INSERT INTO events (id, name, start_date, end_date, location, requested_by, requester_email,
                             requester_phone, cc_emails, notes, source, created_by, status,
                             created_at, assigned_at, dispatched_at, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
                 COALESCE($14::timestamptz, now()), $15, $16, $17)`,
        [
          event.id,
          event.name,
          startDate,
          endDate,
          event.location || "",
          event.requestedBy || "",
          event.requesterEmail || "",
          event.requesterPhone || "",
          event.ccEmails || "",
          event.notes || "",
          event.source || "Staff request",
          event.createdBy || null,
          EVENT_STATUSES.includes(event.status) ? event.status : "Requested",
          event.createdAt || null,
          event.assignedAt || null,
          event.dispatchedAt || null,
          event.closedAt || null
        ]
      );
      eventIds.add(event.id);
      totals.events++;

      for (const item of event.itemsList || []) {
        if (Number(item.qty) > 0) {
          await client.query(
            "INSERT INTO event_items (event_id, item_name, qty) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
            [event.id, item.name, Number(item.qty)]
          );
        }
      }
    }

    // ---------- Devices and their history ----------
    const serials = new Set();

    for (const device of devices) {
      const typeId = await ensureType(device.name, device.category);
      let status = device.status === "Missing" ? "Lost" : device.status;
      if (!DEVICE_STATUSES.includes(status)) {
        status = "In Office";
      }
      const currentEventId = device.eventId && eventIds.has(device.eventId) ? device.eventId : null;

      await client.query(
        "INSERT INTO devices (serial, type_id, status, current_event_id) VALUES ($1, $2, $3, $4)",
        [device.serial, typeId, status, currentEventId]
      );
      serials.add(device.serial);
      totals.devices++;

      for (const entry of device.history || []) {
        await client.query(
          `INSERT INTO device_history (serial, action, event_id, event_name, note, created_at)
           VALUES ($1, $2, $3, $4, $5, COALESCE($6::timestamptz, now()))`,
          [
            device.serial,
            entry.action,
            entry.eventId && eventIds.has(entry.eventId) ? entry.eventId : null,
            entry.eventName || null,
            entry.note || "",
            entry.date || null
          ]
        );
      }
    }

    // ---------- Assignments and email log ----------
    for (const event of events) {
      for (const assignment of event.assignments || []) {
        if (!serials.has(assignment.serial)) {
          console.warn(`Skipped ${assignment.serial} in "${event.name}" because that device no longer exists.`);
          totals.skipped++;
          continue;
        }

        await client.query(
          `INSERT INTO assignments (event_id, serial, assigned_at, return_status, returned_at, note)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (event_id, serial) DO NOTHING`,
          [
            event.id,
            assignment.serial,
            assignment.assignedAt || null,
            RETURN_STATUSES.includes(assignment.returnStatus) ? assignment.returnStatus : null,
            assignment.returnedAt || null,
            assignment.note || ""
          ]
        );
        totals.assignments++;
      }

      for (const email of event.emails || []) {
        await client.query(
          `INSERT INTO email_log (event_id, type, to_address, cc, devices, sent_by, sent_at)
           VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, now()))`,
          [event.id, email.type, email.to || "", email.cc || "", email.devices || 0, email.by || null, email.sentAt || null]
        );
      }
    }
  });

  console.log("Import complete:");
  console.log(`  ${totals.categories} categories, ${totals.types} device types, ${totals.users} users`);
  console.log(`  ${totals.events} events, ${totals.devices} devices, ${totals.assignments} assignments`);
  if (totals.skipped > 0) {
    console.log(`  ${totals.skipped} assignment(s) skipped (see warnings above)`);
  }
}


main()
  .then(function () {
    return db.close();
  })
  .catch(async function (error) {
    console.error("Import failed, and nothing was saved:", error.message);
    await db.close();
    process.exitCode = 1;
  });