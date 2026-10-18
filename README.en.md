# dsh-continue

[简体中文](README.md) | English

A [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) Web client plugin that turns the
composer send button into a **play control** when the input is empty and the last turn was stopped,
interrupted or truncated. No more typing “continue” after an abnormal ending.

![DeepSeek Harness](https://img.shields.io/badge/DeepSeek%20Harness-0.2.1--rc.2-4D6BFE)
![Version](https://img.shields.io/badge/version-1.1.1-blue)
![License: MIT](https://img.shields.io/badge/license-MIT-green)
![Runtime dependencies](https://img.shields.io/badge/runtime%20dependencies-0-brightgreen)
![Checks](https://img.shields.io/badge/checks-19-brightgreen)

## Why

After a task is stopped, interrupted or truncated, continuing it usually means typing “continue”
into the composer. That keystroke carries no information and breaks the flow. Normally completed
and forked turns never show the control.

`dsh-continue` turns it into a button:

- renders a play control exactly over the Host send button when the conversation is idle, the input
  is empty, and the last turn reached a terminal state
- covers user-stopped, blocked, error-ended, max-token and trailing `turn/start` interruption states;
  normal `completed` and `forked` turns stay hidden
- typing or adding an attachment restores the normal send button immediately
- submits a normal queued prompt through the current Session's `prompt()`
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
2. calls `beginSubmission({ mode: 'queue', text })` to create the local submission echo;
3. calls `session.prompt([{ type: 'text', text }], 'queue', undefined, requestId)`;
4. hides the play control until the running state takes over;
5. restores the button with a tooltip error when the Host rejects the prompt.

The prompt is a real user message: Chinese UI sends `继续`, English UI sends `Continue`. Host
Session logs, queueing, and turn lifecycle are not bypassed.

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

The plugin registers in the `conversation.input.right` slot:

1. `useSession` supplies `running`, `blank`, `openState`, `subagent` and `pendingSubmissions`;
2. the injected `turnState()` scans the Session event window backwards for the latest `turn/start`
   or `turn/end`;
3. an empty idle Session with a terminal boundary overlays a play control on the Host send button;
4. a click submits through the public Session `prompt()` API; no Store writes and no new remote
   endpoint.

## Known limitations

- Only the currently open conversation is covered; switch to another conversation before continuing
  it
- The continuation prompt appears as a real user message in the conversation
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
