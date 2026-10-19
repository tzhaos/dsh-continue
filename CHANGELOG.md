## [1.3.1] - 2026-10-19

### Fixed

- Hide the goal-trigger attribution row (`[data-turn-trigger]`, “继续执行目标”) for internally
  created Goal rounds as well as the GoalBar, so the continuation does not expose Goal UI.

### Verified

- `node scripts/check.mjs`: 21 checks green.

## [1.3.0] - 2026-10-19

### Changed

- Continue now starts a Goal round through the Host Goal service instead of submitting a visible
  “继续” user message. The GoalBar for this internally-created goal is hidden while it runs and the
  goal is cleared when the round completes, so the continuation appears as normal assistant work.
- Fall back to the queued prompt only when the deployment has no Goal service.

### Verified

- `node scripts/check.mjs`: 21 checks green.

## [1.2.0] - 2026-10-19

### Changed

- Continue now reuses the Host's normal send button while a terminal turn is idle, instead of
  adding a separate play button beside the composer.
- The Host send button is enabled for the continuation click and routes it through the queued
  prompt path; the hidden React shim only carries the slot lifecycle.

### Verified

- `node scripts/check.mjs`: 20 checks green.

# Changelog

All notable changes to this project are documented in this file.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.1] - 2026-10-18

### Fixed

- Continue no longer appears after a normal `completed` turn (or a `forked` ending). It is now
  limited to `aborted`, `blocked`, `error`, `max-tokens`, `interrupted` and trailing `turn/start`
  interruption states, so ordinary finished conversations are not treated as resumable.

### Verified

- `node scripts/check.mjs`: 19 checks green, including the completed/forked exclusions and the
  blocked/error/max-tokens inclusions.

## [1.1.0] - 2026-10-18

### Changed

- Continue is no longer a separate pill in the composer controls. When the input is empty and the
  last turn is terminal, a play control overlays the Host send button at its exact size and position.
- Typing text or adding attachments hides the play control and restores the normal send button.
- The overlay tracks the Host primary button through DOM mutations, resize and scroll; clicking it
  submits through the same Session `prompt()` path.
- A rejected prompt restores the play control with an error tooltip.

### Verified

- `node scripts/check.mjs`: 18 checks green, including overlay positioning, composer-empty gating,
  submit success/failure and pending-state reset.

## [1.0.0] - 2026-10-18

### Added

- Continue action in the composer's right control cluster when the latest turn reached a terminal
  state (`turn/end`) or stopped with a trailing `turn/start`.
- Visibility guards for running, blank, loading, removed, subagent and pending-submission states.
- One-click queued prompt submission through `Session.prompt()` with a local submission echo.
- Localized button label, tooltip, prompt text and failure message.

### Verified

- `node scripts/check.mjs`: 18 checks green.
- Built against DeepSeek Harness `0.2.1-rc.2`; client APIs remain pre-stable.
