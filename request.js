// ============ Items people can request ============

const itemOptions = ["POS Terminal", "Soundbox", "Card Reader", "QR Standee", "Charger", "Paper Roll"];


// ============ Page elements ============

const itemRowsContainer = document.getElementById("item-rows");
const addItemButton = document.getElementById("add-item-btn");
const requestForm = document.getElementById("request-form");
const errorText = document.getElementById("request-error");

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
      <select id="item-${rowCounter}" name="item" required>
        ${buildOptionsHTML()}
      </select>
    </div>
    <div>
      <label for="qty-${rowCounter}">Quantity</label>
      <input type="number" id="qty-${rowCounter}" name="qty" min="1" placeholder="0" required>
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


// ============ Button and form listeners ============

addItemButton.addEventListener("click", function () {
  addItemRow();
});

requestForm.addEventListener("submit", function (event) {
  errorText.textContent = "";

  const startDate = document.getElementById("start-date").value;
  const endDate = document.getElementById("end-date").value;

  if (endDate < startDate) {
    event.preventDefault();
    errorText.textContent = "The end date can't be before the start date.";
    return;
  }

  if (hasDuplicateItems()) {
    event.preventDefault();
    errorText.textContent = "You've selected the same item twice. Please combine them into one row with the total quantity.";
    return;
  }
});


// ============ Start with one empty row ============

addItemRow();