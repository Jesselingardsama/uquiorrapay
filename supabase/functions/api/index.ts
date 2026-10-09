// Uquiorrapay — API pública v1 (estilo Pagar.co.mz) para produtores e integrações
//   Autenticação: Authorization: Bearer uq_live_…  (chave criada no painel do produtor → API e webhooks)
//   GET  /v1/me                      quem sou
//   GET  /v1/products                os meus produtos à venda
//   GET  /v1/orders?status=&limit=   os meus pedidos (vendas)
//   GET  /v1/orders/:id              um pedido, com o estado do pagamento
//   POST /v1/orders                  cria um pedido para um cliente e (M-Pesa/e-Mola) pede a confirmação no telemóvel
//   POST /v1/orders/:id/push         volta a pedir a confirmação no telemóvel
//   POST ?action=dispatch            (interno, base de dados) entrega um evento aos webhooks do produtor
// Webhooks: POST JSON assinado — Uquiorrapay-Signature: t=<unix>,v1=<hmac-sha256(secret, "<t>.<corpo>")>
import { createClient } from "npm:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(SB_URL, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SYNTHETIC = /@telefone\.uquiorrapay\.com$/i;
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, content-type, idempotency-key", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...CORS, "Content-Type": "application/json", "Cache-Control": "no-store" } });
const fail = (status: number, code: string, message: string) => json({ error: { code, message } }, status);
class ApiError extends Error { constructor(public status: number, public code: string, message: string) { super(message); } }

async function setting(key: string) { const { data } = await admin.from("settings").select("value").eq("key", key).maybeSingle(); return data?.value ?? null; }
async function secret(name: string) { const { data } = await admin.rpc("get_gateway_secret", { _key: name }); return data ? String(data).trim() : ""; }
const siteUrl = async () => String((await setting("site_url")) || "https://uquiorrapay.com").replace(/\/$/, "");
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
async function hmac(key: string, msg: string) {
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return hex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(msg)));
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
// Número moçambicano: 9 dígitos começados por 8 (84/85 M-Pesa, 86/87 e-Mola)
function localPhone(p: unknown) {
  let d = String(p || "").replace(/\D/g, "");
  if (d.startsWith("258") && d.length === 12) d = d.slice(3);
  return /^8[2-7]\d{7}$/.test(d) ? d : "";
}
const ORDER_COLS = "*, courses!orders_course_id_fkey(id,title,producer_id,product_type)";

// Forma pública de um pedido
async function shapeOrder(o: any, site: string, withPayment = false) {
  const { data: buyer } = await admin.from("profiles").select("full_name,email,phone").eq("id", o.buyer_id).maybeSingle();
  const out: any = {
    id: o.id, reference: o.reference, status: o.status,
    product: { id: o.course_id, title: o.courses?.title ?? null, type: o.courses?.product_type ?? "curso" },
    amount_mzn: Number(o.amount_mzn), pay_currency: o.pay_currency, pay_amount: Number(o.pay_amount), payment_method: o.payment_method, gateway: o.gateway,
    discount_mzn: Number(o.discount_mzn || 0), coupon_code: o.coupon_code, affiliate_code: o.affiliate_code,
    commission_mzn: Number(o.commission_mzn), producer_net_mzn: Number(o.producer_net_mzn),
    bump: o.bump_course_id ? { product_id: o.bump_course_id, amount_mzn: Number(o.bump_mzn || 0) } : null,
    customer: buyer ? { name: buyer.full_name, email: SYNTHETIC.test(buyer.email || "") ? null : buyer.email, phone: o.payer_phone || buyer.phone || null } : null,
    checkout_url: `${site}/#/checkout/${o.course_id}`,
    created_at: o.created_at, paid_at: o.paid_at,
  };
  if (withPayment && o.status === "pending") {
    const { data: at } = await admin.from("payment_attempts").select("provider,status,error,created_at").eq("order_id", o.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    out.payment = at ? { provider: at.provider, status: at.status, error: /Chave da API/.test(at.error || "") ? "Pagamento automático indisponível" : at.error, started_at: at.created_at } : null;
  }
  return out;
}

// Pedido de confirmação no telemóvel, através da função «gateways» (chamada interna em nome do comprador)
async function pushPayment(order: any, site: string) {
  const r = await fetch(`${SB_URL}/functions/v1/gateways?action=start`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-internal-secret": await secret("notify_secret"), Origin: site },
    body: JSON.stringify({ order_id: order.id, as_user: order.buyer_id, return_url: `${site}/#/pagamento/${order.id}` }),
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) return { mode: "manual", error: d?.error || "Pagamento automático indisponível", checkout_url: `${site}/#/checkout/${order.course_id}` };
  return { mode: d.mode || "push", provider: d.provider || null, resumed: Boolean(d.resumed), url: d.url || null };
}

// ---------- Webhooks ----------
async function dispatch(orderId: string, event: string) {
  const { data: o } = await admin.from("orders").select(ORDER_COLS).eq("id", orderId).maybeSingle();
  if (!o) return { ok: false, error: "pedido não encontrado" };
  const { data: hooks } = await admin.from("api_webhooks").select("*").eq("user_id", o.courses.producer_id).eq("active", true).contains("events", [event]);
  if (!hooks?.length) return { ok: true, delivered: 0 };
  const site = await siteUrl();
  const eventId = crypto.randomUUID();
  const payload = JSON.stringify({ id: eventId, event, created_at: new Date().toISOString(), data: { order: await shapeOrder(o, site) } });
  let delivered = 0;
  for (const h of hooks) {
    let status: number | null = null, error = "", ok = false, attempts = 0;
    for (const wait of [0, 2000, 6000]) {
      attempts++;
      if (wait) await sleep(wait);
      try {
        const t = Math.floor(Date.now() / 1000);
        const r = await fetch(h.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "Uquiorrapay-Webhooks/1.0", "Uquiorrapay-Event": event, "Uquiorrapay-Event-Id": eventId, "Uquiorrapay-Signature": `t=${t},v1=${await hmac(h.secret, `${t}.${payload}`)}` },
          body: payload, redirect: "manual", signal: AbortSignal.timeout(10000),
        });
        status = r.status; ok = r.status >= 200 && r.status < 300;
        if (ok) break;
        error = `HTTP ${r.status}`;
      } catch (e) { error = String((e as Error).message || e).slice(0, 200); }
    }
    if (ok) delivered++;
    await admin.from("api_webhook_deliveries").insert({ webhook_id: h.id, user_id: h.user_id, event, order_id: o.id, status_code: status, ok, attempts, error: ok ? null : error });
  }
  return { ok: true, delivered };
}

// ---------- Rotas ----------
async function route(req: Request, path: string, uid: string): Promise<Response> {
  const site = await siteUrl();
  const m = req.method;
  const bodyOf = async () => { try { return (await req.json()) || {}; } catch { throw new ApiError(400, "invalid_json", "O corpo do pedido tem de ser JSON válido"); } };

  if (m === "GET" && (path === "/v1" || path === "/")) {
    return json({ name: "Uquiorrapay API", version: "v1", docs: `${site}/#/api-docs`, endpoints: ["GET /v1/me", "GET /v1/products", "GET /v1/orders", "GET /v1/orders/{id}", "POST /v1/orders", "POST /v1/orders/{id}/push"] });
  }
  if (m === "GET" && path === "/v1/me") {
    const { data: p } = await admin.from("profiles").select("id,full_name,email").eq("id", uid).maybeSingle();
    return json({ id: uid, name: p?.full_name ?? null, email: p?.email ?? null });
  }
  if (m === "GET" && path === "/v1/products") {
    const { data: rows, error } = await admin.from("courses").select("id,title,subtitle,product_type,price_mzn,price_usd,status,category,guarantee_enabled,affiliate_enabled,affiliate_pct,cover_url,created_at")
      .eq("producer_id", uid).in("status", ["approved", "pending", "draft"]).order("updated_at", { ascending: false });
    if (error) throw new ApiError(500, "db_error", error.message);
    return json({ data: (rows || []).map((c) => ({ ...c, price_mzn: Number(c.price_mzn), price_usd: c.price_usd == null ? null : Number(c.price_usd), on_sale: c.status === "approved", checkout_url: `${site}/#/checkout/${c.id}`, sales_page_url: `${site}/#/curso/${c.id}` })) });
  }
  if (m === "GET" && path === "/v1/orders") {
    const u = new URL(req.url);
    const status = u.searchParams.get("status") || "", product = u.searchParams.get("product_id") || "", since = u.searchParams.get("since") || "";
    const limit = Math.min(100, Math.max(1, Number(u.searchParams.get("limit") || 50)));
    const { data: mine } = await admin.from("courses").select("id").eq("producer_id", uid);
    const ids = (mine || []).map((c) => c.id);
    if (!ids.length) return json({ data: [] });
    let q = admin.from("orders").select(ORDER_COLS).in("course_id", product && ids.includes(product) ? [product] : ids).order("created_at", { ascending: false }).limit(limit);
    if (["pending", "paid", "cancelled", "refunded"].includes(status)) q = q.eq("status", status);
    if (since && !Number.isNaN(Date.parse(since))) q = q.gte("created_at", new Date(since).toISOString());
    const { data: rows, error } = await q;
    if (error) throw new ApiError(500, "db_error", error.message);
    return json({ data: await Promise.all((rows || []).map((o) => shapeOrder(o, site))) });
  }
  const one = /^\/v1\/orders\/([0-9a-f-]{36})(\/push)?$/i.exec(path);
  if (one) {
    const { data: o } = await admin.from("orders").select(ORDER_COLS).eq("id", one[1]).maybeSingle();
    if (!o || o.courses?.producer_id !== uid) throw new ApiError(404, "not_found", "Pedido não encontrado");
    if (m === "GET" && !one[2]) return json({ data: await shapeOrder(o, site, true) });
    if (m === "POST" && one[2]) {
      if (o.status !== "pending") throw new ApiError(409, "not_pending", "Este pedido já não está pendente");
      if (!["mpesa", "emola"].includes(o.payment_method)) throw new ApiError(400, "invalid_method", "Só pedidos M-Pesa ou e-Mola recebem confirmação no telemóvel");
      return json({ data: { order: await shapeOrder(o, site, true), payment: await pushPayment(o, site) } });
    }
  }
  if (m === "POST" && path === "/v1/orders") {
    const b = await bodyOf();
    const productId = String(b.product_id || "");
    if (!UUID.test(productId)) throw new ApiError(400, "invalid_product", "product_id inválido");
    const { data: c } = await admin.from("courses").select("id,producer_id,status,title,price_mzn").eq("id", productId).maybeSingle();
    if (!c || c.producer_id !== uid) throw new ApiError(404, "not_found", "Produto não encontrado");
    if (c.status !== "approved") throw new ApiError(409, "not_on_sale", "O produto ainda não está aprovado e à venda");
    const cust = b.customer || {};
    const name = String(cust.name || "").trim(), email = String(cust.email || "").trim().toLowerCase(), phone = localPhone(cust.phone);
    const method = ["mpesa", "emola", "manual"].includes(String(b.payment_method)) ? String(b.payment_method) : "mpesa";
    if (name.length < 3) throw new ApiError(400, "invalid_customer", "customer.name é obrigatório (3 ou mais caracteres)");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new ApiError(400, "invalid_customer", "customer.email é obrigatório e tem de ser válido (é por aí que o cliente acede ao produto)");
    if (method !== "manual" && !phone) throw new ApiError(400, "invalid_phone", "customer.phone tem de ser um número moçambicano com 9 dígitos (84/85 M-Pesa, 86/87 e-Mola)");
    if (method === "emola" && !/^8[67]/.test(phone)) throw new ApiError(400, "invalid_phone", "O número e-Mola tem de começar por 86 ou 87");
    if (method === "mpesa" && !/^8[45]/.test(phone)) throw new ApiError(400, "invalid_phone", "O número M-Pesa tem de começar por 84 ou 85");
    // Cliente: conta existente (pelo email) ou conta nova; a conta nova recebe um email para definir a palavra-passe
    let buyerId = "";
    const { data: existing } = await admin.from("profiles").select("id").ilike("email", email).limit(1).maybeSingle();
    if (existing) buyerId = existing.id;
    else {
      const { data: created, error } = await admin.auth.admin.createUser({ email, email_confirm: true, password: crypto.randomUUID() + "Aa1!", user_metadata: { full_name: name, phone: phone ? "+258" + phone : null, country: "MZ" } });
      if (error || !created?.user) throw new ApiError(400, "customer_error", error?.message || "Não foi possível criar a conta do cliente");
      buyerId = created.user.id;
      await admin.auth.resetPasswordForEmail(email, { redirectTo: `${site}/#/nova-senha` }).catch(() => null);
    }
    if (buyerId === uid) throw new ApiError(400, "invalid_customer", "O cliente não pode ser o próprio produtor");
    const { data: created, error: oErr } = await admin.rpc("api_create_order", { _buyer: buyerId, _course: productId, _method: method === "manual" ? "mpesa" : method, _phone: phone || null, _coupon: b.coupon_code ? String(b.coupon_code) : null, _affiliate: b.affiliate_code ? String(b.affiliate_code) : null });
    if (oErr) throw new ApiError(400, "order_error", oErr.message);
    const { data: o } = await admin.from("orders").select(ORDER_COLS).eq("id", (created as any).id).maybeSingle();
    const payment = method !== "manual" && b.push !== false && Number(o.amount_mzn) > 0 ? await pushPayment(o, site) : { mode: "manual", checkout_url: `${site}/#/checkout/${productId}` };
    return json({ data: { order: await shapeOrder(o, site, true), payment } }, 201);
  }
  throw new ApiError(404, "not_found", `Rota desconhecida: ${m} ${path}`);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  const url = new URL(req.url);
  try {
    if (url.searchParams.get("action") === "dispatch") {
      if (req.method !== "POST") return fail(405, "method_not_allowed", "Método inválido");
      const ok = await admin.rpc("notify_secret_ok", { _s: req.headers.get("x-notify-secret") || "" });
      if (!ok.data) return fail(401, "unauthorized", "Não autorizado");
      const b = await req.json().catch(() => ({}));
      if (!UUID.test(String(b.order_id || "")) || !/^order\.(paid|refunded|cancelled)$/.test(String(b.event || ""))) return fail(400, "invalid", "Evento inválido");
      return json(await dispatch(String(b.order_id), String(b.event)));
    }
    const path = url.pathname.replace(/^\/api/, "").replace(/\/+$/, "") || "/";
    const key = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
    if (!key) return fail(401, "unauthorized", "Falta a chave de API: cabeçalho Authorization: Bearer uq_live_…");
    const { data: who } = await admin.rpc("api_auth", { _key: key });
    if (!who) return fail(401, "unauthorized", "Chave de API inválida ou revogada");
    const since = new Date(Date.now() - 60_000).toISOString();
    const { count } = await admin.from("api_requests").select("id", { count: "exact", head: true }).eq("key_id", who.key_id).gte("at", since);
    if ((count || 0) >= 120) return fail(429, "rate_limited", "Limite de 120 pedidos por minuto por chave");
    let res: Response;
    try { res = await route(req, path, String(who.user_id)); }
    catch (e) { if (e instanceof ApiError) res = fail(e.status, e.code, e.message); else { console.error(e); res = fail(500, "internal", "Erro interno. Tenta novamente."); } }
    await admin.from("api_requests").insert({ key_id: who.key_id, path: `${req.method} ${path}`.slice(0, 120), status: res.status });
    return res;
  } catch (e) {
    console.error(e);
    return fail(500, "internal", "Erro interno. Tenta novamente.");
  }
});
