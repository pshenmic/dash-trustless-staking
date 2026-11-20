/*
 * Anybody can publish a Platform document, and React escapes the text so it can never become HTML.
 * What escaping does not stop is visual spoofing: a right-to-left override reorders a name, a
 * zero-width joiner hides a character, control bytes break layout. Every document string therefore
 * passes through one of these two functions at the data boundary (the live decoders), so components
 * only ever receive text that renders the way it reads.
 */

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g
const BIDI = /[\u202A-\u202E\u2066-\u2069]/g
const ZERO_WIDTH = /[\u200B-\u200D\uFEFF]/g

/** One-line text — pool names, channels: overrides stripped, whitespace collapsed, trimmed */
export function normalizeDisplayText (value: string): string {
  return value
    .normalize('NFC')
    .replace(CONTROL, '')
    .replace(BIDI, '')
    .replace(ZERO_WIDTH, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Multi-line text — descriptions, chat: newlines kept, runs of blank lines collapsed */
export function normalizeMultilineText (value: string): string {
  return value
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    .replace(CONTROL, '')
    .replace(BIDI, '')
    .replace(ZERO_WIDTH, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}