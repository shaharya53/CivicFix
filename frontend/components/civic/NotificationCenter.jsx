import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { fetchAPI } from '../../lib/api';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const WS_URL = API_URL.replace('http://', 'ws://').replace('https://', 'wss://') + '/ws/live';

export default function NotificationCenter() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  
  const dropdownRef = useRef(null);

  useEffect(() => {
    // Initial fetch of unread count and latest notifications
    fetchUnreadCount();
    fetchNotifications();
    
    // Close dropdown on clicking outside
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // WebSocket real-time subscription
  useEffect(() => {
    let ws = null;
    let reconnectTimeout = null;

    const connectWS = () => {
      ws = new WebSocket(WS_URL);

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          
          if (payload.event === 'new_notification' && payload.notification) {
            const noti = payload.notification;
            
            // 1. Increment unread count locally
            setUnreadCount((c) => c + 1);

            // 2. Prepend to notifications list ensuring no duplicates
            setNotifications((prev) => {
              if (prev.some((n) => n.id === noti.id)) return prev;
              return [noti, ...prev].slice(0, 20); // Keep max 20 items in dropdown view
            });
          }
        } catch (e) {
          console.error('Failed to parse socket message:', e);
        }
      };

      ws.onclose = () => {
        // Automatically sync on reconnect
        reconnectTimeout = setTimeout(() => {
          connectWS();
          fetchUnreadCount();
          fetchNotifications();
        }, 3000);
      };
    };

    connectWS();

    return () => {
      if (ws) ws.close();
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
    };
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const data = await fetchAPI('/api/notifications/unread-count');
      if (data && typeof data.unread_count === 'number') {
        setUnreadCount(data.unread_count);
      }
    } catch (err) {
      console.error('Failed to fetch unread count:', err);
    }
  };

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await fetchAPI('/api/notifications?page=1&limit=20');
      if (data && data.notifications) {
        setNotifications(data.notifications);
      }
    } catch (err) {
      setError(err.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleMarkRead = async (notiId, e) => {
    e.stopPropagation();
    try {
      await fetchAPI(`/api/notifications/${notiId}/read`, { method: 'PUT' });
      setUnreadCount((c) => Math.max(c - 1, 0));
      setNotifications((prev) => 
        prev.map((n) => n.id === notiId ? { ...n, is_read: true } : n)
      );
    } catch (err) {
      console.error('Failed to mark read:', err);
    }
  };

  const handleMarkAllRead = async () => {
    try {
      await fetchAPI('/api/notifications/read-all', { method: 'PUT' });
      setUnreadCount(0);
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    } catch (err) {
      console.error('Failed to mark all read:', err);
    }
  };

  const handleNotificationClick = async (noti) => {
    // 1. Mark as read
    if (!noti.is_read) {
      try {
        await fetchAPI(`/api/notifications/${noti.id}/read`, { method: 'PUT' });
        setUnreadCount((c) => Math.max(c - 1, 0));
        setNotifications((prev) => 
          prev.map((n) => n.id === noti.id ? { ...n, is_read: true } : n)
        );
      } catch (err) {
        console.error(err);
      }
    }
    
    // 2. Perform redirect link action
    if (noti.link) {
      router.push(noti.link);
    }
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      
      {/* Bell icon trigger */}
      <button 
        onClick={() => { setIsOpen(!isOpen); if (!isOpen) fetchNotifications(); }}
        className="relative w-8 h-8 rounded-full hover:bg-neutral-100 flex items-center justify-center text-neutral-600 focus:outline-none transition"
      >
        <span className="text-lg">🔔</span>
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 bg-red-600 text-white font-extrabold text-[8px] px-1.5 py-0.5 rounded-full min-w-[16px] text-center border border-white flex items-center justify-center animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-neutral-200 overflow-hidden z-50 text-neutral-800 text-xs flex flex-col max-h-[420px] animate-slide-up">
          
          <div className="px-4 py-3 bg-neutral-50 border-b border-neutral-200 flex items-center justify-between font-bold">
            <span className="text-neutral-900 font-extrabold">Notifications</span>
            {unreadCount > 0 && (
              <button 
                onClick={handleMarkAllRead}
                className="text-[10px] text-teal-600 hover:text-teal-700 font-bold transition"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-neutral-100 max-h-[320px]">
            {loading && notifications.length === 0 ? (
              <div className="text-center py-8 text-neutral-400">Loading alerts...</div>
            ) : error ? (
              <div className="text-center py-8 text-red-600">Error: {error}</div>
            ) : notifications.length === 0 ? (
              <div className="text-center py-10 text-neutral-400">
                <span className="text-2xl block mb-1">📭</span>
                <span>No notifications yet.</span>
              </div>
            ) : (
              notifications.map((n) => (
                <div 
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`p-4 hover:bg-neutral-50/80 cursor-pointer flex gap-3 transition ${!n.is_read ? 'bg-teal-50/10 font-medium' : ''}`}
                >
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-neutral-900">{n.title}</span>
                      {!n.is_read && (
                        <button 
                          onClick={(e) => handleMarkRead(n.id, e)}
                          className="text-[9px] text-neutral-400 hover:text-teal-600 px-1 border border-neutral-200 rounded hover:border-teal-200"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                    <p className="text-xs text-neutral-500 leading-normal">{n.message}</p>
                    <span className="text-[9px] text-neutral-400 block font-mono">
                      {n.created_at ? new Date(n.created_at).toLocaleString() : ''}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>

        </div>
      )}

    </div>
  );
}
