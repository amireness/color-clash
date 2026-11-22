# Testing

Run `npm test` for the suite, `npm run lint` for boundary and code checks, `npm run typecheck` for strict TypeScript checking and `npm run build` for production bundling.

- Domain tests exercise deck counts and conservation, deterministic shuffling, move validation, all action types, draw and recycle behavior, winning, and input immutability.
- Application tests inject a fake repository and random source, verify accepted and rejected writes and check personalized projections.
- UI integration tests use the real engine, application service and in-memory repository with deterministic randomness and exercise the setup, board, bot scheduling and match controls in jsdom.

For a browser smoke test, play on both desktop and a narrow viewport. Tab through setup, reveal and card controls. Check the four color cues and enable reduced motion to verify hover transitions are suppressed.

Online integration tests launch a loopback WebSocket server and use independent connections to cover lobby setup, authorization, personalized state, stale moves, disconnect, resume and scoring. Application tests cover normal online victory and expiration.

Presentation tests use controlled timers for bot speeds, cancellation, reduced motion, and action order. Statistics tests use a deterministic deal and controlled clock. For a visual browser check, play a Wild Draw Four with motion enabled and accept the penalty on the next turn. Observe the four face-down draws, skip message, and active-seat change in sequence.
