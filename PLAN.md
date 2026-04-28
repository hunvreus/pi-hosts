# pi-hosts Plan

## Goal

Extract the host-management capabilities from `maki` into a standalone Pi package with:

- JSON-backed inventory
- SSH-config bootstrap
- reliable SSH transport
- explicit host targeting
- deterministic risk checks
- confirm flow for risky commands

## Phase 0

- create standalone package
- copy current host inventory and target-resolution logic
- keep the current feature set working
- rename `remote_run` to `remote_exec`
- standardize on one slash command: `/hosts`

## Phase 1: Inventory

- JSON store at `~/.pi/agent/extensions/pi-hosts/hosts.json`
- host schema
- CRUD operations
- SSH config import
- alias and tag support
- active-host state for the turn
- concise system-prompt inventory injection
- unified `/hosts` command handler

Import modes should include:

- `preview`
- `create_only`
- `update_transport`
- `all`
- `aliases`

Exit criteria:

- `check web-1` resolves correctly
- `host_lookup` is structured
- `host_facts_refresh` persists facts
- hosts can be imported from `~/.ssh/config`
- `/hosts ...` covers list, lookup, import, facts, upsert, and remove

## Phase 2: Transport

- replace naive one-shot SSH path with a reusable transport layer
- add `BatchMode=yes`
- add `ConnectTimeout`
- add `ControlMaster=auto`
- add `ControlPersist`
- bound output size
- bound execution time
- make quoting robust

Borrow from:

- `pi-ssh`
- `pi-readonly-ssh`

Exit criteria:

- repeated remote exec does not reconnect every time
- large output and timeouts behave predictably

## Phase 3: Risk And Confirm

- deterministic risk classifier
- `safe` / `confirm` / `block`
- confirm flow for risky commands
- audit log for success, rejection, and confirmation

Signals should include:

- `sudo`
- shell metacharacters
- package installs/removals
- service mutations
- filesystem writes
- container or cluster mutations
- multi-host blast radius

Exit criteria:

- risky commands do not auto-run
- confirm payload includes host targets, command, and reasons

## Phase 4: Interactive Sessions

- persistent remote shell
- session ids
- bounded polling
- Ctrl-C support
- one-shot exec stays as the default path

Borrow from:

- `pi-unified-exec`
- `pi-ssh`

Exit criteria:

- long-running remote work no longer blocks the agent
- sessions can be resumed and interrupted cleanly

## Phase 5: Packaging

- npm package
- one-command install
- README quickstart
- sample `hosts.json`
- SSH import examples
- `/hosts` command examples
- migration notes from the local `maki` extension

## Non-Goals

- full CMDB
- cloud provisioning
- service topology modeling
- silent remapping of all local Pi tools to remote by default

## MVP

The MVP is done when a user can:

1. install `pi-hosts`
2. import a host from `~/.ssh/config` or add one manually
3. say `check web-1`
4. have Pi resolve the right host
5. run a command safely
6. get a confirm flow for risky actions
7. refresh and persist facts
