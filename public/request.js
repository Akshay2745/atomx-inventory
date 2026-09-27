// ============ Items people can request ============

const itemOptions = ["POS Terminal", "Soundbox", "Card Reader", "QR Standee", "Charger", "Paper Roll"];


// ============ Page elements ============

const itemRowsContainer = document.getElementById("item-rows");
const addItemButton = document.getElementById("add-item-btn");
const requestForm = document.getElementById("request-form");
const errorText = document.getElementById("request-error");
const submitButton = requestForm.querySelector('button[type="submit"]');
const submitButtonText = submitButton.textContent;

let rowCounter = 0;


// ============ Build the dropdown options ============

function buildOptionsHTML() {
  let html = `<option value="">Select an item</option>`;
  for (const item of itemOptions) {
    html += `<option value="${item}">${item}</option>`;
  }
  return html;
}


// ============ Add a new item row ============

function addItemRow() {
  rowCounter++;

  const row = document.createElement("div");
  row.className = "item-row";
  row.innerHTML = `
    <div>
      <label for="item-${rowCounter}">Item</label>
      <select id="item-${rowCounter}" required>
        ${buildOptionsHTML()}
      </select>
    </div>
    <div>
      <label for="qty-${rowCounter}">Quantity</label>
      <input type="number" id="qty-${rowCounter}" min="1" placeholder="0" required>
    </div>
    <button type="button" class="remove-item-btn" aria-label="Remove this item">×</button>
  `;

  itemRowsContainer.appendChild(row);

  row.querySelector(".remove-item-btn").addEventListener("click", function () {
    row.remove();
    updateRemoveButtons();
  });

  updateRemoveButtons();
}


// ============ Keep at least one row ============

function updateRemoveButtons() {
  const removeButtons = itemRowsContainer.querySelectorAll(".remove-item-btn");
  for (const button of removeButtons) {
    button.disabled = removeButtons.length === 1;
  }
}


// ============ Check for the same item chosen twice ============

function hasDuplicateItems() {
  const selects = itemRowsContainer.querySelectorAll("select");
  const chosenItems = [];

  for (const select of selects) {
    if (chosenItems.includes(select.value)) {
      return true;
    }
    chosenItems.push(select.value);
  }
  return false;
}


// ============ Collect the form data ============

function getValue(id) {
  return document.getElementById(id).value.trim();
}

function collectItems() {
  const rows = itemRowsContainer.querySelectorAll(".item-row");
  const items = [];

  for (const row of rows) {
    items.push({
      name: row.querySelector("select").value,
      qty: Number(row.querySelector('input[type="number"]').value)
    });
  }
  return items;
}


// ============ Button and form listeners ============

addItemButton.addEventListener("click", function () {
  addItemRow();
});

requestForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  errorText.textContent = "";

  const startDate = getValue("start-date");
  const endDate = getValue("end-date");

  if (endDate < startDate) {
    errorText.textContent = "The end date can't be before the start date.";
    return;
  }

  if (hasDuplicateItems()) {
    errorText.textContent = "You've selected the same item twice. Please combine them into one row with the total quantity.";
    return;
  }

  const eventData = {
    eventName: getValue("event-name"),
    startDate: startDate,
    endDate: endDate,
    location: getValue("location"),
    requesterName: getValue("requester-name"),
    requesterEmail: getValue("requester-email"),
    requesterPhone: getValue("contact-phone"),
    ccEmails: getValue("cc-emails"),
    notes: getValue("notes"),
    items: collectItems(),
    source: requestForm.dataset.source
  };

  submitButton.disabled = true;
  submitButton.textContent = "Saving...";

  try {
    const response = await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(eventData)
    });

    const result = await response.json();

    if (!response.ok) {
      errorText.textContent = result.error || "Could not save the event.";
      return;
    }

    window.location.href = requestForm.dataset.redirect;
  } catch (error) {
    console.error(error);
    errorText.textContent = "Could not reach the server. Please check your connection and try again.";
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = submitButtonText;
  }
});


// ============ Start with one empty row ============

addItemRow();