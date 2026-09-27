// ============ Load the tools we need ============

const express = require("express");
const fs = require("fs");
const path = require("path");


// ============ Create the server ============

const app = express();
const PORT = 3000;
const DEVICES_FILE = path.join(__dirname, "data", "devices.json");
const EVENTS_FILE = path.join(__dirname, "data", "events.json");

const ALLOWED_NAMES = ["POS Terminal", "Soundbox", "Card Reader", "QR Standee"];
const ALLOWED_CATEGORIES = ["Payment Device", "Display Item", "Accessory"];
const ALLOWED_ITEMS = ["POS Terminal", "Soundbox", "Card Reader", "QR Standee", "Charger", "Paper Roll"];
const SERIAL_ITEMS = ["POS Terminal", "Soundbox", "Card Reader", "QR Standee"];

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// ============ Helpers: read and save data files ============

function readJsonFile(filePath) {
  const text = fs.readFileSync(filePath, "utf-8");
  return JSON.parse(text);
}

function saveJsonFile(filePath, data) {
  const text = JSON.stringify(data, null, 2);
  fs.writeFileSync(filePath, text);
}


// ============ Helpers: events (with automatic fix for old events) ============

function parseItemsText(text) {
  const list = [];
  const parts = String(text || "").split(",");

  for (const part of parts) {
    const trimmed = part.trim();
    const spaceIndex = trimmed.indexOf(" ");
    if (spaceIndex === -1) continue;

    const qty = Number(trimmed.slice(0, spaceIndex));
    const name = trimmed.slice(spaceIndex + 1);

    if (Number.isInteger(qty) && qty > 0) {
      list.push({ name: name, qty: qty });
    }
  }
  return list;
}

function readEvents() {
  const events = readJsonFile(EVENTS_FILE);
  let changed = false;
  let counter = 0;

  for (const event of events) {
    if (!event.id) {
      counter++;
      event.id = `EVT-${Date.now()}-${counter}`;
      changed = true;
    }
    if (!Array.isArray(event.itemsList)) {
      event.itemsList = parseItemsText(event.items);
      changed = true;
    }
  }

  if (changed) {
    saveJsonFile(EVENTS_FILE, events);
    console.log("Updated old events with ids and item lists");
  }

  return events;
}

function findEventById(events, id) {
  for (const event of events) {
    if (event.id === id) {
      return event;
    }
  }
  return null;
}


// ============ Helpers: dates ============

function isValidDate(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text) && !isNaN(new Date(text).getTime());
}

function formatDate(text) {
  const date = new Date(text + "T00:00:00Z");
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

function formatDateRange(startDate, endDate) {
  if (startDate === endDate) {
    return formatDate(startDate);
  }
  return `${formatDate(startDate)} – ${formatDate(endDate)}`;
}


// ============ API: send the device list ============

app.get("/api/devices", function (req, res) {
  try {
    res.json(readJsonFile(DEVICES_FILE));
  } catch (error) {
    console.error("Could not read devices:", error);
    res.status(500).json({ error: "Could not load devices" });
  }
});


// ============ API: add a new device ============

app.post("/api/devices", function (req, res) {
  const serial = String(req.body.serial || "").trim().toUpperCase();
  const name = String(req.body.name || "").trim();
  const category = String(req.body.category || "").trim();

  if (serial === "" || name === "" || category === "") {
    return res.status(400).json({ error: "Serial number, device type and category are all required." });
  }

  if (!ALLOWED_NAMES.includes(name)) {
    return res.status(400).json({ error: `"${name}" is not a valid device type.` });
  }

  if (!ALLOWED_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `"${category}" is not a valid category.` });
  }

  try {
    const devices = readJsonFile(DEVICES_FILE);

    for (const device of devices) {
      if (device.serial === serial) {
        return res.status(409).json({ error: `Serial number ${serial} already exists in the inventory.` });
      }
    }

    const newDevice = {
      serial: serial,
      name: name,
      category: category,
      status: "In Office",
      event: null
    };

    devices.push(newDevice);
    saveJsonFile(DEVICES_FILE, devices);

    console.log(`Added new device: ${serial}`);
    res.status(201).json(newDevice);
  } catch (error) {
    console.error("Could not save device:", error);
    res.status(500).json({ error: "Could not save the device. Please try again." });
  }
});


// ============ API: send the events list ============

app.get("/api/events", function (req, res) {
  try {
    res.json(readEvents());
  } catch (error) {
    console.error("Could not read events:", error);
    res.status(500).json({ error: "Could not load events" });
  }
});


// ============ API: send one event ============

app.get("/api/events/:id", function (req, res) {
  try {
    const event = findEventById(readEvents(), req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    res.json(event);
  } catch (error) {
    console.error("Could not read event:", error);
    res.status(500).json({ error: "Could not load the event" });
  }
});


// ============ API: create a new event ============

app.post("/api/events", function (req, res) {
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
  const source = body.source === "manager" ? "Created by inventory manager" : "Staff request";

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

  const cleanItems = [];
  const seenNames = [];

  for (const item of items) {
    const itemName = String(item.name || "").trim();
    const qty = Number(item.qty);

    if (!ALLOWED_ITEMS.includes(itemName)) {
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

  const itemTexts = [];
  for (const item of cleanItems) {
    itemTexts.push(`${item.qty} ${item.name}`);
  }

  try {
    const events = readEvents();

    const newEvent = {
      id: "EVT-" + Date.now(),
      name: name,
      startDate: startDate,
      endDate: endDate,
      dates: formatDateRange(startDate, endDate),
      location: location,
      requestedBy: requesterName,
      requesterEmail: requesterEmail,
      requesterPhone: requesterPhone,
      ccEmails: ccEmails,
      itemsList: cleanItems,
      items: itemTexts.join(", "),
      notes: notes,
      source: source,
      status: "Requested",
      missing: 0,
      createdAt: new Date().toISOString()
    };

    events.push(newEvent);
    saveJsonFile(EVENTS_FILE, events);

    console.log(`New event created: ${name} (${source})`);
    res.status(201).json(newEvent);
  } catch (error) {
    console.error("Could not save event:", error);
    res.status(500).json({ error: "Could not save the event. Please try again." });
  }
});


// ============ API: assign devices to an event ============

app.post("/api/events/:id/assign", function (req, res) {
  const rawSerials = Array.isArray(req.body.serials) ? req.body.serials : [];
  const rawQuantities = Array.isArray(req.body.quantityItems) ? req.body.quantityItems : [];
  const extraEmails = String(req.body.extraEmails || "").trim();
  const sendEmail = req.body.sendEmail === true;

  const serials = [];
  for (const rawSerial of rawSerials) {
    const serial = String(rawSerial || "").trim().toUpperCase();
    if (serial !== "" && !serials.includes(serial)) {
      serials.push(serial);
    }
  }

  const quantityItems = [];
  for (const item of rawQuantities) {
    const itemName = String(item.name || "").trim();
    const qty = Number(item.qty);

    if (!ALLOWED_ITEMS.includes(itemName) || SERIAL_ITEMS.includes(itemName)) {
      return res.status(400).json({ error: `"${itemName}" is not a valid quantity item.` });
    }
    if (!Number.isInteger(qty) || qty < 0) {
      return res.status(400).json({ error: `Quantity for ${itemName} must be a whole number.` });
    }
    if (qty > 0) {
      quantityItems.push({ name: itemName, qty: qty });
    }
  }

  if (serials.length === 0 && quantityItems.length === 0) {
    return res.status(400).json({ error: "Please assign at least one device or item." });
  }

  try {
    const events = readEvents();
    const devices = readJsonFile(DEVICES_FILE);
    const event = findEventById(events, req.params.id);

    if (!event) {
      return res.status(404).json({ error: "Event not found" });
    }

    if (event.status !== "Requested") {
      return res.status(409).json({ error: "This event has already been assigned." });
    }

    const devicesToAssign = [];
    for (const serial of serials) {
      let found = null;
      for (const device of devices) {
        if (device.serial === serial) {
          found = device;
        }
      }

      if (!found) {
        return res.status(400).json({ error: `Device ${serial} was not found in the inventory.` });
      }
      if (found.status !== "In Office") {
        return res.status(409).json({ error: `${serial} is not available (currently ${found.status}). Please refresh the page.` });
      }
      devicesToAssign.push(found);
    }

    for (const device of devicesToAssign) {
      device.status = "Assigned";
      device.event = event.name;
      device.eventId = event.id;
    }

    event.status = "Assigned";
    event.assignedDevices = serials;
    event.assignedQuantities = quantityItems;
    event.ccEmails = extraEmails;
    event.sendEmail = sendEmail;
    event.assignedAt = new Date().toISOString();

    saveJsonFile(DEVICES_FILE, devices);
    saveJsonFile(EVENTS_FILE, events);

    console.log(`Assigned ${serials.length} devices to ${event.name}`);
    res.json(event);
  } catch (error) {
    console.error("Could not assign devices:", error);
    res.status(500).json({ error: "Could not save the assignment. Please try again." });
  }
});


// ============ Start the server ============

app.listen(PORT, function () {
  console.log(`Atomx Inventory is running at http://localhost:${PORT}`);
});