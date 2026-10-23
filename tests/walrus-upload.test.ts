// @vitest-environment jsdom
// The upload widget's money paths (F14): what is passed to the upload (epochs, permanence), the cost
// line, the duplicate prompt, the certify retry and the same-registration upload retry, plus the
// account/network reset and stale-result guard (F16). The relay composable is the real one, driven by a
// stubbed `fetch`; only the two @meddleware/ui primitives are stand-ins.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { defineComponent, h, markRaw, nextTick, ref, shallowRef } from 'vue'
import {
  attachCertifyRetry,
  attachDuplicateExisting,
  attachUploadRetry,
  type BlobUploadResult,
  type ExistingCopy,
} from '@meddleware/walrus-storage-client/flow'
import WalrusUpload from '../src/components/WalrusUpload.vue'

vi.mock('@meddleware/ui', async () => import('./helpers/ui-stubs.js'))

const PUB = 'https://public.example.com'
const OP = 'https://operator.example.com'
const result = (blobId = 'blob-1'): BlobUploadResult => ({ blobId, url: `https://agg.example/v1/blobs/${blobId}` }) as BlobUploadResult

type Opts = { relayHost: string; epochs: number; force?: boolean; deletable?: boolean; onStatus: (s: unknown) => void }

function stubRelays(table: Record<string, unknown> = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const host = String(url).replace(/\/v1\/tip-config$/, '')
      if (!(host in table)) return new Response('{"send_tip":{"kind":{"const":1000}}}')
      const answer = table[host]
      return typeof answer === 'number' ? new Response('', { status: answer }) : new Response(JSON.stringify(answer))
    }),
  )
}

type Perform = (bytes: Uint8Array, opts: Opts) => Promise<BlobUploadResult>

function mountWidget(performUpload: Perform, extra: Record<string, unknown> = {}) {
  return mount(WalrusUpload, {
    props: {
      hosts: { operator: PUB, public: PUB },
      connected: true,
      performUpload: performUpload as never,
      ...extra,
    },
  })
}

async function chooseFile(w: VueWrapper, size = 3, name = 'a.png'): Promise<void> {
  const input = w.get('input[type="file"]')
  const file = new File([new Uint8Array(size)], name)
  Object.defineProperty(input.element, 'files', { value: [file], configurable: true })
  await input.trigger('change')
  await vi.waitFor(() => expect(w.text()).toContain(name))
  await flushPromises()
}

const button = (w: VueWrapper, label: RegExp) => {
  const b = w.findAll('button').find((x) => label.test(x.text()))
  if (!b) throw new Error(`no button ${label}`)
  return b
}

/** File → options → review, ready to press "Upload to Walrus". */
async function toReview(w: VueWrapper): Promise<void> {
  await chooseFile(w)
  await button(w, /^Next$/).trigger('click')
  await flushPromises()
}

async function upload(w: VueWrapper): Promise<void> {
  await button(w, /Upload to Walrus/).trigger('click')
  await flushPromises()
}

beforeEach(() => stubRelays())
afterEach(() => vi.unstubAllGlobals())

describe('WalrusUpload: what is passed to the upload', () => {
  it('uploads the chosen bytes to the selected relay for the max duration, permanent by default', async () => {
    const perform = vi.fn<Perform>(async () => result())
    const w = mountWidget(perform)
    await flushPromises()
    await toReview(w)
    await upload(w)
    expect(perform).toHaveBeenCalledTimes(1)
    const [bytes, opts] = perform.mock.calls[0]!
    expect(bytes).toEqual(new Uint8Array(3))
    expect(opts).toMatchObject({ relayHost: PUB, epochs: 53, force: false, deletable: false })
    expect(w.emitted('uploaded')).toEqual([[result()]])
    expect(w.emitted('settled')).toHaveLength(1)
  })

  it('maps the permanence checkbox to deletable', async () => {
    const perform = vi.fn<Perform>(async () => result())
    const w = mountWidget(perform)
    await flushPromises()
    await chooseFile(w)
    await w.get('input[type="checkbox"]').setValue(false)
    await button(w, /^Next$/).trigger('click')
    await upload(w)
    expect(perform.mock.calls[0]![1].deletable).toBe(true)
  })

  it('clamps the duration to [1, 53] and uses the clamped value', async () => {
    const perform = vi.fn<Perform>(async () => result())
    const w = mountWidget(perform)
    await flushPromises()
    await chooseFile(w)
    const epochs = w.get('#wru-epochs')
    await epochs.setValue('999')
    await nextTick()
    expect((epochs.element as HTMLInputElement).value).toBe('53')
    await epochs.setValue('0')
    await nextTick()
    expect((epochs.element as HTMLInputElement).value).toBe('1')
    await epochs.setValue('7')
    await button(w, /^Next$/).trigger('click')
    await upload(w)
    expect(perform.mock.calls[0]![1].epochs).toBe(7)
  })

  it('Short and Max set the duration', async () => {
    const w = mountWidget(vi.fn<Perform>(async () => result()))
    await flushPromises()
    await chooseFile(w)
    await button(w, /^Short$/).trigger('click')
    expect((w.get('#wru-epochs').element as HTMLInputElement).value).toBe('10')
    await button(w, /^Max$/).trigger('click')
    expect((w.get('#wru-epochs').element as HTMLInputElement).value).toBe('53')
  })

  it('refuses a file over maxBytes before anything is uploaded', async () => {
    const perform = vi.fn<Perform>(async () => result())
    const w = mountWidget(perform, { maxBytes: 2048 })
    await flushPromises()
    const input = w.get('input[type="file"]')
    Object.defineProperty(input.element, 'files', { value: [new File([new Uint8Array(4096)], 'big.bin')], configurable: true })
    await input.trigger('change')
    expect(w.get('[role="alert"]').text()).toMatch(/File too large \(max 2 KB\)/)
    expect(perform).not.toHaveBeenCalled()
  })

  it('does not upload without a connected wallet', async () => {
    const w = mountWidget(vi.fn<Perform>(async () => result()), { connected: false })
    await flushPromises()
    await chooseFile(w)
    await button(w, /^Next$/).trigger('click')
    expect(button(w, /Upload to Walrus/).attributes('disabled')).toBeDefined()
  })

  it('shows the failure of a plain upload error', async () => {
    const w = mountWidget(vi.fn<Perform>(async () => { throw new Error('relay said no') }))
    await flushPromises()
    await toReview(w)
    await upload(w)
    expect(w.get('[role="alert"]').text()).toBe('relay said no')
    expect(w.emitted('uploaded')).toBeUndefined()
    expect(w.emitted('settled')).toHaveLength(1)
  })
})

describe('WalrusUpload: cost line', () => {
  it('shows storage in WAL, the relay fee in SUI and gas, and follows the duration', async () => {
    stubRelays({ [PUB]: { send_tip: { kind: { const: 2_000_000 } } } })
    const estimate = vi.fn(async (_size: number, epochs: number) => BigInt(epochs) * 1_000_000n)
    const w = mountWidget(vi.fn<Perform>(async () => result()), { estimateStorageCost: estimate })
    await flushPromises()
    await chooseFile(w)
    await flushPromises()
    await button(w, /^Next$/).trigger('click')
    await flushPromises()
    expect(w.get('.wru-cost').text()).toBe('Estimated cost: ~0.0530 WAL storage (53 epochs) + ~0.0020 SUI relay fee (+ gas)')
    await button(w, /^Change options$/).trigger('click')
    await w.get('#wru-epochs').setValue('10')
    await flushPromises()
    await button(w, /^Next$/).trigger('click')
    await flushPromises()
    expect(w.get('.wru-cost').text()).toBe('Estimated cost: ~0.0100 WAL storage (10 epochs) + ~0.0020 SUI relay fee (+ gas)')
  })

  it('says the relay fee is unknown when the relay tip cannot be read, instead of leaving it out', async () => {
    stubRelays({ [PUB]: { send_tip: 'garbage' } })
    const w = mountWidget(vi.fn<Perform>(async () => result()))
    await flushPromises()
    await toReview(w)
    expect(w.get('.wru-cost').text()).toBe('Estimated cost: relay fee unknown (+ gas)')
  })

  it('says so when the relay tip is above the safety limit', async () => {
    stubRelays({ [PUB]: { send_tip: { kind: { const: '900000000000' } } } })
    const w = mountWidget(vi.fn<Perform>(async () => result()))
    await flushPromises()
    await toReview(w)
    expect(w.get('.wru-cost').text()).toBe('Estimated cost: relay fee above the safety limit (+ gas)')
  })

  it('says there is no relay fee for a no_tip relay', async () => {
    stubRelays({ [PUB]: 'no_tip' })
    const w = mountWidget(vi.fn<Perform>(async () => result()))
    await flushPromises()
    await toReview(w)
    expect(w.get('.wru-cost').text()).toBe('Estimated cost: no relay fee (+ gas)')
  })

  it('ignores a storage estimate that arrives for an older duration', async () => {
    stubRelays({ [PUB]: 'no_tip' })
    const pending: Array<(v: bigint) => void> = []
    const estimate = vi.fn<(size: number, epochs: number) => Promise<bigint | null>>(
      () => new Promise<bigint | null>((r) => pending.push(r as (v: bigint) => void)),
    )
    const w = mountWidget(vi.fn<Perform>(async () => result()), { estimateStorageCost: estimate })
    await flushPromises()
    await chooseFile(w)
    await flushPromises()
    await w.get('#wru-epochs').setValue('10')
    await flushPromises()
    expect(pending.length).toBeGreaterThanOrEqual(2)
    pending.at(-1)!(1_000_000n) // the current duration answers first
    await flushPromises()
    pending[0]!(9_000_000_000n) // the stale answer arrives last and must not win
    await flushPromises()
    await button(w, /^Next$/).trigger('click')
    await flushPromises()
    expect(w.get('.wru-cost').text()).toContain('~0.0010 WAL storage (10 epochs)')
  })
})

describe('WalrusUpload: approvals copy (F13)', () => {
  async function hint(access?: Record<string, unknown>, hosts = { operator: PUB, public: PUB }) {
    const w = mountWidget(vi.fn<Perform>(async () => result()), access ? { access, hosts } : { hosts })
    await flushPromises()
    await toReview(w)
    return w.get('#wru-help').text()
  }

  it('is two approvals on an open relay', async () => {
    expect(await hint()).toContain('two wallet approvals (blob registration, blob certification)')
  })

  it('is three or four on the gated operator relay, exact once the pass kind is known', async () => {
    const hosts = { operator: OP, public: PUB }
    // markRaw: the test utils would otherwise unwrap the nested ref, which the apps' plain objects keep.
    const gated = markRaw({ gateConfigured: true, hasAccess: ref<boolean | null>(true) })
    expect(await hint(gated, hosts)).toContain('three or four wallet approvals')
    expect(await hint(markRaw({ ...gated, singleUse: ref(false) }), hosts)).toContain('three wallet approvals (prove access, blob registration, blob certification)')
    expect(await hint(markRaw({ ...gated, singleUse: ref(true) }), hosts)).toContain('four wallet approvals (spend a pass use, prove access')
  })

  it('never says "three wallet approvals (relay access, …)" any more', async () => {
    expect(await hint()).not.toMatch(/relay access, blob registration/)
  })
})

describe('WalrusUpload: duplicate blob prompt', () => {
  const certified: ExistingCopy = { kind: 'certified', blobId: 'blob-1', objectId: '0xblob', endEpoch: 99 }
  const pendingCopy: ExistingCopy = { kind: 'pending', blobId: 'blob-1', objectId: '0xblob', endEpoch: 0 }

  function duplicate(existing: ExistingCopy) {
    const err = new Error('you own this blob')
    attachDuplicateExisting(err, existing)
    return err
  }

  it('offers Extend for a certified copy and hands it to the host instead of uploading', async () => {
    const perform = vi.fn<Perform>(async () => { throw duplicate(certified) })
    const w = mountWidget(perform)
    await flushPromises()
    await toReview(w)
    await upload(w)
    expect(w.text()).toContain('You already have this blob')
    expect(w.text()).toContain('available until epoch 99')
    await button(w, /^Extend it$/).trigger('click')
    expect(w.emitted('manage-existing')).toEqual([[certified]])
    expect(w.text()).not.toContain('You already have this blob')
    expect(perform).toHaveBeenCalledTimes(1)
    expect(w.emitted('uploaded')).toBeUndefined()
  })

  it('offers Certify for a pending copy', async () => {
    const w = mountWidget(vi.fn<Perform>(async () => { throw duplicate(pendingCopy) }))
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Certify it$/).trigger('click')
    expect(w.emitted('manage-existing')).toEqual([[pendingCopy]])
  })

  it('"Upload a new copy" uploads again with the duplicate check bypassed', async () => {
    const perform = vi.fn<Perform>()
    perform.mockRejectedValueOnce(duplicate(certified)).mockResolvedValueOnce(result('copy-2'))
    const w = mountWidget(perform)
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Upload a new copy$/).trigger('click')
    await flushPromises()
    expect(perform).toHaveBeenCalledTimes(2)
    expect(perform.mock.calls[0]![1].force).toBe(false)
    expect(perform.mock.calls[1]![1].force).toBe(true)
    expect(w.emitted('uploaded')).toEqual([[result('copy-2')]])
  })

  it('Cancel closes the prompt without uploading or reporting an error', async () => {
    const perform = vi.fn<Perform>(async () => { throw duplicate(certified) })
    const w = mountWidget(perform)
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Cancel$/).trigger('click')
    expect(w.text()).not.toContain('You already have this blob')
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(perform).toHaveBeenCalledTimes(1)
  })
})

describe('WalrusUpload: certify retry', () => {
  it('offers a gas-only certify after a certify failure, and finishes without re-uploading', async () => {
    const retry = vi.fn(async () => result('certified'))
    const failure = new Error('certify rejected')
    attachCertifyRetry(failure, retry)
    const perform = vi.fn<Perform>(async () => { throw failure })
    const w = mountWidget(perform)
    await flushPromises()
    await toReview(w)
    await upload(w)
    expect(w.text()).toContain('uploaded and paid for but not yet certified')
    expect(w.emitted('uploaded')).toBeUndefined()
    await button(w, /^Certify blob$/).trigger('click')
    await flushPromises()
    expect(retry).toHaveBeenCalledTimes(1)
    expect(perform).toHaveBeenCalledTimes(1)
    expect(w.emitted('uploaded')).toEqual([[result('certified')]])
    expect(w.text()).not.toContain('Certify blob')
  })

  it('keeps the offer, and shows the reason, when the certify is declined again', async () => {
    const retry = vi.fn<() => Promise<BlobUploadResult>>().mockRejectedValueOnce(new Error('User rejected')).mockResolvedValueOnce(result('certified'))
    const failure = new Error('certify rejected')
    attachCertifyRetry(failure, retry)
    const w = mountWidget(vi.fn<Perform>(async () => { throw failure }))
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Certify blob$/).trigger('click')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe('User rejected')
    expect(w.emitted('uploaded')).toBeUndefined()
    await button(w, /^Certify blob$/).trigger('click')
    await flushPromises()
    expect(retry).toHaveBeenCalledTimes(2)
    expect(w.emitted('uploaded')).toEqual([[result('certified')]])
  })
})

describe('WalrusUpload: same-registration upload retry (F20)', () => {
  // The user paid to register; the relay upload failed. The retry is the app's closure on that
  // registration. It must not run the whole upload again (which would register and pay a second time).
  function relayFailure(retry: () => Promise<BlobUploadResult>) {
    const e = new Error('relay upload failed (503)')
    attachUploadRetry(e, retry)
    return e
  }

  it('offers "Retry upload" with the reason, retries on the same registration, and finishes', async () => {
    const retry = vi.fn(async () => result('retried'))
    const perform = vi.fn<Perform>(async () => { throw relayFailure(retry) })
    const w = mountWidget(perform)
    await flushPromises()
    await toReview(w)
    await upload(w)
    // The offer is on the options step, where the user lands to read it.
    await button(w, /^Change options$/).trigger('click')
    expect(w.text()).toContain('registered and paid for')
    expect(w.text()).toContain('no second payment')
    expect(w.get('[role="alert"]').text()).toBe('relay upload failed (503)')
    await button(w, /^Retry upload$/).trigger('click')
    await flushPromises()
    expect(retry).toHaveBeenCalledTimes(1)
    expect(perform).toHaveBeenCalledTimes(1) // not a second upload, so not a second registration
    expect(w.emitted('uploaded')).toEqual([[result('retried')]])
    expect(w.text()).not.toContain('Retry upload')
    expect(w.emitted('settled')).toHaveLength(2) // the attempt and the retry
  })

  it('keeps offering a retry on the new closure when the retry fails again', async () => {
    const second = vi.fn(async () => result('second'))
    const first = vi.fn<() => Promise<BlobUploadResult>>(async () => { throw relayFailure(second) })
    const w = mountWidget(vi.fn<Perform>(async () => { throw relayFailure(first) }))
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Change options$/).trigger('click')
    await button(w, /^Retry upload$/).trigger('click')
    await flushPromises()
    expect(first).toHaveBeenCalledTimes(1)
    expect(w.text()).toContain('Retry upload')
    expect(w.emitted('uploaded')).toBeUndefined()
    await button(w, /^Retry upload$/).trigger('click')
    await flushPromises()
    expect(second).toHaveBeenCalledTimes(1)
    expect(first).toHaveBeenCalledTimes(1)
    expect(w.emitted('uploaded')).toEqual([[result('second')]])
  })

  it('keeps the offer when the retry fails without a further retry attached (attempts exhausted is the app’s call)', async () => {
    const retry = vi.fn<() => Promise<BlobUploadResult>>(async () => { throw new Error('gateway rejected the proof') })
    const w = mountWidget(vi.fn<Perform>(async () => { throw relayFailure(retry) }))
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Change options$/).trigger('click')
    await button(w, /^Retry upload$/).trigger('click')
    await flushPromises()
    expect(w.get('[role="alert"]').text()).toBe('gateway rejected the proof')
    // No new closure came with the error, so there is nothing more to retry on.
    expect(w.text()).not.toContain('Retry upload')
  })

  it('hands over to the certify retry when the upload lands but certify fails', async () => {
    const certify = vi.fn(async () => result('certified'))
    const certifyFailure = new Error('certify rejected')
    attachCertifyRetry(certifyFailure, certify)
    const retry = vi.fn<() => Promise<BlobUploadResult>>(async () => { throw certifyFailure })
    const w = mountWidget(vi.fn<Perform>(async () => { throw relayFailure(retry) }))
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Change options$/).trigger('click')
    await button(w, /^Retry upload$/).trigger('click')
    await flushPromises()
    expect(w.text()).not.toContain('Retry upload')
    await button(w, /^Next$/).trigger('click')
    expect(w.text()).toContain('not yet certified')
    await button(w, /^Certify blob$/).trigger('click')
    await flushPromises()
    expect(certify).toHaveBeenCalledTimes(1)
    expect(w.emitted('uploaded')).toEqual([[result('certified')]])
  })

  it('a new upload or a new file clears a held retry', async () => {
    const retry = vi.fn(async () => result('retried'))
    const perform = vi.fn<Perform>()
    perform.mockRejectedValueOnce(relayFailure(retry)).mockResolvedValueOnce(result('fresh'))
    const w = mountWidget(perform)
    await flushPromises()
    await toReview(w)
    await upload(w)
    await upload(w)
    await button(w, /^Change options$/).trigger('click')
    expect(w.text()).not.toContain('Retry upload')
    expect(retry).not.toHaveBeenCalled()
  })
})

describe('WalrusUpload: another account or network (F16)', () => {
  it('discards the file and a held retry when the session key changes', async () => {
    const retry = vi.fn(async () => result('retried'))
    const failure = new Error('relay upload failed')
    attachUploadRetry(failure, retry)
    const w = mountWidget(vi.fn<Perform>(async () => { throw failure }), { sessionKey: 'testnet:0xalice' })
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Change options$/).trigger('click')
    expect(w.text()).toContain('Retry upload')

    await w.setProps({ sessionKey: 'testnet:0xbob' })
    await flushPromises()
    // Back at the file step with nothing of Alice's left to retry.
    expect(w.find('input[type="file"]').exists()).toBe(true)
    expect(w.text()).not.toContain('Retry upload')
    expect(w.text()).not.toContain('a.png')
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(retry).not.toHaveBeenCalled()
  })

  it('discards a held certify retry on a network change', async () => {
    const failure = new Error('certify rejected')
    attachCertifyRetry(failure, vi.fn(async () => result()))
    const w = mountWidget(vi.fn<Perform>(async () => { throw failure }), { sessionKey: 'testnet:0xalice' })
    await flushPromises()
    await toReview(w)
    await upload(w)
    expect(w.text()).toContain('Certify blob')
    await w.setProps({ sessionKey: 'mainnet:0xalice' })
    await flushPromises()
    expect(w.text()).not.toContain('Certify blob')
  })

  it('does not report the result of an upload that finishes after the session changed', async () => {
    let finish!: (r: BlobUploadResult) => void
    const perform = vi.fn<Perform>(() => new Promise((r) => (finish = r)))
    const w = mountWidget(perform, { sessionKey: 'testnet:0xalice' })
    await flushPromises()
    await toReview(w)
    await upload(w)
    expect(w.text()).toContain('Uploading to Walrus')
    await w.setProps({ sessionKey: 'testnet:0xbob' })
    finish(result('alice-blob'))
    await flushPromises()
    expect(w.emitted('uploaded')).toBeUndefined()
    expect(w.emitted('settled')).toHaveLength(1) // the host still refreshes its views
    expect(w.text()).not.toContain('Uploading to Walrus')
  })

  it('drops a failure, a duplicate prompt and a retry offer that arrive after the session changed', async () => {
    let fail!: (e: unknown) => void
    const w = mountWidget(vi.fn<Perform>(() => new Promise((_r, rej) => (fail = rej))), { sessionKey: 'a' })
    await flushPromises()
    await toReview(w)
    await upload(w)
    await w.setProps({ sessionKey: 'b' })
    const failure = new Error('too late')
    attachUploadRetry(failure, vi.fn(async () => result()))
    fail(failure)
    await flushPromises()
    expect(w.find('[role="alert"]').exists()).toBe(false)
    expect(w.text()).not.toContain('Retry upload')
  })

  it('ignores a retry that finishes after the session changed', async () => {
    let finish!: (r: BlobUploadResult) => void
    const retry = vi.fn(() => new Promise<BlobUploadResult>((r) => (finish = r)))
    const failure = new Error('relay upload failed')
    attachUploadRetry(failure, retry)
    const w = mountWidget(vi.fn<Perform>(async () => { throw failure }), { sessionKey: 'a' })
    await flushPromises()
    await toReview(w)
    await upload(w)
    await button(w, /^Change options$/).trigger('click')
    await button(w, /^Retry upload$/).trigger('click')
    await w.setProps({ sessionKey: 'b' })
    finish(result('alice-blob'))
    await flushPromises()
    expect(w.emitted('uploaded')).toBeUndefined()
  })

  it('discards the file on disconnect', async () => {
    const w = mountWidget(vi.fn<Perform>(async () => result()), { sessionKey: 'a' })
    await flushPromises()
    await chooseFile(w)
    expect(w.text()).toContain('a.png')
    await w.setProps({ connected: false })
    await flushPromises()
    expect(w.find('input[type="file"]').exists()).toBe(true)
    expect(w.text()).not.toContain('a.png')
  })

  it('starts over for a new relay host pair: the file goes, and the new pair is probed', async () => {
    const w = mountWidget(vi.fn<Perform>(async () => result()), { sessionKey: 'a' })
    await flushPromises()
    await chooseFile(w)
    const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>
    const before = fetchMock.mock.calls.length
    await w.setProps({ hosts: { operator: 'https://op2.example.com', public: 'https://pub2.example.com' } })
    await flushPromises()
    expect(w.find('input[type="file"]').exists()).toBe(true)
    expect(fetchMock.mock.calls.slice(before).some(([u]) => String(u).startsWith('https://pub2.example.com'))).toBe(true)
  })

  it('follows the gate wiring of another network', async () => {
    stubRelays({ [OP]: { send_tip: { kind: { const: 1 } } } })
    const first = markRaw({ gateConfigured: true, hasAccess: ref<boolean | null>(false) })
    const second = markRaw({ gateConfigured: true, hasAccess: ref<boolean | null>(true) })
    // A parent that swaps the prop, as an app does: `setProps` would merge the two objects instead.
    const wiring = shallowRef(first)
    const Parent = defineComponent({
      setup: () => () =>
        h(WalrusUpload, {
          hosts: { operator: OP, public: PUB },
          connected: true,
          access: wiring.value,
          performUpload: (async () => result()) as never,
        }),
    })
    const w = mount(Parent)
    await flushPromises()
    await chooseFile(w)
    expect(w.text()).toContain('An access pass is required')
    wiring.value = second
    await flushPromises()
    expect(w.text()).not.toContain('An access pass is required')
  })
})

describe('WalrusUpload: relay settings', () => {
  it('shows a configuration error, not the pass prompt, when the hosts become invalid', async () => {
    const w = mountWidget(vi.fn<Perform>(async () => result()), { sessionKey: 'a' })
    await flushPromises()
    await w.setProps({ hosts: { operator: 'http://insecure.example.com', public: PUB } })
    await flushPromises()
    await chooseFile(w)
    expect(w.get('[role="alert"]').text()).toMatch(/relay settings are not valid/)
    expect(w.text()).not.toContain('An access pass is required')
    expect(button(w, /^Next$/).attributes('disabled')).toBeDefined()
  })

  it('does not mount with an insecure host (a loud failure, not the free relay)', () => {
    const quiet = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(() => mountWidget(vi.fn<Perform>(async () => result()), { hosts: { operator: 'http://insecure.example.com', public: PUB } })).toThrow(
      /operator relay host/,
    )
    quiet.mockRestore()
  })
})
