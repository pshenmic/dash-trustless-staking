// Consensus constants from Dash Core v24 (src/evo/providertx.h, specialtxman.cpp)

export const DUFFS_PER_DASH = 100_000_000

export const COLLATERAL: number = 1000 * DUFFS_PER_DASH
export const MIN_SHARE: number = 100 * DUFFS_PER_DASH
export const MIN_SHARES = 2
export const MAX_SHARES = 8
/** About two years at 2.5-minute blocks */
export const MAX_EARLY_PERIOD_BLOCKS = 420_480
export const MAX_OPERATOR_REWARD_BP = 10_000
/** Consensus ceiling on a ProDisTx fee */
export const MAX_DISSOLVE_FEE = 1_000_000
export const DEFAULT_DISSOLVE_FEE = 100_000

export const BLOCK_TIME_SECONDS = 150

/** One hour of blocks: how long a registration without a service address may read as Registered, not Error */
export const REGISTRATION_GRACE_BLOCKS = Math.round(3600 / BLOCK_TIME_SECONDS)

/** Template script every shared collateral output pays: 0x04 "DSHC" OP_DROP OP_TRUE */
export const SHARED_COLLATERAL_SCRIPT = '04445348437551'
