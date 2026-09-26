// ============ Your inventory data ============

const devices = [
  { serial: "POS-0001", name: "POS Terminal", category: "Payment Device", status: "In Office", event: null },
  { serial: "POS-0002", name: "POS Terminal", category: "Payment Device", status: "Assigned",  event: "Mumbai Fintech Expo" },
  { serial: "POS-0003", name: "POS Terminal", category: "Payment Device", status: "In Office", event: null },
  { serial: "SBX-0001", name: "Soundbox",     category: "Payment Device", status: "Assigned",  event: "Pune Retail Fair" },
  { serial: "SBX-0002", name: "Soundbox",     category: "Payment Device", status: "Missing",   event: "Delhi Startup Summit" },
  { serial: "QR-0001",  name: "QR Standee",   category: "Display Item",   status: "In Office", event: null }
];


// ============ Part 1: A loop (go through every device) ============

for (const device of devices) {
  console.log(`${device.serial} is ${device.status}`);
}


// ============ Part 2: Conditions (make decisions) ============

for (const device of devices) {
  if (device.status === "In Office") {
    console.log(`${device.serial} is available for events`);
  } else if (device.status === "Missing") {
    console.log(`WARNING: ${device.serial} is missing from ${device.event}`);
  } else {
    console.log(`${device.serial} is currently at ${device.event}`);
  }
}


// ============ Part 3: A function (a reusable counter) ============

function countByStatus(status) {
  let count = 0;

  for (const device of devices) {
    if (device.status === status) {
      count++;
    }
  }

  return count;
}

console.log("In Office:", countByStatus("In Office"));
console.log("Assigned:", countByStatus("Assigned"));
console.log("Missing:", countByStatus("Missing"));


// ============ Part 4: Show the numbers on the page ============

document.getElementById("total-count").textContent = devices.length;
document.getElementById("office-count").textContent = countByStatus("In Office");
document.getElementById("assigned-count").textContent = countByStatus("Assigned");
document.getElementById("missing-count").textContent = countByStatus("Missing");