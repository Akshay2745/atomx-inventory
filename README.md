# InventoryX

Inventory and event device tracking for AtomX.

## Requirements

- Node.js (LTS version)
- PostgreSQL

## Setup

1. Install packages: `npm install`
2. Create a PostgreSQL user and database named `inventoryx`.
3. Copy `.env.example` to `.env` and fill in the real values.
4. Start the server: `npm start`
5. Open the address in a browser. The first visit asks you to create the admin account.

## Backups

Back up the database regularly with `pg_dump`, and test restoring with `pg_restore`.