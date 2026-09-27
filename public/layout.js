// ============ Signed-in user (placeholder until we build login) ============

window.currentUser = { name: "Akshay", role: "Inventory Manager" };


// ============ Build the sidebar and top bar on every page ============

(function () {

  const PAGE_INFO = {
    "dashboard.html":     { key: "dashboard",    title: "Dashboard" },
    "categories.html":    { key: "categories",   title: "Categories" },
    "device-types.html":  { key: "device-types", title: "Device Types" },
    "inventory.html":     { key: "inventory",    title: "Master Inventory" },
    "type-detail.html":   { key: "inventory",    title: "Track Devices" },
    "device-detail.html": { key: "inventory",    title: "Device" },
    "events.html":        { key: "events",       title: "Events" },
    "event-detail.html":  { key: "events",       title: "Event Details" }
  };

  const fileName = window.location.pathname.split("/").pop() || "dashboard.html";
  const pageInfo = PAGE_INFO[fileName] || { key: "", title: "" };

  const svgStart = `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">`;

  const ICONS = {
    dashboard: `${svgStart}<rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></svg>`,
    categories: `${svgStart}<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>`,
    types: `${svgStart}<polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>`,
    inventory: `${svgStart}<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>`,
    events: `${svgStart}<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>`,
    create: `${svgStart}<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    share: `${svgStart}<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
    logout: `${svgStart}<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    menu: `${svgStart}<line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>`,
    bell: `${svgStart}<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>`,
    collapse: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="11 17 6 12 11 7"/><polyline points="18 17 13 12 18 7"/></svg>`
  };

  function navItem(key, href, icon, label, extraAttributes) {
    const activeClass = key === pageInfo.key ? " active" : "";
    return `<a href="${href}" class="nav-item${activeClass}" title="${label}" ${extraAttributes || ""}>${icon}<span class="nav-label">${label}</span></a>`;
  }

  function buildLayout() {
    const main = document.querySelector("main");
    if (!main) return;

    const oldNavbar = document.querySelector(".navbar");
    if (oldNavbar) oldNavbar.remove();

    const user = window.currentUser;
    const initial = user.name.charAt(0).toUpperCase();

    const shell = document.createElement("div");
    shell.className = "app-shell";
    shell.innerHTML = `
      <aside class="sidebar">
        <div class="sidebar-brand">
          <span class="brand-logo">IX</span>
          <div class="brand-text">
            <strong>InventoryX</strong>
            <small>by AtomX</small>
          </div>
        </div>

        <nav class="sidebar-nav" aria-label="Main navigation">
          <p class="nav-section-title">Main</p>
          ${navItem("dashboard", "dashboard.html", ICONS.dashboard, "Dashboard")}

          <p class="nav-section-title">Inventory</p>
          ${navItem("categories", "categories.html", ICONS.categories, "Categories")}
          ${navItem("device-types", "device-types.html", ICONS.types, "Device Types")}
          ${navItem("inventory", "inventory.html", ICONS.inventory, "Master Inventory")}

          <p class="nav-section-title">Events</p>
          ${navItem("events", "events.html", ICONS.events, "Events")}
          ${navItem("create", "create-event.html", ICONS.create, "Create Event")}
          ${navItem("request", "request.html", ICONS.share, "Staff Request Form", 'target="_blank" rel="noopener"')}
        </nav>

        <div class="sidebar-footer">
          ${navItem("logout", "index.html", ICONS.logout, "Logout")}
        </div>

        <button type="button" class="collapse-btn" id="collapse-btn" aria-label="Collapse sidebar">${ICONS.collapse}</button>
      </aside>

      <div class="sidebar-overlay" id="sidebar-overlay"></div>

      <div class="app-main">
        <header class="topbar">
          <div class="topbar-left">
            <button type="button" class="menu-btn" id="menu-btn" aria-label="Open menu">${ICONS.menu}</button>
            <p class="breadcrumb"><span>InventoryX</span> / <strong>${pageInfo.title}</strong></p>
          </div>
          <div class="topbar-right">
            <a href="events.html" class="bell-btn" aria-label="New event requests">
              ${ICONS.bell}
              <span class="bell-badge hidden" id="bell-badge">0</span>
            </a>
            <div class="user-chip">
              <span class="user-avatar">${initial}</span>
              <div class="user-text">
                <strong>${user.name.toUpperCase()}</strong>
                <small>${user.role}</small>
              </div>
            </div>
          </div>
        </header>
      </div>
    `;

    document.body.prepend(shell);
    shell.querySelector(".app-main").appendChild(main);

    // Remember whether the sidebar is collapsed
    try {
      if (localStorage.getItem("sidebarCollapsed") === "yes") {
        shell.classList.add("collapsed");
      }
    } catch (error) {
      // Storage not available; the sidebar simply starts open
    }

    document.getElementById("collapse-btn").addEventListener("click", function () {
      shell.classList.toggle("collapsed");
      try {
        localStorage.setItem("sidebarCollapsed", shell.classList.contains("collapsed") ? "yes" : "no");
      } catch (error) {
        // Ignore storage problems
      }
    });

    // Phone menu: slide the sidebar in and out
    document.getElementById("menu-btn").addEventListener("click", function () {
      shell.classList.add("sidebar-open");
    });

    document.getElementById("sidebar-overlay").addEventListener("click", function () {
      shell.classList.remove("sidebar-open");
    });

    loadBellCount();
  }

  async function loadBellCount() {
    try {
      const response = await fetch("/api/events");
      if (!response.ok) return;

      const events = await response.json();
      let newRequests = 0;
      for (const event of events) {
        if (event.status === "Requested") {
          newRequests++;
        }
      }

      if (newRequests > 0) {
        const badge = document.getElementById("bell-badge");
        badge.textContent = newRequests > 9 ? "9+" : newRequests;
        badge.classList.remove("hidden");
      }
    } catch (error) {
      console.warn("Could not load the notification count", error);
    }
  }

  buildLayout();

})();