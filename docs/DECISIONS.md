# Design decisions

- **Immutable transitions.** Commands produce a snapshot and explicit events or a rejection. This gives deterministic tests and leaves the prior snapshot available. Shared immutable structures reduce copying. Trusted adapters must treat loaded snapshots as read-only.
- **Injected randomness.** Fisher–Yates uses a supplied stream. Replaying a deal requires the same random stream. The local browser adapter uses `Math.random()`.
- **Synchronous, in-memory repository.** One tab runs one match and each command commits before the next. This keeps adapter and application contracts small. Refresh or closure discards the session.
- **Explicit pending actions.** A playable draw restricts play to the drawn card, and a Wild remains in hand until the color is chosen. This makes a Wild finish and post-draw choice straightforward to validate.
- **Original card faces.** CSS, typography and geometric glyphs provide distinct color and action cues using bundled application code and system fonts.
