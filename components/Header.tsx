
import React from 'react';

interface HeaderProps {
  onLogout?: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onOpenProfile: () => void;
  userName: string;
}

const Header: React.FC<HeaderProps> = ({ onLogout, darkMode, onToggleDarkMode, onOpenProfile, userName }) => {
  return (
    <header className="sticky top-0 z-50 w-full bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl border-b border-slate-200 dark:border-slate-800 transition-all duration-300">
      <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between py-4">
        <div className="flex items-center gap-3 group cursor-pointer" onClick={() => window.location.reload()}>
          <div className="w-10 h-10 bg-gradient-to-tr from-indigo-600 to-cyan-500 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-500/20 group-hover:scale-110 transition-transform duration-300">
            <svg className="w-6 h-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-700 dark:from-white dark:to-slate-400">
              LastMinute
            </h1>
            <p className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400 uppercase tracking-widest leading-none">Pro Assistant</p>
          </div>
        </div>
        
        <div className="hidden lg:flex items-center gap-8 text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
          <button className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Library</button>
          <button className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Resources</button>
          <button className="hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">Pricing</button>
        </div>

        <div className="flex items-center gap-2 sm:gap-4">
          <button 
            onClick={onToggleDarkMode}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 transition-all border border-slate-200 dark:border-slate-800"
          >
            {darkMode ? (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" />
              </svg>
            ) : (
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <button 
            onClick={onOpenProfile}
            className="flex items-center gap-3 pl-3 sm:pl-4 pr-1 sm:pr-1.5 py-1 sm:py-1.5 rounded-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 transition-all shadow-sm"
          >
            <span className="text-xs font-bold text-slate-700 dark:text-slate-200 hidden sm:inline">{userName.split(' ')[0]}</span>
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-600 to-cyan-500 flex items-center justify-center text-white text-[10px] font-black">
              {userName.charAt(0).toUpperCase()}
            </div>
          </button>

          {onLogout && (
            <button 
              onClick={onLogout}
              className="flex w-10 h-10 items-center justify-center rounded-xl bg-red-50 dark:bg-red-900/10 text-red-600 dark:text-red-400 hover:bg-red-100 transition-all border border-red-100 dark:border-red-900/30"
              title="Sign Out"
              aria-label="Sign Out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;
