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
    res.json(readJsonFile(EVENTS_FILE));
  } catch (error) {
    console.error("Could not read events:", error);
    res.status(500).json({ error: "Could not load events" });
  }
});


// ============ Start the server ============

app.listen(PORT, function () {
  console.log(`Atomx Inventory is running at http://localhost:${PORT}`);
});