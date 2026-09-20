import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { formatCpfValue, maskCpf, maskEmail, maskPhone } from '../../lib/privacy'

const FORMATTERS = {
  cpf: { mask: maskCpf, full: formatCpfValue, label: 'CPF' },
  phone: { mask: maskPhone, full: (value) => String(value || '').trim() || '-', label: 'telefone' },
  email: { mask: maskEmail, full: (value) => String(value || '').trim() || '-', label: 'e-mail' },
}

// Mostra o dado mascarado; o valor completo aparece so quando a pessoa clica no olho.
export default function SensitiveValue({ value, type = 'cpf', canReveal = true }) {
  const [revealed, setRevealed] = useState(false)
  const formatter = FORMATTERS[type] || FORMATTERS.cpf
  const hasValue = Boolean(String(value || '').trim())

  if (!hasValue) return <span>-</span>

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{revealed ? formatter.full(value) : formatter.mask(value)}</span>
      {canReveal && (
        <button
          type="button"
          className="btn btn-ghost btn-icon btn-sm"
          onClick={() => setRevealed((current) => !current)}
          title={revealed ? `Ocultar ${formatter.label}` : `Mostrar ${formatter.label}`}
          aria-label={revealed ? `Ocultar ${formatter.label}` : `Mostrar ${formatter.label}`}
          style={{ padding: 2, height: 22, width: 22, minWidth: 22 }}
        >
          {revealed ? <EyeOff size={13} /> : <Eye size={13} />}
        </button>
      )}
    </span>
  )
}
