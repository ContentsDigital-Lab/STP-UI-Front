import { useEffect, useRef, useState } from 'react';

export function useWebSocket(onMessage?: (data: any) => void) {
    const socketRef = useRef<WebSocket | null>(null);
    const [status, setStatus] = useState<'connecting' | 'open' | 'closed' | 'error'>('connecting');

    useEffect(() => {
        const connect = () => {
            // Using the base URL from config but with wss protocol
            const wsUrl = "wss://std.specterint.org/ws";
            const socket = new WebSocket(wsUrl);

            socket.onopen = () => {
                console.log('WebSocket Connected');
                setStatus('open');
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (onMessage) onMessage(data);
                } catch (e) {
                    console.error('Failed to parse WS message:', e);
                }
            };

            socket.onclose = () => {
                console.log('WebSocket Disconnected');
                setStatus('closed');
                // Reconnect after 3 seconds
                setTimeout(connect, 3000);
            };

            socket.onerror = (error) => {
                console.error('WebSocket Error:', error);
                setStatus('error');
            };

            socketRef.current = socket;
        };

        connect();

        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    return { status };
}
