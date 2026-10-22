# RNXA Timesheet · Frontend

React 18 + Vite web app for RNXA Timesheet. The API lives in the companion repo **rnxa-timesheet-backend**.

## Run locally

```bash
npm install
npm run dev
```

The dev server proxies `/api` to `http://localhost:4000` (start the backend first).

## Deploy (Vercel)

`vercel.json` builds with Vite and rewrites `/api/*` to the backend on the DigitalOcean droplet, so the browser talks to one origin and session cookies stay first-party. If the backend URL changes, update the rewrite destination.
