'use client';

import { useEffect } from 'react';
import { useUiLocale } from '../lib/i18n';

/**
 * Проставляет `<html lang>` по выбранному языку.
 *
 * В разметке атрибут статически русский: layout серверный и о выборе, который
 * лежит в браузере, не знает. Правим после гидрации — это обновление внешней
 * системы, DOM, а не состояние React, и эффект здесь ровно на своём месте.
 *
 * Атрибут не косметика. По нему скринридер выбирает голос и правила чтения, а
 * браузер — переносы: казахский текст, объявленный русским, читается вслух
 * неправильно.
 */
export function HtmlLang() {
  const locale = useUiLocale();

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return null;
}
