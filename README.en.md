# dsh-continue

[简体中文](README.md) | English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web client plugin that turns the
composer send button into a **solid play control** when the input is empty and the last turn was
stopped, interrupted or truncated. No more typing “continue” after an abnormal ending.

![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4D6BFE)
![Version](https://img.shields.io/badge/version-1.5.0-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![Checks](https://img.shields.io/badge/checks-27-brightgreen)

## Why

After a task is stopped, interrupted or truncated, continuing it usually means typing “continue”
into the composer. That keystroke carries no information and breaks the flow. Normally completed
and forked turns never show the control.

`dsh-continue` turns it into a button:

- renders a play control exactly over the Host send button when the conversation is idle, the input
  is empty, and the last turn reached a terminal state; the Host arrow is replaced by a solid play
  triangle and re-asserted after React re-renders
- covers user-stopped, blocked, error-ended, max-token and trailing `turn/start` interruption states;
  normal `completed` and `forked` turns stay hidden
- typing or adding an attachment restores the normal send button immediately
- a click injects one hidden user message through this plugin's own Host route
  (`source.kind = 'continue'`) — the Goal service is not involved
- no ordinary user bubble appears: the Host renders one expandable trigger card, relabelled to
  **“Continue conversation”** (the round time is remembered, so the label survives a restart)
- no draft insertion, no attachments, and no path other than the normal Session admission flow

## Visibility

The button appears only when all of these hold:

- the Session is open and not blank
- `running === false`
- there are no pending local submissions
- the latest `turn/end` reason is `aborted`, `blocked`, `error`, `max-tokens` or `interrupted`, or a
  trailing `turn/start` has no end (abnormal stop)
- the Session is not a subagent

It stays hidden while the task is running, while the Session is loading, and when the Session is
removed.

## Behavior

Clicking **Continue**:

1. resolves the retained Session through `sessions.binding(sessionId).session`;
2. posts `/dsh-continue/round`; the Host half calls
   `agent.followup({ role: 'user', content, source: { kind: 'continue', form: 'notice' } })`;
3. that message enters `next-turn` and wakes one turn — the same queue and lifecycle a Goal round uses;
4. the client relabels the matching trigger card to “Continue conversation” and swaps in a play glyph
   (matched by the injected round time, watched for up to 20 seconds);
5. when the route is unavailable it falls back to `session.prompt()` so the feature never disappears;
6. a failure restores the play control with a tooltip error.

The prompt is still a real user message: Chinese UI sends the continuation objective, English UI the
English equivalent. Host Session logs, queueing, and the turn lifecycle are not bypassed, and the Goal
service is not used.

## Install

### Plugin Manager (recommended)

From a Creator-preset session:

```text
plugin_manager(action="install_bundle", target="<absolute path to this directory>")
```

`target` must be an absolute path. If the profile already has the same package installed, the call
answers `already-installed`; run `remove_bundle` first, or use the manual install.

### Manual install (development)

1. Make the package resolvable from the profile:

   ```powershell
   $profile = "$env:USERPROFILE\.dsh\profiles\desktop"
   New-Item -ItemType Directory -Force -Path "$profile\node_modules" | Out-Null
   New-Item -ItemType Junction -Path "$profile\node_modules\dsh-continue" `
            -Target "<absolute path to this directory>"
   ```

2. Add the `link:` dependency and append the package to `dsh.profile.bundles` in the profile's
   `package.json`. Only the ordered bundle list triggers a live recomposition.

### Requirements

- DeepSeek Harness `0.2.1-rc.2` (Web or Desktop Web surface)
- No build step and no runtime dependencies

## How it works

The Host half registers the same-origin route `POST /dsh-continue/round`, which hands a user message
with `source.kind = 'continue'` to the live agent's `followup()`. The browser half registers in the
`conversation.input.right` slot:

1. `useSession` supplies `running`, `blank`, `openState`, `subagent` and `pendingSubmissions`;
2. the injected `turnState()` scans the Session event window backwards for the latest `turn/start`
   or `turn/end`;
3. an empty idle Session with a terminal boundary adopts the Host send button (enabled + solid play
   glyph) and a MutationObserver keeps that state across React re-renders;
4. a click calls the route above, then relabels the matching trigger card; the fallback remains the
   public `session.prompt()` path.

## Known limitations

- Only the currently open conversation is covered; switch to another conversation before continuing
  it
- The card relabel matches by injected round time (±4 seconds) against the Host's built-in trigger
  titles; a DSH change to that card needs a compatibility update. Injected times live in localStorage,
  so the label is restored after a restart
- “Completed” and “stopped” are inferred from the `turn/end` reason; a future DSH event-contract
  change needs a compatibility update
- DSH client APIs are still pre-stable

## Development and testing

```sh
node scripts/check.mjs
```

The zero-dependency suite covers the manifest, bundle patch, locale, terminal-state detection,
visibility conditions, successful and failed submission, button copy, theme tokens and cleanup
across 18 checks.

## License

[MIT](LICENSE)
