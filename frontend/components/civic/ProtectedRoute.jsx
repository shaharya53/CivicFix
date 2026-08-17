'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../hooks/useAuth';

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  const allowedRolesStr = allowedRoles.join(',');

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Redirection for guests trying to access protected content
        router.push('/login');
      } else if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        // Redirection for users with insufficient permissions (Role-based guarding)
        router.push('/');
      }
    }
  }, [user, loading, router, allowedRolesStr]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-neutral-50 text-neutral-500 font-medium text-sm">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-8 h-8 rounded-full border-2 border-neutral-200 border-t-teal-600 animate-spin"></div>
          <span>Verifying authentication...</span>
        </div>
      </div>
    );
  }

  // Prevent flash of protected UI before redirection takes place
  if (!user || (allowedRoles.length > 0 && !allowedRoles.includes(user.role))) {
    return null;
  }

  return <>{children}</>;
}
