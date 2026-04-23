import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envContent = readFileSync('.env', 'utf8')
const env = envContent.split('\n').reduce((acc, line) => {
  const [key, value] = line.split('=')
  if (key && value) acc[key] = value.replace(/['"]/g, '')
  return acc
}, {})

const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY)

async function checkMoradores() {
  const { data, error } = await supabase
    .from('profiles')
    .select('nome, cpf, email')
    .eq('role', 'morador')

  if (error) {
    console.error('Erro:', error)
    return
  }

  console.log('Moradores encontrados:', data?.length || 0)
  data?.forEach(m => {
    console.log(`- ${m.nome}: CPF="${m.cpf}" Email="${m.email}"`)
  })
}

checkMoradores()
