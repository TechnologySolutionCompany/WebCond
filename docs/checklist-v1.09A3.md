# Checklist de validação — v1.09A3

Nada desta versão está no ar. O site publicado continua na v1.09A2 até você aprovar.

## Antes de começar

- [ ] Rodar no Supabase (SQL Editor), nesta ordem:
      1. `sql/2026-09-26_avisos_equipe_notificacoes.sql` — notificações e equipe de suporte. Ele também
         apaga de vez os avisos que já tinham sido "excluídos" antes (estavam escondidos como inativos).
      2. `sql/2026-09-27_suporte_chat_logo_condominio.sql` — conversa do suporte e logo do condomínio.
         Os chamados antigos viram a primeira mensagem da conversa, sem perder nada.
      3. `sql/2026-09-28_limpeza_seguranca_e_plano_pro.sql` — **o mais importante desta versão.**
         Fecha a falha que deixava qualquer visitante ler e alterar os dados de todos os
         condomínios (chave Pix inclusive), limpa o que não tem mais uso e cria o espaço da
         assinatura. Detalhe completo em `docs/seguranca-v1.09A3.md`.
- [ ] `npm run dev` e abrir `http://localhost:5173`.
- [ ] Use **dois navegadores diferentes** (ex.: Chrome para o morador/síndico e Edge para a plataforma).
      Notificação no aparelho **não funciona em janela anônima** do Chrome, e no mesmo navegador as
      contas dividem a sessão.

---

# Parte 1 — Avisos e notificações

## 1. Avisos: excluir de verdade

- [ ] Síndico → Avisos → lixeira de um aviso. A confirmação diz que ele some para todos e não volta.
- [ ] O aviso some da lista na hora, sem a etiqueta "Inativo".
- [ ] O morador não vê mais o aviso (nem depois de recarregar).

## 2. Notificação no celular/computador

No navegador do **morador**:

- [ ] Em **Início** aparece o convite "Receba avisos e cobranças no aparelho" → **Ativar** → permitir.
- [ ] Em **Meu perfil → Notificações**, "Neste aparelho" está ligado. Desligar e ligar funciona.

No navegador do **síndico**:

- [ ] Publicar um aviso para todos → chega a notificação no computador do morador, **mesmo com a aba
      fechada**, e o síndico vê "Notificação enviada para 1 aparelho".
- [ ] Clicar na notificação abre o WebCond direto em **Avisos**.
- [ ] Lançar uma cobrança → chega "Nova cobrança disponível" → clicar abre **Minhas cobranças**.
- [ ] Aviso para outra unidade → esse morador **não** recebe.
- [ ] Morador com várias unidades recebe **uma** notificação ("2 novas cobranças"), não várias.
- [ ] Morador clica em **Sair** → para de receber nesse computador. O logout automático de 5 min
      **não** desliga (é de propósito).

Celular: em `localhost` só dá para testar no computador. **iPhone** só recebe com o WebCond instalado
na tela de início (Safari → Compartilhar → "Adicionar à Tela de Início").

## 3. E-mail e WhatsApp

- [ ] Em Meu perfil do morador aparece **E-mail** (ligado quando há e-mail cadastrado).
- [ ] **WhatsApp** só aparece nos planos PRO, MAX e Parceria.
- [ ] Os dois canais estão prontos no código, mas **desligados** até criar as contas
      (passo a passo em `docs/notificacoes.md`). O **Status da plataforma** mostra o card
      "Notificações — Celular/computador: ligado · E-mail: desligado · WhatsApp: desligado".

---

# Parte 2 — Suporte, perfil do condomínio e planos

## 4. Quadro de chamados (plataforma)

Como admin da plataforma, em **Suporte**:

- [ ] Três colunas: **Chamados abertos**, **Em andamento** e **Concluídos**, cada uma com a contagem.
- [ ] **Arrastar** um cartão de uma coluna para outra muda a situação do chamado (e continua assim
      depois de atualizar a página).
- [ ] Clicar no título de uma coluna abre só aquela coluna, em tela cheia; "Ver o quadro" volta.
- [ ] O cartão mostra o condomínio, o assunto, quando foi a última mensagem e a etiqueta
      **Aguardando resposta** quando a última palavra foi do síndico.

## 5. Conversa suporte ↔ síndico

- [ ] Clicar no cartão abre a conversa, com o contexto no topo (condomínio, plano, situação e contato
      do síndico) e os anexos do chamado.
- [ ] Responder: a mensagem aparece do lado direito e o chamado sai de "Chamados abertos" para
      "Em andamento" sozinho.
- [ ] No navegador do síndico (**Conta → Suporte**): a resposta aparece na conversa (sozinha em até
      30 s, ou clicando em Atualizar).
- [ ] O síndico responde de volta, com anexo se quiser, e a mensagem chega na conversa da plataforma.
- [ ] Mover o chamado para **Concluídos** e pedir para o síndico escrever de novo: ele volta para
      **Chamados abertos** (e a tela do síndico avisa isso).
- [ ] Botões de situação dentro da conversa funcionam igual ao arrastar.

## 6. Suporte do síndico (menu próprio)

- [ ] No menu do síndico, em **Conta**, agora existem **Meu perfil** e **Suporte**.
- [ ] Em Suporte: **Novo chamado** (assunto, mensagem, anexos) e o histórico separado por
      **Em aberto · Em andamento · Concluídos · Todos**.
- [ ] Abrir um chamado avisa a equipe no aparelho (se as notificações estiverem ativas lá).

## 7. Perfil do condomínio (plataforma)

- [ ] **Condomínios** → clicar em um: abre o **perfil** (logo, nome, documento, situação, plano,
      síndico com a bolinha de presença, contatos, unidades, moradores, documentos e datas).
- [ ] O botão de **engrenagem** no topo abre as configurações (as abas de antes: dados, status/plano,
      acesso do síndico, exportar/importar e excluir). O botão do lado volta para o perfil.
- [ ] **Adicionar logo** (PNG, JPG ou WEBP até 2 MB): aparece no perfil e na lista.
- [ ] **Remover** apaga a imagem.
- [ ] Um arquivo que não é imagem, ou acima de 2 MB, é recusado com aviso.
- [ ] A logo só pode ser cadastrada por você: o síndico não tem essa opção em lugar nenhum.
- [ ] Boleto: a logo do condomínio entra no lugar da logo do WebCond **nos planos MAX e Parceria**.
      Para conferir, coloque um condomínio de teste em MAX, cadastre a logo e gere uma cobrança.

## 8. Meu plano e a tela de planos

- [ ] Síndico → **Meu perfil → Meu plano**: resumo do plano, datas e o botão **Melhorar meu plano**.
- [ ] O botão abre a tela **Planos e valores**: plano atual em destaque e os três planos com a
      descrição completa.
- [ ] Preços novos: **ONE R$ 49,90 · PRO R$ 65,90 · MAX R$ 89,90**.
- [ ] "Quero o plano ..." abre o WhatsApp da TSCBr com a mensagem pronta, citando o plano e o condomínio.
- [ ] "Abrir chamado" leva para o Suporte; "WhatsApp da TSCBr" abre com a mensagem de dúvidas sobre planos.
- [ ] **Voltar ao meu perfil** funciona.

## 9. Cadastro do condomínio sem pressão

- [ ] Na tela inicial, o formulário de cadastro **não tem mais a escolha de plano**.
- [ ] No lugar, um texto curto: 30 dias grátis com os recursos do ONE e a escolha depois, dentro do
      sistema, com o link do WhatsApp para dúvidas sobre planos.

## 10. Equipe de suporte (acesso limitado)

- [ ] **Equipe de suporte** → criar conta com nome, CPF e senha (mínimo 8).
- [ ] Entrando com essa conta em outro navegador: abre em **Chamados**, com apenas **Chamados** e
      **Status da plataforma** no menu.
- [ ] A pessoa usa o quadro e a conversa normalmente, mas não vê condomínios, moradores, cobranças,
      documentos nem a própria Equipe, e não cadastra logo.
- [ ] **Senha**, **Bloquear/Liberar** e **Remover** funcionam; bloqueada, a pessoa perde o acesso na hora.

---

# Parte 3 — Limpeza, segurança, marca nova e espaço do Plano Pro

## 11. Falha corrigida (confira você mesmo)

Com o site aberto, em qualquer navegador, sem login, abra o endereço abaixo trocando
`SEU-PROJETO` pelo endereço do Supabase e `CHAVE` pela chave anon (ela está no `.env`):

    https://SEU-PROJETO.supabase.co/rest/v1/condominios?select=*&apikey=CHAVE

- [ ] **Antes do SQL 09-28**: devolve a lista dos condomínios com CNPJ e chave Pix.
- [ ] **Depois do SQL 09-28**: devolve erro de tabela inexistente. É isso que tem de acontecer.
- [ ] O site continua funcionando normalmente (a tela usa a tabela certa, não essa).

## 12. Limpeza

- [ ] O SQL 09-28 mostra no fim uma tabelinha de conferência: view `condominios` = 0,
      `webcond` = 0, `default_condominium_id` = 0, `assinatura_eventos` = 1 e os dois
      buckets com limite = 1.
- [ ] Enviar um documento grande (acima de 20 MB) agora é recusado; um PDF normal entra igual.
- [ ] Avisos, cobranças, documentos e chamados de suporte continuam todos lá.

## 13. Marca nova

- [ ] Aba do navegador com o ícone novo (fundo navy, telhado azul, visto verde).
- [ ] Tela inicial, rodapé e páginas de política com o símbolo novo.
- [ ] Painel da plataforma: o símbolo aparece no topo do menu, no lugar do ícone de prédio.
      No painel do síndico e do morador continua o prédio — ali quem aparece é o condomínio.
- [ ] Boleto gerado: logo nova no alto, sem esticar.
- [ ] Celular: apagar o atalho antigo e instalar de novo mostra o ícone novo.
      (Quem já tem o app instalado pode precisar fechar e abrir uma vez.)
- [ ] E-mail de aviso (se já tiver ligado o Resend): logo no topo e botão azul.

## 14. Espaço do Plano Pro (nada muda na tela ainda)

- [ ] Planos e valores continua igual: ONE R$ 49,90 · PRO R$ 65,90 · MAX R$ 89,90, com
      "Quero o plano X" abrindo o WhatsApp.
- [ ] Quando você escolher o meio de pagamento, é só preencher `VITE_ASSINATURA_PROVEDOR` e
      `VITE_ASSINATURA_CHECKOUT_URL` na Vercel: o mesmo botão passa a abrir o checkout.
      O passo a passo está em `docs/plano-pro-v1.10.md`.

---

## 15. Verificações que eu já rodei

- [x] Lint sem avisos, **141 testes** unitários passando e build ok.
- [x] Auditoria de segurança completa contra o banco real e contra todo o código versionado:
      `docs/seguranca-v1.09A3.md`. Uma falha crítica encontrada e corrigida no SQL 09-28.
- [x] Nenhuma chave ou senha em arquivo versionado, no histórico do Git ou no site publicado.
- [x] Prints em 390 px e 1280 px: perfil do síndico, Suporte, Planos, quadro de chamados e perfil do
      condomínio. Nada estoura a largura e não houve erro de API nem de tela.
- [x] A chave privada das notificações continua só no `.env` local, fora do GitHub.

## Para decidir

1. **WhatsApp só nos planos PRO, MAX e Parceria?** A notificação no aparelho e o e-mail valem para
   todos; o WhatsApp custa por mensagem. É uma linha para mudar.
2. **Anexo na resposta do suporte:** hoje só o síndico anexa arquivo (a pasta é do condomínio dele).
   A equipe responde em texto. Quer que a equipe também possa anexar?
3. **Contas externas** (quando quiser ligar): Resend para e-mail e Meta Business para WhatsApp.

## Na hora de subir (depois do seu OK)

- Aplicar os **três** SQL em produção (mesmo banco, já feito na validação).
- Adicionar na Vercel: `VITE_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` e `APP_URL`.
- Publicar em teste, conferir, promover, rodar o teste de segurança contra o site publicado e enviar
  `main` + tag `v1.09A3` para o GitHub.
