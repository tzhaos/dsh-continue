## [1.5.0] - 2026-10-19

### Changed

- Continue no longer borrows the Goal service. The Host half registers `POST /dsh-continue/round`,
  which queues one user message with `source: { kind: 'continue', form: 'notice' }` through the live
  agent's `followup()` — the same path a Goal round uses, without creating, arming, or clearing a
  goal. The client keeps `session.prompt()` as a fallback when the route is unavailable.
- The chat shows one expandable trigger card for that turn instead of a normal user bubble. The
  browser half relabels it to **继续对话 / Continue conversation** and swaps in a play glyph; the
  injected round time is stored in `localStorage`, so the label also survives a reload.
- Removed the Goal-bar hiding code, the Goal remote dependency and the Goal round bookkeeping.

### Verified

- `node scripts/check.mjs`: 27 checks green (including the new route, fallback and card tests).

## [1.4.1] - 2026-10-19

### Fixed

- Continue clicks failed silently with `cannot get property "remote" without inject`: the plugin read
  `ctx.remote.goals` but only declared `remote.goals` in its inject list. `remote` is now declared,
  the access is defensive, and the adopted button's tooltip shows the failure text.
- Live diagnostics captured seven consecutive `continue-error` entries with that message, confirming
  the root cause.

## [1.4.0] - 2026-10-19

### Fixed

- The adopted send button no longer goes dead: React re-renders the composer button on every snapshot
  change and resets `disabled`, which used to re-disable the Continue button after adoption. A
  mutation guard now re-asserts the adopted state (enabled, label, tooltip, marker class) until the
  Continue state ends.

### Changed

- The adopted send button now shows a **solid play glyph** (CSS clip-path) instead of the Host's send
  arrow while Continue is available.

### Added

- Temporary diagnostics: eligibility transitions, adoption, click, goal get/create/clear results and
  goal phase changes are appended to the same `queue-withdraw-diag.jsonl` sink used by
  dsh-queue-withdraw. Remove once Continue is confirmed working.

### Verified

- `node scripts/check.mjs`: 24 checks green.

## [1.3.2] - 2026-10-19

### Fixed

- Read `remote.goals.get()` as the goal view itself (not `{ goal }`), so an existing goal is
  detected and cleared correctly.
- Added a regression test that Continue creates a Goal and submits no user prompt.

### Verified

- `node scripts/check.mjs`: 22 checks green.

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
