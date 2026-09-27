// ============ Data (loaded from the server) ============

let settings = { categories: [], types: [] };
let devices = [];

const BOX_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;


// ============ Page elements ============

const tableBody = document.getElementById("type-table-body");
const addCard = document.getElementById("add-type-card");
const noCategoryNote = document.getElementById("no-category-note");
const addForm = document.getElementById("add-type-form");
const nameInput = document.getElementById("new-type-name");
const categorySelect = document.getElementById("new-type-category");
const categoryFilter = document.getElementById("category-filter");
const createButton = document.getElementById("create-type-btn");
const errorText = document.getElementById("type-error");
const successText = document.getElementById("type-success");


// ============ Load settings and devices ============

async function loadPage() {
  try {
    const [settingsResponse, devicesResponse] = await Promise.all([
      fetch("/api/settings"),
      fetch("/api/devices")
    ]);

    if (!settingsResponse.ok || !devicesResponse.ok) {
      throw new Error("Could not load the data");
    }

    settings = await settingsResponse.json();
    devices = await devicesResponse.json();
    renderAll();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="5">Sorry, the device types could not be loaded. Please refresh the page.</td></tr>`;
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

async function sendRequest(url, method, data) {
  const options = { method: method, headers: { "Content-Type": "application/json" } };
  if (data) {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);
  const result = await response.json().catch(function () { return {}; });
  return { ok: response.ok, status: response.status, result: result };
}

function countDevices(typeName) {
  let count = 0;
  for (const device of devices) {
    if (device.name === typeName) {
      count++;
    }
  }
  return count;
}


// ============ Draw the page ============

function renderAll() {
  renderCategoryOptions();
  renderTable();
}

function renderCategoryOptions() {
  const hasCategories = settings.categories.length > 0;
  noCategoryNote.classList.toggle("hidden", hasCategories);
  addCard.classList.toggle("hidden", !hasCategories);

  const currentChoice = categorySelect.value;
  let html = `<option value="">Select category</option>`;
  for (const category of settings.categories) {
    html += `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`;
  }
  categorySelect.innerHTML = html;
  categorySelect.value = currentChoice;

  const currentFilter = categoryFilter.value;
  let filterHtml = `<option value="All">All categories</option>`;
  for (const category of settings.categories) {
    filterHtml += `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`;
  }
  categoryFilter.innerHTML = filterHtml;
  categoryFilter.value = settings.categories.includes(currentFilter) ? currentFilter : "All";
}

function renderTable() {
  tableBody.innerHTML = "";

  const filter = categoryFilter.value;
  const visibleTypes = [];
  for (const type of settings.types) {
    if (filter === "All" || type.category === filter) {
      visibleTypes.push(type);
    }
  }

  if (settings.types.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No device types yet.${settings.categories.length > 0 ? " Create your first one above." : ""}</td></tr>`;
    return;
  }

  if (visibleTypes.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No device types in this category yet.</td></tr>`;
    return;
  }

  let rowNumber = 0;

  for (const type of visibleTypes) {
    rowNumber++;
    const deviceCount = countDevices(type.name);
    const canDelete = deviceCount === 0;
    const deleteTitle = canDelete ? "Delete this device type" : "Devices use this type, so it can't be deleted";

    tableBody.innerHTML += `
      <tr>
        <td class="row-number">${rowNumber}</td>
        <td>
          <a href="type-detail.html?type=${encodeURIComponent(type.name)}" class="type-cell event-link">
            <span class="type-icon">${BOX_ICON}</span>
            <strong>${escapeHTML(type.name)}</strong>
          </a>
        </td>
        <td class="category-cell">${escapeHTML(type.category || "Uncategorized")}</td>
        <td>${deviceCount}</td>
        <td class="table-actions">
          <button type="button" class="btn-danger-small" data-type="${escapeHTML(type.name)}" title="${deleteTitle}" ${canDelete ? "" : "disabled"}>Delete</button>
        </td>
      </tr>
    `;
  }
}

categoryFilter.addEventListener("change", renderTable);


// ============ Create a device type ============

addForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  errorText.textContent = "";
  successText.textContent = "";

  const name = nameInput.value.trim();
  const category = categorySelect.value;

  if (name === "" || category === "") return;

  createButton.disabled = true;

  try {
    const response = await sendRequest("/api/settings/types", "POST", { name: name, category: category });

    if (!response.ok) {
      errorText.textContent = response.result.error || `Could not create the device type (server status ${response.status}).`;
      return;
    }

    settings = response.result;
    nameInput.value = "";
    renderAll();
    successText.innerHTML = `Created "${escapeHTML(name)}" in ${escapeHTML(category)}. <a href="type-detail.html?type=${encodeURIComponent(name)}" class="event-link">Add devices to it →</a>`;
  } catch (error) {
    console.error(error);
    errorText.textContent = "Could not reach the server. Please try again.";
  } finally {
    createButton.disabled = false;
  }
});


// ============ Delete a device type ============

tableBody.addEventListener("click", async function (event) {
  const button = event.target.closest(".btn-danger-small");
  if (!button || button.disabled) return;

  const typeName = button.dataset.type;
  if (!window.confirm(`Delete the device type "${typeName}"?`)) return;

  errorText.textContent = "";
  successText.textContent = "";

  try {
    const response = await sendRequest(`/api/settings/types/${encodeURIComponent(typeName)}`, "DELETE");

    if (!response.ok) {
      errorText.textContent = response.result.error || `Could not delete the device type (server status ${response.status}).`;
      return;
    }

    settings = response.result;
    renderAll();
    successText.textContent = `Deleted "${typeName}".`;
  } catch (error) {
    console.error(error);
    errorText.textContent = "Could not reach the server. Please try again.";
  }
});


// ============ Start ============

loadPage();