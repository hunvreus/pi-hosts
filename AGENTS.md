# Agent Rules

## Communication
- Keep answers concise, technical, and to the point.
- Do not use filler or glazing openers.
- If only part of requested scope is implemented, state exactly what was not included.

## Pi Extension Reference
- This repository is a Pi extension package.
- Before changing extension loading, commands, tools, flags, lifecycle hooks, or packaging behavior, check the official Pi extension docs:
  - https://pi.dev/docs/latest/extensions
- For Pi settings and project/global resource loading, check:
  - https://pi.dev/docs/latest/settings

## Architecture
- Keep the extension entrypoint thin.
- Put inventory, config, policy, audit, transport, import, and command routing in separate modules.
- Keep runtime behavior explicit: resolve host targets before remote execution.
- Keep SSH config import explicit. `~/.ssh/config` is an import source, not live state.
- Keep host inventory JSON-backed unless the user explicitly asks for another store.

## Policy And Safety
- Remote execution policy must be deterministic and auditable.
- Prefer explicit config-driven rules over hidden prompt-only safety behavior.
- Treat parse errors, ambiguous command structure, and unknown high-impact commands conservatively.
- Do not silently weaken confirmation/block behavior to improve convenience.

## TypeScript
- Use strict TypeScript at public boundaries.
- Prefer typed imports and narrow interfaces.
- Do not use `any` unless unavoidable; keep scope narrow and document why.
- Check dependency type definitions before assuming external API shapes.

## Code Style
- Prefer function-first modules and small files.
- Keep control flow explicit.
- Use simple data structures and deterministic behavior.
- Add comments only for non-obvious intent, invariants, edge cases, and tradeoffs.

## Docs
- Update README or the relevant docs when behavior, config, commands, flags, or workflows change.
- Keep examples aligned with current behavior.
- If scope is partial, document what is intentionally not implemented.
