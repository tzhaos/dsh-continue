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
    const { useEffect, useState } = React
    const h = React.createElement

    /** Locale namespace owned by this plugin. */
    const NS = 'continueTask'

    const zh = {
      'button.label': '继续',
      'button.tooltip': '继续上一次任务（无需输入）',
      'button.continuePrompt': '继续',
      'button.pending': '正在继续…',
      'button.error': '继续失败，请重试',
    }

    const en = {
      'button.label': 'Continue',
      'button.tooltip': 'Continue the previous task without typing',
      'button.continuePrompt': 'Continue',
      'button.pending': 'Continuing…',
      'button.error': 'Continue failed — try again',
    }

    /** Terminal reasons where continuing the task is useful. */
    const CONTINUE_REASONS = new Set(['aborted', 'blocked', 'error', 'max-tokens', 'interrupted'])

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

      if (running !== false || blank === true || removed === true || openState !== 'open'
        || subagent !== null || pending > 0 || !turn.eligible) {
        return null
      }

      const submit = async () => {
        if (sending) return
        setSending(true)
        setError('')
        const accepted = await actions.continueTask(t('button.continuePrompt'))
        if (accepted) return
        setSending(false)
        setError(t('button.error'))
      }

      return h(Tooltip, {
        label: error === '' ? t('button.tooltip') : error,
        side: 'top',
        delayMs: 400,
      }, h('button', {
        type: 'button',
        className: 'dshc-continue',
        'aria-label': t('button.label'),
        disabled: sending,
        'data-dsh-continue': sessionId,
        onMouseDown: (event) => { event.preventDefault?.() },
        onClick: submit,
      },
      h(IconPlayOutlineRegular, { size: 13 }),
      h('span', { className: 'dshc-continue-label' }, sending ? t('button.pending') : t('button.label'))))
    }

    /** Presentation only; colors and elevation come from the Host theme. */
    const CSS = `
.dshc-continue {
  box-sizing: border-box;
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l3);
  border-radius: var(--dsw-radius-md);
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  line-height: 16px;
  white-space: nowrap;
  cursor: pointer;
}
.dshc-continue:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
  color: var(--dsw-alias-label-primary);
}
.dshc-continue:focus-visible {
  outline: 2px solid var(--dsw-alias-state-business-primary);
  outline-offset: 1px;
}
.dshc-continue:disabled {
  cursor: default;
  opacity: .55;
}
.dshc-continue-label {
  max-width: 80px;
  overflow: hidden;
  text-overflow: ellipsis;
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
          return {
            sessionId,
            actions: {
              /** @returns {{eligible: boolean, reason: string}} terminal state. */
              turnState: () => turnStateOf(binding),
              /**
               * Submit a normal queued prompt through the retained Session
               * binding, exactly like typed input.
               * @param {string} text - continuation prompt.
               * @returns {Promise<boolean>} whether the Host accepted it.
               */
              continueTask: async (text) => {
                try {
                  const session = binding?.session
                  if (session === undefined || typeof session.prompt !== 'function') return false
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
                    return false
                  }
                  return true
                } catch {
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
