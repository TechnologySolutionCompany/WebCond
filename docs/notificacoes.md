# Notificações — como funcionam (v1.09A3)

Quando o síndico **publica um aviso** ou **lança uma cobrança**, o morador é avisado fora do app. Toda
cobrança já gera um aviso por unidade, então existe um único ponto de disparo para os dois casos.

```
Síndico publica/lança ──► aviso gravado no banco ──► painel pede o envio (/api/admin/notify)
                                                        │
                        servidor confere: é do condomínio dele? tem menos de 24 h? ainda não foi enviado?
                                                        │
                    ┌───────────────────────────────────┼───────────────────────────────┐
             Celular/computador                       E-mail                         WhatsApp
          (quem ativou no aparelho)          (quem tem e-mail e não desligou)   (quem autorizou; plano PRO+)
```

- **Quem recebe:** exatamente quem vê o aviso no app. Aviso para "todos" vai para todos os moradores;
  aviso de uma unidade vai para o proprietário e o inquilino daquela unidade.
- **Uma vez só:** cada aviso é marcado como enviado (`notificado_em`). Pedir de novo não duplica.
- **Uma mensagem por pessoa:** quem tem 3 unidades recebe "3 novas cobranças", não 3 notificações.
- **Se um canal falhar**, o aviso continua no app normalmente. O síndico vê um resumo depois de
  publicar ("Notificação enviada para 12 aparelhos e 8 e-mails").
- **Chamados de suporte** também avisam, no aparelho, o admin da plataforma e a equipe de suporte.

## Canais

| Canal | Custo | Situação nesta versão | O que falta para ligar |
|---|---|---|---|
| Celular e computador (Web Push) | Grátis | **Pronto** | Só as chaves VAPID na Vercel (já geradas no `.env` local) |
| E-mail (Resend) | Grátis até 3.000/mês (100/dia); depois ~US$ 20/mês por 50 mil | Código pronto, desligado | Conta no Resend + domínio verificado (DNS) |
| WhatsApp oficial (Meta Cloud API) | Por mensagem, cobrado pela Meta (utilidade no Brasil: cerca de R$ 0,04–0,05) | Código pronto, desligado | Conta Meta Business verificada + número dedicado + modelo aprovado |

Canais por plano (em `src/lib/condominiumPlan.js`, campo `notificationChannels`): ONE e teste gratuito
têm aparelho + e-mail; PRO, MAX e Parceria também têm WhatsApp, porque ele custa por mensagem. É uma
linha para mudar se a decisão for outra.

### Celular e computador

- O morador ativa em **Início** (convite discreto) ou em **Meu perfil → Notificações**. Cada aparelho
  onde ele entrou e aceitou recebe, mesmo com o WebCond fechado.
- **iPhone/iPad:** a Apple só entrega notificação para site instalado na tela inicial (iOS 16.4+):
  Safari → Compartilhar → "Adicionar à Tela de Início" → abrir pelo ícone → ativar. A tela explica isso.
- **Clicar em Sair** desliga o aparelho (computador compartilhado não mostra aviso de outra pessoa).
  O **logout automático de 5 minutos não desliga**: o morador continua recebendo com o app fechado.
- Se outra pessoa entrar no mesmo navegador, o aparelho passa a ser dela.
- O servidor só aceita os serviços de push oficiais (Google, Mozilla, Apple, Microsoft).

### E-mail — como ligar

1. Criar conta em resend.com e verificar o domínio (ex.: `tscbr.com.br`) com os registros DNS que o
   Resend mostrar (no Registro.br).
2. Na Vercel: `RESEND_API_KEY` e `NOTIFY_EMAIL_FROM` (ex.: `WebCond <avisos@tscbr.com.br>`).
3. Novo deploy. O Status da plataforma passa a mostrar "E-mail: ligado".

Só recebe quem tem e-mail real cadastrado (os e-mails internos `@login.webcond.local` nunca recebem).
O morador pode desligar em Meu perfil.

### WhatsApp — como ligar

1. Conta no **Meta Business** (business.facebook.com) com a empresa verificada.
2. Um **número dedicado** (não pode estar em uso no WhatsApp comum).
3. No WhatsApp Manager, criar o modelo:
   - Nome: `webcond_notificacao` · Categoria: **Utilidade** · Idioma: **Português (BR)**
   - Texto: `Olá, {{1}}! O condomínio {{2}} publicou: {{3}}. Abra o WebCond para ver os detalhes.`
4. Depois da aprovação, na Vercel: `WHATSAPP_TOKEN` (token permanente de usuário do sistema) e
   `WHATSAPP_PHONE_NUMBER_ID`.
5. Novo deploy.

O WhatsApp só vai para quem **ligou a opção** em Meu perfil (a Meta exige autorização do destinatário).

**Não recomendado:** APIs não oficiais (Z-API, Evolution e similares, baseadas no WhatsApp Web). São mais
baratas, mas o número pode ser banido a qualquer momento e violam os termos do WhatsApp.

## Onde está no código

- Regras puras (quem recebe, textos, validações): `src/lib/notifications.js`
- Envio (push, Resend, Meta): `api/_lib/notify.js`
- Rotas: `/api/admin/notify`, `/api/tenant/push-subscribe`, `/api/tenant/push-unsubscribe`
- Navegador: `src/lib/pushNotifications.js`, `public/sw.js` (eventos `push` e `notificationclick`)
- Banco: `sql/2026-09-26_avisos_equipe_notificacoes.sql` (`push_inscricoes`, `notificado_em`,
  `notificar_email`, `notificar_whatsapp`)
