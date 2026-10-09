// Páginas públicas: início, catálogo, curso, como funciona, institucionais.
import { api } from "../api.js?v=202610092030";
import { supportBox } from "./account.js?v=202610092030";
import { viewContent } from "../track.js?v=202610092030";
import { state, tr, esc, mzn, money, courseCard, coverHTML, priceHTML, offerPriceHTML, hasStrike, cleanBonuses, videoEmbed, langLabel, ICON, emptyState, isAdmin, isProducer, toast, photo, PHOTOS, catPhoto, catLabel, catOptions, supportOk, saveRef, getRef, gDays, TYPES, typeLabel, unitLabel, CONFIG, intlPrice, usdFmt, curPrice, usdRate, isSponsored, supportWa, supportWaText, hasGuarantee } from "../ui.js?v=202610092030";


// ---------- Início (modelo escolhido pelo utilizador) ----------
const BG_ICONS = `<svg class="uh-ic i1" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 19V5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M8 7h6M8 11h6"/></svg>
  <svg class="uh-ic i2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="12" cy="12" r="9"/><path d="M10 8.5l5 3.5-5 3.5z"/></svg>
  <svg class="uh-ic i3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/></svg>
  <svg class="uh-ic i4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="3" y="5" width="18" height="12" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
  <svg class="uh-ic i5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2.5 9 2.5 12 0v-5"/></svg>`;
const tick = (t) => `<li><i>${ICON.check}</i><span>${t}</span></li>`;
const ICON_MIC = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
const ICON_TPL = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>`;
const ICON_BOOK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z"/><path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z"/></svg>`;

// Formas de pagamento que a plataforma aceita mesmo (definidas pela administração)
export const payMethods = () => {
  const s = state.settings || {};
  const pp = Boolean(s.gateway?.paypal_enabled || s.payment_paypal?.email);
  const card = Boolean(s.gateway?.paypal_enabled);
  const intl = [...(pp ? [["PayPal", "#1F4FA3"]] : []), ...(card ? [["Visa · Mastercard", "#1A1F71"]] : [])];
  const local = [["M-Pesa", "#E21B23"], ["e-Mola", "#F08A00"]];
  return state.currency === "MZN" ? [...local, ...intl] : [...intl, ...local];
};
const payChips = () => `<div class="pay-chips">${payMethods().map(([n, c]) => `<span><i style="background:${c}"></i>${n}</span>`).join("")}</div>`;
const fmtN = (n) => Number(n || 0).toLocaleString("pt-PT");

export async function home(main, _p, _q, alive) {
  const pct = Number(state.settings.commission_pct ?? 10);
  const sellHref = state.user ? (isProducer() ? "#/produtor/curso/novo" : "#/ser-produtor") : "#/registar?produtor=1";
  const buyHref = state.user ? "#/meus-cursos" : "#/entrar";
  // Fotografias reais (Unsplash, uso comercial livre), servidas no tamanho certo para cada ecrã
  const pic = (id, w, h, faces = false) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop${faces ? "&crop=faces" : ""}&w=${w}&h=${h}&q=78`;
  const img = (id, w, h, alt, cls = "", faces = false) => `<img class="${cls}" src="${pic(id, w, h, faces)}" srcset="${pic(id, w, h, faces)} 1x, ${pic(id, w * 2, h * 2, faces)} 2x" width="${w}" height="${h}" alt="${esc(alt)}" loading="eager" decoding="async" data-fallback>`;
  const P = { seller: "1615891081220-9116de3e1afd", buyer: "1593698054469-2bb6fdf4b512", phone: "1622556498246-755f44ca76f3", sofa: "1573162915851-0af01102b7be" };
  const quick = (href, ic, t, d, cls = "") => `<a class="uh-q ${cls}" href="${href}"><span class="uh-q-ic">${ic}</span><span><b>${t}</b><small>${d}</small></span>${ICON.arrow}</a>`;
  const tick2 = (t) => `<li>${ICON.check}<span>${t}</span></li>`;
  // Cartaz animado: 3 destaques que rodam sozinhos (vender · comprar · afiliados)
  const P2 = { creator: "1758273239210-59fea02475eb", learner: "1620829813573-7c9e1877706f", affiliate: "1739271933163-8dcc7c8e8a3e" };
  const slide = (i, tone, ph, tag, h, p, href, cta, ic, fl, fb, alt) => `
      <article class="ct-slide ${tone}${i ? "" : " on"}" role="group" aria-roledescription="slide" aria-label="${i + 1} / 3"${i ? ' aria-hidden="true"' : ""}>
        <div class="ct-copy">
          <span class="ct-tag">${tag}</span>
          <h2>${h}</h2>
          <p>${p}</p>
          <a class="btn ${tone === "green" ? "btn-primary" : "btn-green"}" href="${href}"${i ? ' tabindex="-1"' : ""}>${cta} ${ICON.arrow}</a>
        </div>
        <div class="ct-ph">
          ${img(ph, 640, 440, alt, "", false).replace('loading="eager"', i ? 'loading="lazy"' : 'loading="eager"')}
          <div class="float ct-fl"><div class="ic ${tone === "cream" ? "green" : "gold"}">${ic}</div><div><span>${fl}</span><b>${fb}</b></div></div>
        </div>
      </article>`;
  main.innerHTML = `
  <section class="uh">
    <div class="container uh-in">
      <div class="uh-copy">
        <span class="uh-eyebrow"><i></i>${tr("Marketplace global de produtos digitais", "Global marketplace for digital products")}</span>
        <h1>${tr("Vende o que sabes.", "Sell what you know.")}<br><span>${tr("Aprende o que precisas.", "Learn what you need.")}</span></h1>
        <p class="uh-sub">${tr("Cursos, ebooks e templates de criadores reais. Quem vende recebe de qualquer país; quem compra tem acesso na hora.", "Courses, ebooks and templates from real creators. Sellers get paid from any country; buyers get instant access.")}</p>
        <form class="uh-search" id="hxs" role="search">
          ${ICON.search}<input name="q" type="search" placeholder="${tr("O que queres aprender hoje?", "What do you want to learn today?")}" aria-label="${tr("Pesquisar produtos", "Search products")}">
          <button class="btn btn-green">${tr("Procurar", "Search")}</button>
        </form>
        <div class="mh-ctas uh-ctas">
          <a class="btn btn-primary btn-lg" href="${sellHref}">${ICON.trend} ${tr("Quero vender", "I want to sell")}</a>
          <a class="btn btn-white btn-lg" href="#/cursos">${ICON.bag} ${tr("Quero comprar", "I want to buy")}</a>
        </div>
        <div class="uh-trust">
          <span class="uh-avs">${img(P.phone, 44, 44, "", "", true)}${img(P.buyer, 44, 44, "", "", true)}${img(P.sofa, 44, 44, "", "", true)}</span>
          <small>${tr("Criadores e alunos de vários países já usam a Uquiorrapay", "Creators and learners from many countries already use Uquiorrapay")}</small>
        </div>
      </div>
      <div class="uh-art" aria-hidden="true">
        <span class="uh-u"></span>
        <div class="uh-ph main uh-rot">${[P.seller, P2.creator, P2.affiliate, P.phone].map((id, i) => img(id, 520, 650, "", i ? "" : "on").replace('loading="eager"', i ? 'loading="lazy"' : 'loading="eager"')).join("")}</div>
        <div class="uh-ph side uh-rot">${[P.buyer, P2.learner, P.sofa].map((id, i) => img(id, 260, 320, "", i ? "" : "on").replace('loading="eager"', i ? 'loading="lazy"' : 'loading="eager"')).join("")}</div>
        <div class="float uh-f1"><div class="ic gold">${ICON.bag}</div><div><span>${tr("Nova venda", "New sale")}</span><b>+ $16.82</b></div></div>
        <div class="float uh-f2"><div class="ic green">${ICON.check}</div><div><span>${tr("Compra concluída", "Purchase complete")}</span><b>${tr("Acesso liberado", "Access unlocked")}</b></div></div>
      </div>
    </div>
  </section>

  <section class="container uh-quick" aria-label="${tr("Ações rápidas", "Quick actions")}">
    ${quick(sellHref, ICON.plus, tr("Criar produto", "Create a product"), tr("Publica em minutos", "Publish in minutes"), "gold")}
    ${quick("#/cursos", ICON.search, tr("Ver produtos", "Browse products"), tr("Cursos, ebooks e templates", "Courses, ebooks, templates"))}
    ${quick("#/afiliados", ICON.link, tr("Ser afiliado", "Become an affiliate"), tr("Ganha comissão a divulgar", "Earn by promoting"))}
    ${quick(buyHref, ICON.play, state.user ? tr("Os meus cursos", "My courses") : tr("Entrar", "Sign in"), tr("Acede ao que compraste", "Open what you bought"))}
  </section>

  <section class="container uh-cartaz" id="cartaz" aria-roledescription="carousel" aria-label="${tr("Destaques", "Highlights")}">
    <div class="ct-track">
      ${slide(0, "green", P2.creator, tr("Para criadores", "For creators"), tr("Grava uma vez.<br><span>Vende todos os dias.</span>", "Record once.<br><span>Sell every day.</span>"), tr("Publica o teu curso ou ebook e recebe de clientes em qualquer país.", "Publish your course or ebook and get paid by customers anywhere."), sellHref, tr("Começar a vender", "Start selling"), ICON.bag, tr("Nova venda", "New sale"), "+ $16.82", tr("Criadora a gravar um curso em casa", "Creator recording a course at home"))}
      ${slide(1, "cream", P2.learner, tr("Para quem compra", "For buyers"), tr("O teu próximo passo<br><span>começa hoje.</span>", "Your next step<br><span>starts today.</span>"), tr("Cursos, ebooks e templates com acesso logo depois do pagamento.", "Courses, ebooks and templates with access right after payment."), "#/cursos", tr("Ver produtos", "Browse products"), ICON.check, tr("Compra concluída", "Purchase complete"), tr("Acesso liberado", "Access unlocked"), tr("Aluno a estudar no portátil", "Learner studying on a laptop"))}
      ${slide(2, "gold", P2.affiliate, tr("Programa de afiliados", "Affiliate program"), tr("Sem produto?<br><span>Ganha a divulgar.</span>", "No product?<br><span>Earn by sharing.</span>"), tr("Partilha o teu link e recebe comissão em cada venda.", "Share your link and earn a commission on every sale."), "#/afiliados", tr("Ser afiliado", "Become an affiliate"), ICON.link, tr("Comissão recebida", "Commission earned"), "+ $5.70", tr("Mulher sorridente a ver o telemóvel", "Smiling woman looking at her phone"))}
    </div>
    <button class="ct-nav prev" type="button" aria-label="${tr("Anterior", "Previous")}">‹</button>
    <button class="ct-nav next" type="button" aria-label="${tr("Seguinte", "Next")}">›</button>
    <div class="ct-dots" role="tablist">${[0, 1, 2].map((i) => `<button type="button" role="tab" aria-label="${i + 1} / 3"${i ? "" : ' aria-selected="true"'}><i></i></button>`).join("")}</div>
  </section>

  <div class="container"><div class="proof" id="proof" hidden></div></div>

  <section class="container uh-two">
    <article class="uh-card">
      <div class="uh-card-ph">${img(P.phone, 560, 420, tr("Criador a vender pelo telemóvel", "Creator selling from his phone"))}</div>
      <div class="uh-card-b">
        <span class="uh-tag">${tr("Para quem vende", "For sellers")}</span>
        <h2>${tr("Transforma o que sabes em vendas", "Turn what you know into sales")}</h2>
        <ul>${tick2(tr("Loja e página de venda prontas em minutos", "Store and sales page ready in minutes"))}${tick2(tr("Recebe de clientes de qualquer país", "Get paid by customers in any country"))}${tick2(tr(`${String(100 - pct).replace(".", ",")}% de cada venda é teu, sem mensalidade`, `Keep ${100 - pct}% of every sale, no monthly fee`))}</ul>
        <a class="btn btn-primary" href="${sellHref}">${tr("Começar a vender", "Start selling")} ${ICON.arrow}</a>
      </div>
    </article>
    <article class="uh-card buy">
      <div class="uh-card-ph">${img(P.sofa, 560, 420, tr("Aluna a estudar no portátil", "Learner studying on a laptop"))}</div>
      <div class="uh-card-b">
        <span class="uh-tag">${tr("Para quem compra", "For buyers")}</span>
        <h2>${tr("Aprende ao teu ritmo, onde estiveres", "Learn at your pace, wherever you are")}</h2>
        <ul>${tick2(tr("Acesso imediato depois do pagamento", "Instant access after payment"))}${tick2(tr("Pagamento seguro e suporte no WhatsApp", "Secure payment and WhatsApp support"))}${tick2(tr("PayPal, cartão, M-Pesa ou e-Mola", "PayPal, card, M-Pesa or e-Mola"))}</ul>
        <a class="btn btn-green" href="#/cursos">${tr("Ver produtos", "Browse products")} ${ICON.arrow}</a>
      </div>
    </article>
  </section>

  <section class="sp-sec" id="spSec" hidden>
    <div class="container">
      <div class="sec-head"><h2>${tr("Patrocinados", "Sponsored")}<small class="sp-why">${tr("Produtos anunciados pelos criadores", "Products promoted by their creators")}</small></h2><a class="link-more" href="${state.user ? "#/produtor" : sellHref}">${tr("Anunciar o meu produto", "Promote my product")} ${ICON.arrow}</a></div>
      <div class="grid courses" id="spGrid"></div>
    </div>
  </section>

  <section class="featured-sec" id="destaque">
    <div class="container">
      <div class="sec-head"><h2>${tr("Produtos em destaque", "Featured products")}</h2><a class="link-more" href="#/cursos">${tr("Ver todos", "See all")} ${ICON.arrow}</a></div>
      <div class="grid courses" id="featured"><div class="loading"><span></span><span></span><span></span></div></div>
    </div>
  </section>

  <section class="container home-app"><a class="ha-in" href="#/app">
    <img src="img/app/maskable-192.png" alt="" width="64" height="64">
    <div><b>${tr("Baixa a app Uquiorrapay", "Get the Uquiorrapay app")}</b><small>${tr("Avisos de cada venda no telemóvel e os teus cursos à mão.", "Sale alerts on your phone and your courses at hand.")}</small></div>
    <span class="btn btn-primary btn-sm">📲 ${tr("Baixar app", "Get the app")}</span></a></section>

  <section class="container home-pay"><p class="mk-pay">${tr("Pagamentos", "Payments")}: <b>${payMethods().map(([n]) => n).join(" · ")}</b></p></section>`;

  document.getElementById("hxs")?.addEventListener("submit", (e) => { e.preventDefault(); const q = e.target.q.value.trim(); location.hash = "#/cursos" + (q ? "?q=" + encodeURIComponent(q) : ""); });
  cartaz(document.getElementById("cartaz"), alive);
  rotate(main.querySelector(".uh-ph.main"), 5000, alive); setTimeout(() => rotate(main.querySelector(".uh-ph.side"), 5000, alive), 2500);
  // Números reais da plataforma (só aparecem quando já há algo para mostrar)
  api.publicStats().then((st) => {
    const box = document.getElementById("proof"); if (!box || !st || !(Number(st.products) || Number(st.sales))) return;
    const items = [[st.sales, Number(st.sales) === 1 ? tr("venda realizada", "sale made") : tr("vendas realizadas", "sales made")], [st.products, Number(st.products) === 1 ? tr("produto à venda", "product for sale") : tr("produtos à venda", "products for sale")], [st.creators, Number(st.creators) === 1 ? tr("criador", "creator") : tr("criadores", "creators")], [st.students, Number(st.students) === 1 ? tr("aluno inscrito", "enrolled student") : tr("alunos inscritos", "enrolled students")]].filter(([n]) => Number(n) > 0);
    box.innerHTML = `<span class="proof-live"><i></i>${tr("Vendas ao vivo na Uquiorrapay", "Live sales on Uquiorrapay")}</span>${items.map(([n, l]) => `<div><b>${fmtN(n)}</b><span>${l}</span></div>`).join("")}`;
    box.hidden = false;
  }).catch(() => {});

  // Anúncios: produtos com destaque pago a decorrer (mistura a ordem a cada visita)
  api.listSponsored({ limit: 12 }).then(async (sp) => {
    const box = document.getElementById("spSec"); if (!box || !sp.length) return;
    const pick = shuffle(sp.filter((c) => c.language === state.lang)).concat(shuffle(sp.filter((c) => c.language !== state.lang))).slice(0, 4);
    const cnt = await api.lessonCounts(pick.map((c) => c.id)).catch(() => ({}));
    if (!alive()) return;
    document.getElementById("spGrid").innerHTML = pick.map((c) => courseCard(c, cnt, { sponsored: true })).join("");
    box.hidden = false;
    trackViews(pick);
  }).catch(() => {});
  const list = await api.listApproved({ featured: true, limit: 12 }).catch(() => []);
  const all = list.filter((c) => !isSponsored(c)).length < 3 ? await api.listApproved({ limit: 24 }).catch(() => []) : list;
  // Produtos na língua do visitante primeiro (inglês para quem vem de fora dos países lusófonos)
  // os patrocinados já aparecem na secção própria: não se repetem aqui
  const pool = all.filter((c) => !isSponsored(c)).length ? all.filter((c) => !isSponsored(c)) : all;
  const more = [...pool.filter((c) => c.language === state.lang), ...pool.filter((c) => c.language !== state.lang)];
  const counts = await api.lessonCounts(more.map((c) => c.id)).catch(() => ({}));
  if (!alive()) return;
  document.getElementById("featured").innerHTML = more.length ? more.slice(0, 6).map((c) => courseCard(c, counts)).join("") : emptyState(tr("Ainda não há produtos publicados.", "No products published yet."));
}

// Fotos do topo em rotação (troca suave a cada 5 s)
function rotate(box, ms, alive) {
  if (!box || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ims = [...box.querySelectorAll("img")]; if (ims.length < 2) return;
  let i = 0;
  const t = setInterval(() => {
    if (!alive() || !box.isConnected) return clearInterval(t);
    ims[i].classList.remove("on"); i = (i + 1) % ims.length; ims[i].classList.add("on");
  }, ms);
}

// Roda os destaques a cada 6 s; pára com o rato/foco por cima, aceita deslizar no telemóvel
function cartaz(box, alive) {
  if (!box) return;
  const slides = [...box.querySelectorAll(".ct-slide")], dots = [...box.querySelectorAll(".ct-dots button")];
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let cur = 0, timer = null, paused = false;
  const go = (n) => {
    cur = (n + slides.length) % slides.length;
    box.dataset.cur = cur;
    slides.forEach((s, i) => {
      const on = i === cur; s.classList.toggle("on", on);
      s.setAttribute("aria-hidden", on ? "false" : "true");
      s.querySelector(".ct-copy a")?.setAttribute("tabindex", on ? "0" : "-1");
    });
    dots.forEach((d, i) => { d.setAttribute("aria-selected", i === cur ? "true" : "false"); d.classList.remove("run"); });
    if (!still && !paused) { void dots[cur].offsetWidth; dots[cur].classList.add("run"); }
  };
  const stop = () => { clearInterval(timer); timer = null; };
  const start = () => {
    stop(); if (still || paused) return;
    timer = setInterval(() => { if (!alive() || !box.isConnected) return stop(); go(cur + 1); }, 6000);
  };
  const jump = (n) => { go(n); start(); };
  box.querySelector(".prev").addEventListener("click", () => jump(cur - 1));
  box.querySelector(".next").addEventListener("click", () => jump(cur + 1));
  dots.forEach((d, i) => d.addEventListener("click", () => jump(i)));
  const hold = (v) => { paused = v; box.classList.toggle("paused", v); if (v) stop(); else { go(cur); start(); } };
  box.addEventListener("mouseenter", () => hold(true));
  box.addEventListener("mouseleave", () => hold(false));
  box.addEventListener("focusin", () => hold(true));
  box.addEventListener("focusout", (e) => { if (!box.contains(e.relatedTarget)) hold(false); });
  let x0 = null;
  box.addEventListener("touchstart", (e) => { x0 = e.touches[0].clientX; }, { passive: true });
  box.addEventListener("touchend", (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null; if (Math.abs(dx) > 40) jump(cur + (dx < 0 ? 1 : -1)); });
  go(0); start();
}

const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
// Conta uma vista por produto patrocinado e por visita
function trackViews(list) {
  let seen = []; try { seen = JSON.parse(sessionStorage.getItem("uq_spv") || "[]"); } catch {}
  for (const c of list) if (!seen.includes(c.id)) { seen.push(c.id); api.boostTrack(c.id, "view"); }
  try { sessionStorage.setItem("uq_spv", JSON.stringify(seen.slice(-200))); } catch {}
}
const faq = (q, a) => `<details><summary><span>${q}</span><i>${ICON.plus}</i></summary><p>${a}</p></details>`;

// ---------- Catálogo (estilo marketplace) ----------
export async function catalog(main, _p, query, alive) {
  const q = query.q || "", cat = query.categoria || "", type = query.tipo || "";
  // Por omissão mostra os produtos na língua do visitante (inglês fora dos países lusófonos); «Todas as línguas» mostra tudo
  const autoLang = query.lingua == null && state.lang === "en" ? "en" : "";
  const lang = query.lingua === "all" ? "" : query.lingua || autoLang;
  const sellHref = state.user ? (isProducer() ? "#/produtor/curso/novo" : "#/ser-produtor") : "#/registar?produtor=1";
  const link = (over) => { const p = new URLSearchParams(); const v = { q, categoria: cat, tipo: type, lingua: query.lingua || "", ...over }; Object.entries(v).forEach(([k, x]) => x && p.set(k, x)); return "#/cursos" + (p.toString() ? "?" + p : ""); };
  const typeChips = [["", tr("Todos", "All")], ...TYPES.map((t) => [t, typeLabel(t) + (t === "audio" ? "" : "s")])];
  main.innerHTML = `<section class="mk-top"><div class="container">
      <h1>${cat ? esc(catLabel(cat)) : type ? esc(typeLabel(type)) + (type === "audio" ? "" : "s") : tr("Encontra cursos, ebooks e muito mais", "Find courses, ebooks and more")}</h1>
      <form class="mk-search" id="f" role="search">
        <span class="mk-s-ic">${ICON.search}</span>
        <input name="q" type="search" value="${esc(q)}" placeholder="${tr("Pesquisar produtos…", "Search products…")}" aria-label="${tr("Pesquisar", "Search")}">
        <button class="btn btn-primary">${tr("Buscar", "Search")}</button>
        <input type="hidden" name="categoria" value="${esc(cat)}"><input type="hidden" name="tipo" value="${esc(type)}">
        <select name="lingua" class="mk-lang" aria-label="${tr("Língua", "Language")}"><option value="all">${tr("Todas as línguas", "All languages")}</option><option value="pt" ${lang === "pt" ? "selected" : ""}>Português</option><option value="en" ${lang === "en" ? "selected" : ""}>English</option></select>
      </form>
      <div class="mk-types">${typeChips.map(([t, l]) => `<a class="${t === type ? "on" : ""}" href="${link({ tipo: t })}">${esc(l)}</a>`).join("")}</div>
    </div></section>
    <section class="page container mk-page">
      <div class="cat-pills mk-cats"><a class="${!cat ? "on" : ""}" href="${link({ categoria: "" })}">${tr("Todas as categorias", "All categories")}</a>${CONFIG.CATEGORIES.map((c) => `<a class="${c === cat ? "on" : ""}" href="${link({ categoria: c })}">${esc(catLabel(c))}</a>`).join("")}</div>
      <div class="mk-head"><h2 id="mkCount">${tr("A carregar…", "Loading…")}</h2>${q || cat || type || query.lingua ? `<a class="link-more" href="#/cursos">${tr("Limpar filtros", "Clear filters")} ✕</a>` : ""}</div>
      <div class="grid courses mk-grid" id="list"><div class="loading"><span></span><span></span><span></span></div></div>
      <div class="mk-sell"><div><h2>${tr("Tens algo para vender?", "Got something to sell?")}</h2><p>${tr("Cria a tua loja grátis e vende para clientes de qualquer país.", "Create your free store and sell to customers in any country.")}</p></div><a class="btn btn-primary" href="${sellHref}">${tr("Começar a vender", "Start selling")} ${ICON.arrow}</a></div>
      <p class="mk-pay">${tr("Pagamentos", "Payments")}: ${payMethods().map(([n]) => n).join(" · ")}</p>
    </section>`;
  const f = document.getElementById("f");
  f.addEventListener("submit", (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(f)) if (v) params.set(k, v);
    location.hash = "#/cursos" + (params.toString() ? "?" + params : "");
  });
  f.lingua.addEventListener("change", () => f.requestSubmit());
  let rows = await api.listApproved({ q, category: cat, language: lang, type });
  let note = "";
  if (!rows.length && autoLang) { rows = await api.listApproved({ q, category: cat, type }); if (rows.length) note = tr("Ainda não há produtos em inglês aqui — a mostrar todas as línguas.", "No English products here yet — showing all languages."); }
  // Anúncios: os produtos patrocinados que cabem na pesquisa aparecem primeiro (até 4)
  const spon = shuffle(rows.filter(isSponsored)).slice(0, 4);
  rows = [...spon, ...rows.filter((c) => !spon.includes(c))];
  const counts = await api.lessonCounts(rows.map((c) => c.id)).catch(() => ({}));
  if (!alive()) return;
  if (spon.length) trackViews(spon);
  document.getElementById("mkCount").innerHTML = esc(rows.length === 1 ? tr("1 produto", "1 product") : tr(`${rows.length} produtos`, `${rows.length} products`)) + (note ? `<small class="mk-note">${esc(note)}</small>` : "");
  document.getElementById("list").innerHTML = rows.length
    ? rows.map((c) => courseCard(c, counts, { sponsored: spon.includes(c) })).join("")
    : emptyState(tr("Nenhum produto encontrado.", "No products found."), tr("Experimenta outra pesquisa ou categoria.", "Try another search or category."), `<a class="btn btn-green" href="#/cursos">${tr("Ver todos", "See all")}</a>`);
}

// ---------- Página do curso (página de venda) ----------
const lines = (t) => String(t || "").split(/\n+/).map((x) => x.replace(/^[\s•\-*✓]+/, "").trim()).filter(Boolean);

export async function course(main, { id }, query, alive) {
  if (query.ref) { saveRef(id, query.ref); api.trackClick(query.ref); }
  const c = await api.course(id);
  if (!alive()) return;
  if (!c) { main.innerHTML = notFound(); return; }
  try { if (c.status === "approved") viewContent(c); } catch {}
  const [outline, students, enrolled, pending] = await Promise.all([
    api.outline(id).catch(() => []),
    api.studentCount(id).catch(() => 0),
    state.user ? api.isEnrolled(state.user.id, id).catch(() => false) : false,
    state.user ? api.pendingOrderFor(state.user.id, id).catch(() => null) : null,
  ]);
  if (!alive()) return;
  const owner = state.user && c.producer_id === state.user.id;
  const lessons = outline.reduce((s, m) => s + m.lessons.length, 0);
  const mins = outline.reduce((s, m) => s + m.lessons.reduce((a, l) => a + (l.duration_min || 0), 0), 0);
  const dur = mins >= 60 ? `${Math.floor(mins / 60)}h${mins % 60 ? ` ${mins % 60}min` : ""}` : `${mins} min`;
  const free = Number(c.price_mzn) === 0;
  const coupon = query.cupao ? `?cupao=${encodeURIComponent(query.cupao)}` : "";
  const buyHref = `#/checkout/${esc(id)}${coupon}`;

  let action;
  if (enrolled) action = `<a class="btn btn-green btn-block btn-lg" href="#/aprender/${esc(id)}">${tr("Continuar o curso", "Continue course")} ${ICON.arrow}</a>`;
  else if (owner || isAdmin()) action = `<a class="btn btn-green btn-block btn-lg" href="#/produtor/curso/${esc(id)}">${tr("Editar curso", "Edit course")}</a>`;
  else if (c.status !== "approved" || !supportOk(c)) action = `<div class="alert">${tr("Este produto não está disponível para compra de momento.", "This product is not available for purchase right now.")}</div>`;
  else if (pending) action = `<a class="btn btn-primary btn-block btn-lg" href="#/checkout/${esc(id)}">${tr("Concluir pagamento", "Complete payment")}</a><p class="small muted center">${tr("Referência", "Reference")} ${esc(pending.reference)}</p>`;
  else action = `<a class="btn btn-primary btn-block btn-lg" href="${buyHref}">${free ? tr("Inscrever-me grátis", "Enrol for free") : tr("Comprar agora", "Buy now")} ${ICON.arrow}</a>`;
  const canBuy = !enrolled && !owner && !isAdmin() && c.status === "approved" && supportOk(c);

  const bonuses = cleanBonuses(c.bonuses);
  const showCta = canBuy || Boolean(pending) || enrolled;
  // Caixa de oferta a meio da página: o que recebe + valor total riscado + botão
  const mainValue = hasStrike(c) ? Number(c.compare_price_mzn) : Number(c.price_mzn);
  const bonusValue = bonuses.reduce((s, b) => s + (Number(b.value) > 0 ? Number(b.value) : 0), 0);
  const totalValue = mainValue + bonusValue;
  const offerBox = enrolled ? "" : bonuses.length || hasStrike(c) ? `<div class="offer-box">
      <h3>${tr("Tudo o que vais receber", "Everything you get")}</h3>
      <ul class="offer-list"><li>${ICON.check}<span>${esc(c.title)}</span>${mainValue > 0 ? `<em>${esc(mzn(mainValue))}</em>` : ""}</li>
        ${bonuses.map((b) => `<li>${ICON.gift}<span>${tr("Bónus", "Bonus")}: ${esc(b.title)}</span>${Number(b.value) > 0 ? `<em>${esc(mzn(b.value))}</em>` : ""}</li>`).join("")}</ul>
      ${totalValue > Number(c.price_mzn) ? `<p class="offer-total">${tr("Valor total", "Total value")}: <s>${esc(mzn(totalValue))}</s></p>` : ""}
      <p class="offer-today">${tr("Hoje por apenas", "Today for only")} ${priceHTML(c.price_mzn, "big")}</p>
      ${action}
    </div>` : `<div class="cta-band"><div><b>${tr("Pronto para começar?", "Ready to start?")}</b><small>${tr("Acesso imediato após a confirmação do pagamento.", "Instant access after payment confirmation.")}</small></div><div class="cta-band-r">${priceHTML(c.price_mzn)}${action}</div></div>`;
  const statusNote = c.status !== "approved" ? `<div class="alert">${tr("Pré-visualização", "Preview")}: ${esc(c.status)}${c.rejection_reason ? ` — ${esc(c.rejection_reason)}` : ""}</div>` : "";
  const learn = lines(c.learn_points), audience = lines(c.audience), reqs = lines(c.requirements);
  const bg = c.cover_url || catPhoto(c.category, 1600);
  const initial = esc((c.producer_name || "U")[0].toUpperCase());
  // Ebooks e templates mostram a capa no topo; cursos e áudios mostram-na na caixa de compra
  const hasVideo = ["curso", "audio"].includes(c.product_type || "curso");
  // Descrição limitada a 500 caracteres (as antigas mais longas são cortadas)
  const rawDesc = String(c.description || "").trim();
  const descHTML = esc(rawDesc.length > 500 ? rawDesc.slice(0, 500).replace(/\s+\S*$/, "") + "…" : rawDesc).replace(/\n/g, "<br>");

  main.innerHTML = `<section class="course-hero">
    <div class="ch-bg" style="background-image:url('${esc(bg)}')"></div>
    <div class="container course-hero-in">
      <nav class="crumbs"><a href="#/cursos?tipo=${esc(c.product_type || "curso")}">${esc(typeLabel(c.product_type))}</a><span>/</span><a href="#/cursos?categoria=${encodeURIComponent(c.category || "")}">${esc(catLabel(c.category || ""))}</a></nav>
      ${statusNote}
      <h1>${esc(c.title)}</h1>
      ${c.subtitle ? `<p class="lead">${esc(c.subtitle)}</p>` : ""}
      <div class="facts"><span class="by"><b class="mini-av">${initial}</b>${esc(c.producer_name || "Uquiorrapay")}</span><span>${ICON.play} ${esc(unitLabel(c.product_type, lessons))}</span>${mins ? `<span>${ICON.clock} ${dur}</span>` : ""}${students ? `<span>${ICON.users} ${students} ${tr("alunos", "students")}</span>` : ""}<span class="chip-lang">${esc(langLabel(c.language))}</span></div>
      ${!hasVideo && c.cover_url ? `<div class="ch-cover"><img src="${esc(c.cover_url)}" alt="${esc(c.title)}" loading="eager"></div>` : ""}
    </div>
  </section>
  <section class="container course-body">
    <div class="course-main">
      ${learn.length ? `<div class="learn-box"><h2>${tr("O que vais aprender", "What you'll learn")}</h2><ul class="ticks two-cols">${learn.map((x) => `<li>${ICON.check}<span>${esc(x)}</span></li>`).join("")}</ul></div>` : ""}
      <h2>${(c.product_type || "curso") === "curso" ? tr("Sobre este curso", "About this course") : tr("Sobre este produto", "About this product")}</h2>
      <div class="prose" id="pDesc">${descHTML || `<p class="muted">—</p>`}</div>
      ${bonuses.length ? `<h2 class="bonus-h">${ICON.gift} ${tr("Bónus incluídos", "Included bonuses")}</h2>
      <div class="bonus-grid">${bonuses.map((b, i) => `<div class="bonus-card"><span class="bonus-n">${tr("Bónus", "Bonus")} ${i + 1}</span><h3>${esc(b.title)}</h3>${b.desc ? `<p>${esc(b.desc)}</p>` : ""}${Number(b.value) > 0 ? `<small>${tr("Valor", "Value")}: <s>${esc(mzn(b.value))}</s> <b class="ok-text">${tr("grátis", "free")}</b></small>` : ""}</div>`).join("")}</div>` : ""}
      ${showCta ? offerBox : ""}
      <div class="sec-head"><h2>${tr("Conteúdo", "Content")}</h2><span class="muted small">${outline.length} ${tr("módulos", "modules")} · ${esc(unitLabel(c.product_type, lessons))}${mins ? ` · ${dur}` : ""}</span></div>
      <div class="outline">${outline.length ? outline.map((m, i) => `
        <details ${i === 0 ? "open" : ""}><summary><span>${esc(m.title)}</span><small>${esc(unitLabel(c.product_type, m.lessons.length))}</small></summary>
          <ul>${m.lessons.map((l) => `<li>${ICON.lock}<span>${esc(l.title)}</span><em>${l.duration_min || 0} min</em></li>`).join("")}</ul>
        </details>`).join("") : `<p class="muted">${tr("O programa será publicado em breve.", "The curriculum will be published soon.")}</p>`}</div>
      ${audience.length || reqs.length ? `<div class="two-col info-cols">
        ${audience.length ? `<div class="panel"><h3>${tr("Para quem é", "Who it's for")}</h3><ul class="ticks">${audience.map((x) => `<li>${ICON.check}<span>${esc(x)}</span></li>`).join("")}</ul></div>` : ""}
        ${reqs.length ? `<div class="panel"><h3>${tr("Requisitos", "Requirements")}</h3><ul class="dots">${reqs.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>` : ""}
      </div>` : ""}
      ${hasGuarantee(c) ? `<div class="guarantee">${ICON.shield}<div><h3>${tr(`Garantia de ${gDays()} dias`, `${gDays()}-day guarantee`)}</h3><p>${tr(`Se o produto não for para ti, pedes o reembolso até ${gDays()} dias depois da compra (desde que não tenhas visto mais de 20% do conteúdo).`, `If it isn't for you, ask for a refund within ${gDays()} days of purchase (as long as you've used no more than 20% of the content).`)}</p></div></div>` : ""}
      ${supportBox(c)}
      <div class="producer-box"><span class="big-av">${initial}</span><div><small class="muted">${tr("Produtor", "Creator")}</small><h3>${esc(c.producer_name || "Uquiorrapay")}</h3><p class="muted small">${tr("Curso revisto e aprovado pela equipa Uquiorrapay.", "Course reviewed and approved by the Uquiorrapay team.")}</p></div></div>
      <h2>${tr("Perguntas frequentes", "FAQ")}</h2>
      <div class="faq">
        ${faq(tr("Quando tenho acesso ao curso?", "When do I get access?"), tr("Assim que o pagamento é confirmado, o curso aparece em «Os meus cursos».", "As soon as payment is confirmed, the course appears in “My courses”."))}
        ${faq(tr("Por quanto tempo tenho acesso?", "How long do I have access?"), tr("Enquanto o curso estiver disponível na plataforma. Estudas ao teu ritmo.", "For as long as the course is on the platform. Learn at your own pace."))}
        ${faq(tr("Posso estudar no telemóvel?", "Can I study on my phone?"), tr("Sim, as aulas funcionam no telemóvel, tablet e computador.", "Yes, lessons work on phone, tablet and computer."))}
      </div>
      ${showCta ? `<div class="end-cta"><h2>${enrolled ? tr("Continua a aprender", "Keep learning") : tr("Começa hoje mesmo", "Start today")}</h2>
        <p class="muted">${esc(c.title)}</p>${enrolled ? "" : offerPriceHTML(c, "big")}<div class="end-cta-btn">${action}</div>
        ${enrolled ? "" : `<p class="small muted">${ICON.shield} ${hasGuarantee(c) ? tr(`Garantia de ${gDays()} dias · Acesso imediato após a confirmação`, `${gDays()}-day guarantee · Instant access after confirmation`) : tr("Pagamento seguro · Acesso imediato após a confirmação", "Secure payment · Instant access after confirmation")}</p>`}</div>` : ""}
    </div>
    <aside class="buy-box">
      ${coverHTML(c, "sm")}
      <div class="buy-in">
        ${offerPriceHTML(c, "big")}
        ${Number(c.price_mzn) > 0 && !enrolled && state.currency === "MZN" ? `<p class="bb-intl">🌍 ${tr("Internacional", "International")}: <b>${esc(usdFmt(intlPrice(c)))}</b><small>${tr("PayPal ou cartão Visa/Mastercard", "PayPal or Visa/Mastercard")}</small></p>` : ""}
        ${bonuses.length ? `<p class="bb-bonus">${ICON.gift} ${tr(`+ ${bonuses.length} bónus incluído${bonuses.length > 1 ? "s" : ""}`, `+ ${bonuses.length} bonus${bonuses.length > 1 ? "es" : ""} included`)}</p>` : ""}
        ${query.cupao && canBuy ? `<div class="coupon-note">${ICON.tag} ${tr("Cupão", "Coupon")} <b>${esc(query.cupao.toUpperCase())}</b> ${tr("aplicado no checkout", "applied at checkout")}</div>` : ""}
        ${action}
        <ul class="ticks"><li>${ICON.check}${tr("Acesso logo após a confirmação", "Access right after confirmation")}</li>${hasGuarantee(c) ? `<li>${ICON.check}${tr(`Garantia de ${gDays()} dias`, `${gDays()}-day guarantee`)}</li>` : ""}<li>${ICON.check}${tr("Estuda no telemóvel ou computador", "Learn on phone or computer")}</li><li>${ICON.check}${tr("Curso revisto pela nossa equipa", "Reviewed by our team")}</li></ul>
        ${c.affiliate_enabled && c.status === "approved" && !owner ? `<a class="aff-link" href="#/afiliados?curso=${esc(id)}">${ICON.link} ${tr(`Promove este curso e ganha ${Number(c.affiliate_pct)}%`, `Promote this course and earn ${Number(c.affiliate_pct)}%`)}</a>` : ""}
      </div>
    </aside>
  </section>
  ${canBuy && !pending ? `<div class="buy-bar"><div>${offerPriceHTML(c)}</div><a class="btn btn-primary" href="${buyHref}">${free ? tr("Inscrever-me", "Enrol") : tr("Comprar agora", "Buy now")}</a></div>` : ""}`;
}

// ---------- Como funciona / produtores ----------
export async function howItWorks(main) {
  main.innerHTML = `<section class="page container narrow">
    <h1 class="page-title">${tr("Como funciona", "How it works")}</h1>
    <div class="two-col">
      <div class="panel"><h2>${tr("Para quem quer aprender", "For learners")}</h2>
        <ol class="num-list"><li>${tr("Escolhe um curso na montra.", "Pick a course from the marketplace.")}</li><li>${tr("Cria a tua conta grátis e faz o pedido.", "Create your free account and place your order.")}</li><li>${tr("Assim que a compra é confirmada, o curso aparece em «Os meus cursos».", "Once the purchase is confirmed, the course appears in “My courses”.")}</li><li>${tr("Estuda ao teu ritmo e marca as aulas concluídas.", "Learn at your own pace and mark lessons as done.")}</li></ol>
        <a class="btn btn-green" href="#/cursos">${tr("Ver cursos", "Browse courses")}</a></div>
      <div class="panel"><h2>${tr("Para quem quer vender", "For creators")}</h2>
        <ol class="num-list"><li>${tr("Cria a tua conta e pede para ser produtor.", "Create your account and apply to be a creator.")}</li><li>${tr("Cria o curso: módulos, aulas em vídeo e PDFs.", "Build the course: modules, video lessons and PDFs.")}</li><li>${tr("Publica: a equipa revê e aprova.", "Publish: our team reviews and approves it.")}</li><li>${tr("Vende e acompanha tudo no teu painel.", "Sell and track everything in your dashboard.")}</li></ol>
        <a class="btn btn-primary" href="#/para-produtores">${tr("Quero vender", "I want to sell")}</a></div>
    </div>
  </section>`;
}

export async function forProducers(main, _p, _q, alive) {
  const pct = Number(state.settings.commission_pct ?? 10);
  const target = state.user ? (state.roles.includes("producer") || isAdmin() ? "#/produtor" : "#/ser-produtor") : "#/registar?produtor=1";
  const loc = state.currency === "MZN";
  const ex = loc ? 1000 : 20, fee = ex * pct / 100;
  const fm = (v) => (loc ? mzn(v) : curPrice({ price_mzn: v * usdRate(), price_usd: v }));
  main.innerHTML = `<section class="mn">
    <div class="container mn-in">
      <h1>${tr("Vende o que sabes.", "Sell what you know.")}<em>${tr("Recebe onde estiveres.", "Get paid wherever you are.")}</em></h1>
      <p>${tr("A tua loja de cursos, ebooks e templates pronta em minutos. Sem mensalidade, sem programar.", "Your store for courses, ebooks and templates, ready in minutes. No monthly fee, no coding.")}</p>
      <a class="btn btn-primary btn-lg" href="${target}">${tr("Criar a minha loja grátis", "Create my free store")} ${ICON.arrow}</a>
      <small>${tr(`Só pagas ${pct}% quando vendes.`, `You only pay ${pct}% when you sell.`)}</small>
      <div class="mn-mock" id="mnMock" aria-hidden="true">
        <div class="mn-bar"><i></i><i></i><i></i><span>uquiorrapay.com</span></div>
        <div class="mn-row"><div class="mn-cv"><img src="${catPhoto("Negócios", 640)}" alt="" data-fallback></div>
          <div class="mn-inf"><h3>${tr("O teu produto aqui", "Your product here")}</h3><span>${tr("Ebook · Negócios", "Ebook · Business")}</span><b>${esc(curPrice({ price_mzn: 499, price_usd: 8 }))}</b><span class="btn btn-primary">${tr("Comprar agora", "Buy now")}</span></div></div>
      </div>
    </div>
  </section>
  <section class="mn-feats container">
    <div><span>${ICON.doc}</span><b>${tr("Página de venda automática", "Automatic sales page")}</b><p>${tr("Carregas o produto e a página fica pronta: vídeo, bónus, garantia e botão de compra.", "Upload your product and the page is ready: video, bonuses, guarantee and buy button.")}</p></div>
    <div><span>${ICON.bolt}</span><b>${tr("Entrega imediata", "Instant delivery")}</b><p>${tr("O cliente paga e o produto aparece logo na área de membros dele.", "The customer pays and the product shows up in their members area.")}</p></div>
    <div><span>${ICON.trend}</span><b>${tr("Painel em tempo real", "Real-time dashboard")}</b><p>${tr("Vê vendas, perguntas dos alunos e saldo. Saque na hora: o dinheiro fica disponível logo após cada venda (só fica retido se ofereceres garantia).", "See sales, student questions and balance. Instant withdrawal: money is available right after each sale (only held if you offer a guarantee).")}</p></div>
    <div><span>${ICON.gift}</span><b>${tr("Order bump, upsell e downsell", "Order bump, upsell & downsell")}</b><p>${tr("Oferece um produto extra no checkout e ofertas especiais logo depois do pagamento. Vende mais a cada cliente.", "Offer an extra product at checkout and special offers right after payment. Sell more to every customer.")}</p></div>
    <div><span>${ICON.link}</span><b>${tr("Afiliados e cupões", "Affiliates & coupons")}</b><p>${tr("Outras pessoas vendem por ti em troca de comissão, e tu crias promoções.", "Others sell for you for a commission, and you run promotions.")}</p></div>
  </section>
  <section class="container mn-calc-wrap">
    <div class="calc panel">
      <h2>${tr("Quanto ganhas numa venda?", "How much do you earn per sale?")}</h2>
      <div class="calc-rows">
        <div><span>${tr("Preço do produto", "Product price")}</span><b>${esc(fm(ex))}</b></div>
        <div><span>${tr(`Comissão da plataforma (${pct}%)`, `Platform fee (${pct}%)`)}</span><b>−${esc(fm(fee))}</b></div>
        <div class="tot"><span>${tr("Fica para ti", "You keep")}</span><b>${esc(fm(ex - fee))}</b></div>
      </div>
      <p class="small muted">${tr("Se a venda vier de um afiliado, a comissão dele sai da tua parte, na percentagem que tu definires.", "If the sale comes from an affiliate, their commission comes out of your share, at the rate you set.")}</p>
    </div>
    <p class="mk-pay">${tr("Os teus clientes pagam com", "Your customers pay with")}: <b>${payMethods().map(([n]) => n).join(" · ")}</b></p>
  </section>
  <section class="container"><div class="panel saas-soon" id="saas">
    <span class="soon-tag">${tr("Em desenvolvimento", "In development")}</span>
    <h2>Uquiorrapay SaaS</h2>
    <p>${tr("Em breve: a tua própria plataforma de cursos com o teu domínio e a tua marca, com tudo o que já tens aqui — checkout, área de membros, afiliados, order bump, upsell e pagamentos por M-Pesa, e-Mola, PayPal e cartão.", "Coming soon: your own course platform on your domain and brand, with everything you already have here — checkout, members area, affiliates, order bump, upsell and payments by M-Pesa, e-Mola, PayPal and card.")}</p>
    <a class="btn btn-soft" href="#/saas">${tr("Saber mais", "Learn more")} ${ICON.arrow}</a>
  </div></section>
  <section class="mn-end"><div class="container">
    <h2>${tr("Pronto para a tua primeira venda?", "Ready for your first sale?")}</h2>
    <a class="btn btn-primary btn-lg" href="${target}">${tr("Começar agora", "Start now")} ${ICON.arrow}</a>
  </div></section>`;
  // Mostra um produto real à venda na maqueta (se houver)
  const list = await api.listApproved({ featured: true, limit: 1 }).catch(() => []);
  const c = list[0] || (await api.listApproved({ limit: 1 }).catch(() => []))[0];
  if (!c || (alive && !alive())) return;
  const mock = document.getElementById("mnMock"); if (!mock) return;
  mock.querySelector(".mn-cv").innerHTML = c.cover_url ? `<img src="${esc(c.cover_url)}" alt="">` : `<img src="${catPhoto(c.category, 640)}" alt="" data-fallback>`;
  mock.querySelector(".mn-inf").innerHTML = `<h3>${esc(c.title)}</h3><span>${esc(typeLabel(c.product_type))} · ${esc(catLabel(c.category || ""))}</span><b>${esc(Number(c.price_mzn) ? curPrice(c) : tr("Grátis", "Free"))}</b><a class="btn btn-primary" href="#/curso/${esc(c.id)}">${tr("Ver produto", "View product")}</a>`;
}

// ---------- Páginas institucionais ----------
const kDays = () => Number(state.settings.kyc?.withdraw_days ?? 3);
function textPage(main, title, html) {
  main.innerHTML = `<section class="page container narrow"><h1 class="page-title">${title}</h1><div class="prose panel">${html}</div></section>`;
}

export async function about(main) {
  textPage(main, tr("Sobre a Uquiorrapay", "About Uquiorrapay"), tr(`
    <p>A Uquiorrapay é um marketplace global de produtos digitais — cursos, ebooks, templates e áudios. Ligamos quem sabe ensinar a quem quer aprender, em qualquer país.</p>
    <p>Os criadores publicam os seus produtos e cada um é revisto pela nossa equipa antes de ficar à venda, para garantir qualidade a quem compra. Depois de aprovado, o produto ganha página de venda e checkout prontos, e pode ser divulgado por afiliados.</p>
    <p>Quem compra paga com PayPal ou cartão Visa/Mastercard em dólares, ou com M-Pesa e e-Mola em Moçambique, e estuda ao seu ritmo no telemóvel ou no computador.</p>
    <p>Nascemos em Moçambique e crescemos para o mundo, com produtos em português e inglês.</p>`, `
    <p>Uquiorrapay is a global marketplace for digital products — courses, ebooks, templates and audio. We connect people who know how to teach with people who want to learn, in any country.</p>
    <p>Creators publish their products and each one is reviewed by our team before going on sale, so buyers get quality content. Once approved, the product gets a ready-made sales page and checkout, and affiliates can promote it.</p>
    <p>Buyers pay by PayPal or Visa/Mastercard in US dollars — or with M-Pesa and e-Mola in Mozambique — and learn at their own pace on phone or computer.</p>
    <p>Born in Mozambique, growing worldwide, with products in Portuguese and English.</p>`));
}

export async function terms(main) {
  const pct = Number(state.settings.commission_pct ?? 10);
  textPage(main, tr("Termos de Uso", "Terms of Use"), tr(`
    <ol>
    <li><b>Quem somos.</b> A Uquiorrapay é um marketplace global de produtos digitais, operado a partir de Moçambique. Ao criar conta, aceitas estes termos.</li>
    <li><b>Contas.</b> És responsável pelos teus dados de acesso. Tens de ter pelo menos 18 anos, ou autorização de um encarregado de educação, para comprar ou vender.</li>
    <li><b>Produtores.</b> Quem publica um curso garante que o conteúdo é seu ou que tem direito a vendê-lo. É proibido conteúdo ilegal, enganoso, ofensivo, adulto (+18) ou copiado de terceiros — ver as <a href="#/diretrizes">Diretrizes de conteúdo</a>.</li>
    <li><b>Aprovação.</b> Todos os cursos são revistos antes de ficarem à venda. A Uquiorrapay pode recusar ou retirar um curso que não cumpra estes termos, indicando o motivo.</li>
    <li><b>Preços.</b> Cada produto tem dois preços definidos pelo produtor: um em dólares (USD), cobrado nos pagamentos internacionais (PayPal e cartão), e outro em meticais (MZN), cobrado no M-Pesa e e-Mola. Valores noutras moedas são aproximados.</li>
    <li><b>Comissão.</b> A Uquiorrapay retém ${pct}% de cada venda. O restante pertence ao produtor.</li>
    <li><b>Acesso aos cursos.</b> Depois de confirmada a compra, o aluno tem acesso ao curso enquanto este estiver disponível na plataforma. É proibido partilhar, copiar ou revender o conteúdo.</li>
    <li><b>Reembolsos.</b> Nos produtos em que o produtor oferece garantia (indicada na página de venda e no checkout), o aluno pode pedir reembolso até ${gDays()} dias após a compra, se não tiver assistido a mais de 20% do conteúdo. Nos restantes produtos a venda é final, salvo falha de entrega do conteúdo.</li>
    <li><b>Certificados.</b> Quando disponíveis, os certificados comprovam a conclusão do curso na plataforma; não são diplomas oficiais.</li>
    <li><b>Verificação, conformidade e segurança (KYC/AML).</b> Para garantir a segurança, prevenir fraude e cumprir obrigações legais (incluindo as regras contra o branqueamento de capitais), a Uquiorrapay pode pedir documentos e informações adicionais — por exemplo, documento de identificação, comprovativos de morada e confirmação da titularidade das contas de recebimento. Enquanto investiga situações atípicas, pode aplicar medidas preventivas, como limitar funcionalidades, reter valores temporariamente ou bloquear levantamentos. O utilizador autoriza a Uquiorrapay a verificar estes dados junto de parceiros de pagamento e prestadores tecnológicos, apenas na medida necessária para prestar o serviço e gerir o risco.</li>
    <li><b>Levantamentos.</b> O prazo máximo de processamento de um levantamento é de até ${kDays()} dias, podendo variar por exigências operacionais, validações de segurança, indisponibilidade do parceiro de pagamento, feriados ou força maior. Só são feitos levantamentos para contas em nome do titular verificado.</li>
    <li><b>Retenção temporária de valores.</b> A Uquiorrapay pode reter temporariamente valores em caso de reembolso ou disputa de pagamento, suspeita de fraude, verificação de identidade incompleta ou recusada, ordem legal, reclamações repetidas de compradores ou risco operacional. O utilizador é informado do motivo e os valores são libertados quando a situação ficar resolvida.</li>
    <li><b>Alterações.</b> Podemos actualizar estes termos; avisamos os utilizadores por email com antecedência.</li>
    <li><b>Lei aplicável.</b> Estes termos regem-se pela lei da República de Moçambique.</li>
    </ol>`, `
    <ol>
    <li><b>Who we are.</b> Uquiorrapay is a global marketplace for digital products, operated from Mozambique. By creating an account, you accept these terms.</li>
    <li><b>Accounts.</b> You are responsible for your login details. You must be at least 18, or have a guardian's permission, to buy or sell.</li>
    <li><b>Producers.</b> Anyone publishing a course guarantees the content is theirs or that they have the right to sell it. Illegal, misleading, offensive, adult (18+) or copied content is not allowed — see the <a href="#/diretrizes">Content guidelines</a>.</li>
    <li><b>Approval.</b> Every course is reviewed before going on sale. Uquiorrapay may reject or remove a course that breaks these terms, stating the reason.</li>
    <li><b>Prices.</b> Each product has two prices set by the creator: one in US dollars (USD), charged for international payments (PayPal and card), and one in Mozambican meticals (MZN), charged via M-Pesa and e-Mola. Amounts in other currencies are approximate.</li>
    <li><b>Commission.</b> Uquiorrapay keeps ${pct}% of each sale. The rest belongs to the producer.</li>
    <li><b>Course access.</b> Once the purchase is confirmed, the student has access to the course while it remains on the platform. Sharing, copying or reselling the content is not allowed.</li>
    <li><b>Refunds.</b> On products where the creator offers a guarantee (shown on the sales page and at checkout), students may request a refund within ${gDays()} days of purchase if they have used no more than 20% of the content. On other products the sale is final, except when the content is not delivered.</li>
    <li><b>Certificates.</b> When available, certificates confirm course completion on the platform; they are not official diplomas.</li>
    <li><b>Verification, compliance and security (KYC/AML).</b> To keep the platform safe, prevent fraud and meet legal obligations (including anti-money-laundering rules), Uquiorrapay may request documents and additional information — e.g. ID, proof of address and proof of ownership of payout accounts. While investigating unusual activity it may apply preventive measures such as limiting features, temporarily holding funds or blocking withdrawals. Users authorise Uquiorrapay to verify this data with payment partners and technology providers, only as needed to provide the service and manage risk.</li>
    <li><b>Withdrawals.</b> Withdrawals are processed within up to ${kDays()} days; this may vary due to operational requirements, security checks, payment partner downtime, holidays or force majeure. Payouts are only made to accounts in the verified holder's name.</li>
    <li><b>Temporary holds.</b> Uquiorrapay may temporarily hold funds in case of refunds or payment disputes, suspected fraud, incomplete or rejected identity verification, legal orders, repeated buyer complaints or operational risk. Users are told the reason and funds are released once the matter is resolved.</li>
    <li><b>Changes.</b> We may update these terms and will notify users by email in advance.</li>
    <li><b>Governing law.</b> These terms are governed by the laws of the Republic of Mozambique.</li>
    </ol>`));
}

export async function privacy(main) {
  textPage(main, tr("Política de Privacidade", "Privacy Policy"), tr(`
    <ul>
    <li><b>Dados que recolhemos:</b> nome, email, país, número de telefone, cursos comprados, progresso nas aulas e histórico de pedidos.</li>
    <li><b>Verificação de identidade:</b> para quem vende e levanta dinheiro, guardamos o nome, tipo e número do documento, data de nascimento, morada e as fotografias do documento e da selfie. Estes dados ficam numa área privada, só a equipa de verificação lhes acede, e são usados apenas para segurança, prevenção de fraude e cumprimento legal. As imagens do documento e a selfie são apagadas automaticamente 30 dias depois de a verificação ser aprovada ou rejeitada; fica só o resultado (nome, tipo e número do documento e datas).</li>
    <li><b>Dados que não guardamos:</b> PINs, senhas de carteira móvel ou dados completos de cartão.</li>
    <li><b>Para que usamos:</b> criar e gerir a tua conta, processar compras, dar acesso aos cursos, enviar emails sobre a tua conta e melhorar a plataforma.</li>
    <li><b>Com quem partilhamos:</b> com parceiros de pagamento (para processar a compra), com o produtor do curso que compraste e com fornecedores técnicos que alojam o site. Não vendemos os teus dados.</li>
    <li><b>Marketing:</b> só enviamos novidades se aceitares; podes cancelar a qualquer momento.</li>
    <li><b>Cookies e pixels de anúncios:</b> usamos pixels do Meta (Facebook/Instagram), TikTok e Google para medir visitas, inícios de compra e compras e mostrar anúncios mais relevantes. O produtor de um produto pode ter o seu próprio pixel do Meta nesse produto. Não enviamos o teu nome, email, telefone nem dados de pagamento por estes pixels. Podes bloqueá-los nas definições do navegador ou com um bloqueador de anúncios.</li>
    <li><b>Os teus direitos:</b> podes pedir para ver, corrigir ou apagar os teus dados através da página de contacto.</li>
    <li><b>Segurança:</b> os dados são guardados em servidores protegidos, com acesso limitado à equipa que precisa deles.</li>
    </ul>`, `
    <ul>
    <li><b>Data we collect:</b> name, email, country, phone number, courses purchased, lesson progress and order history.</li>
    <li><b>Identity verification:</b> for sellers who withdraw money we keep name, document type and number, date of birth, address and the document and selfie photos — stored privately, accessible only to the verification team, and used only for security, fraud prevention and legal compliance. Document images and the selfie are deleted automatically 30 days after the verification is approved or rejected; only the outcome is kept (name, document type and number, dates).</li>
    <li><b>Data we don't store:</b> PINs, mobile wallet passwords or full card details.</li>
    <li><b>How we use it:</b> to create and manage your account, process purchases, give you course access, email you about your account and improve the platform.</li>
    <li><b>Who we share it with:</b> payment partners (to process the purchase), the producer of a course you bought and technical providers that host the site. We do not sell your data.</li>
    <li><b>Marketing:</b> we only send news if you opt in; you can unsubscribe at any time.</li>
    <li><b>Cookies and ad pixels:</b> we use Meta (Facebook/Instagram), TikTok and Google pixels to measure visits, checkouts and purchases and show more relevant ads. A product's creator may have their own Meta pixel on that product. We don't send your name, email, phone or payment details through these pixels. You can block them in your browser settings or with an ad blocker.</li>
    <li><b>Your rights:</b> you can ask to see, correct or delete your data through the contact page.</li>
    <li><b>Security:</b> data is kept on protected servers, with access limited to the team members who need it.</li>
    </ul>`));
}

export async function contact(main) {
  const s = state.settings;
  const email = (typeof s.support_email === "string" && s.support_email) || "uquiorrapostsa@gmail.com";
  const wa = supportWaText();
  textPage(main, tr("Contacto", "Contact"), `
    <p>${tr("Tens uma dúvida sobre um curso, uma compra ou queres começar a vender? Fala connosco. Se for sobre uma compra, indica a referência do pedido.",
      "Have a question about a course, a purchase, or want to start selling? Get in touch. If it's about a purchase, please include your order reference.")}</p>
    <div class="contact-cards">
      <a class="panel contact" href="mailto:${esc(email)}"><b>Email</b><span>${esc(email)}</span></a>
      ${wa ? `<a class="panel contact" href="https://wa.me/${esc(wa.replace(/\D/g, ""))}" target="_blank" rel="noopener"><b>WhatsApp</b><span>${esc(wa)}</span></a>` : ""}
    </div>
    <p class="muted">${tr("Segunda a sexta, 8h–17h (GMT+2). Respondemos até 24 horas úteis.", "Monday to Friday, 8am–5pm (GMT+2). We reply within 1 business day.")}</p>`);
}

// SaaS (plataforma própria para cada produtor): em desenvolvimento
export async function saasPage(main) {
  const wa = supportWa();
  const msg = encodeURIComponent(tr("Olá! Quero ser avisado quando o Uquiorrapay SaaS estiver disponível.", "Hi! I want to be notified when Uquiorrapay SaaS is available."));
  textPage(main, "Uquiorrapay SaaS", `
    <p><span class="soon-tag">${tr("Em desenvolvimento · brevemente", "In development · coming soon")}</span></p>
    <p>${tr("Estamos a construir o Uquiorrapay SaaS: a tua própria plataforma de venda de cursos, ebooks e templates, com o teu domínio, a tua marca e as tuas regras — sem programar.", "We're building Uquiorrapay SaaS: your own platform to sell courses, ebooks and templates, on your domain, with your brand and your rules — no coding.")}</p>
    <ul class="saas-list">
      <li>${ICON.check}<span>${tr("Loja e páginas de venda com a tua marca e domínio", "Store and sales pages with your brand and domain")}</span></li>
      <li>${ICON.check}<span>${tr("Checkout com M-Pesa, e-Mola, PayPal e cartão", "Checkout with M-Pesa, e-Mola, PayPal and card")}</span></li>
      <li>${ICON.check}<span>${tr("Área de membros, afiliados, cupões, order bump, upsell e downsell", "Members area, affiliates, coupons, order bump, upsell and downsell")}</span></li>
      <li>${ICON.check}<span>${tr("Saque na hora e painel em tempo real", "Instant withdrawal and real-time dashboard")}</span></li>
    </ul>
    <p class="muted">${tr("Ainda não há data de lançamento. Entretanto, podes vender normalmente na Uquiorrapay.", "No launch date yet. In the meantime, you can sell as usual on Uquiorrapay.")}</p>
    <div class="order-actions">${wa ? `<a class="btn btn-primary" href="https://wa.me/${esc(wa)}?text=${msg}" target="_blank" rel="noopener">${ICON.whats} ${tr("Quero ser avisado", "Notify me")}</a>` : ""}<a class="btn btn-ghost-dark" href="#/para-produtores">${tr("Vender na Uquiorrapay", "Sell on Uquiorrapay")}</a></div>`);
}

export function notFound() {
  return `<section class="page container narrow center">${emptyState(tr("Página não encontrada", "Page not found"), "", `<a class="btn btn-green" href="#/">${tr("Voltar ao início", "Back to home")}</a>`)}</section>`;
}
export function forbidden() {
  return `<section class="page container narrow center">${emptyState(tr("Sem acesso", "No access"), tr("Esta área é reservada à administração.", "This area is for administrators only."), `<a class="btn btn-green" href="#/">${tr("Voltar ao início", "Back to home")}</a>`)}</section>`;
}

// ---------- Diretrizes de conteúdo (baseadas em Hotmart, Udemy, Teachable, Kajabi, Gumroad e nas regras das redes de pagamento) ----------
const GUIDE = () => [
  ["🔞", tr("Conteúdo adulto (+18) — proibição total", "Adult content (18+) — fully prohibited"), "grave", tr(`
    <p><b>Não aceitamos, em nenhuma circunstância</b>, produtos de conteúdo adulto. Isto inclui:</p>
    <ul>
      <li>Pornografia, nudez ou seminudez com intenção sexual, actos sexuais explícitos ou simulados.</li>
      <li>Textos, contos, áudios ou vídeos eróticos; «conteúdo hot», «black», «+18», «proibidão», «packs» de fotos ou vídeos sensuais.</li>
      <li>Venda de acesso a OnlyFans, Privacy, webcam, chat erótico ou grupos adultos.</li>
      <li>Acompanhantes, encontros sexuais, «engate» com fim sexual, fetiches, brinquedos sexuais e técnicas sexuais com demonstração.</li>
      <li>Capas, imagens ou títulos sugestivos: roupa íntima em pose sexual, foco em partes íntimas, duplo sentido sexual, links para sites adultos.</li>
      <li><b>Qualquer sexualização de menores: tolerância zero.</b> A conta é banida de imediato e o caso é comunicado às autoridades.</li>
    </ul>
    <p><b>Permitido apenas:</b> educação sexual e saúde reprodutiva com linguagem médica e sem imagens explícitas; relacionamentos e autoestima sem conteúdo sexual. <b>Na dúvida, é recusado.</b></p>
    <p class="small muted">Consequência: rejeição imediata do produto; na reincidência, suspensão da conta e retenção dos saldos ligados ao conteúdo proibido.</p>`, `
    <p><b>We never accept</b> adult products: pornography, sexual nudity, explicit or simulated sex acts, erotic texts/audio/video, “hot/18+” packs, OnlyFans-type access, escorts, hook-ups, fetishes, sex toys, suggestive covers or titles, links to adult sites. <b>Any sexualisation of minors: zero tolerance</b> — immediate ban and report to the authorities. Only medical-style sex education without explicit images is allowed. When in doubt, it's rejected.</p>`)],
  ["⚠️", tr("Promessas falsas ou enganosas", "False or misleading promises"), "grave", tr(`
    <ul>
      <li>Ganhos garantidos: «ganha 50 000 MZN por semana», «fica rico rápido», «sem esforço», renda fixa de investimentos variáveis.</li>
      <li>Ostentação (dinheiro, carros, luxo) para fazer crer que lucrar é fácil.</li>
      <li>Resultados garantidos de saúde ou corpo: «perde 10 kg em 7 dias», «cura garantida», «deixa os remédios».</li>
      <li>Falsos certificados ou diplomas «reconhecidos», falsa autoria ou celebridade, depoimentos inventados, escassez falsa («só hoje») e preços riscados falsos.</li>
    </ul>
    <p><b>Permitido:</b> explicar o que ensinas e mostrar resultados realistas, com a nota «os resultados variam de pessoa para pessoa».</p>`, `
    <p>No guaranteed earnings, “get rich quick”, luxury showing-off, guaranteed health/body results or cures, fake certificates, fake authorship, invented testimonials or fake scarcity. Describe what you teach and realistic results instead.</p>`)],
  ["🩺", tr("Saúde, fitness e emagrecimento", "Health, fitness and weight loss"), "media", tr(`
    <ul><li>Sem dietas extremas, jejuns perigosos ou incentivo a distúrbios alimentares.</li><li>Sem venda, receita ou dosagem de medicamentos e suplementos.</li><li>Sem tratamentos sem base científica nem conselhos para abandonar o médico.</li><li>Recomenda acompanhamento profissional quando fizer sentido.</li></ul>`, `
    <p>No extreme diets, no selling or prescribing medicines/supplements, no unproven treatments; recommend professional follow-up.</p>`)],
  ["💸", tr("Dinheiro, investimentos e apostas", "Money, investing and betting"), "grave", tr(`
    <ul><li>Pirâmides e marketing multinível baseado em recrutar pessoas.</li><li>Apostas e jogos de azar «com método garantido».</li><li>Sinais, robôs ou estratégias de forex/cripto com lucro garantido.</li></ul>
    <p>Cursos de finanças pessoais, poupança e investimento são bem-vindos, desde que expliquem os riscos.</p>`, `
    <p>No pyramid/MLM recruiting schemes, “guaranteed” betting methods or forex/crypto signals with guaranteed profit. Personal finance courses are welcome if they explain risks.</p>`)],
  ["©️", tr("Pirataria e direitos de autor", "Piracy and copyright"), "grave", tr(`
    <ul><li>Revender cursos, livros, músicas, filmes, imagens ou software de outras pessoas sem licença.</li><li>Conteúdo «PLR» ou «direitos de revenda» sem prova de licença.</li><li>Contas partilhadas de serviços pagos.</li></ul>
    <p>Ao enviar um produto, confirmas que o conteúdo é teu ou que tens direito a vendê-lo.</p>`, `
    <p>No reselling others' courses, books, music, films or software without a licence, no unlicensed PLR, no shared paid accounts.</p>`)],
  ["🛑", tr("Fraude, golpes e conteúdo ilegal", "Fraud, scams and illegal content"), "grave", tr(`
    <ul><li>Hacking, invasão de contas, phishing, cartões clonados, documentos falsos.</li><li>Truques para burlar M-Pesa, e-Mola, bancos ou outras plataformas; seguidores ou avaliações falsas; spam.</li><li>Drogas, armas, explosivos, violência, terrorismo, auto-lesão, venda de dados pessoais.</li></ul>`, `
    <p>No hacking, phishing, fake documents, ways to cheat M-Pesa/e-Mola/banks, fake followers, drugs, weapons, violence, self-harm or selling personal data.</p>`)],
  ["🤝", tr("Ódio e assédio", "Hate and harassment"), "grave", tr(`
    <p>Proibido discriminar ou atacar pessoas por raça, etnia, religião, género, deficiência ou origem, e qualquer forma de assédio.</p>`, `
    <p>No discrimination or attacks based on race, ethnicity, religion, gender, disability or origin, and no harassment.</p>`)],
  ["✅", tr("Qualidade mínima", "Minimum quality"), "leve", tr(`
    <ul><li>Título e descrição claros e honestos, iguais ao que o comprador recebe.</li><li>Conteúdo real e completo (nada de produtos vazios ou «em breve»).</li><li>Capa própria e legível; preço coerente com o conteúdo.</li><li>Suporte ao comprador preenchido (WhatsApp e email) — obrigatório.</li></ul>`, `
    <p>Clear and honest title and description, real and complete content, own cover, fair price and buyer support filled in (required).</p>`)],
];
export async function guidelines(main) {
  const sev = { grave: tr("Proibido", "Prohibited"), media: tr("Regras", "Rules"), leve: tr("Obrigatório", "Required") };
  main.innerHTML = `<section class="page container narrow guide-page">
    <h1 class="page-title">${tr("Diretrizes de conteúdo", "Content guidelines")}</h1>
    <p class="lead muted">${tr("O que pode e não pode ser vendido na Uquiorrapay. Baseadas nas regras das maiores plataformas do mundo (Hotmart, Udemy, Teachable, Kajabi, Gumroad) e das redes de pagamento.", "What can and cannot be sold on Uquiorrapay. Based on the rules of the world's largest platforms (Hotmart, Udemy, Teachable, Kajabi, Gumroad) and payment networks.")}</p>
    <div class="guide-how card-box"><b>${ICON.shield} ${tr("Como revemos os produtos", "How we review products")}</b>
      <ol class="small"><li>${tr("Quando envias para análise, a nossa IA lê o título, a descrição, a capa e os documentos e compara com estas regras.", "When you submit, our AI reads the title, description, cover and documents and checks them against these rules.")}</li>
      <li>${tr("Produtos muito bem feitos e sem qualquer problema podem ser aprovados logo. Casos graves (ex.: conteúdo adulto) são recusados de imediato.", "Excellent products with no issues may be approved right away. Serious cases (e.g. adult content) are rejected immediately.")}</li>
      <li>${tr("Nos restantes, a equipa da Uquiorrapay decide. Vídeos e áudios são sempre verificados por uma pessoa.", "Otherwise our team decides. Videos and audio are always checked by a person.")}</li>
      <li>${tr("Se não concordares com uma decisão, corrige e envia de novo, ou fala connosco em", "If you disagree with a decision, fix and resubmit, or contact us at")} <a href="#/contacto">${tr("Contacto", "Contact")}</a>.</li></ol></div>
    ${GUIDE().map(([ic, t, s, html]) => `<article class="guide-sec sev-${s}"><h2><span class="g-ic">${ic}</span>${t}<span class="g-sev">${sev[s]}</span></h2><div class="prose">${html}</div></article>`).join("")}
    <p class="small muted">${tr("Produtos que violem estas diretrizes podem ser retirados a qualquer momento, mesmo depois de aprovados. Estas regras complementam os", "Products breaking these guidelines may be removed at any time, even after approval. These rules complement the")} <a href="#/termos">${tr("Termos de Uso", "Terms of Use")}</a>.</p>
  </section>`;
}

// ---------- Baixar a app (APK Android + instalar pelo navegador) ----------
export async function appPage(main) {
  const apk = state.settings.android_apk || {};
  const url = typeof apk.url === "string" && /^https:\/\//.test(apk.url) ? apk.url : "";
  const size = Number(apk.size) ? ` · ${(Number(apk.size) / 1048576).toFixed(1).replace(".", state.lang === "pt" ? "," : ".")} MB` : "";
  const ios = /iPhone|iPad/i.test(navigator.userAgent);
  const step = (n, t, d) => `<li><b class="as-n">${n}</b><div><b>${t}</b><small>${d}</small></div></li>`;
  main.innerHTML = `<section class="app-hero"><div class="container ah-in">
      <div class="ah-copy">
        <span class="uh-eyebrow"><i></i>Android · iPhone · ${tr("Computador", "Computer")}</span>
        <h1>${tr("A Uquiorrapay no teu bolso", "Uquiorrapay in your pocket")}</h1>
        <p>${tr("Recebe um aviso a cada venda, acompanha a carteira e abre os teus cursos num toque.", "Get an alert for every sale, follow your wallet and open your courses in one tap.")}</p>
        <div class="ah-btns">
          ${url ? `<a class="btn btn-primary btn-lg" id="apkBtn" href="${esc(url)}" download="uquiorrapay.apk">⬇ ${tr("Baixar APK para Android", "Download Android APK")}</a>` : ""}
          <button type="button" class="btn btn-white btn-lg" id="pwaBtn" hidden>📲 ${tr("Instalar pelo navegador", "Install from browser")}</button>
        </div>
        <small class="ah-meta">${url ? `${tr("Versão", "Version")} ${esc(apk.version || "1.0")}${size} · ${tr("grátis", "free")}` : tr("O ficheiro APK estará disponível em breve. Entretanto, instala pelo navegador.", "The APK will be available soon. Meanwhile, install from your browser.")}</small>
      </div>
      <div class="ah-art"><img src="img/app/maskable-512.png" alt="Uquiorrapay" width="220" height="220"></div>
    </div></section>
    <section class="container app-steps">
      <div class="as-col"><h2>🤖 ${tr("Android (APK)", "Android (APK)")}</h2><ol>
        ${step(1, tr("Baixa o ficheiro", "Download the file"), tr("Carrega em «Baixar APK para Android».", "Tap “Download Android APK”."))}
        ${step(2, tr("Abre o ficheiro", "Open the file"), tr("Nas transferências do telemóvel, toca em uquiorrapay.apk.", "In your downloads, tap uquiorrapay.apk."))}
        ${step(3, tr("Permite a instalação", "Allow the install"), tr("Se o telemóvel pedir, ativa «Permitir desta fonte» (instalar apps desconhecidas) e volta.", "If asked, turn on “Allow from this source” and go back."))}
        ${step(4, tr("Entra e ativa os avisos", "Sign in and turn on alerts"), tr("Abre a app, entra na tua conta e carrega em «Ativar notificações» no painel.", "Open the app, sign in and tap “Turn on notifications” on your dashboard."))}
      </ol></div>
      <div class="as-col"><h2>🍎 iPhone</h2><ol>
        ${step(1, tr("Abre no Safari", "Open in Safari"), "uquiorrapay.com")}
        ${step(2, tr("Partilhar", "Share"), tr("Toca no botão Partilhar (quadrado com seta).", "Tap the Share button."))}
        ${step(3, tr("Adicionar ao ecrã principal", "Add to Home Screen"), tr("Confirma com «Adicionar». O ícone aparece no ecrã.", "Confirm with “Add”."))}
      </ol></div>
      <div class="as-col"><h2>💻 ${tr("Computador", "Computer")}</h2><ol>
        ${step(1, tr("Abre no Chrome ou Edge", "Open in Chrome or Edge"), "uquiorrapay.com")}
        ${step(2, tr("Instalar", "Install"), tr("Carrega em «📲 Instalar app» na barra de cima ou no ícone de instalar na barra de endereço.", "Click “📲 Install app” at the top or the install icon in the address bar."))}
      </ol></div>
    </section>`;
  // Instalação pelo navegador (Android/computador) quando o Chrome a oferece
  const pwa = document.getElementById("pwaBtn"), top = document.querySelector(".tb-app");
  if (pwa && top && !top.hidden && !ios) { pwa.hidden = false; pwa.onclick = () => top.click(); }
  document.getElementById("apkBtn")?.addEventListener("click", () => setTimeout(() => toast(tr("A transferência começou. Abre o ficheiro quando terminar.", "Download started. Open the file when it finishes.")), 400));
}
