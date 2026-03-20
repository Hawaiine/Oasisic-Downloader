// hooks/useTheme.js
// 三种模式: 'dark' | 'light' | 'auto' (跟随系统)
import { useState, useEffect } from 'react';

const STORAGE_KEY = 'ymd-theme';

function getSystemTheme() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(mode) {
  if (mode === 'auto') {
    document.documentElement.setAttribute('data-theme', getSystemTheme());
  } else {
    document.documentElement.setAttribute('data-theme', mode);
  }
}

export function useTheme() {
  const [mode, setMode] = useState(() => localStorage.getItem(STORAGE_KEY) || 'auto');

  // Apply theme whenever mode changes
  useEffect(() => {
    applyTheme(mode);
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  // When mode=auto, watch system changes
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => { if (mode === 'auto') applyTheme('auto'); };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode]);

  // Effective theme (for icon display)
  const effectiveTheme = mode === 'auto' ? getSystemTheme() : mode;

  return { mode, setMode, effectiveTheme };
}
