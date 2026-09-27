// ============ Data (loaded from the server) ============

let devices = [];
let events = [];


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
    renderAttention();
    renderUpcoming();
    renderDeviceTypes();
    renderMissing();
  } catch (error) {
    console.error(error);
    document.getElementById("dashboard-error").classList.remove("hidden");
  }
}


// ============ Helper functions ============

function countDevices(status) {
  let count = 0;
  for (const device of devices) {
    if (device.status === status) {
      count++;
    }
  }
  return count;
}

function getTodayString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getEventStatusClass(status) {
  if (status === "Requested") return "status-requested";
  if (status === "Assigned") return "status-assigned";
  if (status === "Out at Event") return "status-out";
  return "status-closed";
}

function showTodayDate() {
  const today = new Date();
  document.getElementById("today-date").textContent = today.toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric"
  });
}


// ============ Summary cards ============

function renderCards() {
  document.getElementById("total-count").textContent = devices.length;
  document.getElementById("office-count").textContent = countDevices("In Office");
  document.getElementById("assigned-count").textContent = countDevices("Assigned");
  document.getElementById("missing-count").textContent = countDevices("Missing") + countDevices("Damaged");
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
            <strong>${event.name}</strong>
            <small>New request from ${event.requestedBy}</small>
          </div>
          <a href="event-detail.html" class="btn-small primary">Review</a>
        </li>
      `;
    } else if (event.status === "Out at Event") {
      list.innerHTML += `
        <li>
          <div class="list-main">
            <strong>${event.name}</strong>
            <small>Devices out, return check pending</small>
          </div>
          <a href="return-check.html" class="btn-small">Check Return</a>
        </li>
      `;
    }
  }

  if (list.innerHTML === "") {
    list.innerHTML = `<li class="empty-note">All caught up. Nothing needs your attention right now.</li>`;
  }
}


// ============ Upcoming events ============

function renderUpcoming() {
  const list = document.getElementById("upcoming-list");
  const today = getTodayString();
  const upcoming = [];

  for (const event of events) {
    if (event.status !== "Closed" && event.startDate >= today) {
      upcoming.push(event);
    }
  }

  upcoming.sort(function (a, b) {
    return a.startDate.localeCompare(b.startDate);
  });

  list.innerHTML = "";

  if (upcoming.length === 0) {
    list.innerHTML = `<li class="empty-note">No upcoming events.</li>`;
    return;
  }

  for (const event of upcoming.slice(0, 5)) {
    list.innerHTML += `
      <li>
        <div class="list-main">
          <strong>${event.name}</strong>
          <small>${event.dates} · ${event.location}</small>
        </div>
        <span class="status ${getEventStatusClass(event.status)}">${event.status}</span>
      </li>
    `;
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
    const officePercent = (group.office / group.total) * 100;
    const assignedPercent = (group.assigned / group.total) * 100;
    const missingPercent = (group.missing / group.total) * 100;

    container.innerHTML += `
      <div class="type-row">
        <div class="type-row-header">
          <strong>${name}</strong>
          <span>${group.office} of ${group.total} in office</span>
        </div>
        <div class="bar">
          <div class="bar-office" style="width: ${officePercent}%"></div>
          <div class="bar-assigned" style="width: ${assignedPercent}%"></div>
          <div class="bar-missing" style="width: ${missingPercent}%"></div>
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
            <strong>${device.serial}</strong>
            <small>${device.name} · ${device.event || "No event recorded"}</small>
          </div>
          <span class="status ${statusClass}">${device.status}</span>
        </li>
      `;
    }
  }

  if (list.innerHTML === "") {
    list.innerHTML = `<li class="empty-note">No missing or damaged devices. Everything is accounted for.</li>`;
  }
}


// ============ Start ============

showTodayDate();
loadDashboard();