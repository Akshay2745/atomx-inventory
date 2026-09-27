// ============ Load the tools we need ============

const express = require("express");
const path = require("path");
const db = require("./db");
const auth = require("./auth");
const mailer = require("./mailer");


// ============ Create the server ============

const app = express();
const PORT = Number(process.env.PORT || 3000);

const QUANTITY_ITEMS = ["Charger", "Paper Roll"];
const RETURN_STATUSES = ["Returned", "Damaged", "Lost"];
const MAX_DEVICES_AT_ONCE = 500;
const MAX_IMPORT_ROWS = 1000;

app.use(express.json({ limit: "2mb" }));
app.use(auth.requireLogin);
app.use(express.static(path.join(__dirname, "public")));
auth.registerAuthRoutes(app);


// ============ General helpers ============

function cleanName(value) {
  return String(value || "").trim().replace(/\s+/g, " ");
}

function toIso(value) {
  return value ? new Date(value).toISOString() : null;
}

function userName(req) {
  return req.user ? req.user.name : null;
}

function newEventId() {
  return `EVT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

function isUniqueViolation(error) {
  return error && error.code === "23505";
}

function isStillInUse(error) {
  return error && error.code === "23503";
}

function userError(status, message) {
  const error = new Error(message);
  error.status = status;
  error.userMessage = message;
  return error;
}

function handleError(res, error, message) {
  if (error && error.userMessage) {
    return res.status(error.status).json({ error: error.userMessage });
  }
  console.error(message, error);
  res.status(500).json({ error: `${message} Please try again.` });
}


// ============ Helpers: dates and serial numbers ============

function isValidDate(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(new Date(text).getTime());
}

function formatDate(text) {
  const date = new Date(text + "T00:00:00Z");
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateRange(startDate, endDate) {
  if (!startDate) return "";
  if (!endDate || startDate === endDate) {
    return formatDate(startDate);
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}

function generateSerials(startSerial, quantity) {
  const match = startSerial.match(/^(.*?)(\d+)$/);
  if (!match) {
    return null;
  }

  const prefix = match[1];
  const numberText = match[2];
  const width = numberText.length;
  const startNumber = Number(numberText);
  const serials = [];

  for (let i = 0; i < quantity; i++) {
    serials.push(prefix + String(startNumber + i).padStart(width, "0"));
  }
  return serials;
}


// ============ Reading settings (categories and device types) ============

async function getSettings(runner) {
  const source = runner || db;

  const categoryResult = await source.query("SELECT name FROM categories ORDER BY created_at, id");
  const typeResult = await source.query(`
    SELECT t.name, c.name AS category
    FROM device_types t
    JOIN categories c ON c.id = t.category_id
    ORDER BY t.created_at, t.id
  `);

  const categories = [];
  for (const row of categoryResult.rows) {
    categories.push(row.name);
  }

  const types = [];
  const deviceTypes = [];
  for (const row of typeResult.rows) {
    types.push({ name: row.name, category: row.category });
    deviceTypes.push(row.name);
  }

  return {
    categories: categories,
    types: types,
    deviceTypes: deviceTypes,
    quantityItems: QUANTITY_ITEMS
  };
}

async function findType(runner, name) {
  const result = await runner.query(`
    SELECT t.id, t.name, c.name AS category
    FROM device_types t
    JOIN categories c ON c.id = t.category_id
    WHERE lower(t.name) = lower($1)
  `, [String(name || "").trim()]);

  return result.rows[0] || null;
}


// ============ Reading devices ============

const DEVICE_SELECT = `
  SELECT d.serial, t.name AS type_name, c.name AS category, d.status,
         d.current_event_id, e.name AS event_name
  FROM devices d
  JOIN device_types t ON t.id = d.type_id
  JOIN categories c ON c.id = t.category_id
  LEFT JOIN events e ON e.id = d.current_event_id
`;

function mapDevice(row) {
  return {
    serial: row.serial,
    name: row.type_name,
    category: row.category,
    status: row.status,
    event: row.event_name || null,
    eventId: row.current_event_id || null
  };
}


// ============ Reading events (with their items, assignments and emails) ============

async function loadEvents(runner, eventId) {
  const where = eventId ? "WHERE e.id = $1" : "";
  const params = eventId ? [eventId] : [];

  const eventResult = await runner.query(`
    SELECT e.*,
           to_char(e.start_date, 'YYYY-MM-DD') AS start_text,
           to_char(e.end_date, 'YYYY-MM-DD') AS end_text
    FROM events e
    ${where}
    ORDER BY e.created_at
  `, params);

  if (eventResult.rows.length === 0) {
    return [];
  }

  const ids = [];
  const byId = {};
  const events = [];

  for (const row of eventResult.rows) {
    const event = {
      id: row.id,
      name: row.name,
      startDate: row.start_text,
      endDate: row.end_text,
      dates: formatDateRange(row.start_text, row.end_text),
      location: row.location,
      requestedBy: row.requested_by,
      requesterEmail: row.requester_email,
      requesterPhone: row.requester_phone,
      ccEmails: row.cc_emails,
      notes: row.notes,
      source: row.source,
      createdBy: row.created_by,
      status: row.status,
      createdAt: toIso(row.created_at),
      assignedAt: toIso(row.assigned_at),
      dispatchedAt: toIso(row.dispatched_at),
      closedAt: toIso(row.closed_at),
      itemsList: [],
      items: "",
      assignments: [],
      emails: [],
      missing: 0
    };

    ids.push(row.id);
    byId[row.id] = event;
    events.push(event);
  }

  const itemResult = await runner.query(
    "SELECT event_id, item_name, qty FROM event_items WHERE event_id = ANY($1) ORDER BY item_name",
    [ids]
  );

  const assignmentResult = await runner.query(`
    SELECT a.event_id, a.serial, t.name AS type_name, a.assigned_at, a.return_status, a.returned_at, a.note
    FROM assignments a
    JOIN devices d ON d.serial = a.serial
    JOIN device_types t ON t.id = d.type_id
    WHERE a.event_id = ANY($1)
    ORDER BY a.id
  `, [ids]);

  const emailResult = await runner.query(
    "SELECT event_id, type, to_address, cc, devices, sent_by, sent_at FROM email_log WHERE event_id = ANY($1) ORDER BY id",
    [ids]
  );

  for (const row of itemResult.rows) {
    byId[row.event_id].itemsList.push({ name: row.item_name, qty: row.qty });
  }

  for (const row of assignmentResult.rows) {
    const event = byId[row.event_id];
    event.assignments.push({
      serial: row.serial,
      name: row.type_name,
      assignedAt: toIso(row.assigned_at),
      returnStatus: row.return_status,
      returnedAt: toIso(row.returned_at),
      note: row.note
    });
    if (row.return_status === "Lost") {
      event.missing++;
    }
  }

  for (const row of emailResult.rows) {
    byId[row.event_id].emails.push({
      type: row.type,
      to: row.to_address,
      cc: row.cc,
      devices: row.devices,
      sentAt: toIso(row.sent_at),
      by: row.sent_by
    });
  }

  for (const event of events) {
    const texts = [];
    for (const item of event.itemsList) {
      texts.push(`${item.qty} ${item.name}`);
    }
    event.items = texts.join(", ");
  }

  return events;
}

async function loadEvent(runner, eventId) {
  const events = await loadEvents(runner, eventId);
  return events[0] || null;
}


// ============ API: settings ============

app.get("/api/settings", async function (req, res) {
  try {
    res.json(await getSettings());
  } catch (error) {
    handleError(res, error, "Could not load settings.");
  }
});


// ============ API: categories ============

app.post("/api/settings/categories", async function (req, res) {
  const name = cleanName(req.body.name);

  if (name === "") {
    return res.status(400).json({ error: "Please enter a category name." });
  }
  if (name.length > 40) {
    return res.status(400).json({ error: "The category name is too long (maximum 40 characters)." });
  }

  try {
    await db.query("INSERT INTO categories (name) VALUES ($1)", [name]);
    console.log(`Created category: ${name}`);
    res.status(201).json(await getSettings());
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: `The category "${name}" already exists.` });
    }
    handleError(res, error, "Could not save the category.");
  }
});

app.delete("/api/settings/categories/:name", async function (req, res) {
  try {
    const found = await db.query("SELECT id, name FROM categories WHERE lower(name) = lower($1)", [req.params.name]);
    const category = found.rows[0];

    if (!category) {
      return res.status(404).json({ error: "Category not found." });
    }

    const typeResult = await db.query("SELECT name FROM device_types WHERE category_id = $1 ORDER BY name", [category.id]);
    if (typeResult.rows.length > 0) {
      const names = [];
      for (const row of typeResult.rows) {
        names.push(row.name);
      }
      return res.status(409).json({ error: `"${category.name}" still has device types (${names.join(", ")}). Delete those types first.` });
    }

    await db.query("DELETE FROM categories WHERE id = $1", [category.id]);
    console.log(`Deleted category: ${category.name}`);
    res.json(await getSettings());
  } catch (error) {
    if (isStillInUse(error)) {
      return res.status(409).json({ error: "This category is still in use, so it can't be deleted." });
    }
    handleError(res, error, "Could not delete the category.");
  }
});


// ============ API: device types ============

app.post("/api/settings/types", async function (req, res) {
  const name = cleanName(req.body.name);
  const typedCategory = cleanName(req.body.category);

  if (name === "") {
    return res.status(400).json({ error: "Please enter a device type name." });
  }
  if (name.length > 40) {
    return res.status(400).json({ error: "The device type name is too long (maximum 40 characters)." });
  }
  if (typedCategory === "") {
    return res.status(400).json({ error: "Please choose a category for this device type." });
  }
  for (const item of QUANTITY_ITEMS) {
    if (item.toLowerCase() === name.toLowerCase()) {
      return res.status(409).json({ error: `"${name}" is already used as a quantity item.` });
    }
  }

  try {
    const found = await db.query("SELECT id, name FROM categories WHERE lower(name) = lower($1)", [typedCategory]);
    const category = found.rows[0];

    if (!category) {
      return res.status(400).json({ error: `The category "${typedCategory}" does not exist. Create it on the Categories page first.` });
    }

    await db.query("INSERT INTO device_types (name, category_id) VALUES ($1, $2)", [name, category.id]);
    console.log(`Created device type: ${name} (${category.name})`);
    res.status(201).json(await getSettings());
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: `The device type "${name}" already exists.` });
    }
    handleError(res, error, "Could not save the device type.");
  }
});

app.delete("/api/settings/types/:name", async function (req, res) {
  try {
    const type = await findType(db, req.params.name);

    if (!type) {
      return res.status(404).json({ error: "Device type not found." });
    }

    const countResult = await db.query("SELECT count(*)::int AS count FROM devices WHERE type_id = $1", [type.id]);
    const deviceCount = countResult.rows[0].count;

    if (deviceCount > 0) {
      return res.status(409).json({ error: `${deviceCount} device(s) use "${type.name}", so it can't be deleted.` });
    }

    await db.query("DELETE FROM device_types WHERE id = $1", [type.id]);
    console.log(`Deleted device type: ${type.name}`);
    res.json(await getSettings());
  } catch (error) {
    if (isStillInUse(error)) {
      return res.status(409).json({ error: "Devices use this type, so it can't be deleted." });
    }
    handleError(res, error, "Could not delete the device type.");
  }
});


// ============ API: devices ============

app.get("/api/devices", async function (req, res) {
  try {
    const result = await db.query(`${DEVICE_SELECT} ORDER BY d.created_at, d.serial`);
    const devices = [];
    for (const row of result.rows) {
      devices.push(mapDevice(row));
    }
    res.json(devices);
  } catch (error) {
    handleError(res, error, "Could not load devices.");
  }
});

app.get("/api/devices/:serial", async function (req, res) {
  try {
    const serial = String(req.params.serial).trim().toUpperCase();
    const result = await db.query(`${DEVICE_SELECT} WHERE d.serial = $1`, [serial]);

    if (!result.rows[0]) {
      return res.status(404).json({ error: "Device not found" });
    }

    const device = mapDevice(result.rows[0]);

    const historyResult = await db.query(
      "SELECT action, event_id, event_name, note, created_by, created_at FROM device_history WHERE serial = $1 ORDER BY created_at, id",
      [serial]
    );

    device.history = [];
    for (const row of historyResult.rows) {
      device.history.push({
        action: row.action,
        eventId: row.event_id,
        eventName: row.event_name,
        note: row.note,
        by: row.created_by,
        date: toIso(row.created_at)
      });
    }

    res.json(device);
  } catch (error) {
    handleError(res, error, "Could not load the device.");
  }
});

app.post("/api/devices", async function (req, res) {
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);
  const firstSerial = String(req.body.serial || "").trim().toUpperCase();

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_DEVICES_AT_ONCE) {
    return res.status(400).json({ error: `Quantity must be a whole number between 1 and ${MAX_DEVICES_AT_ONCE}.` });
  }
  if (firstSerial === "") {
    return res.status(400).json({ error: "Serial number is missing." });
  }
  if (firstSerial.length > 40) {
    return res.status(400).json({ error: "The serial number is too long (maximum 40 characters)." });
  }

  let serials = [firstSerial];
  if (quantity > 1) {
    serials = generateSerials(firstSerial, quantity);
    if (!serials) {
      return res.status(400).json({ error: "To add more than one device, the serial number must end with a number, like POS-0010." });
    }
  }

  try {
    const type = await findType(db, req.body.name);
    if (!type) {
      return res.status(400).json({ error: `"${String(req.body.name || "").trim()}" is not a device type. Create it on the Device Types page first.` });
    }

    await db.transaction(async function (client) {
      const existing = await client.query("SELECT serial FROM devices WHERE serial = ANY($1) ORDER BY serial", [serials]);

      if (existing.rows.length > 0) {
        const duplicates = [];
        for (const row of existing.rows) {
          duplicates.push(row.serial);
        }
        const extra = duplicates.length > 5 ? ` and ${duplicates.length - 5} more` : "";
        throw userError(409, `These serial numbers already exist: ${duplicates.slice(0, 5).join(", ")}${extra}.`);
      }

      await client.query(
        "INSERT INTO devices (serial, type_id) SELECT unnest($1::text[]), $2",
        [serials, type.id]
      );
    });

    const added = [];
    for (const serial of serials) {
      added.push({ serial: serial, name: type.name, category: type.category, status: "In Office", event: null, eventId: null });
    }

    console.log(`Added ${added.length} ${type.name} device(s)`);
    res.status(201).json({ added: added });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Some of these serial numbers were just added by someone else. Please refresh and try again." });
    }
    handleError(res, error, "Could not save the devices.");
  }
});

app.post("/api/devices/bulk", async function (req, res) {
  const rows = Array.isArray(req.body.devices) ? req.body.devices : [];

  if (rows.length === 0) {
    return res.status(400).json({ error: "The file has no devices to import." });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `You can import up to ${MAX_IMPORT_ROWS} devices at a time. Please split the file.` });
  }

  try {
    const typeResult = await db.query(`
      SELECT t.id, t.name, c.name AS category
      FROM device_types t
      JOIN categories c ON c.id = t.category_id
    `);

    const typesByName = {};
    for (const row of typeResult.rows) {
      typesByName[row.name.toLowerCase()] = row;
    }

    const errors = [];
    const toAdd = [];
    const lineBySerial = {};

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNumber = row.line || i + 2;
      const serial = String(row.serial || "").trim().toUpperCase();
      const typedName = String(row.type || "").trim();
      const type = typesByName[typedName.toLowerCase()];

      if (serial === "") {
        errors.push(`Row ${lineNumber}: Serial number is missing.`);
        continue;
      }
      if (serial.length > 40) {
        errors.push(`Row ${lineNumber}: Serial number ${serial} is too long (maximum 40 characters).`);
        continue;
      }
      if (!type) {
        errors.push(`Row ${lineNumber}: "${typedName}" is not a device type. Create it on the Device Types page first.`);
        continue;
      }
      if (lineBySerial[serial]) {
        errors.push(`Row ${lineNumber}: ${serial} appears more than once in the file.`);
        continue;
      }

      lineBySerial[serial] = lineNumber;
      toAdd.push({ serial: serial, type: type });
    }

    const serials = [];
    const typeIds = [];
    for (const item of toAdd) {
      serials.push(item.serial);
      typeIds.push(item.type.id);
    }

    if (serials.length > 0) {
      const existing = await db.query("SELECT serial FROM devices WHERE serial = ANY($1)", [serials]);
      for (const row of existing.rows) {
        errors.push(`Row ${lineBySerial[row.serial]}: ${row.serial} already exists in the inventory.`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: `Nothing was imported. Please fix ${errors.length} problem(s) in your file and try again.`,
        details: errors.slice(0, 50)
      });
    }

    await db.transaction(async function (client) {
      await client.query(
        "INSERT INTO devices (serial, type_id) SELECT * FROM unnest($1::text[], $2::int[])",
        [serials, typeIds]
      );
    });

    const added = [];
    for (const item of toAdd) {
      added.push({ serial: item.serial, name: item.type.name, category: item.type.category, status: "In Office", event: null, eventId: null });
    }

    console.log(`Imported ${added.length} devices from CSV`);
    res.status(201).json({ added: added });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return res.status(409).json({ error: "Some serial numbers were just added by someone else. Please refresh and try again." });
    }
    handleError(res, error, "Could not import the devices.");
  }
});


// ============ API: events ============

app.get("/api/events", async function (req, res) {
  try {
    res.json(await loadEvents(db));
  } catch (error) {
    handleError(res, error, "Could not load events.");
  }
});

app.get("/api/events/:id", async function (req, res) {
  try {
    const event = await loadEvent(db, req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    handleError(res, error, "Could not load the event.");
  }
});

app.post("/api/events", async function (req, res) {
  const body = req.body;

  const name = String(body.eventName || "").trim();
  const startDate = String(body.startDate || "").trim();
  const endDate = String(body.endDate || "").trim();
  const location = String(body.location || "").trim();
  const requesterName = String(body.requesterName || "").trim();
  const requesterEmail = String(body.requesterEmail || "").trim();
  const requesterPhone = String(body.requesterPhone || "").trim();
  const ccEmails = String(body.ccEmails || "").trim();
  const notes = String(body.notes || "").trim();
  const source = req.user && body.source === "manager" ? "Created by inventory manager" : "Staff request";

  if (name === "" || location === "" || requesterName === "" || requesterEmail === "") {
    return res.status(400).json({ error: "Please fill in all required fields." });
  }
  if (!requesterEmail.includes("@")) {
    return res.status(400).json({ error: "Please enter a valid email address." });
  }
  if (!isValidDate(startDate) || !isValidDate(endDate)) {
    return res.status(400).json({ error: "Please enter valid start and end dates." });
  }
  if (endDate < startDate) {
    return res.status(400).json({ error: "The end date can't be before the start date." });
  }

  const items = Array.isArray(body.items) ? body.items : [];
  if (items.length === 0) {
    return res.status(400).json({ error: "Please add at least one item." });
  }

  try {
    const settings = await getSettings();
    const allowedItems = settings.deviceTypes.concat(QUANTITY_ITEMS);

    const cleanItems = [];
    const seenNames = [];

    for (const item of items) {
      const itemName = String(item.name || "").trim();
      const qty = Number(item.qty);

      if (!allowedItems.includes(itemName)) {
        return res.status(400).json({ error: `"${itemName}" is not a valid item.` });
      }
      if (!Number.isInteger(qty) || qty < 1) {
        return res.status(400).json({ error: `Quantity for ${itemName} must be a whole number of at least 1.` });
      }
      if (seenNames.includes(itemName)) {
        return res.status(400).json({ error: `${itemName} is listed twice. Please combine it into one row.` });
      }

      seenNames.push(itemName);
      cleanItems.push({ name: itemName, qty: qty });
    }

    const eventId = newEventId();

    await db.transaction(async function (client) {
      await client.query(`
        INSERT INTO events (id, name, start_date, end_date, location, requested_by, requester_email,
                            requester_phone, cc_emails, notes, source, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [eventId, name, startDate, endDate, location, requesterName, requesterEmail,
          requesterPhone, ccEmails, notes, source, userName(req)]);

      for (const item of cleanItems) {
        await client.query(
          "INSERT INTO event_items (event_id, item_name, qty) VALUES ($1, $2, $3)",
          [eventId, item.name, item.qty]
        );
      }
    });

    const newEvent = await loadEvent(db, eventId);
    console.log(`New event created: ${name} (${source})`);

    if (source === "Staff request") {
      auth.getNotificationEmails()
        .then(function (emails) {
          return mailer.sendNewRequestEmail(newEvent, emails);
        })
        .catch(function (error) {
          console.error("Could not send the new request alert:", error.message);
        });
    }

    res.status(201).json(newEvent);
  } catch (error) {
    handleError(res, error, "Could not save the event.");
  }
});


// ============ API: assign devices to an event ============

app.post("/api/events/:id/assign", async function (req, res) {
  const rawSerials = Array.isArray(req.body.serials) ? req.body.serials : [];
  const serials = [];

  for (const rawSerial of rawSerials) {
    const serial = String(rawSerial || "").trim().toUpperCase();
    if (serial !== "" && !serials.includes(serial)) {
      serials.push(serial);
    }
  }

  if (serials.length === 0) {
    return res.status(400).json({ error: "Please select at least one device to assign." });
  }
  if (serials.length > MAX_DEVICES_AT_ONCE) {
    return res.status(400).json({ error: `You can assign up to ${MAX_DEVICES_AT_ONCE} devices at a time.` });
  }

  try {
    let eventName = "";

    await db.transaction(async function (client) {
      const eventResult = await client.query("SELECT id, name, status FROM events WHERE id = $1 FOR UPDATE", [req.params.id]);
      const event = eventResult.rows[0];

      if (!event) {
        throw userError(404, "Event not found");
      }
      if (event.status === "Closed") {
        throw userError(409, "This event is closed. Devices can't be assigned to it anymore.");
      }
      eventName = event.name;

      const deviceResult = await client.query(`
        SELECT d.serial, d.status, e.name AS event_name
        FROM devices d
        LEFT JOIN events e ON e.id = d.current_event_id
        WHERE d.serial = ANY($1)
        FOR UPDATE OF d
      `, [serials]);

      const bySerial = {};
      for (const row of deviceResult.rows) {
        bySerial[row.serial] = row;
      }

      for (const serial of serials) {
        const device = bySerial[serial];
        if (!device) {
          throw userError(400, `Device ${serial} was not found in the inventory.`);
        }
        if (device.status !== "In Office") {
          const where = device.event_name ? ` at ${device.event_name}` : "";
          throw userError(409, `${serial} is not available (currently ${device.status}${where}). Please refresh the page.`);
        }
      }

      await client.query(
        "UPDATE devices SET status = 'Assigned', current_event_id = $1 WHERE serial = ANY($2)",
        [event.id, serials]
      );

      await client.query(`
        INSERT INTO assignments (event_id, serial, assigned_at)
        SELECT $1, unnest($2::text[]), now()
        ON CONFLICT (event_id, serial)
        DO UPDATE SET assigned_at = now(), return_status = NULL, returned_at = NULL, note = ''
      `, [event.id, serials]);

      await client.query(`
        INSERT INTO device_history (serial, action, event_id, event_name, created_by)
        SELECT unnest($1::text[]), 'Assigned', $2, $3, $4
      `, [serials, event.id, event.name, userName(req)]);

      if (event.status === "Requested") {
        await client.query("UPDATE events SET status = 'Assigned', assigned_at = now() WHERE id = $1", [event.id]);
      }
    });

    const updatedEvent = await loadEvent(db, req.params.id);
    console.log(`Assigned ${serials.length} device(s) to ${eventName}`);
    res.json(updatedEvent);
  } catch (error) {
    handleError(res, error, "Could not save the assignment.");
  }
});


// ============ API: check devices back in (returned, damaged or lost) ============

app.post("/api/events/:id/return", async function (req, res) {
  const rawReturns = Array.isArray(req.body.returns) ? req.body.returns : [];
  const returns = [];
  const seen = new Set();

  for (const item of rawReturns) {
    const serial = String(item.serial || "").trim().toUpperCase();
    const status = String(item.status || "");
    const note = String(item.note || "").trim().slice(0, 300);

    if (!RETURN_STATUSES.includes(status)) {
      return res.status(400).json({ error: `"${status}" is not a valid return status.` });
    }
    if (serial === "" || seen.has(serial)) {
      continue;
    }

    seen.add(serial);
    returns.push({ serial: serial, status: status, note: note });
  }

  if (returns.length === 0) {
    return res.status(400).json({ error: "Please choose a return status for at least one device." });
  }

  const serials = [];
  for (const item of returns) {
    serials.push(item.serial);
  }

  try {
    let eventName = "";

    await db.transaction(async function (client) {
      const eventResult = await client.query("SELECT id, name, status FROM events WHERE id = $1 FOR UPDATE", [req.params.id]);
      const event = eventResult.rows[0];

      if (!event) {
        throw userError(404, "Event not found");
      }
      if (event.status === "Closed") {
        throw userError(409, "This event is already closed.");
      }
      eventName = event.name;

      const assignmentResult = await client.query(
        "SELECT serial, return_status FROM assignments WHERE event_id = $1 AND serial = ANY($2) FOR UPDATE",
        [event.id, serials]
      );

      const bySerial = {};
      for (const row of assignmentResult.rows) {
        bySerial[row.serial] = row;
      }

      for (const item of returns) {
        const assignment = bySerial[item.serial];
        if (!assignment) {
          throw userError(400, `${item.serial} is not assigned to this event.`);
        }
        if (assignment.return_status) {
          throw userError(409, `${item.serial} has already been checked in as ${assignment.return_status}. Please refresh the page.`);
        }
      }

      for (const item of returns) {
        await client.query(
          "UPDATE assignments SET return_status = $1, returned_at = now(), note = $2 WHERE event_id = $3 AND serial = $4",
          [item.status, item.note, event.id, item.serial]
        );

        if (item.status === "Returned") {
          await client.query("UPDATE devices SET status = 'In Office', current_event_id = NULL WHERE serial = $1", [item.serial]);
        } else {
          await client.query("UPDATE devices SET status = $1, current_event_id = $2 WHERE serial = $3", [item.status, event.id, item.serial]);
        }

        await client.query(
          "INSERT INTO device_history (serial, action, event_id, event_name, note, created_by) VALUES ($1, $2, $3, $4, $5, $6)",
          [item.serial, item.status, event.id, event.name, item.note, userName(req)]
        );
      }
    });

    const updatedEvent = await loadEvent(db, req.params.id);
    console.log(`Checked in ${returns.length} device(s) for ${eventName}`);
    res.json(updatedEvent);
  } catch (error) {
    handleError(res, error, "Could not save the returns.");
  }
});


// ============ API: change an event's status (dispatch or close) ============

app.post("/api/events/:id/status", async function (req, res) {
  const newStatus = String(req.body.status || "");

  try {
    await db.transaction(async function (client) {
      const eventResult = await client.query("SELECT id, status FROM events WHERE id = $1 FOR UPDATE", [req.params.id]);
      const event = eventResult.rows[0];

      if (!event) {
        throw userError(404, "Event not found");
      }

      const countResult = await client.query(`
        SELECT count(*)::int AS total,
               count(*) FILTER (WHERE return_status IS NULL)::int AS pending
        FROM assignments WHERE event_id = $1
      `, [event.id]);
      const counts = countResult.rows[0];

      if (newStatus === "Out at Event") {
        if (event.status !== "Assigned") {
          throw userError(409, "Only an assigned event can be marked as dispatched.");
        }
        if (counts.total === 0) {
          throw userError(409, "Assign at least one device before dispatching.");
        }
        await client.query("UPDATE events SET status = 'Out at Event', dispatched_at = now() WHERE id = $1", [event.id]);
      } else if (newStatus === "Closed") {
        if (event.status === "Closed") {
          throw userError(409, "This event is already closed.");
        }
        if (counts.pending > 0) {
          throw userError(409, `${counts.pending} device(s) have not been checked in yet. Record them as Returned, Damaged or Lost before closing.`);
        }
        await client.query("UPDATE events SET status = 'Closed', closed_at = now() WHERE id = $1", [event.id]);
      } else {
        throw userError(400, "Unknown status.");
      }
    });

    const updatedEvent = await loadEvent(db, req.params.id);
    console.log(`${updatedEvent.name} is now ${updatedEvent.status}`);

    if (updatedEvent.status === "Closed") {
      mailer.sendEventClosedEmail(updatedEvent);
    }

    res.json(updatedEvent);
  } catch (error) {
    handleError(res, error, "Could not update the event.");
  }
});


// ============ API: send the assignment confirmation email ============

app.post("/api/events/:id/email/confirmation", async function (req, res) {
  const ccList = mailer.parseEmailList(req.body.cc);

  if (ccList.invalid.length > 0) {
    return res.status(400).json({ error: `These don't look like email addresses: ${ccList.invalid.join(", ")}` });
  }

  try {
    const event = await loadEvent(db, req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }
    if (!event.requesterEmail) {
      return res.status(400).json({ error: "This event has no requester email address." });
    }
    if (event.assignments.length === 0) {
      return res.status(400).json({ error: "Assign at least one device before sending the confirmation." });
    }

    const result = await mailer.sendAssignmentEmail(event, ccList.valid);

    if (!result.ok) {
      return res.status(502).json({ error: "The email could not be sent. Please check the email settings and try again." });
    }

    const ccText = ccList.valid.join(", ");

    await db.transaction(async function (client) {
      await client.query("UPDATE events SET cc_emails = $1 WHERE id = $2", [ccText, event.id]);
      await client.query(
        "INSERT INTO email_log (event_id, type, to_address, cc, devices, sent_by) VALUES ($1, $2, $3, $4, $5, $6)",
        [event.id, "Assignment confirmation", event.requesterEmail, ccText, event.assignments.length, userName(req)]
      );
    });

    const updatedEvent = await loadEvent(db, event.id);
    res.json({ event: updatedEvent, previewUrl: result.previewUrl || null });
  } catch (error) {
    handleError(res, error, "Could not send the confirmation.");
  }
});


// ============ Start the server ============

async function start() {
  try {
    await db.runSchema();
    console.log("Connected to the database.");
  } catch (error) {
    console.error("Could not connect to the database. Check DATABASE_URL in your .env file and that PostgreSQL is running.");
    console.error(error.message);
    process.exit(1);
  }

  app.listen(PORT, function () {
    console.log(`InventoryX is running at http://localhost:${PORT}`);
  });
}

start();