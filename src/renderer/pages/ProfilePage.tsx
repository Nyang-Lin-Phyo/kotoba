export function ProfilePage() {
  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Milestone M3</p>
          <h1>My Profile</h1>
          <p className="muted">
            Profile creation, start date, goals and progress history are not built yet.
          </p>
        </div>
        <span className="pill pill--warn">Not implemented</span>
      </header>

      <article className="card card--wide">
        <h2>Planned contents</h2>
        <ul className="checklist checklist--muted">
          <li>Name, start date and study horizon (M3).</li>
          <li>Daily minutes and new-word goals with effective dates (M3, M6).</li>
          <li>Introduced, learning, struggling and verified-known counts (M5).</li>
          <li>Review accuracy and kana progress (M4, M5).</li>
        </ul>
        <p className="muted">
          No numbers are shown here on purpose: inventing them would misrepresent your progress.
        </p>
      </article>
    </section>
  );
}
