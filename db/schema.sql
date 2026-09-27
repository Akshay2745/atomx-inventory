-- ============ InventoryX database tables ============

CREATE TABLE IF NOT EXISTS categories (
  id          SERIAL PRIMARY KEY,
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS categories_name_unique ON categories (lower(name));

CREATE TABLE IF NOT EXISTS device_types (
  id           SERIAL PRIMARY KEY,
  name         TEXT NOT NULL,
  category_id  INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS device_types_name_unique ON device_types (lower(name));

CREATE TABLE IF NOT EXISTS users (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  email          TEXT NOT NULL UNIQUE,
  role           TEXT NOT NULL CHECK (role IN ('admin', 'manager')),
  active         BOOLEAN NOT NULL DEFAULT true,
  password_hash  TEXT NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at  TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id               TEXT PRIMARY KEY,
  name             TEXT NOT NULL,
  start_date       DATE NOT NULL,
  end_date         DATE NOT NULL,
  location         TEXT NOT NULL,
  requested_by     TEXT NOT NULL,
  requester_email  TEXT NOT NULL DEFAULT '',
  requester_phone  TEXT NOT NULL DEFAULT '',
  cc_emails        TEXT NOT NULL DEFAULT '',
  notes            TEXT NOT NULL DEFAULT '',
  source           TEXT NOT NULL DEFAULT 'Staff request',
  created_by       TEXT,
  status           TEXT NOT NULL DEFAULT 'Requested'
                   CHECK (status IN ('Requested', 'Assigned', 'Out at Event', 'Closed')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  assigned_at      TIMESTAMPTZ,
  dispatched_at    TIMESTAMPTZ,
  closed_at        TIMESTAMPTZ,
  CHECK (end_date >= start_date)
);

CREATE TABLE IF NOT EXISTS event_items (
  event_id   TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  item_name  TEXT NOT NULL,
  qty        INTEGER NOT NULL CHECK (qty > 0),
  PRIMARY KEY (event_id, item_name)
);

CREATE TABLE IF NOT EXISTS devices (
  serial            TEXT PRIMARY KEY,
  type_id           INTEGER NOT NULL REFERENCES device_types(id) ON DELETE RESTRICT,
  status            TEXT NOT NULL DEFAULT 'In Office'
                    CHECK (status IN ('In Office', 'Assigned', 'Damaged', 'Lost')),
  current_event_id  TEXT REFERENCES events(id) ON DELETE SET NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS devices_type_index ON devices (type_id);

CREATE TABLE IF NOT EXISTS assignments (
  id             SERIAL PRIMARY KEY,
  event_id       TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  serial         TEXT NOT NULL REFERENCES devices(serial),
  assigned_at    TIMESTAMPTZ,
  return_status  TEXT CHECK (return_status IN ('Returned', 'Damaged', 'Lost')),
  returned_at    TIMESTAMPTZ,
  note           TEXT NOT NULL DEFAULT '',
  UNIQUE (event_id, serial)
);

CREATE TABLE IF NOT EXISTS device_history (
  id          SERIAL PRIMARY KEY,
  serial      TEXT NOT NULL REFERENCES devices(serial) ON DELETE CASCADE,
  action      TEXT NOT NULL,
  event_id    TEXT REFERENCES events(id) ON DELETE SET NULL,
  event_name  TEXT,
  note        TEXT NOT NULL DEFAULT '',
  created_by  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS email_log (
  id          SERIAL PRIMARY KEY,
  event_id    TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type        TEXT NOT NULL,
  to_address  TEXT NOT NULL,
  cc          TEXT NOT NULL DEFAULT '',
  devices     INTEGER NOT NULL DEFAULT 0,
  sent_by     TEXT,
  sent_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);