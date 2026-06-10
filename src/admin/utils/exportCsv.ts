/** Escapa um valor para uma célula CSV (envolve em aspas quando necessário). */
function escapeCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

function triggerDownload(csvContent: string, filename: string) {
  // BOM (﻿) garante que o Excel abra acentuação UTF-8 corretamente.
  const blob = new Blob(['﻿' + csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Converte array de objetos para CSV e dispara download. */
export function downloadCsv(rows: Record<string, unknown>[], filename: string) {
  if (rows.length === 0) return
  const headers = Object.keys(rows[0])
  const csvContent = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escapeCell(r[h])).join(',')),
  ].join('\n')
  triggerDownload(csvContent, filename)
}

export type CsvSection = {
  /** Título da seção (vira uma linha destacada antes da tabela). */
  title?: string
  /** Linhas tabulares da seção. Cada objeto vira uma linha; as chaves do 1º viram o cabeçalho. */
  rows: Record<string, unknown>[]
  /** Texto solto (uma linha por item), pra notas/observações sem formato tabular. */
  notes?: string[]
}

/**
 * Gera um único CSV com várias seções (tabelas) separadas por linhas em branco.
 * Abre redondo no Excel/Google Sheets — cada seção tem seu próprio título e cabeçalho.
 */
export function downloadCsvSections(sections: CsvSection[], filename: string) {
  const lines: string[] = []
  sections.forEach((sec, idx) => {
    if (idx > 0) { lines.push(''); lines.push('') }
    if (sec.title) lines.push(escapeCell(`■ ${sec.title}`))
    sec.notes?.forEach(n => lines.push(escapeCell(n)))
    if (sec.rows.length > 0) {
      const headers = Object.keys(sec.rows[0])
      lines.push(headers.map(escapeCell).join(','))
      sec.rows.forEach(r => lines.push(headers.map(h => escapeCell(r[h])).join(',')))
    }
  })
  triggerDownload(lines.join('\n'), filename)
}
