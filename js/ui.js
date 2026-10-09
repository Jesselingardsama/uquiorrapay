// Estado global, tradução, formatação e componentes reutilizáveis.
import { CONFIG } from "./config.js?v=202610080932";

const store = (() => {
  try { return window.localStorage; } catch { return null; }
})();
const saved = (k, d) => { try { return store?.getItem(k) || d; } catch { return d; } };
const save = (k, v) => { try { store?.setItem(k, v); } catch {} };

export const state = {
  session: null,
  user: null,
  profile: null,
  roles: [],
  settings: { rates: { MZN: 1, USD: 64, BRL: 11.5, ZAR: 3.6, EUR: 72 }, commission_pct: 10, guarantee_days: 3 },
  lang: saved("uq_lang", "pt"),
  currency: saved("uq_cur", "MZN"),
  country: "",
  // a pessoa escolheu a língua/moeda à mão (não mudamos automaticamente)
  langChosen: Boolean(saved("uq_lang", "")),
  curChosen: Boolean(saved("uq_cur", "")),
};

// ---------- Localização automática (país pelo IP) ----------
const PT_COUNTRIES = ["MZ", "PT", "BR", "AO", "CV", "GW", "ST", "TL", "MO", "GQ"];
const EUR_COUNTRIES = ["PT", "ES", "FR", "DE", "IT", "NL", "BE", "LU", "IE", "AT", "FI", "GR", "SK", "SI", "EE", "LV", "LT", "MT", "CY", "HR"];
export const langForCountry = (cc) => (PT_COUNTRIES.includes(cc) ? "pt" : "en");
export const curForCountry = (cc) => (cc === "MZ" ? "MZN" : cc === "BR" ? "BRL" : cc === "ZA" ? "ZAR" : EUR_COUNTRIES.includes(cc) ? "EUR" : "USD");
export const isLocalBuyer = () => state.currency === "MZN";
async function geoCountry() {
  try { const c = sessionStorage.getItem("uq_cc"); if (c) return c; } catch {}
  try {
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 1500);
    const r = await fetch("/api/geo", { signal: ctl.signal, cache: "no-store" }); clearTimeout(t);
    const d = r.ok ? await r.json() : {};
    const cc = /^[A-Z]{2}$/.test(d.country || "") && d.country !== "XX" && d.country !== "T1" ? d.country : "";
    if (cc) { try { sessionStorage.setItem("uq_cc", cc); } catch {} }
    return cc;
  } catch { return ""; }
}
// Escolhe língua e moeda pelo país do visitante (só se a pessoa ainda não escolheu à mão)
export async function initLocale() {
  const cc = await geoCountry();
  state.country = cc;
  const nav = String(navigator.language || "").toLowerCase();
  if (!state.langChosen) state.lang = cc ? langForCountry(cc) : nav.startsWith("pt") ? "pt" : nav ? "en" : "pt";
  if (!state.curChosen) state.currency = cc ? curForCountry(cc) : state.lang === "pt" ? "MZN" : "USD";
  document.documentElement.lang = state.lang;
}

export const isProducer = () => state.roles.includes("producer") || state.roles.includes("admin");
export const isAdmin = () => state.roles.includes("admin");
// Suporte ao comprador completo (WhatsApp + email) — obrigatório para vender
export const supportOk = (c) => String(c?.support_whatsapp || "").replace(/\D/g, "").length >= 9 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(c?.support_email || "").trim());
export const gDays = () => Number(state.settings.guarantee_days ?? 3);

export function setLang(l, manual = true) { state.lang = l; if (manual) { save("uq_lang", l); state.langChosen = true; } document.documentElement.lang = l; }
export function setCurrency(c) { state.currency = c; save("uq_cur", c); state.curChosen = true; }

// Texto bilingue: tr("Português", "English")
export const tr = (pt, en) => (state.lang === "en" && en != null ? en : pt);

// Escapar HTML
export function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

const NF = (lang, min = 0, max = 0) => new Intl.NumberFormat(lang === "en" ? "en-US" : "pt-PT", { minimumFractionDigits: min, maximumFractionDigits: max });

export function mzn(v) {
  return `${Math.round(Number(v || 0)).toLocaleString("en-US").replace(/,/g, "\u00a0")}\u00a0MZN`;
}
export function convert(vMzn, cur = state.currency) {
  const rate = Number(state.settings.rates?.[cur] || 1);
  return Number(vMzn || 0) / rate;
}
const SYMBOL = { USD: "$", BRL: "R$", ZAR: "R", EUR: "€" };
export function money(vMzn, cur = state.currency) {
  if (cur === "MZN") return mzn(vMzn);
  const v = convert(vMzn, cur);
  return `${SYMBOL[cur] || ""}${NF(state.lang, 2, 2).format(v)} ${cur}`;
}
// Preço principal em MZN + equivalente na moeda escolhida
export function priceHTML(vMzn, cls = "") {
  if (Number(vMzn) === 0) return `<span class="price ${cls}">${tr("Grátis", "Free")}</span>`;
  const alt = state.currency !== "MZN" ? `<small>≈ ${esc(money(vMzn))}</small>` : "";
  return `<span class="price ${cls}">${esc(mzn(vMzn))}${alt}</span>`;
}
// Preço com preço «de» riscado (oferta). Só mostra o riscado se for maior que o preço actual
// Endereço oficial do site (o domínio pago) para links partilhados: checkout, página de venda, afiliados, cupões
export const siteUrl = () => {
  const u = typeof state.settings?.site_url === "string" && /^https:\/\/[a-z0-9.-]+$/i.test(state.settings.site_url.replace(/\/+$/, "")) ? state.settings.site_url.replace(/\/+$/, "") : "https://uquiorrapay.com";
  return u + "/";
};
// Preço internacional (USD): o definido pelo produtor ou, se não houver, o equivalente ao câmbio
export const usdRate = () => Number(state.settings?.rates?.USD || 64);
export const intlPrice = (c, pctOff = 0) => {
  const base = Number(c?.price_usd) >= 1 ? Number(c.price_usd) : Number(c?.price_mzn || 0) / usdRate();
  return Math.round(base * (100 - pctOff)) / 100;
};
export const usdFmt = (v) => `$${state.lang === "en" ? Number(v).toFixed(2) : Number(v).toFixed(2).replace(".", ",")} USD`;
export const hasStrike = (c) => Number(c?.compare_price_mzn) > Number(c?.price_mzn) && Number(c?.price_mzn) > 0;
// Preço do produto na moeda do visitante: em MZN mostra o preço nacional; noutras moedas, o preço internacional (USD) convertido
export function curPrice(c, cur = state.currency) {
  if (cur === "MZN") return mzn(c.price_mzn);
  const usd = intlPrice(c);
  if (cur === "USD") return `$${NF(state.lang, 2, 2).format(usd)} USD`;
  const v = (usd * usdRate()) / Number(state.settings.rates?.[cur] || usdRate());
  return `${SYMBOL[cur] || ""}${NF(state.lang, 2, 2).format(v)} ${cur}`;
}
export function offerPriceHTML(c, cls = "") {
  if (state.currency !== "MZN" && Number(c?.price_mzn) > 0) {
    const ratio = hasStrike(c) ? Number(c.compare_price_mzn) / Number(c.price_mzn) : 0;
    const off = ratio ? Math.round((1 - 1 / ratio) * 100) : 0;
    const strike = ratio ? `<s>${esc(curPrice({ price_mzn: c.compare_price_mzn, price_usd: Math.round(intlPrice(c) * ratio * 100) / 100 }))}</s>` : "";
    return `<span class="offer-price ${cls}">${strike}<span class="price ${cls}">${esc(curPrice(c))}</span>${off >= 1 ? `<em class="off-badge">−${off}%</em>` : ""}</span>`;
  }
  if (!hasStrike(c)) return priceHTML(c.price_mzn, cls);
  const off = Math.round((1 - Number(c.price_mzn) / Number(c.compare_price_mzn)) * 100);
  return `<span class="offer-price ${cls}"><s>${esc(mzn(c.compare_price_mzn))}</s>${priceHTML(c.price_mzn, cls)}${off >= 1 ? `<em class="off-badge">−${off}%</em>` : ""}</span>`;
}
export const cleanBonuses = (b) => (Array.isArray(b) ? b : []).filter((x) => x && String(x.title || "").trim()).slice(0, 10);
export function dateTime(v) {
  if (!v) return "—";
  return new Date(v).toLocaleString(state.lang === "en" ? "en-GB" : "pt-PT", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
export function date(v) {
  if (!v) return "—";
  return new Date(v).toLocaleDateString(state.lang === "en" ? "en-GB" : "pt-PT", { day: "2-digit", month: "short", year: "numeric" });
}

export const langLabel = (l) => (l === "en" ? "English" : "Português");
export const statusLabel = (s, kind) => (kind === "order" && s === "pending" ? tr("Por pagar", "Awaiting payment") : null) || (kind === "wd" && s === "pending" ? tr("Em processamento", "Processing") : null) || ({
  draft: tr("Rascunho", "Draft"), pending: tr("Em revisão", "In review"), approved: tr("Aprovado", "Approved"),
  rejected: tr("Rejeitado", "Rejected"), paid: tr("Pago", "Paid"), cancelled: tr("Cancelado", "Cancelled"),
  refunded: tr("Reembolsado", "Refunded"),
}[s] || s);
export const statusBadge = (s, kind) => `<span class="badge st-${esc(s)}">${esc(statusLabel(s, kind))}</span>`;
export const methodLabel = (m) => ({ mpesa: "M-Pesa", emola: "e-Mola", paypal: "PayPal", bank: tr("Banco", "Bank") }[m] || m);

// ---------- Fotografias (Unsplash, licença gratuita) ----------
export const photo = (id, w = 900) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=${w}&q=70`;
export const PHOTOS = {
  hero: "1697383904932-94304530a3dd",      // mulher sorridente com telemóvel
  search: "1677935711525-1059c0cb9b44",    // mulher a apontar para o telemóvel, fundo amarelo
  producer: "1765648684644-cdda3340263f",  // produtora a rir com o portátil (vertical)
  producer2: "1653565685060-e15e492a7fda",
  learners: "1655720348593-8ff1d2086dc8",
  man: "1576814547952-f8531781d7ef",       // homem com telemóvel
};
export const CAT_PHOTOS = {
  "Negócios": "1655720357872-ce227e4164ba",
  "Marketing": "1611926653458-09294b3142bf",
  "Tecnologia": "1555066931-4365d14bab8c",
  "Finanças": "1633158829585-23ba8f7c8caf",
  "Engenharia": "1621905251189-08b45d6a269e",
  "Design": "1626785774573-4b799315345d",
  "Idiomas": "1615473659687-d88fa647684b",
  "Desenvolvimento pessoal": "1627818653012-054f17eb0648",
  "Outros": "1655720348616-184ae7fad7e3",
  "Empreendedorismo digital": "1653565685060-e15e492a7fda",
  "Vendas": "1611926653458-09294b3142bf",
  "Direito": "1655720357872-ce227e4164ba",
  "Programação": "1555066931-4365d14bab8c",
  "Fotografia e vídeo": "1542038784456-1ea8e935640e",
  "Música e artes": "1510915361894-db8b60106cb1",
  "Saúde e fitness": "1635863872991-040c52b4cfbe",
  "Emagrecimento e dieta": "1512621776951-a57141f2eefd",
  "Nutrição": "1490645935967-10de6ba17061",
  "Desporto": "1571019613576-2b22c76fd955",
  "Beleza e estética": "1657563920440-0ac6d8932f20",
  "Moda": "1744371386847-ded3b4a66017",
  "Educação e concursos": "1655720348593-8ff1d2086dc8",
  "Relacionamentos e família": "1647616927583-1d44a79a38a5",
  "Espiritualidade": "1627818653012-054f17eb0648",
  "Culinária e gastronomia": "1687422808277-2334638f09fb",
  "Agricultura e pecuária": "1768775517205-7f4bc1b3f771",
  "Casa e construção": "1621905251189-08b45d6a269e",
};
export const catPhoto = (cat, w) => photo(CAT_PHOTOS[cat] || CAT_PHOTOS.Outros, w);
const CAT_EN = { "Negócios": "Business", "Empreendedorismo digital": "Digital entrepreneurship", "Marketing": "Marketing", "Vendas": "Sales", "Finanças": "Finance & investing", "Direito": "Law", "Tecnologia": "Technology", "Programação": "Programming", "Engenharia": "Engineering", "Design": "Design", "Fotografia e vídeo": "Photo & video", "Música e artes": "Music & arts", "Saúde e fitness": "Health & fitness", "Emagrecimento e dieta": "Weight loss & diet", "Nutrição": "Nutrition", "Desporto": "Sports", "Beleza e estética": "Beauty", "Moda": "Fashion", "Idiomas": "Languages", "Educação e concursos": "Education & exams", "Desenvolvimento pessoal": "Personal growth", "Relacionamentos e família": "Relationships & family", "Espiritualidade": "Spirituality", "Culinária e gastronomia": "Cooking & food", "Agricultura e pecuária": "Farming & livestock", "Casa e construção": "Home & building", "Animais e plantas": "Pets & plants", "Hobbies e lazer": "Hobbies & leisure", "Outros": "Other" };
export const catLabel = (c) => (state.lang === "en" ? CAT_EN[c] || c : c);
// Lista de categorias para <select>, agrupada
export const catOptions = (cur = "", placeholder = "") => `${placeholder ? `<option value="">${esc(placeholder)}</option>` : ""}${CONFIG.CATEGORY_GROUPS.map(([gpt, gen, list]) => `<optgroup label="${esc(tr(gpt, gen))}">${list.map((c) => `<option value="${esc(c)}" ${c === cur ? "selected" : ""}>${esc(catLabel(c))}</option>`).join("")}</optgroup>`).join("")}`;

// Capa: imagem do produtor ou fotografia da categoria com o título por cima
const COVER_TONES = [["#0F5132", "#1E7A4F"], ["#0A3A24", "#2F6B4F"], ["#1B4D3E", "#C98B00"], ["#123D2B", "#3B7D5C"]];
export function coverHTML(course, cls = "") {
  if (course.cover_url) return `<div class="cover ${cls}"><img src="${esc(course.cover_url)}" alt="" loading="lazy"></div>`;
  let n = 0; for (const ch of String(course.id || course.title)) n = (n + ch.charCodeAt(0)) % 997;
  const [a, b] = COVER_TONES[n % COVER_TONES.length];
  return `<div class="cover gen ${cls}" style="--a:${a};--b:${b}">
    <img class="cover-ph" src="${esc(catPhoto(course.category, 640))}" alt="" loading="lazy" data-fallback>
    <span class="cover-cat">${esc(catLabel(course.category || ""))}</span>
    <span class="cover-title">${esc(course.title)}</span>
  </div>`;
}

// Tipos de produto
export const TYPES = ["curso", "ebook", "template", "audio"];
export const typeLabel = (t) => ({ curso: tr("Curso", "Course"), ebook: "Ebook", template: "Template", audio: tr("Áudio", "Audio") }[t] || tr("Curso", "Course"));
export const unitLabel = (t, n) => {
  const u = { curso: [tr("aula", "lesson"), tr("aulas", "lessons")], ebook: [tr("capítulo", "chapter"), tr("capítulos", "chapters")], template: [tr("ficheiro", "file"), tr("ficheiros", "files")], audio: [tr("episódio", "episode"), tr("episódios", "episodes")] }[t || "curso"] || [tr("aula", "lesson"), tr("aulas", "lessons")];
  return `${n} ${n === 1 ? u[0] : u[1]}`;
};

// Cartão de produto (modelo: imagem escura, etiqueta do tipo, categoria, preço e «Ver mais»)
// Produto com destaque pago a decorrer
export const isSponsored = (c) => Boolean(c?.sponsored_until && new Date(c.sponsored_until) > new Date());
export function courseCard(c, counts = {}, opts = {}) {
  const n = counts[c.id];
  const sp = opts.sponsored && isSponsored(c);
  return `<a class="card pcard${sp ? " sp" : ""}" href="#/curso/${esc(c.id)}"${sp ? ` data-sp="${esc(c.id)}"` : ""}>
    <div class="pcard-img">
      <img src="${esc(c.cover_url || catPhoto(c.category, 640))}" alt="" loading="lazy" data-fallback>
      <span class="pc-type">${esc(typeLabel(c.product_type))}</span>${sp ? `<span class="pc-sp">${tr("Patrocinado", "Sponsored")}</span>` : ""}
      <span class="pc-cat">${esc(catLabel(c.category || ""))}</span>
    </div>
    <div class="pcard-body">
      <h3>${esc(c.title)}</h3>
      ${c.subtitle ? `<p class="pc-sub clamp2">${esc(c.subtitle)}</p>` : ""}
      <div class="pc-meta">${n ? `<span>${esc(unitLabel(c.product_type, n))}</span>` : ""}<span>${esc(langLabel(c.language))}</span></div>
      <div class="pc-foot">
        <div><small>${esc(c.producer_name || "")}</small>${offerPriceHTML(c)}</div>
        <span class="btn btn-primary btn-sm">${tr("Ver mais", "See more")}</span>
      </div>
    </div>
  </a>`;
}
const ICON_ARROW = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`;

// ---------- Área interna (menu lateral estilo Hotmart) ----------
// Cada grupo: [chave, ícone, rótulo, itens[[chave, link, rótulo]]] ou ligação simples
// Menu só de administração (a conta de admin não vê menus de produtor/afiliado)
function adminMenu() {
  const n = state.adminCounts || {};
  const badge = (x) => (x ? ` <em class="am-badge">${x}</em>` : "");
  return [
    { k: "admin-resumo", ic: ICON.home, label: tr("Resumo", "Overview"), href: "#/admin" },
    { k: "admin-revisao", ic: ICON.list, label: tr("Revisão de produtos", "Product review") + badge(n.courses), href: "#/admin/revisao" },
    { k: "admin-pedidos", ic: ICON.cash, label: tr("Pagamentos", "Payments") + badge(n.orders), href: "#/admin/pedidos" },
    { k: "admin-levantamentos", ic: ICON.wallet, label: tr("Levantamentos", "Withdrawals") + badge(n.withdrawals), href: "#/admin/levantamentos" },
    { k: "admin-anuncios", ic: ICON.trend, label: tr("Anúncios", "Ads") + badge(n.boosts), href: "#/admin/anuncios" },
    { k: "admin-verificacoes", ic: ICON.idcard, label: tr("Verificação de identidade", "Identity checks") + badge(n.kyc), href: "#/admin/verificacoes" },
    { k: "admin-cursos", ic: ICON.box, label: tr("Todos os produtos", "All products"), href: "#/admin/cursos" },
    { k: "admin-utilizadores", ic: ICON.users, label: tr("Utilizadores", "Users"), href: "#/admin/utilizadores" },
    { k: "admin-definicoes", ic: ICON.edit, label: tr("Definições", "Settings"), href: "#/admin/definicoes" },
    { k: "admin-seguranca", ic: ICON.lock, label: tr("Registo de segurança", "Security log"), href: "#/admin/seguranca" },
    { k: "seguranca", ic: ICON.shield, label: tr("A minha conta", "My account"), href: "#/seguranca" },
  ];
}
export function appMenu() {
  if (state.roles.includes("admin")) return adminMenu();
  const prod = state.roles.includes("producer") || state.roles.includes("admin");
  const m = [
    { k: "painel", ic: ICON.home, label: tr("Início", "Home"), href: "#/painel" },
    { g: "produtos", ic: ICON.box, label: tr("Produtos", "Products"), items: [
      ["produtos", "#/produtor", tr("Os meus produtos", "My products")],
      ["criar", prod ? "#/produtor/curso/novo" : "#/ser-produtor", tr("Criar produto", "Create product")],
      ["cursos", "#/meus-cursos", tr("Área de membros (compras)", "Members area (purchases)")],
      ["afiliar", "#/afiliados", tr("Afiliar-me a um produto", "Affiliate to a product")],
    ] },
    { g: "vendas", ic: ICON.trend, label: tr("Vendas", "Sales"), items: [
      ["vendas", "#/produtor/vendas", tr("Gestão de vendas", "Sales management")],
      ["af-vendas", "#/afiliados?t=vendas", tr("Vendas como afiliado", "Affiliate sales")],
    ] },
    { g: "carteira", ic: ICON.wallet, label: tr("Carteira", "Wallet"), items: [
      ["carteira", "#/carteira", tr("Saldo", "Balance")],
      ["extrato", "#/carteira/extrato", tr("Extrato", "Statement")],
      ["levantamentos", "#/carteira/levantamentos", tr("Levantamentos", "Withdrawals")],
    ] },
    { g: "parcerias", ic: ICON.link, label: tr("Afiliados", "Affiliates"), items: [
      ["mercado", "#/afiliados", tr("Produtos para promover", "Products to promote")],
      ["links", "#/afiliados?t=links", tr("Os meus links", "My links")],
    ] },
    { k: "perfil", ic: ICON.user, label: tr("Dados pessoais", "Personal details"), href: "#/perfil" },
    { k: "verificacao", ic: ICON.idcard, label: tr("Verificação de identidade", "Identity verification"), href: "#/verificacao" },
    { k: "seguranca", ic: ICON.shield, label: tr("Segurança", "Security"), href: "#/seguranca" },
  ];
  return m;
}

// Chave do item activo no menu interno a partir da rota
export function activeKey() {
  const raw = location.hash.replace(/^#/, "") || "/";
  const [path, qs] = raw.split("?");
  const q = new URLSearchParams(qs || "");
  if (path === "/painel") return "painel";
  if (path === "/produtor/vendas") return "vendas";
  if (path === "/produtor/curso/novo") return "criar";
  if (path.startsWith("/produtor")) return "produtos";
  if (path === "/meus-cursos") return "cursos";
  if (path === "/carteira") return "carteira";
  if (path.startsWith("/carteira/")) return path.split("/")[2];
  if (path === "/afiliados") return q.get("t") === "links" ? "links" : q.get("t") === "vendas" ? "af-vendas" : "mercado";
  if (path === "/perfil") return state.roles.includes("admin") ? "seguranca" : "perfil";
  if (path === "/seguranca") return "seguranca";
  if (path === "/verificacao") return "verificacao";
  if (path.startsWith("/admin")) return "admin-" + (path.split("/")[2] || "resumo");
  return "";
}

export function appMenuHTML(active) {
  return appMenu().map((x) => {
    if (x.href) return `<a class="am-link ${x.k === active ? "on" : ""}" href="${x.href}">${x.ic}<span>${x.label}</span></a>`;
    const open = x.items.some((i) => i[0] === active);
    return `<details class="am-group" ${open ? "open" : ""}><summary>${x.ic}<span>${x.label}</span>${ICON.down}</summary>
      ${x.items.map(([k, href, l]) => `<a class="${k === active ? "on" : ""}" href="${href}">${l}</a>`).join("")}</details>`;
  }).join("");
}

export function dashShell(active, inner) {
  active = activeKey() || active;
  const p = state.profile || {};
  const name = p.full_name || state.user?.email || "";
  const role = state.roles.includes("admin") ? tr("Administrador", "Administrator") : state.roles.includes("producer") ? tr("Produtor", "Creator") : tr("Conta pessoal", "Personal account");
  return `<section class="app dk">
    <aside class="app-side">
      <div class="side-me"><span class="side-av">${esc((name || "U").trim().charAt(0).toUpperCase())}</span><div><b>${esc(name.split(" ").slice(0, 2).join(" "))}</b><small>${role}</small></div></div>
      <small class="side-lbl">${tr("Painel", "Dashboard")}</small>
      <nav>${appMenuHTML(active)}</nav>
    </aside>
    <div class="app-main">${inner}</div>
  </section>`;
}

// ---------- Gráficos do painel (SVG feito à mão, sem bibliotecas) ----------
// Anel com partes (ex.: vendas por produto)
export function donutSVG(parts, center, sub) {
  const tot = parts.reduce((a, p) => a + p.v, 0);
  const R = 52, C = 2 * Math.PI * R;
  let off = 0;
  const arcs = tot ? parts.filter((p) => p.v > 0).map((p) => {
    const len = (p.v / tot) * C, gap = parts.length > 1 ? 3 : 0;
    const s = `<circle r="${R}" cx="70" cy="70" fill="none" stroke="${p.c}" stroke-width="18" stroke-dasharray="${Math.max(0, len - gap)} ${C}" stroke-dashoffset="${-off}" transform="rotate(-90 70 70)"/>`;
    off += len; return s;
  }).join("") : "";
  return `<svg class="donut" viewBox="0 0 140 140" role="img" aria-label="${esc(center)} ${esc(sub)}"><circle r="${R}" cx="70" cy="70" fill="none" stroke="var(--d-line)" stroke-width="18"/>${arcs}
    <text x="70" y="68" text-anchor="middle" class="dn-n">${esc(center)}</text><text x="70" y="86" text-anchor="middle" class="dn-s">${esc(sub)}</text></svg>`;
}
// Área com linha (ex.: ganhos por dia nos últimos 30 dias)
export function areaSVG(vals, { w = 420, h = 150, id = "ar" } = {}) {
  const max = Math.max(1, ...vals), n = vals.length;
  const x = (i) => (n < 2 ? 0 : (i / (n - 1)) * w), y = (v) => h - 8 - (v / max) * (h - 26);
  const pts = vals.map((v, i) => [x(i), y(v)]);
  // curva suave (Catmull-Rom → Bézier)
  const d = pts.map((p, i) => {
    if (!i) return `M${p[0].toFixed(1)},${p[1].toFixed(1)}`;
    const p0 = pts[i - 2] || pts[i - 1], p1 = pts[i - 1], p3 = pts[i + 1] || p;
    const c1 = [p1[0] + (p[0] - p0[0]) / 6, p1[1] + (p[1] - p0[1]) / 6], c2 = [p[0] - (p3[0] - p1[0]) / 6, p[1] - (p3[1] - p1[1]) / 6];
    return `C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p[0].toFixed(1)},${p[1].toFixed(1)}`;
  }).join("");
  const last = pts[pts.length - 1] || [0, h];
  return `<svg class="area" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-hidden="true">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="var(--gold)" stop-opacity=".45"/><stop offset="1" stop-color="var(--gold)" stop-opacity="0"/></linearGradient></defs>
    ${[0.25, 0.5, 0.75].map((f) => `<line x1="0" x2="${w}" y1="${(h * f).toFixed(1)}" y2="${(h * f).toFixed(1)}" class="ar-grid"/>`).join("")}
    <path d="${d} L${w},${h} L0,${h} Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="var(--gold)" stroke-width="2.4" vector-effect="non-scaling-stroke"/>
    <circle cx="${last[0]}" cy="${last[1]}" r="4" fill="var(--gold)" class="ar-dot"/></svg>`;
}
// Meio anel de progresso (ex.: meta de vendas)
export function gaugeSVG(pct) {
  const p = Math.max(0, Math.min(1, pct)), L = Math.PI * 40;
  return `<svg class="gauge" viewBox="0 0 100 58" aria-hidden="true"><path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke="var(--d-line)" stroke-width="10" stroke-linecap="round"/>
    <path d="M10 52 A40 40 0 0 1 90 52" fill="none" stroke="var(--gold)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${(p * L).toFixed(1)} ${L}"/></svg>`;
}
// Série diária dos últimos N dias a partir de registos com data e valor
export function dailySeries(rows, days, dateKey, valFn) {
  const out = Array(days).fill(0), t0 = new Date(); t0.setHours(0, 0, 0, 0);
  const start = t0.getTime() - (days - 1) * 864e5;
  for (const r of rows) {
    const t = new Date(r[dateKey] || r.created_at).getTime(); if (!(t >= start)) continue;
    const i = Math.floor((t - start) / 864e5); if (i >= 0 && i < days) out[i] += valFn(r);
  }
  return out;
}
// Variação em % face ao período anterior (texto + seta)
export function deltaHTML(cur, prev, label) {
  if (!prev && !cur) return `<small class="kpi-d">— ${label}</small>`;
  const pct = prev ? ((cur - prev) / prev) * 100 : 100, up = pct >= 0;
  return `<small class="kpi-d ${up ? "up" : "down"}">${up ? ICON.trend : "↘"} ${Math.abs(pct).toFixed(1).replace(".", state.lang === "pt" ? "," : ".")}% <span>${label}</span></small>`;
}

export async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast(tr("Copiado!", "Copied!")); }
  catch { prompt(tr("Copia o texto:", "Copy the text:"), text); }
}

// Código de afiliado guardado por curso (válido 30 dias)
export function saveRef(courseId, code) {
  try { store?.setItem(`uq_ref_${courseId}`, JSON.stringify({ code: String(code).toUpperCase().slice(0, 20), t: Date.now() })); } catch {}
}
export function getRef(courseId) {
  try {
    const v = JSON.parse(store?.getItem(`uq_ref_${courseId}`) || "null");
    if (v && Date.now() - v.t < 30 * 864e5) return v.code;
  } catch {}
  return null;
}

// Vídeo: YouTube, Vimeo, Google Drive ou ficheiro directo
// Só aceita endereços http(s) — bloqueia links "javascript:" e outros perigosos
export const safeUrl = (u) => { try { const x = new URL(String(u)); return x.protocol === "https:" || x.protocol === "http:" ? x.href : null; } catch { return null; } };
export function videoEmbed(url) {
  url = safeUrl(url);
  if (!url) return `<div class="video-empty">${tr("Esta aula ainda não tem vídeo.", "This lesson has no video yet.")}</div>`;
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,})/)))
    return `<iframe src="https://www.youtube-nocookie.com/embed/${m[1]}?rel=0" allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen></iframe>`;
  if ((m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)))
    return `<iframe src="https://player.vimeo.com/video/${m[1]}" allow="fullscreen; picture-in-picture" allowfullscreen></iframe>`;
  if ((m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/)))
    return `<iframe src="https://drive.google.com/file/d/${m[1]}/preview" allow="fullscreen" allowfullscreen></iframe>`;
  if (/\.(mp3|m4a|aac|wav|oga)(\?|$)/i.test(url)) return `<div class="audio-wrap"><audio src="${esc(url)}" controls preload="metadata"></audio></div>`;
  if (/\.(mp4|webm|ogg)(\?|$)/i.test(url)) return `<video src="${esc(url)}" controls playsinline preload="metadata"></video>`;
  return `<div class="video-empty"><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">${tr("Abrir vídeo", "Open video")}</a></div>`;
}

// ---------- Avisos e janelas ----------
export function toast(msg, kind = "ok") {
  let box = document.getElementById("toasts");
  if (!box) { box = document.createElement("div"); box.id = "toasts"; document.body.appendChild(box); }
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  box.appendChild(el);
  setTimeout(() => el.classList.add("out"), 3600);
  setTimeout(() => el.remove(), 4200);
}

export function modal({ title, body = "", input = null, confirm = tr("Confirmar", "Confirm"), danger = false, value = "" }) {
  return new Promise((resolve) => {
    const wrap = document.createElement("div");
    wrap.className = "modal-wrap";
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <h3>${esc(title)}</h3>
      ${body ? `<p class="muted">${esc(body)}</p>` : ""}
      ${input ? `<textarea class="input" rows="3" placeholder="${esc(input)}">${esc(value)}</textarea>` : ""}
      <div class="modal-actions">
        <button class="btn btn-ghost-dark" data-x="0">${tr("Cancelar", "Cancel")}</button>
        <button class="btn ${danger ? "btn-danger" : "btn-primary"}" data-x="1">${esc(confirm)}</button>
      </div></div>`;
    document.body.appendChild(wrap);
    const ta = wrap.querySelector("textarea");
    ta?.focus();
    wrap.addEventListener("click", (e) => {
      const b = e.target.closest("[data-x]");
      if (!b && e.target !== wrap) return;
      const yes = b?.dataset.x === "1";
      if (yes && input && !ta.value.trim()) { ta.classList.add("err"); return; }
      wrap.remove();
      resolve(yes ? (input ? ta.value.trim() : true) : null);
    });
  });
}

export function loading() {
  return `<div class="loading"><span></span><span></span><span></span></div>`;
}
export function emptyState(title, text = "", action = "") {
  return `<div class="empty"><div class="empty-ic"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6"/></svg></div><h3>${esc(title)}</h3>${text ? `<p class="muted">${esc(text)}</p>` : ""}${action}</div>`;
}
export function errorBox(err) {
  return `<div class="alert alert-err">${esc(err?.message || err)}</div>`;
}

// Ícones
export const ICON = {
  idcard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M6 16c.6-1.5 1.7-2 3-2s2.4.5 3 2M14 10h4M14 13h3"/></svg>`,
  check: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3 3 7-7"/></svg>`,
  arrow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/></svg>`,
  chev: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>`,
  play: `<svg viewBox="0 0 24 24"><path d="M7 4.5l12 7.5-12 7.5z" fill="currentColor"/></svg>`,
  clock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`,
  doc: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>`,
  lock: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>`,
  trend: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>`,
  bag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 7h12l-1 13H7z"/><path d="M9 7a3 3 0 0 1 6 0"/></svg>`,
  plus: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>`,
  up: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15l6-6 6 6"/></svg>`,
  down: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>`,
  link: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/></svg>`,
  wallet: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7a2 2 0 0 1 2-2h11v4"/><rect x="4" y="9" width="16" height="11" rx="2"/><path d="M16 14.5h.01"/></svg>`,
  search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h8"/></svg>`,
  tag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8.5" r="1.5"/></svg>`,
  users: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c1-3.5 3.5-5.5 6.5-5.5s5.5 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5c2 .8 3.2 2.6 3.7 5.5"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M11 18h2"/></svg>`,
  whats: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2zm0 18.2c-1.5 0-3-.4-4.3-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.3.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.3-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3z"/></svg>`,
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/></svg>`,
  box: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10"/></svg>`,
  help: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14"/><path d="M12 17.5h.01"/></svg>`,
  list: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1"/><circle cx="4.5" cy="12" r="1"/><circle cx="4.5" cy="18" r="1"/></svg>`,
  cash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="6" width="19" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/></svg>`,
  edit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>`,
  gift: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="8" width="18" height="5" rx="1"/><path d="M5 13v8h14v-8M12 8v13M12 8S10.5 3.5 8 4.2C6 4.8 6.6 8 12 8zM12 8s1.5-4.5 4-3.8C18 4.8 17.4 8 12 8z"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  bolt: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4 14h7l-1 8 9-12h-7z"/></svg>`,
  cap: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/></svg>`,
};

export const LOGO_SVG = `<svg viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="50" fill="#F2A900"/><path d="M27 24 V54 A23 23 0 0 0 73 54 V24" fill="none" stroke="#0F5132" stroke-width="13" stroke-linecap="round"/><path d="M43 38 L62 50 L43 62 Z" fill="#0F5132" stroke="#0F5132" stroke-width="4" stroke-linejoin="round"/></svg>`;
export const brandHTML = (cls = "") => `<a class="brand ${cls}" href="#/">${LOGO_SVG}<span>Uquiorra<b>pay</b></span></a>`;

export { CONFIG };

// ---------- Painel de envios (barra de progresso de cada ficheiro) ----------
let upActive = 0;
window.addEventListener("beforeunload", (e) => { if (upActive > 0) { e.preventDefault(); e.returnValue = ""; } });
const fmtSize = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
export const uploadsActive = () => upActive;
export function trackUpload(name, size) {
  let box = document.getElementById("upq");
  if (!box) {
    box = document.createElement("div"); box.id = "upq"; box.setAttribute("role", "status"); box.setAttribute("aria-live", "polite");
    box.innerHTML = `<div class="upq-h"><b>${tr("Envios", "Uploads")}</b><button type="button" class="upq-x" aria-label="${tr("Fechar", "Close")}">×</button></div><div class="upq-list"></div>`;
    box.querySelector(".upq-x").onclick = () => { if (upActive === 0) box.remove(); else toast(tr("Espera que os envios terminem.", "Wait for uploads to finish."), "err"); };
    document.body.appendChild(box);
  }
  upActive++;
  const row = document.createElement("div");
  row.className = "upq-row";
  row.innerHTML = `<div class="upq-top"><span class="upq-name">${esc(name)}</span><span class="upq-pct">0%</span></div>
    <div class="upq-bar"><i style="width:0%"></i></div>
    <div class="upq-sub"><small class="upq-st">${tr("A preparar…", "Preparing…")} · ${esc(fmtSize(size || 0))}</small><button type="button" class="upq-cancel">${tr("Cancelar", "Cancel")}</button></div>`;
  box.querySelector(".upq-list").prepend(row);
  const bar = row.querySelector(".upq-bar i"), pct = row.querySelector(".upq-pct"), st = row.querySelector(".upq-st"), cancelBtn = row.querySelector(".upq-cancel");
  const t0 = Date.now();
  let abortFn = null, finished = false;
  cancelBtn.onclick = () => abortFn?.();
  const finish = () => { if (!finished) { finished = true; upActive = Math.max(0, upActive - 1); } };
  return {
    // usado como onProgress(fração, abort)
    progress(f, abort) {
      if (abort) abortFn = abort;
      const p = Math.max(0, Math.min(1, f || 0));
      bar.style.width = `${Math.round(p * 100)}%`; pct.textContent = `${Math.round(p * 100)}%`;
      const secs = (Date.now() - t0) / 1000;
      const left = p > 0.03 && p < 1 ? Math.round((secs / p) * (1 - p)) : null;
      st.textContent = p >= 1 ? tr("A guardar…", "Saving…") : `${tr("A carregar ficheiro…", "Uploading file…")} ${fmtSize((size || 0) * p)} / ${fmtSize(size || 0)}${left != null ? ` · ${tr("falta", "left")} ~${left > 90 ? Math.round(left / 60) + " min" : left + " s"}` : ""}`;
    },
    ok(msg) {
      finish(); row.classList.add("ok"); bar.style.width = "100%"; pct.textContent = "✓";
      st.textContent = msg || tr("Carregado com sucesso", "Uploaded"); cancelBtn.remove();
      setTimeout(() => { row.remove(); if (!document.querySelector("#upq .upq-row")) document.getElementById("upq")?.remove(); }, 4000);
    },
    fail(msg, retry) {
      finish(); row.classList.add("err"); pct.textContent = "!";
      st.textContent = msg || tr("Falhou", "Failed");
      cancelBtn.textContent = retry ? tr("Tentar de novo", "Retry") : tr("Fechar", "Close");
      cancelBtn.onclick = () => { row.remove(); if (!document.querySelector("#upq .upq-row")) document.getElementById("upq")?.remove(); retry?.(); };
    },
  };
}
