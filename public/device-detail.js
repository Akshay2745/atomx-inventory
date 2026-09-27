// ============ Which device? (read it from the address) ============

const params = new URLSearchParams(window.location.search);
const serial = params.get("serial");

const pageMessage = document.getElementById("page-message");
const pageContent = document.getElementById("page-content");


// ============ Load the device ============

async function loadPage() {
  if (!serial) {
    showMessage("No device selected. Please choose one from the Master Inventory page.");
    return;
  }

  try {
    const response = await fetch(`/api/devices/${encodeURIComponent(serial)}`);

    if (response.status === 404) {
      showMessage("This device could not be found in the inventory.");
      return;
    }
    if (!response.ok) {
      throw new Error(`Could not load the device (status ${response.status})`);
    }

    const device = await response.json();
    render(device);

    pageMessage.classList.add("hidden");
    pageContent.classList.remove("hidden");
  } catch (error) {
    console.error(error);
    showMessage("Sorry, this device could not be loaded. Please check that the server is running and refresh the page.");
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

function formatDateTime(isoText) {
  if (!isoText) return "date not recorded";
  return new Date(isoText).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit"
  });
}

function getStatusClass(status) {
  if (status === "In Office") return "status-office";
  if (status === "Assigned") return "status-assigned";
  if (status === "Lost") return "status-lost";
  if (status === "Damaged") return "status-damaged";
  return "status-closed";
}

function eventLink(eventId, eventName) {
  if (!eventName) return "—";
  if (!eventId) return escapeHTML(eventName);
  return `<a href="event-detail.html?id=${encodeURIComponent(eventId)}&tab=report" class="event-link">${escapeHTML(eventName)}</a>`;
}

function describeAction(entry) {
  const link = eventLink(entry.eventId, entry.eventName);
  if (entry.action === "Assigned") return `Assigned to ${link}`;
  if (entry.action === "Returned") return `Returned from ${link}`;
  if (entry.action === "Damaged") return `Marked as damaged at ${link}`;
  if (entry.action === "Lost") return `Marked as lost at ${link}`;
  return `${escapeHTML(entry.action)} ${link}`;
}


// ============ Fill in the page ============

function render(device) {
  const history = Array.isArray(device.history) ? device.history : [];

  document.title = `InventoryX - ${device.serial}`;
  document.getElementById("device-serial").textContent = device.serial;

  const badge = document.getElementById("device-status");
  badge.textContent = device.status;
  badge.className = `status ${getStatusClass(device.status)}`;

  document.getElementById("device-meta").textContent = `${device.name} · ${device.category}`;

  const backLink = document.getElementById("back-link");
  backLink.href = `type-detail.html?type=${encodeURIComponent(device.name)}`;
  backLink.textContent = `← Back to ${device.name}`;

  document.getElementById("d-serial").textContent = device.serial;
  document.getElementById("d-type").textContent = device.name;
  document.getElementById("d-category").textContent = device.category;
  document.getElementById("d-status").innerHTML = `<span class="status ${getStatusClass(device.status)}">${escapeHTML(device.status)}</span>`;
  document.getElementById("d-event").innerHTML = eventLink(device.eventId, device.event);

  if (device.status === "Lost" || device.status === "Damaged") {
    let lastEntry = null;
    for (const entry of history) {
      if (entry.action === device.status) {
        lastEntry = entry;
      }
    }

    const alertBox = document.getElementById("lost-alert");
    const where = lastEntry ? eventLink(lastEntry.eventId, lastEntry.eventName) : eventLink(device.eventId, device.event);
    const when = lastEntry ? ` on ${formatDateTime(lastEntry.date)}` : "";
    const note = lastEntry && lastEntry.note ? `<br>Note: ${escapeHTML(lastEntry.note)}` : "";

    alertBox.innerHTML = `This device was marked as <strong>${escapeHTML(device.status)}</strong> at ${where}${when}.${note}`;
    alertBox.classList.remove("hidden");
  }

  const list = document.getElementById("history-list");
  list.innerHTML = "";

  if (history.length === 0) {
    list.innerHTML = `<li class="empty-note">No history recorded yet. From now on, every assignment and return of this device is recorded here.</li>`;
    return;
  }

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    list.innerHTML += `
      <li>
        <strong>${describeAction(entry)}</strong>
        <span class="timeline-date">${formatDateTime(entry.date)}</span>
        ${entry.note ? `<span class="timeline-note">${escapeHTML(entry.note)}</span>` : ""}
      </li>
    `;
  }
}


// ============ Start ============

loadPage();