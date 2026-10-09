// Pixels de anúncios (Meta, TikTok, Google). Os IDs vêm das Definições (chave «tracking»),
// por isso o administrador liga ou troca um pixel sem publicar o site de novo.
// Cada produtor pode ainda ter o seu pixel do Meta no produto: recebe só os eventos desse produto.
import { state, usdRate } from "./ui.js?v=202610080932";

const ok = (v, re) => (typeof v === "string" && re.test(v.trim()) ? v.trim() : "");
let cfg = null, lastPage = null;
const prodPixels = new Set();

function load(src) {
  const s = document.createElement("script");
  s.async = true; s.src = src; document.head.appendChild(s);
}

export function initTracking() {
  const t = state.settings.tracking || {};
  cfg = {
    meta: ok(t.meta_pixel, /^\d{10,20}$/),
    tiktok: ok(t.tiktok_pixel, /^[A-Z0-9]{10,30}$/i),
    ga: ok(t.ga4, /^G-[A-Z0-9]{4,20}$/i),
  };
  if (cfg.meta || prodPixels.size) metaBase();
  if (cfg.meta) window.fbq("init", cfg.meta);
  if (cfg.tiktok) {
    const w = window, d = "ttq"; w.TiktokAnalyticsObject = d;
    const q = (w[d] = w[d] || []);
    q.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    q.setAndDefer = (o, m) => { o[m] = (...a) => o.push([m, ...a]); };
    q.methods.forEach((m) => q.setAndDefer(q, m));
    q.load = (id) => { q._i = q._i || {}; q._i[id] = []; q._t = q._t || {}; q._t[id] = +new Date(); load(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${encodeURIComponent(id)}&lib=${d}`); };
    q.load(cfg.tiktok);
  }
  if (cfg.ga) {
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag("js", new Date());
    window.gtag("config", cfg.ga, { send_page_view: false });
    load(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(cfg.ga)}`);
  }
}

function metaBase() {
  if (window.fbq) return;
  const n = (window.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); });
  if (!window._fbq) window._fbq = n;
  n.push = n; n.loaded = true; n.version = "2.0"; n.queue = [];
  load("https://connect.facebook.net/en_US/fbevents.js");
}

// Valor sempre em USD (moeda aceite por todas as plataformas de anúncios)
const usd = (mzn) => Math.round((Number(mzn || 0) / (usdRate() || 64)) * 100) / 100;

function send(meta, tt, ga, data, extraPixel) {
  if (!cfg) return;
  try {
    if (cfg.meta && meta) window.fbq("trackSingle", cfg.meta, meta, data);
    if (extraPixel && meta) window.fbq("trackSingle", extraPixel, meta, data);
    if (cfg.tiktok && tt) window.ttq.track(tt, data ? { content_id: data.content_ids?.[0], content_type: "product", value: data.value, currency: data.currency } : undefined);
    if (cfg.ga && ga) window.gtag("event", ga, data ? { currency: data.currency, value: data.value, items: (data.content_ids || []).map((id) => ({ item_id: id, item_name: data.content_name })) } : {});
  } catch (e) { console.warn("pixel", e); }
}

// Pixel do produtor (só no produto dele)
function producerPixel(course) {
  const id = ok(course?.meta_pixel_id, /^\d{10,20}$/);
  if (!id) return "";
  metaBase();
  if (!prodPixels.has(id)) { prodPixels.add(id); window.fbq("init", id); }
  return id;
}

const product = (c, valueMzn) => ({ content_ids: [String(c.id)], content_name: String(c.title || "").slice(0, 100), content_type: "product", value: usd(valueMzn ?? c.price_mzn), currency: "USD" });

export function pageView() {
  if (!cfg || location.hash === lastPage) return;
  lastPage = location.hash;
  if (cfg.meta) window.fbq("trackSingle", cfg.meta, "PageView");
  if (cfg.tiktok) window.ttq.page();
  if (cfg.ga) window.gtag("event", "page_view", { page_location: location.href, page_title: document.title });
}
export function viewContent(c) {
  const px = producerPixel(c);
  if (px) window.fbq("trackSingle", px, "PageView");
  send("ViewContent", "ViewContent", "view_item", product(c), px);
}
export function initiateCheckout(c, valueMzn) {
  send("InitiateCheckout", "InitiateCheckout", "begin_checkout", product(c, valueMzn), producerPixel(c));
}
// Compra: só uma vez por pedido (mesmo que a página seja aberta de novo)
export function purchase(order, course) {
  if (!order || !course) return;
  const key = "uq_px_" + order.id;
  try { if (localStorage.getItem(key)) return; localStorage.setItem(key, "1"); } catch {}
  send("Purchase", "CompletePayment", "purchase", { ...product(course, order.amount_mzn), order_id: String(order.reference || order.id) }, producerPixel(course));
}
export function registration() {
  send("CompleteRegistration", "CompleteRegistration", "sign_up", null);
}
