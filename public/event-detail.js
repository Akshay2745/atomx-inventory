// ============ Which event? (read it from the address) ============

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

const RETURN_LABELS = { returned: "Returned", damaged: "Damaged", lost: "Lost" };
const TABS = ["overview", "inventory", "report"];

let currentEvent = null;
let devices = [];
let settings = { deviceTypes: [], categories: [], quantityItems: [] };
let selectedSerials = new Set();
let returnChoices = {};
let returnNotes = {};


// ============ Page elements ============

const pageMessage = document.getElementById("page-message");
const pageContent = document.getElementById("page-content");
const tabButtons = document.querySelectorAll(".workspace-tab");

const dispatchButton = document.getElementById("dispatch-btn");
const closeButton = document.getElementById("close-btn");
const actionMessage = document.getElementById("action-message");

const typeSelect = document.getElementById("type-select");
const assignSearch = document.getElementById("assign-search");
const availableList = document.getElementById("available-list");
const availableCount = document.getElementById("available-count");
const selectedCount = document.getElementById("selected-count");
const selectAllButton = document.getElementById("select-all-btn");
const assignButton = document.getElementById("assign-btn");
const assignError = document.getElementById("assign-error");
const assignSuccess = document.getElementById("assign-success");

const returnSearch = document.getElementById("return-search");
const returnList = document.getElementById("return-list");
const pendingCount = document.getElementById("pending-count");
const returnSelectedCount = document.getElementById("return-selected-count");
const allReturnedButton = document.getElementById("all-returned-btn");
const saveReturnsButton = document.getElementById("save-returns-btn");
const returnError = document.getElementById("return-error");
const returnSuccess = document.getElementById("return-success");

const reportBody = document.getElementById("report-body");


// ============ Load the event, devices and settings ============

async function loadPage() {
  if (!eventId) {
    showMessage("No event selected. Please open an event from the Events page.");
    return;
  }

  try {
    const [eventResponse, devicesResponse, settingsResponse] = await Promise.all([
      fetch(`/api/events/${encodeURIComponent(eventId)}`),
      fetch("/api/devices"),
      fetch("/api/settings")
    ]);

    if (eventResponse.status === 404) {
      showMessage("This event could not be found. It may have been removed.");
      return;
    }

    if (!eventResponse.ok || !devicesResponse.ok || !settingsResponse.ok) {
      throw new Error("Could not load the event data");
    }

    currentEvent = await eventResponse.json();
    devices = await devicesResponse.json();
    settings = await settingsResponse.json();

    fillTypeSelect();
    renderAll();

    pageMessage.classList.add("hidden");
    pageContent.classList.remove("hidden");
    showTab(params.get("tab") || "overview");
  } catch (error) {
    console.error(error);
    showMessage("Sorry, this event could not be loaded. Please check that the server is running and refresh the page.");
  }
}

async function reloadDevices() {
  const response = await fetch("/api/devices");
  if (response.ok) {
    devices = await response.json();
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

function setText(id, value) {
  document.getElementById(id).textContent = value || "—";
}

function setNumber(id, value) {
  document.getElementById(id).textContent = value;
}

function formatDate(isoText) {
  if (!isoText) return "—";
  return new Date(isoText).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function formatDateTime(isoText) {
  if (!isoText) return "—";
  return new Date(isoText).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function getStatusClass(status) {
  const classes = {
    "Requested": "status-requested",
    "Assigned": "status-assigned",
    "Out at Event": "status-out",
    "Closed": "status-closed",
    "In Office": "status-office",
    "Returned": "status-returned",
    "Damaged": "status-damaged",
    "Lost": "status-lost",
    "Pending": "status-pending"
  };
  return classes[status] || "status-closed";
}

function isClosed() {
  return currentEvent.status === "Closed";
}

function getStats() {
  const stats = { assigned: 0, returned: 0, damaged: 0, lost: 0, pending: 0 };

  for (const assignment of currentEvent.assignments) {
    stats.assigned++;
    if (assignment.returnStatus === "Returned") stats.returned++;
    else if (assignment.returnStatus === "Damaged") stats.damaged++;
    else if (assignment.returnStatus === "Lost") stats.lost++;
    else stats.pending++;
  }
  return stats;
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


// ============ Tabs ============

function showTab(name) {
  if (!TABS.includes(name)) {
    name = "overview";
  }

  for (const button of tabButtons) {
    button.classList.toggle("active", button.dataset.tab === name);
  }
  for (const tab of TABS) {
    document.getElementById(`tab-${tab}`).classList.toggle("hidden", tab !== name);
  }

  const newParams = new URLSearchParams(window.location.search);
  newParams.set("tab", name);
  history.replaceState(null, "", `${window.location.pathname}?${newParams.toString()}`);
}

for (const button of tabButtons) {
  button.addEventListener("click", function () {
    showTab(button.dataset.tab);
  });
}


// ============ Draw everything ============

function renderAll() {
  renderHeader();
  renderOverview();
  renderAssign();
  renderReturns();
  renderReport();
  renderEmail();
}

function renderHeader() {
  document.title = `InventoryX - ${currentEvent.name}`;
  setText("event-name", currentEvent.name);

  const badge = document.getElementById("event-status");
  badge.textContent = currentEvent.status;
  badge.className = `status ${getStatusClass(currentEvent.status)}`;

  document.getElementById("event-meta").textContent =
    `${currentEvent.dates || ""} · ${currentEvent.location || ""} · Requested by ${currentEvent.requestedBy || "—"}`;
}


// ============ Overview tab ============

function renderOverview() {
  const stats = getStats();
  let requestedTotal = 0;
  for (const item of currentEvent.itemsList) {
    requestedTotal += item.qty;
  }

  setNumber("stat-requested", requestedTotal);
  setNumber("stat-assigned", stats.assigned);
  setNumber("stat-returned", stats.returned);
  setNumber("stat-pending", stats.pending);
  setNumber("stat-lost", stats.lost + stats.damaged);

  dispatchButton.classList.toggle("hidden", currentEvent.status !== "Assigned");
  closeButton.classList.toggle("hidden", isClosed());

  setText("event-dates", currentEvent.dates);
  setText("event-location", currentEvent.location);
  setText("event-created", currentEvent.createdAt ? formatDate(currentEvent.createdAt) : "");
  setText("event-source", currentEvent.source);
  setText("event-notes", currentEvent.notes);
  setText("req-name", currentEvent.requestedBy);
  setText("req-email", currentEvent.requesterEmail);
  setText("req-phone", currentEvent.requesterPhone);
  setText("req-cc", currentEvent.ccEmails);

  const list = document.getElementById("requested-list");
  list.innerHTML = "";

  if (currentEvent.itemsList.length === 0) {
    list.innerHTML = `<li class="empty-note">No items were listed for this event.</li>`;
    return;
  }

  for (const item of currentEvent.itemsList) {
    let badge;

    if (settings.quantityItems.includes(item.name)) {
      badge = `<span class="status status-closed">Not tracked by serial</span>`;
    } else {
      let assignedCount = 0;
      for (const assignment of currentEvent.assignments) {
        if (assignment.name === item.name) {
          assignedCount++;
        }
      }
      const statusClass = assignedCount >= item.qty ? "status-returned" : "status-pending";
      badge = `<span class="status ${statusClass}">${assignedCount} of ${item.qty} assigned</span>`;
    }

    list.innerHTML += `
      <li>
        <div class="list-main">
          <strong>${escapeHTML(item.name)}</strong>
          <small>Requested: ${item.qty}</small>
        </div>
        ${badge}
      </li>
    `;
  }
}

async function changeStatus(newStatus, confirmText) {
  if (!window.confirm(confirmText)) {
    return;
  }

  actionMessage.textContent = "";
  actionMessage.className = "action-message";

  try {
    const response = await postJson(`/api/events/${encodeURIComponent(eventId)}/status`, { status: newStatus });

    if (!response.ok) {
      actionMessage.textContent = response.result.error || `Could not update the event (server status ${response.status}).`;
      actionMessage.className = "action-message error";
      return;
    }

    currentEvent = response.result;
    renderAll();
    actionMessage.textContent = `Event is now ${currentEvent.status}.`;
    actionMessage.className = "action-message success";
  } catch (error) {
    console.error(error);
    actionMessage.textContent = "Could not reach the server. Please try again.";
    actionMessage.className = "action-message error";
  }
}

dispatchButton.addEventListener("click", function () {
  changeStatus("Out at Event", "Mark this event as dispatched? This means the devices have left the office.");
});

closeButton.addEventListener("click", function () {
  changeStatus("Closed", "Close this event? After closing, devices can no longer be assigned or returned for it.");
});


// ============ Inventory tab: assign devices ============

function fillTypeSelect() {
  const requestedNames = [];
  let html = "";

  const requestedTypes = [];
  for (const item of currentEvent.itemsList) {
    if (settings.deviceTypes.includes(item.name)) {
      requestedTypes.push(item);
      requestedNames.push(item.name);
    }
  }

  if (requestedTypes.length > 0) {
    html += `<optgroup label="Requested for this event">`;
    for (const item of requestedTypes) {
      html += `<option value="${escapeHTML(item.name)}">${escapeHTML(item.name)} (requested ${item.qty})</option>`;
    }
    html += `</optgroup>`;
  }

  const otherTypes = [];
  for (const typeName of settings.deviceTypes) {
    if (!requestedNames.includes(typeName)) {
      otherTypes.push(typeName);
    }
  }

  if (otherTypes.length > 0) {
    html += `<optgroup label="${requestedTypes.length > 0 ? "Other device types" : "Device types"}">`;
    for (const typeName of otherTypes) {
      html += `<option value="${escapeHTML(typeName)}">${escapeHTML(typeName)}</option>`;
    }
    html += `</optgroup>`;
  }

  typeSelect.innerHTML = html;
}

function getAvailableDevices() {
  const typeName = typeSelect.value;
  const searchText = assignSearch.value.trim().toLowerCase();
  const results = [];

  for (const device of devices) {
    if (device.name === typeName && device.status === "In Office" && device.serial.toLowerCase().includes(searchText)) {
      results.push(device);
    }
  }
  return results;
}

function updateSelectedCount() {
  const count = selectedSerials.size;
  selectedCount.textContent = `${count} selected`;
  assignButton.disabled = count === 0;
  assignButton.textContent = count > 0 ? `Assign ${count} device(s)` : "Assign selected";
}

function renderAssign() {
  const closed = isClosed();
  document.getElementById("assign-section").classList.toggle("hidden", closed);
  document.getElementById("return-section").classList.toggle("hidden", closed);
  document.getElementById("closed-note").classList.toggle("hidden", !closed);

  if (closed) {
    return;
  }

  const typeName = typeSelect.value;

  if (!typeName) {
    availableCount.textContent = "";
    availableList.innerHTML = `<p class="empty-note">No device types yet. Add one on the Master Inventory page.</p>`;
    updateSelectedCount();
    return;
  }

  const available = getAvailableDevices();
  const searching = assignSearch.value.trim() !== "";
  availableCount.textContent = `${available.length} ${typeName} available in the office${searching ? " matching your search" : ""}`;

  if (available.length === 0) {
    availableList.innerHTML = `<p class="empty-note">No ${escapeHTML(typeName)} available${searching ? " matching your search" : " in the office right now"}.</p>`;
  } else {
    let html = "";
    for (const device of available) {
      const checked = selectedSerials.has(device.serial) ? "checked" : "";
      html += `
        <label class="device-option">
          <input type="checkbox" class="device-checkbox" value="${escapeHTML(device.serial)}" ${checked}> ${escapeHTML(device.serial)}
        </label>
      `;
    }
    availableList.innerHTML = html;
  }

  updateSelectedCount();
}

availableList.addEventListener("change", function (event) {
  const checkbox = event.target;
  if (!checkbox.classList.contains("device-checkbox")) return;

  if (checkbox.checked) {
    selectedSerials.add(checkbox.value);
  } else {
    selectedSerials.delete(checkbox.value);
  }
  updateSelectedCount();
});

typeSelect.addEventListener("change", renderAssign);
assignSearch.addEventListener("input", renderAssign);

selectAllButton.addEventListener("click", function () {
  for (const device of getAvailableDevices()) {
    selectedSerials.add(device.serial);
  }
  renderAssign();
});

assignButton.addEventListener("click", async function () {
  assignError.textContent = "";
  assignSuccess.textContent = "";

  const serials = Array.from(selectedSerials);
  if (serials.length === 0) return;

  assignButton.disabled = true;
  assignButton.textContent = "Assigning...";

  try {
    const response = await postJson(`/api/events/${encodeURIComponent(eventId)}/assign`, { serials: serials });

    if (!response.ok) {
      assignError.textContent = response.result.error || `Could not assign (server status ${response.status}).`;
      return;
    }

    currentEvent = response.result;
    selectedSerials.clear();
    await reloadDevices();
    renderAll();
    assignSuccess.textContent = `Assigned ${serials.length} device(s) to this event.`;
  } catch (error) {
    console.error(error);
    assignError.textContent = "Could not reach the server. Please check your connection and try again.";
  } finally {
    updateSelectedCount();
  }
});


// ============ Inventory tab: return devices ============

function getPendingAssignments(useSearch) {
  const searchText = useSearch ? returnSearch.value.trim().toLowerCase() : "";
  const results = [];

  for (const assignment of currentEvent.assignments) {
    if (!assignment.returnStatus && assignment.serial.toLowerCase().includes(searchText)) {
      results.push(assignment);
    }
  }
  return results;
}

function updateReturnCount() {
  const count = Object.keys(returnChoices).length;
  returnSelectedCount.textContent = `${count} marked`;
  saveReturnsButton.disabled = count === 0;
}

function renderReturns() {
  if (isClosed()) {
    return;
  }

  const allPending = getPendingAssignments(false);
  const shown = getPendingAssignments(true);
  const searching = returnSearch.value.trim() !== "";

  pendingCount.textContent = allPending.length > 0
    ? `${allPending.length} device(s) waiting to be checked in${searching ? `, ${shown.length} shown` : ""}`
    : "";

  if (currentEvent.assignments.length === 0) {
    returnList.innerHTML = `<p class="empty-note">No devices have been assigned to this event yet.</p>`;
  } else if (allPending.length === 0) {
    returnList.innerHTML = `<p class="empty-note">All assigned devices have been checked in. See the Report tab for details.</p>`;
  } else if (shown.length === 0) {
    returnList.innerHTML = `<p class="empty-note">No assigned devices match your search.</p>`;
  } else {
    let html = "";

    for (const assignment of shown) {
      const serial = escapeHTML(assignment.serial);
      const choice = returnChoices[assignment.serial];
      const note = escapeHTML(returnNotes[assignment.serial] || "");

      html += `
        <div class="return-row">
          <div class="device-info">
            <strong>${serial}</strong>
            <small>${escapeHTML(assignment.name)} · assigned ${formatDate(assignment.assignedAt)}</small>
          </div>
          <div class="return-options">
            <label><input type="radio" name="ret-${serial}" value="returned" data-serial="${serial}" ${choice === "returned" ? "checked" : ""}> Returned</label>
            <label><input type="radio" name="ret-${serial}" value="damaged" data-serial="${serial}" ${choice === "damaged" ? "checked" : ""}> Damaged</label>
            <label><input type="radio" name="ret-${serial}" value="lost" data-serial="${serial}" ${choice === "lost" ? "checked" : ""}> Lost</label>
          </div>
          <input type="text" class="note-input" data-serial="${serial}" value="${note}" maxlength="300" placeholder="Note (optional), e.g. screen cracked or lost at venue">
        </div>
      `;
    }
    returnList.innerHTML = html;
  }

  updateReturnCount();
}

returnList.addEventListener("change", function (event) {
  const input = event.target;
  if (input.type === "radio") {
    returnChoices[input.dataset.serial] = input.value;
    updateReturnCount();
  }
});

returnList.addEventListener("input", function (event) {
  const input = event.target;
  if (input.classList.contains("note-input")) {
    returnNotes[input.dataset.serial] = input.value;
  }
});

returnSearch.addEventListener("input", renderReturns);

allReturnedButton.addEventListener("click", function () {
  for (const assignment of getPendingAssignments(true)) {
    if (!returnChoices[assignment.serial]) {
      returnChoices[assignment.serial] = "returned";
    }
  }
  renderReturns();
});

saveReturnsButton.addEventListener("click", async function () {
  returnError.textContent = "";
  returnSuccess.textContent = "";

  const returns = [];
  let lostCount = 0;

  for (const serial in returnChoices) {
    const value = returnChoices[serial];
    returns.push({ serial: serial, status: RETURN_LABELS[value], note: returnNotes[serial] || "" });
    if (value === "lost") {
      lostCount++;
    }
  }

  if (returns.length === 0) {
    returnError.textContent = "Choose Returned, Damaged or Lost for at least one device.";
    return;
  }

  if (lostCount > 0 && !window.confirm(`${lostCount} device(s) will be marked as Lost and removed from available stock. Continue?`)) {
    return;
  }

  saveReturnsButton.disabled = true;
  saveReturnsButton.textContent = "Saving...";

  try {
    const response = await postJson(`/api/events/${encodeURIComponent(eventId)}/return`, { returns: returns });

    if (!response.ok) {
      returnError.textContent = response.result.error || `Could not save the returns (server status ${response.status}).`;
      return;
    }

    currentEvent = response.result;
    returnChoices = {};
    returnNotes = {};
    await reloadDevices();
    renderAll();
    returnSuccess.textContent = `Checked in ${returns.length} device(s).`;
  } catch (error) {
    console.error(error);
    returnError.textContent = "Could not reach the server. Please check your connection and try again.";
  } finally {
    saveReturnsButton.textContent = "Save returns";
    updateReturnCount();
  }
});


// ============ Report tab ============

function renderReport() {
  const stats = getStats();

  document.getElementById("report-subtitle").textContent =
    `${currentEvent.name} · ${currentEvent.dates || ""} · ${currentEvent.location || ""} · Requested by ${currentEvent.requestedBy || "—"} · Status: ${currentEvent.status}`;

  document.getElementById("report-stats").innerHTML = `
    <div class="mini-stat"><strong>${stats.assigned}</strong><span>Assigned</span></div>
    <div class="mini-stat"><strong>${stats.returned}</strong><span>Returned</span></div>
    <div class="mini-stat"><strong>${stats.damaged}</strong><span>Damaged</span></div>
    <div class="mini-stat"><strong>${stats.lost}</strong><span>Lost</span></div>
    <div class="mini-stat"><strong>${stats.pending}</strong><span>Not yet returned</span></div>
  `;

  reportBody.innerHTML = "";

  if (currentEvent.assignments.length === 0) {
    reportBody.innerHTML = `<tr><td colspan="7">No devices have been assigned to this event yet.</td></tr>`;
    return;
  }

  let rowNumber = 0;

  for (const assignment of currentEvent.assignments) {
    rowNumber++;
    const returnStatus = assignment.returnStatus || "Pending";

    reportBody.innerHTML += `
      <tr>
        <td class="row-number">${rowNumber}</td>
        <td><a href="device-detail.html?serial=${encodeURIComponent(assignment.serial)}" class="event-link"><strong>${escapeHTML(assignment.serial)}</strong></a></td>
        <td>${escapeHTML(assignment.name)}</td>
        <td>${formatDateTime(assignment.assignedAt)}</td>
        <td><span class="status ${getStatusClass(returnStatus)}">${escapeHTML(returnStatus)}</span></td>
        <td>${formatDateTime(assignment.returnedAt)}</td>
        <td>${escapeHTML(assignment.note || "—")}</td>
      </tr>
    `;
  }
}

function csvCell(value) {
  const text = String(value === null || value === undefined ? "" : value);
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

document.getElementById("download-csv-btn").addEventListener("click", function () {
  const rows = [
    ["Event", currentEvent.name],
    ["Dates", currentEvent.dates],
    ["Location", currentEvent.location],
    ["Requested by", currentEvent.requestedBy],
    ["Status", currentEvent.status],
    ["Report generated", formatDateTime(new Date().toISOString())],
    [],
    ["#", "Serial Number", "Type", "Assigned On", "Return Status", "Checked In On", "Note"]
  ];

  let rowNumber = 0;
  for (const assignment of currentEvent.assignments) {
    rowNumber++;
    rows.push([
      rowNumber,
      assignment.serial,
      assignment.name,
      formatDateTime(assignment.assignedAt),
      assignment.returnStatus || "Pending",
      formatDateTime(assignment.returnedAt),
      assignment.note || ""
    ]);
  }

  const lines = [];
  for (const row of rows) {
    const cells = [];
    for (const cell of row) {
      cells.push(csvCell(cell));
    }
    lines.push(cells.join(","));
  }

  const csvText = "\uFEFF" + lines.join("\r\n");
  const blob = new Blob([csvText], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const safeName = currentEvent.name.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase() || "event";

  link.href = url;
  link.download = `${safeName}-assignment-report.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
});

document.getElementById("print-btn").addEventListener("click", function () {
  window.print();
});


// ============ Email confirmation ============

const emailCcInput = document.getElementById("email-cc");
const sendEmailButton = document.getElementById("send-email-btn");
const emailError = document.getElementById("email-error");
const emailSuccess = document.getElementById("email-success");
const emailLog = document.getElementById("email-log");

function renderEmail() {
  const toText = document.getElementById("email-to");

  if (currentEvent.requesterEmail) {
    toText.textContent = `To: ${currentEvent.requestedBy} (${currentEvent.requesterEmail})`;
  } else {
    toText.textContent = "This event has no requester email address.";
  }

  if (document.activeElement !== emailCcInput) {
    emailCcInput.value = currentEvent.ccEmails || "";
  }

  sendEmailButton.disabled = currentEvent.assignments.length === 0 || !currentEvent.requesterEmail;

  const emails = Array.isArray(currentEvent.emails) ? currentEvent.emails : [];
  emailLog.innerHTML = "";

  if (emails.length === 0) {
    emailLog.innerHTML = `<li class="empty-note">${currentEvent.assignments.length === 0 ? "Assign devices first, then send the confirmation." : "No confirmation sent yet."}</li>`;
    return;
  }

  for (let i = emails.length - 1; i >= 0; i--) {
    const email = emails[i];
    emailLog.innerHTML += `
      <li>
        <div class="list-main">
          <strong>${escapeHTML(email.type)} (${email.devices} devices)</strong>
          <small>To ${escapeHTML(email.to)}${email.cc ? `, CC ${escapeHTML(email.cc)}` : ""} · ${formatDateTime(email.sentAt)}${email.by ? ` · by ${escapeHTML(email.by)}` : ""}</small>
        </div>
        <span class="status status-returned">Sent</span>
      </li>
    `;
  }
}

sendEmailButton.addEventListener("click", async function () {
  emailError.textContent = "";
  emailSuccess.textContent = "";

  const deviceCount = currentEvent.assignments.length;
  if (!window.confirm(`Send the confirmation with ${deviceCount} device(s) to ${currentEvent.requesterEmail}?`)) {
    return;
  }

  sendEmailButton.disabled = true;
  sendEmailButton.textContent = "Sending...";

  try {
    const response = await postJson(`/api/events/${encodeURIComponent(eventId)}/email/confirmation`, {
      cc: emailCcInput.value
    });

    if (!response.ok) {
      emailError.textContent = response.result.error || `Could not send the email (server status ${response.status}).`;
      return;
    }

    currentEvent = response.result.event;
    renderAll();

    if (response.result.previewUrl) {
      emailSuccess.innerHTML = `Test email created. <a href="${response.result.previewUrl}" target="_blank" rel="noopener" class="event-link">Open the preview →</a>`;
    } else {
      emailSuccess.textContent = "Confirmation email sent.";
    }
  } catch (error) {
    console.error(error);
    emailError.textContent = "Could not reach the server. Please try again.";
  } finally {
    sendEmailButton.textContent = "Send assignment confirmation";
    renderEmail();
  }
});

// ============ Start ============

loadPage();