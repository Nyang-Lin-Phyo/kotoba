import type { KanaGroup, KanaStatus } from '../../../shared/contracts';

const STATUS_LABELS: Record<KanaStatus, string> = {
  unseen: 'Not studied',
  learning: 'Learning',
  verified: 'Verified recognition',
  struggling: 'Struggling',
};

type Props = {
  readonly groups: readonly KanaGroup[];
  readonly statuses: Readonly<Record<string, KanaStatus>>;
  readonly dueIds: ReadonlySet<string>;
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
};

export function KanaChart({ groups, statuses, dueIds, selectedId, onSelect }: Props) {
  return (
    <div className="kana-chart">
      {groups.map((group) => (
        <section className="kana-group" key={group.id}>
          <h3 className="kana-group-title">
            {group.label}
            {group.tier === 'extended' && <span className="muted"> · extended</span>}
          </h3>
          <div className="kana-grid">
            {group.items.map((item) => {
              const status = statuses[item.id] ?? 'unseen';
              return (
                <button
                  key={item.id}
                  type="button"
                  className={[
                    'kana-cell',
                    `kana-cell--${status}`,
                    dueIds.has(item.id) ? 'kana-cell--due' : '',
                    item.id === selectedId ? 'kana-cell--selected' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(item.id)}
                  title={`${item.reading} — ${STATUS_LABELS[status]}`}
                  aria-label={`${item.character}, ${STATUS_LABELS[status]}`}
                  aria-pressed={item.id === selectedId}
                >
                  <span className="kana-cell-char">{item.character}</span>
                  <span className="kana-cell-status">{STATUS_LABELS[status]}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
