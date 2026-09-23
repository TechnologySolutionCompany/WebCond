// Respostas aos avisos do verificador de seguranca do painel do Supabase.
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import test from 'node:test'
import { senhaRecusadaPeloAuth } from '../api/_lib/supabaseAdmin.js'

// Quebra de linha do Windows nao muda o conteudo: normaliza antes de comparar.
const sql = readFileSync(new URL('../sql/2026-09-29_avisos_do_painel_supabase.sql', import.meta.url), 'utf8').replace(/\r\n/g, '\n')

test('senha vazada: o aviso chega em portugues e sem repetir a senha', () => {
  const recusa = { code: 'weak_password', message: 'Password is known to be weak and easy to guess, please choose a different one.' }
  const aviso = senhaRecusadaPeloAuth(recusa)
  assert.match(aviso, /vazamentos conhecidos/)
  assert.doesNotMatch(aviso, /password/i, 'a mensagem nao repete nada da senha nem do erro cru')

  // Tambem reconhece pela mensagem, caso o codigo mude de nome.
  assert.ok(senhaRecusadaPeloAuth({ message: 'This password has been found in a data breach' }))

  // Qualquer outro erro continua seguindo o caminho normal.
  assert.equal(senhaRecusadaPeloAuth({ message: 'User already registered' }), '')
  assert.equal(senhaRecusadaPeloAuth(null), '')
  assert.equal(senhaRecusadaPeloAuth({}), '')
})

test('SQL 09-29: tira as funcoes de gatilho da API sem quebrar os gatilhos', () => {
  assert.match(sql, /revoke all on function %s from public, anon, authenticated/)
  assert.match(sql, /t\.typname = 'trigger'/)
  // Teste de seguranca dentro da propria transacao: se o gatilho parar, nada e aplicado.
  assert.match(sql, /create trigger _webcond_teste_updated_at/)
  assert.match(sql, /raise exception 'TESTE FALHOU/)
  assert.match(sql, /^begin;$/m)
  assert.match(sql, /^commit;$/m)
})

test('SQL 09-29: search_path fixo e funcao orfa removida', () => {
  assert.match(sql, /alter function %s set search_path = public/)
  assert.match(sql, /drop function if exists public\.get_my_role\(\)/)
  // Se alguma politica depender dela, a funcao fica: o bloco trata a falha.
  assert.match(sql, /exception when others then[\s\S]{0,200}get_my_role\(\): mantida/)
})

test('SQL 09-29: bucket das logos continua publico para abrir, fechado para listar', () => {
  assert.match(sql, /drop policy if exists storage_condominios_select on storage\.objects/)
  // Gravar e apagar continuam so com o admin da plataforma: nada dessas policies e tocado.
  assert.doesNotMatch(sql, /drop policy if exists storage_condominios_(insert|update|delete)/)
  // O bucket nao pode deixar de ser publico: a logo precisa abrir no boleto.
  assert.doesNotMatch(sql, /set public = false/)
})

test('todo arquivo SQL fecha os blocos que abre', () => {
  // Um bloco PL/pgSQL abre com "do $$" e fecha com "$$;". Um cifrao perdido no meio do
  // caminho (edicao automatica, copiar e colar) quebra o arquivo inteiro no banco.
  const pasta = new URL('../sql/', import.meta.url)
  for (const nome of readdirSync(pasta).filter((arquivo) => arquivo.endsWith('.sql'))) {
    const conteudo = readFileSync(new URL(nome, pasta), 'utf8')
    const delimitadores = (conteudo.match(/\$\$/g) || []).length
    assert.equal(delimitadores % 2, 0, `${nome}: numero impar de delimitadores $$`)
    assert.doesNotMatch(conteudo, /(^|\n)do \$(\r?\n)/, `${nome}: bloco aberto com um cifrao so`)
    assert.doesNotMatch(conteudo, /(^|\n)\$;(\r?\n)/, `${nome}: bloco fechado com um cifrao so`)
    // begin/commit sempre aos pares: arquivo que abre transacao tem de fechar.
    const abre = (conteudo.match(/(^|\n)begin;/g) || []).length
    const fecha = (conteudo.match(/(^|\n)commit;/g) || []).length
    assert.equal(abre, fecha, `${nome}: ${abre} begin; para ${fecha} commit;`)
  }
})
