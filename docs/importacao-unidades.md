# Importação de unidades por planilha

Cadastro de várias unidades de uma vez, com proprietário e morador, a partir de uma planilha Excel.

## Onde fica

**Em espera por decisão de produto:** a tela (`src/components/admin/ImportarUnidades.jsx`) e a API estão
prontas e testadas, mas o botão **Importar planilha** saiu do menu de Unidades. Para reativar, basta
voltar o botão e o estado `importing` em `Unidades.jsx`. O cadastro de moradores por link
([autocadastro-por-link.md](autocadastro-por-link.md)) ocupou o lugar dele na tela.

Quando ativa: painel do síndico, **Unidades**. Só quem já pode cadastrar unidades no condomínio abre a
tela (síndico). O contador não tem acesso, e um condomínio com plano vencido fica bloqueado, como no
cadastro individual.

## A planilha

O modelo oficial fica em `public/templates/webcond-importacao-unidades-v1.xlsx` e é baixado pelo botão
**Baixar modelo**. Para regerar o arquivo depois de mudar as colunas:

```
npm run gerar-modelo-unidades
```

O gerador (`scripts/generate-unit-import-template.mjs`) usa a mesma biblioteca de planilhas do projeto.

A aba **Unidades** tem uma linha por unidade e estes 13 cabeçalhos, que não podem ser alterados:

| # | Cabeçalho | Observação |
|---|---|---|
| 1 | Apartamento | Obrigatório, único no condomínio, texto (preserva `001`) |
| 2 | Situação | `Ocupado`, `Alugado` ou `Desocupado` |
| 3–7 | Proprietário — nome, CPF, WhatsApp, email, senha inicial | CPF e email opcionais |
| 8 | Proprietário é o morador? | `Sim`, `Não` ou vazio |
| 9–13 | Morador / inquilino — nome, CPF, WhatsApp, email, senha inicial | CPF e email opcionais |

A aba **Instruções** explica os quatro cenários, os campos opcionais, a política de senha e o cuidado
com o arquivo, que contém senhas legíveis até a importação.

As colunas são reconhecidas **pelo nome do cabeçalho**, não pela posição: uma planilha com as colunas
em outra ordem é aceita.

## Regras por situação

| Situação | Proprietário é o morador? | Proprietário | Morador / inquilino |
|---|---|---|---|
| Ocupado, dono morando | `Sim` | nome, WhatsApp e senha | vazio |
| Ocupado, outro morador | `Não` | nome, WhatsApp e senha | nome, WhatsApp e senha |
| Alugado | `Não` | nome, WhatsApp e senha | nome, WhatsApp e senha |
| Desocupado | vazio | nome e senha | vazio |

Outras regras: linha totalmente vazia é ignorada e contada à parte; linha com dados e sem apartamento é
erro; CPF, quando informado, precisa dos 11 dígitos e dos dois verificadores; WhatsApp precisa ser um
celular brasileiro com DDD (máscara e `+55` aceitos); e-mail, quando preenchido, precisa ter formato
válido; senha segue a política atual do sistema, no mínimo 6 caracteres, com os espaços preservados;
fórmulas na planilha são recusadas.

## Como funciona

**1. Analisar.** A planilha é lida e validada inteira no servidor. Nada é gravado. A tela mostra a
prévia, o resumo (linhas lidas, unidades válidas, unidades com erro, linhas vazias, unidades não
enviadas e vagas disponíveis) e a tabela de problemas. O lote é registrado com o total e com o
SHA-256 do arquivo.

**2. Confirmar.** O mesmo arquivo é enviado de novo, revalidado do zero (permissão, condomínio e dados)
e as unidades válidas são gravadas uma a uma. É por isso que as senhas nunca precisam ser guardadas
entre as duas etapas.

Cada unidade é atômica: se a pessoa, a conta ou o vínculo falhar, a unidade criada é desfeita e quem
ficou sem unidade perde o acesso. Uma falha não interrompe o lote; as demais unidades continuam.

## Erros

Cada problema traz linha, unidade, campo, código estável, descrição e orientação. Uma unidade pode ter
vários erros: a tela mostra separadamente quantas unidades têm problema e quantos erros existem ao todo.
O botão **Baixar relatório** gera um CSV com essas colunas, **sem senhas**.

Códigos: `ARQUIVO_INVALIDO`, `CABECALHO_AUSENTE`, `COLUNA_DESCONHECIDA`, `FORMULA_NAO_PERMITIDA`,
`UNIDADE_OBRIGATORIA`, `UNIDADE_INVALIDA`, `UNIDADE_DUPLICADA_NO_ARQUIVO`, `UNIDADE_JA_CADASTRADA`,
`SITUACAO_INVALIDA`, `NOME_OBRIGATORIO`, `NOME_INVALIDO`, `CPF_INVALIDO`, `TELEFONE_INVALIDO`,
`EMAIL_INVALIDO`, `SENHA_INVALIDA`, `VINCULO_INCOMPATIVEL`, `CONFLITO_DE_USUARIO`,
`LIMITE_DE_UNIDADES`, `FALHA_NO_CADASTRO`.

## Reenvio

O lote guarda o resultado de cada unidade. Confirmar o mesmo lote de novo devolve o resultado guardado
e avisa que já havia sido importado: nada é gravado duas vezes. Se a conexão cair no meio, o reenvio
grava só o que faltou. Enviar um arquivo diferente do analisado é recusado; nesse caso, analise de novo.

Contas que já existem **nunca** têm a senha trocada pela importação: a pessoa é apenas vinculada à
unidade, mantendo o acesso atual.

## Decisões

**Autenticação.** As contas são criadas pelo mesmo serviço do cadastro individual, com a política de
senha atual (mínimo de 6 caracteres). A senha nunca é gravada em texto no banco. A troca obrigatória
no primeiro acesso não existe hoje no WebCond e ficou para uma etapa própria.

**Pessoas sem CPF.** O login do morador é por CPF. Quem é importado sem CPF fica cadastrado na unidade
e aparece para o síndico, mas ainda não consegue entrar; o resultado da importação avisa quantas
pessoas estão nessa situação. Para liberar o acesso, informe o CPF na unidade. Internamente cada conta
recebe um identificador único, então duas pessoas sem CPF no mesmo condomínio não colidem.

**Pessoas repetidas.** CPF e e-mail são os únicos identificadores; nome e telefone nunca unem pessoas.
O mesmo CPF em unidades diferentes é tratado como a mesma pessoa, dona de várias unidades. Se os
identificadores apontarem para contas diferentes, ou para uma conta de outro condomínio, a linha é
recusada com `CONFLITO_DE_USUARIO`.

**Unidades existentes.** A importação nunca sobrescreve uma unidade já cadastrada: a linha é recusada
com `UNIDADE_JA_CADASTRADA`.

**Blocos e torres.** O WebCond identifica a unidade por condomínio + número, em formato livre
(`001`, `101`, `01B`, `A`). Não existe campo separado de bloco, então quem usa bloco deve escrevê-lo
no próprio identificador, como `B2-101`.

**Ocupado com outro morador.** A pessoa entra no vínculo de morador da unidade (o mesmo usado pelo
inquilino) e a unidade continua `ocupada`. A tela de unidades mostra esse morador e só remove o vínculo
quando a unidade passa a desocupada ou interditada.

**Unidades não enviadas.** Quando o condomínio tem a lista real de unidades, a análise diz exatamente
quais faltaram. Quando só existe a quantidade contratada, informa quantas faltam, sem inventar números.

## Limites

Arquivo de até 2 MB, 5.000 linhas e 64 colunas. O pacote `.xlsx` é inspecionado antes de ser aberto
(tamanho real x declarado, quantidade de entradas, XML com DOCTYPE, entidades ou links externos).
Fórmulas são recusadas em vez de executadas.

## Banco

`sql/2026-09-23_importacao_de_unidades.sql` cria:

- `unidade_importacoes`: o lote (condomínio, quem importou, nome do arquivo, hash, status, totais);
- `unidade_importacao_itens`: o resultado por unidade, com chave única `(lote, unidade)`.

Nenhuma das duas guarda senha. As políticas seguem o isolamento do resto do sistema: leitura só do
próprio condomínio, escrita só pelo backend, e bloqueio quando o plano está vencido.

## Testes

```
npm test
```

Cobrem o contrato da planilha e o modelo gerado, a leitura do arquivo (limites, fórmulas, cabeçalhos,
zip malformado), a validação (os quatro cenários, campos opcionais, CPF, telefone, e-mail, duplicidade,
unidade já cadastrada, unidade omitida, linha vazia e parcial, dois erros na mesma unidade, nomes com
acento, contas existentes) e a gravação (atomicidade, importação parcial, reenvio sem duplicar, limite
de unidades e ausência de senha em qualquer saída).

Ponta a ponta, contra o Supabase do `.env` (cria um condomínio de teste e apaga tudo no fim):

```
npm run e2e-importacao
```

Valida análise, confirmação, o que ficou no banco, o reenvio sem duplicar, a troca de arquivo e a
segunda importação. Uma unidade repetida na planilha recusa **as duas** linhas.
