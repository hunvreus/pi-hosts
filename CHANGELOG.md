# Changelog

## [Unreleased]

## [0.1.2] - 2026-04-29

### Fixed

- Added the `pi-package` npm keyword required for pi.dev package gallery discovery.
- Removed the Pi coding agent package from runtime dependencies because it is only used for TypeScript types.

## [0.1.1] - 2026-04-28

### Fixed

- Improved command policy parsing for read-only shell control flow, newline-separated scripts, and benign redirections like `>/dev/null` and `2>&1`.

## [0.1.0] - 2026-04-28

### Added

- Initial Pi extension for host inventory, SSH config import, target resolution, facts refresh, guarded remote execution, and SSH sessions.
- Configurable command policy with `strict`, `balanced`, `paranoid`, `manual`, and `off` approval modes.
- Slash commands for host management, SSH import, facts refresh, and policy config inspection/reload.
- JSONL audit log for remote execution decisions and results.
