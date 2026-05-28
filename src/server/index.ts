import { Hono } from 'hono';
import { redis } from '@devvit/redis';
import { reddit } from '@devvit/reddit';
import { realtime, context } from '@devvit/web/server';

const app = new Hono();

// ── Types ─────────────────────────────────────────────────────────────────────

type UiResponse = {
  navigateTo?: string | { url: string; permalink?: string };
  showToast?: string | { text: string; appearance?: 'neutral' | 'success' };
  showForm?: { name: string; form: any; data?: any };
};

type TriggerResponse = { status: string };
type TaskResponse    = { status: string };

// ── Helpers ───────────────────────────────────────────────────────────────────

function calcRisk(p: { ageDays: number; subKarma: number; banned: boolean; reports: number; automod: boolean }): number {
  let s = 0;
  if (p.ageDays < 1) s += 40; else if (p.ageDays < 7) s += 30; else if (p.ageDays < 30) s += 20; else if (p.ageDays < 90) s += 10;
  if (p.subKarma < 0) s += 20; else if (p.subKarma < 10) s += 10;
  if (p.banned) s += 25;
  if (p.reports > 5) s += 10; else if (p.reports > 2) s += 5;
  if (p.automod) s += 5;
  return Math.min(s, 100);
}

function toBucket(score: number): 'urgent' | 'standard' | 'batch' {
  return score >= 70 ? 'urgent' : score >= 35 ? 'standard' : 'batch';
}

function formatAge(days: number): string {
  if (days < 1) return `${Math.floor(days * 24)}h`;
  if (days < 30) return `${Math.floor(days)}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${Math.floor(days / 365)}y ${Math.floor((days % 365) / 30)}mo`;
}

async function preloadRisk(itemId: string, authorName: string, reports: number, isAutomod = false) {
  const sub = context.subredditName!;
  const [user, karma, log] = await Promise.all([
    reddit.getUserByUsername(authorName).catch(() => null),
    reddit.getUserKarmaFromCurrentSubreddit(authorName).catch(() => ({ fromComments: 0, fromPosts: 0 })),
    reddit.getModerationLog({ subredditName: sub, limit: 20 }).all().catch(() => [] as any[]),
  ]);
  const ageDays = user ? (Date.now() - user.createdAt.getTime()) / 86400000 : 0;
  const subKarma = (karma.fromComments ?? 0) + (karma.fromPosts ?? 0);
  const banned = (log as any[]).some((a: any) => a.target?.author === authorName && a.action === 'banuser');
  const score = calcRisk({ ageDays, subKarma, banned, reports, automod: isAutomod });
  await redis.zAdd('risk:queue', { member: itemId, score });
  await realtime.send('queue-updates', { type: 'new-report', itemId, riskScore: score, bucket: toBucket(score) });
}

// ── Menu handlers ─────────────────────────────────────────────────────────────

app.post('/internal/menu/investigate', async (c) => {
  const body = await c.req.json<{ targetId?: string }>();
  const itemId = body.targetId ?? '';
  return c.json<UiResponse>({ navigateTo: { url: `?itemId=${itemId}` } });
});

app.post('/internal/menu/quick-action', async (c) => {
  const body = await c.req.json<{ targetId?: string }>();
  return c.json<UiResponse>({ navigateTo: { url: `?itemId=${body.targetId ?? ''}&tab=investigate` } });
});

app.post('/internal/menu/settings', async (c) => {
  return c.json<UiResponse>({ navigateTo: { url: '?tab=settings' } });
});

// ── Triggers ──────────────────────────────────────────────────────────────────

app.post('/internal/triggers/post-report', async (c) => {
  const { post } = await c.req.json<any>();
  await preloadRisk(post.id, post.authorName ?? '', post.numReports ?? 1);
  return c.json<TriggerResponse>({ status: 'ok' });
});

app.post('/internal/triggers/comment-report', async (c) => {
  const { comment } = await c.req.json<any>();
  await preloadRisk(comment.id, comment.authorName ?? '', comment.numReports ?? 1);
  return c.json<TriggerResponse>({ status: 'ok' });
});

app.post('/internal/triggers/mod-action', async (c) => {
  const { action, moderator, targetUser } = await c.req.json<any>();
  await redis.hSet('action:log', {
    [Date.now().toString()]: JSON.stringify({
      action: action?.action, targetUser: targetUser?.name,
      mod: moderator?.name, timestamp: Date.now(), itemId: action?.targetFullname,
    }),
  });
  return c.json<TriggerResponse>({ status: 'ok' });
});

app.post('/internal/triggers/post-create',    async (c) => c.json<TriggerResponse>({ status: 'ok' }));
app.post('/internal/triggers/automod-post',   async (c) => {
  const { post } = await c.req.json<any>();
  await preloadRisk(post.id, post.authorName ?? '', 0, true);
  return c.json<TriggerResponse>({ status: 'ok' });
});
app.post('/internal/triggers/automod-comment', async (c) => {
  const { comment } = await c.req.json<any>();
  await preloadRisk(comment.id, comment.authorName ?? '', 0, true);
  return c.json<TriggerResponse>({ status: 'ok' });
});
app.post('/internal/triggers/app-install', async (c) => {
  await redis.set('onboarding:complete', 'false');
  return c.json<TriggerResponse>({ status: 'ok' });
});

// ── API: Queue ────────────────────────────────────────────────────────────────

app.get('/api/queue', async (c) => {
  const entries = await redis.zRange('risk:queue', 0, 49, { by: 'rank', reverse: true });
  const items = await Promise.all(entries.map(async (e) => {
    const itemId = e.member;
    const score = Math.round(e.score);
    const claimRaw = await redis.hGetAll(`claim:${itemId}`).catch(() => null as any);
    try {
      if (itemId.startsWith('t1_')) {
        const comment = await reddit.getCommentById(itemId as `t1_${string}`);
        return { id: itemId, title: (comment.body ?? '[comment]').slice(0, 80), author: comment.authorName ?? '?',
                 type: 'comment', riskScore: score, bucket: toBucket(score),
                 reportCount: 0, claimedBy: claimRaw?.claimedBy, createdAt: comment.createdAt?.getTime() };
      } else {
        const post = await reddit.getPostById(itemId as `t3_${string}`);
        return { id: itemId, title: post.title, author: post.authorName ?? '?',
                 type: 'post', riskScore: score, bucket: toBucket(score),
                 reportCount: 0, claimedBy: claimRaw?.claimedBy, createdAt: post.createdAt?.getTime() };
      }
    } catch { return null; }
  }));
  return c.json({ items: items.filter(Boolean) });
});

// ── API: Context ──────────────────────────────────────────────────────────────

app.get('/api/context/:itemId', async (c) => {
  const { itemId } = c.req.param();
  const sub = context.subredditName!;

  const cached = await redis.get(`ctx:${itemId}`);
  if (cached) return c.json(JSON.parse(cached));

  const isComment = itemId.startsWith('t1_');
  let postId = itemId as `t3_${string}`;
  let targetComment: any = null;
  let authorName = '';

  if (isComment) {
    const comment = await reddit.getCommentById(itemId as `t1_${string}`);
    postId = comment.postId as `t3_${string}`;
    targetComment = comment;
    authorName = comment.authorName ?? '';
  } else {
    const post = await reddit.getPostById(itemId as `t3_${string}`);
    authorName = post.authorName ?? '';
  }

  const [post, comments, user, karma, modNotes, modLog] = await Promise.all([
    reddit.getPostById(postId),
    reddit.getComments({ postId, limit: 100 }).all().catch(() => [] as any[]),
    reddit.getUserByUsername(authorName).catch(() => null),
    reddit.getUserKarmaFromCurrentSubreddit(authorName).catch(() => ({ fromComments: 0, fromPosts: 0 })),
    reddit.getModNotes({ subreddit: sub, user: authorName, limit: 5 }).all().catch(() => [] as any[]),
    reddit.getModerationLog({ subredditName: sub, limit: 20 }).all()
      .then((log: any[]) => log.filter((a: any) => a.target?.author === authorName))
      .catch(() => [] as any[]),
  ]);

  const commentMap = new Map((comments as any[]).map((c: any) => [c.id, c]));
  const parentChain: any[] = [];
  if (targetComment) {
    let cur = targetComment;
    while (cur.parentId?.startsWith('t1_') && parentChain.length < 10) {
      const parent = commentMap.get(cur.parentId.replace('t1_', ''));
      if (!parent) break;
      parentChain.unshift(parent);
      cur = parent;
    }
  }
  const siblings = targetComment
    ? (comments as any[]).filter((c: any) => c.parentId === targetComment.parentId && c.id !== targetComment.id).slice(0, 6)
    : [];

  const ageDays = user ? (Date.now() - user.createdAt.getTime()) / 86400000 : 0;
  const subKarma = (karma.fromComments ?? 0) + (karma.fromPosts ?? 0);
  const risks: string[] = [];
  if (ageDays < 30) risks.push('NEW_ACCOUNT');
  if (subKarma < 0) risks.push('NEGATIVE_COMMUNITY_KARMA');
  if ((modLog as any[]).some((a: any) => a.action === 'banuser')) risks.push('PREVIOUSLY_BANNED');
  if ((user?.commentKarma ?? 0) + (user?.linkKarma ?? 0) < 100) risks.push('LOW_KARMA');

  const result = {
    threadData: {
      post: { id: post.id, title: post.title, author: post.authorName, score: post.score, numComments: 0, numReports: 0 },
      targetComment, parentChain, siblings,
      stats: { reportDensity: 0, totalComments: (comments as any[]).length },
    },
    userData: {
      username: authorName,
      accountAge: formatAge(ageDays),
      totalKarma: (user?.commentKarma ?? 0) + (user?.linkKarma ?? 0),
      communityKarma: { commentKarma: karma.fromComments ?? 0, postKarma: karma.fromPosts ?? 0 },
      risks,
      recentModActions: (modLog as any[]).slice(0, 5).map((a: any) => ({ action: a.action, timestamp: a.createdAt?.getTime?.() ?? 0, mod: a.moderator?.name })),
      modNotes: (modNotes as any[]).slice(0, 5),
    },
    modHistory: (modLog as any[]).slice(0, 10).map((a: any) => ({ action: a.action, targetUser: a.target?.author, timestamp: a.createdAt?.getTime?.() ?? 0 })),
    claimData: await redis.hGetAll(`claim:${itemId}`).catch(() => null),
  };

  await redis.set(`ctx:${itemId}`, JSON.stringify(result));
  await redis.expire(`ctx:${itemId}`, 6 * 3600);
  return c.json(result);
});

// ── API: Claim ────────────────────────────────────────────────────────────────

app.post('/api/claim/:itemId', async (c) => {
  const { itemId } = c.req.param();
  const currentUser = await reddit.getCurrentUsername();
  const existing = await redis.hGetAll(`claim:${itemId}`).catch(() => null as any);
  if (existing?.claimedBy && existing.claimedBy !== currentUser) {
    return c.json({ conflict: true, claimedBy: existing.claimedBy });
  }
  const expiry = Date.now() + 10 * 60 * 1000;
  await redis.hSet(`claim:${itemId}`, { claimedBy: currentUser!, expiresAt: String(expiry) });
  await redis.expire(`claim:${itemId}`, 600);
  await redis.zAdd('claim:active', { member: itemId, score: expiry });
  await realtime.send('mod-claims', { type: 'claimed', itemId, by: currentUser ?? 'unknown' });
  return c.json({ success: true });
});

// ── API: Action ───────────────────────────────────────────────────────────────

const MACROS: Record<string, Array<{ type: string; [k: string]: any }>> = {
  'approve':      [{ type: 'approve' }],
  'clean-remove': [{ type: 'remove', isSpam: false }, { type: 'addModNote', label: 'REMOVAL', note: 'Removed via QueueVision' }],
  'spam-ban':     [{ type: 'remove', isSpam: true }, { type: 'ban', duration: 7, reason: 'Spam', message: 'Removed for spam.' }, { type: 'addModNote', label: 'BAN', note: '7d spam ban' }],
  'warn-release': [{ type: 'approve' }, { type: 'addModNote', label: 'APPROVE', note: 'Approved with warning' }],
  'mute':         [{ type: 'mute' }, { type: 'addModNote', label: 'MUTE', note: 'Muted via QueueVision' }],
  'add-note':     [{ type: 'addModNote', label: 'NOTE', note: 'Flagged for review' }],
};

app.post('/api/action', async (c) => {
  const { itemId, macroId } = await c.req.json<{ itemId: string; macroId: string }>();
  const sub = context.subredditName!;
  const steps = MACROS[macroId] ?? [];
  const executed: string[] = [], errors: string[] = [];

  let authorName = '';
  try {
    if (itemId.startsWith('t1_')) {
      const comment = await reddit.getCommentById(itemId as `t1_${string}`);
      authorName = comment.authorName ?? '';
    } else {
      const post = await reddit.getPostById(itemId as `t3_${string}`);
      authorName = post.authorName ?? '';
    }
  } catch {}

  for (const step of steps) {
    try {
      switch (step.type) {
        case 'remove':      await reddit.remove(itemId as any, step.isSpam ?? false); break;
        case 'approve':     await reddit.approve(itemId as any); break;
        case 'ban':         await reddit.banUser({ subredditName: sub, username: authorName, duration: step.duration, reason: step.reason, message: step.message }); break;
        case 'mute':        await reddit.muteUser({ subredditName: sub, username: authorName }); break;
        case 'addModNote':  await reddit.addModNote({ subreddit: sub, user: authorName, label: step.label, note: step.note }); break;
      }
      executed.push(step.type);
    } catch (e: any) { errors.push(`${step.type}: ${e.message}`); }
  }

  await redis.hSet('action:log', { [Date.now().toString()]: JSON.stringify({ macroId, itemId, executed, errors, timestamp: Date.now() }) });
  await realtime.send('mod-actions', { type: 'action', itemId, macroId, executed });
  await redis.del(`ctx:${itemId}`);

  return c.json({ success: errors.length === 0, executed, errors });
});

// ── API: Config ───────────────────────────────────────────────────────────────

app.get('/api/config', async (c) => {
  const raw = await redis.get('config:app').catch(() => null);
  return c.json(raw ? JSON.parse(raw) : { macros: [], thresholds: { urgent: 70, standard: 35 } });
});

app.post('/api/config', async (c) => {
  const body = await c.req.json();
  await redis.set('config:app', JSON.stringify(body));
  return c.json({ success: true });
});

// ── Schedulers ────────────────────────────────────────────────────────────────

app.post('/internal/scheduler/claim-timeout', async (c) => {
  const now = Date.now();
  const expired = await redis.zRange('claim:active', 0, now, { by: 'score' });
  for (const item of expired) {
    await redis.del(`claim:${item.member}`);
    await redis.zRem('claim:active', [item.member]);
    await realtime.send('mod-claims', { type: 'expired', itemId: item.member });
  }
  return c.json<TaskResponse>({ status: 'ok' });
});

app.post('/internal/scheduler/daily-cleanup', async (c) => {
  await redis.zRemRangeByRank('risk:queue', 0, -501);
  return c.json<TaskResponse>({ status: 'ok' });
});

app.post('/internal/scheduler/mod-team-sync', async (c) => {
  const sub = context.subredditName!;
  const mods = await reddit.getModerators({ subredditName: sub }).all().catch(() => [] as any[]);
  await redis.set('config:mod-team', JSON.stringify((mods as any[]).map((m: any) => m.username)));
  return c.json<TaskResponse>({ status: 'ok' });
});

// ── Forms ─────────────────────────────────────────────────────────────────────

app.post('/internal/forms/macro-builder', async (c) => c.json<UiResponse>({ showToast: { text: 'Macro saved!', appearance: 'success' } }));
app.post('/internal/forms/claim-note',    async (c) => c.json<UiResponse>({ showToast: { text: 'Note added', appearance: 'success' } }));

export default app;
