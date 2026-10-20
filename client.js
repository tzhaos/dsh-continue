/**
 * Continue — browser half of the `dsh-continue` bundle.
 *
 * The conversation UI already knows when the last turn ended, but finishing a
 * task or stopping it leaves the composer empty: to keep going the user has to
 * type “继续”. This plugin adds one compact action beside the composer controls
 * while a conversation is idle after a terminal turn. The action submits a
 * normal queued prompt through the retained Session binding, so the Host sees
 * exactly the same admission path as typed input.
 *
 * @module dsh-continue/client
 */

window.__ModuleLoader__.load({
  id: 'dsh-continue',
  factory(require) {
    const React = require('react')
    const primitives = require('@deepseek-ai/dsh-client-ui-primitives')
    const { Tooltip, IconPlayOutlineRegular } = primitives
    const { useEffect, useRef, useState } = React
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'continueTask'

    const zh = {
      'button.label': '继续',
      'button.tooltip': '继续上一次任务（无需输入）',
      'button.continuePrompt': '继续',
      'button.objective': '继续完成上一次任务直到完成，不要询问用户确认。',
      'button.pending': '正在继续…',
      'button.error': '继续失败，请重试',
      'card.title': '继续对话',
    }

    const en = {
      'button.label': 'Continue',
      'button.tooltip': 'Continue the previous task without typing',
      'button.continuePrompt': 'Continue',
      'button.objective': 'Continue the previous task until it is complete. Do not ask the user for confirmation.',
      'button.pending': 'Continuing…',
      'button.error': 'Continue failed — try again',
      'card.title': 'Continue conversation',
    }

    /** Terminal reasons where continuing the task is useful. */
    const CONTINUE_REASONS = new Set(['aborted', 'blocked', 'error', 'max-tokens', 'interrupted'])

    /** Host route that queues one hidden continuation turn. */
    const ROUND_PATH = '/dsh-continue/round'
    /** Built-in titles the Host's trigger card uses for an unknown source kind. */
    const DEFAULT_TRIGGER_TITLES = new Set(['收到执行请求', 'Execution requested'])
    /** Where this plugin remembers its injected rounds, so cards survive reloads. */
    const ROUNDS_KEY = 'dsh.continue.rounds'
    /** Interval API, absent in some non-browser harnesses. */
    const timerApi = typeof setInterval === 'function' ? { setInterval, clearInterval } : undefined

    /** @returns {Array<{sessionId: string, at: number}>} remembered rounds. */
    function readRounds() {
      try {
        const raw = localStorage.getItem(ROUNDS_KEY)
        const parsed = raw === null ? [] : JSON.parse(raw)
        return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry?.at === 'number') : []
      } catch {
        return []
      }
    }

    /** @param {Array<{sessionId: string, at: number}>} rounds - rounds to persist. */
    function writeRounds(rounds) {
      try {
        localStorage.setItem(ROUNDS_KEY, JSON.stringify(rounds))
      } catch {
        // Persistence is best effort; the live rename still happens.
      }
    }

    /**
     * Temporary diagnostic sink shared with dsh-queue-withdraw: it appends one
     * JSON line to `$DSH_HOME/queue-withdraw-diag.jsonl`. Used to find out why
     * Continue fails to trigger; safe to delete once the cause is fixed.
     */
    const DIAG_PATH = '/dsh-queue-withdraw/diag'
    /** @param {string} phase @param {object} payload @returns {void} */
    function report(phase, payload) {
      try {
        if (typeof fetch !== 'function') return
        void fetch(DIAG_PATH, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ source: 'dsh-continue', phase, ...payload, at: Date.now() }),
        }).catch(() => {})
      } catch {
        // Diagnostics never affect the feature.
      }
    }
    /** @param {unknown} value @returns {string} short JSON or error text. */
    function brief(value) {
      try {
        if (value === undefined) return 'undefined'
        if (value instanceof Error) return value.message
        const text = JSON.stringify(value)
        return text.length > 400 ? text.slice(0, 400) + '…' : text
      } catch {
        return String(value)
      }
    }


    /**
     * Read the last turn boundary from one Session event window.
     *
     * A normal `completed` turn already ended the task; Continue would be
     * noise there. Only an interruption/stop (`aborted`, `interrupted`), a
     * blocked/error terminal state, or a max-token truncation offers it. A
     * trailing `turn/start` without an end is a crash/stop boundary; the
     * caller still checks `running` before offering Continue.
     * @param {object|undefined} binding - retained Session binding.
     * @returns {{eligible: boolean, reason: string}} terminal state.
     */
    function turnStateOf(binding) {
      try {
        const entries = binding?.eventSource?.getSnapshot?.()?.entries
        if (!Array.isArray(entries)) return { eligible: false, reason: 'none' }
        for (let index = entries.length - 1; index >= 0; index -= 1) {
          const record = entries[index]
          const event = record?.event ?? record
          if (event === null || event === undefined) continue
          if (event.type === 'turn/end') {
            const kind = String(event.data?.reason?.kind ?? 'ended')
            return { eligible: CONTINUE_REASONS.has(kind), reason: kind }
          }
          if (event.type === 'turn/start') {
            return { eligible: true, reason: 'interrupted' }
          }
        }
      } catch {
        return { eligible: false, reason: 'none' }
      }
      return { eligible: false, reason: 'none' }
    }

    /**
     * One compact Continue action beside the composer controls.
     * @param {object} props - session id, Session hook, injected actions and translator.
     * @returns {object|null} button, or null when no terminal turn is eligible.
     */
    function ContinueButton({ sessionId, useSession, actions, t }) {
      const [sending, setSending] = useState(false)
      const [error, setError] = useState('')
      const running = useSession((snapshot) => snapshot.running)
      const blank = useSession((snapshot) => snapshot.blank)
      const removed = useSession((snapshot) => snapshot.removed)
      const openState = useSession((snapshot) => snapshot.openState)
      const subagent = useSession((snapshot) => snapshot.subagent)
      const pending = useSession((snapshot) => snapshot.pendingSubmissions?.length ?? 0)
      const turn = actions.turnState()

      // A successful submission keeps the button in its pending state until
      // the next turn starts. Reset the local flag when running takes over so
      // the same component instance is usable again after that turn ends.
      useEffect(() => {
        if (running === true) setSending(false)
      }, [running])

      const eligible = running === false && blank !== true && removed !== true
        && openState === 'open' && subagent === null && pending === 0 && turn.eligible

      // One diagnostic line per eligibility transition, so a report tells why
      // the button is missing instead of only that it is.
      const lastEligibility = useRef('')
      useEffect(() => {
        const key = JSON.stringify({ eligible, running, blank, removed, openState, subagent, pending, turn })
        if (lastEligibility.current === key) return
        lastEligibility.current = key
        report('eligibility', {
          sessionId,
          eligible,
          running,
          blank,
          removed,
          openState,
          subagent: subagent === null ? null : typeof subagent,
          pending,
          turn,
        })
      }, [eligible, running, blank, removed, openState, subagent, pending, turn, sessionId])

      // Cards from earlier rounds keep their Continue title after a reload.
      useEffect(() => {
        actions.renameCards?.(t('card.title'))
      }, [actions, t, sessionId])

      const submit = async (event) => {
        event?.preventDefault?.()
        event?.stopImmediatePropagation?.()
        event?.stopPropagation?.()
        report('click', { sessionId, sending })
        if (sending) return
        setSending(true)
        setError('')
        const accepted = await actions.continueTask(t('button.objective'), t('card.title'))
        report('result', { sessionId, accepted })
        if (accepted) return
        setSending(false)
        setError(t('button.error'))
      }

      // Reuse the Host's own send button instead of adding a separate action.
      // When the composer is empty that button is disabled; the continue state
      // enables it, paints a solid play glyph and routes its click through the
      // normal continuation path. The host re-renders that button frequently
      // (every snapshot change resets its props), so a mutation guard keeps the
      // adopted state in place instead of letting React disable it again.
      useEffect(() => {
        if (!eligible || typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return undefined
        const button = [...document.querySelectorAll('button[aria-label]')].find((candidate) => {
          const label = candidate.getAttribute('aria-label') ?? ''
          return /发送消息|发送|Send message|^Send$/i.test(label)
        })
        report('adopt', { sessionId, found: button !== undefined })
        if (button === undefined) return undefined
        const marker = 'dshc-send-continue'
        const label = t('button.label')
        const tooltip = error === '' ? t('button.tooltip') : error
        const previous = {
          disabled: button.disabled,
          label: button.getAttribute('aria-label'),
          title: button.getAttribute('title'),
          className: button.className,
        }
        const apply = () => {
          if (button.disabled !== false) button.disabled = false
          if (!button.classList.contains(marker)) button.classList.add(marker)
          if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label)
          if (button.getAttribute('title') !== tooltip) button.setAttribute('title', tooltip)
        }
        apply()
        const guard = typeof MutationObserver === 'function'
          ? new MutationObserver(() => apply())
          : null
        guard?.observe(button, { attributes: true, attributeFilter: ['disabled', 'class', 'aria-label', 'title'], childList: true })
        button.addEventListener('click', submit, true)
        return () => {
          guard?.disconnect()
          button.removeEventListener('click', submit, true)
          if (button.classList.contains(marker)) {
            button.disabled = previous.disabled
            button.className = previous.className
            if (previous.label === null) button.removeAttribute('aria-label')
            else button.setAttribute('aria-label', previous.label)
            if (previous.title === null) button.removeAttribute('title')
            else button.setAttribute('title', previous.title)
          }
        }
      }, [eligible, sending, t, actions, error])

      if (!eligible) return null
      return h(Tooltip, {
        label: error === '' ? t('button.tooltip') : error,
        side: 'top',
        delayMs: 400,
      }, h('button', {
        type: 'button',
        className: 'dshc-continue',
        hidden: true,
        'aria-hidden': true,
        'aria-label': t('button.label'),
        disabled: sending,
        'data-dsh-continue': sessionId,
        onClick: submit,
      }, h(IconPlayOutlineRegular, { size: 13 }),
      h('span', { className: 'dshc-continue-label' }, sending ? t('button.pending') : t('button.label'))))
    }

    /** Presentation only; colors and elevation come from the Host theme. */
    const CSS = `
.dshc-continue {
  display: none;
  color: var(--dsw-alias-label-secondary);
}
/* Adopted Host send button: solid play glyph instead of the arrow. */
button.dshc-send-continue {
  cursor: pointer;
}
button.dshc-send-continue > svg {
  display: none;
}
button.dshc-send-continue::before {
  content: "";
  display: block;
  width: 16px;
  height: 16px;
  background: currentColor;
  clip-path: polygon(30% 16%, 30% 84%, 86% 50%);
}
`

    /**
     * Register the Continue action in the composer's right control cluster.
     * @param {object} ctx - Client root context.
     */
    function apply(ctx) {
      ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'continue: dictionaries')
      ctx.effect(() => {
        if (typeof document === 'undefined' || typeof document.createElement !== 'function') return () => {}
        const style = document.createElement('style')
        style.dataset.dshPlugin = 'dsh-continue'
        style.textContent = CSS
        document.head.appendChild(style)
        return () => { style.remove?.() }
      }, 'continue: styles')

      ctx.slots.inject('conversation.input.right', () => ctx.slots.register({
        name: 'conversation.input.right',
        id: 'continue.trigger',
        order: 18,
        locale: NS,
        inject: (sessionId) => {
          let binding
          try {
            binding = ctx.sessions.binding(sessionId)
          } catch {
            binding = undefined
          }
          // Continue injects its own hidden turn (see the Host half), so the
          // Goal service is not involved at all. The Host renders that turn as
          // a trigger card whose built-in title table has no extension point,
          // so the card is relabelled here: the injected round time is recorded
          // and every trigger card drawn at that instant gets the Continue
          // title and a play glyph.
          const rounds = readRounds()
          let cardTimer = null
          const rememberRound = (at) => {
            rounds.push({ sessionId, at })
            while (rounds.length > 50) rounds.shift()
            writeRounds(rounds)
          }
          const renameCards = (label) => {
            if (typeof document === 'undefined' || typeof document.querySelectorAll !== 'function') return
            for (const card of document.querySelectorAll('[data-turn-trigger]')) {
              if (card.hasAttribute?.('data-dsh-continue-card') === true) continue
              const time = card.querySelector?.('time[datetime]')
              const at = time === null || time === undefined ? Number.NaN : Date.parse(time.getAttribute('datetime') ?? '')
              if (!Number.isFinite(at)) continue
              if (!rounds.some((round) => round.sessionId === sessionId && Math.abs(round.at - at) < 4000)) continue
              const title = [...(card.querySelectorAll?.('span') ?? [])]
                .find((node) => DEFAULT_TRIGGER_TITLES.has((node.textContent ?? '').trim()))
              if (title === undefined) continue
              title.textContent = typeof label === 'string' && label !== '' ? label : '继续对话'
              const icon = card.querySelector?.('button svg')
              if (icon !== null && icon !== undefined) {
                try {
                  icon.setAttribute('viewBox', '0 0 16 16')
                  icon.innerHTML = '<path d="M5.6 3.3 12.7 8l-7.1 4.7z" fill="currentColor" stroke="none"/>'
                } catch {
                  // A shape change only costs the glyph, not the title.
                }
              }
              card.setAttribute('data-dsh-continue-card', '')
            }
          }
          const armCardWatch = (label) => {
            renameCards(label)
            if (timerApi === undefined || cardTimer !== null) return
            const started = Date.now()
            cardTimer = timerApi.setInterval(() => {
              renameCards(label)
              if (Date.now() - started > 20000) {
                timerApi.clearInterval(cardTimer)
                cardTimer = null
              }
            }, 400)
          }

          return {
            sessionId,
            actions: {
              /** @returns {{eligible: boolean, reason: string}} terminal state. */
              turnState: () => turnStateOf(binding),
              /** Relabel historical Continue cards after a reload. */
              renameCards,
              armCardWatch,
              /**
               * Queue one hidden continuation turn through the Host route.
               * @param {string} text - continuation prompt.
               * @param {string} label - card title to apply to the injected turn.
               * @returns {Promise<boolean>} whether the Host accepted it.
               */
              continueTask: async (text, label) => {
                try {
                  const session = binding?.session
                  if (session === undefined) return false
                  let queued = false
                  try {
                    const response = await fetch(ROUND_PATH, {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ sessionId, text, summary: label }),
                    })
                    const body = await response.json?.()
                    queued = response.ok === true && body?.ok === true
                    report('round-queued', { sessionId, queued, at: body?.at })
                  } catch (error) {
                    report('round-error', { sessionId, error: brief(error) })
                  }
                  if (queued) {
                    rememberRound(Date.now())
                    armCardWatch(label)
                    return true
                  }
                  // Fallback: an ordinary queued prompt when the route is gone.
                  if (typeof session.prompt !== 'function') return false
                  const submission = typeof session.beginSubmission === 'function'
                    ? session.beginSubmission({ mode: 'queue', text, attachments: [] })
                    : undefined
                  let result
                  try {
                    result = await session.prompt(
                      [{ type: 'text', text }],
                      'queue',
                      undefined,
                      submission?.requestId,
                    )
                  } catch (error) {
                    submission?.abandon?.()
                    throw error
                  }
                  if (result?.ok !== true) {
                    submission?.abandon?.()
                    report('prompt-rejected', { sessionId, result: brief(result) })
                    return false
                  }
                  report('prompt-accepted', { sessionId })
                  return true
                } catch (error) {
                  report('continue-error', { sessionId, error: brief(error) })
                  return false
                }
              },
            },
          }
        },
      }, ContinueButton))
    }

    return {
      /** Services this Client plugin waits for before applying. */
      inject: ['slots', 'locale', 'sessions'],
      apply,
    }
  },
})
