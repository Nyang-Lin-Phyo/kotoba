import { HashRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { DashboardPage } from './pages/DashboardPage';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';

function NotFoundPage() {
  return (
    <section className="page">
      <h1>Not found</h1>
      <p className="muted">That screen does not exist yet. Use the sidebar.</p>
    </section>
  );
}

// Hash routing keeps deep links working from file:// in the packaged app.
export function App() {
  return (
    <HashRouter>
      <div className="shell">
        <Sidebar />
        <div className="main-column">
          <TopBar />
          <main className="content">
            <Routes>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/profile" element={<ProfilePage />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
}
