import { useEffect } from 'react';
import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { useT } from '@/i18n';
import { useTheme } from '@/lib/theme';
import { useSettings } from '@/store/settings';
import { detectLocale } from '@/i18n';
import { PlannerPage } from '@/pages/PlannerPage';
import { HistoryPage } from '@/pages/HistoryPage';
import { GaragePage } from '@/pages/GaragePage';
import { TariffPage } from '@/pages/TariffPage';
import { SettingsPage } from '@/pages/SettingsPage';

const NAV = [
  { to: '/', key: 'planner', icon: '⚡' },
  { to: '/history', key: 'history', icon: '📊' },
  { to: '/garage', key: 'garage', icon: '🚗' },
  { to: '/tariff', key: 'tariff', icon: '💡' },
  { to: '/settings', key: 'settings', icon: '⚙️' },
] as const;

export function App() {
  const t = useT();
  const { isDark } = useTheme();
  const hydrated = useSettings((state) => state.hydrated);
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);

  // On a first visit there is nothing stored yet, so follow the browser's language.
  useEffect(() => {
    if (hydrated && !localStorage.getItem('evcp-locale-set')) {
      update({ locale: detectLocale() });
      localStorage.setItem('evcp-locale-set', '1');
    }
  }, [hydrated, update]);

  useEffect(() => {
    document.documentElement.lang = settings.locale;
  }, [settings.locale]);

  return (
    <div className="min-h-dvh bg-app text-ink">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-3 focus:py-2"
      >
        {t.nav.planner}
      </a>

      <header className="sticky top-0 z-30 border-b border-line bg-app/85 backdrop-blur-xl">
        <div
          className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3"
          style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span aria-hidden="true" className="text-xl">
              ⚡
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold tracking-tight">{t.app.name}</div>
              <div className="truncate text-xs text-faint">{t.app.tagline}</div>
            </div>
          </div>

          <nav className="hidden gap-1 sm:flex" aria-label={t.app.name}>
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === '/'}
                className={({ isActive }) =>
                  `rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                    isActive ? 'bg-raised text-ink' : 'text-muted hover:text-ink'
                  }`
                }
              >
                {t.nav[item.key]}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main id="main" className="mx-auto max-w-5xl px-4 pb-28 pt-4 sm:pb-10">
        <Routes>
          <Route path="/" element={<PlannerPage isDark={isDark} />} />
          <Route path="/history" element={<HistoryPage isDark={isDark} />} />
          <Route path="/garage" element={<GaragePage />} />
          <Route path="/tariff" element={<TariffPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav
        aria-label={t.app.name}
        className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-app/90 backdrop-blur-xl sm:hidden"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="mx-auto grid max-w-5xl grid-cols-5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors ${
                  isActive ? 'text-accent' : 'text-muted'
                }`
              }
            >
              <span aria-hidden="true" className="text-lg leading-none">
                {item.icon}
              </span>
              {t.nav[item.key]}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
