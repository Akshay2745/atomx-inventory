// ============ Load the tools we need ============

const express = require("express");
const fs = require("fs");
const path = require("path");


// ============ Create the server ============

const app = express();
const PORT = 3000;
const DEVICES_FILE = path.join(__dirname, "data", "devices.json");

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));


// ============ Helper: read devices from the file ============

function readDevices() {
  const text = fs.readFileSync(DEVICES_FILE, "utf-8");
  return JSON.parse(text);
}


// ============ API: send the device list ============

app.get("/api/devices", function (req, res) {
  try {
    const devices = readDevices();
    res.json(devices);
  } catch (error) {
    console.error("Could not read devices:", error);
    res.status(500).json({ error: "Could not load devices" });
  }
});


// ============ Start the server ============

app.listen(PORT, function () {
  console.log(`Atomx Inventory is running at http://localhost:${PORT}`);
});