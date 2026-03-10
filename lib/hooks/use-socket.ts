import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/config';

/**
 * Custom hook for Socket.io integration with Room management and multiple event listeners.
 * @param room The room to join (e.g., 'inventory', 'dashboard')
 * @param events List of events to listen for (e.g., ['inventory:updated', 'order:updated'])
 * @param onEvent Callback triggered when any of the listed events occur
 */
export function useWebSocket(room: string, events: string[], onEvent?: (event: string, data: unknown) => void) {
    const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
    const socketRef = useRef<Socket | null>(null);

    const callbackRef = useRef(onEvent);
    useEffect(() => {
        callbackRef.current = onEvent;
    }, [onEvent]);

    const eventsJson = JSON.stringify(events);

    useEffect(() => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
        const baseUrl = API_BASE_URL.replace('/api', '');

        const socketInstance = io(baseUrl, {
            path: '/api/socket-entry',
            auth: { token },
            transports: ['websocket'],
            reconnectionAttempts: 5,
            reconnectionDelay: 3000,
        });

        socketRef.current = socketInstance;

        socketInstance.on('connect', () => {
            console.log(`[Socket.io] Connected. ID: ${socketInstance.id}. Joining room: ${room}`);
            setStatus('open');

            socketInstance.emit(`join_${room}`, (ack: unknown) => {
                console.log(`[Socket.io] Joined room "${room}" ack:`, ack);
            });

            socketInstance.emit('join_me');
        });

        // Register listeners for all specified events
        const parsedEvents: string[] = JSON.parse(eventsJson);
        parsedEvents.forEach(eventName => {
            socketInstance.on(eventName, (payload) => {
                console.log(`[Socket.io] Event received [${eventName}]:`, payload);
                if (callbackRef.current) callbackRef.current(eventName, payload);
            });
        });

        // Global events
        socketInstance.on('notification', (notif) => {
            if (callbackRef.current) callbackRef.current('notification', notif);
        });

        socketInstance.on('system_alert', (alert) => {
            if (callbackRef.current) callbackRef.current('system_alert', alert);
        });

        socketInstance.on('disconnect', (reason) => {
            console.log('[Socket.io] Disconnected:', reason);
            setStatus('closed');
        });

        socketInstance.on('connect_error', (error) => {
            console.error('[Socket.io] Connection Error:', error);
            setStatus('error');
        });

        return () => {
            console.log(`[Socket.io] Cleaning up room: ${room}`);
            socketInstance.emit(`leave_${room}`);
            socketInstance.disconnect();
            socketRef.current = null;
        };
    }, [room, eventsJson]); // Reconnect if room or events list changes

    // We don't return the socket directly to avoid "Cannot access ref during render" error
    // If needed in the future, return a stable getter or another ref.
    return { status };
}
