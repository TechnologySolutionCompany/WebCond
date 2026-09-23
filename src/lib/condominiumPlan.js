// Planos da plataforma. ONE e Parceria disponiveis; PRO e MAX aparecem como "Em desenvolvimento".
// Parceria: condominio parceiro, todas as funcionalidades, gratuito e sem vencimento.
// `soon: true` em um item marca o que ainda esta por construir: a vitrine mostra "em breve"
// em vez de prometer como pronto.
// notificationChannels: por onde avisos e cobrancas chegam ao morador. WhatsApp e cobrado por
// mensagem pela Meta, por isso fica nos planos maiores (ajuste aqui se mudar a decisao).
export const PLANS = {
  ONE: {
    id: 'ONE',
    notificationChannels: ['push', 'email'],
    label: 'ONE',
    nivel: 'Basico',
    priceCents: 4990,
    priceLabel: 'R$ 49,90',
    documentLimit: 10,
    available: true,
    publicPlan: true,
    customLogo: false,
    summary: 'Tudo o que o condominio precisa para sair do papel e do grupo de WhatsApp.',
    description: 'O plano basico: o sindico lanca as cobrancas, publica avisos e documentos, e o morador acompanha tudo pelo celular. E o que o WebCond ja faz hoje, do comeco ao fim.',
    features: [
      { text: 'Ate 10 documentos por mes: atas, comprovantes e arquivos importantes' },
      { text: 'Arquivos guardados por 60 dias, com a opcao de fixar o que nao pode sumir', soon: true },
      { text: 'Cobrancas lancadas no sistema, para todas as unidades ou uma a uma' },
      { text: 'Boleto proprio do WebCond, sem vinculo com banco: espelha a chave Pix cadastrada e o QR Code enviado pelo sindico' },
      { text: 'Painel do morador com cobrancas, avisos, documentos e ocorrencias' },
      { text: 'Aviso e cobranca chegam no celular do morador e por e-mail' },
      { text: 'Cadastro do morador por link, sem digitar um por um' },
    ],
  },
  PRO: {
    id: 'PRO',
    notificationChannels: ['push', 'email', 'whatsapp'],
    label: 'PRO',
    nivel: 'Intermediario',
    priceCents: 6590,
    priceLabel: 'R$ 65,90',
    documentLimit: 20,
    available: false,
    publicPlan: true,
    customLogo: false,
    summary: 'Tudo do ONE, com menos trabalho manual na hora de cobrar.',
    description: 'O plano intermediario: o sistema monta o Pix do boleto sozinho, o morador tambem e avisado pelo WhatsApp e o condominio dobra o limite de documentos.',
    features: [
      { text: 'Tudo o que o plano ONE ja faz' },
      { text: 'Ate 20 documentos por mes' },
      { text: 'Chave Pix e QR Code gerados automaticamente no boleto, sem enviar imagem', soon: true },
      { text: 'Aviso de cobranca tambem pelo WhatsApp do morador', soon: true },
      { text: 'Vinculo com o banco do condominio: o pagamento cai direto na conta', soon: true },
      { text: 'Baixa automatica do que ja foi pago', soon: true },
    ],
  },
  MAX: {
    id: 'MAX',
    notificationChannels: ['push', 'email', 'whatsapp'],
    label: 'MAX',
    nivel: 'Avancado',
    priceCents: 8990,
    priceLabel: 'R$ 89,90',
    documentLimit: 50,
    available: false,
    publicPlan: true,
    customLogo: true,
    summary: 'O completo: o sindico so faz os lancamentos, o resto anda sozinho.',
    description: 'O plano avancado: o boleto sai com a logo e o layout do proprio condominio, as faturas seguem automaticamente pelo WhatsApp dos moradores e o atendimento tem prioridade. O sindico entra na plataforma, faz o lancamento e acabou.',
    features: [
      { text: 'Tudo o que o plano PRO ja faz' },
      { text: 'Ate 50 documentos por mes, ou mais conforme a necessidade' },
      { text: 'Boleto personalizado com a logo do condominio, cadastrada pela administracao', soon: true },
      { text: 'Fatura enviada automaticamente pelo WhatsApp de cada morador', soon: true },
      { text: 'Layout do boleto ajustado conforme o condominio pedir', soon: true },
      { text: 'Atendimento prioritario no suporte', soon: true },
    ],
  },
  // Direcionado apenas pela administracao da plataforma: nunca aparece na vitrine publica.
  PARCERIA: {
    id: 'PARCERIA',
    notificationChannels: ['push', 'email', 'whatsapp'],
    label: 'Parceria',
    nivel: 'Parceria',
    priceCents: 0,
    priceLabel: 'Gratuito',
    documentLimit: 50,
    available: true,
    publicPlan: false,
    partnership: true,
    customLogo: true,
    summary: 'Condominio parceiro: todas as funcionalidades, sem custo e sem vencimento.',
    description: 'Plano direcionado pela administracao da plataforma: tudo liberado, sem custo e sem vencimento.',
    features: [{ text: 'Todas as funcionalidades liberadas' }],
  },
}

// ------------------------------------------------------------------
// Recursos: o que cada plano da direito (contrato) e o que o sistema ja entrega (realidade).
// ------------------------------------------------------------------
// Sao duas listas de proposito. A primeira e a promessa do plano; a segunda e o que existe
// hoje. Uma tela nunca deve perguntar "o plano e MAX?" e sim "este plano tem tal recurso?".
// Na v1.10, quando a geracao automatica do Pix ficar pronta, basta acrescentar a chave em
// RECURSOS_ENTREGUES: todas as telas passam a liberar o recurso de uma vez so.
export const RECURSOS = {
  documentos: 'Guardar documentos do condominio',
  boletoProprio: 'Boleto do WebCond com a chave Pix cadastrada',
  notificacaoApp: 'Aviso e cobranca no celular ou computador',
  notificacaoEmail: 'Aviso e cobranca por e-mail',
  notificacaoWhatsapp: 'Aviso e cobranca pelo WhatsApp do morador',
  pixAutomatico: 'Chave Pix e QR Code gerados sozinhos no boleto',
  baixaAutomatica: 'Baixa automatica do que ja foi pago',
  logoNoBoleto: 'Logo do proprio condominio no boleto',
  boletoPersonalizado: 'Layout do boleto ajustado conforme o condominio pedir',
  faturaAutomaticaWhatsapp: 'Fatura enviada sozinha pelo WhatsApp de cada morador',
  atendimentoPrioritario: 'Atendimento prioritario no suporte',
}

const BASE = ['documentos', 'boletoProprio', 'notificacaoApp', 'notificacaoEmail']
const PRO_EXTRA = ['notificacaoWhatsapp', 'pixAutomatico', 'baixaAutomatica']
const MAX_EXTRA = ['logoNoBoleto', 'boletoPersonalizado', 'faturaAutomaticaWhatsapp', 'atendimentoPrioritario']

export const PLAN_RESOURCES = {
  ONE: [...BASE],
  PRO: [...BASE, ...PRO_EXTRA],
  MAX: [...BASE, ...PRO_EXTRA, ...MAX_EXTRA],
  PARCERIA: [...BASE, ...PRO_EXTRA, ...MAX_EXTRA],
}

// O que o WebCond ja faz de verdade. O resto aparece como "em breve" e nao liga nada.
// O WhatsApp entra aqui quando a conta oficial da Meta estiver ligada (docs/notificacoes.md).
export const RECURSOS_ENTREGUES = new Set([
  'documentos',
  'boletoProprio',
  'notificacaoApp',
  'notificacaoEmail',
  'logoNoBoleto',
])

// O plano da direito ao recurso E o recurso existe. Use sempre esta funcao nas telas.
export function planHasResource(name, key) {
  return (PLAN_RESOURCES[normalizePlanName(name)] || []).includes(key) && RECURSOS_ENTREGUES.has(key)
}

// O plano promete o recurso, mesmo que ainda nao esteja pronto (serve para a vitrine).
export function planPromisesResource(name, key) {
  return (PLAN_RESOURCES[normalizePlanName(name)] || []).includes(key)
}

export const PLAN_LIST = Object.values(PLANS)
// O que o sindico ve ao cadastrar o condominio. Parceria fica de fora por decisao de produto.
export const PUBLIC_PLAN_LIST = PLAN_LIST.filter((plan) => plan.publicPlan)
export const STANDARD_PLAN_NAME = 'ONE'
// Planos que podem usar a logo do proprio condominio no boleto (a imagem e cadastrada pela plataforma).
export function planAllowsCustomLogo(name) {
  return planHasResource(name, 'logoNoBoleto')
}
export const STANDARD_PLAN_PRICE_CENTS = PLANS.ONE.priceCents
export const TRIAL_PERIOD_DAYS = 30
// Validade padrao de um plano contratado (mensal) e antecedencia do aviso "Atualize seu plano".
export const PLAN_PERIOD_DAYS = 30
export const PLAN_WARNING_DAYS = 5

// Nomes antigos (FREE, Padrao) caem no plano padrao.
export function normalizePlanName(name) {
  const normalized = String(name || '').trim().toUpperCase()
  return PLANS[normalized] ? normalized : STANDARD_PLAN_NAME
}

export function getPlan(name) {
  return PLANS[normalizePlanName(name)]
}

function parseDate(value) {
  if (!value) return null

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date
}

function addDays(date, days) {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfDay(date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function normalizeMetadata(metadata = {}) {
  const safeMetadata = metadata && typeof metadata === 'object' ? metadata : {}
  const planName = normalizePlanName(safeMetadata.plan_name || safeMetadata.planName)

  return {
    raw: safeMetadata,
    planName,
    planPriceCents: PLANS[planName].priceCents,
    subscriptionStatus: String(safeMetadata.subscription_status || safeMetadata.subscriptionStatus || 'trial').trim().toLowerCase() || 'trial',
    approvedAt: parseDate(safeMetadata.approved_at || safeMetadata.approvedAt),
    trialStartedAt: parseDate(safeMetadata.trial_started_at || safeMetadata.trialStartedAt),
    trialEndsAt: parseDate(safeMetadata.trial_ends_at || safeMetadata.trialEndsAt),
    subscriptionActivatedAt: parseDate(safeMetadata.subscription_activated_at || safeMetadata.subscriptionActivatedAt),
    planExpiresAt: parseDate(safeMetadata.plan_expires_at || safeMetadata.planExpiresAt),
  }
}

export function buildTrialMetadata(metadata = {}, baseDate = new Date()) {
  const current = normalizeMetadata(metadata)
  const trialBaseDate = current.trialStartedAt || current.approvedAt || parseDate(baseDate) || new Date()
  const trialEndDate = current.trialEndsAt || addDays(trialBaseDate, TRIAL_PERIOD_DAYS)

  return {
    ...current.raw,
    plan_name: current.planName,
    plan_price_cents: current.planPriceCents,
    subscription_status: current.subscriptionStatus === 'active' ? 'active' : 'trial',
    approved_at: (current.approvedAt || parseDate(baseDate) || new Date()).toISOString(),
    trial_started_at: trialBaseDate.toISOString(),
    trial_ends_at: trialEndDate.toISOString(),
  }
}

// expiresAt: validade do plano contratado. Sem data informada, mantem a atual ou vale PLAN_PERIOD_DAYS dias.
export function activatePlanMetadata(metadata = {}, activatedAt = new Date(), expiresAt = null) {
  const current = normalizeMetadata(metadata)
  const normalizedActivatedAt = parseDate(activatedAt) || new Date()
  const planExpiresAt = parseDate(expiresAt) || current.planExpiresAt || addDays(normalizedActivatedAt, PLAN_PERIOD_DAYS)

  if (PLANS[current.planName].partnership) {
    const { plan_expires_at: _ignored, ...rest } = buildTrialMetadata(current.raw, current.approvedAt || normalizedActivatedAt)
    return {
      ...rest,
      subscription_status: 'active',
      subscription_activated_at: current.subscriptionActivatedAt?.toISOString() || normalizedActivatedAt.toISOString(),
    }
  }

  return {
    ...buildTrialMetadata(current.raw, current.approvedAt || normalizedActivatedAt),
    subscription_status: 'active',
    subscription_activated_at: current.subscriptionActivatedAt?.toISOString() || normalizedActivatedAt.toISOString(),
    plan_expires_at: planExpiresAt.toISOString(),
  }
}

// Teste ou plano vencido NAO bloqueia o login: o painel do condominio fica somente para
// visualizacao (planLocked) e aparece o aviso "Atualize seu plano".
export function getCondominiumAccessState(condominium = {}, now = new Date()) {
  const metadata = normalizeMetadata(condominium?.metadata)
  const rawStatus = String(condominium?.status || 'pending').trim().toLowerCase() || 'pending'
  const currentDate = startOfDay(now)
  const trialBaseDate = metadata.trialStartedAt || metadata.approvedAt || parseDate(condominium?.updated_at) || parseDate(condominium?.created_at)
  const trialEndDate = metadata.trialEndsAt || (trialBaseDate ? addDays(trialBaseDate, TRIAL_PERIOD_DAYS) : null)
  const subscriptionActive = metadata.subscriptionStatus === 'active'
  const isTrialExpired = rawStatus === 'active' && !subscriptionActive && Boolean(trialEndDate) && currentDate >= startOfDay(trialEndDate)
  const plan = PLANS[metadata.planName]
  // Fim do periodo atual: teste (30 dias da aprovacao) ou validade do plano contratado.
  const planEndDate = subscriptionActive ? (plan.partnership ? null : metadata.planExpiresAt) : trialEndDate
  const planDaysLeft = planEndDate ? Math.round((startOfDay(planEndDate) - currentDate) / 86400000) : null
  const isPlanExpired = rawStatus === 'active' && planDaysLeft !== null && planDaysLeft <= 0
  const isPlanExpiringSoon = rawStatus === 'active' && planDaysLeft !== null && planDaysLeft > 0 && planDaysLeft <= PLAN_WARNING_DAYS

  return {
    rawStatus,
    effectiveStatus: rawStatus,
    blockReason: rawStatus === 'blocked' ? 'manual_block' : null,
    shouldBlockAccess: rawStatus === 'blocked' || rawStatus === 'rejected' || rawStatus === 'pending',
    isTrialExpired,
    planAttention: isPlanExpired,
    planLocked: isPlanExpired,
    planExpiringSoon: isPlanExpiringSoon,
    planDaysLeft,
    planEndsAt: planEndDate ? planEndDate.toISOString() : null,
    planExpiresAt: metadata.planExpiresAt ? metadata.planExpiresAt.toISOString() : null,
    planName: plan.id,
    planPriceCents: plan.priceCents,
    planPriceLabel: plan.priceLabel,
    documentLimit: plan.documentLimit,
    subscriptionStatus: subscriptionActive ? 'active' : 'trial',
    approvedAt: metadata.approvedAt ? metadata.approvedAt.toISOString() : null,
    trialStartedAt: trialBaseDate ? trialBaseDate.toISOString() : null,
    trialEndsAt: trialEndDate ? trialEndDate.toISOString() : null,
    subscriptionActivatedAt: metadata.subscriptionActivatedAt ? metadata.subscriptionActivatedAt.toISOString() : null,
  }
}
