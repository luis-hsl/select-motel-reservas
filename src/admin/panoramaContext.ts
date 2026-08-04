import { createContext, useContext } from 'react'
import type { Panorama } from '../lib/plugplayAdmin'

// Contexto e hook em arquivo separado do provider: um módulo que exporta
// componente e não-componente junto quebra o fast refresh do Vite.

export interface EstadoPanorama {
  dados: Panorama | null
  carregando: boolean
  /** Última busca falhou. Os dados anteriores seguem na tela. */
  semContato: boolean
  atualizadoEm: number | null
  recarregar: () => void
}

export const PanoramaCtx = createContext<EstadoPanorama>({
  dados: null,
  carregando: true,
  semContato: false,
  atualizadoEm: null,
  recarregar: () => {},
})

export function usePanorama(): EstadoPanorama {
  return useContext(PanoramaCtx)
}
