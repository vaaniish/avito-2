import { Info } from "lucide-react";

export type ScoreExplanationRow = {
  label: string;
  points: number;
  reason: string;
};

type ScoreExplanationProps = {
  label: string;
  value: number;
  title: string;
  formula?: string;
  rows: ScoreExplanationRow[];
  notes: string[];
  tone?: "neutral" | "warning";
};

function formatPoints(value: number): string {
  if (value > 0) return `+${value}`;
  return String(value);
}

export function ScoreExplanation({
  label,
  value,
  title,
  formula,
  rows,
  notes,
  tone = "neutral",
}: ScoreExplanationProps) {
  const hasRows = rows.length > 0;

  return (
    <span
      className="score-explanation"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <span
        className={`score-explanation__trigger score-explanation__trigger--${tone}`}
        tabIndex={0}
        aria-label={`${label} ${value}. Наведите или сфокусируйтесь, чтобы увидеть расчет.`}
      >
        <span>
          {label} {value}
        </span>
        <Info className="score-explanation__icon" aria-hidden="true" />
      </span>
      <span className="score-explanation__panel" role="tooltip">
        <span className="score-explanation__title">{title}</span>
        {formula ? <span className="score-explanation__formula">{formula}</span> : null}
        <span className="score-explanation__section">
          {hasRows ? (
            rows.map((row) => (
              <span className="score-explanation__row" key={`${row.label}-${row.points}`}>
                <span className="score-explanation__rowTop">
                  <span>{row.label}</span>
                  <span className={row.points < 0 ? "score-explanation__minus" : "score-explanation__plus"}>
                    {formatPoints(row.points)}
                  </span>
                </span>
                <span className="score-explanation__reason">{row.reason}</span>
              </span>
            ))
          ) : (
            <span className="score-explanation__empty">Сработавших факторов нет.</span>
          )}
        </span>
        {notes.length > 0 ? (
          <span className="score-explanation__notes">
            {notes.map((note) => (
              <span key={note}>{note}</span>
            ))}
          </span>
        ) : null}
      </span>
    </span>
  );
}
