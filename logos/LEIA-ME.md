# Marca WebCond

Esta pasta é a **fonte** da marca. Nada aqui vai para o ar: o que o site usa fica em `public/`.

## Cores

| Cor | Código | Onde entra |
| --- | --- | --- |
| Azul | `#2160C4` | telhado do símbolo, palavra "Web", botão do e-mail |
| Verde | `#3DAE4A` | visto do símbolo, palavra "Cond" |
| Navy | `#0E1624` | fundo do ícone do app e do favicon |
| Cinza claro | `#AFC0D3` | slogan sobre fundo escuro |
| Cinza médio | `#5B6878` | slogan sobre fundo claro |

Tipografia: Outfit Bold no logotipo, Outfit Regular no slogan. Nos SVGs o texto já está
convertido em curvas, então não depende da fonte instalada.

## O que já está aplicado no sistema

| Arquivo em `public/` | Vem de | Onde aparece |
| --- | --- | --- |
| `favicon.svg` + `favicon-32.png` | `svg/icones/favicon.svg` | aba do navegador |
| `apple-touch-icon.png` | `png/icones/apple-touch-icon.png` | atalho no iPhone |
| `icon-192.png` / `icon-512.png` | `png/icones/webcond-icone-app-navy-*.png` | app instalado e notificação |
| `logo.svg` | `svg/simbolo/webcond-simbolo-cor.svg` | menu do painel da plataforma |
| `logo.png` | `png/simbolo/webcond-simbolo-cor.png` | tela inicial, rodapé, páginas legais e boleto |
| `logo-email.png` | `png/logo-horizontal/webcond-horizontal-cor.png` | topo do e-mail de aviso e cobrança |

Os SVGs copiados para `public/` saem **sem o bloco `<metadata>`** do kit original (eram 8 KB de
dados de proveniência em um ícone de 500 bytes). Os originais continuam aqui, intactos.

## Como trocar uma peça

1. Substitua o arquivo correspondente em `svg/` ou `png/`.
2. Copie para `public/` com o nome da tabela acima, tirando o `<metadata>` se for SVG.
3. `npm run build` e confira a tela inicial, o rodapé e um boleto gerado.

No e-mail use sempre PNG: quase nenhum aplicativo de e-mail abre SVG.
