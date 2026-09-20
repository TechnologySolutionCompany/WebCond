import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatZipCode, lookupZipCode, normalizeZipCode } from '../../lib/address'

// Campos de endereco com preenchimento automatico pelo CEP. Renderiza itens para um grid de 2 colunas.
export default function AddressFields({ value, onChange, required = false, inputStyle, labelStyle }) {
  const [lookupState, setLookupState] = useState({ loading: false, message: '' })
  const mark = required ? ' *' : ''

  const update = (patch) => onChange({ ...value, ...patch })

  const handleZipChange = async (rawValue) => {
    const zipCode = normalizeZipCode(rawValue)
    update({ zip_code: zipCode })
    if (zipCode.length !== 8) {
      setLookupState({ loading: false, message: '' })
      return
    }

    setLookupState({ loading: true, message: '' })
    try {
      const found = await lookupZipCode(zipCode)
      if (!found) {
        setLookupState({ loading: false, message: 'CEP nao encontrado. Preencha o endereco manualmente.' })
        return
      }

      onChange({
        ...value,
        zip_code: zipCode,
        street: found.street || value.street,
        district: found.district || value.district,
        city: found.city || value.city,
        state: found.state || value.state,
      })
      setLookupState({ loading: false, message: '' })
    } catch {
      setLookupState({ loading: false, message: 'Consulta de CEP indisponivel. Preencha manualmente.' })
    }
  }

  const field = (key, label, props = {}) => (
    <div className="form-group" style={props.fullWidth ? { gridColumn: '1/-1' } : undefined}>
      <label className="form-label" style={labelStyle}>{label}</label>
      <input
        className="input"
        style={inputStyle}
        value={value[key] || ''}
        onChange={(event) => update({ [key]: event.target.value })}
        required={props.required}
        placeholder={props.placeholder}
        maxLength={props.maxLength}
      />
    </div>
  )

  return (
    <>
      <div className="form-group">
        <label className="form-label" style={labelStyle}>
          CEP{mark} {lookupState.loading && <Loader2 size={12} className="spin-icon" style={{ verticalAlign: 'middle' }} />}
        </label>
        <input
          className="input"
          style={inputStyle}
          inputMode="numeric"
          placeholder="00000-000"
          value={formatZipCode(value.zip_code)}
          onChange={(event) => { void handleZipChange(event.target.value) }}
          required={required}
        />
        {lookupState.message && <div style={{ fontSize: 11, color: '#d29922', marginTop: 4 }}>{lookupState.message}</div>}
      </div>
      {field('number', `Numero${mark}`, { required, placeholder: '100' })}
      {field('street', `Endereco (logradouro)${mark}`, { required, fullWidth: true, placeholder: 'Rua, avenida...' })}
      {field('complement', 'Complemento', { placeholder: 'Bloco, torre, referencia' })}
      {field('district', `Bairro${mark}`, { required })}
      {field('city', `Cidade${mark}`, { required })}
      {field('state', `UF${mark}`, { required, maxLength: 2, placeholder: 'PE' })}
    </>
  )
}
