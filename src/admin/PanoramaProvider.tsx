import { useEffect, useState, type ReactNode } from 'react'
import { fetchPanorama, type Panorama } from '../lib/plugplayAdmin'
import { PanoramaCtx } from './panoramaContext'

// Estado do motel compartilhado pela casca.
//
// A faixa das suítes e a tela de Início querem exatamente o mesmo panorama. Sem
// isto seriam duas chamadas idênticas a cada 45s, e as duas podiam mostrar
// números de instantes diferentes na mesma tela — que é pior que estar
// desatualizado, porque parece bug.

const REFRESH_MS = 45_000

export function PanoramaProvider({ children }: { children: ReactNode }) {
  const [dados, setDados] = useState<Panorama | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [semContato, setSemContato] = useState(false)
  const [atualizadoEm, setAtualizadoEm] = useState<number | null>(null)
  const [recarga, setRecarga] = useState(0)

  useEffect(() => {
    let cancelado = false

    async function buscar() {
      const p: Panorama | null = await fetchPanorama()
      if (cancelado) return
      // Falha mantém o último panorama e acende o aviso. Zerar a tela a cada
      // instabilidade do ERP é pior que um dado de 45s atrás, avisado.
      if (p) {
        setDados(p)
        setSemContato(false)
        setAtualizadoEm(Date.now())
      } else {
        setSemContato(true)
      }
      setCarregando(false)
    }

    void buscar()
    const t = setInterval(() => { void buscar() }, REFRESH_MS)
    return () => { cancelado = true; clearInterval(t) }
  }, [recarga])

  return (
    <PanoramaCtx.Provider value={{
      dados, carregando, semContato, atualizadoEm,
      recarregar: () => setRecarga((n) => n + 1),
    }}>
      {children}
    </PanoramaCtx.Provider>
  )
}
