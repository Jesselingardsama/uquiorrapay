// Arranque, navegação (router), barra de topo, menu e rodapé.
import { api } from "./api.js?v=202610092030";
import { state, tr, esc, isProducer, isAdmin, setLang, setCurrency, initLocale, brandHTML, ICON, toast, loading, errorBox, appMenuHTML, activeKey, CONFIG, supportWa } from "./ui.js?v=202610092030";
import * as pub from "./views/public.js?v=202610092030";
import { initTracking, pageView } from "./track.js?v=202610092030";
import * as acc from "./views/account.js?v=202610092030";
import * as prod from "./views/producer.js?v=202610092030";
import * as adm from "./views/admin.js?v=202610092030";
import * as wal from "./views/wallet.js?v=202610092030";
import * as sec from "./views/security.js?v=202610092030";
import { mountAssistant } from "./assistant.js?v=202610092030";
import * as kyc from "./views/kyc.js?v=202610092030";
import * as onb from "./views/onboarding.js?v=202610092030";

// Regresso do link do email (confirmação de conta): o Supabase lê os dados do endereço
let fromEmailLink = /type=(signup|email|magiclink)/.test(location.hash);
const routes = [
  ["/", pub.home],
  ["/cursos", pub.catalog],
  ["/curso/:id", pub.course],
  ["/como-funciona", pub.howItWorks],
  ["/para-produtores", pub.forProducers],
  ["/sobre", pub.about],
  ["/termos", pub.terms],
  ["/privacidade", pub.privacy],
  ["/diretrizes", pub.guidelines],
  ["/contacto", pub.contact],
  ["/app", pub.appPage],
  ["/saas", pub.saasPage],
  ["/entrar", acc.signIn],
  ["/registar", acc.signUp],
  ["/recuperar", acc.forgot],
  ["/nova-senha", acc.newPassword, "auth"],
  ["/perfil", acc.profile, "auth"],
  ["/seguranca", sec.securityPage, "auth"],
  ["/verificacao", kyc.verification, "auth"],
  ["/boas-vindas", onb.onboarding, "auth"],
  ["/verificar", sec.mfaChallenge],
  ["/painel", prod.panel, "auth"],
  ["/checkout/:id", acc.checkout],
  ["/meus-cursos", acc.myCourses, "auth"],
  ["/aprender/:id", acc.learn, "auth"],
  ["/aprender/:id/:lesson", acc.learn, "auth"],
  ["/ser-produtor", acc.becomeProducer, "auth"],
  ["/pagamento/:id", acc.paymentReturn, "auth"],
  ["/carteira", wal.wallet, "auth"],
  ["/carteira/:tab", wal.wallet, "auth"],
  ["/afiliados", wal.affiliates],
  ["/produtor", prod.dashboard, "producer"],
  ["/produtor/curso/novo", prod.createWizard, "auth"],
  ["/produtor/vendas", prod.salesPage, "producer"],
  ["/produtor/curso/:id", prod.editor, "producer"],
  ["/admin", adm.admin, "admin"],
  ["/admin/:tab", adm.admin, "admin"],
];

function match(path) {
  const parts = path.split("/").filter(Boolean);
  for (const [pattern, fn, guard] of routes) {
    const pp = pattern.split("/").filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    let okm = true;
    pp.forEach((p, i) => {
      if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(parts[i]);
      else if (p !== parts[i]) okm = false;
    });
    if (okm) return { fn, guard, params };
  }
  return null;
}

export function go(hash) { location.hash = hash; }

let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const raw = location.hash.replace(/^#/, "") || "/";
  if (/^\/?(access_token|refresh_token)=/.test(raw)) { document.getElementById("main").innerHTML = loading(); return; }
  if (/^\/?error=/.test(raw)) {
    const q = new URLSearchParams(raw.replace(/^\//, ""));
    const expired = /expired|invalid/i.test(q.get("error_description") || q.get("error_code") || "");
    document.getElementById("main").innerHTML = `<section class="page container narrow">${errorBox(new Error(expired ? tr("O link do email expirou ou já foi usado. Entra na tua conta para pedir outro.", "The email link expired or was already used. Sign in to request a new one.") : (q.get("error_description") || "Erro")))}<p><a class="btn btn-green" href="#/entrar">${tr("Entrar", "Sign in")}</a></p></section>`;
    return;
  }
  const [path, qs] = raw.split("?");
  const query = Object.fromEntries(new URLSearchParams(qs || ""));
  const main = document.getElementById("main");
  main.onclick = null; main.onchange = null; main.oninput = null;
  closeDrawer();
  renderNav();
  try { pageView(); } catch {}
  // Administrador: a área de entrada é a Administração
  if (state.user && isAdmin() && !state.mfaPending && (path === "/painel" || path === "/produtor")) { go("#/admin"); return; }
  document.body.classList.toggle("admin-mode", Boolean(state.user && isAdmin()));
  if (state.user && isAdmin()) refreshAdminCounts();
  mountAssistant();
  const m = match(path);
  document.body.dataset.route = m ? (path === "/" ? "home" : path.split("/")[1]) : "404";
  document.body.classList.toggle("in-app", Boolean(m && m.guard && state.user && !m.params.lesson && !path.startsWith("/aprender") && !path.startsWith("/checkout") && !path.startsWith("/pagamento") && path !== "/nova-senha" && path !== "/boas-vindas"));
  if (!m) { main.innerHTML = pub.notFound(); window.scrollTo(0, 0); return; }
  const authRoute = ["entrar", "registar", "recuperar", "nova-senha"].includes(path.split("/")[1]);
  document.body.classList.toggle("auth-page", authRoute || Boolean(m.guard && !state.user));
  // Conta com 2 passos ativo: pede o código antes de abrir qualquer área privada
  if (state.user && state.mfaPending && (m.guard || path === "/verificar")) {
    if (path !== "/verificar") { try { sessionStorage.setItem("uq_after_login", "#" + raw); } catch {} }
    document.body.classList.add("auth-page");
    document.body.classList.remove("in-app");
    await sec.mfaChallenge(main);
    return;
  }
  if (m.guard && !state.user) {
    sessionStorage.setItem("uq_after_login", "#" + raw);
    main.innerHTML = acc.loginRequired();
    return;
  }
  // Primeira vez na área interna: questionário «Conta-nos sobre ti» (não interrompe checkout nem aulas)
  if (onb.needsOnboarding(path)) { go(`#/boas-vindas?next=${encodeURIComponent("#" + raw)}`); return; }
  if (m.guard === "producer" && !isProducer()) { main.innerHTML = acc.producerRequired(); return; }
  if (m.guard === "admin" && !isAdmin()) { main.innerHTML = pub.forbidden(); return; }
  main.innerHTML = loading();
  try {
    await m.fn(main, m.params, query, () => seq === renderSeq);
  } catch (err) {
    console.error(err);
    if (seq === renderSeq) main.innerHTML = `<section class="page container">${errorBox(err)}</section>`;
  }
  if (seq === renderSeq && !m.params.lesson) window.scrollTo(0, 0);
}
export { render as rerender };

// Números de tarefas pendentes no menu do admin (pedidos, revisões, levantamentos)
let countsAt = 0;
async function refreshAdminCounts() {
  if (Date.now() - countsAt < 30000) return;
  countsAt = Date.now();
  try {
    const [s, w, k, bo] = await Promise.all([api.adminStats(), api.adminWithdrawals("pending").catch(() => []), api.adminKyc("pending").catch(() => []), api.adminBoosts("pending").catch(() => [])]);
    const next = { courses: s.pendingCourses, orders: s.pendingOrders, withdrawals: w.length, kyc: k.length, boosts: bo.length };
    const changed = JSON.stringify(next) !== JSON.stringify(state.adminCounts || {});
    state.adminCounts = next;
    if (changed) document.querySelectorAll(".app-side nav, #drawer .app-menu").forEach((n) => { n.innerHTML = appMenuHTML(activeKey()); });
  } catch {}
}
export function bumpAdminCounts() { countsAt = 0; refreshAdminCounts(); }

// ---------- Barra de topo ----------
function renderNav() {
  const nav = document.getElementById("nav");
  const u = state.user;
  const name = state.profile?.full_name || u?.email || "";
  const first = esc(name.split(" ")[0] || "");
  const links = isAdmin() ? `<a href="#/admin">${tr("Administração", "Admin")}</a>
    <a href="#/admin/pedidos">${tr("Pagamentos", "Payments")}</a>
    <a href="#/admin/levantamentos">${tr("Levantamentos", "Withdrawals")}</a>
    <a href="#/cursos">${tr("Ver o site", "View site")}</a>` : `<a href="#/cursos">${tr("Ver produtos", "Browse products")}</a>
    <a href="#/para-produtores">${tr("Para criadores", "For creators")}</a>
    <a href="#/afiliados">${tr("Afiliados", "Affiliates")}</a>
    <a href="#/como-funciona">${tr("Como funciona", "How it works")}</a>`;
  const sellHref = u ? (isProducer() ? "#/produtor/curso/novo" : "#/ser-produtor") : "#/registar?produtor=1";
  const CUR_NAME = { MZN: "Metical", USD: "US Dollar", EUR: "Euro", BRL: "Real", ZAR: "Rand" };
  // Faixa de cima: mensagem, «Vender» e escolha de língua e moeda (sempre visível, também no telemóvel)
  const topbar = `<div class="topbar"><div class="tb-in">
      <span class="tb-msg">🌍 <span>${tr("Marketplace global de produtos digitais", "Global marketplace for digital products")}</span></span>
      <a class="tb-sell" href="${sellHref}">${ICON.trend}<span class="l">${tr("Vende para o mundo inteiro", "Sell to the whole world")}</span><span class="s">${tr("Vender", "Sell")}</span></a>
      <div class="tb-loc">
        <button type="button" class="tb-app" ${installEvt ? "" : "hidden"}>📲 <span>${tr("Instalar app", "Install app")}</span></button>
        <label class="tb-sel" title="${tr("Língua", "Language")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/></svg>
          <select class="lang-select" aria-label="${tr("Língua", "Language")}"><option value="pt" ${state.lang === "pt" ? "selected" : ""}>Português</option><option value="en" ${state.lang === "en" ? "selected" : ""}>English</option></select></label>
        <label class="tb-sel" title="${tr("Moeda", "Currency")}"><select class="cur-select" aria-label="${tr("Moeda", "Currency")}">${CONFIG.CURRENCIES.map((c) => `<option value="${c}" ${c === state.currency ? "selected" : ""} title="${CUR_NAME[c] || c}">${c}</option>`).join("")}</select></label>
      </div>
    </div></div>`;
  const right = u
    ? `<div class="user-menu">
         <button class="user-btn" aria-haspopup="true"><span class="avatar">${esc((name[0] || "U").toUpperCase())}</span><span class="uname">${first}</span>${ICON.down}</button>
         <div class="user-drop">${isAdmin() ? `
           <a href="#/admin">${tr("Administração", "Admin")}</a>
           <a href="#/seguranca">${tr("A minha conta", "My account")}</a>
           <button class="logout">${tr("Sair", "Sign out")}</button>` : `
           <a href="#/painel">${tr("Painel", "Dashboard")}</a>
           <a href="#/meus-cursos">${tr("Os meus cursos", "My courses")}</a>
           <a href="#/produtor">${tr("Os meus produtos", "My products")}</a>
           <a href="#/afiliados">${tr("Afiliados", "Affiliates")}</a>
           <a href="#/carteira">${tr("Carteira", "Wallet")}</a>
           <a href="#/perfil">${tr("O meu perfil", "My profile")}</a>
           <button class="logout">${tr("Sair", "Sign out")}</button>`}
         </div>
       </div>`
    : `<a class="login" href="#/entrar">${tr("Entrar", "Sign in")}</a>
       <a class="signup" href="#/registar">${tr("Criar conta", "Sign up")}</a>`;
  nav.innerHTML = `${topbar}<div class="nav-in">
      ${brandHTML()}
      <nav class="links">${links}</nav>
      <div class="actions">
        ${right}
        <button class="burger" aria-label="Menu"><span></span><span></span><span></span></button>
      </div>
    </div>`;
  renderDrawer();
}

function renderDrawer() {
  const d = document.getElementById("drawer");
  const u = state.user;
  const item = (href, label) => `<a href="${href}"><span>${label}</span>${ICON.chev}</a>`;
  if (u) {
    d.innerHTML = `<div class="drawer-panel app-drawer" role="dialog" aria-label="Menu">
      <div class="drawer-head">${brandHTML("dark")}<button class="close" aria-label="${tr("Fechar", "Close")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
      <nav class="app-menu">${appMenuHTML(activeKey())}</nav>
      <div class="drawer-sub2">${isAdmin() ? `<a href="#/cursos">${tr("Ver o site", "View site")}</a>` : `<a href="#/cursos">${tr("Ver produtos à venda", "Browse products")}</a><a href="#/contacto">${tr("Central de ajuda", "Help center")}</a>`}</div>
      <div class="drawer-actions"><button class="btn btn-outline-green logout">${tr("Sair", "Sign out")}</button>
</div>
    </div>`;
    return;
  }
  d.innerHTML = `<div class="drawer-panel" role="dialog" aria-label="Menu">
    <div class="drawer-head">${brandHTML("dark")}<button class="close" aria-label="${tr("Fechar", "Close")}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    <div class="drawer-links">
      ${item("#/cursos", tr("Ver produtos", "Browse products"))}
      ${item("#/para-produtores", tr("Vender os meus produtos", "Sell my products"))}
      ${item("#/afiliados", tr("Programa de afiliados", "Affiliate program"))}
      ${item("#/como-funciona", tr("Como funciona", "How it works"))}
      ${u ? item("#/meus-cursos", tr("Os meus cursos", "My courses")) : ""}
      ${u && isProducer() ? item("#/produtor", tr("Painel do produtor", "Creator dashboard")) : ""}
      ${u ? item("#/carteira", tr("Carteira", "Wallet")) : ""}
      ${u && isAdmin() ? item("#/admin", tr("Administração", "Admin")) : ""}
      ${item("#/contacto", tr("Central de ajuda", "Help center"))}
      ${item("#/saas", `SaaS <span class="soon-tag">${tr("em breve", "coming soon")}</span>`)}
    </div>
    <div class="drawer-actions">
      ${u ? `<a class="btn btn-primary btn-block" href="#/meus-cursos">${tr("Os meus cursos", "My courses")}</a>
             <div class="drawer-sub"><a href="#/perfil">${tr("O meu perfil", "My profile")}</a><button class="logout">${tr("Sair", "Sign out")}</button></div>`
          : `<a class="btn btn-primary btn-block" href="#/registar">${tr("Criar conta grátis", "Create free account")}</a>
             <div class="drawer-sub"><a href="#/entrar">${tr("Aceder às minhas compras", "Access my purchases")}</a><a href="#/registar?produtor=1">${tr("Vender os meus produtos", "Sell my products")}</a></div>`}
    </div>
  </div>`;
}


function openDrawer() { document.body.classList.add("drawer-open"); }
function closeDrawer() { document.body.classList.remove("drawer-open"); }

function renderFooter() {
  document.getElementById("footer").innerHTML = `<div class="container foot-grid">
    <div>${brandHTML()}<p class="muted-light">${tr("Cria, publica e vende os teus produtos digitais.", "Create, publish and sell your digital products.")}</p></div>
    <div><h4>${tr("Plataforma", "Platform")}</h4><a href="#/cursos">${tr("Ver produtos", "Browse products")}</a><a href="#/como-funciona">${tr("Como funciona", "How it works")}</a><a href="#/para-produtores">${tr("Para criadores", "For creators")}</a><a href="#/afiliados">${tr("Afiliados", "Affiliates")}</a><a href="#/app">📲 ${tr("Baixar a app", "Get the app")}</a><a href="#/saas">SaaS <span class="soon-tag">${tr("em breve", "coming soon")}</span></a></div>
    <div><h4>${tr("Empresa", "Company")}</h4><a href="#/sobre">${tr("Sobre", "About")}</a><a href="#/contacto">${tr("Contacto", "Contact")}</a>${supportWa() ? `<a href="https://wa.me/${supportWa()}" target="_blank" rel="noopener">${tr("WhatsApp do suporte", "Support WhatsApp")}</a>` : ""}${waGroup() ? `<a href="${esc(waGroup())}" target="_blank" rel="noopener">${tr("Grupo no WhatsApp", "WhatsApp group")}</a>` : ""}${typeof state.settings.support_email === "string" && state.settings.support_email ? `<a href="mailto:${esc(state.settings.support_email)}">${esc(state.settings.support_email)}</a>` : ""}</div>
    <div><h4>${tr("Legal", "Legal")}</h4><a href="#/termos">${tr("Termos de Uso", "Terms of Use")}</a><a href="#/privacidade">${tr("Privacidade", "Privacy")}</a><a href="#/diretrizes">${tr("Diretrizes de conteúdo", "Content guidelines")}</a></div>
  </div>
  <div class="container foot-bottom">© ${new Date().getFullYear()} Uquiorrapay. ${tr("Todos os direitos reservados.", "All rights reserved.")} <span class="ver">${esc(document.querySelector("meta[name=uq-version]")?.content || "")}</span></div>`;
  // Botão do WhatsApp: ao tocar mostra 2 opções — falar com o suporte ou entrar no grupo
  const wa = supportWa();
  const grp = waGroup();
  document.getElementById("wa-fab")?.remove();
  document.getElementById("wa-menu")?.remove();
  if (!wa && !grp) return;
  const fab = document.createElement("button");
  fab.id = "wa-fab"; fab.type = "button"; fab.setAttribute("aria-label", "WhatsApp"); fab.setAttribute("aria-expanded", "false"); fab.innerHTML = ICON.whats;
  const menu = document.createElement("div");
  menu.id = "wa-menu"; menu.hidden = true; menu.setAttribute("role", "menu");
  menu.innerHTML = `<b>${tr("Como podemos ajudar?", "How can we help?")}</b>
    ${wa ? `<a role="menuitem" href="https://wa.me/${wa}" target="_blank" rel="noopener"><span class="wm-ic">${ICON.help}</span><span><b>${tr("Falar com o suporte", "Talk to support")}</b><small>${tr("Dúvidas, pagamentos e acesso", "Questions, payments and access")}</small></span></a>` : ""}
    ${grp ? `<a role="menuitem" href="${esc(grp)}" target="_blank" rel="noopener"><span class="wm-ic">${ICON.users}</span><span><b>${tr("Entrar no grupo", "Join the group")}</b><small>${tr("Comunidade Uquiorrapay no WhatsApp", "Uquiorrapay WhatsApp community")}</small></span></a>` : ""}`;
  document.body.append(menu, fab);
  const close = () => { menu.hidden = true; fab.setAttribute("aria-expanded", "false"); };
  fab.addEventListener("click", (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; fab.setAttribute("aria-expanded", String(!menu.hidden)); });
  menu.addEventListener("click", (e) => { if (e.target.closest("a")) close(); });
  document.addEventListener("click", (e) => { if (!menu.hidden && !e.target.closest("#wa-menu")) close(); });
}
// Link do grupo de WhatsApp (só aceita links de convite do WhatsApp)
export function waGroup() {
  const g = typeof state.settings.whatsapp_group === "string" ? state.settings.whatsapp_group.trim() : "";
  return /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(g) ? g : "";
}

// ---------- Eventos globais ----------
document.addEventListener("click", async (e) => {
  const t = e.target;
  const spCard = t.closest("a.pcard[data-sp]");
  if (spCard) api.boostTrack(spCard.dataset.sp, "click");
  if (t.closest(".burger")) { openDrawer(); return; }
  // Ligações que só deslocam a página (ex.: «Ver produtos em destaque») e o logótipo na própria página
  const sc = t.closest("[data-scroll]");
  if (sc) { e.preventDefault(); document.getElementById(sc.dataset.scroll)?.scrollIntoView({ behavior: "smooth", block: "start" }); return; }
  const br = t.closest("a.brand");
  if (br && (location.hash || "#/") === br.getAttribute("href")) { e.preventDefault(); closeDrawer(); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
  if (t.closest(".close") || t.id === "drawer") { closeDrawer(); return; }
  if (t.closest("#drawer a")) { closeDrawer(); }
  const lb = t.closest("[data-lang]");
  if (lb) { setLang(lb.dataset.lang); renderFooter(); render(); return; }
  const ub = t.closest(".user-btn");
  if (ub) { ub.parentElement.classList.toggle("open"); return; }
  if (!t.closest(".user-menu")) document.querySelectorAll(".user-menu.open").forEach((x) => x.classList.remove("open"));
  if (t.closest(".logout")) {
    await api.signOut();
    toast(tr("Sessão terminada.", "Signed out."));
    go("#/");
  }
});
document.addEventListener("change", (e) => {
  if (e.target.classList.contains("cur-select")) { setCurrency(e.target.value); render(); }
  if (e.target.classList.contains("lang-select")) { setLang(e.target.value); renderFooter(); render(); }
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeDrawer(); });

// Campos inválidos: avisa sempre (antes, campos escondidos bloqueavam o «Guardar» sem mensagem)
let lastInvalid = 0;
document.addEventListener("invalid", (e) => {
  const el = e.target;
  if (Date.now() - lastInvalid < 600) return;
  lastInvalid = Date.now();
  const lab = el.closest("label")?.childNodes[0]?.textContent?.trim() || el.closest(".field")?.querySelector(".flabel")?.textContent?.trim() || el.name || "";
  toast(`${lab ? lab + ": " : ""}${el.validity.valueMissing ? tr("campo obrigatório", "required field") : el.validationMessage}`, "err");
  try { el.focus({ preventScroll: false }); el.scrollIntoView({ behavior: "smooth", block: "center" }); } catch {}
}, true);

// Imagens que falham são retiradas (substitui os antigos onerror inline, bloqueados pela CSP)
document.addEventListener("error", (e) => {
  const t = e.target;
  if (t && t.tagName === "IMG" && t.hasAttribute("data-fallback")) t.remove();
}, true);

// Administrador: sessão termina após 30 minutos sem atividade
let lastActivity = Date.now();
["click", "keydown", "scroll", "touchstart", "mousemove"].forEach((ev) => addEventListener(ev, () => { lastActivity = Date.now(); }, { passive: true }));
setInterval(async () => {
  if (state.user && isAdmin() && Date.now() - lastActivity > 30 * 60 * 1000) {
    lastActivity = Date.now();
    await api.signOut();
    toast(tr("Sessão de administrador terminada por inatividade.", "Admin session ended due to inactivity."), "err");
    go("#/entrar");
  }
}, 60 * 1000);

// ---------- Sessão ----------
async function loadUser(session) {
  state.session = session;
  state.user = session?.user || null;
  state.profile = null;
  state.roles = [];
  state.mfaPending = false;
  if (state.user) {
    try {
      const lvl = await api.mfaLevel();
      state.mfaPending = lvl.currentLevel === "aal1" && lvl.nextLevel === "aal2";
    } catch {}
    try {
      const [roles, profile] = await Promise.all([api.myRoles(), api.myProfile(state.user.id)]);
      state.roles = roles;
      state.profile = profile;
    } catch (err) { console.warn(err); }
  }
}

async function boot() {
  await initLocale();
  setLang(state.lang, false);
  renderFooter();
  try { state.settings = { ...state.settings, ...(await api.settings()) }; } catch (err) { console.warn(err); }
  try { initTracking(); } catch (err) { console.warn(err); }
  renderFooter();
  await loadUser(await api.session());
  let first = true;
  api.onAuthChange(async (event, session) => {
    if (first && event === "INITIAL_SESSION") { first = false; return; }
    if (event === "TOKEN_REFRESHED") { state.session = session; return; }
    // O Supabase volta a emitir SIGNED_IN quando o separador regressa ao primeiro plano (ex.: depois de escolher
    // um ficheiro ou tirar uma foto no telemóvel). Para a mesma conta, só actualiza a sessão — não redesenha a página,
    // senão perdia-se o ficheiro escolhido e o envio em curso.
    if (event === "SIGNED_IN" && state.user && session?.user?.id === state.user.id) { state.session = session; return; }
    await loadUser(session);
    if (event === "PASSWORD_RECOVERY") { go("#/nova-senha"); return; }
    if (/access_token=|refresh_token=/.test(location.hash)) history.replaceState(null, "", location.pathname + location.search + "#/painel");
    if (event === "SIGNED_IN" && fromEmailLink) {
      fromEmailLink = false;
      toast(tr("Email confirmado! A tua conta está activa.", "Email confirmed! Your account is active."));
      const back = afterConfirm();
      if (back) { history.replaceState(null, "", location.pathname + location.search + back); render(); return; }
    }
    if (event === "SIGNED_IN") {
      let oauth = false;
      try { oauth = sessionStorage.getItem("uq_oauth") === "1"; sessionStorage.removeItem("uq_oauth"); } catch {}
      if (state.mfaPending) { if (location.hash !== "#/verificar") go("#/verificar"); else render(); return; }
      if (oauth) api.logEvent("login");
      const next = sessionStorage.getItem("uq_after_login");
      sessionStorage.removeItem("uq_after_login");
      if (next && next !== location.hash) { go(next); return; }
    }
    render();
  });
  window.addEventListener("hashchange", render);
  // Chegou pelo link do email e a sessão já foi lida: limpa o endereço e dá as boas-vindas
  if (/access_token=|refresh_token=/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search + (state.user ? (fromEmailLink && afterConfirm()) || "#/painel" : "#/entrar"));
    if (state.user && fromEmailLink) { fromEmailLink = false; toast(tr("Email confirmado! A tua conta está activa.", "Email confirmed! Your account is active.")); }
  }
  render();
}

// Destino guardado ao criar conta a partir do checkout (válido 3 dias)
function afterConfirm() {
  try {
    const v = JSON.parse(localStorage.getItem("uq_after_confirm") || "null");
    localStorage.removeItem("uq_after_confirm");
    if (v && /^#\/checkout\/[\w-]+(\?[\w=&%-]*)?$/.test(v.h) && Date.now() - v.t < 3 * 864e5) return v.h;
  } catch {}
  return "";
}

// Recarregar papéis (ex.: depois de pedido de produtor aprovado)
export async function refreshUser() { await loadUser(await api.session()); renderNav(); }

// ---------- App instalável (Android/desktop): service worker + botão «Instalar app» ----------
let installEvt = null;
const standalone = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); if (standalone()) return;
  installEvt = e; document.querySelectorAll(".tb-app").forEach((b) => (b.hidden = false));
});
addEventListener("appinstalled", () => { installEvt = null; document.querySelectorAll(".tb-app").forEach((b) => (b.hidden = true)); toast(tr("App instalada! Encontra a Uquiorrapay no ecrã inicial.", "App installed! Find Uquiorrapay on your home screen.")); });
document.addEventListener("click", async (e) => {
  if (!e.target.closest(".tb-app") || !installEvt) return;
  const ev = installEvt; installEvt = null; ev.prompt();
  try { await ev.userChoice; } catch {}
  document.querySelectorAll(".tb-app").forEach((b) => (b.hidden = true));
});
// Só no site publicado (em testes locais o service worker interferiria com os dados simulados)
if ("serviceWorker" in navigator && !/^(localhost|127\.|0\.0\.0\.0)/.test(location.hostname)) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {}));
}

boot().catch((err) => {
  document.getElementById("main").innerHTML = `<section class="page container">${errorBox(err)}</section>`;
});
