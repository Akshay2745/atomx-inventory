// ============ Data (loaded from the server) ============

let settings = { categories: [], types: [] };
let devices = [];


// ============ Page elements ============

const tableBody = document.getElementById("category-table-body");
const addForm = document.getElementById("add-category-form");
const nameInput = document.getElementById("new-category-name");
const createButton = document.getElementById("create-category-btn");
const errorText = document.getElementById("category-error");
const successText = document.getElementById("category-success");


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
    renderTable();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="5">Sorry, the categories could not be loaded. Please refresh the page.</td></tr>`;
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


// ============ Build the table ============

function renderTable() {
  tableBody.innerHTML = "";

  if (settings.categories.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="5">No categories yet. Create your first one above.</td></tr>`;
    return;
  }

  let rowNumber = 0;

  for (const category of settings.categories) {
    rowNumber++;

    let typeChips = "";
    let typeCount = 0;
    for (const type of settings.types) {
      if (type.category === category) {
        typeCount++;
        typeChips += `<a class="chip" href="type-detail.html?type=${encodeURIComponent(type.name)}">${escapeHTML(type.name)}</a> `;
      }
    }

    let deviceCount = 0;
    for (const device of devices) {
      if (device.category === category) {
        deviceCount++;
      }
    }

    const canDelete = typeCount === 0;
    const deleteTitle = canDelete ? "Delete this category" : "Delete its device types first";

    tableBody.innerHTML += `
      <tr>
        <td class="row-number">${rowNumber}</td>
        <td><strong>${escapeHTML(category)}</strong></td>
        <td>${typeChips || `<a href="device-types.html" class="event-link">+ Add a device type</a>`}</td>
        <td>${deviceCount}</td>
        <td class="table-actions">
          <button type="button" class="btn-danger-small" data-category="${escapeHTML(category)}" title="${deleteTitle}" ${canDelete ? "" : "disabled"}>Delete</button>
        </td>
      </tr>
    `;
  }
}


// ============ Create a category ============

addForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  errorText.textContent = "";
  successText.textContent = "";

  const name = nameInput.value.trim();
  if (name === "") return;

  createButton.disabled = true;

  try {
    const response = await sendRequest("/api/settings/categories", "POST", { name: name });

    if (!response.ok) {
      errorText.textContent = response.result.error || `Could not create the category (server status ${response.status}).`;
      return;
    }

    settings = response.result;
    nameInput.value = "";
    renderTable();
    successText.innerHTML = `Created "${escapeHTML(name)}". Next, <a href="device-types.html" class="event-link">create a device type</a> in it.`;
  } catch (error) {
    console.error(error);
    errorText.textContent = "Could not reach the server. Please try again.";
  } finally {
    createButton.disabled = false;
  }
});


// ============ Delete a category ============

tableBody.addEventListener("click", async function (event) {
  const button = event.target.closest(".btn-danger-small");
  if (!button || button.disabled) return;

  const category = button.dataset.category;
  if (!window.confirm(`Delete the category "${category}"?`)) return;

  errorText.textContent = "";
  successText.textContent = "";

  try {
    const response = await sendRequest(`/api/settings/categories/${encodeURIComponent(category)}`, "DELETE");

    if (!response.ok) {
      errorText.textContent = response.result.error || `Could not delete the category (server status ${response.status}).`;
      return;
    }

    settings = response.result;
    renderTable();
    successText.textContent = `Deleted "${category}".`;
  } catch (error) {
    console.error(error);
    errorText.textContent = "Could not reach the server. Please try again.";
  }
});


// ============ Start ============

loadPage();