import React, { useState } from 'react';
import { login } from '../lib/api';
import { setAuth } from '../lib/storage';

interface Props {
  onLogin: () => void;
}

export default function LoginForm({ onLogin }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const tokens = await login(email, password);
      await setAuth({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, email });
      onLogin();
    } catch (err: any) {
      setError(err.message ?? 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-7 h-7 bg-shield-600 rounded-full flex items-center justify-center">
          <span className="text-white text-xs font-bold">S</span>
        </div>
        <h1 className="text-base font-semibold text-gray-800">ShieldMe</h1>
      </div>
      <p className="text-sm text-gray-500 -mt-2">Sign in to manage your aliases</p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-shield-500"
            placeholder="you@example.com"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Password</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-shield-500"
            placeholder="••••••••••••"
            required
          />
        </div>
        {error && <p className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-shield-600 hover:bg-shield-700 text-white text-sm font-medium rounded-md disabled:opacity-50 transition-colors"
        >
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
