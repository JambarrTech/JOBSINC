'use client';

import { io, type Socket } from 'socket.io-client';

// Singleton Socket.IO pour la messagerie temps réel.
// Le contenu des messages n'est PAS transporté par le socket :
// l'événement `message:new` sert de signal, les données sont
// rechargées via l'API REST (sérialisation propre au viewer).

let socket: Socket | null = null;

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[2]) : null;
}

export function getMessagesSocket(): Socket | null {
  if (typeof window === 'undefined') return null;

  // Migration HttpOnly : le token n'est plus lisible en JS si HttpOnly.
  // On tente lecture cookie non-HttpOnly fallback, sinon on s'appuie sur cookie HttpOnly envoyé via withCredentials
  const token = getCookie('jobsinc_token') || getCookie('accessToken') || '';

  // Si token HttpOnly, il sera envoyé via cookie lors du handshake websocket (withCredentials)
  // On garde auth token si disponible pour compat mobile/legacy
  const hasCookieAuth = typeof document !== 'undefined' && document.cookie.includes('jobsinc_token');

  if (!token && !hasCookieAuth) {
    // Pas de cookie visible mais peut-être HttpOnly présent — on tente quand même la connexion
    // Le backend vérifiera les cookies du handshake
  }

  if (socket && token && (socket.auth as { token?: string } | undefined)?.token !== token) {
    socket.disconnect();
    socket = null;
  }

  if (socket) return socket;

  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || 'https://jobsinc.onrender.com/api').replace(/\/$/, '');
  const url = apiUrl.replace(/\/api$/, '');

  socket = io(url, {
    auth: token ? { token } : {},
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
