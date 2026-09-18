# FindJobs
A **pure client-side, zero-key** live-job search SPA for freshers and engineers. No backend, no serverless functions, no API keys — just static files.

Run `node dev-server.js`, then open http://localhost:3000. (The dev server is only for local preview; the app itself is 100% static and works from any static host.)

## How it works
`js/sources.js` fetches **directly from the browser** (all endpoints are public and send `Access-Control-Allow-Origin: *`):

| Source | Endpoint |
|---|---|
| RemoteOK | `https://remoteok.com/api` |
| Remotive | `https://remotive.com/api/remote-jobs` |
| Arbeitnow | `https://www.arbeitnow.com/api/job-board-api?search=…&page=1` |
| Greenhouse (Stripe, Airbnb, Vercel, Notion) | `https://boards-api.greenhouse.io/v1/boards/{board}/jobs` |
| Ashby (Ramp, Ashby, Linear) | `https://api.ashbyhq.com/posting-api/job-board/{board}` |

`js/api.js` aggregates them in parallel with a 15-second per-source timeout, isolated failure handling, a normalized job schema, dedup, filtering (query, location, category, work mode, job type, experience), sorting (newest / relevance), pagination, and a 10-minute in-memory per-source cache.

**Job detail** is lazy: Greenhouse list responses are fetched *without* content (~400 KB instead of ~5 MB) and the full description is pulled per-job from `…/boards/{board}/jobs/{id}` when you open a job. Ashby/RemoteOK/Remotive/Arbeitnow carry descriptions in the list.

> **Workday is not included**: it requires a POST and sends no CORS headers, so it cannot be called from a browser. (It works from a serverless function — see the earlier server-based build if you ever want it back.)

The frontend is vanilla JS plus Bootstrap CDN. Resumes are parsed **locally** with pdf.js / Mammoth / text parsing and stored in browser `localStorage`. Matching uses the deterministic matching engine (`js/job_matcher.js`); no external AI or API key is used. Saved jobs are also browser-local.

## Add sources or companies
Edit `js/sources.js`: add a fetcher/normalizer and register it in `fns`. Change `GREENHOUSE_BOARDS` / `ASHBY_BOARDS` to add more public company boards. Keep fetches keyless and error-isolated.

## Deploy
It's a static site — drag the folder onto **Vercel**, Netlify, GitHub Pages, Cloudflare Pages, or any static host. No `npm install`, no build step, no environment variables. Hash-based routing means no server rewrites are needed.