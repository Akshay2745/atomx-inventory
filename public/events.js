// ============ Events data (loaded from the server) ============

let events = [];
let currentFilter = "All";

const tableBody = document.getElementById("events-table-body");


// ============ Load events from the server ============

async function loadEvents() {
  tableBody.innerHTML = `<tr><td colspan="7">Loading events...</td></tr>`;

  try {
    const response = await fetch("/api/events");

    if (!response.ok) {
      throw new Error(`Could not load events (status ${response.status})`);
    }

    events = await response.json();

    renderSummary();
    renderTable();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="7">Sorry, the events could not be loaded. Please refresh the page or try again later.</td></tr>`;
  }
}


// ============ Helper functions ============

function countByStatus(status) {
  let count = 0;
  for (const event of events) {
    if (event.status === status) {
      count++;
    }
  }
  return count;
}

function getStatusClass(status) {
  if (status === "Requested") return "status-requested";
  if (status === "Assigned") return "status-assigned";
  if (status === "Out at Event") return "status-out";
  return "status-closed";
}

function getActionButton(event) {
  const detailLink = `event-detail.html?id=${encodeURIComponent(event.id)}`;

  if (event.status === "Requested") {
    return `<a href="${detailLink}" class="btn-small primary">Review</a>`;
  }
  if (event.status === "Out at Event") {
    return `<a href="return-check.html" class="btn-small">Check Return</a>`;
  }
  return `<a href="${detailLink}" class="btn-small">View</a>`;
}

function getMissingNote(event) {
  if (event.missing > 0) {
    return `<span class="missing-note">${event.missing} item missing</span>`;
  }
  return "";
}

function getVisibleEvents() {
  if (currentFilter === "All") {
    return events;
  }

  const results = [];
  for (const event of events) {
    if (event.status === currentFilter) {
      results.push(event);
    }
  }
  return results;
}


// ============ Show the summary cards ============

function renderSummary() {
  document.getElementById("requested-count").textContent = countByStatus("Requested");
  document.getElementById("assigned-count").textContent = countByStatus("Assigned");
  document.getElementById("out-count").textContent = countByStatus("Out at Event");
  document.getElementById("closed-count").textContent = countByStatus("Closed");
}


// ============ Build the events table ============

function renderTable() {
  const visibleEvents = getVisibleEvents();
  tableBody.innerHTML = "";

  if (visibleEvents.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7">No events with this status.</td></tr>`;
    return;
  }

  for (const event of visibleEvents) {
    tableBody.innerHTML += `
      <tr>
        <td>${event.name}</td>
        <td>${event.dates}</td>
        <td>${event.location}</td>
        <td>${event.requestedBy}</td>
        <td>${event.items}</td>
        <td>
          <span class="status ${getStatusClass(event.status)}">${event.status}</span>
          ${getMissingNote(event)}
        </td>
        <td>${getActionButton(event)}</td>
      </tr>
    `;
  }
}


// ============ Filter tabs ============

const tabs = document.querySelectorAll(".tab");

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


// ============ Start ============

loadEvents();