// ============ Page elements ============

const loginForm = document.getElementById("login-form");
const setupForm = document.getElementById("setup-form");
const subtitle = document.getElementById("login-subtitle");
const loginError = document.getElementById("login-error");
const setupError = document.getElementById("setup-error");
const loginButton = document.getElementById("login-btn");
const setupButton = document.getElementById("setup-btn");


// ============ Helpers ============

function getNextPage() {
  const next = new URLSearchParams(window.location.search).get("next");
  if (next && next.startsWith("/") && !next.startsWith("//")) {
    return next;
  }
  return "/dashboard.html";
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


// ============ On page load: already signed in? first-time setup? ============

async function start() {
  try {
    const meResponse = await fetch("/api/me");
    if (meResponse.ok) {
      window.location.href = getNextPage();
      return;
    }
  } catch (error) {
    // Not signed in, which is expected on the login page
  }

  try {
    const response = await fetch("/api/setup-status");
    if (response.ok) {
      const status = await response.json();
      if (status.needsSetup) {
        loginForm.classList.add("hidden");
        setupForm.classList.remove("hidden");
        subtitle.textContent = "First-time setup";
      }
    }
  } catch (error) {
    console.error(error);
    loginError.textContent = "Could not reach the server. Please check that it is running.";
  }
}


// ============ Sign in ============

loginForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  loginError.textContent = "";
  loginButton.disabled = true;
  loginButton.textContent = "Signing in...";

  try {
    const response = await postJson("/api/login", {
      email: document.getElementById("email").value.trim(),
      password: document.getElementById("password").value
    });

    if (!response.ok) {
      loginError.textContent = response.result.error || `Could not sign in (server status ${response.status}).`;
      return;
    }

    window.location.href = getNextPage();
  } catch (error) {
    console.error(error);
    loginError.textContent = "Could not reach the server. Please try again.";
  } finally {
    loginButton.disabled = false;
    loginButton.textContent = "Sign in";
  }
});


// ============ First-time setup ============

setupForm.addEventListener("submit", async function (event) {
  event.preventDefault();
  setupError.textContent = "";

  const password = document.getElementById("setup-password").value;
  const confirm = document.getElementById("setup-confirm").value;

  if (password !== confirm) {
    setupError.textContent = "The two passwords don't match.";
    return;
  }

  setupButton.disabled = true;
  setupButton.textContent = "Creating account...";

  try {
    const response = await postJson("/api/setup", {
      name: document.getElementById("setup-name").value.trim(),
      email: document.getElementById("setup-email").value.trim(),
      password: password
    });

    if (!response.ok) {
      setupError.textContent = response.result.error || `Could not create the account (server status ${response.status}).`;
      return;
    }

    window.location.href = "/dashboard.html";
  } catch (error) {
    console.error(error);
    setupError.textContent = "Could not reach the server. Please try again.";
  } finally {
    setupButton.disabled = false;
    setupButton.textContent = "Create admin account";
  }
});


// ============ Start ============

start();