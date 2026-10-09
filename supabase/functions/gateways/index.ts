// Uquiorrapay — pagamentos automáticos com vários fornecedores e troca automática
//   Pagar.co.mz  (M-Pesa / e-Mola, pedido de confirmação no telemóvel + webhook assinado)
//   e2Payments   (M-Pesa / e-Mola C2B — o pedido fica à espera do PIN do cliente)
//   PaySuite     (página de pagamento; usa a função «paysuite» já existente)
//   PayPal       (internacional: conta PayPal ou cartão Visa/Mastercard pela página do PayPal; cobra em USD)
// Ações:
//   POST ?action=status                 -> fornecedores disponíveis (público)
//   POST ?action=start  {order_id, return_url}  (dono do pedido) -> {provider, mode:"push"} | {provider, mode:"redirect", url}
//   POST ?action=poll   {order_id}      (dono do pedido) -> {status: paid|pending|failed, provider, error}
//   POST ?action=webhook&p=pagar        (Pagar.co.mz, assinatura HMAC)
//   POST ?action=plan_start {plan_payment_id}  (dono) -> mensalidade do plano Pro/Elite pela Pagar (pedido no telemóvel)
//   POST ?action=plan_poll  {plan_payment_id}  (dono) -> {status: paid|pending|failed, error}
// Segurança: o estado pago só é gravado depois de confirmado na API do fornecedor (nunca pelo corpo do webhook).
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ALLOWED = [/^https:\/\/([a-z0-9-]+\.)?uquiorrapay\.pages\.dev$/, /^https:\/\/(www\.)?uquiorrapay\.com$/];
const okOrigin = (o: string | null) => !!o && ALLOWED.some((r) => r.test(o));
const cors = (req: Request) => ({
  "Access-Control-Allow-Origin": okOrigin(req.headers.get("Origin")) ? req.headers.get("Origin")! : "https://uquiorrapay.pages.dev",
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class UserError extends Error {}

const PAGAR_API = "https://api.pagar.co.mz/api/v1";
const E2_API = "https://e2payments.explicador.co.mz";
type Provider = "pagar" | "e2payments" | "paysuite";
// Erro guardado na tentativa quando o fornecedor recusa as credenciais (a administração vê-o e não conta para o limite de tentativas)
const BAD_KEY = "Chave da API do fornecedor inválida — verificar em Administração → Definições";

async function secret(name: string) {
  const { data } = await admin.rpc("get_gateway_secret", { _key: name });
  return data ? String(data).trim() : "";
}
async function gwSettings() {
  const { data } = await admin.from("settings").select("value").eq("key", "gateway").maybeSingle();
  return (data?.value || {}) as Record<string, any>;
}
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
const sha256 = async (s: string) => hex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)));
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
function safeEq(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
// Número moçambicano: 9 dígitos começados por 8 (84/85 M-Pesa, 86/87 e-Mola)
function localPhone(p: string | null | undefined) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("258") && d.length === 12) d = d.slice(3);
  return /^8[2-7]\d{7}$/.test(d) ? d : "";
}
// O número tem de pertencer ao operador do método escolhido (a Pagar recusa e-Mola com 84/85 e M-Pesa com 86/87)
function phoneMatchesMethod(phone: string, method: string) {
  if (!phone) return true;
  return method === "emola" ? /^8[67]/.test(phone) : /^8[45]/.test(phone);
}
const PHONE_MSG = (method: string) => method === "emola"
  ? "O número e-Mola tem de começar por 86 ou 87. Se o teu número é 84/85, escolhe M-Pesa."
  : "O número M-Pesa tem de começar por 84 ou 85. Se o teu número é 86/87, escolhe e-Mola.";

// ---------- Disponibilidade ----------
async function available(): Promise<Provider[]> {
  const g = await gwSettings();
  const order: Provider[] = Array.isArray(g.order) && g.order.length ? g.order : ["pagar", "e2payments", "paysuite"];
  const out: Provider[] = [];
  for (const p of order) {
    if (p === "pagar" && g.pagar_enabled && (await secret("pagar_api_key")) && (await secret("pagar_signing_secret"))) out.push(p);
    if (p === "e2payments" && g.e2_enabled && (await secret("e2_client_id")) && (await secret("e2_client_secret")) &&
        ((await secret("e2_mpesa_wallet")) || (await secret("e2_emola_wallet")))) out.push(p);
    if (p === "paysuite" && g.paysuite_enabled && (await secret("paysuite_token"))) out.push(p);
  }
  return out;
}

// ---------- Pagar.co.mz ----------
async function pagarPost(path: string, body: unknown, idem: string) {
  const key = await secret("pagar_api_key"), sign = await secret("pagar_signing_secret");
  const raw = JSON.stringify(body);
  const ts = String(Date.now());
  const nonce = b64url(crypto.getRandomValues(new Uint8Array(18)));
  const canonical = [ts, nonce, "POST", new URL(PAGAR_API + path).pathname, await sha256(raw)].join("\n");
  const r = await fetch(PAGAR_API + path, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`, "Content-Type": "application/json", Accept: "application/json",
      "X-Pagar-Timestamp": ts, "X-Pagar-Nonce": nonce, "X-Pagar-Signature": `v1=${await hmac(sign, canonical)}`, "Idempotency-Key": idem,
    },
    body: raw,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error("Pagar POST", r.status, JSON.stringify(d).slice(0, 300));
    const e = new Error(`pagar ${r.status} ${d?.error || ""}`.trim()); (e as any).code = String(d?.error || ""); (e as any).status = r.status; throw e;
  }
  return d;
}
async function pagarGet(path: string) {
  const key = await secret("pagar_api_key");
  const r = await fetch(PAGAR_API + path, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" } });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { console.error("Pagar GET", r.status, JSON.stringify(d).slice(0, 300)); throw new Error(`pagar ${r.status}`); }
  return d?.payment ?? d?.data ?? d;
}
// Confirma o estado na Pagar e actualiza o pedido
async function pagarSync(order: any, attempt: any) {
  const p = await pagarGet(attempt.external_id ? `/payments/${encodeURIComponent(attempt.external_id)}` : `/payments/by-reference/${encodeURIComponent(attempt.ext_reference || order.reference)}`);
  const st = String(p?.status || "").toUpperCase();
  if (st === "PAID") {
    const ref = String(p.reference || "");
    if (ref !== order.reference && !ref.startsWith(order.reference + "-")) throw new Error("referência diferente");
    const { error } = await admin.rpc("gateway_mark_paid2", { _order: order.id, _gateway: "pagar", _payment_id: String(p.id || attempt.external_id || ""), _amount: Number(p.amountMzn) });
    if (error) throw new Error(error.message);
    return "paid";
  }
  if (["CANCELLED", "FAILED"].includes(st)) {
    await admin.from("payment_attempts").update({ status: "failed", error: st === "CANCELLED" ? "Pagamento não confirmado a tempo" : "Pagamento recusado", updated_at: new Date().toISOString() }).eq("id", attempt.id).eq("status", "pending");
    return "failed";
  }
  return "pending";
}

// ---------- e2Payments ----------
let e2Token = { v: "", exp: 0 };
async function e2Auth() {
  if (e2Token.v && Date.now() < e2Token.exp) return e2Token.v;
  const r = await fetch(`${E2_API}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ grant_type: "client_credentials", client_id: await secret("e2_client_id"), client_secret: await secret("e2_client_secret") }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) { console.error("e2 token", r.status); const e = new Error(`e2 auth ${r.status}`); (e as any).status = r.status; throw e; }
  e2Token = { v: `${d.token_type || "Bearer"} ${d.access_token}`, exp: Date.now() + Math.min(Number(d.expires_in || 3600), 86400) * 900 };
  return e2Token.v;
}
// Corre em segundo plano: o pedido fica aberto até o cliente pôr o PIN (ou expirar)
async function e2Run(order: any, attemptId: string, wallet: string, method: string, phone: string) {
  try {
    const r = await fetch(`${E2_API}/v1/c2b/${method === "emola" ? "emola" : "mpesa"}-payment/${encodeURIComponent(wallet)}`, {
      method: "POST",
      headers: { Authorization: await e2Auth(), "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ client_id: await secret("e2_client_id"), amount: String(Math.round(Number(order.amount_mzn))), phone, reference: order.reference }),
    });
    const d = await r.json().catch(() => ({}));
    if (r.status === 200 || r.status === 201) {
      const ext = String(d?.transaction_id ?? d?.id ?? d?.data?.id ?? d?.data?.transaction_id ?? order.reference);
      const { error } = await admin.rpc("gateway_mark_paid2", { _order: order.id, _gateway: "e2payments", _payment_id: ext, _amount: Number(order.amount_mzn) });
      if (error) throw new Error(error.message);
      await admin.from("payment_attempts").update({ external_id: ext, updated_at: new Date().toISOString() }).eq("id", attemptId);
    } else {
      console.error("e2 c2b", r.status, JSON.stringify(d).slice(0, 300));
      await admin.from("payment_attempts").update({ status: "failed", error: r.status === 401 || r.status === 403 ? BAD_KEY : "Pagamento não confirmado (PIN cancelado, saldo insuficiente ou tempo esgotado)", updated_at: new Date().toISOString() }).eq("id", attemptId).eq("status", "pending");
    }
  } catch (e) {
    console.error("e2 run", e);
    await admin.from("payment_attempts").update({ status: "failed", error: "Falha de ligação ao fornecedor", updated_at: new Date().toISOString() }).eq("id", attemptId).eq("status", "pending");
  }
}

// ---------- PayPal (pedidos internacionais: PayPal ou cartão) ----------
async function paypalOn() {
  const g = await gwSettings();
  return Boolean(g.paypal_enabled && (await secret("paypal_client_id")) && (await secret("paypal_secret")));
}
async function paypalBase() { return (await gwSettings()).paypal_live ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com"; }
let ppToken = { v: "", exp: 0, base: "" };
async function paypalAuth() {
  const base = await paypalBase();
  if (ppToken.v && ppToken.base === base && Date.now() < ppToken.exp) return ppToken.v;
  const r = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: "Basic " + btoa(`${await secret("paypal_client_id")}:${await secret("paypal_secret")}`), "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.access_token) { console.error("paypal token", r.status, d?.error); throw new UserError("O PayPal está indisponível de momento."); }
  ppToken = { v: d.access_token, exp: Date.now() + Math.min(Number(d.expires_in || 3000), 30000) * 900, base };
  return ppToken.v;
}
async function paypalStart(order: any, kind: string, siteOrigin: string) {
  if (!(await paypalOn())) throw new UserError("O pagamento internacional está indisponível de momento.");
  const usd = Number(order.pay_amount);
  if (order.pay_currency !== "USD" || !(usd >= 1)) throw new UserError("Valor inválido para pagamento internacional.");
  const base = await paypalBase(), tok = await paypalAuth();
  const back = `${siteOrigin}/api/paypal-return?o=${order.id}`;
  const r = await fetch(`${base}/v2/checkout/orders`, {
    method: "POST",
    headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", "PayPal-Request-Id": `uq-${order.id}-${kind}-${Date.now() >> 16}` },
    body: JSON.stringify({
      intent: "CAPTURE",
      purchase_units: [{ reference_id: order.reference, custom_id: order.id, description: String(order.courses?.title || "Produto digital").slice(0, 120), amount: { currency_code: "USD", value: usd.toFixed(2) } }],
      payment_source: { paypal: { experience_context: { brand_name: "Uquiorrapay", locale: "pt-PT", landing_page: kind === "card" ? "GUEST_CHECKOUT" : "LOGIN", shipping_preference: "NO_SHIPPING", user_action: "PAY_NOW", return_url: back, cancel_url: back + "&cancel=1" } } },
    }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || !d.id) { console.error("paypal create", r.status, JSON.stringify(d).slice(0, 300)); throw new UserError("Não foi possível abrir o PayPal. Tenta de novo."); }
  const url = (d.links || []).find((l: any) => l.rel === "payer-action" || l.rel === "approve")?.href;
  if (!url) throw new UserError("Não foi possível abrir o PayPal. Tenta de novo.");
  await admin.from("orders").update({ gateway: "paypal", gateway_payment_id: d.id }).eq("id", order.id).eq("status", "pending");
  return { provider: "paypal", mode: "redirect", url };
}
// Confirma no PayPal e, se o cliente já aprovou, cobra (capture). Só marca pago se o valor em USD bater certo.
async function paypalSync(order: any) {
  if (!order.gateway_payment_id || order.gateway !== "paypal") return { status: "none" };
  const base = await paypalBase(), tok = await paypalAuth();
  const get = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(order.gateway_payment_id)}`, { headers: { Authorization: `Bearer ${tok}` } });
  let d = await get.json().catch(() => ({}));
  if (!get.ok) { console.error("paypal get", get.status); return { status: "pending", provider: "paypal" }; }
  if (d.status === "APPROVED") {
    const cap = await fetch(`${base}/v2/checkout/orders/${encodeURIComponent(order.gateway_payment_id)}/capture`, {
      method: "POST", headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json", "PayPal-Request-Id": `uq-cap-${order.id}` }, body: "{}",
    });
    d = await cap.json().catch(() => ({}));
    if (!cap.ok) { console.error("paypal capture", cap.status, JSON.stringify(d).slice(0, 300)); return { status: "failed", provider: "paypal", error: "O PayPal recusou o pagamento. Tenta outro cartão ou conta." }; }
  }
  if (d.status === "COMPLETED") {
    const capture = d.purchase_units?.[0]?.payments?.captures?.[0];
    const val = Number(capture?.amount?.value || 0), cur = capture?.amount?.currency_code;
    if (d.purchase_units?.[0]?.custom_id && d.purchase_units[0].custom_id !== order.id) { console.error("paypal custom_id diferente"); return { status: "failed", provider: "paypal" }; }
    if (cur !== "USD" || val + 0.01 < Number(order.pay_amount)) { console.error("paypal valor", val, cur, order.pay_amount); return { status: "failed", provider: "paypal", error: "Valor pago diferente do pedido." }; }
    if (capture?.status && !["COMPLETED", "PENDING"].includes(capture.status)) return { status: "failed", provider: "paypal", error: "Pagamento não concluído." };
    if (capture?.status === "PENDING") return { status: "pending", provider: "paypal" };
    const { error } = await admin.rpc("gateway_mark_paid2", { _order: order.id, _gateway: "paypal", _payment_id: String(capture?.id || order.gateway_payment_id), _amount: Number(order.amount_mzn) });
    if (error) throw new Error(error.message);
    return { status: "paid", provider: "paypal" };
  }
  return { status: d.status === "VOIDED" ? "failed" : "pending", provider: "paypal" };
}

// ---------- Início do pagamento com troca automática ----------
async function start(order: any, req: Request, returnUrl: string) {
  const list = await available();
  if (!list.length) throw new UserError("O pagamento automático está indisponível de momento.");
  const method = order.payment_method === "emola" ? "emola" : "mpesa";
  const phone = localPhone(order.payer_phone);
  // Número do operador errado: avisa logo o cliente, sem gastar uma tentativa no fornecedor
  if (!phoneMatchesMethod(phone, method)) throw new UserError(PHONE_MSG(method));
  const amount = Number(order.amount_mzn);
  const tried: string[] = [];
  let sandboxMsg = "", configMsg = "";
  // Já há um pedido de confirmação em curso (ex.: duplo clique)? Não cobra outra vez.
  const { data: cur } = await admin.from("payment_attempts").select("provider,created_at").eq("order_id", order.id).eq("status", "pending").maybeSingle();
  if (cur && cur.provider !== "paysuite" && Date.now() - new Date(cur.created_at).getTime() < 3 * 60 * 1000) return { provider: cur.provider, mode: "push", resumed: true };
  if (cur) await admin.from("payment_attempts").update({ status: "failed", error: "Substituída por nova tentativa", updated_at: new Date().toISOString() }).eq("order_id", order.id).eq("status", "pending");
  const { count: prev } = await admin.from("payment_attempts").select("id", { count: "exact", head: true }).eq("order_id", order.id);
  for (const p of list) {
    try {
      if (p === "pagar") {
        if (!phone || amount < 20 || amount > 40000) { tried.push("pagar: número/valor"); continue; }
        const extRef = prev ? `${order.reference}-${(prev || 0) + 1}` : order.reference;
        const { data: at, error: insErr } = await admin.from("payment_attempts").insert({ order_id: order.id, provider: "pagar", method, ext_reference: extRef }).select().single();
        if (insErr) return { provider: p, mode: "push", resumed: true }; // outra tentativa começou ao mesmo tempo
        const d = await pagarPost("/payments", {
          reference: extRef, title: "Uquiorrapay", description: String(order.courses?.title || "Produto digital").slice(0, 120),
          amountMzn: Math.round(amount), method: method === "emola" ? "EMOLA" : "MPESA", payerPhone: phone,
        }, `uq-${at.id}`);
        const pay = d?.payment ?? d;
        await admin.from("payment_attempts").update({ external_id: String(pay?.id || ""), updated_at: new Date().toISOString() }).eq("id", at.id);
        await admin.from("orders").update({ gateway: "pagar", gateway_payment_id: String(pay?.id || "") }).eq("id", order.id).eq("status", "pending");
        return { provider: p, mode: "push" };
      }
      if (p === "e2payments") {
        const wallet = await secret(method === "emola" ? "e2_emola_wallet" : "e2_mpesa_wallet");
        if (!phone || !wallet) { tried.push("e2: número/carteira"); continue; }
        await e2Auth(); // falha já aqui se as credenciais estiverem erradas → passa ao seguinte
        const { data: at, error: insErr } = await admin.from("payment_attempts").insert({ order_id: order.id, provider: "e2payments", method, ext_reference: order.reference }).select().single();
        if (insErr) return { provider: p, mode: "push", resumed: true };
        await admin.from("orders").update({ gateway: "e2payments" }).eq("id", order.id).eq("status", "pending");
        // @ts-ignore EdgeRuntime existe no Supabase
        EdgeRuntime.waitUntil(e2Run(order, at.id, wallet, method, phone));
        return { provider: p, mode: "push" };
      }
      if (p === "paysuite") {
        const r = await fetch(`${SB_URL}/functions/v1/paysuite?action=checkout`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: req.headers.get("Authorization") || "", Origin: req.headers.get("Origin") || "https://uquiorrapay.pages.dev" },
          body: JSON.stringify({ order_id: order.id, return_url: returnUrl }),
        });
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.checkout_url) throw new Error(d?.error || `paysuite ${r.status}`);
        await admin.from("payment_attempts").insert({ order_id: order.id, provider: "paysuite", method });
        return { provider: p, mode: "redirect", url: d.checkout_url };
      }
    } catch (e) {
      console.error("start", p, String(e));
      tried.push(`${p}: ${String((e as Error).message || e).slice(0, 60)}`);
      const code = String((e as any).code || "");
      const sandbox = code === "API_SANDBOX_PHONE_REQUIRED";
      // Chave/segredo errados no fornecedor: não é culpa do cliente — fica registado para a administração corrigir
      const badKey = code === "API_KEY_INVALID" || [401, 403].includes(Number((e as any).status));
      const badPhone = code === "API_PAYMENT_PHONE_INVALID";
      if (sandbox) sandboxMsg = `A Pagar.co.mz está em MODO DE TESTE: só aceita os números de teste ${method === "emola" ? "860000001" : "840000001"} (sucesso). Para receber pagamentos reais, ativa o modo LIVE na Pagar.`;
      if (badKey) configMsg = "O pagamento automático está temporariamente indisponível (configuração do fornecedor). Paga pelo método manual abaixo — confirmamos assim que recebermos.";
      await admin.from("payment_attempts").update({
        status: "failed",
        error: sandbox ? "Pagar em modo de teste (número de teste obrigatório)" : badKey ? BAD_KEY : badPhone ? "Número de telemóvel não corresponde ao método (M-Pesa 84/85, e-Mola 86/87)" : "Fornecedor indisponível",
        updated_at: new Date().toISOString(),
      }).eq("order_id", order.id).eq("provider", p).eq("status", "pending");
      if (badPhone) throw new UserError(PHONE_MSG(method));
    }
  }
  console.error("nenhum fornecedor", order.reference, tried.join(" | "));
  throw new UserError(sandboxMsg || configMsg || "O pagamento automático está indisponível de momento.");
}

// Mensagem para o cliente: o motivo técnico (chave do fornecedor inválida) fica só para a administração
const friendly = (err: string | null | undefined) => (err === BAD_KEY ? "O pagamento automático está indisponível de momento. Paga pelo método manual." : err ?? null);
async function poll(order: any) {
  if (order.status === "paid") return { status: "paid" };
  if (order.payment_method === "paypal") return await paypalSync(order);
  const { data: at } = await admin.from("payment_attempts").select("*").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (!at) return { status: "none" };
  if (at.status === "pending" && at.provider === "pagar") {
    try { const s = await pagarSync(order, at); if (s !== "pending") return { status: s, provider: at.provider, error: s === "failed" ? "O pagamento não foi confirmado." : null }; }
    catch (e) { console.error("poll pagar", String(e)); }
  }
  if (at.status === "pending" && Date.now() - new Date(at.created_at).getTime() > 4 * 60 * 1000 && at.provider !== "paysuite") {
    await admin.from("payment_attempts").update({ status: "failed", error: "Tempo esgotado", updated_at: new Date().toISOString() }).eq("id", at.id).eq("status", "pending");
    return { status: "failed", provider: at.provider, error: "Tempo esgotado. Tenta de novo." };
  }
  return { status: at.status, provider: at.provider, error: friendly(at.error) };
}


// ---------- Mensalidade dos planos (Pro / Elite) — só Pagar.co.mz ----------
async function planSync(pp: any) {
  if (!pp.gateway_payment_id) return "pending";
  const p = await pagarGet(`/payments/${encodeURIComponent(pp.gateway_payment_id)}`);
  const st = String(p?.status || "").toUpperCase();
  if (st === "PAID") {
    if (String(p.reference || "") !== pp.reference) throw new Error("referência diferente");
    const { error } = await admin.rpc("gateway_plan_paid", { _id: pp.id, _gateway: "pagar", _payment_id: String(p.id || pp.gateway_payment_id), _amount: Number(p.amountMzn) });
    if (error) throw new Error(error.message);
    return "paid";
  }
  if (["CANCELLED", "FAILED"].includes(st)) {
    await admin.from("plan_payments").update({ status: "failed", reason: st === "CANCELLED" ? "Pagamento não confirmado a tempo" : "Pagamento recusado" }).eq("id", pp.id).eq("status", "pending");
    return "failed";
  }
  return "pending";
}
async function planStart(pp: any) {
  if (pp.status !== "pending" || pp.mode !== "auto") throw new UserError("Este pagamento já não está pendente.");
  if (!(await available()).includes("pagar")) throw new UserError("O pagamento automático está indisponível de momento. Usa a Carteira ou o pagamento manual.");
  if (pp.gateway_payment_id) return { provider: "pagar", mode: "push", resumed: true };
  const phone = localPhone(pp.payer_phone);
  if (!phone) throw new UserError("Número de telemóvel inválido.");
  const method = pp.method === "emola" ? "emola" : "mpesa";
  if (!phoneMatchesMethod(phone, method)) throw new UserError(PHONE_MSG(method));
  try {
    const d = await pagarPost("/payments", {
      reference: pp.reference, title: "Uquiorrapay", description: `Plano ${pp.plan === "elite" ? "Elite" : "Pro"} — ${pp.days} dias`,
      amountMzn: Math.round(Number(pp.amount_mzn)), method: method === "emola" ? "EMOLA" : "MPESA", payerPhone: phone,
    }, `uqp-${pp.id}`);
    const pay = d?.payment ?? d;
    await admin.from("plan_payments").update({ gateway: "pagar", gateway_payment_id: String(pay?.id || "") }).eq("id", pp.id).eq("status", "pending");
    return { provider: "pagar", mode: "push" };
  } catch (e) {
    console.error("plan start", String(e));
    const sandbox = (e as any).code === "API_SANDBOX_PHONE_REQUIRED";
    await admin.from("plan_payments").update({ status: "failed", reason: sandbox ? "Pagar em modo de teste" : "Fornecedor indisponível" }).eq("id", pp.id).eq("status", "pending");
    throw new UserError(sandbox ? `A Pagar.co.mz está em MODO DE TESTE: só aceita o número ${method === "emola" ? "860000001" : "840000001"}.` : "Não foi possível pedir o pagamento. Tenta de novo ou usa o pagamento manual.");
  }
}
async function planPoll(pp: any) {
  if (pp.status === "paid") return { status: "paid" };
  if (pp.status !== "pending") return { status: "failed", error: pp.reason || "O pagamento não foi confirmado." };
  try {
    const s = await planSync(pp);
    if (s !== "pending") return { status: s, error: s === "failed" ? "O pagamento não foi confirmado." : null };
  } catch (e) { console.error("plan poll", String(e)); }
  if (Date.now() - new Date(pp.created_at).getTime() > 5 * 60 * 1000) {
    await admin.from("plan_payments").update({ status: "failed", reason: "Tempo esgotado" }).eq("id", pp.id).eq("status", "pending");
    return { status: "failed", error: "Tempo esgotado. Tenta de novo." };
  }
  return { status: "pending" };
}

async function webhookPagar(req: Request, raw: string) {
  const sec = await secret("pagar_webhook_secret");
  const sig = req.headers.get("Pagar-Signature") || "";
  const t = /t=(\d+)/.exec(sig)?.[1] || "", v1 = /v1=([0-9a-f]+)/i.exec(sig)?.[1] || "";
  if (!sec || !t || !v1 || !req.headers.get("Pagar-Event-Id")) return false;
  const ts = Number(t) > 1e12 ? Number(t) / 1000 : Number(t);
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false;
  if (!safeEq(await hmac(sec, `${t}.${raw}`), v1.toLowerCase())) return false;
  let ev: any = {}; try { ev = JSON.parse(raw); } catch { return false; }
  const p = ev?.data?.payment ?? ev?.payment ?? ev?.data?.object ?? ev?.data ?? {};
  const ref = String(p?.reference || "");
  if (!/^[A-Z0-9-]{4,40}$/i.test(ref)) return true;
  if (/^UP[0-9A-F]{8}$/i.test(ref)) { // mensalidade de plano
    const { data: pp } = await admin.from("plan_payments").select("*").eq("reference", ref.toUpperCase()).maybeSingle();
    if (pp && pp.status === "pending") await planSync(pp.gateway_payment_id ? pp : { ...pp, gateway_payment_id: p?.id || null }); // confirma sempre na API
    return true;
  }
  const { data: order } = await admin.from("orders").select("id,reference,status,amount_mzn").eq("reference", ref.replace(/-\d{1,3}$/, "")).maybeSingle();
  if (!order || order.status !== "pending") return true;
  const { data: at } = await admin.from("payment_attempts").select("*").eq("order_id", order.id).eq("provider", "pagar").order("created_at", { ascending: false }).limit(1).maybeSingle();
  await pagarSync(order, at || { id: null, external_id: p?.id || null }); // confirma sempre na API
  return true;
}

Deno.serve(async (req) => {
  const h = cors(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";
  const raw = await req.text();
  if (raw.length > 20_000) return json({ error: "Pedido demasiado grande" }, 413);
  try {
    if (action === "webhook") {
      if (url.searchParams.get("p") !== "pagar") return json({ error: "Desconhecido" }, 400);
      const ok = await webhookPagar(req, raw);
      return json({ ok }, ok ? 200 : 401);
    }
    if (action === "status") {
      const list = await available();
      return json({ enabled: list.length > 0, providers: list, paypal: await paypalOn() });
    }
    let body: any = {}; try { body = raw ? JSON.parse(raw) : {}; } catch { body = {}; }
    const jwt = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u } = jwt ? await admin.auth.getUser(jwt) : { data: null as any };
    if (!u?.user) return json({ error: "Sessão inválida" }, 401);
    if (action === "plan_start" || action === "plan_poll") {
      if (!UUID.test(String(body.plan_payment_id || ""))) return json({ error: "Pedido inválido" }, 400);
      const { data: pp } = await admin.from("plan_payments").select("*").eq("id", body.plan_payment_id).maybeSingle();
      if (!pp || pp.user_id !== u.user.id) return json({ error: "Pedido não encontrado" }, 404);
      if (action === "plan_poll") return json(await planPoll(pp));
      const { count } = await admin.from("plan_payments").select("id", { count: "exact", head: true }).eq("user_id", u.user.id).eq("mode", "auto").gte("created_at", new Date(Date.now() - 3600_000).toISOString());
      if ((count || 0) > 8) return json({ error: "Muitas tentativas. Espera um pouco ou usa o pagamento manual." }, 429);
      return json(await planStart(pp));
    }
    if (!UUID.test(String(body.order_id || ""))) return json({ error: "Pedido inválido" }, 400);
    const { data: order } = await admin.from("orders").select("id,buyer_id,status,amount_mzn,pay_amount,pay_currency,reference,payment_method,payer_phone,course_id,gateway,gateway_payment_id, courses!orders_course_id_fkey(title)").eq("id", body.order_id).maybeSingle();
    if (!order || order.buyer_id !== u.user.id) return json({ error: "Pedido não encontrado" }, 404);

    if (action === "start") {
      if (order.status !== "pending") return json({ error: "Este pedido já não está pendente" }, 400);
      // Limite de tentativas por hora (as que falharam por credenciais erradas do fornecedor não contam — não é culpa do cliente)
      const since = new Date(Date.now() - 3600_000).toISOString();
      const [{ count: all }, { count: bad }] = await Promise.all([
        admin.from("payment_attempts").select("id", { count: "exact", head: true }).eq("order_id", order.id).gte("created_at", since),
        admin.from("payment_attempts").select("id", { count: "exact", head: true }).eq("order_id", order.id).gte("created_at", since).eq("error", BAD_KEY),
      ]);
      if ((all || 0) - (bad || 0) >= 6) return json({ error: "Muitas tentativas. Espera um pouco ou paga pelo método manual." }, 429);
      let ret = "https://uquiorrapay.pages.dev/";
      try { const ru = new URL(String(body.return_url || "")); if (okOrigin(ru.origin)) ret = ru.toString(); } catch { /* padrão */ }
      if (order.payment_method === "paypal") return json(await paypalStart(order, body.kind === "card" ? "card" : "paypal", new URL(ret).origin));
      return json(await start(order, req, ret));
    }
    if (action === "poll") return json(await poll(order));
    return json({ error: "Ação inválida" }, 400);
  } catch (e) {
    if (e instanceof UserError) return json({ error: e.message }, 400);
    console.error(e);
    return json({ error: "Erro interno. Tenta novamente." }, 500);
  }
});
