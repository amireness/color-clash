# Testing

Run `npm test` for the suite, `npm run lint` for boundary and code checks, `npm run typecheck` for strict TypeScript checking and `npm run build` for production bundling.

- Domain tests exercise deck counts and conservation, deterministic shuffling, move validation, all action types, draw and recycle behavior, winning, and input immutability.
- Application tests inject a fake repository and random source, verify accepted and rejected writes and check personalized projections.
- UI integration tests use the real engine, application service and in-memory repository with deterministic randomness and exercise the setup, board, bot scheduling and match controls in jsdom.

For a browser smoke test, play on both desktop and a narrow viewport. Tab through setup, reveal and card controls. Check the four color cues and enable reduced motion to verify hover transitions are suppressed.
