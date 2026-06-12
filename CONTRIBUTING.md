# Contributing

## Dev setup

```bash
nvm use                # Node 22 (.nvmrc) — required, the suite is run on it
npm ci
cp .env.example .env   # set ANTHROPIC_API_KEY for LLM runs (not needed for tests)
npm run dev            # server + scheduler, pretty logs
```

## Quality gates

One entry point runs everything CI runs:

```bash
npm run check          # build → typecheck → lint → format:check → tests + coverage gates
```

Run it before every commit and make sure it is green. Individual gates:

| Command                           | What it does                                                             |
| --------------------------------- | ------------------------------------------------------------------------ |
| `npm run typecheck`               | `tsc --noEmit` over src incl. tests                                      |
| `npm run lint`                    | type-checked ESLint, zero warnings tolerated                             |
| `npm run format` / `format:check` | Prettier (printWidth 120, single quotes)                                 |
| `npm test`                        | node:test, integration tests use in-memory SQLite                        |
| `npm run test:coverage`           | c8 with ratchet thresholds: 85% stmts/lines, 80% branches, 88% functions |

Coverage thresholds are a **ratchet**: they sit at the measured floor and only
move up as tests are added — never lower them to make a commit pass.

## Conventions

- Everything in the repo is **English**: code, comments, commit messages, docs.
- Commit messages: imperative subject + body explaining what and why.
  No AI attribution trailers.
- Architecture is ports & adapters — see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
  for the module contract (how to add a news source or an output channel).
- Work tracking: active items live in [TODO.md](TODO.md); finished work moves to
  [DONE.md](DONE.md) with the date.
- Dependency updates arrive as one grouped Dependabot PR per ecosystem per month;
  merge them through the PR, never by hand.
