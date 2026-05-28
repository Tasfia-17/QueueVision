# QueueVision

**Mobile-first moderation intelligence for Reddit**

Built for the Reddit Mod Tools & Migrated Apps Hackathon 2026.

---

## The Problem

Reddit's native modqueue on mobile shows a title and a report reason. That's it. No thread context, no user history, no team coordination. Moderators are expected to make consequential decisions - remove, ban, approve - with almost no information.

This causes three concrete problems:

1. **Wrong calls** - without knowing the conversation context or the author's history, mods approve content they should remove and remove content they should approve.
2. **Mod collisions** - two mods act on the same item at the same time. One approves, one removes. No coordination layer exists to prevent this.
3. **Slow triage** - getting enough context to make a confident decision requires opening the post, checking the user profile, and reviewing mod notes across separate tabs. A 30-second decision takes 5 minutes.

---

## What QueueVision Does

QueueVision is a Devvit app that opens as a full-screen webview from any post or comment menu. It gives moderators everything they need to make a decision in one place, with one-tap actions to execute it.

---

## Features

### SmartQueue - Risk-scored priority queue

When a post or comment is reported or filtered by AutoMod, QueueVision computes a risk score (0-100) using:

- Account age: <1 day = +40, <7 days = +30, <30 days = +20, <90 days = +10
- Community karma: negative = +20, under 10 = +10
- Prior ban in subreddit: +25
- Report count: >5 reports = +10, >2 reports = +5
- AutoMod flag: +5

Items are bucketed into **Urgent** (70+), **Standard** (35-69), or **Batch** (<35) and sorted by score. The queue tab shows all 50 most recent items with filter buttons per bucket. Risk thresholds are configurable in Settings.

### ThreadRecon - Full conversation context

Opens the full thread for any reported item:
- The post title, author, score, and comment count
- The parent comment chain (up to 10 levels) leading to the reported comment
- The reported comment highlighted in red
- Up to 6 sibling comments for surrounding context
- Total comment count and report density

All fetched in parallel from the Reddit API with a 6-hour Redis cache per item.

### UserRadar - Inline user intelligence

Displayed alongside the thread without any navigation:
- Account age (formatted as hours/days/months/years)
- Total karma (comment + link)
- Community-specific karma (comments and posts separately)
- Last 5 mod actions taken against this user in the subreddit
- Last 5 mod notes on this user
- Risk flags: NEW_ACCOUNT (<30 days), NEGATIVE_COMMUNITY_KARMA, PREVIOUSLY_BANNED, LOW_KARMA (<100 total karma)

### ActionPalette - One-tap macro workflows

Six built-in macros, each executing multiple Reddit API calls in sequence:

| Macro | Steps |
|---|---|
| Approve | approve |
| Clean Remove | remove (not spam) + addModNote (REMOVAL) |
| Spam Ban (7d) | remove (spam) + ban (7 days, reason: Spam) + addModNote (BAN) |
| Warn & Release | approve + addModNote (APPROVE) |
| Mute User | mute + addModNote (MUTE) |
| Add Mod Note | addModNote (NOTE) |

High-risk macros (Spam Ban, Clean Remove) show a 3-second undo banner before executing. Every action is logged to Redis with timestamp, moderator, item ID, and which steps succeeded or failed.

### ClaimLock - Team coordination

Before acting on an item, a mod claims it. The claim:
- Stores the moderator's username and a 10-minute expiry in Redis
- Broadcasts a `claimed` event to all connected mods via Devvit realtime channel `mod-claims`
- Blocks other mods from claiming the same item (returns `conflict: true` with the claimer's name)
- Shows a lock badge on the item in the queue view in real time

A scheduler runs every 5 minutes to expire stale claims and broadcast `expired` events.

### ModTrail - Audit log

Every mod action (from the ActionPalette and from Reddit's own `onModAction` trigger) is written to a Redis hash `action:log` with action type, target user, moderator, timestamp, and item ID. The Trail panel in InvestigateView shows the last 10 actions on the current item.

---

## Architecture

```
Reddit event (report / AutoMod filter / mod action)
  |
  v
Devvit trigger -> Hono server endpoint
  |
  +-- calcRisk() -> redis.zAdd('risk:queue', score)
  +-- realtime.send('queue-updates', ...)
  
Mod opens "Investigate with QueueVision" (post/comment menu)
  |
  v
Devvit webview -> React app (Vite build, served from public/)
  |
  v
App reads ?itemId from URL params -> switches to Investigate tab
  |
  v
GET /api/context/:itemId
  |
  +-- reddit.getPostById / getCommentById
  +-- reddit.getComments (up to 100, builds parent chain + siblings)
  +-- reddit.getUserByUsername
  +-- reddit.getUserKarmaFromCurrentSubreddit
  +-- reddit.getModNotes
  +-- reddit.getModerationLog (filtered to this user)
  +-- redis.get('ctx:{itemId}') -> cache hit returns immediately
  +-- redis.set('ctx:{itemId}', result, TTL 6h) on miss

POST /api/claim/:itemId
  |
  +-- reddit.getCurrentUsername()
  +-- redis.hGetAll('claim:{itemId}') -> conflict check
  +-- redis.hSet + redis.expire (600s)
  +-- realtime.send('mod-claims', { type: 'claimed', ... })

POST /api/action { itemId, macroId }
  |
  +-- Looks up MACROS[macroId] -> array of steps
  +-- Executes each step: approve / remove / ban / mute / addModNote
  +-- redis.hSet('action:log', ...) 
  +-- realtime.send('mod-actions', ...)
  +-- redis.del('ctx:{itemId}') -> invalidates cache
```

**Scheduled tasks:**
- `claim-timeout` (every 5 min): expires stale claims from `claim:active` sorted set
- `daily-cleanup` (2am): trims `risk:queue` to 500 items
- `mod-team-sync` (every 6h): refreshes mod team list in Redis

**Realtime channels:**
- `queue-updates` - new items entering the queue with risk score
- `mod-claims` - claim and expiry events
- `mod-actions` - action execution events

**Frontend routing:**
- URL param `?itemId=` on load switches directly to Investigate tab
- URL param `?tab=settings` opens Settings tab
- `postMessage` from Devvit host with `type: 'claim-update'` updates queue item state in real time

---

## Tech Stack

| Layer | Technology |
|---|---|
| Platform | Devvit 0.13 |
| Server | Hono (Node.js), TypeScript |
| Frontend | React 18, TypeScript, Vite |
| Database | Redis (Devvit managed, 500MB) |
| Realtime | Devvit realtime channels |
| Reddit API | @devvit/reddit |
| Design | Brainfish design system, Satoshi font |

---

## Project Structure

```
QueueVision/
|- devvit.json                   # Triggers, menu items, scheduler, forms, permissions
|- package.json
|- vite.config.ts                # Root: public/, output: dist/public/
|- tsconfig.server.json
|- assets/
|  `- icon.svg
|- landing/
|  `- index.html                 # Static landing page (no build step)
|- public/                       # Devvit webview root
|  |- index.html
|  `- src/
|     |- main.tsx
|     |- App.tsx                 # Tab routing, URL param handling, realtime listener
|     |- design.css              # Brainfish tokens, animations, component styles
|     `- views/
|        |- QueueView.tsx        # Risk-scored list, bucket filter, claim button
|        |- InvestigateView.tsx  # ThreadRecon + UserRadar + ActionPalette + ModTrail
|        `- SettingsView.tsx     # Threshold sliders, macro list, save to /api/config
`- src/server/
   `- index.ts                   # All Hono routes: triggers, menu, API, scheduler, forms
```

---

## Event Triggers

Configured in `devvit.json`, handled in `src/server/index.ts`:

| Trigger | Handler | What it does |
|---|---|---|
| `onPostReport` | `/internal/triggers/post-report` | Computes risk score, adds to queue |
| `onCommentReport` | `/internal/triggers/comment-report` | Computes risk score, adds to queue |
| `onModAction` | `/internal/triggers/mod-action` | Logs action to audit trail |
| `onPostCreate` | `/internal/triggers/post-create` | No-op (reserved) |
| `onAutomoderatorFilterPost` | `/internal/triggers/automod-post` | Computes risk score with automod flag |
| `onAutomoderatorFilterComment` | `/internal/triggers/automod-comment` | Computes risk score with automod flag |
| `onAppInstall` | `/internal/triggers/app-install` | Sets onboarding flag in Redis |

---

## Menu Items

| Label | Location | Opens |
|---|---|---|
| Investigate with QueueVision | post, comment | Webview with `?itemId=` pre-set |
| Quick Action | post, comment | Webview with `?itemId=&tab=investigate` |
| QueueVision Settings | subreddit | Webview with `?tab=settings` |

---

## Installation

### Prerequisites

- Reddit account with moderator access to a subreddit
- Node.js 18+
- Devvit CLI: `npm install -g devvit`

### Steps

```bash
git clone https://github.com/Tasfia-17/QueueVision.git
cd QueueVision
npm install
npm run build
devvit login
devvit upload
devvit install <your-subreddit>
```

### Development

```bash
npm run dev
# In another terminal:
devvit playtest <your-subreddit>
```

`devvit playtest` hot-reloads on save and streams server logs to the terminal.

---

## Configuration

In the Settings tab:

- **Urgent threshold** (default 70): items scoring at or above this are Urgent
- **Standard threshold** (default 35): items scoring at or above this are Standard, below is Batch
- Thresholds are saved to Redis via `POST /api/config` and persist across sessions

---

## Troubleshooting

**App won't load**
```bash
devvit logs <subreddit>
```

**Queue is empty after install**
The queue populates when items are reported or filtered by AutoMod. Submit a test post and report it to trigger the flow.

**Context not loading**
Check Reddit API rate limits. Clear the cache for a specific item by deleting `ctx:{itemId}` from Redis.

**Claim not broadcasting**
Verify `realtime: true` is set under permissions in `devvit.json`.

---

## License

Apache 2.0

## Acknowledgments

- Reddit Devvit team for the platform and documentation
- Brainfish design system for visual inspiration
- Satoshi font by Indian Type Foundry
