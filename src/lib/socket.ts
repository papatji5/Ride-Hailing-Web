import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // Connect to the same origin; Next's API route is mounted at /api/socketio
    socket = io({ path: '/api/socketio' });
    socket.on('connect', () => {
      console.debug('Socket connected', socket?.id);
    });
    socket.on('disconnect', (reason) => {
      console.debug('Socket disconnected', reason);
    });
    socket.on('connect_error', (error) => {
      console.error('Socket connect error', error);
    });
  }
  return socket;
}
