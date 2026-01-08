
# Pastebin-Lite

A small Pastebin-like app built with **Node.js + Express** and **SQLite**.

## Features
- Create a paste and receive a shareable URL
- View pastes via HTML or JSON API
- Optional TTL (expiry) and max view count
- Deterministic time support for testing

## Persistence
- Uses **SQLite** via `better-sqlite3` (file-based, survives restarts)

## Run locally
```bash
npm install
npm start
```
Open:
- Health check: http://localhost:3000/api/healthz
- Create paste (POST): http://localhost:3000/api/pastes

## Notes
- Set `TEST_MODE=1` to enable deterministic expiry using `x-test-now-ms` header.
