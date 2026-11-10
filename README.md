# Ledger CRM (MVP)

A multi-tenant, customizable CRM with a spreadsheet-style lead table, Kanban board, bulk CSV/Excel import & export, and a **Chrome extension** that drives a compliant call queue through Google Voice.

**Stack:** React 18 · Vite · React Router · Node.js · Express · PostgreSQL · JWT · Zod · libphonenumber-js · Chrome Extension (Manifest V3)

## Features

**Core CRM**
- **Multi-tenant by design** – every business-owned row carries a `company_id`; users sign up with a company and get role-based access (admin / manager / agent).
- **Profiles** – independent workspaces (e.g. "Dispatch", "B2B Outreach"), each with its own custom field layout and records; nothing leaks across profiles.
- **Dynamic fields** – create, edit, delete and drag-reorder columns; manage visibility from a column manager.
- **Records** – table view with sorting, advanced filters, saved filters, drag-and-drop reorder, clone, bulk actions, lead drawer and Kanban board.
- **Import / export** – CSV & Excel import with preview and column mapping; filtered export.
- **Phone handling** – normalization and validation with `libphonenumber-js`.

**Dialer & compliance**
- **Chrome extension (MV3)** with side panel, service worker and a content script for Google Voice.
- **Call queue** – claim next lead, session events, dispositions/outcomes and per-record call activity history.
- **Do-Not-Call list**, dialer profiles, device pairing (with revoke) and agent compliance tables.

**Engineering**
- SQL migrations (`001`–`006`) with a migration runner and performance indexes.
- Centralised error handling, CORS allow-list and JWT auth middleware.

## Project structure

```
backend/
  src/index.js · db.js · migrate.js
  src/routes/      auth · profiles · fields · records · import · export · saved_filters · dialer · extension
  src/migrations/  001_init.sql … 006_extension_queue.sql
frontend/
  src/pages/       Login · Signup · Profiles · ProfileView · Layout
  src/components/  DataTable · KanbanBoard · FilterPanel · LeadDrawer · ImportModal · ColumnManagerModal · …
extension/
  manifest.json · src/ (service-worker · content-script · sidepanel · options)
```

## Getting started

Requirements: Node.js 20+, a PostgreSQL database (local or hosted, e.g. Neon).

```bash
git clone https://github.com/YOUR-GITHUB-USERNAME/crm-mvp-ledger.git
cd crm-mvp-ledger

# Backend
cd backend
npm install
cp .env.example .env      # set DATABASE_URL and JWT_SECRET
npm run migrate
npm run dev               # http://localhost:4000

# Frontend (new terminal)
cd frontend
npm install
npm run dev               # http://localhost:5173
```

**Chrome extension:** open `chrome://extensions` → enable Developer mode → *Load unpacked* → select the `extension/` folder, then set the API URL in its options page.

## Responsible use

The dialer is designed around consent and compliance (Do-Not-Call list, manual dispositions). Follow Google Voice's terms and applicable telemarketing laws.

## License

MIT © YOUR NAME
