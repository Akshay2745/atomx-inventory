// ============ Data and page state ============

let events = [];
let currentFilter = "All";
let newestFirst = true;
let currentView = "grid";

const BANNER_COLORS = ["#6366f1", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#ef4444"];

try {
  currentView = localStorage.getItem("eventsView") || "grid";
} catch (error) {
  currentView = "grid";
}


// ============ Page elements ============

const eventGrid = document.getElementById("event-grid");
const eventList = document.getElementById("event-list");
const tableBody = document.getElementById("events-table-body");
const searchInput = document.getElementById("search-input");
const statusFilter = document.getElementById("status-filter");
const sortButton = document.getElementById("sort-btn");
const sortLabel = document.getElementById("sort-label");
const resultsCount = document.getElementById("results-count");
const viewButtons = document.querySelectorAll(".view-btn");


// ============ Load events from the server ============

async function loadEvents() {
  try {
    const response = await fetch("/api/events");

    if (!response.ok) {
      throw new Error(`Could not load events (status ${response.status})`);
    }

    events = await response.json();

    renderSummary();
    render();
  } catch (error) {
    console.error(error);
    eventGrid.innerHTML = `<p class="empty-state">Sorry, the events could not be loaded. Please refresh the page or try again later.</p>`;
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

function getInitials(name) {
  const words = String(name || "").trim().split(/\s+/);
  const first = words[0] ? words[0][0] : "";
  const second = words[1] ? words[1][0] : "";
  return (first + second).toUpperCase() || "?";
}

function getBannerColor(name) {
  let total = 0;
  for (const character of String(name || "")) {
    total += character.charCodeAt(0);
  }
  return BANNER_COLORS[total % BANNER_COLORS.length];
}

function getAction(event) {
  const base = `event-detail.html?id=${encodeURIComponent(event.id)}`;

  if (event.status === "Requested") {
    return { label: "Review & Assign", link: `${base}&tab=inventory` };
  }
  if (event.status === "Out at Event") {
    return { label: "Check Return", link: `${base}&tab=inventory` };
  }
  return { label: "View Details", link: base };
}

function getMissingNote(event) {
  if (event.missing > 0) {
    return `<span class="missing-note">${event.missing} item missing</span>`;
  }
  return "";
}

function getVisibleEvents() {
  const searchText = searchInput.value.trim().toLowerCase();
  const results = [];

  for (const event of events) {
    const matchesFilter = currentFilter === "All" || event.status === currentFilter;
    const searchable = `${event.name} ${event.location} ${event.requestedBy}`.toLowerCase();
    const matchesSearch = searchText === "" || searchable.includes(searchText);

    if (matchesFilter && matchesSearch) {
      results.push(event);
    }
  }

  results.sort(function (a, b) {
    const dateA = a.startDate || "";
    const dateB = b.startDate || "";
    return newestFirst ? dateB.localeCompare(dateA) : dateA.localeCompare(dateB);
  });

  return results;
}


// ============ Stat cards ============

function renderSummary() {
  document.getElementById("total-count").textContent = events.length;
  document.getElementById("requested-count").textContent = countByStatus("Requested");
  document.getElementById("assigned-count").textContent = countByStatus("Assigned");
  document.getElementById("out-count").textContent = countByStatus("Out at Event");
  document.getElementById("closed-count").textContent = countByStatus("Closed");
}


// ============ Grid view (cards) ============

function renderGrid(visibleEvents) {
  eventGrid.innerHTML = "";

  if (visibleEvents.length === 0) {
    eventGrid.innerHTML = `<p class="empty-state">No events match your search or filter.</p>`;
    return;
  }

  for (const event of visibleEvents) {
    const action = getAction(event);

    eventGrid.innerHTML += `
      <article class="event-card">
        <div class="event-banner" style="background-color: ${getBannerColor(event.name)}">
          ${escapeHTML(getInitials(event.name))}
          <span class="status ${getStatusClass(event.status)}">${escapeHTML(event.status)}</span>
        </div>
        <div class="event-card-body">
          <h3 class="event-card-title">${escapeHTML(event.name)}</h3>
          <p class="event-card-meta">${escapeHTML(event.location)} · ${escapeHTML(event.dates)}</p>
          <p class="event-card-items">${escapeHTML(event.items || "No items listed")}</p>
          ${getMissingNote(event)}
          <a href="${action.link}" class="event-card-button">${action.label}</a>
        </div>
      </article>
    `;
  }
}


// ============ List view (table) ============

function renderList(visibleEvents) {
  tableBody.innerHTML = "";

  if (visibleEvents.length === 0) {
    tableBody.innerHTML = `<tr><td colspan="7">No events match your search or filter.</td></tr>`;
    return;
  }

  for (const event of visibleEvents) {
    const action = getAction(event);
    const buttonClass = event.status === "Requested" ? "btn-small primary" : "btn-small";

    tableBody.innerHTML += `
      <tr>
        <td>${escapeHTML(event.name)}</td>
        <td>${escapeHTML(event.dates)}</td>
        <td>${escapeHTML(event.location)}</td>
        <td>${escapeHTML(event.requestedBy)}</td>
        <td>${escapeHTML(event.items || "—")}</td>
        <td>
          <span class="status ${getStatusClass(event.status)}">${escapeHTML(event.status)}</span>
          ${getMissingNote(event)}
        </td>
        <td><a href="${action.link}" class="${buttonClass}">${action.label}</a></td>
      </tr>
    `;
  }
}


// ============ Show the right view ============

function render() {
  const visibleEvents = getVisibleEvents();
  resultsCount.textContent = `Showing ${visibleEvents.length} of ${events.length} events`;

  if (currentView === "list") {
    eventGrid.classList.add("hidden");
    eventList.classList.remove("hidden");
    renderList(visibleEvents);
  } else {
    eventList.classList.add("hidden");
    eventGrid.classList.remove("hidden");
    renderGrid(visibleEvents);
  }

  for (const button of viewButtons) {
    button.classList.toggle("active", button.dataset.view === currentView);
  }
}


// ============ Toolbar controls ============

searchInput.addEventListener("input", function () {
  render();
});

statusFilter.addEventListener("change", function () {
  currentFilter = statusFilter.value;
  render();
});

sortButton.addEventListener("click", function () {
  newestFirst = !newestFirst;
  sortLabel.textContent = newestFirst ? "Newest first" : "Oldest first";
  render();
});

for (const button of viewButtons) {
  button.addEventListener("click", function () {
    currentView = button.dataset.view;

    try {
      localStorage.setItem("eventsView", currentView);
    } catch (error) {
      console.warn("Could not remember the view choice", error);
    }

    render();
  });
}


// ============ Start ============

render();
loadEvents();