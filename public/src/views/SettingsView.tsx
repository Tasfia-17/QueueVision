import React, { useEffect, useState } from 'react';

interface Macro { id: string; label: string; steps: string[]; color: string; }

export default function SettingsView() {
  const [macros, setMacros] = useState<Macro[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [thresholds, setThresholds] = useState({ urgent: 70, standard: 35 });

  useEffect(() => {
    fetch('/api/config')
      .then(r => r.json())
      .then(d => {
        setMacros(d.macros ?? DEFAULT_MACROS);
        if (d.thresholds) setThresholds(d.thresholds);
      })
      .catch(() => setMacros(DEFAULT_MACROS));
  }, []);

  const save = async () => {
    setSaving(true);
    await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ macros, thresholds }),
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--spacing-24)' }}>
      <div className="animate-fade-in" style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 'var(--spacing-24)' }}>

        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 'var(--text-heading)' }}>Settings</div>
            <div style={{ fontSize: 'var(--text-body-sm)', color: '#737373' }}>Configure macros and risk thresholds</div>
          </div>
          <button className="btn btn-primary" onClick={save} disabled={saving}>
            {saving ? <><span className="spinner" />Saving…</> : saved ? '✅ Saved!' : '💾 Save'}
          </button>
        </div>

        {/* Risk thresholds */}
        <div className="card card-shadow animate-fade-in" style={{ background: 'var(--color-card-mint)' }}>
          <div style={{ fontWeight: 700, marginBottom: 'var(--spacing-16)' }}>🎯 Risk Thresholds</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-12)' }}>
            <ThresholdSlider label="🔴 Urgent above" value={thresholds.urgent}
              onChange={v => setThresholds(p => ({ ...p, urgent: v }))} />
            <ThresholdSlider label="🟡 Standard above" value={thresholds.standard}
              onChange={v => setThresholds(p => ({ ...p, standard: v }))} />
          </div>
        </div>

        {/* Macros */}
        <div className="animate-fade-in">
          <div style={{ fontWeight: 700, marginBottom: 'var(--spacing-12)' }}>⚡ Macros</div>
          <div className="stagger" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-8)' }}>
            {macros.map((m, i) => (
              <div key={m.id} className="card card-shadow animate-fade-in" style={{ background: m.color }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ fontWeight: 700 }}>{m.label}</div>
                  <span className="badge">{m.steps.length} steps</span>
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {m.steps.map(s => <span key={s} className="badge badge-new" style={{ fontSize: 10 }}>{s}</span>)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* About */}
        <div className="card animate-fade-in" style={{ background: 'var(--gradient-sky-breeze)', fontSize: 'var(--text-body-sm)' }}>
          <div style={{ fontWeight: 700, marginBottom: 4 }}>📖 About QueueVision</div>
          <div style={{ color: '#374151' }}>
            Mobile-first moderation intelligence. Brings full thread context, user history,
            and multi-step macros to the mobile modqueue.
          </div>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <span className="badge badge-green">v0.1.0</span>
            <span className="badge">Devvit 0.13</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ThresholdSlider({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 'var(--text-body-sm)' }}>
        <span>{label}</span>
        <span style={{ fontWeight: 700 }}>{value}</span>
      </div>
      <input type="range" min={0} max={100} value={value} onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: 'var(--color-accent-green)' }} />
    </div>
  );
}

const DEFAULT_MACROS: Macro[] = [
  { id: 'clean-remove',  label: '🗑️ Clean Remove',   steps: ['remove', 'addModNote'],          color: 'var(--color-risk-urgent)' },
  { id: 'spam-ban',      label: '🚫 Spam Ban (7d)',   steps: ['remove', 'ban', 'addModNote'],   color: '#fee2e2' },
  { id: 'warn-release',  label: '⚠️ Warn & Release',  steps: ['approve', 'addModNote'],         color: 'var(--color-card-saffron)' },
  { id: 'approve',       label: '✅ Approve',          steps: ['approve'],                       color: 'var(--color-card-mint)' },
  { id: 'mute',          label: '🔇 Mute User',        steps: ['mute', 'addModNote'],            color: 'var(--color-card-lavender)' },
];
