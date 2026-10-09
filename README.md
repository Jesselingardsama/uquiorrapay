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

## Backend (Supabase)

A pasta `supabase/` guarda cópias do que está publicado no projecto Supabase, para referência e revisão:

| Caminho | O que é |
| --- | --- |
| `supabase/functions/gateways/index.ts` | Edge Function dos pagamentos automáticos (Pagar.co.mz, e2Payments, PaySuite, PayPal) |
| `supabase/migrations/*.sql` | Migrações aplicadas à base de dados (tabelas, triggers e funções RPC) |

Regras de negócio relevantes:

- **Saque na hora:** o valor de cada venda fica disponível de imediato na carteira do produtor. Só fica retido (pelos «dias de garantia» das Definições) nos produtos em que o produtor activou a **garantia ao comprador**.
- **Comissão da plataforma:** definida em Administração → Definições (`commission_pct`, actualmente 9,5%).
- **Order bump, upsell e downsell:** configurados pelo produtor em cada produto (secção «Order bump, upsell e downsell»). O order bump é pago junto com o produto principal; o upsell/downsell aparecem depois do pagamento confirmado e na área de membros.

## Publicar no Cloudflare Pages

1. Cria um projeto Pages ligado a este repositório.
2. Comando de build: *(nenhum)*. Diretório de saída: `/` (raiz).
3. O ficheiro `_worker.js` activa o modo avançado automaticamente.

Os segredos (chaves das gateways de pagamento, PayPal, Resend, etc.) **não** ficam neste repositório: são guardados no Supabase através da página de Administração do site.

## Desenvolvimento local

```bash
npx wrangler pages dev .
```
