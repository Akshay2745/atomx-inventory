// ============ Your inventory data ============

const devices = [
  { serial: "POS-0001", name: "POS Terminal", category: "Payment Device", status: "In Office", event: null },
  { serial: "POS-0002", name: "POS Terminal", category: "Payment Device", status: "Assigned",  event: "Mumbai Fintech Expo" },
  { serial: "POS-0003", name: "POS Terminal", category: "Payment Device", status: "In Office", event: null },
  { serial: "POS-0004", name: "POS Terminal", category: "Payment Device", status: "In Office", event: null },
  { serial: "SBX-0001", name: "Soundbox",     category: "Payment Device", status: "Assigned",  event: "Pune Retail Fair" },
  { serial: "SBX-0002", name: "Soundbox",     category: "Payment Device", status: "Missing",   event: "Delhi Startup Summit" },
  { serial: "QR-0001",  name: "QR Standee",   category: "Display Item",   status: "In Office", event: null }
];


// ============ Helper functions ============

function countByStatus(status) {
  let count = 0;
  for (const device of devices) {
    if (device.status === status) {
      count++;
    }
  }
  return count;
}

function getStatusClass(status) {
  if (status === "In Office") return "status-office";
  if (status === "Assigned") return "status-assigned";
  if (status === "Missing") return "status-missing";
  if (status === "Damaged") return "status-damaged";
  return "status-closed";
}


// ============ Show the summary cards ============

function renderSummary() {
  document.getElementById("total-count").textContent = devices.length;
  document.getElementById("office-count").textContent = countByStatus("In Office");
  document.getElementById("assigned-count").textContent = countByStatus("Assigned");
  document.getElementById("missing-count").textContent = countByStatus("Missing");
}


// ============ Build the device table ============

function renderTable() {
  const tableBody = document.getElementById("device-table-body");
  tableBody.innerHTML = "";

  if (devices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No devices yet. Click "+ Add Device" to add one.</td></tr>`;
    return;
  }

  for (const device of devices) {
    tableBody.innerHTML += `
      <tr>
        <td>${device.serial}</td>
        <td>${device.name}</td>
        <td>${device.category}</td>
        <td><span class="status ${getStatusClass(device.status)}">${device.status}</span></td>
        <td>${device.event || "—"}</td>
      </tr>
    `;
  }
}


// ============ Start ============

renderSummary();
renderTable();