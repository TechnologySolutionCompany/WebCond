import { useEffect, useMemo, useState } from 'react'
import { ArrowUpRight, QrCode, Save } from 'lucide-react'
import { useAuth } from '../../hooks/useAuth'
import { profileHasResource } from '../../lib/condominiumPlan'
import { useToast } from '../shared/Toast'
import { savePaymentSettings } from '../../lib/adminApi'
import { lerRecebimento, normalizarInfiniteTag, PROVEDORES_RECEBIMENTO } from '../../lib/recebimento'
import { normalizarChavePix } from '../../lib/pix'

const ROTULO_CHAVE = { email: 'E-mail', telefone: 'Celular', cpf: 'CPF', cnpj: 'CNPJ', aleatoria: 'Chave aleatoria' }

// Meu perfil > Recebimento (v1.09A5): como o condominio recebe as cobrancas.
// A fatura e sempre o mesmo modelo do WebCond; aqui o sindico escolhe para onde vai o dinheiro.
export default function RecebimentoTab({ condo, onSaved, onNavigate }) {
  const { toast } = useToast()
  const { profile } = useAuth()
  // Plano Pro (v2.10A1): QR Code automatico e InfinitePay com baixa automatica.
  const temPixAutomatico = profileHasResource(profile, 'pixAutomatico')
  const temBaixaAutomatica = profileHasResource(profile, 'baixaAutomatica')
  const atual = useMemo(() => lerRecebimento(condo?.metadata), [condo?.metadata])
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!condo) return
    setForm({
      pixKey: condo.pix_key || condo.chave_pix || '',
      bankDestination: condo.bank_details || '',
      provedor: atual.provedor,
      infinitepayTag: atual.infinitepayTag,
      mostrarUnidadesAbertas: atual.mostrarUnidadesAbertas,
      instrucoes: atual.instrucoes,
    })
  }, [condo, atual])

  if (!form) return <div className="me-panel"><div className="spinner" /></div>

  const chave = normalizarChavePix(form.pixKey)
  const update = (patch) => setForm((current) => ({ ...current, ...patch }))

  const handleSave = async (event) => {
    event.preventDefault()
    if (form.pixKey && !chave) {
      toast('Chave Pix invalida. Use e-mail, celular com DDD, CPF, CNPJ ou chave aleatoria.', 'error')
      return
    }
    setSaving(true)
    try {
      await savePaymentSettings({ ...form, infinitepayTag: normalizarInfiniteTag(form.infinitepayTag) })
      toast('Forma de recebimento salva. Vale para as proximas cobrancas.', 'success')
      onSaved?.()
    } catch (error) {
      toast(error.message || 'Nao foi possivel salvar.', 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <form className="me-panel" onSubmit={handleSave}>
      <div className="form-group">
        <label className="form-label" htmlFor="receb-chave">Chave Pix do condominio</label>
        <input id="receb-chave" className="input" autoCapitalize="none" spellCheck={false} value={form.pixKey} onChange={(event) => update({ pixKey: event.target.value })} placeholder="e-mail, celular, CPF, CNPJ ou chave aleatoria" />
        <span className="profile-hint">
          {form.pixKey
            ? chave
              ? <><QrCode size={11} style={{ verticalAlign: '-1px' }} /> {ROTULO_CHAVE[chave.tipo]}: {chave.chave}. {temPixAutomatico ? 'A fatura sai com o QR Code desta chave, ja com o valor de cada unidade.' : 'A chave aparece escrita na fatura. O QR Code automatico, com o valor de cada unidade, e do Plano PRO.'}</>
              : 'Chave em formato invalido: o QR Code nao vai sair na fatura.'
            : 'Sem chave, a fatura sai sem QR Code Pix.'}
        </span>
      </div>

      <div className="form-group">
        <label className="form-label" htmlFor="receb-banco">Banco da conta</label>
        <input id="receb-banco" className="input" value={form.bankDestination} onChange={(event) => update({ bankDestination: event.target.value })} placeholder="Ex.: InfinitePay, Nubank, Caixa, Inter" />
      </div>

      <div className="form-group">
        <span className="form-label">Como o morador paga</span>
        <div className="recebimento-opcoes" role="radiogroup">
          {Object.values(PROVEDORES_RECEBIMENTO).map((item) => {
            const bloqueado = item.baixaAutomatica && !temBaixaAutomatica
            return (
              <button key={item.id} type="button" role="radio" aria-checked={form.provedor === item.id} className="recebimento-opcao" disabled={bloqueado} onClick={() => update({ provedor: item.id })}>
                <input type="radio" readOnly checked={form.provedor === item.id} tabIndex={-1} aria-hidden="true" />
                <div>
                  <strong>{item.label}{bloqueado ? ' · Plano PRO' : ''}</strong>
                  <span>{item.resumo}</span>
                </div>
              </button>
            )
          })}
        </div>
        {!temBaixaAutomatica && (
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => onNavigate?.('planos')}>
            <ArrowUpRight size={13} /> Conhecer o Plano PRO
          </button>
        )}
      </div>

      {form.provedor === 'infinitepay' && (
        <div className="form-group">
          <label className="form-label" htmlFor="receb-tag">InfiniteTag da conta InfinitePay</label>
          <input id="receb-tag" className="input" autoCapitalize="none" spellCheck={false} value={form.infinitepayTag} onChange={(event) => update({ infinitepayTag: event.target.value })} placeholder="$nomedocondominio" />
          <span className="profile-hint">
            E o seu nome de usuario no app InfinitePay (aparece com $ no inicio). Cada cobranca lancada ganha um
            link "Pagar agora" (Pix ou cartao) e a baixa e automatica quando o banco confirma.
          </span>
        </div>
      )}

      <label className="recebimento-toggle">
        <input type="checkbox" checked={form.mostrarUnidadesAbertas} onChange={(event) => update({ mostrarUnidadesAbertas: event.target.checked })} />
        <span>Mostrar na fatura a lista de unidades com pagamento em aberto</span>
      </label>
      {form.mostrarUnidadesAbertas && (
        <div className="recebimento-aviso">
          Atencao: a fatura vai para todos os moradores. Expor quem esta devendo pode ser entendido como cobranca
          vexatoria (Codigo de Defesa do Consumidor, art. 42) e ja gerou condenacao por danos morais. A pratica mais
          segura e mostrar so o numero da unidade (como o WebCond faz), nunca o nome, e ter isso aprovado em assembleia.
        </div>
      )}

      <div className="form-group">
        <label className="form-label" htmlFor="receb-instrucoes">Instrucoes de pagamento na fatura (opcional)</label>
        <textarea id="receb-instrucoes" className="input" rows={2} maxLength={240} value={form.instrucoes} onChange={(event) => update({ instrucoes: event.target.value })} placeholder="Apos a data de vencimento, o pagamento fica disponivel no proximo mes." />
      </div>

      <div className="me-actions">
        <button type="submit" className="btn btn-primary" disabled={saving}><Save size={14} /> {saving ? 'Salvando...' : 'Salvar recebimento'}</button>
      </div>
    </form>
  )
}
