// ============ Part 1: Your first JavaScript ============

console.log("Hello from Atomx Inventory!");


// ============ Part 2: Variables ============

const companyName = "Atomx";
let totalDevices = 6;
const isOfficeOpen = true;

console.log("Company:", companyName);
console.log("Total devices:", totalDevices);
console.log("Is office open?", isOfficeOpen);

totalDevices = 7;
console.log("After adding one device:", totalDevices);


// ============ Part 3: An object (one device) ============

const device = {
  serial: "POS-0001",
  name: "POS Terminal",
  category: "Payment Device",
  status: "In Office",
  event: null
};

console.log("Device serial:", device.serial);
console.log("Device status:", device.status);


// ============ Part 4: An array (a list) ============

const deviceTypes = ["POS Terminal", "Soundbox", "Card Reader", "QR Standee"];

console.log("First device type:", deviceTypes[0]);
console.log("Number of device types:", deviceTypes.length);


// ============ Part 5: Your inventory as data ============

const devices = [
  { serial: "POS-0001", name: "POS Terminal", category: "Payment Device", status: "In Office", event: null },
  { serial: "POS-0002", name: "POS Terminal", category: "Payment Device", status: "Assigned",  event: "Mumbai Fintech Expo" },
  { serial: "POS-0003", name: "POS Terminal", category: "Payment Device", status: "In Office", event: null },
  { serial: "SBX-0001", name: "Soundbox",     category: "Payment Device", status: "Assigned",  event: "Pune Retail Fair" },
  { serial: "SBX-0002", name: "Soundbox",     category: "Payment Device", status: "Missing",   event: "Delhi Startup Summit" },
  { serial: "QR-0001",  name: "QR Standee",   category: "Display Item",   status: "In Office", event: null }
];

console.log("All devices:", devices);
console.log("Number of devices:", devices.length);
console.log("Second device:", devices[1].serial, "is at", devices[1].event);