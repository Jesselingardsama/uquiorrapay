// Cloudflare Pages (modo avançado): encaminha os webhooks dos fornecedores de pagamento (Pagar.co.mz, NetShop, iMali Way) para o servidor (Supabase),
// para o webhook ficar no mesmo domínio do site. Tudo o resto é servido normalmente.
// Provas de domínio da Pagar.co.mz: os tokens vêm da Administração (Definições → Pagar.co.mz → tokens de verificação),
// por isso, se a Pagar pedir um token novo, basta colá-lo lá — não é preciso publicar o site de novo.
const FIXED_TOKENS = [
  "pagar-verification=dom_Lz0qV46kjFSz75EcNMUpNwCX1BM8o0AQ",
  "pagar-verification=dom_VrFYovaN-ealWblYxCk_H7KqquQFuv7X",
];
const SB_URL = "https://dzwbccqqvcmqmmqtdgzw.supabase.co";
const SB_KEY = "sb_publishable_ZhMujtcR7aD3y6AxiDJ-AA_fQhAz8iX";
let cache = { at: 0, tokens: [] };
async function verificationText() {
  if (Date.now() - cache.at > 30000) {
    try {
      const r = await fetch(`${SB_URL}/rest/v1/settings?select=value&key=eq.pagar_verification`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
      const rows = r.ok ? await r.json() : [];
      const raw = rows[0] && typeof rows[0].value === "string" ? rows[0].value : "";
      const tokens = (raw.match(/dom_[A-Za-z0-9_-]{10,80}/g) || []).map((t) => `pagar-verification=${t}`);
      cache = { at: Date.now(), tokens };
    } catch { cache.at = Date.now(); }
  }
  return [...new Set([...cache.tokens, ...FIXED_TOKENS])].join("\n") + "\n";
}
const TARGET_BASE = "https://dzwbccqqvcmqmmqtdgzw.supabase.co/functions/v1/gateways?action=webhook";
const WEBHOOKS = {
  "/api/pagar-webhook": { p: "pagar", headers: ["Pagar-Signature", "Pagar-Event-Id", "Pagar-Event-Type", "User-Agent"] },
  "/api/netshop-webhook": { p: "netshop", headers: ["X-NetShop-Signature", "X-NetShop-Event", "User-Agent"] },
  "/api/imali-webhook": { p: "imali", headers: ["X-Webhook-Signature", "X-Webhook-Timestamp", "X-Client-ID", "User-Agent"] },
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cleanPath = url.pathname.replace(/\/+$/, "").toLowerCase();
    if (cleanPath === "/.well-known/pagar-verification.txt") {
      return new Response(await verificationText(), { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" } });
    }
    // App Android (TWA): prova de que a app pertence a este site. O conteúdo vem das Definições
    // (chave «android_assetlinks»), por isso basta guardar a impressão digital da app — sem publicar o site.
    if (cleanPath === "/.well-known/assetlinks.json") {
      let body = "[]";
      try {
        const r = await fetch(`${SB_URL}/rest/v1/settings?select=value&key=eq.android_assetlinks`, { headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}` } });
        const rows = r.ok ? await r.json() : [];
        const v = rows[0] ? rows[0].value : null;
        if (Array.isArray(v)) body = JSON.stringify(v);
      } catch {}
      return new Response(body, { headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=300", "Access-Control-Allow-Origin": "*" } });
    }
    // País do visitante (pelo IP, via Cloudflare) para escolher a língua e a moeda automaticamente
    if (url.pathname === "/api/geo") {
      const country = String((request.cf && request.cf.country) || request.headers.get("CF-IPCountry") || "").toUpperCase().slice(0, 2);
      return new Response(JSON.stringify({ country }), { headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
    }
    // Regresso do PayPal: leva o cliente à página que confirma o pagamento
    if (url.pathname === "/api/paypal-return") {
      const o = url.searchParams.get("o") || "";
      const ok = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(o);
      const dest = ok ? `/#/pagamento/${o}${url.searchParams.get("cancel") ? "?cancelado=1" : ""}` : "/";
      return new Response(null, { status: 302, headers: { Location: dest, "Cache-Control": "no-store" } });
    }
    // Webhooks dos fornecedores de pagamento (ficam no domínio do site e são reencaminhados para o servidor)
    const hook = WEBHOOKS[url.pathname];
    if (hook) {
      if (request.method === "GET") return new Response(JSON.stringify({ ok: true, service: hook.p + "-webhook" }), { headers: { "Content-Type": "application/json" } });
      if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
      const body = await request.text();
      const headers = new Headers({ "Content-Type": request.headers.get("Content-Type") || "application/json" });
      for (const h of hook.headers) {
        const v = request.headers.get(h); if (v) headers.set(h, v);
      }
      const r = await fetch(`${TARGET_BASE}&p=${hook.p}`, { method: "POST", headers, body });
      return new Response(await r.text(), { status: r.status, headers: { "Content-Type": "application/json" } });
    }
    return env.ASSETS.fetch(request);
  },
};
