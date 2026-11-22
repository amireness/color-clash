import type { TableView } from "../application/player-view";

export function MatchSummary({
  summary,
}: {
  summary: NonNullable<TableView["summary"]>;
}) {
  const seconds = Math.floor(summary.durationMs / 1000);
  const duration = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const totals = [
    ["Turns", summary.turns],
    ["Played", summary.played],
    ["Drawn", summary.drawn],
    ["Action cards", summary.actions],
    ["Wilds", summary.wilds],
    ["Duration", duration],
  ] as const;
  return (
    <section className="match-summary" aria-labelledby="summary-heading">
      <h2 id="summary-heading">Match summary</h2>
      <dl className="match-totals">
        {totals.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <table>
        <caption>Player statistics</caption>
        <thead>
          <tr>
            <th scope="col">Player</th>
            <th scope="col">Left</th>
            <th scope="col">Played</th>
            <th scope="col">Drawn</th>
          </tr>
        </thead>
        <tbody>
          {summary.players.map((player) => (
            <tr key={player.id}>
              <th scope="row">{player.name}</th>
              <td>{player.remaining}</td>
              <td>{player.played}</td>
              <td>{player.drawn}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
