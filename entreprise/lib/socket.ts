'use client';

import { io, type Socket } from 'socket.io-client';

// Singleton Socket.IO pour la messagerie temps réel.
// Le contenu des messages n'est PAS transporté par le socket :
// l'événement `message:new` sert de signal, les données sont
// rechargées via l'API REST (sérialisation propre au viewer).

let socket: Socket | null = null;

export function getMessagesSocket(): Socket | null {
  if (typeof window === 'undefined') return null;

  const token = localStorage.getItem('jobsinc_token') || '';
  if (!token) return null;

  // Token renouvelé (reconnexion, changement de compte) : on repart
  // sur une connexion propre authentifiée avec le jeton courant.
  if (socket && (socket.auth as { token?: string } | undefined)?.token !== token) {
    socket.disconnect();
    socket = null;
  }

  if (socket) return socket;

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace(/\/$/, '');
  const url = apiUrl.replace(/\/api$/, '');

  socket = io(url, {
    auth: { token },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  return socket;
}
