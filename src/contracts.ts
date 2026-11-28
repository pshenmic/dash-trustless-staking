import schemaV1 from '../schema.json'
import schemaV2 from './data/schemas/generation-2.json'
import { contractId } from './config'
import type { ContractSource } from './data/types'

/*
 * A "generation" is one deployed contract plus the app rules that read it. Pools live in exactly one
 * generation forever and document ids are globally unique, so routes and local bookkeeping can address
 * them without ambiguity. Declared here — not in generations.tsx — so the data layer can read the list
 * without importing React pages.
 */
export interface ContractRef extends ContractSource {
  label: string
  /** Whether this generation accepts new pools and new joins */
  canWrite: boolean
  /**
   * Whether the deployed contract already has `poolMeta.archived`. The property is in the schema, but a
   * write against a contract without it fails validation, so the control stays hidden until a deploy.
   */
  archivedPool: boolean
  /**
   * Whether the deployed contract carries `pool.entryFee` / `pool.entryFeeAddress`. Both are in the schema,
   * but a write against a contract without them fails validation, so the create form stays hidden until
   * the deploy lands — flip this together with `deployedVersion` when it does.
   */
  entryFee: boolean
}

/** Oldest first. The default generation is the last entry that accepts writes. */
export const GENERATIONS: ContractRef[] = [
  {
    slug: 'v1',
    label: 'Version 1',
    contractId,
    schema: schemaV1 as Record<string, unknown>,
    deployedVersion: 3,
    // Existing pools stay readable, completable and dissolvable; new pools and joins are generation 2
    canWrite: false,
    archivedPool: false,
    entryFee: false
  },
  {
    slug: 'v2',
    label: 'Version 2',
    // Deployed 2026-11-24 with lock.entries; it supersedes 9ZAM86ny…, whose documents stay on chain
    contractId: 'BqjLq9CLn9MhbPdXmecXiBddHY4fugW9sXhfrNAGtbbr',
    schema: schemaV2 as Record<string, unknown>,
    deployedVersion: 1,
    // One member may publish a newer join; the contract no longer enforces uniqueness
    canWrite: true,
    // The deployed contract carries poolMeta.archived from the start
    archivedPool: true,
    // Not on BqjLq9… yet: the entry fee lands with the next contract deploy
    entryFee: false
  }
]

/** True when a generation's schema declares the document type — Drive rejects the query otherwise */
export function schemaHasDocument (schema: Record<string, unknown>, type: string): boolean {
  return schema[type] != null
}

/** True when this generation's pool document has the field (its schema decides, not the UI) */
export function poolSupports (ref: ContractRef, field: 'service'): boolean {
  const properties = (ref.schema.pool as { properties?: Record<string, unknown> } | undefined)?.properties
  return properties != null && field in properties
}

/**
 * True when this generation's lock stores the packed shares. Generation 1's lock has no `entries`, so
 * sending the property there fails validation — the shared lock UI has to ask the schema.
 */
export function lockSupportsEntries (ref: ContractRef): boolean {
  const properties = (ref.schema.lock as { properties?: Record<string, unknown> } | undefined)?.properties
  return properties != null && 'entries' in properties
}


export const defaultGeneration = [...GENERATIONS].reverse().find(g => g.canWrite) ?? GENERATIONS[0]

export function generationBySlug (slug: string | undefined): ContractRef | null {
  if (slug == null) return defaultGeneration
  return GENERATIONS.find(g => g.slug === slug) ?? null
}