import { useCallback, useEffect, useState } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';
import type { ProfileState } from '../shared/contracts';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { OnboardingWizard } from './features/onboarding/OnboardingWizard';
import { ProfileContext } from './lib/profileContext';
import { DictionaryPage } from './features/dictionary/DictionaryPage';
import { ReviewsPage } from './features/reviews/ReviewsPage';
import { VocabularyPage } from './features/vocabulary/VocabularyPage';
import { KanaPage } from './features/kana/KanaPage';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

type BootState =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly profile: ProfileState | null };

function NotFoundPage() {
  return (
    <section className="page">
      <h1>Not found</h1>
      <p className="muted">That screen does not exist yet. Use the sidebar.</p>
    </section>
  );
}

function BootScreen({ message, onRetry }: { message: string | null; onRetry?: () => void }) {
  return (
    <div className="boot">
      <div className="boot-card">
        <span className="brand-mark boot-mark" aria-hidden="true">
          言
        </span>
        <h1>{message === null ? 'Opening Kotoba' : 'Kotoba could not start'}</h1>
        {message === null ? (
          <p className="muted">Reading your local profile…</p>
        ) : (
          <>
            <p className="error">{message}</p>
            {onRetry !== undefined && (
              <button type="button" className="button" onClick={onRetry}>
                Try again
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// Hash routing keeps deep links working from file:// in the packaged app.
export function App() {
  const [boot, setBoot] = useState<BootState>({ status: 'loading' });

  const load = useCallback(async () => {
    setBoot({ status: 'loading' });
    const result = await window.kotoba.profiles.getActive();
    if (!result.ok) {
      setBoot({ status: 'error', message: result.error.message });
      return;
    }
    setBoot({ status: 'ready', profile: result.data });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (boot.status === 'loading') {
    return <BootScreen message={null} />;
  }

  if (boot.status === 'error') {
    return <BootScreen message={boot.message} onRetry={() => void load()} />;
  }

  // First launch: no profile exists, so the shell (and its sidebar) is not shown yet.
  if (boot.profile === null) {
    return <OnboardingWizard onCreated={load} />;
  }

  return (
    <ProfileContext.Provider value={{ state: boot.profile, reload: load }}>
      <HashRouter>
        <div className="shell">
          <Sidebar />
          <div className="main-column">
            <TopBar />
            <main className="content">
              <Routes>
                <Route path="/" element={<DashboardPage />} />
                <Route path="/profile" element={<ProfilePage />} />
                <Route path="/hiragana" element={<KanaPage script="hiragana" />} />
                <Route path="/katakana" element={<KanaPage script="katakana" />} />
                <Route path="/dictionary" element={<DictionaryPage />} />
                <Route path="/vocabulary" element={<VocabularyPage />} />
                <Route path="/reviews" element={<ReviewsPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </main>
          </div>
        </div>
      </HashRouter>
    </ProfileContext.Provider>
  );
}
