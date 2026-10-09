# Ajustes de versão — WebCond

Lista do que fica para depois e histórico do que já foi feito em cada versão.

## Ajustes futuros

- [ ] Conexão com o banco para receber os valores das assinaturas.

## Histórico

### v2.10A5 — 09/10/2026 (ajuste)

- Morador acompanha o condomínio em tempo real (atualiza sozinho a cada minuto com a tela aberta):
  - Início: bloco **Condomínio agora** com os mesmos cartões do painel do síndico — **Unidades
    ativas**, **Valores pagos no mês**, **Valores em aberto** e **Uni. Inadimplente**;
  - tela nova **Resumo do condomínio** (menu e "Ver resumo"): cartões, arrecadação da competência
    (% recebido, R$ recebido de R$ lançado) e **Status das cobranças por mês** (gráfico de 6 meses
    com unidades pagas, em aberto e inadimplentes). Só para ver: sem exportar nem baixar, e o
    gráfico não é imagem (não aparece "salvar imagem" ao segurar o dedo).
- Privacidade: o morador recebe só totais, montados no servidor; nenhum nome, número de unidade ou
  cobrança de outra pessoa.
- O cálculo dos cartões passou para `src/lib/condominioResumo.js`, usado pelo painel do síndico e
  pelo servidor: os números são os mesmos nas duas telas. A barra "mês no condomínio" do morador
  agora segue a mesma regra (em aberto até o fim do mês do vencimento).

### v2.10A4 — 09/10/2026 (ajuste)

- Síndico › Lançar cobrança (Condomínio): além de condomínio, energia e água, o botão
  **"+ Adicionar outro valor"** abre mais linhas com nome e valor (ex.: Valor de melhoria, Taxa de
  bombeiro). Cada valor vira uma linha da fatura e entra no total; o "Relançar" recupera os valores.
- Painel do síndico: título **Administração** (no lugar de "Bom dia, nome"). Cartões renomeados, com
  o número de unidades embaixo do valor:
  - **Valores pagos no mês** — X unidades pagaram no mês;
  - **Valores em aberto** — X unidades com valor em aberto. Fica aqui até o fim do mês do vencimento
    (ex.: vence 10/10 → em aberto até 31/10);
  - **Uni. Inadimplente** — X unidades inadimplentes (a partir do dia 1 do mês seguinte, ex.: 01/11).
- Morador › Avisos: o aviso aberto sai dos **Avisos recentes** do Início e fica registrado em Avisos;
  abrir a tela Avisos marca todos como lidos. Cada aviso tem **Excluir** (some só para aquele morador;
  o síndico continua apagando para todos). Lido/excluído fica guardado no aparelho da pessoa.
- Morador › Início no celular: o gráfico do mês no condomínio vem **antes** dos avisos.
- Convite "Instale o app" maior e mais visível: **Baixar e adicionar à tela inicial** (botão grande,
  largura toda no celular); "Instalar o app" da tela de login virou botão.

### v2.10A3 — 05/10/2026

- Redesign "Protótipo v3 · nova UX/UI":
  - cores, fonte Outfit, cantos e sombras novos nos temas claro e escuro, em todas as telas;
  - marca nova (`public/brand/`);
  - menu lateral novo com botão principal ("Pagar cobrança" / "Nova cobrança");
  - celular: cabeçalho com a marca e **barra inferior** com botão central e "Mais";
  - login com painel da marca no computador e cartão "É síndico? Cadastrar";
  - Início do morador com o cartão **Próxima cobrança** ("Pagar agora" já abre o pagamento);
  - Painel do síndico com **Arrecadação**, **Precisa de você** e **Em atraso**.
- Telas internas no formato do protótipo:
  - Síndico › Unidades: **mapa por andar** colorido pela situação do pagamento, e lista;
  - Síndico › Cobranças: navegação por competência (‹ mês ›), resumo, filtros e "Confirmar"/"Lembrar";
  - Morador › Minhas cobranças: cartões "Em aberto / Pago no ano" e lista agrupada por mês;
  - Morador › Pagar: painel com Pix (QR Code e copia e cola), link do banco, boleto e
    "Já paguei · avisar o síndico";
  - Avisos (morador e síndico), Documentos, Ocorrências e Meu perfil em cartões;
  - Plataforma › Painel global e Condomínios no formato novo.
- Botão **"Adicionar o app à tela inicial"**: no Android/Chrome/Edge instala com um toque; no
  iPhone/iPad mostra o passo a passo (Compartilhar › Adicionar à Tela de Início). Some quando o
  app já está instalado.
- Banco: o SQL `sql/2026-10-03_feedback_e_recebimento.sql` já está aplicado no Supabase.
- Correção (06/10/2026): a **fatura nova** não chegava à produção. A regra `fatura/` do `.gitignore`
  (e `fatura` do `.vercelignore`) escondia também `api/_lib/fatura/`, o gerador da fatura; o boleto
  caía, sem aviso, no modelo antigo. Regras presas à raiz (`/fatura/`), gerador enviado, tempo do
  gerador maior (45 s na tela, 60 s no servidor) e aviso ao síndico se um boleto sair no modelo antigo.
  Limpeza: removidas as pastas `redesigner-webcond` (já aplicada) e `designer-fatura` (cópia da `fatura`).
- Notificação (06/10/2026): quando o síndico confirma um pagamento, o morador da unidade recebe
  "Pagamento confirmado — Seu pagamento foi confirmado pelo Síndico." (aviso no app e, conforme o
  plano, no celular, e-mail e WhatsApp).

### v2.10A2 — 05/10/2026

- Equipe de suporte entra por e-mail (CPF opcional).
- Políticas com data e versão automáticas (vêm do `package.json`).
- Correções de segurança (PDF do boleto, recibo da InfinitePay, erros do cadastro público).
- Sistema zerado: ficou só a conta de administrador da plataforma.
- Tela inicial: "Esqueci meu e-mail" → entrar com CPF e senha; "Esqueci a senha" → pedir a troca
  ao síndico pelo WhatsApp do condomínio.
