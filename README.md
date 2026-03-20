# Quiz Game

A multiplayer trivia web app built with **Next.js** (App Router), **React 19**, and **Tailwind CSS**. Hosts create a room; players join on their phones or laptops using a short room code or share link. Questions are loaded from the public [Open Trivia Database](https://opentdb.com/) API, with optional logo and sound rounds layered on top of the main quiz.

## What it does

- **Host flow**: choose your name, pick **individual** or **teams** mode, and configure the round (question count, difficulty, optional single category, category exclusions, per-question time limit, optional logo/sound extras, team sizes when in teams mode). Creating a game stores session state server-side and sends you to `/game/[roomCode]`.
- **Join flow**: enter the **game ID or room code** plus your name, or use a **recovery code** to reclaim the same seat on another device after `localStorage` was cleared or you switched browsers.
- **Realtime-ish play**: game state (players, teams, scores, current question) lives in **Upstash Redis** via REST (`KV_REST_API_URL` and `KV_REST_API_TOKEN`). API routes under `src/app/api/game/` read and update that state. **Local development** falls back to an in-memory mock when those variables are absent, so you can run the UI without a Redis account (multiplayer will not persist across restarts or scale beyond one process).

The UI uses **Radix UI** primitives and **lucide-react** icons; share UI can generate QR codes (`qrcode`) for joining.

## Prerequisites

- Node.js 20+ (matches typical Next.js 16 requirements)
- npm (or another package manager — adjust commands accordingly)

For production or multi-instance hosting, configure Upstash (or compatible Redis with the same env contract used in `src/lib/kv.ts`).

## Environment variables

| Variable | Required | Purpose |
| -------- | -------- | ------- |
| `KV_REST_API_URL` | Production | Upstash Redis REST URL |
| `KV_REST_API_TOKEN` | Production | Upstash Redis REST token |
| `ALLOW_MOCK_KV` | Optional | Set to `true` in production only if you intentionally accept mock KV (not recommended for real multiplayer) |

Set variables in Vercel **Settings → Environment Variables**, or create a local `.env.local` (ignored by git via `.gitignore`).

## Scripts

```bash
npm install
npm run dev    # Next dev with Turbopack
npm run build  # Production build
npm run start  # Start production server
npm run lint   # ESLint
```

Open [http://localhost:3000](http://localhost:3000) after `npm run dev`.

## Deploy

The repo includes `vercel.json` with a longer `maxDuration` for API routes. Deploy on [Vercel](https://vercel.com) (or any Node host): set the KV variables above so rooms and scores persist correctly.

## Project layout (high level)

- `src/app/page.tsx` — landing: create or join
- `src/app/game/[gameId]/page.tsx` — lobby, team setup, and in-game experience
- `src/app/api/game/**` — create, join, answer, advance question, teams
- `src/services/trivia-api.ts` — Open Trivia DB client
- `src/lib/game-room.ts` / `src/lib/kv.ts` — room codes and storage

## License

Private package (`"private": true` in `package.json`). Add a license file if you open-source the project.
