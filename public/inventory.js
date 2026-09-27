// ============ Your inventory data (loaded from the server) ============

let devices = [];


// ============ Page elements ============

const tableBody = document.getElementById("device-table-body");
const searchInput = document.getElementById("search-input");
const addButton = document.getElementById("add-device-btn");
const addPanel = document.getElementById("add-device-panel");
const addForm = document.getElementById("add-device-form");
const cancelButton = document.getElementById("cancel-add-btn");
const errorText = document.getElementById("form-error");
const saveButton = addForm.querySelector('button[type="submit"]');


// ============ Load devices from the server ============

async function loadDevices() {
  tableBody.innerHTML = `<tr><td colspan="5">Loading devices...</td></tr>`;

  try {
    const response = await fetch("/api/devices");

    if (!response.ok) {
      throw new Error(`Could not load devices (status ${response.status})`);
    }

    devices = await response.json();

    renderSummary();
    renderTable();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="5">Sorry, the device list could not be loaded. Please refresh the page or try again later.</td></tr>`;
  }
}


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

function serialExists(serial) {
  for (const device of devices) {
    if (device.serial === serial) {
      return true;
    }
  }
  return false;
}

function matchesSearch(device, searchText) {
  const serial = device.serial.toLowerCase();
  const name = device.name.toLowerCase();
  const event = (device.event || "").toLowerCase();

  return serial.includes(searchText) || name.includes(searchText) || event.includes(searchText);
}

function getVisibleDevices() {
  const searchText = searchInput.value.trim().toLowerCase();

  if (searchText === "") {
    return devices;
  }

  const results = [];
  for (const device of devices) {
    if (matchesSearch(device, searchText)) {
      results.push(device);
    }
  }
  return results;
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
  const visibleDevices = getVisibleDevices();
  tableBody.innerHTML = "";

  if (devices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No devices yet. Click "+ Add Device" to add one.</td></tr>`;
    return;
  }

  if (visibleDevices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No devices match your search.</td></tr>`;
    return;
  }

  for (const device of visibleDevices) {
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


// ============ Search box ============

searchInput.addEventListener("input", function () {
  renderTable();
});


// ============ Add device form ============

function closeAddForm() {
  addForm.reset();
  errorText.textContent = "";
  addPanel.classList.add("hidden");
}

addButton.addEventListener("click", function () {
  addPanel.classList.remove("hidden");
  document.getElementById("new-serial").focus();
});

cancelButton.addEventListener("click", function () {
  closeAddForm();
});

addForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  errorText.textContent = "";

  const serial = document.getElementById("new-serial").value.trim().toUpperCase();
  const name = document.getElementById("new-name").value;
  const category = document.getElementById("new-category").value;

  if (serialExists(serial)) {
    errorText.textContent = `Serial number ${serial} already exists in the inventory.`;
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    const response = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial: serial, name: name, category: category })
    });

    const result = await response.json();

    if (!response.ok) {
      errorText.textContent = result.error || "Could not save the device.";
      return;
    }

    devices.push(result);
    renderSummary();
    renderTable();
    closeAddForm();
  } catch (error) {
    console.error(error);
    errorText.textContent = "Could not reach the server. Please check your connection and try again.";
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save device";
  }
});


// ============ Start ============

loadDevices();