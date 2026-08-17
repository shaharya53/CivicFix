'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';

export default function Register() {
  const { register, user } = useAuth();
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('CITIZEN');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  // If already logged in, redirect to home
  if (user) {
    router.push('/');
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please fill in all fields');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await register(email, password, role);
      setSuccess(true);
      setTimeout(() => {
        router.push('/login');
      }, 1500);
    } catch (err) {
      setError(err.message || 'Registration failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-neutral-50 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-2xl border border-neutral-200 shadow-sm p-8 space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex w-10 h-10 rounded-xl bg-teal-600 items-center justify-center text-white font-extrabold text-xl shadow-sm">
            CF
          </div>
          <h2 className="text-2xl font-bold text-neutral-900">Create Account</h2>
          <p className="text-sm text-neutral-400">Join CivicFix to help make your city cleaner</p>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border border-red-150 rounded-xl text-red-700 text-sm flex items-start space-x-2">
            <span className="mt-0.5">⚠️</span>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border border-green-150 rounded-xl text-green-700 text-sm flex items-start space-x-2 animate-bounce">
            <span className="mt-0.5">✓</span>
            <span>Account created successfully! Redirecting to login...</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Email Address</label>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 text-sm text-neutral-800"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Password</label>
            <input
              type="password"
              placeholder="•••••••• (6+ characters)"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 text-sm text-neutral-800"
              required
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold uppercase tracking-wider text-neutral-400">Account Type / Role</label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-neutral-200 focus:outline-none focus:border-teal-600 focus:ring-1 focus:ring-teal-600 text-sm text-neutral-800 bg-white"
            >
              <option value="CITIZEN">Citizen</option>
              <option value="WORKER">Field Worker</option>
              <option value="ADMIN">Administrator</option>
              <option value="SUPER_ADMIN">Super Administrator</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={loading || success}
            className="w-full py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 disabled:bg-teal-400 shadow-sm transition-colors text-sm"
          >
            {loading ? 'Registering...' : 'Register'}
          </button>
        </form>

        <div className="text-center text-sm text-neutral-400 pt-2 border-t border-neutral-100">
          Already have an account?{' '}
          <a href="/login" className="text-teal-600 hover:text-teal-700 font-semibold">
            Sign In
          </a>
        </div>
      </div>
    </main>
  );
}
