import React, { useState, useEffect, useRef } from 'react';
import { Bell, Check } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import { Notification } from '../types';
import { mutate as globalMutate } from 'swr';

const NotificationCenter: React.FC = () => {
  const { activeOrg } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch past alerts
  const fetchNotifications = async () => {
    if (!activeOrg) return;
    try {
      const res = await api.get('/notifications/');
      setNotifications(res.data.results || res.data);
      setUnreadCount((res.data.results || res.data).filter((n: Notification) => !n.is_read).length);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    fetchNotifications();

    if (!activeOrg) return;

    // Establish WebSocket Connection
    const token = localStorage.getItem('access_token');
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'https://invoice-management-system-p8uf.onrender.com/api/v1';
    
    let wsUrl = '';
    try {
      const urlObj = new URL(apiBaseUrl);
      const wsProtocol = urlObj.protocol === 'https:' ? 'wss:' : 'ws:';
      wsUrl = `${wsProtocol}//${urlObj.host}/ws/notifications/?token=${token}&tenant_id=${activeOrg.id}`;
    } catch (e) {
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const host = window.location.host;
      wsUrl = `${protocol}://${host}/ws/notifications/?token=${token}&tenant_id=${activeOrg.id}`;
    }
    
    const socket = new WebSocket(wsUrl);
    wsRef.current = socket;

    socket.onopen = () => {
      // Channel connected
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // 1. Check if the WebSocket frame represents a real-time data sync trigger
        if (data.type === 'data_changed') {
          // Trigger global SWR revalidation dynamically based on the model that changed
          if (data.model) {
            // Models like customer, product, invoice are pluralized in standard SWR cache keys
            const keyPrefix = `/${data.model}s/`;
            globalMutate(key => typeof key === 'string' && key.startsWith(keyPrefix));
          }
          
          // Dispatch global sync event to notify any non-SWR modules
          window.dispatchEvent(new CustomEvent('app:sync', { detail: data }));
          return;
        }
        
        // 2. Play notification sound for actual new notifications
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-600.wav');
          audio.volume = 0.3;
          audio.play();
        } catch (sfxErr) {}

        // 3. Add to notifications state list
        const newNotification: Notification = {
          id: data.id || Math.random().toString(),
          title: data.title || 'Notification',
          message: data.message || '',
          is_read: false,
          created_at: data.created_at || new Date().toISOString()
        };
        
        setNotifications((prev) => [newNotification, ...prev]);
        setUnreadCount((count) => count + 1);
        
        // Trigger sync for notification center listeners
        window.dispatchEvent(new CustomEvent('app:sync', { detail: { model: 'notification', action: 'create' } }));
      } catch (err) {
        console.error("Failed to parse incoming WebSocket frame", err);
      }
    };

    socket.onclose = () => {
      // Channel closed
    };

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [activeOrg]);

  const markRead = async (id: string) => {
    try {
      await api.post(`/notifications/${id}/read/`);
      setNotifications(prev =>
        prev.map(n => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (e) {
      console.error(e);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/notifications/mark-all-read/');
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="relative">
      {/* Bell Trigger */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-400 hover:text-emerald-400 rounded-lg hover:bg-slate-800/40 transition-all group"
      >
        <Bell className="w-5 h-5 group-hover:animate-bounce" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-emerald-500 text-white rounded-full text-[9px] font-bold flex items-center justify-center glow-emerald">
            {unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-80 glass border border-slate-800 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 className="font-bold text-sm font-display">Notifications</h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-[10px] text-emerald-400 hover:underline flex items-center gap-1"
              >
                <Check className="w-3 h-3" /> Mark all read
              </button>
            )}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-slate-800/60">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                No active notifications.
              </div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 transition-colors ${item.is_read ? 'opacity-60 bg-transparent' : 'bg-slate-800/20'}`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <p className="font-semibold text-xs text-slate-200">{item.title}</p>
                    {!item.is_read && (
                      <button
                        onClick={() => markRead(item.id)}
                        className="text-slate-500 hover:text-emerald-400 p-0.5 rounded transition-colors"
                        title="Mark as read"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">{item.message}</p>
                  <span className="text-[9px] text-slate-500 block mt-2">
                    {new Date(item.created_at).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
