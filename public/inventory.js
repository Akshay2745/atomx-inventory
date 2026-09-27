// ============ Data (loaded from the server) ============

let devices = [];
let settings = { deviceTypes: [], categories: [], quantityItems: [] };

const MAX_DEVICES_AT_ONCE = 500;
const MAX_IMPORT_ROWS = 1000;

const BOX_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;


// ============ Page elements ============

const tableBody = document.getElementById("type-table-body");
const searchInput = document.getElementById("search-input");

const addButton = document.getElementById("add-device-btn");
const addPanel = document.getElementById("add-device-panel");
const addForm = document.getElementById("add-device-form");
const serialInput = document.getElementById("new-serial");
const typeSelect = document.getElementById("new-name");
const categorySelect = document.getElementById("new-category");
const quantityInput = document.getElementById("new-quantity");
const serialPreview = document.getElementById("serial-preview");
const errorText = document.getElementById("form-error");
const saveButton = document.getElementById("save-device-btn");
const cancelButton = document.getElementById("cancel-add-btn");

const importButton = document.getElementById("import-btn");
const importPanel = document.getElementById("import-panel");
const downloadSampleButton = document.getElementById("download-sample-btn");
const csvFileInput = document.getElementById("csv-file");
const importResults = document.getElementById("import-results");
const startImportButton = document.getElementById("start-import-btn");
const cancelImportButton = document.getElementById("cancel-import-btn");

const manageTypesButton = document.getElementById("manage-types-btn");
const typesPanel = document.getElementById("types-panel");
const closeTypesButton = document.getElementById("close-types-btn");

const allPanels = [addPanel, importPanel, typesPanel];


// ============ Load devices and settings from the server ============

async function loadData() {
  tableBody.innerHTML = `<tr><td colspan="5">Loading inventory...</td></tr>`;

  try {
    const [devicesResponse, settingsResponse] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/settings")
    ]);

    if (!devicesResponse.ok || !settingsResponse.ok) {
      throw new Error("Could not load inventory data");
    }

    devices = await devicesResponse.json();
    settings = await settingsResponse.json();

    renderSettings();
    renderSummary();
    renderTypeTable();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="5">Sorry, the inventory could not be loaded. Please refresh the page or try again later.</td></tr>`;
  }
}


// ============ Helper functions ============

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function countByStatus(status) {
  let count = 0;
  for (const device of devices) {
    if (device.status === status) {
      count++;
    }
  }
  return count;
}

function serialExists(serial) {
  for (const device of devices) {
    if (device.serial === serial) {
      return true;
    }
  }
  return false;
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

function openPanel(panel) {
  for (const otherPanel of allPanels) {
    otherPanel.classList.add("hidden");
  }
  panel.classList.remove("hidden");
}


// ============ Group devices by type ============

function createTypeSummary(name) {
  return { name: name, total: 0, free: 0, assigned: 0, missing: 0, categories: [] };
}

function getTypeSummaries() {
  const summaries = [];
  const byName = {};

  for (const typeName of settings.deviceTypes) {
    const summary = createTypeSummary(typeName);
    byName[typeName] = summary;
    summaries.push(summary);
  }

  for (const device of devices) {
    let summary = byName[device.name];

    if (!summary) {
      summary = createTypeSummary(device.name);
      byName[device.name] = summary;
      summaries.push(summary);
    }

    summary.total++;

    if (device.status === "In Office") {
      summary.free++;
    } else if (device.status === "Assigned") {
      summary.assigned++;
    } else {
      summary.missing++;
    }

    if (!summary.categories.includes(device.category)) {
      summary.categories.push(device.category);
    }
  }

  return summaries;
}

function getVisibleTypes() {
  const searchText = searchInput.value.trim().toLowerCase();
  const summaries = getTypeSummaries();

  if (searchText === "") {
    return summaries;
  }

  const results = [];
  for (const summary of summaries) {
    const name = summary.name.toLowerCase();
    const categories = summary.categories.join(" ").toLowerCase();

    if (name.includes(searchText) || categories.includes(searchText)) {
      results.push(summary);
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


// ============ Build the device type table ============

function renderTypeTable() {
  const visibleTypes = getVisibleTypes();
  tableBody.innerHTML = "";

  if (settings.deviceTypes.length === 0 && devices.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No device types yet. Click "Manage types" to add one.</td></tr>`;
    return;
  }

  if (visibleTypes.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No device types match your search.</td></tr>`;
    return;
  }

  let rowNumber = 0;

  for (const summary of visibleTypes) {
    rowNumber++;

    const assignedPercent = summary.total > 0 ? (summary.assigned / summary.total) * 100 : 0;
    const categoriesText = summary.categories.length > 0 ? summary.categories.join(", ") : "—";
    const missingText = summary.missing > 0
      ? `<span class="usage-missing"> · ${summary.missing} missing or damaged</span>`
      : "";
    const trackLink = `type-detail.html?type=${encodeURIComponent(summary.name)}`;

    tableBody.innerHTML += `
      <tr>
        <td class="row-number">${rowNumber}</td>
        <td>
          <div class="type-cell">
            <span class="type-icon">${BOX_ICON}</span>
            <strong>${escapeHTML(summary.name)}</strong>
            <span class="type-badge">Serials</span>
          </div>
        </td>
        <td class="category-cell">${escapeHTML(categoriesText)}</td>
        <td>
          <div class="usage-cell">
            <strong>${summary.assigned} / ${summary.total} assigned</strong>
            <div class="usage-bar">
              <div class="usage-fill" style="width: ${assignedPercent}%"></div>
            </div>
            <span class="usage-free">${summary.free} free</span>${missingText}
          </div>
        </td>
        <td><a href="${trackLink}" class="btn-track">Track</a></td>
      </tr>
    `;
  }
}


// ============ Device types and categories ============

function fillSelect(select, options, placeholder) {
  const currentValue = select.value;
  let html = `<option value="">${placeholder}</option>`;

  for (const option of options) {
    html += `<option value="${escapeHTML(option)}">${escapeHTML(option)}</option>`;
  }

  select.innerHTML = html;
  select.value = currentValue;
}

function renderChips(containerId, items) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";

  for (const item of items) {
    container.innerHTML += `<span class="chip">${escapeHTML(item)}</span>`;
  }
}

function renderSettings() {
  fillSelect(typeSelect, settings.deviceTypes, "Select type");
  fillSelect(categorySelect, settings.categories, "Select category");
  renderChips("type-list", settings.deviceTypes);
  renderChips("category-list", settings.categories);
}

async function addSettingItem(url, input, errorElement) {
  errorElement.textContent = "";
  const name = input.value.trim();

  if (name === "") {
    return;
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name })
    });

    const result = await response.json().catch(function () { return {}; });

    if (!response.ok) {
      errorElement.textContent = result.error || `Could not add it (server status ${response.status}).`;
      return;
    }

    settings = result;
    renderSettings();
    renderTypeTable();
    input.value = "";
  } catch (error) {
    console.error(error);
    errorElement.textContent = "Could not reach the server. Please try again.";
  }
}

manageTypesButton.addEventListener("click", function () {
  openPanel(typesPanel);
});

closeTypesButton.addEventListener("click", function () {
  typesPanel.classList.add("hidden");
});

document.getElementById("add-type-form").addEventListener("submit", function (event) {
  event.preventDefault();
  addSettingItem("/api/settings/device-types", document.getElementById("new-type-name"), document.getElementById("type-error"));
});

document.getElementById("add-category-form").addEventListener("submit", function (event) {
  event.preventDefault();
  addSettingItem("/api/settings/categories", document.getElementById("new-category-name"), document.getElementById("category-error"));
});


// ============ Search box ============

searchInput.addEventListener("input", function () {
  renderTypeTable();
});


// ============ Add devices form (one or many) ============

function closeAddForm() {
  addForm.reset();
  errorText.textContent = "";
  serialPreview.textContent = "";
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
    serialPreview.textContent = "To add more than one device, the serial number must end with a number, like POS-0010.";
    return;
  }

  serialPreview.textContent = `This will add ${quantity} devices: ${serials[0]} to ${serials[serials.length - 1]}`;
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
  errorText.textContent = "";

  const serial = serialInput.value.trim().toUpperCase();
  const name = typeSelect.value;
  const category = categorySelect.value;
  const quantity = Number(quantityInput.value);

  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_DEVICES_AT_ONCE) {
    errorText.textContent = `Quantity must be a whole number between 1 and ${MAX_DEVICES_AT_ONCE}.`;
    return;
  }

  const serials = quantity === 1 ? [serial] : generateSerials(serial, quantity);

  if (!serials) {
    errorText.textContent = "To add more than one device, the serial number must end with a number, like POS-0010.";
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
    errorText.textContent = `Already in the inventory: ${duplicates.slice(0, 5).join(", ")}${extra}.`;
    return;
  }

  saveButton.disabled = true;
  saveButton.textContent = "Saving...";

  try {
    const response = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serial: serial, name: name, category: category, quantity: quantity })
    });

    const result = await response.json().catch(function () { return {}; });

    if (!response.ok) {
      errorText.textContent = result.error || `Could not save (server status ${response.status}).`;
      return;
    }

    for (const device of result.added) {
      devices.push(device);
    }

    renderSummary();
    renderTypeTable();
    closeAddForm();
  } catch (error) {
    console.error(error);
    errorText.textContent = "Could not reach the server. Please check your connection and try again.";
  } finally {
    saveButton.disabled = false;
    saveButton.textContent = "Save device";
  }
});


// ============ CSV import ============

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

  if (serialIndex === -1 || typeIndex === -1 || categoryIndex === -1) {
    return { error: "The first row must contain the column names: serial, type, category. Download the sample file to see the format." };
  }

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === "") continue;

    const cells = splitCsvLine(lines[i]);
    rows.push({
      line: i + 1,
      serial: cells[serialIndex] || "",
      type: cells[typeIndex] || "",
      category: cells[categoryIndex] || ""
    });
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
  const csvText = [
    "serial,type,category",
    "POS-1001,POS Terminal,Payment Device",
    "POS-1002,POS Terminal,Payment Device",
    "SBX-1001,Soundbox,Payment Device",
    "QR-1001,QR Standee,Display Item"
  ].join("\r\n");

  const blob = new Blob([csvText], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = "device-import-sample.csv";
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
    showImportResult("error", parsed.error);
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

  if (!window.confirm(`Import ${parsed.rows.length} devices from "${file.name}"?`)) {
    return;
  }

  startImportButton.disabled = true;
  startImportButton.textContent = "Importing...";

  try {
    const response = await fetch("/api/devices/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ devices: parsed.rows })
    });

    const result = await response.json().catch(function () { return {}; });

    if (!response.ok) {
      showImportResult("error", result.error || `Import failed (server status ${response.status}).`, result.details);
      return;
    }

    for (const device of result.added) {
      devices.push(device);
    }

    renderSummary();
    renderTypeTable();
    csvFileInput.value = "";
    showImportResult("success", `Imported ${result.added.length} devices successfully.`);
  } catch (error) {
    console.error(error);
    showImportResult("error", "Could not reach the server. Please check your connection and try again.");
  } finally {
    startImportButton.disabled = false;
    startImportButton.textContent = "Import devices";
  }
});


// ============ Start ============

loadData();