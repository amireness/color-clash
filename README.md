# Color Clash

Color Clash is an original browser card game. Match the active color, number, or action and be the first to empty your hand.

- **Play vs Bots** pits one player against 1–3 bots with adjustable pacing.
- **Play with Friends** supports 2–4 players in private rooms with invite codes, lobby readiness, and reconnects.
- Both modes include a responsive board, accessible card labels, reduced-motion support, and match statistics.

## Screenshots

| Bot match          | Friends lobby      | Match summary      |
| ------------------ | ------------------ | ------------------ |
| Screenshot pending | Screenshot pending | Screenshot pending |

## Local setup

Use Node.js 22.12+ on the 22.x line or Node.js 24.x, with npm. From the repository root, install the locked dependencies and start the frontend:

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. For online play, start the WebSocket server in a second terminal:

```sh
npm run server
```

Vite proxies `/color-clash-ws` to the room server on `127.0.0.1:8787`. To use a different port, export `ROOM_PORT` with the same value in both terminal environments before starting the processes.

### Play vs Bots

Choose **Play vs Bots**, enter a name, select the number of opponents, and deal the cards. Bot matches run entirely in the browser. Use **Game menu** to change bot speed.

### Play with Friends

With both processes running, choose **Play with Friends** and create a private room. Share the six-character code or invite link. Each player joins from a separate browser tab or device and marks themselves ready. The host then starts the match. To reconnect, refresh the same tab.

For devices on a trusted LAN, use `npm run dev -- --host 0.0.0.0` and share the LAN URL printed by Vite. A room code works only for players using the same running room server.

## Rules and house rules

- Each player starts with seven cards. Match the active color, number, or action, or play a Wild. You can draw instead of playing. If the drawn card is legal, you may play it or end your turn.
- The deck includes **Skip**, **Reverse**, **Draw Two**, **Wild**, and **Wild Draw Four**. With two players, Reverse also skips the other player.
- **Penalty stacking** is enabled in both modes. +2 stacks with +2, and +4 stacks with +4. A +4 requires a color choice. The target may accept the accumulated draw and lose their turn.
- **Identical-number batches** are optional. Enable them in bot setup or as the online host before starting. Matching numbers of the same color can be played together in one turn.
- **End & Score** ends the match early. The fewest cards wins, and equal lowest counts tie. **Exit Game** leaves without recording a result.

See the [full game rules](docs/GAME_RULES.md) for deck composition, reshuffles, and last-card effects.

## Development checks

| Command                | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `npm test`             | Run domain, application, UI, and WebSocket integration tests |
| `npm run test:watch`   | Run tests in watch mode                                      |
| `npm run lint`         | Check code and architectural import boundaries               |
| `npm run typecheck`    | Check TypeScript types                                       |
| `npm run format:check` | Check Prettier formatting                                    |
| `npm run format`       | Apply Prettier formatting                                    |
| `npm run build`        | Type-check and build the frontend into `dist/`               |
| `npm run preview`      | Preview that build locally                                   |

## Architecture

Bot and online matches share a pure TypeScript engine and player-specific projections. React renders the board and animations. The room server validates online commands and sends each seat its own view. WebSocket transport and in-memory storage sit behind application boundaries.

[Architecture and online rooms](docs/ARCHITECTURE.md) · [Architecture review](docs/ARCHITECTURE_REVIEW.md) · [Design decisions](docs/DECISIONS.md) · [Testing](docs/TESTING.md)

## Hosting and current limitations

- The browser connects to its own host at `/color-clash-ws`, using `wss:` when the page is served over HTTPS. The production build has no environment variable for a separate WebSocket URL.
- For public hosting, serve `dist/` over HTTPS and reverse-proxy `/color-clash-ws` to the running room server. The proxy must forward WebSocket upgrades and preserve the public `Host` header for the server's origin check. The Node room server listens on loopback and does not terminate TLS. Keep development dependencies installed on the server runtime if starting it with `npm run server`, which uses `tsx`.
- Online rooms and statistics live in memory. The room server must stay running. A restart clears every room, and inactive rooms expire after one hour. A bot match resets when the page reloads.

The production hosting path has not been verified behind a public reverse proxy.
