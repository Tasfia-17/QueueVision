import React, { useEffect, useState } from 'react';

interface Props { itemId: string | null; }

interface ContextData {
  threadData: any;
  userData: any;
  modHistory: any[];
  modNotes: any[];
  claimData: any;
}

export default function InvestigateView({ itemId }: Props) {
  const [data, setData] = useState<ContextData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activePanel, setActivePanel] = useState<'thread' | 'user' | 'trail'>('thread');
  const [executing, setExecuting] = useState<string | null>(null);
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
  const [undoTimer, setUndoTimer] = useState<number | null>(null);
  const [pendingAction, setPendingAction] = useState<{ macroId: string; label: string } | null>(null);

  useEffect(() => {
    if (!itemId) return;
    setLoading(true);
    setData(null);
    fetch(`/api/context/${itemId}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [itemId]);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  const executeMacro = async (macroId: string, label: string) => {
    // High-risk macros get 3s undo window
    const isHighRisk = ['spam-ban', 'clean-remove'].includes(macroId);
    if (isHighRisk) {
      setPendingAction({ macroId, label });
      const t = window.setTimeout(async () => {
        setPendingAction(null);
        await doExecute(macroId, label);
      }, 3000);
      setUndoTimer(t);
      return;
    }
    await doExecute(macroId, label);
  };

  const doExecute = async (macroId: string, label: string) => {
    setExecuting(macroId);
    try {
      const r = await fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, macroId }),
      });
      const result = await r.json();
      showToast(result.success ? `✅ ${label} executed` : `⚠️ Partial: ${result.errors?.join(', ')}`,
                result.success ? 'success' : 'error');
    } catch {
      showToast('❌ Action failed', 'error');
    }
    setExecuting(null);
  };

  const cancelPending = () => {
    if (undoTimer) clearTimeout(undoTimer);
    setUndoTimer(null);
    setPendingAction(null);
    showToast('↩️ Action cancelled');
  };

  if (!itemId) return (
    <div className="animate-scale-in" style={{
      flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 'var(--spacing-16)', color: '#737373',
    }}>
      <div style={{ fontSize: 48 }}>🔍</div>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-heading-sm)' }}>No item selected</div>
      <div style={{ fontSize: 'var(--text-body-sm)' }}>Pick an item from the Queue tab or tap "Investigate" on a post</div>
    </div>
  );

  return (
    <div style={{ display: 'flex', width: '100%', height: '100%', overflow: 'hidden' }}>

      {/* Left: panels */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRight: '1px solid var(--color-charcoal-border)' }}>
        {/* Panel tabs */}
        <div style={{
          display: 'flex', gap: 'var(--spacing-4)', padding: 'var(--spacing-8) var(--spacing-12)',
          borderBottom: '1px solid var(--color-charcoal-border)', background: 'var(--color-pale-ash)',
          flexShrink: 0,
        }}>
          {(['thread', 'user', 'trail'] as const).map(p => (
            <button key={p} className={`tab-btn ${activePanel === p ? 'active' : ''}`}
              onClick={() => setActivePanel(p)} style={{ fontSize: 'var(--text-caption)' }}>
              {p === 'thread' ? '💬 Thread' : p === 'user' ? '👤 User' : '📋 Trail'}
            </button>
          ))}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-16)' }}>
          {loading ? <PanelSkeleton /> : (
            <>
              {activePanel === 'thread' && <ThreadPanel data={data?.threadData} itemId={itemId} />}
              {activePanel === 'user'   && <UserPanel data={data?.userData} />}
              {activePanel === 'trail'  && <TrailPanel history={data?.modHistory ?? []} notes={data?.modNotes ?? []} />}
            </>
          )}
        </div>
      </div>

      {/* Right: ActionPalette */}
      <div style={{ width: 240, flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          padding: 'var(--spacing-12)', borderBottom: '1px solid var(--color-charcoal-border)',
          fontWeight: 700, fontSize: 'var(--text-body-sm)', background: 'var(--color-pale-ash)',
        }}>
          ⚡ Action Palette
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-12)', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
          {/* Undo banner */}
          {pendingAction && (
            <div className="animate-bounce-in" style={{
              background: 'var(--color-card-saffron)', border: '1px solid #fcd34d',
              borderRadius: 'var(--radius-card)', padding: 'var(--spacing-8)',
              fontSize: 'var(--text-caption)',
            }}>
              <div style={{ fontWeight: 700, marginBottom: 4 }}>⏳ {pendingAction.label}</div>
              <div style={{ marginBottom: 6 }}>Executing in 3s…</div>
              <button className="btn btn-ghost btn-sm" onClick={cancelPending} style={{ width: '100%' }}>
                ↩️ Undo
              </button>
            </div>
          )}

          <MacroGroup label="Quick Actions" color="var(--color-card-mint)">
            <MacroBtn label="✅ Approve" macroId="approve" executing={executing} onExecute={executeMacro} />
            <MacroBtn label="🗑️ Clean Remove" macroId="clean-remove" executing={executing} onExecute={executeMacro} danger />
          </MacroGroup>

          <MacroGroup label="Enforcement" color="var(--color-risk-urgent)">
            <MacroBtn label="🚫 Spam Ban (7d)" macroId="spam-ban" executing={executing} onExecute={executeMacro} danger />
            <MacroBtn label="🔇 Mute User" macroId="mute" executing={executing} onExecute={executeMacro} />
          </MacroGroup>

          <MacroGroup label="Escalate" color="var(--color-card-lavender)">
            <MacroBtn label="⚠️ Warn & Release" macroId="warn-release" executing={executing} onExecute={executeMacro} />
            <MacroBtn label="📌 Add Mod Note" macroId="add-note" executing={executing} onExecute={executeMacro} />
          </MacroGroup>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="animate-slide-right" style={{
          position: 'fixed', bottom: 'var(--spacing-16)', right: 'var(--spacing-16)',
          background: toast.type === 'success' ? 'var(--color-accent-green)' : '#fee2e2',
          border: '1px solid var(--color-charcoal-border)',
          borderRadius: 'var(--radius-card)', padding: 'var(--spacing-8) var(--spacing-16)',
          boxShadow: 'var(--shadow-md)', fontWeight: 700, fontSize: 'var(--text-body-sm)',
          zIndex: 100,
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function MacroGroup({ label, color, children }: { label: string; color: string; children: React.ReactNode }) {
  return (
    <div className="animate-fade-in" style={{
      background: color, border: '1px solid var(--color-charcoal-border)',
      borderRadius: 'var(--radius-card)', padding: 'var(--spacing-8)',
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 'var(--spacing-4)', opacity: 0.6 }}>
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>{children}</div>
    </div>
  );
}

function MacroBtn({ label, macroId, executing, onExecute, danger }: {
  label: string; macroId: string; executing: string | null;
  onExecute: (id: string, label: string) => void; danger?: boolean;
}) {
  const isRunning = executing === macroId;
  return (
    <button
      className={`btn btn-sm ${danger ? 'btn-danger' : 'btn-ghost'}`}
      style={{ width: '100%', justifyContent: 'flex-start' }}
      onClick={() => onExecute(macroId, label)}
      disabled={!!executing}
    >
      {isRunning ? <><span className="spinner" />{label}</> : label}
    </button>
  );
}

function ThreadPanel({ data, itemId }: { data: any; itemId: string }) {
  if (!data) return <Empty msg="No thread data" />;
  const { post, targetComment, parentChain = [], siblings = [], stats } = data;
  return (
    <div className="stagger animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
      {/* Post summary */}
      <div className="card" style={{ background: 'var(--color-card-mint)' }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)', marginBottom: 4 }}>{post?.title}</div>
        <div style={{ fontSize: 'var(--text-caption)', color: '#737373', display: 'flex', gap: 8 }}>
          <span>u/{post?.author}</span>
          <span>·</span><span>⬆ {post?.score}</span>
          <span>·</span><span>💬 {post?.numComments}</span>
          {post?.numReports > 0 && <><span>·</span><span className="badge badge-urgent">⚑ {post.numReports}</span></>}
        </div>
        {stats && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <span className="badge">📊 Density: {(stats.reportDensity * 100).toFixed(1)}%</span>
            <span className="badge">💬 {stats.totalComments} comments</span>
          </div>
        )}
      </div>

      {/* Parent chain */}
      {parentChain.length > 0 && (
        <div>
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, marginBottom: 6, opacity: 0.6 }}>PARENT CHAIN</div>
          {parentChain.map((c: any, i: number) => (
            <CommentBubble key={c.id} comment={c} depth={i} />
          ))}
        </div>
      )}

      {/* Target */}
      {targetComment && (
        <div>
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, marginBottom: 6, color: '#ef4444' }}>REPORTED COMMENT</div>
          <CommentBubble comment={targetComment} highlight />
        </div>
      )}

      {/* Siblings */}
      {siblings.length > 0 && (
        <div>
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, marginBottom: 6, opacity: 0.6 }}>CONTEXT (±3)</div>
          {siblings.map((c: any) => <CommentBubble key={c.id} comment={c} />)}
        </div>
      )}
    </div>
  );
}

function CommentBubble({ comment, depth = 0, highlight }: { comment: any; depth?: number; highlight?: boolean }) {
  return (
    <div className="animate-fade-in" style={{
      marginLeft: depth * 12,
      marginBottom: 6,
      padding: 'var(--spacing-8)',
      borderRadius: 'var(--radius-card)',
      border: `1px solid ${highlight ? '#ef4444' : 'var(--color-charcoal-border)'}`,
      background: highlight ? '#fee2e2' : 'var(--color-canvas-white)',
      boxShadow: highlight ? 'var(--shadow-md)' : 'var(--shadow-sm)',
      fontSize: 'var(--text-caption)',
    }}>
      <div style={{ fontWeight: 700, marginBottom: 2 }}>u/{comment.author}</div>
      <div style={{ lineHeight: 1.5 }}>{comment.body?.slice(0, 200)}{comment.body?.length > 200 ? '…' : ''}</div>
    </div>
  );
}

function UserPanel({ data }: { data: any }) {
  if (!data) return <Empty msg="No user data" />;
  return (
    <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
      {/* Vitals */}
      <div className="card card-shadow animate-fade-in" style={{ background: 'var(--color-card-lavender)' }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-heading-sm)', marginBottom: 8 }}>u/{data.username}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Stat label="Account Age" value={data.accountAge} />
          <Stat label="Total Karma" value={data.totalKarma?.toLocaleString()} />
          <Stat label="Sub Karma" value={`${data.communityKarma?.commentKarma ?? 0} comments`} />
          <Stat label="Sub Posts" value={`${data.communityKarma?.postKarma ?? 0} posts`} />
        </div>
      </div>

      {/* Risk badges */}
      {data.risks?.length > 0 && (
        <div className="animate-fade-in">
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, marginBottom: 6, opacity: 0.6 }}>RISK FLAGS</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.risks.map((r: string) => (
              <span key={r} className="badge badge-urgent animate-bounce-in">{riskLabel(r)}</span>
            ))}
          </div>
        </div>
      )}

      {/* Recent mod actions */}
      {data.recentModActions?.length > 0 && (
        <div className="animate-fade-in">
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, marginBottom: 6, opacity: 0.6 }}>RECENT MOD ACTIONS</div>
          {data.recentModActions.map((a: any, i: number) => (
            <div key={i} className="card animate-fade-in" style={{ marginBottom: 4, fontSize: 'var(--text-caption)', display: 'flex', justifyContent: 'space-between' }}>
              <span className="badge badge-standard">{a.action}</span>
              <span style={{ color: '#737373' }}>by {a.mod} · {timeAgo(a.timestamp)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Mod notes */}
      {data.modNotes?.length > 0 && (
        <div className="animate-fade-in">
          <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, marginBottom: 6, opacity: 0.6 }}>MOD NOTES</div>
          {data.modNotes.map((n: any, i: number) => (
            <div key={i} className="card animate-fade-in" style={{ marginBottom: 4, fontSize: 'var(--text-caption)', background: 'var(--color-card-saffron)' }}>
              <div style={{ fontWeight: 700 }}>{n.label}</div>
              <div>{n.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TrailPanel({ history, notes }: { history: any[]; notes: any[] }) {
  return (
    <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
      <div className="animate-fade-in">
        <div style={{ fontSize: 'var(--text-caption)', fontWeight: 700, marginBottom: 8, opacity: 0.6 }}>ACTION LOG</div>
        {history.length === 0 ? <Empty msg="No actions yet" /> : history.map((a: any, i: number) => (
          <div key={i} className="card animate-fade-in" style={{ marginBottom: 6, fontSize: 'var(--text-caption)', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="badge badge-standard">{a.action}</span>
            <span style={{ flex: 1 }}>u/{a.targetUser}</span>
            <span style={{ color: '#737373' }}>{timeAgo(a.timestamp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: any }) {
  return (
    <div style={{ background: 'rgba(255,255,255,0.6)', borderRadius: 'var(--radius-btn)', padding: 'var(--spacing-8)', border: '1px solid var(--color-charcoal-border)' }}>
      <div style={{ fontSize: 10, opacity: 0.6, fontWeight: 700, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)', marginTop: 2 }}>{value ?? '—'}</div>
    </div>
  );
}

function Empty({ msg }: { msg: string }) {
  return <div style={{ color: '#737373', fontSize: 'var(--text-body-sm)', padding: 'var(--spacing-24)', textAlign: 'center' }}>{msg}</div>;
}

function PanelSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
      {[80, 120, 60, 100].map((h, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 'var(--radius-card)' }} />
      ))}
    </div>
  );
}

function riskLabel(r: string) {
  return { NEW_ACCOUNT: '🆕 New Account', NEGATIVE_COMMUNITY_KARMA: '📉 Neg Karma',
           PREVIOUSLY_BANNED: '🚫 Prior Ban', LOW_KARMA: '⚠️ Low Karma' }[r] ?? r;
}

function timeAgo(ts: number) {
  const d = Date.now() - ts;
  if (d < 60000) return 'just now';
  if (d < 3600000) return `${Math.floor(d/60000)}m ago`;
  if (d < 86400000) return `${Math.floor(d/3600000)}h ago`;
  return `${Math.floor(d/86400000)}d ago`;
}
