import { describe, expect, test } from 'vitest'
import { avatarSizeProblem } from './image'

describe('avatarSizeProblem', () => {
  test('accepts exactly 32x32 and 64x64', () => {
    expect(avatarSizeProblem(32, 32)).toBeNull()
    expect(avatarSizeProblem(64, 64)).toBeNull()
  })

  test('rejects other square sizes', () => {
    for (const size of [16, 24, 33, 48, 96, 128, 256, 512]) {
      expect(avatarSizeProblem(size, size)).toBe('The avatar must be exactly 32×32 or 64×64 pixels.')
    }
  })

  test('rejects non-square images before complaining about the size', () => {
    expect(avatarSizeProblem(64, 32)).toBe('The avatar must be square.')
    expect(avatarSizeProblem(1280, 720)).toBe('The avatar must be square.')
  })

  test('rejects degenerate dimensions', () => {
    expect(avatarSizeProblem(0, 0)).toBe('The avatar must be exactly 32×32 or 64×64 pixels.')
  })
})