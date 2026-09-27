// ============ Which device type? (read it from the address) ============

const params = new URLSearchParams(window.location.search);
const typeName = params.get("type");

const BOX_ICON = `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`;

let typeDevices = [];
let currentFilter = "All";


// ============ Page elements ============

const pageMessage = document.getElementById("page-message");
const pageContent = document.getElementById("page-content");
const tableBody = document.getElementById("device-table-body");
const searchInput = document.getElementById("search-input");
const resultsCount = document.getElementById("results-count");
const tabs = document.querySelectorAll(".tab");


// ============ Load the devices of this type ============

async function loadPage() {
  if (!typeName) {
    showMessage("No device type selected. Please choose one from the Master Inventory page.");
    return;
  }

  try {
    const response = await fetch("/api/devices");

    if (!response.ok) {
      throw new Error(`Could not load devices (status ${response.status})`);
    }

    const allDevices = await response.json();

    typeDevices = [];
    for (const device of allDevices) {
      if (device.name === typeName) {
        typeDevices.push(device);
      }
    }

    renderHeader();
    renderSummary();
    renderTabCounts();
    renderTable();

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

function countByStatus(status) {
  let count = 0;
  for (const device of typeDevices) {
    if (device.status === status) {
      count++;
    }
  }
  return count;
}

function getStatusClass(status) {
  if (status === "In Office") return "status-office";
  if (status === "Assigned") return "status-assigned";
  if (status === "Lost") return "status-lost";
  if (status === "Damaged") return "status-damaged";
  return "status-closed";
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


// ============ Fill in the page ============

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
    tableBody.innerHTML = `<tr><td colspan="5">No ${escapeHTML(typeName)} devices in the inventory yet.</td></tr>`;
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