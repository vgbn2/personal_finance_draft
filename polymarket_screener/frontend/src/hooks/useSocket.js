import { useEffect, useState, useRef, useCallback } from 'react';

export function useSocket(url) {
  const [state, setState] = useState({ 
    screener: [], 
    greeks: { delta: 0, gamma: 0, theta: 0, vega: 0 },
    risk: { label: 'LOW', color_hex: '#10B981', black_swan_prob: 0 },
    portfolio: { alpha: 0, survival_rate: 100 }
  });
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState(null);
  
  const socketRef = useRef(null);
  const reconnectCountRef = useRef(0);
  const heartbeatTimeoutRef = useRef(null);
  const maxReconnectDelay = 30000;

  useEffect(() => {
    let isMounted = true;

    const stopHeartbeat = () => {
      if (heartbeatTimeoutRef.current) clearTimeout(heartbeatTimeoutRef.current);
    };

    const resetHeartbeat = () => {
      stopHeartbeat();
      heartbeatTimeoutRef.current = setTimeout(() => {
        if (isMounted) {
          console.warn('[WS] Heartbeat timeout. Closing socket.');
          socketRef.current?.close();
        }
      }, 5000);
    };

    const scheduleReconnect = () => {
      if (!isMounted) return;
      const delay = Math.min(Math.pow(2, reconnectCountRef.current) * 100, maxReconnectDelay);
      reconnectCountRef.current += 1;
      setTimeout(connect, delay);
    };

    const connect = () => {
      console.log(`[WS] Connecting to ${url}...`);
      const ws = new WebSocket(url);
      socketRef.current = ws;

      ws.onopen = () => {
        if (!isMounted) return;
        console.log('[WS] Connected');
        setConnected(true);
        setError(null);
        reconnectCountRef.current = 0;
        resetHeartbeat();
      };

      ws.onmessage = (event) => {
        if (!isMounted) return;
        try {
          const payload = JSON.parse(event.data);
          if (payload.type === 'STATE_UPDATE') {
            setState(payload.data);
            resetHeartbeat();
          } else if (payload.type === 'PONG') {
            resetHeartbeat();
          }
        } catch (err) {
          console.error('[WS] Parse Error:', err);
        }
      };

      ws.onclose = (event) => {
        if (!isMounted) return;
        setConnected(false);
        stopHeartbeat();
        console.log(`[WS] Closed (${event.code}). Retrying...`);
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        if (!isMounted) return;
        console.error('[WS] Error:', err);
        setError('Connection failed');
      };
    };

    connect();

    return () => {
      isMounted = false;
      stopHeartbeat();
      socketRef.current?.close();
    };
  }, [url]);

  const sendCommand = useCallback((cmd, params = {}) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({
        type: 'UI_COMMAND',
        cmd,
        ...params
      }));
    }
  }, []);

  return { state, connected, error, sendCommand };
}
