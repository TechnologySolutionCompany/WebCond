import { useCallback, useMemo, useRef, useState } from 'react'
import Papa from 'papaparse'
import { AlertTriangle, ArrowLeft, CheckCircle, Download, FileSpreadsheet, Loader2, Upload, X } from 'lucide-react'
import { analyzeUnitImport, confirmUnitImport } from '../../lib/adminApi'
import { useToast } from '../shared/Toast'
import { getUnitStatusMeta } from '../../lib/units'

const TEMPLATE_URL = '/templates/webcond-importacao-unidades-v1.xlsx'
const MAX_BYTES = 2 * 1024 * 1024
const PREVIEW_LIMIT = 40

function readAsBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo selecionado.'))
    reader.onload = () => resolve(String(reader.result || '').split(',').pop() || '')
    reader.readAsDataURL(file)
  })
}

function Stat({ label, value, color, helper }) {
  return (
    <div className="status-metric">
      <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text-dim)' }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: color || 'var(--text)' }}>{value}</div>
      {helper && <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{helper}</div>}
    </div>
  )
}

// Importacao de unidades por planilha: analisar (sem gravar) e depois confirmar.
export default function ImportarUnidades({ onClose, onImported }) {
  const { toast } = useToast()
  const inputRef = useRef(null)
  const [file, setFile] = useState(null)
  const [fileBase64, setFileBase64] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState('')
  const [analysis, setAnalysis] = useState(null)
  const [result, setResult] = useState(null)
  const [showIssues, setShowIssues] = useState(false)

  const issues = useMemo(() => [...(result?.falhas || []), ...(analysis?.errors || [])], [analysis, result])
  const unitsWithIssues = useMemo(() => new Set(issues.map((issue) => `${issue.lineNumber}:${issue.unit}`)).size, [issues])

  const selectFile = useCallback(async (nextFile) => {
    if (!nextFile) return
    if (!/\.xlsx$/i.test(nextFile.name)) {
      toast('Envie a planilha no formato .xlsx, como no modelo oficial.', 'error')
      return
    }
    if (nextFile.size > MAX_BYTES) {
      toast('O arquivo excede o limite de 2 MB.', 'error')
      return
    }

    setAnalysis(null)
    setResult(null)
    setFile(nextFile)
    try {
      setFileBase64(await readAsBase64(nextFile))
    } catch (error) {
      setFile(null)
      toast(error.message, 'error')
    }
  }, [toast])

  const handleAnalyze = async () => {
    if (!file || !fileBase64) return
    setBusy('analisando')
    setResult(null)
    try {
      const response = await analyzeUnitImport({ filename: file.name, file: fileBase64 })
      setAnalysis(response)
      setShowIssues((response.errors || []).length > 0)
      toast(`Análise concluída: ${response.summary?.validUnits || 0} unidade(s) pronta(s) para importar.`, 'success')
    } catch (error) {
      // O servidor devolve os problemas do arquivo junto com a mensagem.
      setAnalysis(error.details?.errors ? { errors: error.details.errors, summary: null, preview: [] } : null)
      setShowIssues(Boolean(error.details?.errors))
      toast(error.message || 'Não foi possível analisar a planilha.', 'error')
    } finally {
      setBusy('')
    }
  }

  const handleConfirm = async () => {
    if (!analysis?.batchId || !fileBase64) return
    setBusy('importando')
    try {
      const response = await confirmUnitImport({ batchId: analysis.batchId, filename: file.name, file: fileBase64 })
      setResult(response)
      setShowIssues((response.falhas || []).length > 0)
      const criadas = response.criadas || 0
      const falhas = (response.falhas || []).length
      toast(
        response.jaConfirmado
          ? `Esta planilha já havia sido importada: ${criadas} unidade(s) cadastrada(s). Nada foi duplicado.`
          : `Importação concluída: ${criadas} unidade(s) cadastrada(s)${falhas ? ` e ${falhas} com erro` : ''}.`,
        falhas ? 'info' : 'success',
      )
      onImported?.()
    } catch (error) {
      toast(error.message || 'Não foi possível concluir a importação.', 'error')
    } finally {
      setBusy('')
    }
  }

  // Relatorio de erros para corrigir a planilha. Nunca inclui senha.
  const downloadIssues = () => {
    const rows = issues.map((issue) => ({
      Linha: issue.lineNumber || '',
      Unidade: issue.unit || 'Não informada',
      Campo: issue.field || '',
      Código: issue.code || '',
      Problema: issue.message || '',
      'Como corrigir': issue.guidance || '',
    }))
    const csv = String.fromCharCode(0xfeff) + Papa.unparse(rows, { delimiter: ';' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
    link.download = 'problemas-importacao-unidades.csv'
    link.click()
    URL.revokeObjectURL(link.href)
  }

  const summary = analysis?.summary
  const missing = analysis?.missing
  const preview = analysis?.preview || []

  return (
    <div className="fade-in">
      <div className="page-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div>
            <div className="page-title">Importar unidades</div>
            <div className="page-subtitle">Cadastre várias unidades de uma vez pela planilha oficial. Nada é gravado antes da sua confirmação.</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <a className="btn btn-ghost" href={TEMPLATE_URL} download>
              <Download size={14} /> Baixar modelo
            </a>
            <button className="btn btn-ghost" onClick={onClose}>
              <ArrowLeft size={14} /> Voltar para unidades
            </button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div
          className={`import-dropzone ${dragging ? 'dragging' : ''}`}
          onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => { event.preventDefault(); setDragging(false); void selectFile(event.dataTransfer.files?.[0]) }}
          onClick={() => inputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inputRef.current?.click() } }}
          aria-label="Selecionar a planilha de unidades"
        >
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            style={{ display: 'none' }}
            onChange={(event) => { void selectFile(event.target.files?.[0]); event.target.value = '' }}
          />
          <Upload size={26} color="var(--green)" />
          <div style={{ fontWeight: 600 }}>{file ? file.name : 'Arraste a planilha aqui ou clique para escolher'}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {file ? `${(file.size / 1024).toFixed(0)} KB · clique para trocar o arquivo` : 'Somente .xlsx, até 2 MB'}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn btn-primary" onClick={handleAnalyze} disabled={!file || Boolean(busy)}>
            {busy === 'analisando' ? <><Loader2 size={14} className="spin-icon" /> Analisando...</> : <><FileSpreadsheet size={14} /> Analisar planilha</>}
          </button>
          {file && (
            <button className="btn btn-ghost" onClick={() => { setFile(null); setFileBase64(''); setAnalysis(null); setResult(null) }} disabled={Boolean(busy)}>
              <X size={14} /> Remover arquivo
            </button>
          )}
          {analysis && !result && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Confira a prévia abaixo antes de confirmar.</span>}
        </div>
      </div>

      {summary && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, marginBottom: 14 }}>Resumo da análise</div>
          <div className="status-metrics">
            <Stat label="Linhas lidas" value={summary.totalRows || 0} />
            <Stat label="Unidades válidas" value={summary.validUnits || 0} color="var(--green)" />
            <Stat label="Unidades com erro" value={summary.invalidUnits || 0} color={summary.invalidUnits ? 'var(--red)' : undefined} helper={`${summary.totalErrors || 0} erro(s) no total`} />
            <Stat label="Linhas vazias" value={summary.emptyRows || 0} helper="Ignoradas" />
            <Stat
              label="Unidades não enviadas"
              value={summary.missingUnits || 0}
              color={summary.missingUnits ? 'var(--orange)' : undefined}
              helper={missing?.kind === 'known' && missing.units?.length ? missing.units.slice(0, 6).join(', ') : 'Comparado com o total contratado'}
            />
            {typeof summary.capacity === 'number' && (
              <Stat label="Vagas disponíveis" value={summary.capacity} helper="Unidades contratadas ainda livres" color={summary.capacity < (summary.validUnits || 0) ? 'var(--orange)' : undefined} />
            )}
          </div>
          {typeof summary.capacity === 'number' && summary.capacity < (summary.validUnits || 0) && (
            <div style={{ marginTop: 12, fontSize: 13, color: 'var(--orange)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <AlertTriangle size={15} /> A planilha tem mais unidades válidas do que as vagas contratadas. As excedentes ficarão de fora.
            </div>
          )}
        </div>
      )}

      {preview.length > 0 && !result && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontWeight: 700 }}>Prévia ({preview.length} linha{preview.length === 1 ? '' : 's'})</div>
            {preview.length > PREVIEW_LIMIT && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Mostrando as {PREVIEW_LIMIT} primeiras.</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Linha</th><th>Unidade</th><th>Situação</th><th>Proprietário</th><th>Morador / inquilino</th><th>Status</th></tr>
              </thead>
              <tbody>
                {preview.slice(0, PREVIEW_LIMIT).map((row) => (
                  <tr key={row.lineNumber}>
                    <td>{row.lineNumber}</td>
                    <td style={{ fontWeight: 600 }}>{row.numero || '-'}</td>
                    <td>{row.situacao ? <span className={`badge ${getUnitStatusMeta(row.situacao).badge}`}>{getUnitStatusMeta(row.situacao).label}</span> : '-'}</td>
                    <td>{row.owner?.nome || '-'}{row.ownerIsResident ? <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>mora na unidade</div> : null}</td>
                    <td>{row.resident?.nome || '-'}</td>
                    <td>{row.valid ? <span className="badge badge-green">Pronta</span> : <span className="badge badge-red">Com erro</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ display: 'flex', gap: 10, marginTop: 16, flexWrap: 'wrap', alignItems: 'center' }}>
            <button className="btn btn-primary" onClick={handleConfirm} disabled={Boolean(busy) || !(summary?.validUnits > 0)}>
              {busy === 'importando' ? <><Loader2 size={14} className="spin-icon" /> Importando...</> : <><CheckCircle size={14} /> Importar {summary?.validUnits || 0} unidade(s)</>}
            </button>
            {!(summary?.validUnits > 0) && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Corrija os problemas na planilha e analise novamente.</span>}
          </div>
        </div>
      )}

      {result && (
        <div className="card" style={{ marginBottom: 20, borderLeft: `3px solid ${result.falhas?.length ? 'var(--orange)' : 'var(--green)'}` }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', flexWrap: 'wrap' }}>
            {result.falhas?.length ? <AlertTriangle size={22} color="var(--orange)" /> : <CheckCircle size={22} color="var(--green)" />}
            <div style={{ flex: 1, minWidth: 240 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>
                Importação concluída: {result.criadas || 0} unidade(s) cadastrada(s)
                {result.falhas?.length ? ` e ${result.falhas.length} com erro.` : '.'}
              </div>
              {result.jaConfirmado && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  Esta planilha já havia sido confirmada neste lote. Nada foi cadastrado duas vezes.
                </div>
              )}
              {result.semAcesso > 0 && (
                <div style={{ fontSize: 13, color: 'var(--orange)', marginTop: 6 }}>
                  {result.semAcesso} pessoa(s) entraram sem CPF: ficam cadastradas na unidade, mas só conseguem entrar no sistema depois que o CPF for informado, porque o login do morador é por CPF.
                </div>
              )}
              {result.reaproveitadas > 0 && !result.jaConfirmado && (
                <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
                  {result.reaproveitadas} unidade(s) já estavam gravadas neste lote e foram mantidas.
                </div>
              )}
              <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                {result.falhas?.length > 0 && (
                  <button className="btn btn-ghost btn-sm" onClick={() => setShowIssues((current) => !current)}>
                    {showIssues ? 'Ocultar problemas' : 'Ver problemas'}
                  </button>
                )}
                <button className="btn btn-ghost btn-sm" onClick={() => { setFile(null); setFileBase64(''); setAnalysis(null); setResult(null) }}>
                  Importar outra planilha
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {issues.length > 0 && showIssues && (
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 14 }}>
            <div>
              <div style={{ fontWeight: 700 }}>Problemas encontrados</div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {unitsWithIssues} unidade(s) com problema · {issues.length} erro(s) no total. O relatório não contém senhas.
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={downloadIssues}>
              <Download size={13} /> Baixar relatório
            </button>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="table">
              <thead>
                <tr><th>Linha</th><th>Unidade</th><th>Campo</th><th>Código</th><th>Problema</th><th>Como corrigir</th></tr>
              </thead>
              <tbody>
                {issues.map((issue, index) => (
                  <tr key={`${issue.lineNumber}-${issue.code}-${issue.field}-${index}`}>
                    <td>{issue.lineNumber || '-'}</td>
                    <td style={{ fontWeight: 600 }}>{issue.unit || 'Não informada'}</td>
                    <td>{issue.field}</td>
                    <td><code style={{ fontSize: 11 }}>{issue.code}</code></td>
                    <td>{issue.message}</td>
                    <td style={{ color: 'var(--text-muted)' }}>{issue.guidance}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
