// ============ Your events data ============

const events = [
  { name: "Bengaluru Merchant Meetup", dates: "12 – 13 Oct 2026",   location: "Bengaluru", requestedBy: "Priya Sharma",  items: "4 POS Terminal, 2 Soundbox",              status: "Requested",    missing: 0 },
  { name: "Hyderabad Payments Forum",  dates: "20 – 22 Oct 2026",   location: "Hyderabad", requestedBy: "Rohit Verma",   items: "3 Card Reader, 5 Paper Roll",             status: "Requested",    missing: 0 },
  { name: "Chennai Trade Show",        dates: "8 – 9 Oct 2026",     location: "Chennai",   requestedBy: "Sneha Iyer",    items: "2 POS Terminal, 1 QR Standee",            status: "Assigned",     missing: 0 },
  { name: "Mumbai Fintech Expo",       dates: "28 Sep – 1 Oct 2026", location: "Mumbai",   requestedBy: "Amit Patil",    items: "3 POS Terminal, 2 Charger, 5 Paper Roll", status: "Out at Event", missing: 0 },
  { name: "Pune Retail Fair",          dates: "25 – 27 Sep 2026",   location: "Pune",      requestedBy: "Neha Kulkarni", items: "1 Soundbox",                              status: "Out at Event", missing: 0 },
  { name: "Delhi Startup Summit",      dates: "15 – 16 Sep 2026",   location: "New Delhi", requestedBy: "Karan Mehta",   items: "1 Soundbox",                              status: "Closed",       missing: 1 }
];


// ============ Current filter ============

let currentFilter = "All";


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
  if (event.status === "Requested") {
    return `<a href="event-detail.html" class="btn-small primary">Review</a>`;
  }
  if (event.status === "Out at Event") {
    return `<a href="return-check.html" class="btn-small">Check Return</a>`;
  }
  return `<a href="#" class="btn-small">View</a>`;
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
  const tableBody = document.getElementById("events-table-body");
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

renderSummary();
renderTable();