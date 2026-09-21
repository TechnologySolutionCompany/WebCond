// Planos da plataforma. ONE e Parceria disponiveis; PRO e MAX aparecem como "Em desenvolvimento".
// Parceria: condominio parceiro, todas as funcionalidades, gratuito e sem vencimento.
// `soon: true` em um item marca o que ainda esta por construir: a vitrine mostra "em breve"
// em vez de prometer como pronto.
export const PLANS = {
  ONE: {
    id: 'ONE',
    label: 'ONE',
    priceCents: 5990,
    priceLabel: 'R$ 59,90',
    documentLimit: 10,
    available: true,
    publicPlan: true,
    summary: 'O essencial para tirar a administracao do papel e do grupo de WhatsApp.',
    features: [
      { text: 'Ate 10 documentos por mes: atas, comprovantes e arquivos importantes' },
      { text: 'Arquivos guardados por 60 dias, com a opcao de fixar o que nao pode sumir', soon: true },
      { text: 'Cobrancas lancadas no sistema, para todas as unidades ou uma a uma' },
      { text: 'Boleto proprio do WebCond, sem vinculo com banco: espelha a chave Pix cadastrada e o QR Code enviado pelo sindico' },
      { text: 'Painel do morador com cobrancas, avisos, documentos e ocorrencias' },
    ],
  },
  PRO: {
    id: 'PRO',
    label: 'PRO',
    priceCents: 7990,
    priceLabel: 'R$ 79,90',
    documentLimit: 20,
    available: false,
    publicPlan: true,
    summary: 'Tudo do ONE, com aviso automatico para o morador e recebimento direto no banco.',
    features: [
      { text: 'Ate 20 documentos por mes, no mesmo modelo do ONE' },
      { text: 'Cobranca enviada vira notificacao no aplicativo do morador, por unidade ou para todas', soon: true },
      { text: 'Vinculo com o banco do condominio: o pagamento cai direto na conta, sem criar cobranca manual no banco', soon: true },
      { text: 'Baixa automatica do que ja foi pago', soon: true },
    ],
  },
  MAX: {
    id: 'MAX',
    label: 'MAX',
    priceCents: 9990,
    priceLabel: 'R$ 99,90',
    documentLimit: 50,
    available: false,
    publicPlan: true,
    summary: 'Tudo do PRO, com a cara do seu condominio.',
    features: [
      { text: 'Ate 50 documentos por mes, ou mais conforme a necessidade' },
      { text: 'Pacote 100% personalizado com as informacoes do proprio condominio', soon: true },
      { text: 'Boleto com o logo do condominio e informacoes detalhadas', soon: true },
      { text: 'Atendimento prioritario na plataforma', soon: true },
    ],
  },
  // Direcionado apenas pela administracao da plataforma: nunca aparece na vitrine publica.
  PARCERIA: {
    id: 'PARCERIA',
    label: 'Parceria',
    priceCents: 0,
    priceLabel: 'Gratuito',
    documentLimit: 50,
    available: true,
    publicPlan: false,
    partnership: true,
    summary: 'Condominio parceiro: todas as funcionalidades, sem custo e sem vencimento.',
    features: [{ text: 'Todas as funcionalidades liberadas' }],
  },
}

export const PLAN_LIST = Object.values(PLANS)
// O que o sindico ve ao cadastrar o condominio. Parceria fica de fora por decisao de produto.
export const PUBLIC_PLAN_LIST = PLAN_LIST.filter((plan) => plan.publicPlan)
export const STANDARD_PLAN_NAME = 'ONE'
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
