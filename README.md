# Color Clash

Color Clash is an original color-matching card game for one human against one to three computer opponents. Match a color, number or action, manage your hand and be the first player to empty it.

- One human hand with automated opponents
- Number cards, Skip, Reverse, Draw Two, Wild and Wild Draw Four
- Keyboard controls, labeled color symbols and a responsive board
- Rematches with the same players

Built with TypeScript, React, Vite and CSS. Vitest and React Testing Library cover the rules and player flow. ESLint checks import boundaries and Prettier formats the project.

## Run locally

Use Node.js 20.19+ or 22.12+ on a supported release line.

```sh
npm ci
npm run dev
```

Open the localhost address printed by Vite. Matches live in memory and refresh clears the table.

| Command                | Purpose                           |
| ---------------------- | --------------------------------- |
| `npm test`             | Run the test suite                |
| `npm run test:watch`   | Rerun affected tests as you edit  |
| `npm run lint`         | Check code and layer imports      |
| `npm run typecheck`    | Check TypeScript types            |
| `npm run build`        | Type-check and build into `dist/` |
| `npm run preview`      | Preview the production build      |
| `npm run format`       | Format the project                |
| `npm run format:check` | Check formatting                  |

## Design

The TypeScript engine owns rules and returns state transitions. A framework-independent application service invokes the engine, saves state through a port, and projects views for React. The local composition root supplies persistence and randomness.

- [Architecture and online roadmap](docs/ARCHITECTURE.md)
- [Game rules](docs/GAME_RULES.md)
- [Design decisions](docs/DECISIONS.md)
- [Testing](docs/TESTING.md)
