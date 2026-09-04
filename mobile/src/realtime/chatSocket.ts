import { useCallback, useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

import { API_BASE_URL } from '../config/env';
import { getTokens } from '../auth/tokenStorage';
import { Message } from '../api/messaging';

// The mobile half of the Socket.IO messaging contract (backend
// src/socket/messageHandlers.js). The connection authenticates with the stored
// access token in the handshake `auth.token` — the same field the backend's
// io.use middleware reads — and delivers to the user's own room, so there's no
// per-conversation "join": every one of the user's threads arrives on this one
// socket and the chat screen filters by conversationId.
//
// Connection state is surfaced honestly (connecting / connected / disconnected)
// so the UI can tell the user when messages can't be sent, rather than silently
// dropping them.

export type ConnectionState = 'connecting' | 'connected' | 'disconnected';

// Server → client event payloads (mirror the backend emits exactly).
export type TypingEvent = { conversationId: string; userId: string; isTyping: boolean };
export type ReadEvent = { conversationId: string; readerId: string; readAt: string };

// The ack the server sends back to `message:send`.
type SendAck = { ok: true; message: Message } | { ok: false; error: string };

type Handlers = {
  onMessage: (message: Message) => void;
  onTyping: (event: TypingEvent) => void;
  onRead: (event: ReadEvent) => void;
};

export type ChatSocket = {
  connectionState: ConnectionState;
  // Resolves with the stored message (server id/timestamp/flagged verdict) once
  // the server acks; rejects if we're offline or the server rejects the send.
  sendMessage: (conversationId: string, text: string) => Promise<Message>;
  setTyping: (conversationId: string, isTyping: boolean) => void;
  markRead: (conversationId: string) => void;
};

export function useChatSocket(handlers: Handlers): ChatSocket {
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const socketRef = useRef<Socket | null>(null);

  // Keep the latest handlers in a ref so the effect that opens the socket runs
  // exactly once (on mount) instead of tearing down and reconnecting whenever the
  // screen re-renders with new closures.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    let cancelled = false;
    let socket: Socket | null = null;

    (async () => {
      const tokens = await getTokens();
      if (cancelled) return;
      if (!tokens?.accessToken) {
        // No token to authenticate the handshake — reflect that instead of
        // spinning forever on "connecting".
        setConnectionState('disconnected');
        return;
      }

      socket = io(API_BASE_URL, {
        auth: { token: tokens.accessToken },
        transports: ['websocket'], // RN has no XHR polling fallback worth using
      });
      socketRef.current = socket;

      socket.on('connect', () => setConnectionState('connected'));
      // Covers server-initiated drops, network loss, and the manager giving up.
      socket.on('disconnect', () => setConnectionState('disconnected'));
      // A failed handshake (bad/expired token, server unreachable). The client
      // keeps retrying by default; show "connecting" while it does.
      socket.on('connect_error', () => setConnectionState('connecting'));
      socket.io.on('reconnect_attempt', () => setConnectionState('connecting'));

      socket.on('message:receive', (message: Message) => handlersRef.current.onMessage(message));
      socket.on('typing', (event: TypingEvent) => handlersRef.current.onTyping(event));
      socket.on('read', (event: ReadEvent) => handlersRef.current.onRead(event));
    })();

    return () => {
      cancelled = true;
      if (socket) {
        socket.removeAllListeners();
        socket.disconnect();
      }
      socketRef.current = null;
    };
  }, []);

  const sendMessage = useCallback((conversationId: string, text: string) => {
    return new Promise<Message>((resolve, reject) => {
      const socket = socketRef.current;
      if (!socket || !socket.connected) {
        reject(new Error('You’re offline. Reconnect to send this message.'));
        return;
      }
      socket.emit('message:send', { conversationId, text }, (ack: SendAck) => {
        if (ack && ack.ok) resolve(ack.message);
        else reject(new Error((ack && !ack.ok && ack.error) || 'Failed to send message.'));
      });
    });
  }, []);

  const setTyping = useCallback((conversationId: string, isTyping: boolean) => {
    // Fire-and-forget — the backend doesn't ack typing, and a lost indicator is
    // harmless. Guard on connected so we don't queue stale typing state.
    if (socketRef.current?.connected) {
      socketRef.current.emit('typing', { conversationId, isTyping });
    }
  }, []);

  const markRead = useCallback((conversationId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('read', { conversationId });
    }
  }, []);

  return { connectionState, sendMessage, setTyping, markRead };
}
