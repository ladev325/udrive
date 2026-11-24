import { apiRequest, ApiError } from './api';

// Accounts and sessions live on the udrive server; the session is an HttpOnly cookie,
// so nothing about the login is kept in localStorage.

export const USERNAME_PATTERN = /^[a-zA-Z0-9_-]{3,32}$/;
export const MIN_PASSWORD_LENGTH = 8;

export class AuthError extends Error {
  constructor(code) {
    super(code);
    this.name = 'AuthError';
    this.code = code;
  }
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(normalizeEmail(email));
}

export function isValidUsername(username) {
  return USERNAME_PATTERN.test(String(username || '').trim());
}

// Server user -> the shape the UI components use (they show `name` and `email`).
function toPublicUser(serverUser) {
  return {
    id: serverUser.id,
    name: serverUser.username,
    username: serverUser.username,
    email: serverUser.email,
    provider: 'email',
    createdAt: serverUser.createdAt,
  };
}

async function call(path, json) {
  try {
    return await apiRequest(path, { method: 'POST', json });
  } catch (error) {
    if (error instanceof ApiError) throw new AuthError(error.code);
    throw error;
  }
}

export async function signUp(username, email, password) {
  const cleanUsername = String(username || '').trim();
  if (!isValidUsername(cleanUsername)) throw new AuthError('INVALID_USERNAME');
  if (!isValidEmail(email)) throw new AuthError('INVALID_EMAIL');
  if (!password) throw new AuthError('PASSWORD_REQUIRED');
  if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError('PASSWORD_SHORT');
  const user = await call('/api/auth/signup', {
    username: cleanUsername,
    email: normalizeEmail(email),
    password,
  });
  return toPublicUser(user);
}

export async function signIn(email, password) {
  if (!isValidEmail(email)) throw new AuthError('INVALID_EMAIL');
  if (!password) throw new AuthError('PASSWORD_REQUIRED');
  const user = await call('/api/auth/login', { email: normalizeEmail(email), password });
  return toPublicUser(user);
}

export async function signOut() {
  try {
    await apiRequest('/api/auth/logout', { method: 'POST' });
  } catch {
    // Even if the request fails, the UI returns to the login screen.
  }
}

// Returns the logged-in user, or null when there is no valid session.
export async function fetchSession() {
  try {
    return toPublicUser(await apiRequest('/api/auth/me'));
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return null;
    throw error;
  }
}
