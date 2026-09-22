# Checklist de validação — v1.09A2

Nada desta versão está no ar. O site publicado continua na v1.21 até você aprovar.

## Antes de começar

- [ ] Rodar `sql/2026-09-25_perfil_suporte_presenca.sql` no Supabase (SQL Editor). Sem ele, suporte e
      presença não funcionam; o resto funciona.
- [ ] `npm run dev` e abrir `http://localhost:5173`.
- [ ] **Use uma janela anônima (ou outro navegador) para o síndico** e a janela normal para o admin da
      plataforma. No mesmo navegador as duas contas dividem a sessão — veja "Loop de login" no fim.

## 1. Excluir condomínio (admin da plataforma)

Crie um condomínio de teste para isto — a exclusão é de verdade.

- [ ] Condomínios → abrir o condomínio → aba **Excluir**.
- [ ] O texto avisa tudo o que será apagado e que **não é reversível**.
- [ ] O botão só libera depois de digitar a senha.
- [ ] Senha errada: aparece "Senha incorreta." e nada é apagado.
- [ ] Senha certa: confirma, aparece "Condomínio … excluído com sucesso. A exclusão não é reversível."
      com o que foi removido, e ele some da lista.
- [ ] O login do síndico daquele condomínio deixa de funcionar.

## 2. Status da plataforma

- [ ] O subtítulo diz "Atualiza sozinho a cada 15s".
- [ ] O card **Histórico de atualizações** ganha uma linha a cada 15 s (hora, status, tempo, e o que
      falhou quando houver).
- [ ] Sair do painel (ou fechar o navegador) e voltar: o histórico continua lá (guarda 24 h).
- [ ] **Limpar** apaga o histórico.
- [ ] Observação: o histórico fica neste navegador. Em outro computador ele começa vazio.

## 3. Sair sozinho após 5 minutos fora

- [ ] Logado, feche **todas** as abas do WebCond. Volte em menos de 5 min: continua logado.
- [ ] Feche de novo e volte depois de mais de 5 min: cai na tela de entrada com o aviso "Sua sessão foi
      encerrada porque o WebCond ficou fechado por mais de 5 minutos".
- [ ] Com uma aba aberta, outra aba nova não desloga (uma aba aberta mantém todas vivas).

## 4. Meu perfil (síndico) — menu **Conta → Meu perfil**

- [ ] **Meus dados:** alterar nome e WhatsApp e salvar. CPF aparece mascarado, com o olho para mostrar.
- [ ] **E-mail:** trocar por um e-mail novo funciona; usar o e-mail de outra pessoa dá "Este e-mail já
      está em uso".
- [ ] **Senha:** com a senha atual errada é recusado. Com a certa, troca e você **continua logado**;
      outro aparelho que estivesse logado com a mesma conta é desconectado. O próximo login usa a nova.
- [ ] **Meu plano:** mostra o plano (ou teste), status, aprovado em, início, tempo de uso, válido até,
      dias restantes, documentos por mês e o botão de atualizar plano.
- [ ] **Planos e valores:** ONE, PRO e MAX com preço e resumo; o seu plano destacado; Parceria não aparece.
- [ ] **Sobre o sistema:** Versão do App **v1.09A2**, tipo, mês e ajuste.
- [ ] O contador também tem **Meu perfil**, só com dados, senha e versão (sem plano e sem suporte).
- [ ] Com o plano vencido, **Meu perfil** continua abrindo (senha, dados e suporte), enquanto o resto do
      menu fica com cadeado.

## 5. Suporte

No perfil do síndico:

- [ ] Escrever uma mensagem, anexar um print e um PDF, enviar. O chamado aparece em "Meus chamados"
      como **Aberto**.
- [ ] Arquivo que não é imagem nem PDF, ou acima de 5 MB, é recusado com aviso.

No admin da plataforma:

- [ ] Menu **Suporte** com um número laranja de chamados em aberto.
- [ ] O chamado mostra condomínio, síndico, data, mensagem e os anexos (abrem ao clicar).
- [ ] Escrever uma resposta, mudar para **Resolvido** e salvar. O número do menu diminui.
- [ ] De volta ao perfil do síndico: a resposta aparece no chamado.

## 6. Presença do síndico (admin da plataforma → Condomínios)

- [ ] Legenda no topo: Online, Ausente, Offline — passar o mouse explica cada uma.
- [ ] Com o síndico logado na outra janela: bolinha **verde Online** ao lado do nome do condomínio.
      Passar o mouse: "Online - Logado agora. Último sinal há …".
- [ ] Síndico clica em **Sair**: vira **laranja Ausente** na próxima atualização (até 1 min).
- [ ] Síndico fecha a janela sem sair: vira **Ausente** em até 4 min (3 sem sinal + 1 da atualização da lista).
- [ ] Condomínio que nunca entrou, ou está há 15 dias ou mais sem acessar: **vermelho Offline**.
- [ ] Só conta o síndico; morador e contador não mudam a bolinha.

## 7. Versão do app

- [ ] Rodapé da tela inicial: "… · v1.09A2".
- [ ] Menu lateral de **todos** os painéis (síndico, morador, plataforma): "Versão do App: v1.09A2".
- [ ] Perfil do síndico e Status da plataforma também mostram a versão.

Padrão: `v<tipo>.<mês>A<ajuste>` — tipo 1 estrutural, 2 layout, 3 correção. A fonte é o `version` do
`package.json` (`1.9.2` = v1.09A2); mudar lá muda em todas as telas.

## 8. Correções desta versão

- [ ] **Painel da plataforma com o amarelo de volta** (item ativo do menu, botões e campos). A limpeza da
      v1.21 tinha apagado essas regras por engano — isso está no ar hoje e volta ao normal com esta versão.
- [ ] **Condomínio cadastrado com CPF** (em vez de CNPJ) agora entra pelo próprio documento. Antes dava
      "CPF ou senha incorretos".

## Loop de login do condomínio recém-cadastrado

Não consegui reproduzir. Testei no servidor as quatro combinações — condomínio com CNPJ e com CPF,
antes e depois da aprovação — e em todas o login entra e o perfil carrega. O que achei e corrigi foi o
item do CPF acima.

A suspeita principal é **duas contas no mesmo navegador**: o Supabase guarda uma sessão por navegador e
sincroniza entre as abas. Com o painel da plataforma aberto numa aba, entrar como síndico em outra troca
a conta das duas, e uma fica empurrando a outra de volta para a tela de entrada. Por isso a instrução
de testar o síndico em janela anônima.

Se acontecer de novo **em janela anônima**, me diga: o navegador, se o condomínio já estava aprovado e o
que aparece na tela depois de clicar em Entrar.

## Verificação automática já feita

- Lint sem avisos, build ok, **114 testes** passando.
- Teste de segurança local contra o Supabase: **196/196**, com as seções novas de perfil (senha atual
  obrigatória, e-mail de outro síndico recusado, sessões antigas derrubadas na troca de senha) e de
  exclusão (síndico não exclui, senha errada não exclui, senha certa apaga tudo do condomínio e não toca
  nos outros).
- A seção de suporte e presença roda depois do SQL 09-25. Eu executo assim que você rodar.

## Quando aprovar

Eu subo com o mesmo processo da v1.21: publicação de teste sem domínio, teste das rotas, promoção para o
ar, teste de segurança completo contra o site publicado e só então o GitHub.
