'use client';

/**
 * Сильнейшая черта последнего пройденного теста — чтобы аватар не пропадал,
 * когда человек уходит с экрана результата.
 *
 * Хранится в браузере, потому что на сервере ей пока негде лежать: профиль
 * интересов привязан к сессии (`Session.interestProfile`), а не к пользователю,
 * и у `AuthUser` поля под него нет. Заводить колонку и ручку ради картинки в
 * шапке — работа на бэкенде и миграция; аватар столько не стоит.
 *
 * Цена решения та же, что у ожидания в lib/expectation: на другом устройстве
 * шапка покажет первую букву имени, а не знак черты. Это видно, но не ломает
 * ничего — на экранах теста и результата аватар живёт от настоящих сигналов и
 * в хранилище не заглядывает.
 *
 * Наружу торчит подпиской, а не парой «прочитать в эффекте — положить в
 * состояние»: чтение localStorage прямо в рендере разошлось бы с разметкой с
 * сервера, где хранилища нет, а setState в теле эффекта тянет лишний каскад
 * рендеров и запрещён линтером. useSyncExternalStore решает обе задачи разом и
 * заодно даёт то, чего у эффекта не было, — шапка меняется в тот же момент,
 * когда экран результата дописал черту, без перехода по страницам.
 */
import { useSyncExternalStore } from 'react';

const KEY = 'careerverse:face';

const listeners = new Set<() => void>();

export function rememberFace(trait: string | null): void {
  if (!trait) return;
  try {
    localStorage.setItem(KEY, trait);
  } catch {
    // Приватный режим и заблокированное хранилище — не повод ронять шапку.
  }
  // Событие `storage` браузер шлёт только в соседние вкладки, поэтому свою
  // будим руками.
  listeners.forEach((notify) => notify());
}

function subscribe(notify: () => void): () => void {
  listeners.add(notify);
  window.addEventListener('storage', notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener('storage', notify);
  };
}

/** Строки сравниваются по значению, поэтому лишних перерисовок это не даёт. */
function snapshot(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/** На сервере черты нет: первый кадр всегда без неё, дальше уточняется. */
const serverSnapshot = (): string | null => null;

export function useFace(): string | null {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
