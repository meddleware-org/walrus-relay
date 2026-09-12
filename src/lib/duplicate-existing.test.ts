import { describe, it, expect } from 'vitest'
import { attachDuplicateExisting, getDuplicateExisting } from './duplicate-existing.js'

const certified = { kind: 'certified' as const, blobId: 'BLOB', objectId: 'OBJ', endEpoch: 570 }

describe('duplicate-existing', () => {
  it('attaches an existing-copy match to an error and reads it back', () => {
    const err = new Error('already stored')
    attachDuplicateExisting(err, certified)
    expect(getDuplicateExisting(err)).toEqual(certified)
  })

  it('round-trips a pending match', () => {
    const err = new Error('not certified')
    const pending = { kind: 'pending' as const, blobId: 'B', objectId: 'O', endEpoch: 560 }
    attachDuplicateExisting(err, pending)
    expect(getDuplicateExisting(err)?.kind).toBe('pending')
  })

  it('returns null when no match was attached', () => {
    expect(getDuplicateExisting(new Error('network'))).toBeNull()
    expect(getDuplicateExisting('string error')).toBeNull()
    expect(getDuplicateExisting(null)).toBeNull()
  })

  it('attach is a safe no-op on non-object throwables', () => {
    expect(() => attachDuplicateExisting('oops', certified)).not.toThrow()
    expect(getDuplicateExisting('oops')).toBeNull()
  })
})
