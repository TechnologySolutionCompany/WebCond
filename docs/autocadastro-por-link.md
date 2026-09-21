# Auto-cadastro do morador por link

O síndico gera um link, envia aos moradores, cada pessoa preenche os próprios dados e escolhe a
senha, e o acesso só existe depois que o síndico aprova.

## Onde fica

Painel do síndico: **Unidades > Cadastro por link**. O botão mostra quantos cadastros estão
esperando aprovação. Plano vencido bloqueia gerar link e aprovar, como no resto do painel.

O morador abre `/cadastro/<token>` — uma página pública, sem login.

## Isolamento entre condomínios

Esta é a parte que sustenta o SaaS. **O token é a única ligação entre quem preenche o formulário e
o condomínio.** A tela pública não tem campo de condomínio, não mostra a lista de condomínios e não
aceita id de condomínio no corpo da requisição: o servidor resolve `token -> condomínio` e usa esse
valor em tudo o que grava. Não existe caminho para um cadastro cair no condomínio errado.

Complementos:

- um link ativo por condomínio (índice único parcial), com validade de 30 dias;
- gerar um link novo invalida o anterior na mesma operação;
- o token é opaco, com 32 caracteres aleatórios, e nunca aparece em URL de API que não seja a
  própria consulta do link;
- a rota pública responde a mesma mensagem genérica para token inexistente, desativado e de
  condomínio bloqueado, para não virar uma forma de descobrir tokens;
- limite de 20 envios por hora e 30 consultas por 10 minutos, por IP;
- o link do painel é montado pelo navegador com a própria origem, então o cabeçalho `Host` da
  requisição nunca decide para onde o link aponta.

## Quem preenche e o que aparece

Quem abre o link é sempre o **proprietário**. A primeira escolha é a **situação do imóvel**, e é ela
que decide o resto do formulário — o síndico não precisa saber de nada disso:

| Situação | O que o formulário pede |
|---|---|
| **Morando** | só os dados do proprietário, que mora na unidade |
| **Alugado** | proprietário **e** inquilino: o cadastro do inquilino é responsabilidade do dono |
| **Desocupado** | só nome completo, CPF e WhatsApp do proprietário |

No caso **Alugado** aparece a pergunta **"O inquilino vai ter acesso à plataforma?"**:

- **Sim** — o proprietário define a senha do inquilino ali mesmo. O inquilino entra com o CPF dele e
  essa senha. Para trocá-la depois, ele pede a alteração no próprio perfil; o síndico recebe a
  solicitação, altera e envia a senha nova.
- **Não** — o inquilino fica registrado (nome, CPF e WhatsApp na observação da unidade, para o
  síndico saber quem mora lá), mas **nenhuma conta é criada** para ele.

## A senha

As senhas são escolhidas no formulário e **nunca passam por nenhuma tabela nossa**. No envio, cada
conta já é criada no Supabase Auth — que guarda só o hash — porém **bloqueada**, com o perfil
`ativo = false`. Aprovar desbloqueia; recusar apaga as contas inteiras.

É por isso que não existe senha padrão nem tela de troca no primeiro acesso: a senha é da pessoa
desde o começo e o síndico nunca a conhece.

## O que é validado no servidor

Nome, CPF (11 dígitos com os dois verificadores), WhatsApp (celular brasileiro com DDD real,
aceitando máscara e `+55`), e-mail (opcional, formato válido), senha com no mínimo 6 caracteres,
situação do imóvel, unidade e o aceite dos termos. As mesmas regras valem para o proprietário e para
o inquilino; a senha do inquilino só é exigida quando ele vai ter acesso. CPF do inquilino igual ao
do proprietário é recusado.

As regras de CPF, WhatsApp e e-mail ficam em `api/_lib/personValidation.js`, compartilhadas com a
importação por planilha: as duas entradas validam exatamente igual.

Recusas específicas:

- `JA_ENVIADO` — já existe cadastro pendente com esse CPF neste condomínio (índice único parcial no
  banco, além da checagem na API);
- `CPF_EM_USO` — o CPF já tem conta no WebCond. A mensagem não revela em qual condomínio o CPF está.

## Aprovação

A fila mostra nome, CPF e WhatsApp mascarados, a situação do imóvel, a data, o inquilino (quando
houver) e o número da unidade — **editável**, porque o morador pode digitar errado e quem confere é
o síndico.

Ao aprovar:

1. a unidade é encontrada pelo número; se não existir, é criada, respeitando o limite de unidades
   do plano (`LIMITE_DE_UNIDADES`);
2. se um dos papéis já estiver ocupado na unidade, a resposta é `VINCULO_OCUPADO` e a tela pergunta
   se substitui; o morador anterior sai da unidade e perde o acesso se não tiver outra;
3. as contas são desbloqueadas, os perfis viram ativos e os vínculos são gravados — proprietário
   sempre, inquilino quando ele tiver acesso;
4. a unidade passa a refletir a situação declarada (morando → ocupada, alugado → alugada,
   desocupado → desocupada);
5. inquilino sem acesso entra na observação da unidade, sem sobrescrever o que já estiver escrito;
6. a solicitação é marcada como aprovada, com quem aprovou e quando.

Cada passo que falha desfaz o anterior: se o vínculo não grava, a conta volta a ficar bloqueada e
inativa. Ninguém fica com acesso pela metade.

Ao recusar, as contas criadas no envio são apagadas (Auth, perfil e qualquer vínculo), a solicitação
fica com status `rejeitado` e o motivo opcional escrito pelo síndico, e os ids de perfil são zerados.

## Aceite dos termos (LGPD)

- **Quem se cadastra pelo link** aceita no próprio formulário. A versão da política, a data e o IP
  ficam gravados na solicitação; a versão e a data também vão para o perfil.
- **Quem já tinha conta** vê um popup no primeiro acesso depois da mudança
  (`src/components/shared/ConsentGate.jsx`) e o aceite fica em `profiles.aceite_versao` e
  `profiles.aceite_em`. Se a coluna ainda não existir no banco, ou o plano estiver vencido (painel
  somente leitura), o aceite é lembrado no navegador para não travar quem já usa o sistema.
- **Na parte pública** há uma barra discreta de cookies. O WebCond usa só cookies essenciais, então
  ela é um aviso, e não uma escolha falsa entre aceitar e recusar.

A versão vem de `POLICY_VERSION`, em `src/lib/politicas.js`. Subir essa versão faz o popup aparecer
de novo para todo mundo — é o caminho para pedir um novo aceite quando a política mudar.

## Banco

`sql/2026-09-24_autocadastro_por_link.sql` cria `condominio_convites` e acrescenta a
`solicitacoes_cadastro` os campos do auto-cadastro e do aceite; em `profiles`, `aceite_versao` e
`aceite_em`.

O mesmo arquivo **fecha uma brecha antiga**: a política `solicitacoes_public_insert` tinha
`with check (true)`, ou seja, qualquer pessoa com a chave pública do site inseria solicitação em
qualquer condomínio. Agora o envio passa obrigatoriamente pela API, que valida o token.

`condominio_convites` não tem política de select para usuários autenticados: o token só sai pela
API do síndico, nunca pelo PostgREST.

O arquivo também apaga confirmações de pagamento órfãs: excluir uma cobrança deixava a confirmação
do morador presa no painel do síndico, apontando para algo que não existe mais. A tela já não cria
mais esse órfão, e a caixa de notificações descarta o que sobrou
(`filterSyndicNotifications`, em `src/lib/residentRequests.js`), mas a limpeza tira do banco.

## Rotas

| Rota | Quem chama |
|---|---|
| `GET /api/auth/cadastro-info?token=` | público: nome do condomínio do token |
| `POST /api/auth/cadastro-enviar` | público: envia o cadastro |
| `GET /api/admin/signup-link` | síndico: link ativo do próprio condomínio |
| `POST /api/admin/signup-link` | síndico: `gerar` ou `desativar` |
| `POST /api/admin/signup-review` | síndico: `aprovar` ou `recusar` |

Nenhuma rota de síndico recebe id de condomínio: ele vem sempre do perfil autenticado.

## Testes

```
npm test
```

`tests/auto-cadastro.test.js` cobre as regras de CPF, WhatsApp e e-mail, a aleatoriedade e o formato
do token, o vencimento do convite e a garantia de que a descrição do convite não carrega o
condomínio nem quem o criou.

`tests/notificacoes-sindico.test.js` cobre a caixa de notificações do síndico: confirmação de
cobrança excluída não aparece, o que ele mesmo criou não volta para ele, resolvido sai da caixa e
ocorrência comum do morador continua chegando.
