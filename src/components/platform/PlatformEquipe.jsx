import { useCallback, useEffect, useState } from 'react'
import { KeyRound, Lock, Trash2, Unlock, UserPlus, Users } from 'lucide-react'
import { useToast } from '../shared/Toast'
import { listSupportTeam, saveSupportTeam } from '../../lib/platformApi'

const emptyForm = { nome: '', cpf: '', whatsapp: '', senha: '' }

// Contas de suporte: entram pelo CPF e so veem Suporte (chamados) e Status da plataforma.
// Nao aprovam, editam nem excluem condominios, nao veem moradores, cobrancas ou documentos.
export default function PlatformEquipe({ isActive = true }) {
  const { toast } = useToast()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState('')
  // Troca de senha em linha (campo mascarado), nunca em prompt do navegador.
  const [passwordFor, setPasswordFor] = useState({ id: '', senha: '' })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const result = await listSupportTeam()
      setMembers(result.membros || [])
    } catch (error) {
      toast(error.message || 'Nao foi possivel carregar a equipe.', 'error')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    if (isActive) void load()
  }, [isActive, load])

  const run = async (key, payload, message) => {
    setSaving(key)
    try {
      await saveSupportTeam(payload)
      toast(message, 'success')
      await load()
      return true
    } catch (error) {
      toast(error.message || 'Nao foi possivel concluir.', 'error')
      return false
    } finally {
      setSaving('')
    }
  }

  const create = async (event) => {
    event.preventDefault()
    const ok = await run('criar', { acao: 'criar', ...form }, `Conta criada. ${form.nome.split(' ')[0]} entra com o CPF e a senha definida.`)
    if (ok) setForm(emptyForm)
  }

  const changePassword = async (member) => {
    const ok = await run(member.id, { acao: 'senha', id: member.id, senha: passwordFor.senha }, 'Senha alterada. Passe a nova senha para a pessoa por um canal seguro.')
    if (ok) setPasswordFor({ id: '', senha: '' })
  }

  const toggle = (member) => {
    const acao = member.ativo ? 'bloquear' : 'liberar'
    if (member.ativo && !window.confirm(`Bloquear o acesso de ${member.nome}? A pessoa sai do painel na hora.`)) return
    void run(member.id, { acao, id: member.id }, member.ativo ? 'Acesso bloqueado.' : 'Acesso liberado.')
  }

  const remove = (member) => {
    if (!window.confirm(`Remover a conta de ${member.nome}? As respostas que ela deu continuam nos chamados.`)) return
    void run(member.id, { acao: 'excluir', id: member.id }, 'Conta removida.')
  }

  return (
    <div className="fade-in" style={{ maxWidth: 760 }}>
      <div className="page-header">
        <div className="page-title">Equipe de suporte</div>
        <div className="page-subtitle">
          Acesso limitado: a pessoa entra com CPF e senha e so ve os chamados de suporte e o status da plataforma.
          Nao aprova, edita nem exclui condominios e nao ve moradores, cobrancas ou documentos.
        </div>
      </div>

      <form className="card" onSubmit={create} style={{ marginBottom: 20 }}>
        <div className="profile-card-title"><UserPlus size={16} /> Nova conta de suporte</div>
        <div className="me-grid" style={{ marginBottom: 14 }}>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="equipe-nome">Nome completo</label>
            <input id="equipe-nome" className="input" value={form.nome} maxLength={120} onChange={(event) => setForm({ ...form, nome: event.target.value })} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="equipe-cpf">CPF (login)</label>
            <input id="equipe-cpf" className="input" value={form.cpf} inputMode="numeric" onChange={(event) => setForm({ ...form, cpf: event.target.value })} placeholder="000.000.000-00" />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="equipe-whatsapp">WhatsApp (opcional)</label>
            <input id="equipe-whatsapp" className="input" value={form.whatsapp} inputMode="tel" onChange={(event) => setForm({ ...form, whatsapp: event.target.value })} />
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label" htmlFor="equipe-senha">Senha inicial</label>
            <input id="equipe-senha" className="input" type="password" autoComplete="new-password" value={form.senha} onChange={(event) => setForm({ ...form, senha: event.target.value })} placeholder="Minimo de 8 caracteres" />
          </div>
        </div>
        <div className="me-actions">
          <button type="submit" className="btn btn-primary" disabled={saving === 'criar'}><UserPlus size={14} /> {saving === 'criar' ? 'Criando...' : 'Criar conta'}</button>
        </div>
      </form>

      <div className="card">
        <div className="profile-card-title"><Users size={16} /> Contas</div>
        {loading ? <div className="spinner" /> : members.length === 0 ? (
          <p className="profile-card-sub" style={{ margin: 0 }}>Nenhuma conta de suporte ainda.</p>
        ) : (
          <div className="team-list">
            {members.map((member) => (
              <div key={member.id} className="team-row">
                <div className="team-row-info">
                  <strong>{member.nome} {!member.ativo && <span className="badge badge-red" style={{ marginLeft: 6 }}>Bloqueado</span>}</strong>
                  <span>CPF {member.cpf} · desde {new Date(member.created_at).toLocaleDateString('pt-BR')}</span>
                </div>
                {passwordFor.id === member.id ? (
                  <div className="team-row-actions">
                    <input className="input" style={{ width: 190 }} type="password" autoComplete="new-password" placeholder="Nova senha (8+)" value={passwordFor.senha} onChange={(event) => setPasswordFor({ id: member.id, senha: event.target.value })} autoFocus />
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => void changePassword(member)} disabled={saving === member.id || passwordFor.senha.length < 8}>Salvar</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasswordFor({ id: '', senha: '' })}>Cancelar</button>
                  </div>
                ) : (
                <div className="team-row-actions">
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPasswordFor({ id: member.id, senha: '' })} disabled={saving === member.id}><KeyRound size={13} /> Senha</button>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(member)} disabled={saving === member.id}>
                    {member.ativo ? <><Lock size={13} /> Bloquear</> : <><Unlock size={13} /> Liberar</>}
                  </button>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ color: 'var(--red)' }} onClick={() => remove(member)} disabled={saving === member.id}><Trash2 size={13} /> Remover</button>
                </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
