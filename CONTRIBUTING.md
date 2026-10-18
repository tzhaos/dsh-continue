# Contributing

Thanks for taking the time to improve `dsh-continue`.

## Ground rules

- **No build step and no runtime dependencies.**
- **Use the public Session API.** Submit through `Session.prompt()`; do not reach into Session
  internals or modify the conversation Store.
- **Theme tokens only.** Use `--dsw-*` variables; never hard-code colors.
- **Keep the button quiet.** It belongs to the composer and must disappear whenever the
  conversation is running, blank, loading or waiting on a pending submission.

## Verification

```sh
node scripts/check.mjs
```

CI runs the same command on every push and pull request.

## Documentation and commits

Keep `README.md` (Simplified Chinese, primary) and `README.en.md` in sync, and record user-visible
changes in `CHANGELOG.md`. Use Conventional Commits, e.g.:

```
feat: add one-click continue for terminal turns
```
