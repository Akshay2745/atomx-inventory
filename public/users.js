// ============ Data ============

let me = null;
let users = [];

const ROLE_LABELS = { admin: "Admin", manager: "Inventory Manager" };


// ============ Page elements ============

const tableBody = document.getElementById("users-table-body");
const adminSection = document.getElementById("admin-section");
const managerNote = document.getElementById("manager-note");

const passwordForm = document.getElementById("password-form");
const passwordError = document.getElementById("password-error");
const passwordSuccess = document.getElementById("password-success");
const passwordButton = document.getElementById("password-btn");

const addUserForm = document.getElementById("add-user-form");
const userError = document.getElementById("user-error");
const userSuccess = document.getElementById("user-success");
const addUserButton = document.getElementById("add-user-btn");


// ============ Helpers ============

function escapeHTML(value) {
  return String(value === null || value === undefined ? "" : value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
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


// ============ Load ============

async function loadPage() {
  try {
    const meResponse = await fetch("/api/me");
    if (!meResponse.ok) {
      throw new Error("Not signed in");
    }
    me = await meResponse.json();

    if (me.role !== "admin") {
      managerNote.classList.remove("hidden");
      return;
    }

    adminSection.classList.remove("hidden");

    const usersResponse = await fetch("/api/users");
    if (!usersResponse.ok) {
      throw new Error("Could not load users");
    }
    users = await usersResponse.json();
    renderTable();
  } catch (error) {
    console.error(error);
    tableBody.innerHTML = `<tr><td colspan="5">Sorry, the users could not be loaded. Please refresh the page.</td></tr>`;
  }
}


// ============ Users table ============

function renderTable() {
  tableBody.innerHTML = "";

  for (const user of users) {
    const isMe = user.id === me.id;
    const statusBadge = user.active
      ? `<span class="status status-office">Active</span>`
      : `<span class="status status-closed">Deactivated</span>`;

    let actions = `<button type="button" class="btn-small" data-action="reset" data-id="${escapeHTML(user.id)}">Reset password</button> `;

    if (isMe) {
      actions = `<span class="empty-note">This is you</span>`;
    } else if (user.active) {
      actions += `<button type="button" class="btn-danger-small" data-action="deactivate" data-id="${escapeHTML(user.id)}">Deactivate</button>`;
    } else {
      actions += `<button type="button" class="btn-small" data-action="activate" data-id="${escapeHTML(user.id)}">Activate</button>`;
    }

    tableBody.innerHTML += `
      <tr>
        <td><strong>${escapeHTML(user.name)}</strong></td>
        <td>${escapeHTML(user.email)}</td>
        <td>${escapeHTML(ROLE_LABELS[user.role] || user.role)}</td>
        <td>${statusBadge}</td>
        <td class="table-actions">${actions}</td>
      </tr>
    `;
  }
}

tableBody.addEventListener("click", async function (event) {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const user = users.find(function (item) { return item.id === button.dataset.id; });
  if (!user) return;

  userError.textContent = "";
  userSuccess.textContent = "";

  try {
    if (button.dataset.action === "reset") {
      const newPassword = window.prompt(`Enter a new temporary password for ${user.name} (at least 8 characters):`);
      if (!newPassword) return;

      const response = await postJson(`/api/users/${encodeURIComponent(user.id)}/password`, { password: newPassword });
      if (!response.ok) {
        userError.textContent = response.result.error || "Could not reset the password.";
        return;
      }
      userSuccess.textContent = `Password reset for ${user.name}. Share the new password with them privately.`;
      return;
    }

    const makeActive = button.dataset.action === "activate";
    const question = makeActive
      ? `Activate ${user.name}? They will be able to sign in again.`
      : `Deactivate ${user.name}? They will be signed out and can no longer sign in.`;

    if (!window.confirm(question)) return;

    const response = await postJson(`/api/users/${encodeURIComponent(user.id)}/active`, { active: makeActive });
    if (!response.ok) {
      userError.textContent = response.result.error || "Could not update the user.";
      return;
    }

    users = response.result;
    renderTable();
    userSuccess.textContent = `${user.name} is now ${makeActive ? "active" : "deactivated"}.`;
  } catch (error) {
    console.error(error);
    userError.textContent = "Could not reach the server. Please try again.";
  }
});


// ============ Add a team member ============

addUserForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  userError.textContent = "";
  userSuccess.textContent = "";
  addUserButton.disabled = true;

  const name = document.getElementById("user-name").value.trim();

  try {
    const response = await postJson("/api/users", {
      name: name,
      email: document.getElementById("user-email").value.trim(),
      role: document.getElementById("user-role").value,
      password: document.getElementById("user-password").value
    });

    if (!response.ok) {
      userError.textContent = response.result.error || `Could not add the user (server status ${response.status}).`;
      return;
    }

    users = response.result;
    renderTable();
    addUserForm.reset();
    userSuccess.textContent = `Added ${name}. Share their email and temporary password with them privately.`;
  } catch (error) {
    console.error(error);
    userError.textContent = "Could not reach the server. Please try again.";
  } finally {
    addUserButton.disabled = false;
  }
});


// ============ Change my password ============

passwordForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  passwordError.textContent = "";
  passwordSuccess.textContent = "";

  const newPassword = document.getElementById("new-password").value;
  if (newPassword !== document.getElementById("confirm-password").value) {
    passwordError.textContent = "The two new passwords don't match.";
    return;
  }

  passwordButton.disabled = true;

  try {
    const response = await postJson("/api/me/password", {
      currentPassword: document.getElementById("current-password").value,
      newPassword: newPassword
    });

    if (!response.ok) {
      passwordError.textContent = response.result.error || "Could not change the password.";
      return;
    }

    passwordForm.reset();
    passwordSuccess.textContent = "Your password has been updated. You've been signed out on your other devices.";
  } catch (error) {
    console.error(error);
    passwordError.textContent = "Could not reach the server. Please try again.";
  } finally {
    passwordButton.disabled = false;
  }
});


// ============ Start ============

loadPage();