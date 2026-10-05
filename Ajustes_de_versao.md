# Ajustes de versão — WebCond

Lista do que fica para depois e histórico do que já foi feito em cada versão.

## Ajustes futuros

- [ ] Conexão com o banco para receber os valores das assinaturas.

## Histórico

### v2.10A3 — 05/10/2026

- Redesign "Protótipo v3 · nova UX/UI" (pasta `redesigner-webcond`, fica só no computador):
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

### v2.10A2 — 05/10/2026

- Equipe de suporte entra por e-mail (CPF opcional).
- Políticas com data e versão automáticas (vêm do `package.json`).
- Correções de segurança (PDF do boleto, recibo da InfinitePay, erros do cadastro público).
- Sistema zerado: ficou só a conta de administrador da plataforma.
- Tela inicial: "Esqueci meu e-mail" → entrar com CPF e senha; "Esqueci a senha" → pedir a troca
  ao síndico pelo WhatsApp do condomínio.
