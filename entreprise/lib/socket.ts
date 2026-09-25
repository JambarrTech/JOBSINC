'use client';

import { io, type Socket } from 'socket.io-client';

// Singleton Socket.IO pour la messagerie temps réel.
// Le contenu des messages n'est PAS transporté par le socket :
// l'événement `message:new` sert de signal, les données sont
// rechargées via l'API REST (sérialisation propre au viewer).

let socket: Socket | null = null;

export function getMessagesSocket(): Socket | null {
  if (typeof window === 'undefined') return null;

  if (socket) return socket;

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api').replace(/\/$/, '');
  const url = apiUrl.replace(/\/api$/, '');

  socket = io(url, {
    withCredentials: true,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
