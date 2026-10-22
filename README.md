# RNXA Timesheet · Frontend

React 18 + Vite web app for RNXA Timesheet. The API lives in the companion repo **rnxa-timesheet-backend**.

## Run locally

```bash
npm install
npm run dev
```

The dev server proxies `/api` to `http://localhost:4000` (start the backend first).

## Deploy

The app runs on the DigitalOcean droplet at https://192-34-58-236.sslip.io, which serves this frontend and the API from one origin (see `deploy/` in the main project).

`vercel.json` only redirects the old address, rnxa-timesheet.vercel.app, to the droplet. The redirect is temporary (307), so it can be pointed at a custom domain later.
