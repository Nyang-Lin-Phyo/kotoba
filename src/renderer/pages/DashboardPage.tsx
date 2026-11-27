export function DashboardPage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Milestone M1</p>
          <h1>Dashboard</h1>
          <p className="muted">
            No profile exists yet, so there is nothing real to show. Onboarding and daily plans
            arrive at M3; study modules start at M4.
          </p>
        </div>
        <span className="pill pill--warn">Not implemented</span>
      </header>

      <div className="grid">
        <article className="card">
          <h2>Study time today</h2>
          <p className="stat">—</p>
          <p className="muted">Target and actual minutes appear once the study timer exists (M4).</p>
        </article>
        <article className="card">
          <h2>New words today</h2>
          <p className="stat">—</p>
          <p className="muted">Word introduction needs the dictionary pipeline (M5).</p>
        </article>
        <article className="card">
          <h2>Due reviews</h2>
          <p className="stat">—</p>
          <p className="muted">Spaced repetition scheduling is implemented at M5.</p>
        </article>
      </div>

      <article className="card card--wide">
        <h2>What works right now</h2>
        <ul className="checklist">
          <li>Desktop shell, sidebar navigation and this dashboard route.</li>
          <li>Sandboxed renderer with a single typed preload API.</li>
          <li>Settings page reading live version data from the main process.</li>
        </ul>
      </article>
    </section>
  );
}
