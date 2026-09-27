// ============ Which device type? (read it from the address) ============

const params = new URLSearchParams(window.location.search);
const typeName = params.get("type");

const BOX_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;

const MAX_DEVICES_AT_ONCE = 500;
const MAX_IMPORT_ROWS = 1000;

let allDevices = [];
let typeDevices = [];
let settings = { deviceTypes: [], categories: [], quantityItems: [] };
let currentFilter = "All";
let successTimer = null;


// ============ Page elements ============

const pageMessage = document.getElementById("page-message");
const pageContent = document.getElementById("page-content");
const pageSuccess = document.getElementById("page-success");
const tableBody = document.getElementById("device-table-body");
const searchInput = document.getElementById("search-input");
const resultsCount = document.getElementById("results-count");
const tabs = document.querySelectorAll(".tab");

const addButton = document.getElementById("add-device-btn");
const addPanel = document.getElementById("add-device-panel");
const addForm = document.getElementById("add-device-form");
const serialInput = document.getElementById("new-serial");
const categorySelect = document.getElementById("new-category");
const quantityInput = document.getElementById("new-quantity");
const serialPreview = document.getElementById("serial-preview");
const formError = document.getElementById("form-error");
const saveButton = document.getElementById("save-device-btn");
const cancelButton = document.getElementById("cancel-add-btn");

const importButton = document.getElementById("import-btn");
const importPanel = document.getElementById("import-panel");
const downloadSampleButton = document.getElementById("download-sample-btn");
const csvFileInput = document.getElementById("csv-file");
const importResults = document.getElementById("import-results");
const startImportButton = document.getElementById("start-import-btn");
const cancelImportButton = document.getElementById("cancel-import-btn");


// ============ Load devices and settings ============

async function loadPage() {
  if (!typeName) {
    showMessage("No device type selected. Please choose one from the Master Inventory page.");
    return;
  }

  try {
    const [devicesResponse, settingsResponse] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/settings")
    ]);

    if (!devicesResponse.ok || !settingsResponse.ok) {
      throw new Error("Could not load the device data");
    }

    allDevices = await devicesResponse.json();
    settings = await settingsResponse.json();

    refreshTypeDevices();
    setUpForms();
    renderEverything();

    pageMessage.classList.add("hidden");
    pageContent.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showMessage("Sorry, the devices could not be loaded. Please check that the server is running and refresh the page.");
  }
}


// ============ Helper functions ============

function escapeHTML(value) {
  return String(value === null || value === undefined ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function showMessage(text) {
  pageMessage.textContent = text;
  pageMessage.classList.remove("hidden");
  pageContent.classList.add("hidden");
}

function showSuccess(text) {
  pageSuccess.textContent = text;
  clearTimeout(successTimer);
  successTimer = setTimeout(function () {
    pageSuccess.textContent = "";
  }, 6000);
}

function refreshTypeDevices() {
  typeDevices = [];
  for (const device of allDevices) {
    if (device.name === typeName) {
      typeDevices.push(device);
    }
  }
}

function countByStatus(status) {
  let count = 0;
  for (const device of typeDevices) {
    if (device.status === status) {
      count++;
    }
  }
  return count;
}

function serialExists(serial) {
  for (const device of allDevices) {
    if (device.serial === serial) {
      return true;
    }
  }
  return false;
}

function getStatusClass(status) {
  if (status === "In Office") return "status-office";
  if (status === "Assigned") return "status-assigned";
  if (status === "Lost") return "status-lost";
  if (status === "Damaged") return "status-damaged";
  return "status-closed";
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

function getSerialPrefix() {
  for (const device of typeDevices) {
    const match = device.serial.match(/^(.*?)(\d+)$/);
    if (match && match[1] !== "") {
      return match[1];
    }
  }
  const letters = typeName.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() || "DEV";
  return `${letters}-`;
}

function getDefaultCategory() {
  const counts = {};
  let best = "";
  let bestCount = 0;

  for (const device of typeDevices) {
    counts[device.category] = (counts[device.category] || 0) + 1;
    if (counts[device.category] > bestCount) {
      best = device.category;
      bestCount = counts[device.category];
    }
  }
  return best;
}

function getEventCell(device) {
  if (!device.event) {
    return "—";
  }

  const prefix = device.status === "Lost" || device.status === "Damaged" ? `${device.status} at ` : "";

  if (device.eventId) {
    return `${prefix}<a href="event-detail.html?id=${encodeURIComponent(device.eventId)}" class="event-link">${escapeHTML(device.event)}</a>`;
  }
  return prefix + escapeHTML(device.event);
}

function getVisibleDevices() {
  const searchText = searchInput.value.trim().toLowerCase();
  const results = [];

  for (const device of typeDevices) {
    const matchesFilter = currentFilter === "All" || device.status === currentFilter;
    const serial = device.serial.toLowerCase();
    const event = (device.event || "").toLowerCase();
    const matchesSearch = searchText === "" || serial.includes(searchText) || event.includes(searchText);

    if (matchesFilter && matchesSearch) {
      results.push(device);
    }
  }
  return results;
}

async function postJson(url, data) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  const result = await response.json().catch(function () { return {}; });
  return { ok: response.ok, status: response.status, result: result };
}


// ============ Fill in the page ============

function renderEverything() {
  renderHeader();
  renderSummary();
  renderTabCounts();
  renderTable();
}

function renderHeader() {
  document.title = `InventoryX - ${typeName}`;
  document.getElementById("type-name").textContent = typeName;
  document.getElementById("type-icon").innerHTML = BOX_ICON;
}

function renderSummary() {
  document.getElementById("total-count").textContent = typeDevices.length;
  document.getElementById("office-count").textContent = countByStatus("In Office");
  document.getElementById("assigned-count").textContent = countByStatus("Assigned");
  document.getElementById("missing-count").textContent = countByStatus("Lost") + countByStatus("Damaged");
}

function renderTabCounts() {
  for (const tab of tabs) {
    const status = tab.dataset.status;
    const count = status === "All" ? typeDevices.length : countByStatus(status);
    tab.textContent = `${status} (${count})`;
  }
}

function renderTable() {
  const visibleDevices = getVisibleDevices();
  tableBody.innerHTML = "";

  resultsCount.textContent = `Showing ${visibleDevices.length} of ${typeDevices.length} devices`;

  if (typeDevices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No ${escapeHTML(typeName)} devices yet. Click "+ Add Devices" or "Import CSV" to add some.</td></tr>`;
    return;
  }

  if (visibleDevices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No devices match your search.</td></tr>`;
    return;
  }

  let rowNumber = 0;

  for (const device of visibleDevices) {
    rowNumber++;

    tableBody.innerHTML += `
      <tr>
        <td class="row-number">${rowNumber}</td>
        <td><a href="device-detail.html?serial=${encodeURIComponent(device.serial)}" class="event-link"><strong>${escapeHTML(device.serial)}</strong></a></td>
        <td>${escapeHTML(device.category)}</td>
        <td><span class="status ${getStatusClass(device.status)}">${escapeHTML(device.status)}</span></td>
        <td>${getEventCell(device)}</td>
      </tr>
    `;
  }
}


// ============ Set up the add and import panels for this type ============

function setUpForms() {
  document.getElementById("add-title").textContent = `Add ${typeName} devices`;
  document.getElementById("import-title").textContent = `Import ${typeName} devices from a CSV file`;
  serialInput.placeholder = `e.g. ${getSerialPrefix()}0001`;

  let html = `<option value="">Select category</option>`;
  for (const category of settings.categories) {
    html += `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`;
  }
  categorySelect.innerHTML = html;
  categorySelect.value = getDefaultCategory();
}

function openPanel(panel) {
  addPanel.classList.add("hidden");
  importPanel.classList.add("hidden");
  panel.classList.remove("hidden");
}

function addNewDevices(newDevices) {
  for (const device of newDevices) {
    allDevices.push(device);
  }
  refreshTypeDevices();
  renderEverything();
}


// ============ Manual add (one or many in sequence) ============

function closeAddForm() {
  addForm.reset();
  formError.textContent = "";
  serialPreview.textContent = "";
  categorySelect.value = getDefaultCategory();
  addPanel.classList.add("hidden");
}

function updateSerialPreview() {
  const serial = serialInput.value.trim().toUpperCase();
  const quantity = Number(quantityInput.value);

  if (serial === "" || !Number.isInteger(quantity) || quantity <= 1) {
    serialPreview.textContent = "";
    return;
  }

  const serials = generateSerials(serial, quantity);

  if (!serials) {
    serialPreview.textContent = "To add more than one device, the serial number must end with a number, like MSW-0010.";
    return;
  }

  serialPreview.textContent = `This will add ${quantity} ${typeName} devices: ${serials[0]} to ${serials[serials.length - 1]}`;
}

serialInput.addEventListener("input", updateSerialPreview);
quantityInput.addEventListener("input", updateSerialPreview);

addButton.addEventListener("click", function () {
  openPanel(addPanel);
  serialInput.focus();
});

cancelButton.addEventListener("click", function () {
  closeAddForm();
});

addForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  formError.textContent = "";

  const serial = serialInput.value.trim().toUpperCase();
  const category = categorySelect.value;
  const quantity = Number(quantityInput.value);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_DEVICES_AT_ONCE) {
    formError.textContent = `Quantity must be a whole number between 1 and ${MAX_DEVICES_AT_ONCE}.`;
    return;
  }

  const serials = quantity === 1 ? [serial] : generateSerials(serial, quantity);

  if (!serials) {
    formError.textContent = "To add more than one device, the serial number must end with a number, like MSW-0010.";
    return;
  }

  const duplicates = [];
  for (const newSerial of serials) {
    if (serialExists(newSerial)) {
      duplicates.push(newSerial);
    }
  }

  if (duplicates.length > 0) {
    const extra = duplicates.length > 5 ? " and more" : "";
    formError.textContent = `Already in the inventory: ${duplicates.slice(0, 5).join(", ")}${extra}.`;
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    const response = await postJson("/api/devices", {
      serial: serial,
      name: typeName,
      category: category,
      quantity: quantity
    });

    if (!response.ok) {
      formError.textContent = response.result.error || `Could not save (server status ${response.status}).`;
      return;
    }

    const added = response.result.added;
    addNewDevices(added);
    closeAddForm();

    if (added.length === 1) {
      showSuccess(`Added ${added[0].serial}.`);
    } else {
      showSuccess(`Added ${added.length} devices: ${added[0].serial} to ${added[added.length - 1].serial}.`);
    }
  } catch (error) {
    console.error(error);
    formError.textContent = "Could not reach the server. Please check your connection and try again.";
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save";
  }
});


// ============ CSV import for this type ============

function closeImportPanel() {
  csvFileInput.value = "";
  importResults.classList.add("hidden");
  importPanel.classList.add("hidden");
}

function showImportResult(type, message, details) {
  let html = `<strong>${escapeHTML(message)}</strong>`;

  if (details && details.length > 0) {
    html += "<ul>";
    for (const detail of details) {
      html += `<li>${escapeHTML(detail)}</li>`;
    }
    html += "</ul>";
  }

  importResults.innerHTML = html;
  importResults.className = `import-results ${type}`;
}

function splitCsvLine(line) {
  const cells = [];
  for (const cell of line.split(",")) {
    cells.push(cell.trim().replace(/^"(.*)"$/, "$1").trim());
  }
  return cells;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  const headers = [];

  for (const cell of splitCsvLine(lines[0] || "")) {
    headers.push(cell.toLowerCase());
  }

  const serialIndex = headers.indexOf("serial");
  const typeIndex = headers.indexOf("type");
  const categoryIndex = headers.indexOf("category");

  if (serialIndex === -1 || categoryIndex === -1) {
    return { error: "The first row must contain the column names serial and category. Download the sample file to see the format." };
  }

  const rows = [];
  const wrongType = [];

  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;

    const cells = splitCsvLine(lines[i]);
    const rowType = typeIndex === -1 ? "" : (cells[typeIndex] || "");

    if (rowType !== "" && rowType.toLowerCase() !== typeName.toLowerCase()) {
      wrongType.push(`Row ${i + 1}: says "${rowType}", but this page is for ${typeName}.`);
      continue;
    }

    rows.push({
      line: i + 1,
      serial: cells[serialIndex] || "",
      type: typeName,
      category: cells[categoryIndex] || ""
    });
  }

  if (wrongType.length > 0) {
    return {
      error: "Some rows are for a different device type. Import those from that type's page, or from the Master Inventory page.",
      details: wrongType.slice(0, 50)
    };
  }

  return { rows: rows };
}

importButton.addEventListener("click", function () {
  openPanel(importPanel);
});

cancelImportButton.addEventListener("click", function () {
  closeImportPanel();
});

downloadSampleButton.addEventListener("click", function () {
  const prefix = getSerialPrefix();
  const category = getDefaultCategory() || settings.categories[0] || "Payment Device";

  const csvText = [
    "serial,type,category",
    `${prefix}1001,${typeName},${category}`,
    `${prefix}1002,${typeName},${category}`,
    `${prefix}1003,${typeName},${category}`
  ].join("\r\n");

  const blob = new Blob(["\uFEFF" + csvText], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = typeName.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "devices";

  link.href = url;
  link.download = `${safeName}-import-sample.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

startImportButton.addEventListener("click", async function () {
  const file = csvFileInput.files[0];

  if (!file) {
    showImportResult("error", "Please choose a CSV file first.");
    return;
  }

  if (file.size > 1024 * 1024) {
    showImportResult("error", "The file is too large. Please keep it under 1 MB.");
    return;
  }

  const text = await file.text();
  const parsed = parseCsv(text);

  if (parsed.error) {
    showImportResult("error", parsed.error, parsed.details);
    return;
  }

  if (parsed.rows.length === 0) {
    showImportResult("error", "No devices were found in the file.");
    return;
  }

  if (parsed.rows.length > MAX_IMPORT_ROWS) {
    showImportResult("error", `You can import up to ${MAX_IMPORT_ROWS} devices at a time. Please split the file.`);
    return;
  }

  if (!window.confirm(`Import ${parsed.rows.length} ${typeName} devices from "${file.name}"?`)) {
    return;
  }

  startImportButton.disabled = true;
  startImportButton.textContent = "Importing...";

  try {
    const response = await postJson("/api/devices/bulk", { devices: parsed.rows });

    if (!response.ok) {
      showImportResult("error", response.result.error || `Import failed (server status ${response.status}).`, response.result.details);
      return;
    }

    addNewDevices(response.result.added);
    csvFileInput.value = "";
    showImportResult("success", `Imported ${response.result.added.length} ${typeName} devices successfully.`);
  } catch (error) {
    console.error(error);
    showImportResult("error", "Could not reach the server. Please check your connection and try again.");
  } finally {
    startImportButton.disabled = false;
    startImportButton.textContent = "Import devices";
  }
});


// ============ Tabs and search ============

for (const tab of tabs) {
  tab.addEventListener("click", function () {
    currentFilter = tab.dataset.status;

    for (const otherTab of tabs) {
      otherTab.classList.remove("active");
    }
    tab.classList.add("active");

    renderTable();
  });
}

searchInput.addEventListener("input", function () {
  renderTable();
});


// ============ Start ============

loadPage();