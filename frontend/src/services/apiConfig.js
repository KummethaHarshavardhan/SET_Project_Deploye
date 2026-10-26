// Single source of truth for backend URLs.
// Set VITE_API_URL to the backend ORIGIN, e.g. https://your-backend.onrender.com
// (no trailing slash, no /api). It is read at BUILD time by Vite.
const rawOrigin = (import.meta.env.VITE_API_URL || "http://localhost:5000").replace(/\/+$/, "").replace(/\/api$/, "");

export const SOCKET_URL = rawOrigin;
export const API_BASE_URL = `${rawOrigin}/api`;
