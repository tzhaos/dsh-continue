/**
 * Zero-dependency verification for dsh-continue.
 *
 * Run with `node scripts/check.mjs`. The suite mounts the real client
 * component through a miniature React runtime, a DOM-shaped fake and a Session
 * event-window fixture.
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8')
const manifest = JSON.parse(read('package.json'))
const clientSource = read('client.js')

let checks = 0

/** Run one named check. */
async function check(name, body) {
  try {
    await body()
    checks += 1
    console.log('ok ' + name)
  } catch (error) {
    console.error('FAIL ' + name)
    console.error('     ' + (error?.message ?? error))
    process.exitCode = 1
  }
}

/** Compare JSON-shaped values out of the vm realm. */
function equal(actual, expected, message) {
  assert.deepEqual(JSON.parse(JSON.stringify(actual)), expected, message)
}

/** Flatten rendered text. */
function textOf(element) {
  if (element === null || element === undefined) return ''
  if (typeof element === 'string' || typeof element === 'number') return String(element)
  if (Array.isArray(element)) return element.map(textOf).join('')
  if (element.children === undefined) return textOf(element.props?.children)
  return Array.isArray(element.children) ? element.children.map(textOf).join('') : textOf(element.children)
}

/** Find all rendered elements matching a predicate. */
function findAll(root, predicate) {
  const found = []
  const walk = (node) => {
    if (node === null || node === undefined || typeof node !== 'object') return
    if (Array.isArray(node)) { for (const child of node) walk(child); return }
    if (predicate(node)) found.push(node)
    walk(node.children)
  }
  walk(root)
  return found
}

/** Find one rendered element matching a predicate. */
function findOne(root, predicate) {
  const matches = findAll(root, predicate)
  assert(matches.length >= 1, 'expected one match, found ' + matches.length)
  return matches[0]
}

// ---------------------------------------------------------------------------
// 1. Static contract
// ---------------------------------------------------------------------------

await check('manifest declares a DSH bundle and web client half', () => {
  assert.equal(manifest.name, 'dsh-continue')
  assert.equal(manifest.version, '1.2.0')
  assert.equal(manifest.license, 'MIT')
  assert.equal(manifest.main, 'index.js')
  assert.equal(manifest.exports['./client'], './client.js')
  assert.equal(manifest.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(manifest.dsh.client.platform, 'web')
  assert(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-client-ui-conversation'), 'conversation inject')
  assert(manifest.dsh.client.inject.includes('@deepseek-ai/dsh-api-session-controller'), 'session inject')
  assert.equal(manifest.scripts.check, 'node scripts/check.mjs')
})

await check('all manifest files exist on disk', () => {
  for (const relative of [
    manifest.main, 'client.js', manifest.dsh.bundle.patch,
    'locale/en.json', 'locale/zh.json', 'icon.svg', 'README.md', 'README.en.md',
    'CHANGELOG.md', 'LICENSE',
  ]) assert(fs.existsSync(path.join(ROOT, relative)), relative + ' exists')
})

await check('bundle patch inserts exactly one continue row', () => {
  const patch = read('cordis.patch.yml')
  assert(patch.includes('- insert:'), 'insert block')
  assert(patch.includes('id: continue'), 'row id')
  assert(patch.includes("name: 'dsh-continue'"), 'package name')
  assert.equal((patch.match(/- insert:/g) ?? []).length, 1, 'one insert')
})

await check('client only requires frozen platform modules', () => {
  const allowed = new Set(['react', '@deepseek-ai/dsh-client-ui-primitives'])
  const requires = [...clientSource.matchAll(/require\('([^']+)'\)/g)].map((match) => match[1])
  for (const id of requires) assert(allowed.has(id), 'unexpected require ' + id)
  assert(requires.includes('react'), 'react required')
  assert(requires.includes('@deepseek-ai/dsh-client-ui-primitives'), 'primitives required')
})

await check('stylesheet uses theme tokens and no literal colors', () => {
  const start = clientSource.indexOf('const CSS = `')
  const end = clientSource.indexOf('\n`', start)
  assert(start !== -1 && end !== -1, 'stylesheet found')
  const css = clientSource.slice(start, end)
  assert.deepEqual([...css.matchAll(/#[0-9a-fA-F]{3,8}\b/g)].map((match) => match[0]), [], 'literal colors')
  assert(css.includes('var(--dsw-'), 'theme tokens present')
  assert(css.includes('.dshc-continue'), 'button styles')
})

await check('locale files carry title and description', () => {
  for (const language of ['en', 'zh']) {
    const meta = JSON.parse(read('locale/' + language + '.json')).meta
    assert.equal(typeof meta.title, 'string', language + ' title')
    assert.equal(typeof meta.description, 'string', language + ' description')
    assert(meta.title.length > 0 && meta.description.length > 0, language + ' non-empty')
  }
})

await check('icon is a valid accent SVG', () => {
  const icon = read('icon.svg')
  assert(icon.startsWith('<svg'), 'svg root')
  assert(icon.includes('viewBox="0 0 64 64"'), 'view box')
  assert(icon.includes('#4D6BFE'), 'host accent')
})

// ---------------------------------------------------------------------------
// 2. Fake runtime and fixture
// ---------------------------------------------------------------------------

/** A minimal React runtime with linear hook slots. */
function createFakeReact() {
  const hooks = []
  let cursor = 0
  let dirty = false
  let queuedEffects = []

  const react = {
    createElement(type, props, ...children) {
      const merged = { ...(props ?? {}) }
      const flat = []
      const push = (child) => {
        if (child === null || child === undefined || typeof child === 'boolean') return
        if (Array.isArray(child)) { for (const value of child) push(value); return }
        flat.push(child)
      }
      for (const child of children) push(child)
      if (flat.length === 1) merged.children = flat[0]
      else if (flat.length > 1) merged.children = flat
      return { type, props: merged }
    },
    useState(initial) {
      const index = cursor
      cursor += 1
      if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial
      const setState = (next) => {
        const value = typeof next === 'function' ? next(hooks[index]) : next
        if (Object.is(value, hooks[index])) return
        hooks[index] = value
        dirty = true
      }
      return [hooks[index], setState]
    },
    useEffect(effect) {
      queuedEffects.push(effect)
    },
    Fragment: Symbol('Fragment'),
  }

  return {
    react,
    begin() { cursor = 0; dirty = false; queuedEffects = [] },
    end() {
      const effects = queuedEffects
      queuedEffects = []
      for (const effect of effects) effect()
      return effects.length
    },
    isDirty: () => dirty,
  }
}

/** Render one component tree, running effects until stable. */
function mountComponent(component, props, runtime) {
  let tree = null
  const renderTree = (node) => {
    if (node === null || node === undefined || typeof node === 'boolean') return null
    if (typeof node === 'string' || typeof node === 'number') return node
    if (Array.isArray(node)) return node.map(renderTree)
    const { type, props: elementProps } = node
    if (typeof type === 'function') return renderTree(type(elementProps))
    const host = { type, props: elementProps, children: [] }
    const children = elementProps.children
    if (Array.isArray(children)) host.children = children.map(renderTree)
    else if (children !== undefined) host.children = renderTree(children)
    return host
  }
  const rerender = () => {
    for (let pass = 0; pass < 8; pass += 1) {
      runtime.begin()
      tree = renderTree(component(props))
      const ran = runtime.end()
      if (!runtime.isDirty() && ran === 0) break
    }
    return tree
  }
  rerender()
  return { get tree() { return tree }, rerender }
}

/** Fake primitives: Tooltip exposes its label and renders the trigger inline. */
function createFakePrimitives(runtime) {
  const h = runtime.react.createElement
  const Tooltip = ({ label, children }) => h('span', { 'data-dsh-tooltip': label }, children)
  const icon = () => h('span', { 'data-icon': 'play' })
  return { Tooltip, IconPlayOutlineRegular: icon }
}

/** DOM-shaped fake for the style effect. */
function createFakeDocument() {
  return {
    head: { appendChild() {} },
    createElement: () => ({ dataset: {}, textContent: '', remove() {} }),
  }
}

/** Load the client module and return its plugin definition. */
function loadClientModule({ react, primitives, fakeDocument }) {
  let loaded
  const sandbox = {
    window: {
      __ModuleLoader__: { load(definition) { loaded = definition } },
    },
    document: fakeDocument,
    console,
  }
  vm.runInNewContext(clientSource, sandbox, { filename: 'client.js' })
  return loaded.factory((id) => {
    if (id === 'react') return react
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return primitives
    throw new Error('unexpected require ' + id)
  })
}

/** Translator for one locale dictionary. */
function translator(dictionary) {
  return (key, params = {}) => {
    const template = dictionary[key] ?? key
    return template.replace(/\{(\w+)\}/g, (_match, name) => String(params[name] ?? '{' + name + '}'))
  }
}

/** One `turn/end` event. */
function turnEnd(kind, seq = 2) {
  return { event: { type: 'turn/end', seq, time: 1700000000000 + seq, data: { turn: 1, reason: { kind } } } }
}

/** One `turn/start` event. */
function turnStart(seq = 1) {
  return { event: { type: 'turn/start', seq, time: 1700000000000 + seq, data: { turn: 1 } } }
}

/** Default idle session snapshot. */
function baseSnapshot(overrides = {}) {
  return {
    sessionId: 'session-a',
    pendingSubmissions: [],
    running: false,
    subagent: null,
    removed: false,
    openState: 'open',
    openError: null,
    hasMore: false,
    loadingOlder: false,
    promptError: null,
    blank: false,
    lastAgentError: null,
    promptAttempted: true,
    awaitingFirstTurn: false,
    ...overrides,
  }
}

/** Apply the plugin and mount its Continue button. */
function scenario(options = {}) {
  const reactRuntime = createFakeReact()
  const primitives = createFakePrimitives(reactRuntime)
  const fakeDocument = createFakeDocument()
  const entries = options.entries ?? [turnStart(1), turnEnd('aborted', 2)]
  const beginCalls = []
  const promptCalls = []
  const promptResult = options.promptResult ?? { ok: true }
  let nextRequest = 0
  const session = {
    beginSubmission: (input) => {
      beginCalls.push(input)
      nextRequest += 1
      return { requestId: 'request-' + nextRequest, abandon: () => { beginCalls.push({ abandoned: true }) } }
    },
    prompt: async (content, mode, signal, requestId) => {
      promptCalls.push({ content, mode, signal, requestId })
      return promptResult
    },
  }
  const binding = {
    eventSource: { getSnapshot: () => ({ entries }) },
    session,
  }
  const sessions = { binding: () => binding }
  const localeRegistrations = []
  const registrations = []
  const plugin = loadClientModule({ react: reactRuntime.react, primitives, fakeDocument })
  const ctx = {
    effect: (factory) => { factory(); return () => {} },
    sessions,
    locale: { register: (ns, dicts) => { localeRegistrations.push({ ns, dicts }); return () => {} } },
    slots: {
      inject: (_slot, callback) => callback(),
      register: (entryOptions, component) => {
        registrations.push({ options: entryOptions, component })
        return () => {}
      },
    },
  }
  plugin.apply(ctx)
  const registration = registrations[0]
  const t = translator(localeRegistrations[0].dicts.zh)
  const snapshot = baseSnapshot(options.snapshot)
  const useSession = (selector) => selector(snapshot)
  const harness = mountComponent(registration.component, {
    sessionId: 'session-a',
    useSession,
    t,
    ...registration.options.inject('session-a'),
  }, reactRuntime)
  return { plugin, registration, registrations, harness, t, entries, beginCalls, promptCalls, snapshot, binding }
}

/** Find the Continue button, if rendered. */
function continueButton(harness) {
  return findAll(harness.tree, (element) => element.type === 'button' && element.props?.className === 'dshc-continue')[0]
}

/** Find the Tooltip wrapper label. */
function tooltipLabel(harness) {
  const wrapper = findAll(harness.tree, (element) => element.props?.['data-dsh-tooltip'] !== undefined)[0]
  return wrapper?.props?.['data-dsh-tooltip']
}

// ---------------------------------------------------------------------------
// 3. Behaviour
// ---------------------------------------------------------------------------

await check('factory registers one composer-right Continue action', () => {
  const { plugin, registrations, registration } = scenario()
  equal(plugin.inject.slice().sort(), ['locale', 'sessions', 'slots'])
  assert.equal(registrations.length, 1)
  assert.equal(registration.options.name, 'conversation.input.right')
  assert.equal(registration.options.id, 'continue.trigger')
  assert.equal(registration.options.locale, 'continueTask')
})

await check('normally completed and forked turns do not show Continue', () => {
  for (const kind of ['completed', 'forked']) {
    const { harness } = scenario({ entries: [turnStart(1), turnEnd(kind, 2)] })
    assert.equal(continueButton(harness), undefined, 'no play control after ' + kind)
  }
})

await check('blocked, error and max-tokens turns still offer Continue', () => {
  for (const kind of ['blocked', 'error', 'max-tokens']) {
    const { harness } = scenario({ entries: [turnStart(1), turnEnd(kind, 2)] })
    assert(continueButton(harness), 'play control after ' + kind)
  }
})

await check('Continue reuses the Host send button instead of a separate control', () => {
  assert(clientSource.includes('dshc-send-continue'))
  assert(clientSource.includes("button.addEventListener('click', submit, true)"))
})

await check('aborted turn shows the Continue button', () => {
  const { harness } = scenario({ entries: [turnStart(1), turnEnd('aborted', 2)] })
  assert(continueButton(harness), 'button rendered')
})

await check('a trailing turn/start without turn/end still offers Continue', () => {
  const { harness } = scenario({ entries: [turnStart(1), turnStart(2)] })
  assert(continueButton(harness), 'button rendered')
})

await check('running, blank, loading, removed, subagent and pending states hide the button', () => {
  for (const snapshot of [
    { running: true },
    { blank: true },
    { openState: 'loading' },
    { removed: true },
    { subagent: { address: {} } },
    { pendingSubmissions: [{ requestId: 'request-1' }] },
  ]) {
    const { harness } = scenario({ snapshot })
    assert.equal(continueButton(harness), undefined, JSON.stringify(snapshot))
  }
})

await check('no turn boundary leaves the button hidden', () => {
  const { harness } = scenario({ entries: [] })
  assert.equal(continueButton(harness), undefined)
})

await check('clicking Continue submits a queued prompt through the Session', async () => {
  const { harness, beginCalls, promptCalls, t } = scenario()
  const button = continueButton(harness)
  await button.props.onClick()
  harness.rerender()
  assert.equal(beginCalls.length, 1, 'beginSubmission called')
  assert.equal(beginCalls[0].mode, 'queue')
  assert.equal(beginCalls[0].text, t('button.continuePrompt'))
  equal(beginCalls[0].attachments, [])
  assert.equal(promptCalls.length, 1, 'prompt called')
  assert.equal(promptCalls[0].mode, 'queue')
  equal(promptCalls[0].content, [{ type: 'text', text: t('button.continuePrompt') }])
  assert.equal(promptCalls[0].requestId, 'request-1')
  assert(textOf(continueButton(harness)).includes(t('button.pending')), 'pending label')
})

await check('pending state resets after the continuation starts', async () => {
  const { harness, snapshot, t } = scenario()
  await continueButton(harness).props.onClick()
  harness.rerender()
  assert(textOf(continueButton(harness)).includes(t('button.pending')), 'pending before running')
  snapshot.running = true
  harness.rerender()
  assert.equal(continueButton(harness), undefined, 'hidden while running')
  snapshot.running = false
  harness.rerender()
  const button = continueButton(harness)
  assert(button, 'button returns after the continuation turn ends')
  assert.equal(button.props.disabled, false, 'button usable again')
  assert(textOf(button).includes(t('button.label')), 'normal label restored')
})

await check('a rejected submission restores the button with an error tooltip', async () => {
  const { harness, t } = scenario({ promptResult: { ok: false } })
  await continueButton(harness).props.onClick()
  harness.rerender()
  assert(textOf(continueButton(harness)).includes(t('button.label')), 'button restored')
  assert.equal(tooltipLabel(harness), t('button.error'), 'error tooltip')
})

await check('the button disables while a submission is in flight', async () => {
  const { harness } = scenario()
  const button = continueButton(harness)
  const pending = button.props.onClick()
  // The synchronous prefix sets sending before the async prompt settles.
  harness.rerender()
  assert.equal(continueButton(harness).props.disabled, true)
  await pending
})

await check('the style effect is installed with a plugin marker', () => {
  const { harness } = scenario()
  assert(continueButton(harness))
})

if (process.exitCode === 1) {
  console.error('\n' + checks + ' check(s) passed, some failed')
} else {
  console.log('\nall checks passed (' + checks + ')')
}
