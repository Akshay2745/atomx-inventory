// ============ Login, sessions and user accounts (stored in PostgreSQL) ============

const crypto = require("crypto");
const db = require("./db");

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
  "GET /api/health",
  "GET /api/setup-status",
  "POST /api/setup",
  "POST /api/login",
  "POST /api/logout",
  "GET /api/settings",
  "POST /api/events"
];

const failedLogins = {};


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

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    active: row.active
  };
}

async function listUsers() {
  const result = await db.query("SELECT id, name, email, role, active FROM users ORDER BY created_at");
  const users = [];
  for (const row of result.rows) {
    users.push(publicUser(row));
  }
  return users;
}

async function findUserById(id) {
  const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
  return result.rows[0] || null;
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function readNewUser(body) {
  const name = String(body.name || "").trim().replace(/\s+/g, " ");
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");

  if (name === "" || name.length > 60) {
    return { error: "Please enter a name (up to 60 characters)." };
  }
  if (!isValidEmail(email)) {
    return { error: "Please enter a valid email address." };
  }

  const passwordProblem = checkNewPassword(password);
  if (passwordProblem) {
    return { error: passwordProblem };
  }

  return { name: name, email: email, password: password };
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

async function createSession(req, res, userId) {
  const token = crypto.randomBytes(32).toString("hex");
  const lifetime = SESSION_DAYS * 24 * 60 * 60 * 1000;

  await db.query("DELETE FROM sessions WHERE expires_at < now()");
  await db.query(
    "INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, now() + ($3 || ' days')::interval)",
    [hashToken(token), userId, String(SESSION_DAYS)]
  );

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: req.secure,
    maxAge: lifetime,
    path: "/"
  });
}

async function endSession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (token) {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  res.clearCookie(COOKIE_NAME, { path: "/" });
}

async function endAllSessionsFor(userId) {
  await db.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
}

async function getSignedInUser(req) {
  const token = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (!token) {
    return null;
  }

  const result = await db.query(`
    SELECT u.id, u.name, u.email, u.role, u.active
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active
  `, [hashToken(token)]);

  return result.rows[0] || null;
}


// ============ Guards: who can open what ============

function isPublic(req) {
  if (req.path.startsWith("/api/")) {
    return PUBLIC_API.includes(`${req.method} ${req.path}`);
  }
  return PUBLIC_FILES.includes(req.path);
}

async function requireLogin(req, res, next) {
  let user = null;
  try {
    user = await getSignedInUser(req);
  } catch (error) {
    console.error("Could not check the session:", error.message);
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

  app.get("/api/setup-status", async function (req, res) {
    try {
      const result = await db.query("SELECT count(*)::int AS count FROM users");
      res.json({ needsSetup: result.rows[0].count === 0 });
    } catch (error) {
      console.error("Could not read users:", error);
      res.status(500).json({ error: "Could not check the setup status." });
    }
  });

  app.post("/api/setup", async function (req, res) {
    const details = readNewUser(req.body);
    if (details.error) {
      return res.status(400).json({ error: details.error });
    }

    try {
      const userId = "USR-" + Date.now();

      const created = await db.transaction(async function (client) {
        await client.query("LOCK TABLE users IN EXCLUSIVE MODE");
        const countResult = await client.query("SELECT count(*)::int AS count FROM users");

        if (countResult.rows[0].count > 0) {
          return false;
        }

        await client.query(
          "INSERT INTO users (id, name, email, role, active, password_hash) VALUES ($1, $2, $3, 'admin', true, $4)",
          [userId, details.name, details.email, hashPassword(details.password)]
        );
        return true;
      });

      if (!created) {
        return res.status(409).json({ error: "Setup is already complete. Please sign in." });
      }

      await createSession(req, res, userId);
      console.log(`First admin account created for ${details.name}`);
      res.status(201).json(publicUser(await findUserById(userId)));
    } catch (error) {
      console.error("Could not complete setup:", error);
      res.status(500).json({ error: "Could not create the account. Please try again." });
    }
  });

  app.post("/api/login", async function (req, res) {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");

    if (email === "" || password === "") {
      return res.status(400).json({ error: "Please enter your email and password." });
    }

    if (isLocked(email)) {
      return res.status(429).json({ error: `Too many failed attempts. Please wait ${LOCK_MINUTES} minutes and try again.` });
    }

    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1", [email]);
      const user = result.rows[0];

      if (!user || !user.active || !checkPassword(password, user.password_hash)) {
        recordFailure(email);
        return res.status(401).json({ error: "Email or password is incorrect." });
      }

      clearFailures(email);
      await createSession(req, res, user.id);

      console.log(`${user.name} signed in`);
      res.json(publicUser(user));
    } catch (error) {
      console.error("Could not sign in:", error);
      res.status(500).json({ error: "Could not sign in. Please try again." });
    }
  });

  app.post("/api/logout", async function (req, res) {
    try {
      await endSession(req, res);
      res.json({ ok: true });
    } catch (error) {
      console.error("Could not sign out:", error);
      res.status(500).json({ error: "Could not sign out." });
    }
  });

  app.get("/api/me", function (req, res) {
    res.json(req.user);
  });

  app.post("/api/me/password", async function (req, res) {
    const currentPassword = String(req.body.currentPassword || "");
    const newPassword = String(req.body.newPassword || "");

    try {
      const user = await findUserById(req.user.id);

      if (!user || !checkPassword(currentPassword, user.password_hash)) {
        return res.status(400).json({ error: "Your current password is incorrect." });
      }

      const problem = checkNewPassword(newPassword);
      if (problem) {
        return res.status(400).json({ error: problem });
      }

      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword(newPassword), user.id]);
      await endAllSessionsFor(user.id);
      await createSession(req, res, user.id);

      console.log(`${user.name} changed their password`);
      res.json({ ok: true });
    } catch (error) {
      console.error("Could not change password:", error);
      res.status(500).json({ error: "Could not change the password. Please try again." });
    }
  });

  app.get("/api/users", requireAdmin, async function (req, res) {
    try {
      res.json(await listUsers());
    } catch (error) {
      console.error("Could not read users:", error);
      res.status(500).json({ error: "Could not load the users." });
    }
  });

  app.post("/api/users", requireAdmin, async function (req, res) {
    const details = readNewUser(req.body);
    if (details.error) {
      return res.status(400).json({ error: details.error });
    }

    const role = String(req.body.role || "");
    if (!ROLES.includes(role)) {
      return res.status(400).json({ error: "Please choose a role." });
    }

    try {
      await db.query(
        "INSERT INTO users (id, name, email, role, active, password_hash) VALUES ($1, $2, $3, $4, true, $5)",
        ["USR-" + Date.now(), details.name, details.email, role, hashPassword(details.password)]
      );

      console.log(`${req.user.name} added a new ${role}: ${details.name}`);
      res.status(201).json(await listUsers());
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "An account with this email already exists." });
      }
      console.error("Could not add user:", error);
      res.status(500).json({ error: "Could not add the user. Please try again." });
    }
  });

  app.post("/api/users/:id/active", requireAdmin, async function (req, res) {
    const makeActive = req.body.active === true;

    try {
      const user = await findUserById(req.params.id);

      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }
      if (!makeActive && user.id === req.user.id) {
        return res.status(400).json({ error: "You can't deactivate your own account." });
      }

      if (!makeActive && user.role === "admin") {
        const adminResult = await db.query("SELECT count(*)::int AS count FROM users WHERE role = 'admin' AND active");
        if (adminResult.rows[0].count <= 1) {
          return res.status(400).json({ error: "There must always be at least one active admin." });
        }
      }

      await db.query("UPDATE users SET active = $1 WHERE id = $2", [makeActive, user.id]);
      if (!makeActive) {
        await endAllSessionsFor(user.id);
      }

      console.log(`${req.user.name} ${makeActive ? "activated" : "deactivated"} ${user.name}`);
      res.json(await listUsers());
    } catch (error) {
      console.error("Could not update user:", error);
      res.status(500).json({ error: "Could not update the user. Please try again." });
    }
  });

  app.post("/api/users/:id/password", requireAdmin, async function (req, res) {
    const newPassword = String(req.body.password || "");

    try {
      const user = await findUserById(req.params.id);

      if (!user) {
        return res.status(404).json({ error: "User not found." });
      }

      const problem = checkNewPassword(newPassword);
      if (problem) {
        return res.status(400).json({ error: problem });
      }

      await db.query("UPDATE users SET password_hash = $1 WHERE id = $2", [hashPassword(newPassword), user.id]);
      await endAllSessionsFor(user.id);

      console.log(`${req.user.name} reset the password for ${user.name}`);
      res.json({ ok: true });
    } catch (error) {
      console.error("Could not reset password:", error);
      res.status(500).json({ error: "Could not reset the password. Please try again." });
    }
  });
}


async function getNotificationEmails() {
  const result = await db.query("SELECT email FROM users WHERE active ORDER BY created_at");
  const emails = [];
  for (const row of result.rows) {
    emails.push(row.email);
  }
  return emails;
}


module.exports = {
  requireLogin: requireLogin,
  registerAuthRoutes: registerAuthRoutes,
  getNotificationEmails: getNotificationEmails
};