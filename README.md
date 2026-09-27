# Newz Wave

A responsive news-site prototype with a GNews API proxy, category browsing, search, bookmarks, favourites, theme preference, browser notifications, reader profiles, and an admin publishing form.

GitHub Pages hosts only the static frontend. Authentication, latest-news API, and admin publishing require this Node server to be deployed on a backend host such as Cloud Run; opening the Pages URL alone cannot run `/api/*` routes.

## Run locally

1. Install Node.js 18 or later.
2. Run `npm install`.
3. Optionally set a GNews API key with `$env:GNEWS_API_KEY="your-key"` to use GNews; without it, the server fetches live Google News RSS headlines.
4. Set `$env:ADMIN_API_KEY="your-admin-secret"` before starting the server; publishing stays disabled until configured.
5. Set `$env:SESSION_SECRET` to a random secret of at least 32 characters. Generate one with `node -e "console.log(require('node:crypto').randomBytes(48).toString('base64url'))"`.
6. Run `npm start` and open `http://localhost:3000`.
7. Set `MONGO_URI` to persist accounts and admin-published stories in MongoDB. Without MongoDB, accounts and published stories use memory and are lost when the server restarts.

News is fetched from GNews when a key is configured, or Google News RSS otherwise. If both services are unavailable, the app uses built-in demo headlines. Provider keys stay on the server.

## Google Cloud Run

The project can be deployed from source with the Google Cloud Node.js buildpack; the `.gcloudignore` file excludes local dependencies and environment files. Install the Google Cloud CLI, sign in with `gcloud auth login`, select the exact lowercase Project ID with `gcloud config set project PROJECT_ID`, then deploy to `asia-south1`:

```powershell
gcloud run deploy newz-wave --source . --region asia-south1 --allow-unauthenticated
```

Cloud Run requires billing and may incur charges. Configure `SESSION_SECRET`, `MONGO_URI`, and `ADMIN_API_KEY` in the Cloud Run service's Variables & Secrets settings, not in the source tree. `GNEWS_API_KEY` is optional; without it the live feed uses Google News RSS. Readers can access the site publicly; publishing stays disabled until `ADMIN_API_KEY` is configured, and the key is required in the Admin form. Use a managed MongoDB service for durable accounts across Cloud Run instances.

## Security notes

Passwords are bcrypt-hashed; login uses signed HttpOnly, SameSite cookies. Helmet security headers and rate limits protect auth/news routes. Accounts and article records persist only when MongoDB is configured; in-memory fallback data is lost on restart. Admin publishing is gated by `ADMIN_API_KEY`. Bookmarks, favourites, theme, and notification preferences remain in this browser's local storage. Browser notifications require permission and a running news server to detect new headlines.
