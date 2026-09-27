'use client';

import { io, type Socket } from 'socket.io-client';
import { API_ORIGIN } from '@/lib/api-url';

// Singleton Socket.IO pour la messagerie temps réel.
// Le contenu des messages n'est PAS transporté par le socket :
// l'événement `message:new` sert de signal, les données sont
// rechargées via l'API REST (sérialisation propre au viewer).

let socket: Socket | null = null;

export function getMessagesSocket(): Socket | null {
  if (typeof window === 'undefined') return null;

  if (socket) return socket;

  // Origine du backend : source de vérité unique (`lib/api-url.ts`).
  // `API_ORIGIN` a déjà retiré un éventuel suffixe `/api` et gère un
  // sous-emplacement, là où un simple `replace(/\/api$/, '')` ne le faisait pas.
  const url = API_ORIGIN;

  socket = io(url, {
    withCredentials: true,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10000,
  });

  return socket;
}

/** Ferme le socket et libère le singleton (appelé à la déconnexion). */
export function disconnectSocket() {
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
}
