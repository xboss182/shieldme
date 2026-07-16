import React, { useEffect, useState } from 'react';
import { getAuth, clearAuth, AuthState } from '../lib/storage';
import { refreshTokens } from '../lib/api';
import LoginForm from './LoginForm';
import CreateAliasForm from './CreateAliasForm';
import AliasList from './AliasList';

type View = 'create' | 'list';

export default function App() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [checking, setChecking] = useState(true);
  const [view, setView] = useState<View>('create');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [toast, setToast] = useState('');

  useEffect(() => {
    async function init() {
      const stored = await getAuth();
      if (!stored) { setChecking(false); return; }
      // Try to refresh token silently
      try {
        const tokens = await refreshTokens(stored.refreshToken);
        const updated: AuthState = { ...stored, accessToken: tokens.accessToken, refreshToken: tokens.refreshToken };
        await setAuth(updated);
        setAuth(updated);
      } catch {
        await clearAuth();
      }
      setChecking(false);
    }
    init();
  }, []);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 2500);
  }

  function handleLogin() {
    getAuth().then(a => { if (a) setAuth(a); });
  }

  function handleLogout() {
    clearAuth().then(() => setAuth(null));
  }

  function handleCreated(address: string) {
    showToast(`✓ ${address} copied!`);
    setRefreshTrigger(t => t + 1);
    setView('list');
  }

  if (checking) {
    return (
      <div className="flex items-center justify-center h-32 text-sm text-gray-400">
        Loading…
      </div>
    );
  }

  if (!auth) {
    return <LoginForm onLogin={handleLogin} />;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 bg-shield-600 rounded-full flex items-center justify-center">
            <span className="text-white text-xs font-bold">S</span>
          </div>
          <span className="text-sm font-semibold text-gray-800">ShieldMe</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 truncate max-w-[120px]">{auth.email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-gray-400 hover:text-gray-600"
            title="Sign out"
          >
            Sign out
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-100">
        <button
          onClick={() => setView('create')}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            view === 'create'
              ? 'text-shield-600 border-b-2 border-shield-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          New alias
        </button>
        <button
          onClick={() => { setView('list'); setRefreshTrigger(t => t + 1); }}
          className={`flex-1 py-2 text-xs font-medium transition-colors ${
            view === 'list'
              ? 'text-shield-600 border-b-2 border-shield-600'
              : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Recent aliases
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {view === 'create' && (
          <CreateAliasForm token={auth.accessToken} onCreated={handleCreated} />
        )}
        {view === 'list' && (
          <AliasList token={auth.accessToken} refreshTrigger={refreshTrigger} />
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="absolute bottom-3 left-3 right-3 bg-gray-800 text-white text-xs px-3 py-2 rounded-md text-center shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
