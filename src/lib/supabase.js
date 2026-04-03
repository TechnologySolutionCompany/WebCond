import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const forceDemoMode = import.meta.env.VITE_FORCE_DEMO_MODE === 'true'
const useDemoMode = forceDemoMode || !supabaseUrl || !supabaseAnonKey

export const DEMO_ADMIN_EMAIL = 'admin@tscbr.com'
export const DEMO_ADMIN_PASSWORD = 'admin123@'
export const DEMO_MORADOR_PREVIEW_ID = 'morador-1'
export const isDemoMode = useDemoMode

const STORAGE_KEY = 'webcond_demo_state'
const SESSION_KEY = 'webcond_demo_session'

const DEFAULT_USERS = [
  {
    id: 'admin-1',
    email: DEMO_ADMIN_EMAIL,
    password: DEMO_ADMIN_PASSWORD,
    user_metadata: { role: 'admin', nome: 'Administrador Universal' },
  },
  {
    id: 'morador-1',
    email: 'morador@webcond.test',
    password: 'Morador123!',
    user_metadata: { role: 'morador', nome: 'Maria Moradora' },
  },
]

const DEFAULT_PROFILES = [
  {
    id: 'admin-1',
    role: 'admin',
    nome: 'Administrador Universal',
    email: DEMO_ADMIN_EMAIL,
    ativo: true,
    apartamento: '',
    telefone: '(81) 90000-0000',
    whatsapp: '(81) 90000-0000',
    cpf: '000.000.000-00',
    data_entrada: '2024-01-01',
    observacao: '',
    created_at: new Date().toISOString(),
  },
  {
    id: 'morador-1',
    role: 'morador',
    nome: 'Maria Moradora',
    email: 'morador@webcond.test',
    ativo: true,
    apartamento: '101',
    telefone: '(81) 91234-5678',
    whatsapp: '(81) 91234-5678',
    cpf: '123.456.789-00',
    data_entrada: '2024-02-15',
    observacao: '',
    created_at: new Date().toISOString(),
  },
]

const DEFAULT_AVISOS = [
  {
    id: 'aviso-1',
    titulo: 'Atenção ao calendário de limpeza',
    conteudo: 'A manutenção irá realizar limpeza das áreas comuns nesta sexta-feira. Evite estacionar em vagas de visitantes.',
    tipo: 'informativo',
    ativo: true,
    created_at: new Date().toISOString(),
  },
  {
    id: 'aviso-2',
    titulo: 'Reunião do condomínio',
    conteudo: 'A reunião do condomínio acontecerá na próxima terça às 19h no salão de festas.',
    tipo: 'aviso',
    ativo: true,
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
]

const DEFAULT_DOCUMENTOS = [
  {
    id: 'doc-1',
    titulo: 'Regimento Interno',
    descricao: 'Regimento interno do condomínio',
    categoria: 'regimento',
    publico: true,
    arquivo_url: 'https://example.com/regimento.pdf',
    created_by: 'admin-1',
    created_at: new Date().toISOString(),
  },
]

const DEFAULT_COBRANCAS = [
  {
    id: 'cob-1',
    morador_id: 'morador-1',
    descricao: 'Condomínio março/2026',
    tipo: 'condominio',
    mes_referencia: '2026-03',
    vencimento: '2026-04-15',
    valor: 180.0,
    pago: false,
    created_by: 'admin-1',
    created_at: new Date().toISOString(),
  },
  {
    id: 'cob-2',
    morador_id: 'morador-1',
    descricao: 'Água março/2026',
    tipo: 'agua',
    mes_referencia: '2026-03',
    vencimento: '2026-04-15',
    valor: 85.5,
    pago: true,
    data_pagamento: '2026-04-10',
    created_by: 'admin-1',
    created_at: new Date(Date.now() - 86400000).toISOString(),
  },
]

const initialState = {
  users: DEFAULT_USERS,
  profiles: DEFAULT_PROFILES,
  avisos: DEFAULT_AVISOS,
  documentos: DEFAULT_DOCUMENTOS,
  cobrancas: DEFAULT_COBRANCAS,
}

const isBrowser = typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
const clone = (value) => JSON.parse(JSON.stringify(value))

const ensureDefaults = (parsed = {}) => {
  const users = clone(parsed.users || DEFAULT_USERS)
  const profiles = clone(parsed.profiles || DEFAULT_PROFILES)
  const adminUser = clone(DEFAULT_USERS[0])
  const previewUser = clone(DEFAULT_USERS[1])
  const adminProfile = clone(DEFAULT_PROFILES[0])
  const previewProfile = clone(DEFAULT_PROFILES[1])

  const adminUserIndex = users.findIndex((user) => user.id === adminUser.id)
  if (adminUserIndex >= 0) users[adminUserIndex] = { ...users[adminUserIndex], ...adminUser }
  else users.unshift(adminUser)

  const previewUserIndex = users.findIndex((user) => user.id === previewUser.id)
  if (previewUserIndex >= 0) users[previewUserIndex] = { ...users[previewUserIndex], ...previewUser }
  else users.push(previewUser)

  const adminProfileIndex = profiles.findIndex((profile) => profile.id === adminProfile.id)
  if (adminProfileIndex >= 0) profiles[adminProfileIndex] = { ...profiles[adminProfileIndex], ...adminProfile }
  else profiles.unshift(adminProfile)

  const previewProfileIndex = profiles.findIndex((profile) => profile.id === previewProfile.id)
  if (previewProfileIndex >= 0) profiles[previewProfileIndex] = { ...profiles[previewProfileIndex], ...previewProfile }
  else profiles.push(previewProfile)

  return {
    users,
    profiles,
    avisos: clone(parsed.avisos || DEFAULT_AVISOS),
    documentos: clone(parsed.documentos || DEFAULT_DOCUMENTOS),
    cobrancas: clone(parsed.cobrancas || DEFAULT_COBRANCAS),
  }
}

const loadState = () => {
  if (!isBrowser) return clone(initialState)
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (!saved) return clone(initialState)
    const parsed = JSON.parse(saved)
    return ensureDefaults(parsed)
  } catch {
    return clone(initialState)
  }
}

const loadSession = () => {
  if (!isBrowser) return null
  try {
    const saved = window.localStorage.getItem(SESSION_KEY)
    return saved ? JSON.parse(saved) : null
  } catch {
    return null
  }
}

const saveSession = (session) => {
  if (!isBrowser) return
  window.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
}

const clearSession = () => {
  if (!isBrowser) return
  window.localStorage.removeItem(SESSION_KEY)
}

const state = useDemoMode ? loadState() : null
let currentSession = useDemoMode ? loadSession() : null
const subscribers = new Set()

const notifySubscribers = (event, session) => {
  subscribers.forEach((callback) => callback(event, session))
}

const normalizeProfile = (user) => ({
  id: user.id,
  role: user.user_metadata?.role || 'morador',
  nome: user.user_metadata?.nome || user.email,
  email: user.email,
  ativo: true,
  apartamento: user.user_metadata?.role === 'morador' ? '101' : '',
  telefone: '(81) 90000-0000',
  whatsapp: '(81) 90000-0000',
  cpf: '000.000.000-00',
  data_entrada: new Date().toISOString().slice(0, 10),
  observacao: '',
  created_at: new Date().toISOString(),
})

const saveState = () => {
  if (!isBrowser) return
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
  } catch {
    // ignore
  }
}

const getUserFromCredentials = (email, password) => {
  return state.users.find((user) => user.email === email && user.password === password)
}

const getUserByEmail = (email) => state.users.find((user) => user.email === email)

const buildUserResponse = (user) => ({
  id: user.id,
  email: user.email,
  user_metadata: user.user_metadata,
})

const buildSession = (user) => ({
  user: buildUserResponse(user),
  access_token: 'demo-token',
  expires_at: Date.now() + 1000 * 60 * 60,
})

const createId = () => `id-${Math.random().toString(16).slice(2)}`

const filterRows = (rows, filters) => {
  if (!filters.length) return rows
  return rows.filter((row) => filters.every((filter) => row[filter.col] === filter.value))
}

const sortRows = (rows, order) => {
  if (!order) return rows
  return [...rows].sort((a, b) => {
    const aValue = a[order.col]
    const bValue = b[order.col]
    if (aValue === bValue) return 0
    if (aValue == null) return 1
    if (bValue == null) return -1
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return order.ascending ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue)
    }
    return order.ascending ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1)
  })
}

const parseSelectColumns = (selectColumns) => {
  const joinMatch = selectColumns.match(/(\w+):([\w_]+)\(([^)]+)\)/)
  if (!joinMatch) return { columns: selectColumns, join: null }
  return {
    columns: selectColumns,
    join: {
      alias: joinMatch[1],
      key: joinMatch[2],
      fields: joinMatch[3].split(',').map((field) => field.trim()),
    },
  }
}

const buildResultRow = (row, selectColumns, join) => {
  let result = row
  if (selectColumns && selectColumns !== '*' && !selectColumns.includes('*')) {
    const columns = selectColumns.split(',').map((col) => col.trim())
    result = columns.reduce((acc, col) => {
      if (col in row) acc[col] = row[col]
      return acc
    }, {})
  } else {
    result = { ...row }
  }

  if (join) {
    const related = state.profiles.find((profile) => profile.id === row[join.key])
    result[join.alias] = related
      ? join.fields.reduce((acc, field) => {
          if (field in related) acc[field] = related[field]
          return acc
        }, {})
      : null
  }

  return result
}

const executeQuery = async (table, query) => {
  if (!state[table]) {
    console.error(`❌ Tabela '${table}' não existe.`)
    return { data: null, error: { message: `Tabela '${table}' não existe.` } }
  }

  const rows = state[table]
  const filters = query.filters || []
  const filtered = filterRows(rows, filters)
  const ordered = sortRows(filtered, query.order)
  const limited = query.limit != null ? ordered.slice(0, query.limit) : ordered
  const selection = parseSelectColumns(query.selectColumns)

  console.log(`📊 Query DEMO [${table}]:`, {
    totalRows: rows.length,
    filters: filters.map(f => `${f.col}=${f.value}`).join(', '),
    filteredRows: filtered.length,
    limited: limited.length,
    single: query.single,
  })

  if (query.action === 'select') {
    const data = limited.map((row) => buildResultRow(row, query.selectColumns, selection.join))
    const result = query.single ? data[0] ?? null : data
    
    console.log(`📊 SELECT resultado:`, {
      resultCount: Array.isArray(result) ? result.length : (result ? 1 : 0),
      result: result?.id || result?.[0]?.id || null
    })
    
    return {
      data: result,
      count: query.count ? data.length : undefined,
      error: null,
    }
  }

  if (query.action === 'insert') {
    const payloads = Array.isArray(query.insertData) ? query.insertData : [query.insertData]
    const inserted = payloads.map((payload) => {
      const item = {
        ...payload,
        id: payload.id || createId(),
        created_at: payload.created_at || new Date().toISOString(),
      }
      if (table === 'profiles' && item.ativo == null) item.ativo = true
      if (table === 'cobrancas') item.pago = item.pago ?? false
      state[table].push(item)
      console.log(`✅ INSERT [${table}]:`, { id: item.id, role: item.role })
      return item
    })
    saveState()
    return { data: inserted, error: null }
  }

  if (query.action === 'upsert') {
    const payload = query.upsertData
    const existingIndex = payload.id ? state[table].findIndex((row) => row.id === payload.id) : -1
    let item
    if (existingIndex >= 0) {
      item = { ...state[table][existingIndex], ...payload, updated_at: new Date().toISOString() }
      state[table][existingIndex] = item
    } else {
      item = {
        ...payload,
        id: payload.id || createId(),
        created_at: payload.created_at || new Date().toISOString(),
        ativo: payload.ativo == null ? true : payload.ativo,
      }
      state[table].push(item)
    }
    saveState()
    return { data: [item], error: null }
  }

  if (query.action === 'update') {
    const updated = []
    state[table] = state[table].map((row) => {
      if (filters.every((filter) => row[filter.col] === filter.value)) {
        const next = { ...row, ...query.updateData, updated_at: new Date().toISOString() }
        updated.push(next)
        return next
      }
      return row
    })
    saveState()
    return { data: updated, error: null }
  }

  if (query.action === 'delete') {
    state[table] = state[table].filter((row) => !filters.every((filter) => row[filter.col] === filter.value))
    saveState()
    return { data: null, error: null }
  }

  return { data: null, error: { message: 'Ação desconhecida.' } }
}

const createFakeQuery = (table) => {
  const query = {
    action: 'select',
    selectColumns: '*',
    count: false,
    filters: [],
    order: null,
    limit: null,
    insertData: null,
    updateData: null,
    upsertData: null,
    single: false,
    select(columns = '*', opts = {}) {
      this.action = 'select'
      this.selectColumns = columns
      this.count = opts.count === 'exact'
      return this
    },
    eq(col, value) {
      this.filters.push({ col, value })
      return this
    },
    order(col, opts = {}) {
      this.order = { col, ascending: opts.ascending !== false }
      return this
    },
    limit(value) {
      this.limit = value
      return this
    },
    single() {
      this.single = true
      return this
    },
    insert(data) {
      this.action = 'insert'
      this.insertData = data
      return this
    },
    update(data) {
      this.action = 'update'
      this.updateData = data
      return this
    },
    delete() {
      this.action = 'delete'
      return this
    },
    upsert(data) {
      this.action = 'upsert'
      this.upsertData = data
      return this
    },
    then(resolve, reject) {
      return executeQuery(table, this).then(resolve, reject)
    },
    catch(fn) {
      return executeQuery(table, this).catch(fn)
    },
  }

  return query
}

const createFakeStorage = (bucket) => ({
  upload: async (fileName) => ({ data: { path: `${bucket}/${fileName}` }, error: null }),
  getPublicUrl: (fileName) => ({ data: { publicUrl: `https://example.com/${bucket}/${fileName}` } }),
  remove: async () => ({ data: null, error: null }),
})

const fakeSupabase = {
  auth: {
    signInWithPassword: async ({ email, password }) => {
      console.log('🔓 signInWithPassword:', email)
      const user = getUserFromCredentials(email, password)
      if (!user) {
        console.error('❌ Usuário não encontrado:', email)
        return { data: null, error: { message: 'E-mail ou senha incorretos.' } }
      }
      
      console.log('✅ Usuário encontrado:', user.id)
      
      // Ensure profile exists for this user
      let profile = state.profiles.find((p) => p.id === user.id)
      console.log('📊 Perfil existe?', profile ? 'SIM' : 'NÃO')
      
      if (!profile) {
        console.log('➕ Criando novo perfil para:', user.id)
        profile = {
          ...normalizeProfile(user),
          role: user.user_metadata?.role || 'morador',
          nome: user.user_metadata?.nome || user.email,
        }
        state.profiles.push(profile)
        saveState()
        console.log('✅ Perfil criado:', profile.id, profile.role)
      }
      
      const session = buildSession(user)
      currentSession = session
      saveSession(session)
      console.log('✅ Session criada:', session.user.id)
      notifySubscribers('SIGNED_IN', session)
      return { data: { user: buildUserResponse(user), session }, error: null }
    },
    signOut: async () => {
      currentSession = null
      clearSession()
      notifySubscribers('SIGNED_OUT', null)
      return { data: null, error: null }
    },
    getSession: async () => {
      console.log('📋 getSession() chamado. CurrentSession:', currentSession?.user?.id)
      
      // Ensure profile exists if there's an active session
      if (currentSession?.user?.id) {
        let profile = state.profiles.find((p) => p.id === currentSession.user.id)
        console.log('🔍 Procurando perfil em state.profiles. Total profiles:', state.profiles.length)
        console.log('   Profile encontrado?', profile ? 'SIM' : 'NÃO')
        
        if (!profile) {
          console.log('➕ Perfil não existe, tentando criar...')
          const user = state.users.find((u) => u.id === currentSession.user.id)
          if (user) {
            profile = {
              ...normalizeProfile(user),
              role: user.user_metadata?.role || 'morador',
              nome: user.user_metadata?.nome || user.email,
            }
            state.profiles.push(profile)
            saveState()
            console.log('✅ Perfil criado em getSession:', profile.id)
          }
        }
      }
      console.log('📋 getSession retornando:', currentSession?.user?.id)
      return { data: { session: currentSession }, error: null }
    },
    getUser: async () => ({ data: { user: currentSession?.user ?? null }, error: null }),
    onAuthStateChange: (callback) => {
      subscribers.add(callback)
      if (currentSession) {
        setTimeout(() => callback('SIGNED_IN', currentSession), 0)
      }
      return {
        data: {
          subscription: {
            unsubscribe: () => subscribers.delete(callback),
          },
        },
      }
    },
    admin: {
      createUser: async ({ email, password, email_confirm: _email_confirm, user_metadata }) => {
        if (getUserByEmail(email)) {
          return { data: null, error: { message: 'Usuário já existe.' } }
        }
        const id = createId()
        const user = {
          id,
          email,
          password: password || 'demo1234',
          user_metadata: user_metadata || { role: 'morador', nome: email },
        }
        state.users.push(user)
        state.profiles.push({
          ...normalizeProfile(user),
          role: user.user_metadata.role,
          nome: user.user_metadata.nome,
        })
        saveState()
        return { data: { user: buildUserResponse(user) }, error: null }
      },
    },
    signUp: async ({ email, password, options }) => {
      if (getUserByEmail(email)) {
        return { data: null, error: { message: 'Usuário já existe.' } }
      }
      const id = createId()
      const metadata = options?.data || {}
      const user = {
        id,
        email,
        password: password || 'demo1234',
        user_metadata: { role: metadata.role || 'morador', nome: metadata.nome || email },
      }
      state.users.push(user)
      saveState()
      return { data: { user: buildUserResponse(user) }, error: null }
    },
  },
  from: (table) => createFakeQuery(table),
  storage: {
    from: (bucket) => createFakeStorage(bucket),
  },
}

export const supabase = useDemoMode ? fakeSupabase : createClient(supabaseUrl, supabaseAnonKey)

export const signIn = async (email, password) => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  return { data, error }
}

export const signOut = async () => {
  const { error } = await supabase.auth.signOut()
  return { error }
}

export const getCurrentUser = async () => {
  const { data: { user } } = await supabase.auth.getUser()
  return user
}
