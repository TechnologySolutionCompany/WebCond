// Contrato versionado do modelo oficial. As chaves sao internas; os cabecalhos sao publicos.
export const UNIT_IMPORT_COLUMNS = Object.freeze([
  { key: 'numero', header: 'Apartamento' },
  { key: 'situacao', header: 'Situação' },
  { key: 'ownerName', header: 'Proprietário — nome completo' },
  { key: 'ownerCpf', header: 'Proprietário — CPF' },
  { key: 'ownerWhatsapp', header: 'Proprietário — WhatsApp' },
  { key: 'ownerEmail', header: 'Proprietário — email' },
  { key: 'ownerPassword', header: 'Proprietário — senha inicial' },
  { key: 'ownerIsResident', header: 'Proprietário é o morador?' },
  { key: 'residentName', header: 'Morador / inquilino — nome completo' },
  { key: 'residentCpf', header: 'Morador / inquilino — CPF' },
  { key: 'residentWhatsapp', header: 'Morador / inquilino — WhatsApp' },
  { key: 'residentEmail', header: 'Morador / inquilino — email' },
  { key: 'residentPassword', header: 'Morador / inquilino — senha inicial' },
].map(Object.freeze))

export const UNIT_IMPORT_HEADERS = Object.freeze(UNIT_IMPORT_COLUMNS.map(({ header }) => header))
