import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../shared/Toast'
import { formatCurrency, formatReferenceLabel } from '../../lib/billingShared'
import { enrichChargesWithPaymentUrls, isChargeImageUrl } from '../../lib/charges'
import { DollarSign, CheckCircle, ExternalLink, QrCode, FileText, Receipt, CalendarClock, X, Copy } from 'lucide-react'
import { getChargePaymentStatusMeta, isChargePaid } from '../../lib/chargeStatus'

const TIPOS_LABEL = {
  condominio: 'Condominio',
  agua: 'Agua',
  energia: 'Energia',
  multa: 'Multa',
  outro: 'Outro',
}

function formatDate(dateValue = '') {
  if (!dateValue) return '-'
  return new Date(`${dateValue}T12:00:00`).toLocaleDateString('pt-BR')
}

function getPrimaryPaymentLink(cobranca) {
  return String(cobranca?.pagamento_link || cobranca?.pix_link || '').trim()
}

function getQrPreview(cobranca) {
  return cobranca?.pix_qr_preview || cobranca?.pix_qrcode_url || cobranca?.pix_qr_code || ''
}

export default function MoradorCobrancas() {
  const { profile } = useAuth()
  const { toast } = useToast()
  const [cobrancas, setCobrancas] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('todas')
  const [selected, setSelected] = useState(null)

  useEffect(() => {
    if (!profile?.id) return
    void fetchCobrancas()
  }, [profile?.id])

  const fetchCobrancas = async () => {
    if (!profile?.id) return

    setLoading(true)
    const { data } = await supabase
      .from('cobrancas')
      .select('*')
      .eq('morador_id', profile.id)
      .order('created_at', { ascending: false })

    const enriched = await enrichChargesWithPaymentUrls(data || [])
    setCobrancas(enriched)
    setLoading(false)
  }

  const filtered = useMemo(() => cobrancas.filter((cobranca) => {
    if (filter === 'pendentes') return !isChargePaid(cobranca)
    if (filter === 'pagas') return isChargePaid(cobranca)
    return true
  }), [cobrancas, filter])

  const totalPendente = useMemo(() => (
    cobrancas.filter((cobranca) => !isChargePaid(cobranca)).reduce((sum, cobranca) => sum + Number(cobranca.valor || 0), 0)
  ), [cobrancas])

  const totalPago = useMemo(() => (
    cobrancas.filter((cobranca) => isChargePaid(cobranca)).reduce((sum, cobranca) => sum + Number(cobranca.valor || 0), 0)
  ), [cobrancas])

  const copyPixCode = async (value) => {
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard indisponivel')
      }

      await navigator.clipboard.writeText(value)
      toast('Codigo Pix copiado.', 'success')
    } catch {
      toast('Nao foi possivel copiar o codigo Pix.', 'error')
    }
  }

  return (
    <div className="fade-in">
      <div className="page-header">
        <div className="page-title">Minhas cobrancas</div>
        <div className="page-subtitle">Historico financeiro do seu apartamento</div>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card">
          <div className="label">Pendente</div>
          <div className="value" style={{ color: '#f0883e', fontSize: 20 }}>{formatCurrency(totalPendente)}</div>
          <div className="sub">acompanhe vencimentos e pagamento</div>
        </div>
        <div className="stat-card">
          <div className="label">Total pago</div>
          <div className="value" style={{ color: '#3fb950', fontSize: 20 }}>{formatCurrency(totalPago)}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        {[
          ['todas', 'Todas'],
          ['pendentes', 'Pendentes'],
          ['pagas', 'Pagas'],
        ].map(([key, label]) => (
          <button key={key} className={`btn ${filter === key ? 'btn-primary' : 'btn-ghost'} btn-sm`} onClick={() => setFilter(key)}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <CheckCircle size={40} color="#3fb950" />
          <p>Nenhuma cobranca {filter !== 'todas' ? filter : ''} encontrada.</p>
        </div>
      ) : (
        <>
          <div className="table-wrap charges-desktop-table">
            <table>
              <thead>
                <tr>
                  <th>Descricao</th>
                  <th>Tipo</th>
                  <th>Referencia</th>
                  <th>Vencimento</th>
                  <th>Valor</th>
                  <th>Status</th>
                  <th>Pagamento</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((cobranca) => {
                  const paymentLink = getPrimaryPaymentLink(cobranca)
                  const hasAttachment = Boolean(cobranca.pagamento_anexo_download_url)
                  const hasBoleto = Boolean(cobranca.boleto_download_url)
                  const statusMeta = getChargePaymentStatusMeta(cobranca)
                  return (
                    <tr key={cobranca.id} style={{ cursor: 'pointer' }} onClick={() => setSelected(cobranca)}>
                      <td>{cobranca.descricao || TIPOS_LABEL[cobranca.tipo] || cobranca.tipo}</td>
                      <td><span className="badge badge-blue">{TIPOS_LABEL[cobranca.tipo] || cobranca.tipo}</span></td>
                      <td className="mono" style={{ color: '#8b949e' }}>{formatReferenceLabel(cobranca.mes_referencia)}</td>
                      <td style={{ color: '#8b949e' }}>{formatDate(cobranca.vencimento)}</td>
                      <td className="mono" style={{ fontWeight: 600 }}>{formatCurrency(cobranca.valor)}</td>
                      <td><span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {cobranca.pix_copy_paste_code && <span className="badge badge-orange">Pix</span>}
                          {paymentLink && <span className="badge badge-green">Link</span>}
                          {hasAttachment && <span className="badge badge-purple">Anexo</span>}
                          {hasBoleto && <span className="badge badge-blue">Boleto</span>}
                          {!paymentLink && !hasAttachment && !hasBoleto && <span style={{ color: '#8b949e' }}>-</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          <div className="charges-mobile-grid">
            {filtered.map((cobranca) => {
              const statusMeta = getChargePaymentStatusMeta(cobranca)

              return (
                <button key={cobranca.id} type="button" className="charge-card" onClick={() => setSelected(cobranca)}>
                  <div className="charge-card-header">
                    <span className="badge badge-blue">{TIPOS_LABEL[cobranca.tipo] || cobranca.tipo}</span>
                    <span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                  </div>
                  <div className="charge-card-title">{cobranca.descricao || TIPOS_LABEL[cobranca.tipo] || cobranca.tipo}</div>
                  <div className="charge-card-meta">
                    <span><CalendarClock size={12} /> {formatDate(cobranca.vencimento)}</span>
                    <span className="mono" style={{ fontWeight: 700 }}>{formatCurrency(cobranca.valor)}</span>
                  </div>
                  <div className="charge-card-sub">{formatReferenceLabel(cobranca.mes_referencia)}</div>
                </button>
              )
            })}
          </div>
        </>
      )}

      {cobrancas.some((cobranca) => !isChargePaid(cobranca)) && (
        <div className="card" style={{ marginTop: 20, textAlign: 'center', borderColor: '#58a6ff40' }}>
          <DollarSign size={20} color="#58a6ff" style={{ margin: '0 auto 8px' }} />
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Pagamento da cobranca</div>
          <div style={{ fontSize: 13, color: '#8b949e' }}>
            Abra a cobranca para ver link, QRCode, anexo e boleto disponivel para pagamento.
          </div>
        </div>
      )}

      {selected && (
        <div className="modal-overlay" onClick={(event) => event.target === event.currentTarget && setSelected(null)}>
          <div className="modal charge-detail-modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div className="modal-title">Detalhes da cobranca</div>
              <button className="btn btn-ghost btn-icon" onClick={() => setSelected(null)}>
                <X size={16} />
              </button>
            </div>

            <div className="charge-detail-grid">
              <div className="form-group">
                <label className="form-label">Descricao</label>
                <div className="charge-detail-value">{selected.descricao || TIPOS_LABEL[selected.tipo] || selected.tipo}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Tipo</label>
                <div className="charge-detail-value">{TIPOS_LABEL[selected.tipo] || selected.tipo}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Referencia</label>
                <div className="charge-detail-value">{formatReferenceLabel(selected.mes_referencia)}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Vencimento</label>
                <div className="charge-detail-value">{formatDate(selected.vencimento)}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Valor</label>
                <div className="charge-detail-value mono" style={{ fontWeight: 700 }}>{formatCurrency(selected.valor)}</div>
              </div>
              <div className="form-group">
                <label className="form-label">Status</label>
                <div className="charge-detail-value">
                  {(() => {
                    const statusMeta = getChargePaymentStatusMeta(selected)
                    return <span className={`badge ${statusMeta.badgeClass}`}>{statusMeta.label}</span>
                  })()}
                </div>
              </div>
            </div>

            {selected.observacao && (
              <div style={{ marginTop: 12 }}>
                <div className="form-label">Observacao</div>
                <div className="charge-detail-note">{selected.observacao}</div>
              </div>
            )}

            {getQrPreview(selected) && isChargeImageUrl(getQrPreview(selected)) && (
              <div className="charge-qr-preview">
                <div style={{ fontWeight: 600, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <QrCode size={14} /> QRCode de pagamento
                </div>
                <img src={getQrPreview(selected)} alt="QRCode de pagamento" />
              </div>
            )}

            {selected.pix_copy_paste_code && (
              <div style={{ marginTop: 14 }}>
                <div className="form-label">Pix copia e cola</div>
                <div className="charge-detail-note" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <span className="mono" style={{ wordBreak: 'break-all' }}>{selected.pix_copy_paste_code}</span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => copyPixCode(selected.pix_copy_paste_code)}>
                    <Copy size={13} /> Copiar
                  </button>
                </div>
              </div>
            )}

            <div className="charge-actions">
              {getPrimaryPaymentLink(selected) && (
                <a href={getPrimaryPaymentLink(selected)} target="_blank" rel="noreferrer" className="btn btn-primary">
                  <ExternalLink size={14} /> Abrir link de pagamento
                </a>
              )}
              {selected.pagamento_anexo_download_url && (
                <a href={selected.pagamento_anexo_download_url} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  <FileText size={14} /> Abrir anexo enviado
                </a>
              )}
              {selected.boleto_download_url && (
                <a href={selected.boleto_download_url} target="_blank" rel="noreferrer" className="btn btn-ghost">
                  <Receipt size={14} /> Abrir boleto
                </a>
              )}
            </div>

            {!isChargePaid(selected) && (
              <div className="charge-detail-note" style={{ marginTop: 12 }}>
                Depois do pagamento, a confirmacao continua manual pela administracao do condominio.
              </div>
            )}

            {!getPrimaryPaymentLink(selected) && !selected.pagamento_anexo_download_url && !selected.boleto_download_url && !selected.pix_copy_paste_code && !getQrPreview(selected) && (
              <div className="charge-detail-note" style={{ marginTop: 12 }}>
                Nenhuma forma de pagamento foi anexada para esta cobranca.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
