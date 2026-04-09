"use client";

import { useState, useEffect, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { jwtDecode } from "jwt-decode";
import { toast } from "sonner";

const API_BASE = process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:8000";

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string;
  read: boolean;
  metadata: any;
  createdAt: string;
}

export function useNotifications() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    try {
      const token = localStorage.getItem("token");
      if (!token) return;
      const res = await fetch(`${API_BASE}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data);
      }
    } catch(e) {}
  }, []);

  const connect = useCallback(() => {
    const token = localStorage.getItem("token");
    if (!token) return;
    
    // Connect to WebSocket gateway
    // NOTE: If your api server runs on WS vs WSS you need to handle that, 
    // relying on the same origin/host
    const socketInstance = io(API_BASE, {
      auth: { token }
    });

    socketInstance.on('connect', () => {
      console.log('Notification socket connected');
    });

    socketInstance.on('notification:new', (notif: Notification) => {
      setNotifications(prev => [notif, ...prev]);
      // Show toaster when a new notification arrives
      toast(notif.title, {
        description: notif.body,
      });
      fetchNotifications(); // just to be completely in sync
    });

    socketInstance.on('notification:count', (data: { count: number }) => {
      setUnreadCount(data.count);
    });

    setSocket(socketInstance);

    // Initial fetch of DB notifications
    fetchNotifications();

    return () => {
      socketInstance.disconnect();
    };
  }, [fetchNotifications, toast]);

  useEffect(() => {
    const cleanup = connect();
    return () => {
      if (cleanup) cleanup();
    };
  }, [connect]);


  const markAsRead = async (id: string) => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE}/api/notifications/${id}/read`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
      // count will update from socket event
    } catch(e) {}
  };

  const markAllAsRead = async () => {
    try {
      const token = localStorage.getItem("token");
      await fetch(`${API_BASE}/api/notifications/read-all`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}` }
      });
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch(e) {}
  };

  return {
    socket,
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    refresh: fetchNotifications
  };
}
