import React, { useEffect, useState } from 'react';

interface QueueItem {
  id: string;
  title: string;
  author: string;
  type: 'post' | 'comment';
  riskScore: number;
  bucket: 'urgent' | 'standard' | 'batch';
  reportCount: number;
  claimedBy?: string;
  isAutomod?: boolean;
  createdAt: number;
}

interface Props {
  onInvestigate: (itemId: string) => void;
  claimEvents: any[];
}

export default function QueueView({ onInvestigate, claimEvents }: Props) {
  const [items, setItems] = useState<QueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'urgent' | 'standard' | 'batch'>('all');
  const [claiming, setClaiming] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/queue')
      .then(r => r.json())
      .then(d => { setItems(d.items ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Apply realtime claim updates
  useEffect(() => {
    if (!claimEvents.length) return;
    const ev = claimEvents[0];
    setItems(prev => prev.map(item =>
      item.id === ev.itemId
        ? { ...item, claimedBy: ev.type === 'claimed' ? ev.by : undefined }
        : item
    ));
  }, [claimEvents]);

  const claim = async (itemId: string) => {
    setClaiming(itemId);
    await fetch(`/api/claim/${itemId}`, { method: 'POST' });
    setClaiming(null);
    onInvestigate(itemId);
  };

  const filtered = filter === 'all' ? items : items.filter(i => i.bucket === filter);

  const bucketCounts = {
    urgent:   items.filter(i => i.bucket === 'urgent').length,
    standard: items.filter(i => i.bucket === 'standard').length,
    batch:    items.filter(i => i.bucket === 'batch').length,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: '100%', overflow: 'hidden' }}>
      {/* Stats bar */}
      <div className="animate-fade-in" style={{
        display: 'flex', gap: 'var(--spacing-12)', padding: 'var(--spacing-12) var(--spacing-16)',
        borderBottom: '1px solid var(--color-charcoal-border)', background: 'var(--color-pale-ash)',
        flexShrink: 0,
      }}>
        {(['all', 'urgent', 'standard', 'batch'] as const).map(b => (
          <button key={b} onClick={() => setFilter(b)} className="btn btn-sm" style={{
            background: filter === b ? 'var(--color-accent-green)' : 'var(--color-canvas-white)',
            fontWeight: filter === b ? 700 : 500,
          }}>
            {b === 'all' ? `All (${items.length})` :
             b === 'urgent' ? `🔴 Urgent (${bucketCounts.urgent})` :
             b === 'standard' ? `🟡 Standard (${bucketCounts.standard})` :
             `🟢 Batch (${bucketCounts.batch})`}
          </button>
        ))}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-16)' }}>
        {loading ? (
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
            {[1,2,3,4].map(i => (
              <div key={i} className="skeleton animate-fade-in" style={{ height: 72, borderRadius: 'var(--radius-card)' }} />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="animate-scale-in" style={{ textAlign: 'center', padding: 'var(--spacing-64)', color: '#737373' }}>
            <div style={{ fontSize: 40, marginBottom: 'var(--spacing-12)' }}>✅</div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-heading-sm)' }}>Queue is clear</div>
            <div style={{ fontSize: 'var(--text-body-sm)', marginTop: 4 }}>No items in this bucket</div>
          </div>
        ) : (
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
            {filtered.map((item, i) => (
              <QueueCard
                key={item.id}
                item={item}
                onInvestigate={() => onInvestigate(item.id)}
                onClaim={() => claim(item.id)}
                claiming={claiming === item.id}
                style={{ animationDelay: `${i * 40}ms` }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QueueCard({ item, onInvestigate, onClaim, claiming, style }: {
  item: QueueItem; onInvestigate: () => void; onClaim: () => void;
  claiming: boolean; style?: React.CSSProperties;
}) {
  const bucketColor = {
    urgent:   'var(--color-risk-urgent)',
    standard: 'var(--color-risk-standard)',
    batch:    'var(--color-risk-batch)',
  }[item.bucket];

  return (
    <div className="card card-shadow animate-fade-in" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--spacing-12)',
      borderLeft: `3px solid ${item.bucket === 'urgent' ? '#ef4444' : item.bucket === 'standard' ? '#f59e0b' : '#10b981'}`,
      background: item.claimedBy ? 'var(--color-card-mint)' : 'var(--color-canvas-white)',
      transition: 'background 0.3s ease',
      ...style,
    }}>
      {/* Risk score circle */}
      <div style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        background: bucketColor, border: '1px solid var(--color-charcoal-border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontWeight: 700, fontSize: 'var(--text-caption)',
        boxShadow: 'var(--shadow-sm)',
      }}>
        {item.riskScore}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 'var(--text-body-sm)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {item.title}
        </div>
        <div style={{ fontSize: 'var(--text-caption)', color: '#737373', marginTop: 2, display: 'flex', gap: 'var(--spacing-8)', alignItems: 'center' }}>
          <span>u/{item.author}</span>
          <span>·</span>
          <span>{item.type}</span>
          {item.reportCount > 0 && <><span>·</span><span>⚑ {item.reportCount}</span></>}
          {item.isAutomod && <span className="badge badge-new" style={{ fontSize: 10 }}>AutoMod</span>}
        </div>
      </div>

      {/* Claim badge */}
      {item.claimedBy && (
        <span className="badge badge-claimed animate-bounce-in">
          🔒 {item.claimedBy}
        </span>
      )}

      {/* Actions */}
      <div style={{ display: 'flex', gap: 'var(--spacing-4)', flexShrink: 0 }}>
        <button className="btn btn-ghost btn-sm" onClick={onInvestigate}>🔍</button>
        <button className="btn btn-primary btn-sm" onClick={onClaim} disabled={claiming || !!item.claimedBy}>
          {claiming ? <span className="spinner" /> : '⚡ Claim'}
        </button>
      </div>
    </div>
  );
}
