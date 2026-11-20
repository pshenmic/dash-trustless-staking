import { describe, expect, test } from 'vitest'
import { poolAvatarColor, poolInitial } from './avatar'

describe('poolInitial', () => {
  test('takes the first character and upper-cases it when that stays one character', () => {
    expect(poolInitial('pshenmic’s pool #1')).toBe('P')
    expect(poolInitial('  pool nine  ')).toBe('P')
    expect(poolInitial('ёл')).toBe('Ё')
  })

  test('keeps a multi-character upper-case mapping as the original character', () => {
    expect(poolInitial('ßeta')).toBe('ß')
  })

  test('does not split a grapheme — the whole flag or emoji is the initial', () => {
    expect(poolInitial('🇷🇺 motherland')).toBe('🇷🇺')
    expect(poolInitial('🙂 pool')).toBe('🙂')
  })

  test('falls back when the name is empty', () => {
    expect(poolInitial('')).toBe('?')
    expect(poolInitial('   ', 'K')).toBe('K')
    expect(poolInitial('   ', 'X')).toBe('X')
  })
})

describe('poolAvatarColor', () => {
  test('is stable for the same name and different across names', () => {
    expect(poolAvatarColor('Test pool 1')).toEqual(poolAvatarColor('Test pool 1'))
    expect(poolAvatarColor('Test pool 1')).not.toEqual(poolAvatarColor('Test pool 2'))
  })

  test('emits a hue in range with the fixed saturation and lightness', () => {
    for (const name of ['a', 'beta', 'pshenmic’s pool #1', '🇷🇺']) {
      const match = /^hsl\((\d+) 45% 30%\)$/.exec(poolAvatarColor(name).background)
      expect(match).not.toBeNull()
      expect(Number(match![1])).toBeGreaterThanOrEqual(0)
      expect(Number(match![1])).toBeLessThan(360)
    }
  })

  test('a white letter clears WCAG AA on every hue', () => {
    const channel = (v: number): number => {
      const x = v / 255
      return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4
    }
    const luminance = ([r, g, b]: number[]): number => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
    const hslToRgb = (h: number, s: number, l: number): number[] => {
      const a = (s / 100) * Math.min(l / 100, 1 - l / 100)
      const f = (n: number): number => {
        const k = (n + h / 30) % 12
        return (l / 100 - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255
      }
      return [f(0), f(8), f(4)]
    }
    for (let hue = 0; hue < 360; hue++) {
      const contrast = 1.05 / (luminance(hslToRgb(hue, 45, 30)) + 0.05)
      expect(contrast).toBeGreaterThanOrEqual(4.5)
    }
  })
})