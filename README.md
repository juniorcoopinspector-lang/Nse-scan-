# NSE Scanner

## Run locally
```
npm install
npm run dev
```
Opens at http://localhost:5173

## Build for production
```
npm run build
npm run preview
```
Outputs static files to `dist/`.

## Deploy (free)
Push this folder to a GitHub repo, then either:
- **Vercel**: import the repo at vercel.com/new — it auto-detects Vite, no config needed.
- **Netlify**: import the repo at app.netlify.com — build command `npm run build`, publish directory `dist`.

## About the data proxy
`src/App.jsx` fetches Yahoo Finance through `api.allorigins.win`, a free public CORS proxy.
It works but is not reliable for daily use — it rate-limits and occasionally goes down.
For anything beyond testing, replace it with your own tiny proxy (see below).
