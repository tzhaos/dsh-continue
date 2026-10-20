/**
 * Host half of the continue bundle.
 *
 * Continue does not need the Goal service: a goal round is only a user-role
 * message whose `source.kind` is not `user`, queued through the live agent.
 * This half exposes one narrow same-origin route that does exactly that with
 * its own `continue` source kind, so the chat renders one trigger card and the
 * turn runs normally.
 *
 * @module dsh-continue
 */

import { randomUUID } from 'node:crypto'

const ROUND_PATH = '/dsh-continue/round'
const MAX_BODY = 256 * 1024

/**
 * @param {object} res - Node response.
 * @param {number} status - HTTP status.
 * @param {object} body - JSON payload.
 */
function sendJson(res, status, body) {
  res.writeHead?.(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end?.(JSON.stringify(body))
}

/**
 * Read and parse the JSON request body.
 * @param {object} req - Node request.
 * @returns {Promise<object|null>} parsed body, or null when invalid.
 */
async function readJson(req) {
  const chunks = []
  let size = 0
  try {
    for await (const chunk of req) {
      size += chunk.length
      if (size > MAX_BODY) return null
      chunks.push(chunk)
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Build the hidden continuation turn.
 *
 * The shape mirrors a goal round: an identified user message carrying a
 * non-`user` source. `form: 'notice'` is the context presentation the Host
 * already uses for injected user messages, and `summary` is what a
 * non-waking render shows.
 * @param {string} text - continuation prompt.
 * @param {string} [summary] - localized card summary.
 * @returns {object} user message ready for `Agent.followup`.
 */
export function continueMessage(text, summary = 'Continue conversation') {
  return {
    id: randomUUID(),
    role: 'user',
    content: [{ type: 'text', text }],
    source: { kind: 'continue', form: 'notice', summary },
  }
}

/**
 * Register the continuation route.
 * @param {object} ctx - Host context.
 */
export function apply(ctx) {
  if (ctx?.webServer?.register === undefined || ctx?.agents?.get === undefined) return
  ctx.effect(() => ctx.webServer.register({
    kind: 'exact',
    path: ROUND_PATH,
    handler: async (req, res) => {
      if (req.method !== 'POST') {
        sendJson(res, 405, { ok: false, reason: 'method-not-allowed' })
        return
      }
      const body = await readJson(req)
      if (body === null || typeof body !== 'object') {
        sendJson(res, 400, { ok: false, reason: 'invalid-body' })
        return
      }
      const sessionId = body.sessionId
      const text = body.text
      if (typeof sessionId !== 'string' || sessionId === ''
        || typeof text !== 'string' || text.trim() === '') {
        sendJson(res, 400, { ok: false, reason: 'invalid-request' })
        return
      }
      const agent = ctx.agents.get(sessionId)
      if (agent === undefined) {
        sendJson(res, 409, { ok: false, reason: 'agent-unavailable' })
        return
      }
      if (typeof agent.followup !== 'function') {
        sendJson(res, 500, { ok: false, reason: 'followup-unavailable' })
        return
      }
      const message = continueMessage(text, typeof body.summary === 'string' && body.summary !== ''
        ? body.summary
        : undefined)
      try {
        agent.followup(message)
      } catch {
        sendJson(res, 500, { ok: false, reason: 'queue-failed' })
        return
      }
      sendJson(res, 200, { ok: true, messageId: message.id, at: Date.now() })
    },
  }), 'dsh-continue: continuation route')
}

export const inject = ['webServer', 'agents']
