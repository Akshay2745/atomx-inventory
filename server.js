// ============ Load the tools we need ============

const express = require("express");
const fs = require("fs");
const path = require("path");


// ============ Create the server ============

const app = express();
const PORT = 3000;
const DEVICES_FILE = path.join(__dirname, "data", "devices.json");
const EVENTS_FILE = path.join(__dirname, "data", "events.json");
const SETTINGS_FILE = path.join(__dirname, "data", "settings.json");

const QUANTITY_ITEMS = ["Charger", "Paper Roll"];
const DEFAULT_SETTINGS = {
  deviceTypes: ["POS Terminal", "Soundbox", "Card Reader", "QR Standee"],
  categories: ["Payment Device", "Display Item", "Accessory"]
};
const MAX_DEVICES_AT_ONCE = 500;
const MAX_IMPORT_ROWS = 1000;

app.use(express.json({ limit: "2mb" }));
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


// ============ Helpers: settings (device types and categories) ============

function readSettings() {
  if (!fs.existsSync(SETTINGS_FILE)) {
    saveJsonFile(SETTINGS_FILE, DEFAULT_SETTINGS);
    console.log("Created settings file with default device types and categories");
  }
  return readJsonFile(SETTINGS_FILE);
}

function settingsResponse(settings) {
  return {
    deviceTypes: settings.deviceTypes,
    categories: settings.categories,
    quantityItems: QUANTITY_ITEMS
  };
}

function getAllowedItems(settings) {
  return settings.deviceTypes.concat(QUANTITY_ITEMS);
}

function findMatch(list, value) {
  const lowerValue = value.toLowerCase();
  for (const item of list) {
    if (item.toLowerCase() === lowerValue) {
      return item;
    }
  }
  return null;
}


// ============ Helpers: devices ============

function buildDevice(rawSerial, rawName, rawCategory, settings) {
  const serial = String(rawSerial || "").trim().toUpperCase();
  const typedName = String(rawName || "").trim();
  const typedCategory = String(rawCategory || "").trim();
  const name = findMatch(settings.deviceTypes, typedName);
  const category = findMatch(settings.categories, typedCategory);

  if (serial === "") {
    return { error: "Serial number is missing." };
  }
  if (serial.length > 40) {
    return { error: `Serial number ${serial} is too long (maximum 40 characters).` };
  }
  if (!name) {
    return { error: `"${typedName}" is not a device type. Add it under Manage types first.` };
  }
  if (!category) {
    return { error: `"${typedCategory}" is not a category. Add it under Manage types first.` };
  }

  return {
    device: {
      serial: serial,
      name: name,
      category: category,
      status: "In Office",
      event: null
    }
  };
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

function getExistingSerials(devices) {
  const existing = new Set();
  for (const device of devices) {
    existing.add(device.serial);
  }
  return existing;
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


// ============ API: settings ============

app.get("/api/settings", function (req, res) {
  try {
    res.json(settingsResponse(readSettings()));
  } catch (error) {
    console.error("Could not read settings:", error);
    res.status(500).json({ error: "Could not load settings" });
  }
});

function handleAddSetting(req, res, listName, label) {
  const name = String(req.body.name || "").trim().replace(/\s+/g, " ");

  if (name === "") {
    return res.status(400).json({ error: `Please enter a ${label} name.` });
  }
  if (name.length > 40) {
    return res.status(400).json({ error: `The ${label} name is too long (maximum 40 characters).` });
  }

  try {
    const settings = readSettings();

    if (findMatch(settings[listName], name)) {
      return res.status(409).json({ error: `"${name}" already exists.` });
    }
    if (listName === "deviceTypes" && findMatch(QUANTITY_ITEMS, name)) {
      return res.status(409).json({ error: `"${name}" is already used as a quantity item.` });
    }

    settings[listName].push(name);
    saveJsonFile(SETTINGS_FILE, settings);

    console.log(`Added new ${label}: ${name}`);
    res.status(201).json(settingsResponse(settings));
  } catch (error) {
    console.error(`Could not add ${label}:`, error);
    res.status(500).json({ error: `Could not save the ${label}. Please try again.` });
  }
}

app.post("/api/settings/device-types", function (req, res) {
  handleAddSetting(req, res, "deviceTypes", "device type");
});

app.post("/api/settings/categories", function (req, res) {
  handleAddSetting(req, res, "categories", "category");
});


// ============ API: send the device list ============

app.get("/api/devices", function (req, res) {
  try {
    res.json(readJsonFile(DEVICES_FILE));
  } catch (error) {
    console.error("Could not read devices:", error);
    res.status(500).json({ error: "Could not load devices" });
  }
});


// ============ API: add one or more devices (same type, serials in sequence) ============

app.post("/api/devices", function (req, res) {
  const quantity = req.body.quantity === undefined ? 1 : Number(req.body.quantity);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_DEVICES_AT_ONCE) {
    return res.status(400).json({ error: `Quantity must be a whole number between 1 and ${MAX_DEVICES_AT_ONCE}.` });
  }

  try {
    const settings = readSettings();
    const first = buildDevice(req.body.serial, req.body.name, req.body.category, settings);

    if (first.error) {
      return res.status(400).json({ error: first.error });
    }

    let serials = [first.device.serial];
    if (quantity > 1) {
      serials = generateSerials(first.device.serial, quantity);
      if (!serials) {
        return res.status(400).json({ error: "To add more than one device, the serial number must end with a number, like POS-0010." });
      }
    }

    const devices = readJsonFile(DEVICES_FILE);
    const existingSerials = getExistingSerials(devices);
    const duplicates = [];

    for (const serial of serials) {
      if (existingSerials.has(serial)) {
        duplicates.push(serial);
      }
    }

    if (duplicates.length > 0) {
      const extra = duplicates.length > 5 ? ` and ${duplicates.length - 5} more` : "";
      return res.status(409).json({ error: `These serial numbers already exist: ${duplicates.slice(0, 5).join(", ")}${extra}.` });
    }

    const added = [];
    for (const serial of serials) {
      const newDevice = {
        serial: serial,
        name: first.device.name,
        category: first.device.category,
        status: "In Office",
        event: null
      };
      devices.push(newDevice);
      added.push(newDevice);
    }

    saveJsonFile(DEVICES_FILE, devices);

    console.log(`Added ${added.length} device(s): ${serials[0]}${added.length > 1 ? " to " + serials[serials.length - 1] : ""}`);
    res.status(201).json({ added: added });
  } catch (error) {
    console.error("Could not save devices:", error);
    res.status(500).json({ error: "Could not save the devices. Please try again." });
  }
});


// ============ API: import many devices from a CSV file ============

app.post("/api/devices/bulk", function (req, res) {
  const rows = Array.isArray(req.body.devices) ? req.body.devices : [];

  if (rows.length === 0) {
    return res.status(400).json({ error: "The file has no devices to import." });
  }
  if (rows.length > MAX_IMPORT_ROWS) {
    return res.status(400).json({ error: `You can import up to ${MAX_IMPORT_ROWS} devices at a time. Please split the file.` });
  }

  try {
    const settings = readSettings();
    const devices = readJsonFile(DEVICES_FILE);
    const existingSerials = getExistingSerials(devices);
    const serialsInFile = new Set();
    const errors = [];
    const toAdd = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNumber = row.line || i + 2;
      const result = buildDevice(row.serial, row.type, row.category, settings);

      if (result.error) {
        errors.push(`Row ${lineNumber}: ${result.error}`);
        continue;
      }

      const serial = result.device.serial;

      if (existingSerials.has(serial)) {
        errors.push(`Row ${lineNumber}: ${serial} already exists in the inventory.`);
        continue;
      }
      if (serialsInFile.has(serial)) {
        errors.push(`Row ${lineNumber}: ${serial} appears more than once in the file.`);
        continue;
      }

      serialsInFile.add(serial);
      toAdd.push(result.device);
    }

    if (errors.length > 0) {
      return res.status(400).json({
        error: `Nothing was imported. Please fix ${errors.length} problem(s) in your file and try again.`,
        details: errors.slice(0, 50)
      });
    }

    for (const device of toAdd) {
      devices.push(device);
    }
    saveJsonFile(DEVICES_FILE, devices);

    console.log(`Imported ${toAdd.length} devices from CSV`);
    res.status(201).json({ added: toAdd });
  } catch (error) {
    console.error("Could not import devices:", error);
    res.status(500).json({ error: "Could not import the devices. Please try again." });
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

  let allowedItems;
  try {
    allowedItems = getAllowedItems(readSettings());
  } catch (error) {
    console.error("Could not read settings:", error);
    return res.status(500).json({ error: "Could not load settings. Please try again." });
  }

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

    if (!QUANTITY_ITEMS.includes(itemName)) {
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