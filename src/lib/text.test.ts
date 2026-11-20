import { describe, expect, test } from 'vitest'
import { normalizeDisplayText, normalizeMultilineText } from './text'

describe('normalizeDisplayText', () => {
  test('strips right-to-left overrides so a name cannot be reordered', () => {
    expect(normalizeDisplayText('al\u202Eice')).toBe('alice')
    expect(normalizeDisplayText('\u2066admin\u2069')).toBe('admin')
  })

  test('strips zero-width and control characters', () => {
    expect(normalizeDisplayText('a\u200Bb\u200Dc\uFEFFd')).toBe('abcd')
    expect(normalizeDisplayText('a\u0000b\u0007c\u009Fd')).toBe('abcd')
  })

  test('composes unicode and collapses whitespace', () => {
    expect(normalizeDisplayText('cafe\u0301')).toBe('café')
    expect(normalizeDisplayText('  two \t lines\nhere  ')).toBe('two lines here')
  })

  test('leaves ordinary unicode alone', () => {
    expect(normalizeDisplayText('Pšenič 🇷🇺 池')).toBe('Pšenič 🇷🇺 池')
    expect(normalizeDisplayText('')).toBe('')
  })
})

describe('normalizeMultilineText', () => {
  test('keeps single newlines and normalises CRLF', () => {
    expect(normalizeMultilineText('one\r\ntwo\rthree')).toBe('one\ntwo\nthree')
  })

  test('collapses runs of blank lines but keeps paragraph breaks', () => {
    expect(normalizeMultilineText('a\n\n\n\nb')).toBe('a\n\nb')
  })

  test('trims spaces around lines without eating newlines', () => {
    expect(normalizeMultilineText('  a  \n\t b \t')).toBe('a\nb')
  })

  test('strips bidi and controls from chat text', () => {
    expect(normalizeMultilineText('hello \u202Eworld\u202C\u0000')).toBe('hello world')
  })
})