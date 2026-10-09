# Uquiorrapay — site

Marketplace de cursos, ebooks e templates. Site estático (PWA) publicado no **Cloudflare Pages**, com dados e autenticação no **Supabase**.

## Estrutura

| Caminho | O que é |
| --- | --- |
| `index.html` | Única página; o resto é carregado por `js/app.js` (SPA com rotas em `#/…`) |
| `js/config.js` | Configuração pública (URL e chave *publishable* do Supabase, categorias, moedas) |
| `js/api.js` | Chamadas ao Supabase (tabelas, RPC, Edge Functions) |
| `js/views/` | Ecrãs: público, carteira, conta, produtor, administração, KYC, segurança, onboarding |
| `js/ui.js`, `js/assistant.js`, `js/push.js`, `js/track.js`, `js/captcha.js` | UI partilhada, assistente, notificações push, analytics, Turnstile |
| `css/styles.css` | Estilos |
| `_worker.js` | Worker do Cloudflare Pages: webhook da Pagar.co.mz, `/.well-known/*`, `/api/geo`, regresso do PayPal |
| `_routes.json` | Quais caminhos passam pelo worker (`/api/*` e `/.well-known/*`) |
| `_headers` | Cabeçalhos de segurança (CSP, HSTS, etc.) e cache |
| `sw.js`, `manifest.webmanifest`, `offline.html`, `img/app/` | PWA (service worker, manifesto, ícones) |

## Publicar no Cloudflare Pages

1. Cria um projeto Pages ligado a este repositório.
2. Comando de build: *(nenhum)*. Diretório de saída: `/` (raiz).
3. O ficheiro `_worker.js` activa o modo avançado automaticamente.

Os segredos (chaves das gateways de pagamento, PayPal, Resend, etc.) **não** ficam neste repositório: são guardados no Supabase através da página de Administração do site.

## Desenvolvimento local

```bash
npx wrangler pages dev .
```
