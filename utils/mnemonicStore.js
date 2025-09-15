// Tiny secure-ish local store for the user's mnemonic.
// Stores plain text with restricted permissions (0600) in ~/.dash-trustless-staking/mnemonic.secret

import fs from 'fs';
import os from 'os';
import path from 'path';

const DEFAULT_DIR = path.join(os.homedir(), '.dashtrustlessstaking');
const DEFAULT_FILE = 'mnemonic.secret';
const DEFAULT_PATH = path.join(DEFAULT_DIR, DEFAULT_FILE);

function resolvePath(customPath) {
  return customPath ? path.resolve(customPath) : DEFAULT_PATH;
}

export async function ensureStoreDir(dir = DEFAULT_DIR) {
  await fs.promises.mkdir(dir, { recursive: true, mode: 0o700 });
}

/**
 * Save mnemonic to file (overwrites by default).
 */
export async function saveMnemonic(mnemonic, { filePath, overwrite = true } = {}) {
  const target = resolvePath(filePath);
  await ensureStoreDir(path.dirname(target));

  if (!overwrite && await hasMnemonic({ filePath: target })) {
    throw new Error(`Mnemonic file already exists: ${target}`);
  }

  const data = `${mnemonic.trim()}\n`;
  await fs.promises.writeFile(target, data, { mode: 0o600, flag: 'w' });

  // Best-effort: enforce permissions on POSIX
  try { await fs.promises.chmod(target, 0o600); } catch (_) {}
  return target;
}

/**
 * Read mnemonic from file.
 */
export async function loadMnemonic({ filePath } = {}) {
  const target = resolvePath(filePath);
  const data = await fs.promises.readFile(target, 'utf8');
  return data.trim();
}

/**
 * Check if mnemonic file exists and readable.
 */
export async function hasMnemonic({ filePath } = {}) {
  const target = resolvePath(filePath);
  try {
    await fs.promises.access(target, fs.constants.R_OK);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Remove mnemonic file.
 */
export async function deleteMnemonic({ filePath } = {}) {
  const target = resolvePath(filePath);
  try {
    await fs.promises.unlink(target);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Helper that throws if mnemonic is missing.
 */
export async function requireMnemonic({ filePath } = {}) {
  if (!await hasMnemonic({ filePath })) {
    throw new Error('Mnemonic is not initialized. Run: `pool init "<mnemonic words...>"`');
  }
  return loadMnemonic({ filePath });
}

/**
 * Return actual file path used.
 */
export function getMnemonicPath({ filePath } = {}) {
  return resolvePath(filePath);
}
