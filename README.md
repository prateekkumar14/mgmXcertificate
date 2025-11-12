# Simple Certificate Generator

A minimal Node.js + Express app to generate and download simple certificates. It can work with MongoDB for persistence or fall back to an in-memory store for quick local testing.

## Prerequisites
- Node.js 16+ (14+ may work)
- MongoDB (Local or MongoDB Atlas). Optional for quick local testing.

## Setup
1) Install dependencies

```powershell
npm install
```

2) Configure environment variables

Copy `.env.example` to `.env` and fill in values.

```powershell
Copy-Item .env.example .env
# then edit .env to set SESSION_SECRET and MONGODB_URI (local or Atlas)
```

Examples:
- Local MongoDB
```
MONGODB_URI=mongodb://localhost:27017/simple_certificates
```
- MongoDB Atlas (replace placeholders)
```
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster-host>/simple_certificates?retryWrites=true&w=majority
```

3) Start the server

```powershell
npm start
```

The server runs on http://localhost:3001

- Health: http://localhost:3001/api/health
- Home: http://localhost:3001/
- Generate: http://localhost:3001/login.html
- Download: http://localhost:3001/download.html

## Behavior without MongoDB
If MongoDB is not reachable, the app logs a warning and automatically switches to an in-memory store so you can still generate and download certificates during development. As soon as MongoDB becomes available again, it switches back automatically.

## Troubleshooting
- If `/api/health` returns `mongodb: disconnected`:
  - Ensure your `MONGODB_URI` in `.env` is correct and MongoDB is running / your Atlas IP is allowed.
  - For local MongoDB, make sure the Windows service "MongoDB Server" is started.
- If the site doesn’t open, confirm the server is running and that nothing else is using port 3001.
- On Windows, avoid stopping the server terminal while testing endpoints from the same VS Code integrated terminal.
