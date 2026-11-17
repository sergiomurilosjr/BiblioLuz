import React, { useState, useEffect } from 'react';
import { Book as BookIcon } from 'lucide-react';
import { motion } from 'motion/react';
import { testConnection } from '../lib/firebase';
import { SelfServiceView } from './SelfServiceView';

export default function AutoatendimentoApp() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      if (typeof window !== 'undefined') {
        return (localStorage.getItem('biblio-theme') as 'light' | 'dark') || 'light';
      }
    } catch {
      // ignore storage errors
    }
    return 'light';
  });

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove('light', 'dark');
    root.classList.add(theme);
    try {
      localStorage.setItem('biblio-theme', theme);
    } catch {
      // ignore storage errors
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
  };

  return (
    <div className={`${theme} min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors duration-300`}>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="min-h-screen flex flex-col"
      >
        <header className="bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 sticky top-0 z-30">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-8">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shrink-0">
                <BookIcon size={17} strokeWidth={2.5} />
              </div>
              <span className="font-display font-bold tracking-tight text-slate-800 dark:text-slate-100 whitespace-nowrap shrink-0">
                BiblioLuz
              </span>
            </div>
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">
              Centro Espírita Pedra de Luz
            </span>
          </div>
        </header>

        <main className="flex-1 w-full max-w-5xl mx-auto px-6 py-8 md:py-12">
          <SelfServiceView
            standalone
            theme={theme}
            onToggleTheme={toggleTheme}
          />
        </main>
      </motion.div>
    </div>
  );
}
