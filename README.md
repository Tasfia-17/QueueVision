# QueueVision

**Mobile-first moderation intelligence for Reddit**

Built for the Reddit Mod Tools & Migrated Apps Hackathon 2026.

---

## The Problem

Over 60% of Reddit moderators use mobile as their primary device. The native modqueue gives them almost nothing to work with: a title, a report reason, and two buttons. No thread context, no user history, no team coordination.

This leads to real consequences:

- **Wrong decisions** - mods approve or remove without knowing the full conversation or the user's history
- **Mod collisions** - two mods act on the same item simultaneously, producing contradictory outcomes
- **Slow triage** - every decision requires opening the post, checking the profile, and reviewing mod notes in separate tabs - a 30-second call takes 5 minutes
- **No prioritization** - urgent spam sits next to low-risk off-topic posts with no visual distinction

QueueVision fixes all of this.

---

## What It Does

QueueVision is a Devvit app that replaces the modqueue experience with a full-context decision cockpit. It surfaces everything a moderator needs to make a confident call - thread context, user history, risk score, team coordination - in a single mobile-optimized view.

### ThreadRecon

Full conversation context loaded automatically: the parent comment chain, the reported item highlighted, sibling comments for context, post stats, and report density. No tab-switching.

### UserRadar

Inline user intelligence card: account age, total karma, community-specific karma, prior mod actions in the subreddit, mod notes, and risk flags (new account, negative karma, prior ban).

### ActionPalette

One-tap macros for the most common moderation workflows: Approve, Clean Remove, Spam Ban (7d), Mute User, Warn & Release, Add Mod Note. High-risk actions (ban, remove) show a 3-second undo window before executing.

### ClaimLock

Claim an item before acting. Realtime pub/sub broadcasts claim status to all mods. Teammates see who is handling what, eliminating duplicate work and contradictory decisions.

### SmartQueue

Risk scoring algorithm buckets every item into Urgent / Standard / Batch based on report count, account age, karma signals, and AutoMod flags. Urgent items surface to the top automatically.

### ModTrail

Full audit log of every action taken on an item - who did what and when. Accountability for the team, context for the next mod who picks it up.

---

## How It Works

```
Item reported or AutoMod flagged
  |
  v
Risk score computed (report count + account signals + content flags)
  |
  v
Mod opens "Investigate with QueueVision" from post/comment menu
  |
  v
Full-screen webview: ThreadRecon + UserRadar + ActionPalette load in parallel
  |
  v
Mod claims item (broadcasts to team via realtime channel)
  |
  v
One-tap macro executes -> ModTrail records action
```

**Stack:**
- Frontend: React 18, TypeScript, Vite, Brainfish design system
- Backend: Hono (Node.js), Devvit 0.13
- Data: Redis (500MB), Reddit API
- Realtime: Devvit realtime channels

---

## Quick Start

### Prerequisites

- Reddit account with moderator access to a test subreddit
- Node.js 18+
- Devvit CLI: `npm install -g devvit`

### Install

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

---

## Usage

1. Go to any post or comment in your subreddit
2. Tap "..." -> "Investigate with QueueVision"
3. Review thread context, user history, and risk score
4. Claim the item to signal your team
5. Tap a macro to act - or use the Queue tab to triage the full list

---

## Project Structure

```
QueueVision/
|- devvit.json              # Triggers, menu items, scheduler, permissions
|- landing/
|  `- index.html            # Landing page
|- public/
|  |- index.html
|  `- src/
|     |- App.tsx            # Main app shell with tab routing
|     |- design.css         # Brainfish design system
|     `- views/
|        |- QueueView.tsx       # Risk-scored queue with claim/filter
|        |- InvestigateView.tsx # ThreadRecon + UserRadar + ActionPalette
|        `- SettingsView.tsx    # Macro config + risk thresholds
`- src/server/
   `- index.ts              # Hono server: all API endpoints + event triggers
```

---

## Configuration

All thresholds and macros are configurable in the Settings tab:

- **Risk thresholds**: Urgent (70+), Standard (35+), Batch (below 35)
- **Macros**: Customize labels and action sequences per workflow

---

## Hackathon Criteria

| Criterion | Implementation |
|---|---|
| Community Impact | Eliminates context-lookup tab-switching, saves ~5 min per complex moderation decision |
| Polish | Brainfish design system, skeleton loaders, toast notifications, 3s undo for destructive actions |
| Reliable UX | Zero config on install, offline-ready Redis caching, realtime team coordination |
| Ecosystem Impact | First mobile-native mod intelligence layer - brings 5 desktop-only features to mobile |

---

## Troubleshooting

**App won't load**
```bash
devvit logs <subreddit>
```

**Context not loading**
- Check Reddit API rate limits
- Clear Redis cache: delete `ctx:*` keys

**Realtime not working**
- Verify `realtime: true` in `devvit.json` permissions
- Check browser console for WebSocket errors

---

## License

Apache 2.0

## Acknowledgments

- Brainfish design system inspiration
- Reddit Devvit team for the platform
- Satoshi font by Indian Type Foundry
