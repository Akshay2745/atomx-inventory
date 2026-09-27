// ============ Settings ============

const QUANTITY_ITEMS = ["Charger", "Paper Roll"];

// ============ Which event? (read the id from the address) ============

const params = new URLSearchParams(window.location.search);
const eventId = params.get("id");

let currentEvent = null;
let devices = [];


// ============ Page elements ============

const pageMessage = document.getElementById("page-message");
const pageContent = document.getElementById("page-content");
const assignGroups = document.getElementById("assign-groups");
const assignError = document.getElementById("assign-error");
const confirmButton = document.getElementById("confirm-btn");


// ============ Load the event and the devices ============

async function loadPage() {
  if (!eventId) {
    showMessage("No event selected. Please open an event from the Events page.");
    return;
  }

  try {
    const [eventResponse, devicesResponse] = await Promise.all([
      fetch(`/api/events/${encodeURIComponent(eventId)}`),
      fetch("/api/devices")
    ]);

    if (eventResponse.status === 404) {
      showMessage("This event could not be found. It may have been removed.");
      return;
    }

    if (!eventResponse.ok || !devicesResponse.ok) {
      throw new Error("Could not load the event or devices");
    }

    currentEvent = await eventResponse.json();
    devices = await devicesResponse.json();

    renderPage();
  } catch (error) {
    console.error(error);
    showMessage("Sorry, this event could not be loaded. Please check that the server is running and refresh the page.");
  }
}


// ============ Helper functions ============

function showMessage(text) {
  pageMessage.textContent = text;
  pageMessage.classList.remove("hidden");
  pageContent.classList.add("hidden");
}

function setText(id, value) {
  document.getElementById(id).textContent = value || "—";
}

function formatDateTime(isoText) {
  if (!isoText) return "";
  return new Date(isoText).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function getStatusClass(status) {
  if (status === "Requested") return "status-requested";
  if (status === "Assigned") return "status-assigned";
  if (status === "Out at Event") return "status-out";
  return "status-closed";
}

function getAvailableDevices(itemName) {
  const available = [];
  for (const device of devices) {
    if (device.name === itemName && device.status === "In Office") {
      available.push(device);
    }
  }
  return available;
}

function findDevice(serial) {
  for (const device of devices) {
    if (device.serial === serial) {
      return device;
    }
  }
  return null;
}


// ============ Fill in the page ============

function renderPage() {
  document.title = `Atomx Inventory - ${currentEvent.name}`;

  setText("event-name", currentEvent.name);
  const statusBadge = document.getElementById("event-status");
  statusBadge.textContent = currentEvent.status;
  statusBadge.className = `status ${getStatusClass(currentEvent.status)}`;

  setText("event-dates", currentEvent.dates);
  setText("event-location", currentEvent.location);
  setText("event-created", formatDateTime(currentEvent.createdAt));
  setText("event-source", currentEvent.source);
  setText("event-notes", currentEvent.notes);

  setText("req-name", currentEvent.requestedBy);
  setText("req-email", currentEvent.requesterEmail);
  setText("req-phone", currentEvent.requesterPhone);
  setText("req-cc", currentEvent.ccEmails);

  if (currentEvent.status === "Requested") {
    renderAssignForm();
  } else {
    renderAssignedSummary();
  }

  pageMessage.classList.add("hidden");
  pageContent.classList.remove("hidden");
}


// ============ The assign form (for new requests) ============

function renderAssignForm() {
  assignGroups.innerHTML = "";

  if (currentEvent.itemsList.length === 0) {
    assignGroups.innerHTML = `<p class="empty-note">No items were listed in this request.</p>`;
  }

  for (const item of currentEvent.itemsList) {
   if (!QUANTITY_ITEMS.includes(item.name)) {
      const available = getAvailableDevices(item.name);

      let checkboxes = "";
      for (const device of available) {
        checkboxes += `
          <label class="device-option">
            <input type="checkbox" class="device-checkbox" value="${device.serial}"> ${device.serial}
          </label>
        `;
      }

      let warning = "";
      if (available.length === 0) {
        warning = `<p class="stock-warning">No ${item.name} is available in the office right now.</p>`;
      } else if (available.length < item.qty) {
        warning = `<p class="stock-warning">Only ${available.length} available in the office.</p>`;
      }

      assignGroups.innerHTML += `
        <div class="assign-group serial-group" data-requested="${item.qty}">
          <div class="assign-header">
            <h4>${item.name} <span class="requested-note">— requested ${item.qty}</span></h4>
            <span class="selection-count">Selected: 0 of ${item.qty}</span>
          </div>
          ${available.length > 0 ? `<div class="device-list">${checkboxes}</div>` : ""}
          ${warning}
        </div>
      `;
    } else {
      assignGroups.innerHTML += `
        <div class="assign-group quantity-group" data-item="${item.name}">
          <div class="assign-header">
            <h4>${item.name} <span class="requested-note">— requested ${item.qty}</span></h4>
            <label class="qty-control">
              Approved quantity
              <input type="number" class="qty-input" min="0" value="${item.qty}">
            </label>
          </div>
        </div>
      `;
    }
  }

  document.getElementById("send-email-label").textContent = `Send confirmation email to ${currentEvent.requestedBy}`;
  document.getElementById("extra-emails").value = currentEvent.ccEmails || "";

  document.getElementById("assign-section").classList.remove("hidden");
}

function updateSelectionCounts() {
  const groups = assignGroups.querySelectorAll(".serial-group");

  for (const group of groups) {
    const requested = Number(group.dataset.requested);
    const selected = group.querySelectorAll(".device-checkbox:checked").length;
    const countText = group.querySelector(".selection-count");

    countText.textContent = `Selected: ${selected} of ${requested}`;
    countText.classList.toggle("complete", selected === requested);
  }
}

assignGroups.addEventListener("change", function () {
  updateSelectionCounts();
});


// ============ Confirm the assignment ============

confirmButton.addEventListener("click", async function () {
  assignError.textContent = "";

  const serials = [];
  for (const checkbox of assignGroups.querySelectorAll(".device-checkbox:checked")) {
    serials.push(checkbox.value);
  }

  const quantityItems = [];
  for (const group of assignGroups.querySelectorAll(".quantity-group")) {
    quantityItems.push({
      name: group.dataset.item,
      qty: Number(group.querySelector(".qty-input").value)
    });
  }

  let totalQuantity = 0;
  for (const item of quantityItems) {
    totalQuantity += item.qty;
  }

  if (serials.length === 0 && totalQuantity === 0) {
    assignError.textContent = "Please select at least one device or enter a quantity before confirming.";
    return;
  }

  const shortfalls = [];
  for (const group of assignGroups.querySelectorAll(".serial-group")) {
    const requested = Number(group.dataset.requested);
    const selected = group.querySelectorAll(".device-checkbox:checked").length;
    const itemName = group.querySelector("h4").firstChild.textContent.trim();

    if (selected < requested) {
      shortfalls.push(`${itemName}: ${selected} selected, ${requested} requested`);
    }
  }

  if (shortfalls.length > 0) {
    const message = `Fewer devices than requested:\n\n${shortfalls.join("\n")}\n\nConfirm the assignment anyway?`;
    if (!window.confirm(message)) {
      return;
    }
  }

  confirmButton.disabled = true;
  confirmButton.textContent = "Saving...";

  try {
    const response = await fetch(`/api/events/${encodeURIComponent(eventId)}/assign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        serials: serials,
        quantityItems: quantityItems,
        extraEmails: document.getElementById("extra-emails").value.trim(),
        sendEmail: document.getElementById("send-email").checked
      })
    });

    const result = await response.json().catch(function () { return {}; });

    if (!response.ok) {
      assignError.textContent = result.error || `Could not save the assignment (server status ${response.status}).`;
      return;
    }

    window.location.reload();
  } catch (error) {
    console.error(error);
    assignError.textContent = "Could not reach the server. Please check your connection and try again.";
  } finally {
    confirmButton.disabled = false;
    confirmButton.textContent = "Confirm assignment";
  }
});


// ============ Summary (for events already assigned) ============

function renderAssignedSummary() {
  const list = document.getElementById("assigned-list");
  const assignedDevices = currentEvent.assignedDevices || [];
  const assignedQuantities = currentEvent.assignedQuantities || [];

  list.innerHTML = "";

  if (currentEvent.assignedAt) {
    document.getElementById("assigned-at").textContent = `Assigned on ${formatDateTime(currentEvent.assignedAt)}`;
  }

  for (const serial of assignedDevices) {
    const device = findDevice(serial);
    list.innerHTML += `
      <li>
        <div class="list-main">
          <strong>${serial}</strong>
          <small>${device ? device.name : "Device"}</small>
        </div>
        <span class="status status-assigned">Assigned</span>
      </li>
    `;
  }

  for (const item of assignedQuantities) {
    list.innerHTML += `
      <li>
        <div class="list-main">
          <strong>${item.name}</strong>
          <small>Quantity item</small>
        </div>
        <span>${item.qty}</span>
      </li>
    `;
  }

  if (list.innerHTML === "") {
    list.innerHTML = `<li class="empty-note">No assignment details are recorded for this event.</li>`;
  }

  document.getElementById("assigned-section").classList.remove("hidden");
}


// ============ Start ============

loadPage();