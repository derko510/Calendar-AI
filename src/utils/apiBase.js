// The API is served from the same domain as the app (Vercel function in prod, Vite proxy in dev).
// Set VITE_API_URL only to point at a different backend.
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
