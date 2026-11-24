import { createContext, useContext, useEffect, type ReactNode } from 'react'
import { useLocation, useParams } from 'react-router'
import { defaultGeneration, generationBySlug, type ContractRef } from './contracts'
import { setActiveGeneration } from './data'
import { NotFoundPage } from './pages/NotFoundPage'

export {
  GENERATIONS, defaultGeneration, generationBySlug, poolSupports, type ContractRef
} from './contracts'

interface GenerationContextValue {
  ref: ContractRef
  /** '' for the default (unprefixed) routes, '/v1' for an explicit generation prefix */
  base: string
}

const GenerationContext = createContext<GenerationContextValue>({ ref: defaultGeneration, base: '' })

/** Reads `:slug` from the route, validates it, and exposes the generation to the subtree */
export function GenerationRoute ({ children }: { children: ReactNode }): ReactNode {
  const { slug } = useParams()
  const ref = generationBySlug(slug)
  if (ref == null) return <NotFoundPage />
  return <GenerationContext.Provider value={{ ref, base: slug == null ? '' : `/${slug}` }}>{children}</GenerationContext.Provider>
}

export function useGeneration (): GenerationContextValue {
  return useContext(GenerationContext)
}

/**
 * Keeps the backend's active generation in step with the URL, so direct platform calls (all writes,
 * plus dialogs outside a GenerationRoute) target the contract on screen. Mounted once in the shell.
 */
export function useSyncActiveGeneration (): void {
  const { pathname } = useLocation()
  const first = pathname.split('/').filter(Boolean)[0] ?? ''
  useEffect(() => { setActiveGeneration(generationBySlug(first)?.slug ?? null) }, [first])
}

/** A pool's page inside the generation you are currently browsing */
export function poolPath (base: string, poolId: string): string {
  return `${base}/pools/${poolId}`
}

/** A pool's page addressed by the generation it actually lives in: unprefixed only for the default one */
export function generationPath (slug: string, poolId: string): string {
  return poolPath(slug === defaultGeneration.slug ? '' : `/${slug}`, poolId)
}