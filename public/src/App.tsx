import React, { useState, useEffect } from 'react';
import InvestigateView from './views/InvestigateView';
import QueueView from './views/QueueView';
import SettingsView from './views/SettingsView';

type Tab = 'queue' | 'investigate' | 'settings';

export default function App() {
  const [tab, setTab] = useState<Tab>('queue');
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [claimEvents, setClaimEvents] = useState<any[]>([]);

  // Read itemId from URL params (set by menu item handler)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('itemId');
    if (id) { setSelectedItemId(id); setTab('investigate'); }
  }, []);

  // Realtime claim updates via postMessage from Devvit host
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'claim-update') {
        setClaimEvents(prev => [e.data, ...prev.slice(0, 19)]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const openInvestigate = (itemId: string) => {
    setSelectedItemId(itemId);
    setTab('investigate');
  };

  return (
    <div className="app">
      <header className="topbar animate-fade-in">
        <div className="topbar-logo">
          <div className="topbar-logo-dot" />
          QueueVision
        </div>
        <nav className="topbar-tabs">
          {(['queue', 'investigate', 'settings'] as Tab[]).map(t => (
            <button
              key={t}
              className={`tab-btn ${tab === t ? 'active' : ''}`}
              onClick={() => setTab(t)}
            >
              {t === 'queue' ? '📋 Queue' : t === 'investigate' ? '🔍 Investigate' : '⚙️ Settings'}
            </button>
          ))}
        </nav>
      </header>

      <main className="main-content">
        {tab === 'queue' && (
          <QueueView onInvestigate={openInvestigate} claimEvents={claimEvents} />
        )}
        {tab === 'investigate' && (
          <InvestigateView itemId={selectedItemId} />
        )}
        {tab === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
