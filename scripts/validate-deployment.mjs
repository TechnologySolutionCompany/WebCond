#!/usr/bin/env node

/**
 * 🚀 Pre-Deployment Validation Script
 * 
 * Use este script para validar se tudo está pronto para fazer deploy
 * 
 * Uso:
 *   npm run validate-deploy
 *   ou
 *   node scripts/validate-deployment.mjs
 */

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.resolve(__dirname, '..')

// ANSI colors para output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
}

const checks = {
  passed: [],
  failed: [],
  warnings: [],
}

function log(color, prefix, message) {
  console.log(`${color}${prefix}${colors.reset} ${message}`)
}

function section(title) {
  console.log(`\n${colors.cyan}${'═'.repeat(60)}${colors.reset}`)
  console.log(`${colors.cyan}${title}${colors.reset}`)
  console.log(`${colors.cyan}${'═'.repeat(60)}${colors.reset}`)
}

function checkPassed(message) {
  checks.passed.push(message)
  log(colors.green, '✅', message)
}

function checkFailed(message) {
  checks.failed.push(message)
  log(colors.red, '❌', message)
}

function checkWarning(message) {
  checks.warnings.push(message)
  log(colors.yellow, '⚠️ ', message)
}

// 1. Validar arquivos críticos
function validateFiles() {
  section('1️⃣  VALIDANDO ARQUIVOS CRÍTICOS')

  const criticalFiles = [
    'package.json',
    'vite.config.js',
    'vercel.json',
    'src/App.jsx',
    'src/main.jsx',
    'api/health.js',
    'schema.sql',
  ]

  criticalFiles.forEach(file => {
    const filePath = path.join(projectRoot, file)
    if (fs.existsSync(filePath)) {
      checkPassed(`Arquivo existe: ${file}`)
    } else {
      checkFailed(`Arquivo NÃO encontrado: ${file}`)
    }
  })
}

// 2. Validar variáveis de ambiente locais
function validateEnv() {
  section('2️⃣  VALIDANDO VARIÁVEIS DE AMBIENTE')

  // Os scripts do projeto leem .env; .env.local é aceito como alternativa do Vite.
  const envFile = ['.env.local', '.env'].find((file) => fs.existsSync(path.join(projectRoot, file)))
  const envPath = envFile && path.join(projectRoot, envFile)
  const examplePath = path.join(projectRoot, '.env.example')

  if (envPath) {
    checkPassed(`${envFile} existe`)

    const content = fs.readFileSync(envPath, 'utf8')
    
    const required = [
      'VITE_SUPABASE_URL',
      'VITE_SUPABASE_ANON_KEY',
      'SUPABASE_URL',
      'SUPABASE_ANON_KEY',
      'SUPABASE_SERVICE_ROLE_KEY',
    ]

    required.forEach(varName => {
      if (content.includes(varName)) {
        const value = content.split(`${varName}=`)[1]?.split('\n')[0]?.trim()
        if (value && value !== '' && !value.includes('seu-')) {
          checkPassed(`${varName} preenchido`)
        } else {
          checkFailed(`${varName} vazio ou com placeholder`)
        }
      } else {
        checkWarning(`${varName} não encontrado (pode estar em outro arquivo)`)
      }
    })
  } else {
    checkWarning('.env não existe (copie .env.example para .env no desenvolvimento local)')
    if (fs.existsSync(examplePath)) {
      checkPassed('.env.example existe (use como referência)')
    }
  }
}

// 3. Validar .gitignore
function validateGitignore() {
  section('3️⃣  VALIDANDO SEGURANÇA DO GIT')

  const gitignorePath = path.join(projectRoot, '.gitignore')

  if (fs.existsSync(gitignorePath)) {
    const shouldIgnore = [
      '.env',
      '.env.local',
      'node_modules',
      'dist',
      '.DS_Store',
    ]

    // git check-ignore respeita globs (ex.: .env.*), ao contrário de busca literal no texto.
    shouldIgnore.forEach(pattern => {
      try {
        execSync(`git check-ignore -q --no-index "${pattern}"`, { stdio: 'pipe', cwd: projectRoot })
        checkPassed(`${pattern} está em .gitignore`)
      } catch {
        checkWarning(`${pattern} NÃO está em .gitignore - risco de segurança!`)
      }
    })
  } else {
    checkFailed('.gitignore não encontrado!')
  }

  // Verificar se arquivos .env reais estão trackados no Git (BAD!)
  try {
    const tracked = execSync('git ls-files .env .env.local', { stdio: 'pipe', cwd: projectRoot }).toString().trim()
    if (tracked) {
      checkFailed(`Arquivo(s) de ambiente no Git: ${tracked.split(/\r?\n/).join(', ')}. Execute: git rm --cached <arquivo>`)
    } else {
      checkPassed('.env e .env.local não estão no Git ✅')
    }
  } catch {
    checkWarning('Git não disponível ou projeto não é repositório Git')
  }
}

// 4. Validar package.json
function validatePackageJson() {
  section('4️⃣  VALIDANDO DEPENDÊNCIAS')

  const packagePath = path.join(projectRoot, 'package.json')
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))

  const required = [
    '@supabase/supabase-js',
    'react',
    'react-dom',
    'react-router-dom',
    'vite',
  ]

  required.forEach(dep => {
    if (pkg.dependencies?.[dep] || pkg.devDependencies?.[dep]) {
      checkPassed(`Dependência encontrada: ${dep}`)
    } else {
      checkFailed(`Dependência FALTANDO: ${dep}`)
    }
  })

  // Verificar scripts
  const requiredScripts = ['build', 'dev']
  requiredScripts.forEach(script => {
    if (pkg.scripts?.[script]) {
      checkPassed(`Script "npm run ${script}" existe`)
    } else {
      checkWarning(`Script "npm run ${script}" não encontrado`)
    }
  })
}

// 5. Validar estrutura de diretórios
function validateStructure() {
  section('5️⃣  VALIDANDO ESTRUTURA DO PROJETO')

  const requiredDirs = [
    'src',
    'src/components',
    'src/lib',
    'api',
    'public',
    'scripts',
  ]

  requiredDirs.forEach(dir => {
    const dirPath = path.join(projectRoot, dir)
    if (fs.existsSync(dirPath)) {
      checkPassed(`Diretório encontrado: ${dir}/`)
    } else {
      checkFailed(`Diretório NÃO encontrado: ${dir}/`)
    }
  })
}

// 6. Validar build
function validateBuild() {
  section('6️⃣  VALIDANDO BUILD')

  const distPath = path.join(projectRoot, 'dist')
  const buildOkPath = path.join(projectRoot, 'node_modules')

  if (fs.existsSync(buildOkPath)) {
    checkPassed('node_modules existe (dependências instaladas)')
  } else {
    checkWarning('node_modules não existe - execute: npm install')
  }

  if (fs.existsSync(distPath)) {
    checkPassed('dist/ existe (build pronto)')
  } else {
    checkWarning('dist/ não existe - execute: npm run build')
  }
}

// 7. Resumo e instruções finais
function summary() {
  section('📊 RESUMO DA VALIDAÇÃO')

  console.log(`${colors.green}✅ Passou: ${checks.passed.length}${colors.reset}`)
  console.log(`${colors.red}❌ Falhou: ${checks.failed.length}${colors.reset}`)
  console.log(`${colors.yellow}⚠️  Avisos: ${checks.warnings.length}${colors.reset}`)

  if (checks.failed.length === 0 && checks.warnings.length <= 2) {
    console.log(`\n${colors.green}🎉 PRONTO PARA DEPLOY!${colors.reset}`)
    console.log(`\nPróximos passos:`)
    console.log(`1. Confirme variáveis de ambiente em Vercel`)
    console.log(`2. Faça: git push origin main`)
    console.log(`3. Vercel vai fazer build automaticamente`)
    console.log(`4. Acompanhe em https://vercel.com/seu-projeto`)
  } else if (checks.failed.length > 0) {
    console.log(`\n${colors.red}⛔ ERRO: Corrija os problemas acima antes de fazer deploy${colors.reset}`)
    process.exit(1)
  } else {
    console.log(`\n${colors.yellow}⚠️  Atenção: Revise os avisos antes de fazer deploy${colors.reset}`)
  }
}

// Executar validações
async function main() {
  console.log(`${colors.blue}`)
  console.log('╔═══════════════════════════════════════════════════════════╗')
  console.log('║  🚀 VALIDAÇÃO PRÉ-DEPLOYMENT - WebCond                    ║')
  console.log('╚═══════════════════════════════════════════════════════════╝')
  console.log(`${colors.reset}`)

  validateFiles()
  validateEnv()
  validateGitignore()
  validatePackageJson()
  validateStructure()
  validateBuild()
  summary()
}

main().catch(err => {
  log(colors.red, '❌', `Erro durante validação: ${err.message}`)
  process.exit(1)
})
