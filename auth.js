// ============ Login, sessions and user accounts ============

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const USERS_FILE = path.join(__dirname, "data", "users.json");
const SESSIONS_FILE = path.join(__dirname, "data", "sessions.json");
const COOKIE_NAME = "ix_session";
const SESSION_DAYS = 7;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const MIN_PASSWORD_LENGTH = 8;
const ROLES = ["admin", "manager"];

// Pages and files anyone can open without signing in
const PUBLIC_FILES = [
  "/", "/index.html", "/login.js", "/style.css",
  "/request.html", "/request.css", "/request.js", "/request-success.html",
  "/favicon.ico"
];

// API routes anyone can use without signing in
const PUBLIC_API = [
  "GET /api/setup-status",
  "POST /api/setup",
  "POST /api/login",
  "POST /api/logout",
  "GET /api/settings",
  "POST /api/events"
];

const failedLogins = {};


// ============ File helpers ============

function readList(filePath) {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  return JSON.parse(fs.readFileSync(filePath, "utf-8"));
}

function saveList(filePath, list) {
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2));
}


// ============ Passwords ============

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function checkPassword(password, stored) {
  const parts = String(stored || "").split(":");
  if (parts.length !== 2) {
    return false;
  }

  const attempt = crypto.scryptSync(password, parts[0], 64);
  const expected = Buffer.from(parts[1], "hex");
  return attempt.length === expected.length && crypto.timingSafeEqual(attempt, expected);
}

function checkNewPassword(password) {
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return `The password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (password.length > 200) {
    return "The password is too long.";
  }
  return null;
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}


// ============ Users ============

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    active: user.active !== false
  };
}

function publicUserList(users) {
  const list = [];
  for (const user of users) {
    list.push(publicUser(user));
  }
  return list;
}

function findUserByEmail(users, email) {
  const lowerEmail = String(email || "").trim().toLowerCase();
  for (const user of users) {
    if (user.email === lowerEmail) {
      return user;
    }
  }
  return null;
}

function findUserById(users, id) {
  for (const user of users) {
    if (user.id === id) {
      return user;
    }
  }
  return null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readNewUser(body, users) {
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (name === "" || name.length > 60) {
    return { error: "Please enter a name (up to 60 characters)." };
  }
  if (!isValidEmail(email)) {
    return { error: "Please enter a valid email address." };
  }
  if (findUserByEmail(users, email)) {
    return { error: "An account with this email already exists.", status: 409 };
  }

  const passwordProblem = checkNewPassword(password);
  if (passwordProblem) {
    return { error: passwordProblem };
  }

  return { name: name, email: email, password: password };
}

function countActiveAdmins(users) {
  let count = 0;
  for (const user of users) {
    if (user.role === "admin" && user.active !== false) {
      count++;
    }
  }
  return count;
}


// ============ Cookies and sessions ============

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || "").split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    cookies[part.slice(0, index).trim()] = decodeURIComponent(part.slice(index + 1).trim());
  }
  return cookies;
}

function createSession(req, res, user) {
  const token = crypto.randomBytes(32).toString("hex");
  const now = Date.now();
  const lifetime = SESSION_DAYS * 24 * 60 * 60 * 1000;

  const sessions = [];
  for (const session of readList(SESSIONS_FILE)) {
    if (session.expiresAt > now) {
      sessions.push(session);
    }
  }

  sessions.push({ tokenHash: hashToken(token), userId: user.id, createdAt: now, expiresAt: now + lifetime });
  saveList(SESSIONS_FILE, sessions);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: lifetime,
    path: "/"
  });
}

function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];

  if (token) {
    const tokenHash = hashToken(token);
    const remaining = [];
    for (const session of readList(SESSIONS_FILE)) {
      if (session.tokenHash !== tokenHash) {
        remaining.push(session);
      }
    }
    saveList(SESSIONS_FILE, remaining);
  }

  res.clearCookie(COOKIE_NAME, { path: "/" });
}

function endAllSessionsFor(userId) {
  const remaining = [];
  for (const session of readList(SESSIONS_FILE)) {
    if (session.userId !== userId) {
      remaining.push(session);
    }
  }
  saveList(SESSIONS_FILE, remaining);
}

function getSignedInUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) {
    return null;
  }

  const tokenHash = hashToken(token);
  const now = Date.now();
  let found = null;

  for (const session of readList(SESSIONS_FILE)) {
    if (session.tokenHash === tokenHash && session.expiresAt > now) {
      found = session;
    }
  }

  if (!found) {
    return null;
  }

  const user = findUserById(readList(USERS_FILE), found.userId);
  if (!user || user.active === false) {
    return null;
  }
  return user;
}


// ============ Guards: who can open what ============

function isPublic(req) {
  if (req.path.startsWith("/api/")) {
    return PUBLIC_API.includes(`${req.method} ${req.path}`);
  }
  return PUBLIC_FILES.includes(req.path);
}

function requireLogin(req, res, next) {
  let user = null;
  try {
    user = getSignedInUser(req);
  } catch (error) {
    console.error("Could not check the session:", error);
  }

  req.user = user ? publicUser(user) : null;

  if (req.user || isPublic(req)) {
    return next();
  }

  if (req.path.startsWith("/api/")) {
    return res.status(401).json({ error: "Please sign in to continue." });
  }

  res.redirect(`/index.html?next=${encodeURIComponent(req.originalUrl)}`);
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Only an admin can do this." });
  }
  next();
}


// ============ Protection against password guessing ============

function isLocked(email) {
  const record = failedLogins[email];
  return record && record.lockedUntil > Date.now();
}

function recordFailure(email) {
  const record = failedLogins[email] || { count: 0, lockedUntil: 0 };
  record.count++;

  if (record.count >= MAX_FAILED_ATTEMPTS) {
    record.lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000;
    record.count = 0;
  }
  failedLogins[email] = record;
}

function clearFailures(email) {
  delete failedLogins[email];
}


// ============ Routes ============

function registerAuthRoutes(app) {

  app.get("/api/setup-status", function (req, res) {
    try {
      res.json({ needsSetup: readList(USERS_FILE).length === 0 });
    } catch (error) {
      console.error("Could not read users:", error);
      res.status(500).json({ error: "Could not check the setup status." });
    }
  });

  app.post("/api/setup", function (req, res) {
    try {
      const users = readList(USERS_FILE);

      if (users.length > 0) {
        return res.status(409).json({ error: "Setup is already complete. Please sign in." });
      }

      const details = readNewUser(req.body, users);
      if (details.error) {
        return res.status(details.status || 400).json({ error: details.error });
      }

      const user = {
        id: "USR-" + Date.now(),
        name: details.name,
        email: details.email,
        role: "admin",
        active: true,
        passwordHash: hashPassword(details.password),
        createdAt: new Date().toISOString()
      };

      users.push(user);
      saveList(USERS_FILE, users);
      createSession(req, res, user);

      console.log(`First admin account created for ${user.name}`);
      res.status(201).json(publicUser(user));
    } catch (error) {
      console.error("Could not complete setup:", error);
      res.status(500).json({ error: "Could not create the account. Please try again." });
    }
  });

  app.post("/api/login", function (req, res) {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (email === "" || password === "") {
      return res.status(400).json({ error: "Please enter your email and password." });
    }

    if (isLocked(email)) {
      return res.status(429).json({ error: `Too many failed attempts. Please wait ${LOCK_MINUTES} minutes and try again.` });
    }

    try {
      const user = findUserByEmail(readList(USERS_FILE), email);

      if (!user || user.active === false || !checkPassword(password, user.passwordHash)) {
        recordFailure(email);
        return res.status(401).json({ error: "Email or password is incorrect." });
      }

      clearFailures(email);
      createSession(req, res, user);

      console.log(`${user.name} signed in`);
      res.json(publicUser(user));
    } catch (error) {
      console.error("Could not sign in:", error);
      res.status(500).json({ error: "Could not sign in. Please try again." });
    }
  });

  app.post("/api/logout", function (req, res) {
    try {
      endSession(req, res);
      res.json({ ok: true });
    } catch (error) {
      console.error("Could not sign out:", error);
      res.status(500).json({ error: "Could not sign out." });
    }
  });

  app.get("/api/me", function (req, res) {
    res.json(req.user);
  });

  app.post("/api/me/password", function (req, res) {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    try {
      const users = readList(USERS_FILE);
      const user = findUserById(users, req.user.id);

      if (!user || !checkPassword(currentPassword, user.passwordHash)) {
        return res.status(400).json({ error: "Your current password is incorrect." });
      }

      const problem = checkNewPassword(newPassword);
      if (problem) {
        return res.status(400).json({ error: problem });
      }

      user.passwordHash = hashPassword(newPassword);
      saveList(USERS_FILE, users);

      endAllSessionsFor(user.id);
      createSession(req, res, user);

      console.log(`${user.name} changed their password`);
      res.json({ ok: true });
    } catch (error) {
      console.error("Could not change password:", error);
      res.status(500).json({ error: "Could not change the password. Please try again." });
    }
  });

  app.get("/api/users", requireAdmin, function (req, res) {
    try {
      res.json(publicUserList(readList(USERS_FILE)));
    } catch (error) {
      console.error("Could not read users:", error);
      res.status(500).json({ error: "Could not load the users." });
    }
  });

  app.post("/api/users", requireAdmin, function (req, res) {
    try {
      const users = readList(USERS_FILE);
      const details = readNewUser(req.body, users);

      if (details.error) {
        return res.status(details.status || 400).json({ error: details.error });
      }

      const role = String(req.body.role || "");
      if (!ROLES.includes(role)) {
        return res.status(400).json({ error: "Please choose a role." });
      }

      users.push({
        id: "USR-" + Date.now(),
        name: details.name,
        email: details.email,
        role: role,
        active: true,
        passwordHash: hashPassword(details.password),
        createdAt: new Date().toISOString()
      });
      saveList(USERS_FILE, users);

      console.log(`${req.user.name} added a new ${role}: ${details.name}`);
      res.status(201).json(publicUserList(users));
    } catch (error) {
      console.error("Could not add user:", error);
      res.status(500).json({ error: "Could not add the user. Please try again." });
    }
  });

  app.post("/api/users/:id/active", requireAdmin, function (req, res) {
    const makeActive = req.body.active === true;

    try {
      const users = readList(USERS_FILE);
      const user = findUserById(users, req.params.id);

      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }
      if (!makeActive && user.id === req.user.id) {
        return res.status(400).json({ error: "You can't deactivate your own account." });
      }
      if (!makeActive && user.role === "admin" && countActiveAdmins(users) <= 1) {
        return res.status(400).json({ error: "There must always be at least one active admin." });
      }

      user.active = makeActive;
      saveList(USERS_FILE, users);

      if (!makeActive) {
        endAllSessionsFor(user.id);
      }

      console.log(`${req.user.name} ${makeActive ? "activated" : "deactivated"} ${user.name}`);
      res.json(publicUserList(users));
    } catch (error) {
      console.error("Could not update user:", error);
      res.status(500).json({ error: "Could not update the user. Please try again." });
    }
  });

  app.post("/api/users/:id/password", requireAdmin, function (req, res) {
    const newPassword = String(req.body.password || "");

    try {
      const users = readList(USERS_FILE);
      const user = findUserById(users, req.params.id);

      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      const problem = checkNewPassword(newPassword);
      if (problem) {
        return res.status(400).json({ error: problem });
      }

      user.passwordHash = hashPassword(newPassword);
      saveList(USERS_FILE, users);
      endAllSessionsFor(user.id);

      console.log(`${req.user.name} reset the password for ${user.name}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("Could not reset password:", error);
      res.status(500).json({ error: "Could not reset the password. Please try again." });
    }
  });
}


function getNotificationEmails() {
  const emails = [];
  for (const user of readList(USERS_FILE)) {
    if (user.active !== false) {
      emails.push(user.email);
    }
  }
  return emails;
}


module.exports = {
  requireLogin: requireLogin,
  registerAuthRoutes: registerAuthRoutes,
  getNotificationEmails: getNotificationEmails
};