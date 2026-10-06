// Fatura condominial em PDF (v1.09A5): template Handlebars (fatura-template.html) + dados no
// formato de fatura/fatura-exemplo.json -> HTML -> PDF A4 no Puppeteer.
// Usado pela rota /api/admin/billing/render-pdf (modelo "fatura") e pelo script
// scripts/gerar-fatura-exemplo.mjs (confere o layout sem banco e sem login).
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Handlebars from 'handlebars'

let compilado = null

function caminhoTemplate() {
  // Na Vercel o arquivo vai junto pela regra "includeFiles" do vercel.json.
  const aqui = dirname(fileURLToPath(import.meta.url))
  return resolve(aqui, 'fatura-template.html')
}

// Handlebars escapa tudo por padrao ({{campo}}): nome de morador ou descricao com "<" nao vira HTML.
export function renderizarFaturaHtml(dados) {
  if (!compilado) {
    const handlebars = Handlebars.create()
    compilado = handlebars.compile(readFileSync(caminhoTemplate(), 'utf8'), { strict: false })
  }
  return compilado(dados)
}

// Na Vercel usa o Chromium enxuto do @sparticuz/chromium; localmente, o Chrome instalado
// (ou CHROME_EXECUTABLE_PATH).
export async function abrirNavegador() {
  const { default: puppeteer } = await import('puppeteer-core')

  if (process.env.VERCEL) {
    const { default: chromium } = await import('@sparticuz/chromium')
    return puppeteer.launch({ args: chromium.args, executablePath: await chromium.executablePath(), headless: true })
  }

  const executablePath = process.env.CHROME_EXECUTABLE_PATH
  return puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    ...(executablePath ? { executablePath } : { channel: 'chrome' }),
  })
}

// Seguranca (v2.10A2): o Chromium roda DENTRO do servidor. Se o HTML pedisse uma URL qualquer
// (ex.: um <img> apontando para um endereco interno), o servidor buscaria esse endereco e o
// resultado sairia impresso no PDF (SSRF). Por isso a pagina so pode carregar dados embutidos
// (data:/about:) e as fontes do Google Fonts que o template usa. Todo o resto e cancelado.
const ORIGENS_PERMITIDAS = ['https://fonts.googleapis.com/', 'https://fonts.gstatic.com/']

export function urlPermitidaNoPdf(url = '') {
  const texto = String(url)
  return texto.startsWith('data:') || texto.startsWith('about:') || ORIGENS_PERMITIDAS.some((origem) => texto.startsWith(origem))
}

export async function bloquearRedeExterna(pagina) {
  await pagina.setRequestInterception(true)
  pagina.on('request', (requisicao) => {
    if (requisicao.isInterceptResolutionHandled?.()) return
    if (urlPermitidaNoPdf(requisicao.url())) requisicao.continue()
    else requisicao.abort('blockedbyclient')
  })
  // Sem JavaScript: o template e so HTML + CSS, e um script injetado nao teria onde rodar.
  await pagina.setJavaScriptEnabled(false)
}

// A4 com as margens do proprio template (@page). A tabela de itens cresce e quebra pagina sozinha.
export async function gerarFaturaPdf(dados) {
  const html = renderizarFaturaHtml(dados)
  const navegador = await abrirNavegador()
  try {
    const pagina = await navegador.newPage()
    await bloquearRedeExterna(pagina)
    // As fontes vem do Google Fonts; se a rede falhar, o template cai em Helvetica e o PDF sai igual.
    await pagina.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 }).catch(() => pagina.setContent(html, { waitUntil: 'load' }))
    return await pagina.pdf({ format: 'A4', preferCSSPageSize: true, printBackground: true })
  } finally {
    await navegador.close()
  }
}
