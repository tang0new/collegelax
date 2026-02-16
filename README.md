# CollegeLacrosseSchedule.com

Full-stack Astro application for college lacrosse schedules, streaming discovery, rankings, affiliate click tracking, and automated scraping.

## Stack

- Frontend: Astro + React components
- Styling: Tailwind CSS
- Backend: Astro API routes (Node runtime)
- Cache/Analytics: Upstash Redis
- Scraping: Puppeteer with robots.txt checks + retry/backoff
- Scheduling: node-cron (local) + Vercel Cron (production)

## Features

- Automated schedule scraping from LiveSportsOnTV every 12 hours
- Automated NCAA rankings scraping (men/women Top 25) every 24 hours
- Per-game detail scraping on demand for watch options and affiliate redirects
- Affiliate tracking route: `/watch/[platform]/[gameId]` with countdown and click tracking
- Filters: date (Today/Tomorrow/This Week/All), platform, team search, and Fubo-only toggle
- Share game links (`/#game-id`)
- Countdown and live-status indicators
- Odds badge + expanded odds view (The Odds API where available)
- Admin panel for status, manual triggers, analytics, and cache clear
- Responsive ad placeholder zones: 728x90, 300x250, 320x50

## Project Structure

```
src/
  pages/
    index.astro
    rankings.astro
    about.astro
    watch/[platform]/[gameId].astro
    admin/login.astro
    admin/dashboard.astro
    api/
      get-games.ts
      get-rankings.ts
      scrape-games.ts
      scrape-rankings.ts
      game-detail.ts
      track-click.ts
      admin/
        login.ts
        logout.ts
        status.ts
        cache-clear.ts
  components/
    Header.astro
    Footer.astro
    GameCard.tsx
    GameModal.tsx
    ScheduleBoard.tsx
    RankingsTable.tsx
    AdminDashboard.tsx
  layouts/
    Layout.astro
  api/
    get-games.ts
    get-game-detail.ts
    scrape-games.ts
    scrape-rankings.ts
    track-click.ts
  lib/
    redis.ts
    cache-keys.ts
    admin-auth.ts
    rate-limit.ts
    http.ts
    utils.ts
    types.ts
    scrapers/
      livesportsontv.ts
      ncaa-rankings.ts
      odds-api.ts
cron/
  scheduler.ts
public/
  robots.txt
  sw.js
  platform-logos/
```

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set values.

3. Run dev server:

```bash
npm run dev
```

4. (Optional local cron worker):

```bash
npm run scheduler
```

## Environment Variables

- `REDIS_URL`: Upstash REST URL
- `REDIS_TOKEN`: Upstash REST token
- `ADMIN_PASSWORD`: password for `/admin/login`
- `ODDS_API_KEY`: key for The Odds API
- `CRON_SECRET`: optional bearer secret for cron endpoint calls
- `NODE_ENV`: `production` on deploy

## Caching and TTL

- `games:schedule`: 24 hours
- `rankings:mens` / `rankings:womens`: 48 hours
- `games:detail:*`: 12 hours
- `clicks:*`: rolling click counts + recent event log

If scraping fails, API routes serve cached data and report stale mode.

## Scraping Schedule

- Games: every 12 hours (`0 */12 * * *`)
- Rankings: every 24 hours (`0 0 * * *`)

Retry policy: up to 3 attempts with exponential backoff.

## Admin Panel

- URL: `/admin/login` -> `/admin/dashboard`
- Protected by secure HttpOnly cookie after password validation
- Dashboard actions:
  - Trigger games scrape
  - Trigger rankings scrape
  - Clear cache
  - View scraper status
  - View Redis mode/key counts
  - View recent affiliate click events

Admin cannot directly edit scraped data.

## Deployment (Vercel)

1. Create project in Vercel and connect this repo.
2. Add environment variables from `.env.example`.
3. Deploy.
4. Verify Vercel Cron jobs are active for:
   - `/api/scrape-games`
   - `/api/scrape-rankings`

`vercel.json` is included with cron and function settings.

## SEO & Performance

- Shared metadata + Open Graph tags in layout
- `robots.txt` and auto sitemap via Astro sitemap integration
- Mobile-first responsive design
- Image logo assets are lightweight SVGs
- Service worker included (`public/sw.js`) for basic offline caching

## Notes

- All outbound watch actions are routed through `/watch/[platform]/[gameId]` before redirect.
- Scrapers include robots.txt checks and request pacing.
- NCAA and LiveSportsOnTV selectors may require occasional maintenance if source markup changes.
