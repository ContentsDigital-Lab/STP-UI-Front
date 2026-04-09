import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../api/config';

// ── Shared Singleton Socket ──────────────────────────────────────────────────
let sharedSocket: Socket | null = null;
const roomRefs = new Map<string, number>();

/**
 * Ensures a single Socket.io connection exists.
 */
function getSharedSocket() {
    if (typeof window === 'undefined') return null;
    if (sharedSocket) {
        if (sharedSocket.disconnected) sharedSocket.connect();
        return sharedSocket;
    }

    const token = localStorage.getItem('auth_token') || '';
    const baseUrl = API_BASE_URL.replace('/api', '');

    sharedSocket = io(baseUrl, {
        path: '/api/socket-entry',
        auth: { token },
        transports: ['websocket'],
        reconnectionAttempts: 10,
        reconnectionDelay: 2000,
        multiplex: true, // socket.io default, but explicit for clarity
    });

    sharedSocket.on('connect', () => {
        console.log(`[Socket.io] Global Connected. ID: ${sharedSocket?.id}`);
    });

    sharedSocket.on('disconnect', (reason) => {
        console.warn(`[Socket.io] Global Disconnected: ${reason}`);
    });

    sharedSocket.on('connect_error', (err) => {
        console.error(`[Socket.io] Global Connection Error:`, err);
    });

    return sharedSocket;
}

/**
 * Custom hook for Socket.io integration with Room management and multiple event listeners.
 */
export function useWebSocket(
    room: string, 
    events: string[], 
    onEvent?: (event: string, data: unknown) => void, 
    options?: { stationRoom?: string; debounceMs?: number }
) {
    const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');
    const debounceMs = options?.debounceMs ?? 0;
    const stationRoom = options?.stationRoom;
    const timeoutRef = useRef<NodeJS.Timeout>(null);

    const callbackRef = useRef(onEvent);
    useEffect(() => {
        callbackRef.current = onEvent;
    }, [onEvent]);

    useEffect(() => {
        const socket = getSharedSocket();
        if (!socket) return;

        // Sync status
        const updateStatus = () => setStatus(socket.connected ? 'open' : 'connecting');
        socket.on('connect', updateStatus);
        socket.on('disconnect', updateStatus);
        updateStatus();

        // Join primary room
        const roomKey = `join_${room}`;
        const currentCount = roomRefs.get(room) ?? 0;
        roomRefs.set(room, currentCount + 1);
        
        if (currentCount === 0) {
            socket.emit(roomKey, (ack: unknown) => {
                console.log(`[Socket.io] First listener joined "${room}" ack:`, ack);
            });
        }

        socket.emit('join_me');

        // Join station room if provided
        if (stationRoom) {
            const sRoomKey = `station:${stationRoom}`;
            const sCount = roomRefs.get(sRoomKey) ?? 0;
            roomRefs.set(sRoomKey, sCount + 1);
            if (sCount === 0) {
                socket.emit('join_station_room', stationRoom, (ack: unknown) => {
                    console.log(`[Socket.io] First listener joined station "${stationRoom}" ack:`, ack);
                });
            }
        }

        // Event handler helper
        const handleEvent = (eventName: string, payload: unknown) => {
            if (debounceMs > 0) {
                if (timeoutRef.current) clearTimeout(timeoutRef.current);
                timeoutRef.current = setTimeout(() => {
                    callbackRef.current?.(eventName, payload);
                }, debounceMs);
            } else {
                callbackRef.current?.(eventName, payload);
            }
        };

        // Listen for specified events
        events.forEach(eventName => {
            socket.on(eventName, (payload) => handleEvent(eventName, payload));
        });

        // Global listeners
        socket.on('notification', (payload) => handleEvent('notification', payload));
        socket.on('system_alert', (payload) => handleEvent('system_alert', payload));

        return () => {
            // Clean up event listeners
            events.forEach(eventName => {
                socket.off(eventName);
            });
            socket.off('notification');
            socket.off('system_alert');
            socket.off('connect', updateStatus);
            socket.off('disconnect', updateStatus);
            
            if (timeoutRef.current) clearTimeout(timeoutRef.current);

            // Leave primary room
            const count = (roomRefs.get(room) ?? 1) - 1;
            if (count <= 0) {
                roomRefs.delete(room);
                socket.emit(`leave_${room}`);
            } else {
                roomRefs.set(room, count);
            }

            // Leave station room
            if (stationRoom) {
                const sRoomKey = `station:${stationRoom}`;
                const scount = (roomRefs.get(sRoomKey) ?? 1) - 1;
                if (scount <= 0) {
                    roomRefs.delete(sRoomKey);
                    socket.emit('leave_station_room', stationRoom);
                } else {
                    roomRefs.set(sRoomKey, scount);
                }
            }
        };
    }, [room, JSON.stringify(events), stationRoom, debounceMs]);

    return { status };
}
