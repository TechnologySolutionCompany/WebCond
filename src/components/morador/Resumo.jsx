import { RefreshCcw } from 'lucide-react'
import { useResumoCondominio } from '../../hooks/useResumoCondominio'
import { formatReferenceLong } from '../../lib/billingShared'
import ResumoCards from '../shared/ResumoCards'
import StatusPorMes from '../shared/StatusPorMes'

function formatMoney(value = 0) {
  return Number(value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatHora(iso) {
  const date = iso ? new Date(iso) : null
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
}

// Resumo do condominio para o morador (v2.10A5): os cartoes do painel do sindico, a arrecadacao
// da competencia e o status das cobrancas por mes. So para ver: sem exportar nem baixar.
export default function MoradorResumo({ isActive = true }) {
  const { resumo, erro, recarregar } = useResumoCondominio(isActive)

  if (!resumo && !erro) return <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}><div className="spinner" /></div>

  const arrecadacao = resumo?.arrecadacao || { lancado: 0, recebido: 0 }
  const pctRecebido = arrecadacao.lancado ? Math.round((arrecadacao.recebido / arrecadacao.lancado) * 100) : 0
  const cobradas = resumo?.unidades_cobradas || 0
  const largura = (n) => (cobradas ? `${(n / cobradas) * 100}%` : '0%')

  return (
    <div className="fade-in screen">
      <div className="screen-head">
        <div>
          <h1 className="screen-title">Resumo do condomínio</h1>
          <div className="screen-sub">Acompanhe o andamento das cobranças de todo o condomínio. Só totais: nenhum nome ou unidade aparece.</div>
        </div>
        <div className="screen-actions">
          <span className="live-chip"><span className="live-dot" />{resumo?.atualizado_em ? `Atualizado às ${formatHora(resumo.atualizado_em)}` : 'Ao vivo'}</span>
          <button type="button" className="mini-btn mini-btn-icon" onClick={() => void recarregar()} title="Atualizar agora" aria-label="Atualizar agora"><RefreshCcw size={15} /></button>
        </div>
      </div>

      {erro && <div className="empty-card" style={{ padding: 16 }}><span>{erro}</span></div>}

      {resumo && (
        <>
          <ResumoCards cartoes={resumo.cartoes} unidadesAtivas={resumo.unidades_ativas ?? 0} unidadesSub={`${resumo.total_unidades} cadastradas`} />

          <section className="home-panel home-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="home-panel-head" style={{ padding: 0 }}>
              <span className="home-panel-title">Arrecadação{resumo.competencia ? ` · ${formatReferenceLong(resumo.competencia)}` : ''}</span>
            </div>
            {!cobradas ? (
              <div className="home-muted">Nenhuma cobrança lançada até o momento.</div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                  <span className="arrec-pct">{pctRecebido}%</span>
                  <span className="home-muted">{formatMoney(arrecadacao.recebido)} de {formatMoney(arrecadacao.lancado)} recebidos</span>
                </div>
                <div className="home-bar" style={{ height: 14 }}>
                  <div style={{ width: largura(resumo.pago), background: 'var(--green-solid)' }} />
                  <div style={{ width: largura(resumo.em_aberto), background: 'var(--amber-solid)' }} />
                  <div style={{ width: largura(resumo.inadimplente), background: 'var(--red-solid)' }} />
                </div>
                <div className="arrec-legend">
                  <span><i style={{ background: 'var(--green-solid)' }} />Pagas <b>{resumo.pago}</b></span>
                  <span><i style={{ background: 'var(--amber-solid)' }} />Em aberto <b>{resumo.em_aberto}</b></span>
                  <span><i style={{ background: 'var(--red-solid)' }} />Inadimplentes <b>{resumo.inadimplente}</b></span>
                </div>
              </>
            )}
          </section>

          <section className="home-panel home-panel-pad" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <div className="home-panel-title">Status das cobranças por mês</div>
              <div className="home-muted" style={{ fontSize: 13, marginTop: 4 }}>Unidades pagas, em aberto e inadimplentes nos últimos 6 meses. O número em cima é quanto já foi pago.</div>
            </div>
            <StatusPorMes historico={resumo.historico || []} />
          </section>

          <div className="home-note">
            Em aberto até o fim do mês do vencimento; sem pagamento confirmado até lá, a unidade passa para inadimplente no dia 1 do mês seguinte.
          </div>
        </>
      )}
    </div>
  )
}
