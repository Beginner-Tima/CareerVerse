'use client';

import { useCallback, useEffect, useState } from 'react';
import { getMe, type AuthUser } from './api';

/**
 * Аккаунт живёт в localStorage: почты и пароля мы не спрашиваем, поэтому
 * восстановить сессию можно только токеном на этом устройстве или кодом входа.
 * Об этом честно написано на экране регистрации.
 */
const TOKEN_KEY = 'careerverse.token';
const USER_KEY = 'careerverse.user';

// Вкладки одного человека должны видеть один и тот же баланс очков: после
// разбора у наставника шапка обязана обновиться, а не показывать старое число.
const CHANGED = 'careerverse:auth-changed';

export function readToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function saveSession(token: string, user: AuthUser) {
  window.localStorage.setItem(TOKEN_KEY, token);
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(CHANGED));
}

export function updateUser(user: AuthUser) {
  window.localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event(CHANGED));
}

export function clearSession() {
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(CHANGED));
}

function readUser(): AuthUser | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  // До первого чтения localStorage мы не знаем, вошёл человек или нет:
  // без этого флага шапка успевает мигнуть кнопкой «Войти» вошедшему.
  const [ready, setReady] = useState(false);

  const sync = useCallback(() => {
    setToken(readToken());
    setUser(readUser());
    setReady(true);
  }, []);

  useEffect(() => {
    sync();
    window.addEventListener(CHANGED, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener('storage', sync);
    };
  }, [sync]);

  /** Подтягивает свежие очки с сервера — локальная копия быстро устаревает. */
  const refresh = useCallback(async () => {
    const current = readToken();
    if (!current) return null;
    try {
      const me = await getMe(current);
      updateUser(me.user);
      return me;
    } catch {
      // Токен протух или аккаунт удалён — молча выходим, а не показываем ошибку
      // человеку, который просто открыл главную.
      clearSession();
      return null;
    }
  }, []);

  return { user, token, ready, refresh, logout: clearSession };
}
