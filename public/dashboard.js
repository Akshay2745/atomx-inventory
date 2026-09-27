// ============ Data (loaded from the server) ============

let devices = [];
let events = [];

const AVATAR_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];


// ============ Load everything the dashboard needs ============

async function loadDashboard() {
  try {
    const [devicesResponse, eventsResponse] = await Promise.all([
      fetch("/api/devices"),
      fetch("/api/events")
    ]);

    if (!devicesResponse.ok || !eventsResponse.ok) {
      throw new Error("Could not load dashboard data");
    }

    devices = await devicesResponse.json();
    events = await eventsResponse.json();

    renderCards();
    renderRecentEvents();
    renderAttention();
    renderDeviceTypes();
    renderMissing();
  } catch (error) {
    console.error(error);
    document.getElementById("dashboard-error").classList.remove("hidden");
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

function countDevices(status) {
  let count = 0;
  for (const device of devices) {
    if (device.status === status) {
      count++;
    }
  }
  return count;
}

function countEvents(status) {
  let count = 0;
  for (const event of events) {
    if (event.status === status) {
      count++;
    }
  }
  return count;
}

function getEventStatusClass(status) {
  if (status === "Requested") return "status-requested";
  if (status === "Assigned") return "status-assigned";
  if (status === "Out at Event") return "status-out";
  return "status-closed";
}

function getInitials(name) {
  const words = String(name || "").trim().split(/\s+/);
  const first = words[0] ? words[0][0] : "";
  const second = words[1] ? words[1][0] : "";
  return (first + second).toUpperCase() || "?";
}

function getColorForName(name) {
  let total = 0;
  for (const character of String(name || "")) {
    total += character.charCodeAt(0);
  }
  return AVATAR_COLORS[total % AVATAR_COLORS.length];
}

function formatShortDate(dateText) {
  if (!dateText) return "—";
  const date = new Date(dateText + "T00:00:00");
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function getEventLink(event) {
  const base = `event-detail.html?id=${encodeURIComponent(event.id)}`;
  if (event.status === "Requested" || event.status === "Out at Event") {
    return `${base}&tab=inventory`;
  }
  return base;
}


// ============ Greeting ============

async function showGreeting() {
  const hour = new Date().getHours();
  let greeting = "Good evening";

  if (hour < 12) {
    greeting = "Good morning";
  } else if (hour < 17) {
    greeting = "Good afternoon";
  }

  let name = "there";
  try {
    const response = await fetch("/api/me");
    if (response.ok) {
      const user = await response.json();
      name = user.name;
    }
  } catch (error) {
    console.warn("Could not load the signed-in user", error);
  }

  document.getElementById("greeting").textContent = `${greeting}, ${name} 👋`;

  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
  document.getElementById("today-text").textContent = `Here's what's happening across your inventory today, ${today}.`;
}

// ============ Stat cards ============

function renderCards() {
  document.getElementById("total-count").textContent = devices.length;
  document.getElementById("office-count").textContent = countDevices("In Office");
  document.getElementById("assigned-count").textContent = countDevices("Assigned");
  document.getElementById("requests-count").textContent = countEvents("Requested");
}


// ============ Recent events table ============

function renderRecentEvents() {
  const tableBody = document.getElementById("recent-events");
  document.getElementById("event-count").textContent = events.length;

  const sorted = events.slice();
  sorted.sort(function (a, b) {
    return (b.startDate || "").localeCompare(a.startDate || "");
  });

  tableBody.innerHTML = "";

  if (sorted.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="3">No events yet. Click "+ Create Event" to add one.</td></tr>`;
    return;
  }

  for (const event of sorted.slice(0, 6)) {
    tableBody.innerHTML += `
      <tr>
        <td>
          <div class="event-cell">
            <span class="event-avatar" style="background-color: ${getColorForName(event.name)}">${escapeHTML(getInitials(event.name))}</span>
            <div>
              <a href="${getEventLink(event)}">${escapeHTML(event.name)}</a>
              <small>${escapeHTML(event.location)}</small>
            </div>
          </div>
        </td>
        <td>${formatShortDate(event.startDate)}</td>
        <td class="text-right"><span class="status ${getEventStatusClass(event.status)}">${escapeHTML(event.status)}</span></td>
      </tr>
    `;
  }
}


// ============ Needs your attention ============

function renderAttention() {
  const list = document.getElementById("attention-list");
  list.innerHTML = "";

  for (const event of events) {
    if (event.status === "Requested") {
      list.innerHTML += `
        <li>
          <div class="list-main">
            <strong>${escapeHTML(event.name)}</strong>
            <small>New request from ${escapeHTML(event.requestedBy)}</small>
          </div>
          <a href="event-detail.html?id=${encodeURIComponent(event.id)}" class="btn-small primary">Review</a>
        </li>
      `;
    } else if (event.status === "Out at Event") {
      list.innerHTML += `
        <li>
          <div class="list-main">
            <strong>${escapeHTML(event.name)}</strong>
            <small>Return check pending</small>
          </div>
                    <a href="event-detail.html?id=${encodeURIComponent(event.id)}&tab=inventory" class="btn-small">Check Return</a>
      `;
    }
  }

  if (list.innerHTML === "") {
    list.innerHTML = `<li class="empty-note">All caught up. Nothing needs your attention right now.</li>`;
  }
}


// ============ Devices by type ============

function renderDeviceTypes() {
  const container = document.getElementById("type-list");
  const groups = {};

  for (const device of devices) {
    if (!groups[device.name]) {
      groups[device.name] = { total: 0, office: 0, assigned: 0, missing: 0 };
    }

    const group = groups[device.name];
    group.total++;

    if (device.status === "In Office") {
      group.office++;
    } else if (device.status === "Assigned") {
      group.assigned++;
    } else {
      group.missing++;
    }
  }

  container.innerHTML = "";

  if (devices.length === 0) {
    container.innerHTML = `<p class="empty-note">No devices in the inventory yet.</p>`;
    return;
  }

  for (const name in groups) {
    const group = groups[name];

    container.innerHTML += `
      <div class="type-row">
        <div class="type-row-header">
          <strong>${escapeHTML(name)}</strong>
          <span>${group.office} of ${group.total} free</span>
        </div>
        <div class="bar">
          <div class="bar-office" style="width: ${(group.office / group.total) * 100}%"></div>
          <div class="bar-assigned" style="width: ${(group.assigned / group.total) * 100}%"></div>
          <div class="bar-missing" style="width: ${(group.missing / group.total) * 100}%"></div>
        </div>
      </div>
    `;
  }
}


// ============ Missing or damaged devices ============

function renderMissing() {
  const list = document.getElementById("missing-list");
  list.innerHTML = "";

  for (const device of devices) {
    if (device.status === "Missing" || device.status === "Damaged") {
      const statusClass = device.status === "Missing" ? "status-missing" : "status-damaged";

      list.innerHTML += `
        <li>
          <div class="list-main">
            <strong>${escapeHTML(device.serial)}</strong>
            <small>${escapeHTML(device.name)} · ${escapeHTML(device.event || "No event recorded")}</small>
          </div>
          <span class="status ${statusClass}">${escapeHTML(device.status)}</span>
        </li>
      `;
    }
  }

  if (list.innerHTML === "") {
    list.innerHTML = `<li class="empty-note">Everything is accounted for.</li>`;
  }
}


// ============ Copy the staff request link ============

const copyLinkButton = document.getElementById("copy-link-btn");

copyLinkButton.addEventListener("click", async function () {
  const link = `${window.location.origin}/request.html`;

  try {
    await navigator.clipboard.writeText(link);
    copyLinkButton.textContent = "Link copied!";
  } catch (error) {
    window.prompt("Copy this link and share it with your staff:", link);
  }

  setTimeout(function () {
    copyLinkButton.textContent = "Copy staff request link";
  }, 2000);
});


// ============ Start ============

showGreeting();
loadDashboard();