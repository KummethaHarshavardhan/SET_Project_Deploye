import { io } from 'socket.io-client';
import { getToken } from './authService';
import { SOCKET_URL } from './apiConfig';

let socket = null;

export const connectSocket = () => {
  if (!socket) {
    const token = getToken();
    socket = io(SOCKET_URL, { transports: ['websocket', 'polling'], auth: { token } });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};

export const getSocket = () => socket;
