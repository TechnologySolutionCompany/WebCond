// Gera a fatura de exemplo (v1.09A5) sem banco e sem login, para conferir o layout:
//   npm run fatura-exemplo
// Le fatura/fatura-exemplo.json, monta o Pix no padrao do Banco Central a partir da chave do
// exemplo e grava fatura/saida/fatura-exemplo.html e .pdf (A4, Puppeteer + Chrome instalado).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import QRCode from 'qrcode'
import { gerarFaturaPdf, renderizarFaturaHtml } from '../api/_lib/fatura/render.js'
import { montarPixCopiaECola, normalizarChavePix } from '../src/lib/pix.js'

const raiz = resolve(import.meta.dirname, '..')
const exemplo = JSON.parse(readFileSync(resolve(raiz, 'fatura/fatura-exemplo.json'), 'utf8'))
const total = Number(String(exemplo.fatura.total).replace(/[^\d,]/g, '').replace(',', '.'))
const chave = exemplo.pagamento.pix_chave || exemplo.pagamento.pix_email
const chaveNormalizada = normalizarChavePix(chave)
const copiaECola = montarPixCopiaECola({
  chave,
  valor: total,
  nome: exemplo.condominio.nome,
  cidade: 'Olinda',
  txid: exemplo.fatura.numero,
  descricao: exemplo.morador.unidade,
})

const logo = `data:image/png;base64,${readFileSync(resolve(raiz, 'public/logo.png')).toString('base64')}`
const dados = {
  ...exemplo,
  condominio: { ...exemplo.condominio, logo_url: exemplo.condominio.logo_url || logo },
  pagamento: {
    ...exemplo.pagamento,
    pix_chave: chaveNormalizada?.chave || chave,
    pix_rotulo: { email: 'e-mail', telefone: 'celular', cpf: 'CPF', cnpj: 'CNPJ', aleatoria: 'chave aleatoria' }[chaveNormalizada?.tipo] || 'chave',
    pix_copia_cola: copiaECola,
    qrcode_url: copiaECola ? await QRCode.toDataURL(copiaECola, { margin: 1, width: 360 }) : '',
  },
}

const saida = resolve(raiz, 'fatura/saida')
mkdirSync(saida, { recursive: true })
writeFileSync(resolve(saida, 'fatura-exemplo.html'), renderizarFaturaHtml(dados))
console.log('HTML: fatura/saida/fatura-exemplo.html')
console.log(`Pix copia e cola: ${copiaECola}`)

try {
  writeFileSync(resolve(saida, 'fatura-exemplo.pdf'), await gerarFaturaPdf(dados))
  console.log('PDF:  fatura/saida/fatura-exemplo.pdf')
} catch (error) {
  console.error(`PDF nao gerado (${error.message}). Instale o Google Chrome ou defina CHROME_EXECUTABLE_PATH.`)
  process.exitCode = 1
}
