// Área interna do produtor (estrutura inspirada na Hotmart):
// Início (painel), Os meus produtos, Gestão de vendas, Criar produto (3 passos) e página do produto com lista de passos.
import { api } from "../api.js?v=202610091700";
import { state, tr, esc, mzn, siteUrl, usdRate, coverHTML, cleanBonuses, statusBadge, date, toast, modal, emptyState, ICON, isAdmin, isProducer, methodLabel, dashShell, copyText, TYPES, typeLabel, unitLabel, catLabel, catOptions, trackUpload, supportOk, photo, PHOTOS, CONFIG, isSponsored, donutSVG, areaSVG, gaugeSVG, dailySeries, deltaHTML, pctFee, gDays } from "../ui.js?v=202610091700";
import { affLink } from "./wallet.js?v=202610091700";
import { pushCardHTML, wirePush } from "../push.js?v=202610091700";
import { go, refreshUser, rerender } from "../app.js?v=202610091700";

// Descrição do produto: máximo 500 caracteres (também imposto na base de dados)
const DESC_MAX = 500;
function descCount(el) {
  const n = el.value.length, c = document.getElementById("cnt"); if (!c) return;
  c.textContent = `${n}/${DESC_MAX}`; c.classList.toggle("over", n > DESC_MAX); c.classList.toggle("near", n > DESC_MAX - 50 && n <= DESC_MAX);
}
const descTooLong = (el) => {
  if (!el || el.value.length <= DESC_MAX) return false;
  toast(tr(`A descrição pode ter no máximo ${DESC_MAX} caracteres (tem ${el.value.length}). Encurta-a para guardar.`, `The description can have at most ${DESC_MAX} characters (it has ${el.value.length}). Shorten it to save.`), "err");
  el.focus(); return true;
};
function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle("busy", on); } }

const TYPE_INFO = () => ({
  curso: [ICON.play, tr("Curso online", "Online course"), tr("Aulas em vídeo, textos, PDFs e materiais", "Video lessons, texts, PDFs and materials")],
  ebook: [ICON.doc, "Ebook", tr("Ficheiros PDF para ler online ou descarregar", "PDF files to read online or download")],
  template: [ICON.box, "Template", tr("Modelos, planilhas e ficheiros prontos a usar", "Templates, spreadsheets and ready-to-use files")],
  audio: [`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`, tr("Áudio / Podcast", "Audio / Podcast"), tr("Episódios e conteúdos em áudio", "Episodes and audio content")],
});

// Garante o papel de produtor (qualquer utilizador pode criar; a equipa revê cada produto)
async function ensureProducer() {
  if (isProducer()) return;
  await api.becomeProducer();
  await refreshUser();
}

// ---------- Grelha de produtos (cartões com imagem e estado) ----------
const STATUS_TXT = () => ({ draft: tr("Em edição", "In editing"), pending: tr("Em revisão", "In review"), approved: tr("À venda", "On sale"), rejected: tr("Não aprovado", "Not approved") });
const FILTERS = () => [["", tr("Todos", "All")], ["draft", tr("Rascunhos", "Drafts")], ["pending", tr("Em revisão", "In review")], ["approved", tr("À venda", "On sale")], ["rejected", tr("Não aprovados", "Not approved")]];
function productGrid(courses, { filter = "", base = "#/produtor", fillTo = 0 } = {}) {
  const rows = courses.filter((c) => !filter || c.status === filter);
  const st = STATUS_TXT();
  const cards = rows.map((c) => `<a class="pg-card" href="#/produtor/curso/${esc(c.id)}">
      <div class="pg-img">${coverHTML(c)}<span class="pg-badge st-${esc(c.status)}">${esc(st[c.status] || c.status)}</span>
        <button type="button" class="pg-more" data-more="${esc(c.id)}" aria-label="${tr("Mais opções", "More options")}" aria-haspopup="menu">${DOTS}</button></div>
      <div class="pg-body"><b>${esc(c.title)}</b><div class="pg-meta"><span>${esc(typeLabel(c.product_type))}</span><span class="pg-chip">${esc(st[c.status] || c.status)}</span></div></div>
    </a>`);
  const n = Math.max(fillTo - cards.length, cards.length ? 1 : fillTo || 1);
  const add = `<a class="pg-card pg-add" href="#/produtor/curso/novo">${ICON.plus}<span>${tr("Criar produto", "Create product")}</span></a>`;
  return `<div class="pills pg-filters">${FILTERS().map(([k, l]) => `<a class="pill ${k === filter ? "on" : ""}" href="${base}${k ? (base.includes("?") ? "&" : "?") + "f=" + k : ""}">${esc(l)}</a>`).join("")}</div>
    <div class="pg-grid">${cards.join("")}${filter ? "" : Array(n).fill(add).join("")}</div>
    ${filter && !cards.length ? `<p class="muted small">${tr("Nenhum produto neste estado.", "No products in this status.")}</p>` : ""}`;
}

// ---------- Menu «⋯» de cada produto: link de checkout, suporte, duplicar, apagar ----------
const DOTS = `<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>`;
const checkoutUrl = (id) => `${siteUrl()}#/checkout/${id}`;
function closeMenus() { document.querySelectorAll(".pg-menu").forEach((m) => m.remove()); }
function wireProductMenus(main, courses, reload) {
  main.onclick = (e) => {
    const b = e.target.closest("[data-more]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    const open = document.querySelector(`.pg-menu[data-for="${b.dataset.more}"]`);
    closeMenus();
    if (open) return;
    const c = courses.find((x) => x.id === b.dataset.more);
    if (c) openProductMenu(b, c, reload);
  };
}
function openProductMenu(btn, c, reload) {
  const sup = supportOk(c);
  const canLink = c.status === "approved" && sup;
  const canDel = ["draft", "rejected"].includes(c.status);
  const m = document.createElement("div");
  m.className = "pg-menu"; m.dataset.for = c.id; m.setAttribute("role", "menu");
  m.innerHTML = `
    <button role="menuitem" data-a="link" class="${canLink ? "" : "dim"}">${ICON.link}<span>${tr("Copiar link de checkout", "Copy checkout link")}<small>${canLink ? tr("Compra directa", "Direct purchase") : !sup ? tr("Preenche o suporte primeiro", "Fill in support first") : tr("Disponível depois de aprovado", "Available once approved")}</small></span></button>
    <button role="menuitem" data-a="sup">${ICON.whats}<span>${sup ? tr("Editar suporte ao comprador", "Edit buyer support") : tr("Preencher suporte ao comprador", "Fill in buyer support")}<small>${sup ? esc(c.support_whatsapp) : tr("Obrigatório para vender", "Required to sell")}</small></span>${sup ? `<i class="ok">${ICON.check}</i>` : `<i class="need">!</i>`}</button>
    <button role="menuitem" data-a="dup">${ICON.copy}<span>${tr("Duplicar produto", "Duplicate product")}<small>${tr("Cria uma cópia em rascunho", "Creates a draft copy")}</small></span></button>
    <button role="menuitem" data-a="edit">${ICON.edit}<span>${tr("Editar produto", "Edit product")}</span></button>
    <button role="menuitem" data-a="del" class="danger ${canDel ? "" : "dim"}">${ICON.trash}<span>${tr("Apagar produto", "Delete product")}${canDel ? "" : `<small>${tr("Só rascunhos ou não aprovados", "Drafts or rejected only")}</small>`}</span></button>`;
  document.body.appendChild(m);
  const r = btn.getBoundingClientRect();
  const w = Math.min(280, innerWidth - 16);
  m.style.width = w + "px";
  m.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + "px";
  const below = r.bottom + 6 + m.offsetHeight < innerHeight;
  m.style.top = (below ? r.bottom + 6 : Math.max(8, r.top - m.offsetHeight - 6)) + scrollY + "px";
  m.querySelector("button")?.focus();
  m.addEventListener("click", async (e) => {
    const it = e.target.closest("[data-a]"); if (!it) return;
    const a = it.dataset.a;
    closeMenus();
    if (a === "link") {
      if (canLink) { copyText(checkoutUrl(c.id)); return; }
      if (!sup) { toast(tr("O link de checkout só aparece depois de preencheres o suporte ao comprador.", "The checkout link only appears after you fill in buyer support."), "err"); go(`#/produtor/curso/${c.id}?sec=suporte`); return; }
      toast(c.status === "pending" ? tr("O produto está em análise. O link aparece quando for aprovado.", "The product is under review. The link appears once approved.") : tr("Envia o produto para análise. O link aparece quando for aprovado.", "Submit the product for review. The link appears once approved."), "err");
      return;
    }
    if (a === "sup") { go(`#/produtor/curso/${c.id}?sec=suporte`); return; }
    if (a === "edit") { go(`#/produtor/curso/${c.id}`); return; }
    if (a === "dup") {
      if (!(await modal({ title: tr("Duplicar este produto?", "Duplicate this product?"), body: tr(`Vamos criar «${c.title} (cópia)» em rascunho, com o mesmo conteúdo, preço e suporte. Depois podes editar e enviar para análise.`, `We'll create “${c.title} (copy)” as a draft with the same content, price and support. You can then edit and submit it.`), confirm: tr("Duplicar", "Duplicate") }))) return;
      toast(tr("A duplicar… pode demorar se houver vídeos.", "Duplicating… may take a moment with videos."));
      try {
        const r2 = await api.duplicateCourse(c.id);
        toast(r2.failed ? tr(`Cópia criada, mas ${r2.failed} ficheiro(s) não foram copiados — volta a carregá-los na cópia.`, `Copy created, but ${r2.failed} file(s) weren't copied — upload them again.`) : tr("Produto duplicado! A cópia está em rascunho.", "Product duplicated! The copy is a draft."), r2.failed ? "err" : undefined);
        go(`#/produtor/curso/${r2.id}`);
      } catch (err) { toast(err.message, "err"); }
      return;
    }
    if (a === "del") {
      if (!canDel) { toast(c.status === "approved" ? tr("Produtos à venda não podem ser apagados. Abre o produto e retira-o da venda primeiro, ou fala com o suporte.", "Live products can't be deleted. Contact support.") : tr("Volta o produto a rascunho antes de o apagar.", "Move the product back to draft before deleting it."), "err"); return; }
      if (!(await modal({ title: tr("Apagar este produto?", "Delete this product?"), body: tr(`«${c.title}» e todo o seu conteúdo serão apagados. Esta acção não pode ser desfeita.`, `“${c.title}” and all its content will be deleted. This cannot be undone.`), confirm: tr("Apagar", "Delete"), danger: true }))) return;
      try { await api.deleteCourse(c.id); toast(tr("Produto apagado.", "Product deleted.")); reload(); } catch (err) { toast(err.message, "err"); }
    }
  });
}
document.addEventListener("click", (e) => { if (!e.target.closest(".pg-menu, [data-more]")) closeMenus(); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenus(); });
addEventListener("hashchange", closeMenus);
addEventListener("resize", closeMenus);

// ---------- Início (painel) ----------
export async function panel(main, _p, query, alive) {
  const [courses, sales, questions] = await Promise.all([api.myCourses(state.user.id).catch(() => []), api.salesForProducer(state.user.id).catch(() => []), api.producerQuestions().catch(() => [])]);
  if (!alive()) return;
  const p = state.profile || {};
  const qBox = questions.length ? `<div class="card-box q-box">
      <div class="sb-head"><b>${ICON.chat} ${tr("Perguntas dos alunos por responder", "Unanswered student questions")}</b><span class="badge st-pending">${questions.length}</span></div>
      <ul class="q-list">${questions.slice(0, 5).map((q) => `<li><a href="#/aprender/${esc(q.course_id)}/${esc(q.lesson_id)}?c=${esc(q.id)}"><b>${esc(q.author_name || tr("Aluno", "Student"))}</b> <small class="muted">${esc(q.course_title)} · ${esc(q.lesson_title)}</small><span class="clamp2">${esc(q.body)}</span></a></li>`).join("")}</ul>
      <small class="muted">${tr("Carrega numa pergunta para abrir a aula e responder.", "Tap a question to open the lesson and reply.")}</small></div>` : "";
  const first = esc((p.full_name || state.user.email || "").split(" ")[0]);
  const paid = sales.filter((s) => s.status === "paid");
  const steps = [
    [true, tr("Entrar na Uquiorrapay", "Sign in to Uquiorrapay"), ""],
    [Boolean(p.phone && p.full_name), tr("Completar os dados pessoais", "Complete personal details"), "#/perfil"],
    [courses.length > 0, tr("Criar produto", "Create product"), "#/produtor/curso/novo"],
    [courses.some((c) => c.status === "approved"), tr("Publicar produto", "Publish product"), courses[0] ? `#/produtor/curso/${courses[0].id}` : "#/produtor/curso/novo"],
    [paid.length > 0, tr("Fazer a primeira venda", "Make your first sale"), "#/afiliados"],
  ];
  const done = steps.filter((s) => s[0]).length;
  const next = steps.find((s) => !s[0]);
  const goal = paid.length < 1 ? 1 : paid.length < 10 ? 10 : paid.length < 100 ? 100 : 1000;
  const goalLabel = goal === 1 ? tr("O meu primeiro produto vendido", "My first product sold") : tr(`${goal} vendas`, `${goal} sales`);
  const typeCards = Object.entries(TYPE_INFO()).map(([t, [ic, title, text]]) => `<a class="sell-type" href="#/produtor/curso/novo?tipo=${t}"><span class="st-ic">${ic}</span><b>${title}</b><small>${text}</small></a>`).join("");

  // Números dos últimos 30 dias comparados com os 30 anteriores
  const DAY = 864e5, now = Date.now();
  const tOf = (s) => new Date(s.paid_at || s.created_at).getTime();
  const in30 = paid.filter((s) => now - tOf(s) < 30 * DAY), prev30 = paid.filter((s) => now - tOf(s) >= 30 * DAY && now - tOf(s) < 60 * DAY);
  const net = (arr) => arr.reduce((a, s) => a + Number(s.producer_net_mzn || 0), 0);
  const totalNet = net(paid);
  const byProd = {};
  for (const s of paid) { const k = s.courses?.title || tr("Produto", "Product"); byProd[k] = (byProd[k] || 0) + 1; }
  const COLORS = ["var(--gold)", "#2FA36B", "#F7D57A", "#1B6B45", "#8FA39A"];
  const top = Object.entries(byProd).sort((a, b) => b[1] - a[1]);
  const parts = top.slice(0, 4).map(([l, v], i) => ({ l, v, c: COLORS[i] }));
  if (top.length > 4) parts.push({ l: tr("Outros", "Others"), v: top.slice(4).reduce((a, x) => a + x[1], 0), c: COLORS[4] });
  const series = dailySeries(paid, 30, "paid_at", (s) => Number(s.producer_net_mzn || 0)).reduce((acc, v, i) => (acc.push((acc[i - 1] || 0) + v), acc), []);
  const live = courses.filter((c) => c.status === "approved").length, review = courses.filter((c) => c.status === "pending").length;
  const vs = tr("vs 30 dias antes", "vs previous 30 days");
  const recent = sales.slice(0, 5);

  main.innerHTML = dashShell("painel", `
    <div class="dk-head"><div><small class="crumb">${tr("Painel", "Dashboard")} / <b>${tr("Visão geral", "Overview")}</b></small>
      <h1 class="hello">${tr(`Olá, ${first}. Bem-vindo!`, `Hi, ${first}. Welcome!`)} 👋</h1></div>
      <a class="btn btn-primary" href="#/produtor/curso/novo">${ICON.plus} ${tr("Criar produto", "Create product")}</a></div>
    ${pushCardHTML()}

    <div class="stats kpis">
      <a class="stat kpi" href="#/carteira"><span>${tr("Ganhos líquidos", "Net earnings")}</span><b>${esc(mzn(totalNet))}</b>${deltaHTML(net(in30), net(prev30), vs)}</a>
      <a class="stat kpi" href="#/produtor/vendas"><span>${tr("Vendas confirmadas", "Confirmed sales")}</span><b>${paid.length}</b>${deltaHTML(in30.length, prev30.length, vs)}</a>
      <div class="stat kpi kpi-goal"><span>${tr("Meta de vendas", "Sales goal")}</span><b>${Math.round(Math.min(1, paid.length / goal) * 100)}%</b><small class="kpi-d">${tr("Meta", "Goal")}: ${esc(goalLabel)}</small>${gaugeSVG(paid.length / goal)}</div>
      <a class="stat kpi" href="#/produtor"><span>${tr("Produtos à venda", "Live products")}</span><b>${live}</b><small class="kpi-d">${review ? `${review} ${tr("em revisão", "in review")}` : `${courses.length} ${tr("no total", "in total")}`}</small></a>
    </div>

    <div class="dk-grid">
      <div class="dk-card dk-sales">
        <div class="dk-ch"><h2>${tr("Visão de vendas", "Sales overview")}</h2><a class="link-all" href="#/produtor/vendas">${tr("Ver vendas", "View sales")} ${ICON.arrow}</a></div>
        <div class="dk-sales-in">
          ${donutSVG(parts, String(paid.length), paid.length === 1 ? tr("venda", "sale") : tr("vendas", "sales"))}
          <div class="dk-legend">
            <div class="dk-big"><span class="ic">${ICON.cash}</span><div><small>${tr("Total vendido", "Gross sales")}</small><b>${esc(mzn(paid.reduce((a, s) => a + Number(s.amount_mzn || 0), 0)))}</b></div></div>
            ${parts.length ? `<ul>${parts.map((x) => `<li><i style="background:${x.c}"></i><span>${esc(x.l)}</span><b>${x.v}</b></li>`).join("")}</ul>` : `<p class="small muted">${tr("As tuas vendas por produto aparecem aqui.", "Your sales by product will show here.")}</p>`}
          </div>
        </div>
      </div>
      <div class="dk-card dk-trend">
        <div class="dk-ch"><h2>${tr("Ganhos", "Earnings")}</h2><small class="muted">${tr("acumulado em 30 dias", "30-day running total")}</small></div>
        <b class="dk-amt">${esc(mzn(net(in30)))}</b>
        ${areaSVG(series, { id: "arP" })}
      </div>
      <div class="dk-card dk-list">
        <div class="dk-ch"><h2>${tr("Últimas vendas", "Latest sales")}</h2><a class="link-all" href="#/produtor/vendas">${tr("Ver todas", "See all")} ${ICON.arrow}</a></div>
        ${recent.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${tr("Produto", "Product")}</th><th>${tr("Data", "Date")}</th><th>${tr("Ganho", "Earned")}</th><th>${tr("Estado", "Status")}</th></tr></thead>
          <tbody>${recent.map((s) => `<tr><td><b>${esc(s.courses?.title || "")}</b><small class="block muted">${esc(s.reference || "")}</small></td><td>${esc(date(s.paid_at || s.created_at))}</td><td>${esc(mzn(s.producer_net_mzn))}</td><td>${statusBadge(s.status, "order")}</td></tr>`).join("")}</tbody></table></div>`
          : `<p class="muted dk-empty">${tr("Ainda sem vendas. Publica um produto e partilha o link para começar.", "No sales yet. Publish a product and share the link to get started.")}</p>`}
      </div>
      <div class="dk-card dk-cta">
        <span class="promo-k">${ICON.bolt} UQUIORRAPAY</span>
        <h2>${tr("A tua ideia nasce pronta para vender!", "Your idea is born ready to sell!")}</h2>
        <p>${tr("Cria o produto, publica e recebe na tua carteira.", "Create the product, publish it and get paid into your wallet.")}</p>
        <a class="btn btn-primary btn-block" href="#/produtor/curso/novo">${tr("Criar produto grátis", "Create product for free")}</a>
      </div>
    </div>

    ${qBox}
    ${next ? `<div class="card-box steps-box">
      <div class="sb-head"><b>${tr("Próximos passos", "Next steps")}</b><small>${Math.round((done / steps.length) * 100)}% ${tr("concluído", "complete")}</small></div>
      <div class="sb-bar"><span style="width:${(done / steps.length) * 100}%"></span></div>
      <div class="sb-grid">
        <ul class="sb-list">${steps.map(([ok, label, href]) => `<li class="${ok ? "ok" : ""} ${next && label === next[1] ? "cur" : ""}">${ok ? `<i class="ck">${ICON.check}</i>` : `<i class="pend"></i>`}${href && !ok ? `<a href="${href}">${label}</a>` : `<span>${label}</span>`}</li>`).join("")}</ul>
        <div class="sb-promo">
          <div><h3>${!next ? tr("Parabéns, estás a vender!", "Congratulations, you're selling!") : next[2] === "#/perfil" ? tr("Estás a poucos passos de começar a vender", "You are a few steps away from starting to make sales") : tr("Chegou a tua vez de fazer acontecer!", "It's your time to make it happen!")}</h3>
            <p>${next && next[2] === "#/perfil" ? tr("Preenche os teus dados para desbloquear o próximo passo e levar o teu conhecimento ao mundo.", "Fill in your details to unlock the next step and take your knowledge to the world.") : tr("Transforma a tua ideia num produto e dá o primeiro passo para viver do que sabes.", "Turn your idea into a product and take the first step to living from what you know.")}</p>
            ${next && next[2] ? `<a class="btn btn-dark btn-sm" href="${next[2]}">${next[2] === "#/perfil" ? ICON.edit + " " + tr("Preencher dados", "Fill in data") : ICON.plus + " " + esc(next[1])}</a>` : ""}</div>
          <img src="${photo(PHOTOS.producer2, 500)}" alt="" loading="lazy">
        </div>
      </div>
    </div>` : ""}

    <div class="sec-title row-between"><h2>${tr("Os meus produtos", "My products")}</h2><a class="link-all" href="#/produtor">${tr("Ver todos", "Show all")} ${ICON.arrow}</a></div>
    ${productGrid(courses.slice(0, 4), { filter: query.f || "", base: "#/painel", fillTo: 4 })}


    <div class="sec-title"><h2>${tr("O que queres vender?", "What do you want to sell?")}</h2><p>${tr("Escolhe um formato e começa já.", "Choose a format and get started right away.")}</p></div>
    <div class="sell-types">${typeCards}</div>

    <div class="sec-title"><h2>${tr("Precisas de ajuda?", "Need help?")}</h2><p>${tr("Escolhe o melhor canal para ti.", "Choose the best channel for you.")}</p></div>
    <div class="help-grid">
      <div class="card-box"><b>${ICON.whats} ${tr("Apoio por WhatsApp", "WhatsApp support")}</b><p class="small muted">${tr("Equipa Uquiorrapay, pagamentos e dúvidas. Segunda a sexta.", "Uquiorrapay team, payments and questions. Monday to Friday.")}</p><a href="#/contacto">${tr("Falar connosco", "Talk to us")}</a></div>
      <div class="card-box"><b>${ICON.help} ${tr("Perguntas frequentes", "FAQ")}</b><p class="small muted">${tr("As respostas às dúvidas mais comuns.", "Answers to the most common questions.")}</p><a href="#/como-funciona">${tr("Ver como funciona", "See how it works")}</a></div>
    </div>`);
  wireProductMenus(main, courses, rerender);
  wirePush();
}

// ---------- Os meus produtos ----------
export async function dashboard(main, _p, query, alive) {
  const courses = await api.myCourses(state.user.id);
  if (!alive()) return;
  main.innerHTML = dashShell("produtos", `
    <div class="sec-head"><h1 class="page-title">${tr("Os meus produtos", "My products")}</h1><a class="btn btn-primary" href="#/produtor/curso/novo">${ICON.plus} ${tr("Criar produto", "Create product")}</a></div>
    ${productGrid(courses, { filter: query.f || "", base: "#/produtor", fillTo: courses.length ? 0 : 4 })}
    <p class="small muted pg-hint">${tr("Dica: carrega em «⋯» num produto para copiar o link de checkout, preencher o suporte, duplicar ou apagar.", "Tip: tap “⋯” on a product to copy the checkout link, fill in support, duplicate or delete.")} <a href="#/diretrizes">${tr("Diretrizes de conteúdo", "Content guidelines")}</a></p>`);
  wireProductMenus(main, courses, rerender);
}

// ---------- Gestão de vendas ----------
export async function salesPage(main, _p, query, alive) {
  const [sales, courses] = await Promise.all([api.salesForProducer(state.user.id), api.myCourses(state.user.id)]);
  if (!alive()) return;
  const st = query.estado || "", pid = query.produto || "", q = (query.q || "").toLowerCase();
  const rows = sales.filter((s) => (!st || s.status === st) && (!pid || s.course_id === pid) && (!q || String(s.reference).toLowerCase().includes(q)));
  const paid = sales.filter((s) => s.status === "paid");
  const sum = (arr, k) => arr.reduce((a, s) => a + Number(s[k] || 0), 0);
  main.innerHTML = dashShell("vendas", `
    <h1 class="page-title">${tr("Gestão de vendas", "Sales management")}</h1>
    <div class="stats">
      <div class="stat"><span>${tr("Vendas confirmadas", "Confirmed sales")}</span><b>${paid.length}</b><small>${sales.filter((s) => s.status === "pending").length} ${tr("a aguardar pagamento", "awaiting payment")}</small></div>
      <div class="stat"><span>${tr("Total vendido", "Gross sales")}</span><b>${esc(mzn(sum(paid, "amount_mzn")))}</b><small>&nbsp;</small></div>
      <div class="stat"><span>${tr("Taxa da plataforma", "Platform fee")}</span><b>${esc(mzn(sum(paid, "commission_mzn")))}</b><small>${pctFee()}%</small></div>
      <a class="stat hl" href="#/carteira"><span>${tr("Os teus ganhos", "Your earnings")}</span><b>${esc(mzn(sum(paid, "producer_net_mzn")))}</b><small>${tr("Ver carteira", "View wallet")} →</small></a>
    </div>
    <form class="filters-bar" id="sf">
      <input class="input" name="q" type="search" value="${esc(query.q || "")}" placeholder="${tr("Pesquisar pela referência", "Search by reference")}">
      <select class="input" name="estado"><option value="">${tr("Todos os estados", "All statuses")}</option>${["paid", "pending", "cancelled", "refunded"].map((x) => `<option value="${x}" ${x === st ? "selected" : ""}>${esc(statusBadge(x, "order").replace(/<[^>]+>/g, ""))}</option>`).join("")}</select>
      <select class="input" name="produto"><option value="">${tr("Todos os produtos", "All products")}</option>${courses.map((c) => `<option value="${esc(c.id)}" ${c.id === pid ? "selected" : ""}>${esc(c.title)}</option>`).join("")}</select>
      <button class="btn btn-green">${tr("Filtrar", "Filter")}</button>
    </form>
    <div class="card-box">
      ${rows.length ? `<div class="table-wrap"><table class="table">
        <thead><tr><th>${tr("Data", "Date")}</th><th>${tr("Produto", "Product")}</th><th>${tr("Referência", "Reference")}</th><th>${tr("Valor", "Amount")}</th><th>${tr("Ganho", "Earned")}</th><th>${tr("Origem", "Source")}</th><th>${tr("Estado", "Status")}</th></tr></thead>
        <tbody>${rows.map((s) => `<tr><td>${esc(date(s.paid_at || s.created_at))}</td><td>${esc(s.courses?.title || "")}</td><td><b>${esc(s.reference)}</b></td><td>${esc(mzn(s.amount_mzn))}</td><td>${esc(mzn(s.producer_net_mzn))}</td><td class="small">${s.affiliate_code ? `${tr("Afiliado", "Affiliate")} ${esc(s.affiliate_code)}` : tr("Directa", "Direct")}${s.coupon_code ? ` · ${esc(s.coupon_code)}` : ""}</td><td>${statusBadge(s.status, "order")}</td></tr>`).join("")}</tbody>
      </table></div>` : `<p class="muted center" style="padding:30px 0">${tr("Nenhuma venda encontrada.", "No sales found.")}</p>`}
    </div>`);
  document.getElementById("sf").addEventListener("submit", (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.target)) if (v) params.set(k, v);
    location.hash = "#/produtor/vendas" + (params.toString() ? "?" + params : "");
  });
}

// Envia um ficheiro mostrando a barra de progresso; "after" corre depois do envio (também ao tentar de novo)
async function sendFile(file, upload, after) {
  const t = trackUpload(file.name, file.size);
  try {
    const r = await upload(file, (f, abort) => t.progress(f, abort));
    await after?.(r);
    t.ok();
    return r;
  } catch (err) {
    if (err.cancelled) t.fail(tr("Envio cancelado.", "Upload cancelled."));
    else t.fail(err.message, () => sendFile(file, upload, after).catch(() => {}));
    throw err;
  }
}

// ---------- Sugestões com IA (títulos e descrição) ----------
const SPARK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/></svg>`;
export const aiOn = () => Boolean(state.settings.ai && state.settings.ai.assistant);
function aiHelpers(form, data, after) {
  if (!aiOn()) return;
  const t = form.querySelector("[name=title]"), dsc = form.querySelector("[name=description]");
  const mk = (el, want, label) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "ai-btn"; b.dataset.want = want; b.innerHTML = `${SPARK} ${label}`;
    el.closest("label").appendChild(b);
    b.addEventListener("click", async () => {
      const cur = data();
      if (want === "descricao" && !(cur.title || "").trim()) { toast(tr("Escreve primeiro o nome do produto.", "Write the product name first."), "err"); t?.focus(); return; }
      busy(b, true);
      try {
        const r = await api.aiAsk({ mode: "suggest", want, course: { product_type: cur.product_type, category: catLabel(cur.category || ""), title: cur.title, description: cur.description, price_mzn: cur.price_mzn } });
        if (want === "titulos") {
          form.querySelector(".ai-pick")?.remove();
          const box = document.createElement("div"); box.className = "ai-pick";
          box.innerHTML = `<small>${tr("Escolhe um título (podes editar depois):", "Pick a title (you can edit it later):")}</small>${(r.titles || []).map((x) => `<button type="button" class="chip">${esc(x)}</button>`).join("")}`;
          b.after(box);
          box.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return; t.value = c.textContent.slice(0, 140); t.dispatchEvent(new Event("input", { bubbles: true })); box.remove(); });
        } else if (r.text) {
          if (dsc.value.trim().length > 30 && !(await modal({ title: tr("Substituir a descrição?", "Replace the description?"), body: tr("A IA escreveu uma nova descrição. Revê sempre antes de guardar.", "The AI wrote a new description. Always review it before saving."), confirm: tr("Substituir", "Replace") }))) return;
          dsc.value = r.text.slice(0, DESC_MAX); dsc.dispatchEvent(new Event("input", { bubbles: true })); after?.();
          toast(tr("Descrição sugerida. Lê e ajusta antes de guardar.", "Description suggested. Read and adjust before saving."));
        }
      } catch (err) { toast(err.message, "err"); }
      finally { busy(b, false); }
    });
  };
  if (t) mk(t, "titulos", tr("Sugerir títulos com IA", "Suggest titles with AI"));
  if (dsc) mk(dsc, "descricao", tr("Escrever descrição com IA", "Write description with AI"));
}

// ---------- Criar produto (3 passos) ----------
const catChips = (cur) => `<select class="input" name="category" required>${catOptions(cur, tr("Escolhe a categoria…", "Choose a category…"))}</select>`;
// Preço: mínimo 79 MZN, máximo 250 000 MZN, qualquer valor inteiro
const PMIN = CONFIG.PRICE_MIN, PMAX = CONFIG.PRICE_MAX;
const priceInput = (v) => `<input class="input big-in" name="price_mzn" type="number" inputmode="numeric" min="${PMIN}" max="${PMAX}" step="1" required value="${esc(v ?? "")}" placeholder="${PMIN}">
  <small class="muted">${tr(`Qualquer valor entre ${PMIN} MZN e ${PMAX.toLocaleString("pt-PT")} MZN.`, `Any amount between ${PMIN} and ${PMAX.toLocaleString("en-GB")} MZN.`)}</small>`;
const usdInput = (v) => `<div class="usd-in"><span>$</span><input class="input big-in" name="price_usd" type="number" inputmode="decimal" min="1" max="5000" step="0.01" required value="${esc(v ?? "")}" placeholder="10"><em>USD</em></div>`;
const usdOk = (v) => { const n = Number(v); return Number.isFinite(n) && n >= 1 && n <= 5000; };
const usdSuggest = (mznV) => (Number(mznV) > 0 ? Math.max(1, Math.round(Number(mznV) / usdRate())) : "");
const usdErr = () => toast(tr("O preço internacional tem de ser entre 1 e 5000 dólares.", "International price must be between 1 and 5000 USD."), "err");
const priceOk = (v) => { const n = Number(v); return Number.isFinite(n) && n >= PMIN && n <= PMAX; };
const priceErr = () => toast(tr(`O preço tem de ser entre ${PMIN} MZN e ${PMAX.toLocaleString("pt-PT")} MZN.`, `Price must be between ${PMIN} and ${PMAX} MZN.`), "err");

export async function createWizard(main, _p, query) {
  try { await ensureProducer(); } catch (err) { toast(err.message, "err"); }
  const d = { product_type: TYPES.includes(query.tipo) ? query.tipo : "", title: "", description: "", language: state.lang === "en" ? "en" : "pt", category: "", price_mzn: "", price_usd: "", file: null };
  let step = d.product_type ? 2 : 1;
  const shell = (inner) => dashShell("criar", `<div class="wizard"><a class="back dark" href="#/produtor">← ${tr("Os meus produtos", "My products")}</a>${inner}</div>`);

  const render = () => {
    if (step === 1) {
      main.innerHTML = shell(`<p class="step-n">${tr("Passo 1 de 3", "Step 1 of 3")}</p><h1 class="w-title">${tr("O que queres vender?", "What would you like to sell?")}</h1>
        <div class="type-grid">${Object.entries(TYPE_INFO()).map(([t, [ic, title, text]]) => `<button type="button" class="type-card ${d.product_type === t ? "on" : ""}" data-t="${t}"><span class="tc-ic">${ic}</span><b>${title}</b><small>${text}</small></button>`).join("")}</div>`);
      main.querySelector(".type-grid").onclick = (e) => { const b = e.target.closest("[data-t]"); if (!b) return; d.product_type = b.dataset.t; step = 2; render(); };
      return;
    }
    if (step === 2) {
      main.innerHTML = shell(`<p class="step-n">${tr("Passo 2 de 3", "Step 2 of 3")} · ${esc(typeLabel(d.product_type))}</p>
        <h1 class="w-title">${tr("Informação básica", "Basic information")}</h1>
        <p class="muted">${tr("Esta informação é muito importante para o teu produto. Preenche com cuidado.", "This information is very important for your product. Fill it in carefully.")}</p>
        <form id="w2" class="form w-form">
          <label>${tr("Nome do produto", "Product name")}<input class="input" name="title" required minlength="3" maxlength="140" value="${esc(d.title)}" placeholder="${tr("Escolhe um nome que chame a atenção dos compradores", "Choose a name that grabs buyers' attention")}"><small class="muted">${tr("Este nome aparece em toda a Uquiorrapay.", "This name is shown everywhere on Uquiorrapay.")}</small></label>
          <label><span class="row-between">${tr("Descrição", "Description")}<em class="counter" id="cnt">0/${DESC_MAX}</em></span><textarea class="input" name="description" rows="5" maxlength="${DESC_MAX}" required minlength="30" placeholder="${tr("Conta um pouco sobre o teu produto e o que ele oferece. Sê claro e directo!", "Tell buyers about your product and what it offers. Be clear and concise!")}">${esc(d.description)}</textarea><small class="muted">${tr("Entre 30 e 500 caracteres. É a descrição que os compradores vão ler.", "Between 30 and 500 characters. This is what buyers will read.")}</small></label>
          <label>${tr("Língua do produto", "Product language")}<select class="input" name="language"><option value="pt" ${d.language === "pt" ? "selected" : ""}>Português</option><option value="en" ${d.language === "en" ? "selected" : ""}>English</option></select><small class="muted">${tr("Mostrada no momento da compra.", "Shown at the moment of purchase.")}</small></label>
          <div class="field"><span class="flabel">${tr("Capa do produto", "Product cover")}</span>
            <label class="drop" id="drop">${d.file ? `<img src="${URL.createObjectURL(d.file)}" alt="">` : `<span>${tr("Larga aqui a imagem", "Drop the image here")}</span><small>${tr("ou", "or")}</small><span class="btn btn-sm btn-ghost-dark">${tr("Escolher ficheiro", "Select a file")}</span>`}<input type="file" id="img" accept="image/*" hidden></label>
            <small class="muted">${tr("JPG ou PNG, até 5 MB. Ideal: 1280×720 píxeis. Opcional — sem imagem usamos uma fotografia da categoria.", "JPG or PNG, max 5 MB. Ideal: 1280×720 pixels. Optional — without one we use a category photo.")}</small></div>
          <div class="field"><span class="flabel">${tr("Categoria do produto", "Product category")}</span><small class="muted">${tr("Assim os clientes encontram o teu produto mais facilmente.", "This way customers find your product more easily.")}</small>${catChips(d.category)}</div>
          <div class="w-actions"><button type="button" class="btn btn-ghost-dark" id="back">${tr("Voltar", "Back")}</button><button class="btn btn-primary">${tr("Continuar", "Continue")} ${ICON.arrow}</button></div>
        </form>`);
      const f = document.getElementById("w2");
      const cnt = () => descCount(f.description);
      cnt(); f.description.addEventListener("input", cnt);
      aiHelpers(f, () => ({ ...d, ...Object.fromEntries(new FormData(f)), file: null }), cnt);
      document.getElementById("img").addEventListener("change", (e) => {
        const file = e.target.files[0]; if (!file) return;
        if (file.size > 25 * 1024 * 1024) { toast(tr("Imagem demasiado grande (máx. 25 MB).", "Image too large (max 25 MB)."), "err"); return; }
        Object.assign(d, Object.fromEntries(new FormData(f))); d.file = file; render();
      });
      const drop = document.getElementById("drop");
      drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
      drop.addEventListener("dragleave", () => drop.classList.remove("over"));
      drop.addEventListener("drop", (e) => { e.preventDefault(); const file = e.dataTransfer.files[0]; if (file && /^image\//.test(file.type)) { Object.assign(d, Object.fromEntries(new FormData(f))); d.file = file; render(); } });
      document.getElementById("back").onclick = () => { Object.assign(d, Object.fromEntries(new FormData(f))); step = 1; render(); };
      f.addEventListener("submit", (e) => {
        e.preventDefault();
        if (descTooLong(f.description)) return;
        Object.assign(d, Object.fromEntries(new FormData(f)));
        if (!d.category) { toast(tr("Escolhe a categoria do produto.", "Choose the product category."), "err"); f.category.focus(); return; }
        step = 3; render();
      });
      return;
    }
    const fee = pctFee();
    main.innerHTML = shell(`<p class="step-n">${tr("Passo 3 de 3", "Step 3 of 3")}</p>
      <h1 class="w-title">${tr("Preços", "Pricing")}</h1>
      <p class="muted">${tr("Cada produto tem dois preços: um para Moçambique (meticais) e outro para quem compra de fora (dólares). Podes mudar mais tarde.", "Each product has two prices: one for Mozambique (meticais) and one for international buyers (dollars). You can change them later.")}</p>
      <form id="w3" class="form w-form">
        <label>${tr("Moeda", "Currency")}<select class="input" disabled><option>MZN — Metical</option></select><small class="muted">${tr("Os compradores de outros países vêem o valor aproximado na sua moeda.", "Buyers in other countries see the approximate value in their currency.")}</small></label>
        <label>${tr("Forma de pagamento", "Payment method")}<select class="input" disabled><option>${tr("Pagamento único", "One-time payment")}</option></select></label>
        <div class="two-prices">
          <label><span class="pr-flag">🇲🇿 ${tr("Preço nacional (MZN)", "Local price (MZN)")}</span>${priceInput(d.price_mzn)}<small class="muted">${tr("M-Pesa e e-Mola", "M-Pesa and e-Mola")}</small></label>
          <label><span class="pr-flag">🌍 ${tr("Preço internacional (USD)", "International price (USD)")}</span>${usdInput(d.price_usd)}<small class="muted">${tr("PayPal e cartão Visa/Mastercard", "PayPal and Visa/Mastercard")}</small></label>
        </div>
        <div class="earn" id="earn"></div>
        <label class="switch gar-sw"><input type="checkbox" name="guarantee_enabled" ${d.guarantee_enabled ? "checked" : ""}><span><b>${tr(`Oferecer garantia de ${gDays()} dias ao comprador (opcional)`, `Offer buyers a ${gDays()}-day guarantee (optional)`)}</b><small>${tr(`Sem garantia, o dinheiro de cada venda fica disponível na hora para levantar. Com garantia, fica retido ${gDays()} dias (o prazo em que o comprador pode pedir reembolso) e o selo de garantia aparece na página de venda.`, `Without a guarantee, the money from each sale is available right away. With a guarantee, it is held for ${gDays()} days (the refund window) and the guarantee badge shows on the sales page.`)}</small></span></label>
        <div class="w-actions"><button type="button" class="btn btn-ghost-dark" id="back">${tr("Voltar", "Back")}</button>
          <span class="spacer"></span>
          <button type="button" class="btn btn-soft" id="draft">${ICON.doc} ${tr("Guardar como rascunho", "Save as draft")}</button>
          <button class="btn btn-primary" id="create">${tr("Criar e adicionar conteúdo", "Create and add content")} ${ICON.arrow}</button></div>
      </form>`);
    const f = document.getElementById("w3");
    const earn = () => {
      const v = Number(f.price_mzn.value || 0);
      document.getElementById("earn").innerHTML = `<div><span>${tr("Preço de venda", "Sale price")}</span><b>${esc(mzn(v))}</b></div><div><span>${tr(`Taxa Uquiorrapay (${fee}%)`, `Uquiorrapay fee (${fee}%)`)}</span><b>−${esc(mzn((v * fee) / 100))}</b></div><div class="tot"><span>${tr("Recebes por venda", "You receive per sale")}</span><b>${esc(mzn(v - (v * fee) / 100))}</b></div>`;
    };
    earn(); f.price_mzn.addEventListener("input", earn);
    // sugere o preço em dólares a partir do preço em meticais até o produtor o mudar
    let usdTouched = Boolean(d.price_usd);
    f.price_usd.addEventListener("input", () => { usdTouched = true; });
    f.price_mzn.addEventListener("input", () => { if (!usdTouched) f.price_usd.value = usdSuggest(f.price_mzn.value); });
    document.getElementById("back").onclick = () => { d.price_mzn = f.price_mzn.value; d.price_usd = f.price_usd.value; d.guarantee_enabled = f.guarantee_enabled.checked; step = 2; render(); };
    let asDraft = false;
    document.getElementById("draft").onclick = () => { asDraft = true; f.requestSubmit(); };
    document.getElementById("create").onclick = () => { asDraft = false; };
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      d.price_mzn = f.price_mzn.value; d.price_usd = f.price_usd.value;
      if (!priceOk(d.price_mzn)) { priceErr(); f.price_mzn.focus(); return; }
      if (!usdOk(d.price_usd)) { usdErr(); f.price_usd.focus(); return; }
      const btn = document.getElementById(asDraft ? "draft" : "create"); busy(btn, true);
      try {
        let c = await api.createCourse({ product_type: d.product_type, title: d.title.trim(), description: d.description.trim(), language: d.language, category: d.category, price_mzn: Math.round(Number(d.price_mzn)), price_usd: Math.round(Number(d.price_usd) * 100) / 100, guarantee_enabled: Boolean(f.guarantee_enabled.checked) });
        if (d.file) {
          const cid = c.id;
          try { await sendFile(d.file, (f, p) => api.uploadCover(cid, f, p), async (url) => { await api.updateCourse(cid, { cover_url: url }); }); }
          catch (err) { toast(tr("Produto criado, mas a capa falhou. Podes carregá-la depois em «Capa do produto».", "Product created, but the cover failed. Upload it later in “Product cover”."), "err"); }
        }
        if (asDraft) { toast(tr("Rascunho guardado. Podes continuar quando quiseres em «Os meus produtos».", "Draft saved. Continue anytime from “My products”.")); go(`#/produtor/curso/${c.id}`); return; }
        toast(tr("Produto criado! Agora adiciona o conteúdo.", "Product created! Now add the content."));
        go(`#/produtor/curso/${c.id}?sec=conteudo`);
      } catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
  };
  render();
}

// ---------- Página do produto: lista de passos + secções ----------
const CONTENT_TXT = (t) => ({
  curso: [tr("Aulas do curso", "Course lessons"), tr("Organiza o curso em módulos e aulas. Em cada aula carrega o vídeo ou cola o link do YouTube.", "Organise the course into modules and lessons. In each lesson upload the video or paste a YouTube link.")],
  ebook: [tr("Ficheiro do ebook", "Ebook file"), tr("Carrega o livro em PDF ou EPUB. Podes dividir em vários ficheiros (capítulos).", "Upload the book as PDF or EPUB. You can split it into several files (chapters).")],
  template: [tr("Ficheiros do template", "Template files"), tr("Carrega os ficheiros que o comprador recebe: ZIP, Excel, Word, PowerPoint, PDF ou imagens.", "Upload the files buyers receive: ZIP, Excel, Word, PowerPoint, PDF or images.")],
  audio: [tr("Episódios de áudio", "Audio episodes"), tr("Carrega os áudios (MP3, M4A) ou cola o link de cada episódio.", "Upload audio files (MP3, M4A) or paste each episode's link.")],
}[t || "curso"] || []);
function checklist(course, { lessons, coupons, profileOk }) {
  const [ct, cd] = CONTENT_TXT(course.product_type);
  return [
    { k: "info", req: true, ok: Boolean(course.title && (course.description || "").length >= 30 && course.category), t: tr("Informação básica", "Basic information"), d: tr("Nome, descrição, tipo, língua e categoria.", "Name, description, type, language and category.") },
    { k: "capa", req: false, rec: true, ok: Boolean(course.cover_url), t: tr("Capa do produto", "Product cover"), d: tr("A imagem que aparece na montra e na página de venda.", "The image shown in the marketplace and sales page.") },
    { k: "preco", req: true, ok: course.price_mzn != null && Number(course.price_mzn) >= CONFIG.PRICE_MIN && Number(course.price_usd) >= 1, t: tr("Preços (nacional e internacional)", "Prices (local and international)"), d: tr("Preço em meticais para Moçambique e em dólares para quem paga de fora (PayPal ou cartão).", "Price in meticais for Mozambique and in dollars for international buyers (PayPal or card).") },
    { k: "garantia", req: false, ok: Boolean(course.guarantee_enabled), t: tr("Garantia ao comprador", "Buyer guarantee"), d: tr(`Opcional. Sem garantia, o dinheiro das vendas fica disponível na hora. Com garantia de ${gDays()} dias, fica retido esse prazo.`, `Optional. Without a guarantee, sale money is available right away. With a ${gDays()}-day guarantee, it is held for that period.`) },
    { k: "pagina", req: true, ok: Boolean((course.learn_points || "").trim()), t: tr("Página de venda", "Sales page"), d: tr("O que o comprador vai aprender, para quem é e requisitos.", "What buyers will learn, who it's for and requirements.") },
    { k: "conteudo", req: true, ok: lessons > 0, t: ct, d: cd },
    { k: "oferta", req: false, rec: true, ok: Boolean(cleanBonuses(course.bonuses).length || course.compare_price_mzn), t: tr("Bónus da oferta", "Offer bonuses"), d: tr("Bónus que tornam a oferta irresistível (ex.: modelo extra, grupo no WhatsApp).", "Bonuses that make the offer irresistible (e.g. extra template, WhatsApp group).") },
    { k: "suporte", req: true, ok: supportOk(course), t: tr("Suporte ao comprador", "Buyer support"), d: tr("Obrigatório: o teu WhatsApp e email para os compradores te contactarem. Sem isto não recebes o link de checkout.", "Required: your WhatsApp and email so buyers can reach you. Without this you don't get the checkout link.") },
    { k: "perfil", req: true, ok: profileOk, t: tr("Dados pessoais completos", "Personal details completed"), d: tr("Precisamos do teu nome e telefone para te pagar.", "We need your name and phone to pay you.") },
    { k: "afiliados", req: false, ok: Boolean(course.affiliate_enabled), t: tr("Programa de afiliados", "Affiliate program"), d: tr("Vende mais com outras pessoas a promover o teu produto por comissão.", "Sell more with others promoting your product for a commission.") },
    { k: "pixel", req: false, ok: Boolean(course.meta_pixel_id), t: tr("Pixel do Facebook", "Facebook pixel"), d: tr("Mede os teus anúncios: o teu pixel do Meta recebe as visitas, inícios de compra e vendas deste produto.", "Measure your ads: your Meta pixel receives this product's visits, checkouts and sales.") },
    { k: "cupoes", req: false, ok: coupons > 0, t: tr("Cupões de desconto", "Discount coupons"), d: tr("Cria promoções para campanhas e datas especiais.", "Create promotions for campaigns and special dates.") },
    { k: "funil", req: false, ok: Boolean(course.bump_course_id || course.upsell_course_id || course.downsell_course_id), t: tr("Order bump, upsell e downsell", "Order bump, upsell & downsell"), d: tr("Vende mais na mesma compra: um produto extra no checkout e ofertas especiais logo depois do pagamento.", "Sell more per purchase: an extra product at checkout and special offers right after payment.") },
  ];
}

export async function editor(main, { id }, query, alive) {
  let course = await api.course(id);
  if (!alive()) return;
  if (!course || (course.producer_id !== state.user.id && !isAdmin())) {
    main.innerHTML = dashShell("produtos", emptyState(tr("Produto não encontrado", "Product not found")));
    return;
  }
  const sec = query.sec || "";
  const [mods, coupons] = await Promise.all([api.courseContent(id), api.coupons(id).catch(() => [])]);
  if (!alive()) return;
  const lessons = mods.reduce((a, m) => a + m.lessons.length, 0);
  const profileOk = Boolean(state.profile?.full_name && state.profile?.phone);
  const list = checklist(course, { lessons, coupons: coupons.length, profileOk });
  const reqOk = list.filter((x) => x.req).every((x) => x.ok);
  const secHref = (k) => (k === "perfil" ? "#/perfil" : `#/produtor/curso/${id}?sec=${k}`);

  const head = `<div class="prod-head">
      ${coverHTML(course, "xs")}
      <div><h1>${esc(course.title)}</h1><small>ID ${esc(String(id).slice(0, 8).toUpperCase())}</small>
        <div class="ph-badges"><span class="badge">${esc(typeLabel(course.product_type))}</span>${statusBadge(course.status)}</div></div>
      <div class="ph-actions"><a class="btn btn-sm btn-ghost-dark" href="#/curso/${esc(id)}">${tr("Ver página de venda", "View sales page")}</a>${lessons ? `<a class="btn btn-sm btn-ghost-dark" href="#/aprender/${esc(id)}">${tr("Ver como aluno", "View as student")}</a>` : ""}</div>
    </div>`;

  const statusBox = {
    draft: "",
    pending: `<div class="alert">${tr("Em revisão. A nossa IA faz uma primeira análise e a equipa confirma. Recebes a decisão aqui.", "Under review. Our AI does a first check and the team confirms. You'll see the decision here.")}</div>`,
    approved: `<div class="alert alert-ok">${tr("Publicado e à venda. Alterar nome, descrição, preço, imagem ou bónus envia o produto de novo para revisão.", "Live and on sale. Changing name, description, prices, image or bonuses sends it back for review.")}</div>`,
    rejected: `<div class="alert alert-err">${tr("Não aprovado", "Not approved")}: ${esc(course.rejection_reason || "")} — ${tr("corrige e envia de novo.", "fix it and submit again.")}</div>`,
  }[course.status] || "";

  // Barra «Guardar como rascunho / Enviar para análise» — aparece na lista de passos e em todas as secções
  const missing = list.filter((x) => x.req && !x.ok);
  const actions = course.status === "approved" ? "" : `<div class="pub-bar">
      <div><b>${course.status === "pending" ? tr("Em análise", "Under review") : course.status === "rejected" ? tr("Não aprovado — corrige e envia de novo", "Not approved — fix and resubmit") : tr("Rascunho", "Draft")}</b>
        <small>${course.status === "pending" ? tr("A equipa está a rever o produto.", "Our team is reviewing it.") : missing.length ? tr(`Falta: ${missing.map((x) => x.t).join(", ")}`, `Missing: ${missing.map((x) => x.t).join(", ")}`) : tr("Tudo pronto para enviar!", "Ready to submit!")}</small></div>
      <div class="pub-btns">${course.status === "pending"
        ? `<button type="button" class="btn btn-ghost-dark" data-pub="draft">${tr("Voltar a rascunho", "Back to draft")}</button>`
        : `<button type="button" class="btn btn-soft" data-pub="save">${ICON.doc} ${tr("Guardar como rascunho", "Save as draft")}</button>
           <button type="button" class="btn btn-green" data-pub="send">${tr("Enviar para análise", "Submit for review")} ${ICON.arrow}</button>`}</div>
    </div>`;
  let dirty = false;
  main.oninput = (e) => { if (e.target.type !== "file" && e.target.closest("form#f, #affForm, .lesson")) dirty = true; };
  main.onclick = async (e) => {
    if (e.target.closest("[data-act=les-save]")) dirty = false;
    const b = e.target.closest("[data-pub]"); if (!b) return;
    const act = b.dataset.pub;
    const secForm = document.querySelector("main form#f");
    if (sec && dirty) {
      if (act === "save" && secForm) { secForm.requestSubmit(); return; } // guarda a secção e volta à lista
      toast(tr("Tens alterações por guardar. Carrega primeiro em «Guardar».", "You have unsaved changes. Click “Save” first."), "err");
      (secForm?.querySelector("button.btn-green") || document.querySelector("main .lesson [data-act=les-save]"))?.focus();
      return;
    }
    busy(b, true);
    try {
      if (act === "send") {
        // verifica de novo com os dados mais recentes (ex.: acabou de carregar um vídeo)
        const [c2, m2, cp2] = await Promise.all([api.course(id), api.courseContent(id), api.coupons(id).catch(() => [])]);
        const l2 = checklist(c2, { lessons: m2.reduce((a, m) => a + m.lessons.length, 0), coupons: cp2.length, profileOk });
        const miss2 = l2.filter((x) => x.req && !x.ok);
        if (miss2.length) {
          toast(tr(`Antes de enviar, completa: ${miss2.map((x) => x.t).join(", ")}.`, `Before submitting, complete: ${miss2.map((x) => x.t).join(", ")}.`), "err");
          busy(b, false);
          if (sec) { go(`#/produtor/curso/${id}?falta=1&t=${Date.now()}`); return; }
          main.querySelectorAll(".todo-item").forEach((el, i) => el.classList.toggle("need", !l2[i].ok && l2[i].req));
          main.querySelector(".todo-item.need")?.scrollIntoView({ behavior: "smooth", block: "center" });
          return;
        }
        await api.updateCourse(id, { status: "pending" });
        toast(tr("Enviado para análise! Recebes a decisão aqui.", "Submitted for review! You'll see the decision here."));
        go(`#/produtor/curso/${id}?t=${Date.now()}`);
      } else if (act === "draft") {
        await api.updateCourse(id, { status: "draft" }); toast(tr("Voltou a rascunho.", "Back to draft.")); go(`#/produtor/curso/${id}?t=${Date.now()}`);
      } else {
        if (course.status === "rejected") await api.updateCourse(id, { status: "draft" });
        toast(tr("Rascunho guardado. Continua quando quiseres.", "Draft saved. Continue anytime.")); go("#/produtor");
      }
    } catch (err) { toast(err.message, "err"); busy(b, false); }
  };

  // Visão geral (lista de passos)
  if (!sec) {
    const base = siteUrl();
    const links = course.status === "approved" && !supportOk(course) ? `<div class="alert alert-err">${ICON.help} ${tr("O link de checkout está bloqueado: preenche o suporte ao comprador (WhatsApp e email).", "Checkout link locked: fill in buyer support (WhatsApp and email).")} <a href="#/produtor/curso/${esc(id)}?sec=suporte">${tr("Preencher agora", "Fill in now")} →</a></div>`
      : course.status === "approved" ? `<div class="card-box sale-links">
        <h2>${ICON.link} ${tr("Links de venda", "Sales links")}</h2>
        <p class="muted small">${tr("Partilha estes links no WhatsApp, Facebook, Instagram ou onde quiseres.", "Share these links on WhatsApp, Facebook, Instagram or anywhere.")}</p>
        <div class="sl-row"><div><b>${tr("Link de checkout (compra directa)", "Checkout link (direct purchase)")}</b><code>${esc(base)}#/checkout/${esc(id)}</code></div><button class="btn btn-sm btn-green" data-copy="${esc(base)}#/checkout/${esc(id)}">${ICON.copy} ${tr("Copiar", "Copy")}</button></div>
        <div class="sl-row"><div><b>${tr("Página de venda", "Sales page")}</b><code>${esc(base)}#/curso/${esc(id)}</code></div><button class="btn btn-sm btn-soft" data-copy="${esc(base)}#/curso/${esc(id)}">${ICON.copy} ${tr("Copiar", "Copy")}</button></div>
      </div>` : `<p class="small muted sl-wait">${ICON.link} ${tr("O link de checkout e o link de venda aparecem aqui depois de preencheres o suporte ao comprador e o produto ser aprovado.", "The checkout and sales links appear here once buyer support is filled in and the product is approved.")}</p>`;
    const promo = course.status === "approved" && supportOk(course) && state.settings.boost?.enabled !== false
      ? `<a class="card-box promo-box" href="#/produtor/curso/${esc(id)}?sec=anunciar"><span class="pb-ic">${ICON.trend}</span><div><b>${isSponsored(course) ? tr(`Em destaque até ${date(course.sponsored_until)}`, `Sponsored until ${date(course.sponsored_until)}`) : tr("Anunciar este produto", "Promote this product")}</b><small>${tr("Aparece em «Patrocinados» na página inicial e no topo da loja.", "Show up in “Sponsored” on the home page and at the top of the store.")}</small></div><span class="btn btn-sm btn-primary">${isSponsored(course) ? tr("Ver resultados", "See results") : tr("Anunciar", "Promote")}</span></a>` : "";
    main.innerHTML = dashShell("produtos", `${head}${statusBox}${actions}${links}${promo}
      <div class="card-box todo">
        ${course.status === "approved" ? `<h2 class="todo-t ok">${ICON.check} ${tr("O teu produto está publicado", "Your product is live")}</h2>` : `<h2 class="todo-t">${ICON.help} ${tr("Faltam poucos passos para completar o teu produto", "Just a few more steps to complete your product")}</h2><p class="muted small">${tr("Completa a lista e depois carrega em «Enviar para análise».", "Complete the list, then click “Submit for review”.")}</p>`}
        <div class="todo-list">${list.map((x) => `<a class="todo-item ${x.ok ? "ok" : ""}" href="${secHref(x.k)}">
          <i class="box">${x.ok ? ICON.check : ""}</i>
          <div><b>${x.t}</b>${x.req ? "" : `<span class="opt ${x.rec ? "rec" : ""}">${x.rec ? tr("Recomendado", "Recommended") : tr("Opcional", "Optional")}</span>`}<small>${x.d}</small></div>
          <span class="todo-act">${x.ok ? tr("Editar", "Edit") : tr("Configurar", "Set up")}</span></a>`).join("")}</div>
        <div class="todo-foot">
          <p class="small muted">${tr("Ao enviar o produto, confirmo que o conteúdo é meu e aceito os", "By submitting, I confirm the content is mine and accept the")} <a href="#/termos">${tr("Termos de Uso", "Terms of Use")}</a> ${tr("e as", "and the")} <a href="#/diretrizes">${tr("Diretrizes de conteúdo", "Content guidelines")}</a>. ${tr("Conteúdo adulto (+18) e promessas falsas são proibidos.", "Adult (18+) content and false promises are prohibited.")}</p>
          ${course.status === "pending" ? `<button type="button" class="btn btn-ghost-dark" data-pub="draft">${tr("Voltar a rascunho", "Back to draft")}</button>`
            : course.status === "approved" ? "" : `<div class="pub-btns"><button type="button" class="btn btn-soft" data-pub="save">${tr("Guardar como rascunho", "Save as draft")}</button><button type="button" class="btn btn-green" data-pub="send">${tr("Enviar para análise", "Submit for review")}</button></div>`}
        </div>
      </div>
      ${["draft", "rejected"].includes(course.status) || isAdmin() ? `<button class="btn btn-danger-ghost btn-sm" id="del">${ICON.trash} ${tr("Apagar produto", "Delete product")}</button>` : ""}`);
    main.querySelectorAll(".sale-links [data-copy]").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy)));
    if (query.falta) {
      main.querySelectorAll(".todo-item").forEach((el, i) => el.classList.toggle("need", !list[i].ok && list[i].req));
      setTimeout(() => main.querySelector(".todo-item.need")?.scrollIntoView({ behavior: "smooth", block: "center" }), 200);
    }
    document.getElementById("del")?.addEventListener("click", async () => {
      if (!(await modal({ title: tr("Apagar este produto?", "Delete this product?"), body: tr("Esta acção não pode ser desfeita.", "This cannot be undone."), confirm: tr("Apagar", "Delete"), danger: true }))) return;
      try { await api.deleteCourse(id); toast(tr("Produto apagado.", "Product deleted.")); go("#/produtor"); } catch (err) { toast(err.message, "err"); }
    });
    return;
  }

  const item = sec === "anunciar"
    ? { k: "anunciar", t: tr("Anunciar este produto", "Promote this product"), d: tr("Põe o produto em «Patrocinados» na página inicial e no topo da loja durante os dias que escolheres.", "Put your product in “Sponsored” on the home page and at the top of the store for the days you choose.") }
    : list.find((x) => x.k === sec) || list[0];
  // Guia passo a passo: depois desta secção, sugere o próximo passo que falta
  const nextItem = list.find((x) => x.k !== sec && !x.ok && x.req) || list.find((x) => x.k !== sec && !x.ok && x.rec);
  const nextBtn = nextItem ? `<a class="next-step" href="${secHref(nextItem.k)}"><small>${tr("Próximo passo", "Next step")}</small><b>${nextItem.t}</b>${ICON.arrow}</a>` : "";
  const wrap = (inner) => dashShell("produtos", `${head}${actions}<a class="back dark" href="#/produtor/curso/${esc(id)}">← ${tr("Voltar à lista de passos", "Back to checklist")}</a>
    <div class="card-box sec-box"><h2>${item.t}</h2><p class="muted small">${item.d}</p>${inner}</div>
    ${nextBtn}
    ${actions ? `<div class="pub-bottom">${actions}</div>` : ""}`);
  const saved = (msg) => { toast(msg || tr("Guardado.", "Saved.")); };

  if (sec === "info") {
    main.innerHTML = wrap(`<form id="f" class="form">
      <label>${tr("Tipo de produto", "Product type")}<select class="input" name="product_type">${TYPES.map((t) => `<option value="${t}" ${t === (course.product_type || "curso") ? "selected" : ""}>${esc(typeLabel(t))}</option>`).join("")}</select></label>
      <label>${tr("Nome do produto", "Product name")}<input class="input" name="title" required minlength="3" maxlength="140" value="${esc(course.title || "")}"></label>
      <label>${tr("Subtítulo (uma frase que vende)", "Subtitle (one line that sells)")}<input class="input" name="subtitle" maxlength="160" value="${esc(course.subtitle || "")}"></label>
      <label><span class="row-between">${tr("Descrição", "Description")}<em class="counter" id="cnt"></em></span><textarea class="input" name="description" rows="6" maxlength="${DESC_MAX}" minlength="30" required>${esc(course.description || "")}</textarea></label>
      <label>${tr("Língua do produto", "Product language")}<select class="input" name="language"><option value="pt" ${course.language !== "en" ? "selected" : ""}>Português</option><option value="en" ${course.language === "en" ? "selected" : ""}>English</option></select></label>
      <div class="field"><span class="flabel">${tr("Categoria do produto", "Product category")}</span>${catChips(course.category)}</div>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button></form>`);
    const f = document.getElementById("f");
    const cnt = () => descCount(f.description);
    cnt(); f.description.addEventListener("input", cnt);
    aiHelpers(f, () => ({ ...course, ...Object.fromEntries(new FormData(f)) }), cnt);
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); if (descTooLong(f.description)) return; const btn = f.querySelector("button.btn-green"); busy(btn, true);
      try { course = await api.updateCourse(id, Object.fromEntries(new FormData(f))); saved(course.status === "pending" ? tr("Guardado. O produto voltou para revisão.", "Saved. The product went back to review.") : null); go(`#/produtor/curso/${id}`); }
      catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "capa") {
    main.innerHTML = wrap(`<div class="cover-up">
        <label class="drop big" id="drop">${course.cover_url ? `<img src="${esc(course.cover_url)}" alt="">` : `${ICON.plus}<span>${tr("Carregar a capa", "Upload the cover")}</span><small>${tr("ou larga a imagem aqui", "or drop the image here")}</small>`}<input type="file" id="cover" accept="image/*" hidden></label>
        <ul class="cover-tips"><li>JPG ${tr("ou", "or")} PNG — ${tr("fotos grandes do telemóvel são reduzidas automaticamente", "large phone photos are resized automatically")}</li><li>${tr("Tamanho ideal: 1280×720 píxeis (horizontal)", "Ideal size: 1280×720 pixels (landscape)")}</li><li>${tr("Põe o nome do curso grande e legível", "Make the course name big and readable")}</li><li>${tr("Sem capa, usamos uma fotografia da categoria", "Without a cover, we use a category photo")}</li></ul>
      </div>
      ${course.status === "approved" ? `<p class="small muted">${tr("Atenção: mudar a capa de um produto à venda envia-o de novo para revisão.", "Note: changing the cover of a live product sends it back for review.")}</p>` : ""}`);
    const up = async (file) => {
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) { toast(tr("Imagem demasiado grande (máx. 25 MB).", "Image too large (max 25 MB)."), "err"); return; }
      drop.classList.add("busy-up");
      try {
        await sendFile(file, (f, p) => api.uploadCover(id, f, p), async (url) => { course = await api.updateCourse(id, { cover_url: url }); saved(tr("Capa actualizada.", "Cover updated.")); go(`#/produtor/curso/${id}?sec=capa&t=${Date.now()}`); });
      } catch { drop.classList.remove("busy-up"); }
    };
    document.getElementById("cover").addEventListener("change", (e) => up(e.target.files[0]));
    const drop = document.getElementById("drop");
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); up(e.dataTransfer.files[0]); });
    return;
  }

  if (sec === "suporte") {
    main.innerHTML = wrap(`<form id="f" class="form">
      <div class="two">
        <label>WhatsApp ${tr("de suporte", "support")} *<input class="input" name="support_whatsapp" type="tel" inputmode="tel" required value="${esc(course.support_whatsapp || state.profile?.phone || "")}" placeholder="+258 84 123 4567"></label>
        <label>Email ${tr("de suporte", "support")} *<input class="input" name="support_email" type="email" required value="${esc(course.support_email || (/@telefone\./.test(state.user.email || "") ? "" : state.user.email) || "")}" placeholder="suporte@exemplo.com"></label>
      </div>
      <div class="alert small">${ICON.shield} ${tr("Obrigatório. Os compradores precisam de saber como te contactar. Só depois de preencheres recebes o link de checkout.", "Required. Buyers need to know how to reach you. Only then do you get the checkout link.")}</div>
      <label>${tr("Informação para os alunos", "Information for students")}<textarea class="input" name="support_info" rows="4" maxlength="600" placeholder="${tr("Ex.: Respondo de segunda a sexta, 8h–17h. Grupo de alunos no WhatsApp: …", "E.g. I reply Monday to Friday, 8am–5pm. Student WhatsApp group: …")}">${esc(course.support_info || "")}</textarea></label>
      <p class="small muted">${tr("Aparece na página de venda e na área do aluno, ao lado das aulas.", "Shown on the sales page and in the student area, next to the lessons.")}</p>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button></form>`);
    const f = document.getElementById("f");
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = f.querySelector("button.btn-green"); busy(btn, true);
      const fd = Object.fromEntries(new FormData(f));
      Object.keys(fd).forEach((k) => (fd[k] = fd[k].trim() || null));
      if (!supportOk(fd)) { toast(tr("Escreve um WhatsApp com pelo menos 9 dígitos e um email válido.", "Enter a WhatsApp with at least 9 digits and a valid email."), "err"); busy(btn, false); return; }
      try { course = await api.updateCourse(id, fd); saved(tr("Suporte guardado.", "Support saved.")); go(`#/produtor/curso/${id}`); } catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "preco") {
    const fee = pctFee();
    main.innerHTML = wrap(`<form id="f" class="form w-form">
      <label>${tr("Forma de pagamento", "Payment method")}<select class="input" disabled><option>${tr("Pagamento único", "One-time payment")}</option></select></label>
      <div class="two-prices">
        <label><span class="pr-flag">🇲🇿 ${tr("Preço nacional (MZN)", "Local price (MZN)")}</span>${priceInput(course.price_mzn != null ? Math.round(course.price_mzn) : "")}<small class="muted">${tr("M-Pesa e e-Mola", "M-Pesa and e-Mola")}</small></label>
        <label><span class="pr-flag">🌍 ${tr("Preço internacional (USD)", "International price (USD)")}</span>${usdInput(course.price_usd != null ? Number(course.price_usd) : usdSuggest(course.price_mzn))}<small class="muted">${tr("PayPal e cartão Visa/Mastercard", "PayPal and Visa/Mastercard")}</small></label>
      </div>
      <div class="earn" id="earn"></div>
      <details class="opt-box" ${course.compare_price_mzn ? "open" : ""}><summary>${ICON.tag} ${tr("Mostrar preço riscado (oferta) — opcional", "Show a strike-through price (offer) — optional")}</summary>
        <label>${tr("Preço «de» (MZN)", "“Was” price (MZN)")}<input class="input" name="compare_price_mzn" type="number" inputmode="numeric" min="1" step="1" value="${esc(course.compare_price_mzn != null ? Math.round(course.compare_price_mzn) : "")}" placeholder="${tr("ex.: 1500", "e.g. 1500")}"></label>
        <p class="small muted">${tr("Aparece riscado ao lado do preço actual (ex.: <s>1 500 MZN</s> 990 MZN). Tem de ser maior que o preço. Usa só valores verdadeiros — preços falsos são proibidos.", "Shown struck through next to the current price. Must be higher than the price. Use only real values — fake prices are prohibited.")}</p>
        <div id="cmpPrev"></div>
      </details>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button></form>`);
    const f = document.getElementById("f");
    const cmp = () => { const a = Number(f.compare_price_mzn.value || 0), v = Number(f.price_mzn.value || 0); document.getElementById("cmpPrev").innerHTML = a > v && v > 0 ? `<span class="offer-price"><s>${esc(mzn(a))}</s><span class="price">${esc(mzn(v))}</span><em class="off-badge">−${Math.round((1 - v / a) * 100)}%</em></span>` : a ? `<small class="err-text">${tr("O preço «de» tem de ser maior que o preço.", "The “was” price must be higher than the price.")}</small>` : ""; };
    cmp(); f.compare_price_mzn.addEventListener("input", cmp); f.price_mzn.addEventListener("input", cmp);
    const earn = () => { const v = Number(f.price_mzn.value || 0); document.getElementById("earn").innerHTML = `<div><span>${tr("Preço de venda", "Sale price")}</span><b>${esc(mzn(v))}</b></div><div><span>${tr(`Taxa Uquiorrapay (${fee}%)`, `Uquiorrapay fee (${fee}%)`)}</span><b>−${esc(mzn((v * fee) / 100))}</b></div><div class="tot"><span>${tr("Recebes por venda", "You receive per sale")}</span><b>${esc(mzn(v - (v * fee) / 100))}</b></div>`; };
    earn(); f.price_mzn.addEventListener("input", earn);
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!priceOk(f.price_mzn.value)) { priceErr(); f.price_mzn.focus(); return; }
      if (!usdOk(f.price_usd.value)) { usdErr(); f.price_usd.focus(); return; }
      const pv = Math.round(Number(f.price_mzn.value)), cv = f.compare_price_mzn.value ? Math.round(Number(f.compare_price_mzn.value)) : null, uv = Math.round(Number(f.price_usd.value) * 100) / 100;
      if (cv != null && cv <= pv) { toast(tr("O preço «de» tem de ser maior que o preço (ou deixa vazio).", "The “was” price must be higher than the price (or leave empty)."), "err"); f.compare_price_mzn.focus(); return; }
      const btn = f.querySelector("button.btn-green"); busy(btn, true);
      try { course = await api.updateCourse(id, { price_mzn: pv, compare_price_mzn: cv, price_usd: uv }); saved(tr("Preço guardado.", "Price saved.")); go(`#/produtor/curso/${id}`); } catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "pagina") {
    main.innerHTML = wrap(`<form id="f" class="form">
      <label>${tr("O que o comprador vai aprender (um ponto por linha)", "What buyers will learn (one per line)")}<textarea class="input" name="learn_points" rows="5" required placeholder="${tr("Criar fórmulas do zero\nFazer gráficos profissionais", "Build formulas from scratch\nMake professional charts")}">${esc(course.learn_points || "")}</textarea></label>
      <div class="two">
        <label>${tr("Para quem é (um por linha)", "Who it's for (one per line)")}<textarea class="input" name="audience" rows="4">${esc(course.audience || "")}</textarea></label>
        <label>${tr("Requisitos (um por linha)", "Requirements (one per line)")}<textarea class="input" name="requirements" rows="4">${esc(course.requirements || "")}</textarea></label>
      </div>
      <div class="row-between"><a class="btn btn-ghost-dark" href="#/curso/${esc(id)}" target="_blank">${tr("Pré-visualizar página", "Preview page")}</a><button class="btn btn-green">${tr("Guardar", "Save")}</button></div></form>`);
    const f = document.getElementById("f");
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); if (descTooLong(f.description)) return; const btn = f.querySelector("button.btn-green"); busy(btn, true);
      try { course = await api.updateCourse(id, Object.fromEntries(new FormData(f))); saved(); go(`#/produtor/curso/${id}`); } catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "oferta") {
    let bon = cleanBonuses(course.bonuses).map((b) => ({ title: b.title || "", desc: b.desc || "", value: b.value || "" }));
    main.innerHTML = wrap(`<form id="f" class="form">
      <h3 class="bonus-h">${ICON.gift} ${tr("Bónus (opcional)", "Bonuses (optional)")}</h3>
      <p class="small muted">${tr("Extras que o comprador recebe com o produto (ex.: modelo de orçamento, grupo no WhatsApp, aula ao vivo). Entrega os ficheiros dos bónus no conteúdo do produto.", "Extras buyers get with the product. Deliver the bonus files in the product content.")}</p>
      <div id="bonList"></div>
      <button type="button" class="btn btn-sm btn-outline-green" id="bonAdd">${ICON.plus} ${tr("Adicionar bónus", "Add bonus")}</button>
      ${course.status === "approved" ? `<p class="small muted">${tr("Atenção: alterar os bónus de um produto à venda envia-o de novo para revisão.", "Note: changing the bonuses of a live product sends it back for review.")}</p>` : ""}
      <div class="row-between"><a class="btn btn-ghost-dark" href="#/curso/${esc(id)}" target="_blank">${tr("Pré-visualizar página", "Preview page")}</a><button class="btn btn-green">${tr("Guardar", "Save")}</button></div></form>`);
    const f = document.getElementById("f");
    const read = () => { f.querySelectorAll(".bon-row").forEach((r, i) => { bon[i] = { title: r.querySelector("[name=bt]").value, desc: r.querySelector("[name=bd]").value, value: r.querySelector("[name=bv]").value }; }); };
    const drawB = () => {
      document.getElementById("bonList").innerHTML = bon.map((b, i) => `<div class="bon-row" data-i="${i}">
        <span class="bonus-n">${tr("Bónus", "Bonus")} ${i + 1}</span>
        <input class="input" name="bt" maxlength="100" value="${esc(b.title)}" placeholder="${tr("Nome do bónus", "Bonus name")}" aria-label="${tr("Nome do bónus", "Bonus name")}">
        <textarea class="input" name="bd" rows="2" maxlength="300" placeholder="${tr("O que é e como ajuda (opcional)", "What it is and how it helps (optional)")}" aria-label="${tr("Descrição", "Description")}">${esc(b.desc)}</textarea>
        <div class="bon-foot"><label class="bon-val">${tr("Valor (MZN, opcional)", "Value (MZN, optional)")}<input class="input" name="bv" type="number" min="0" max="1000000" step="1" value="${esc(b.value)}"></label>
        <button type="button" class="icon-btn danger" data-bdel="${i}" title="${tr("Remover", "Remove")}">${ICON.trash}</button></div></div>`).join("");
      document.getElementById("bonAdd").hidden = bon.length >= 10;
    };
    drawB();
    document.getElementById("bonAdd").addEventListener("click", () => { read(); bon.push({ title: "", desc: "", value: "" }); drawB(); f.querySelector(".bon-row:last-child [name=bt]")?.focus(); });
    document.getElementById("bonList").addEventListener("click", (e) => { const d = e.target.closest("[data-bdel]"); if (!d) return; read(); bon.splice(Number(d.dataset.bdel), 1); drawB(); dirty = true; });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); read();
      const bonuses = bon.filter((b) => b.title.trim()).map((b) => ({ title: b.title.trim().slice(0, 100), desc: b.desc.trim().slice(0, 300), ...(Number(b.value) > 0 ? { value: Math.round(Number(b.value)) } : {}) }));
      const btn = f.querySelector("button.btn-green"); busy(btn, true);
      const was = course.status;
      try { course = await api.updateCourse(id, { bonuses }); dirty = false; saved(was === "approved" && course.status === "pending" ? tr("Guardado. O produto voltou para revisão.", "Saved. The product went back to review.") : tr("Guardado.", "Saved.")); go(`#/produtor/curso/${id}`); }
      catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "garantia") {
    const gd = gDays();
    main.innerHTML = wrap(`<form id="f" class="form">
      <label class="switch"><input type="checkbox" name="guarantee_enabled" ${course.guarantee_enabled ? "checked" : ""}><span>${tr(`Oferecer garantia de ${gd} dias ao comprador`, `Offer buyers a ${gd}-day guarantee`)}</span></label>
      <div class="gar-cmp">
        <div class="${course.guarantee_enabled ? "" : "on"}" data-g="0"><b>⚡ ${tr("Sem garantia (saque na hora)", "No guarantee (instant withdrawal)")}</b><small>${tr("O valor de cada venda entra logo no saldo disponível da tua Carteira e podes levantá-lo na hora.", "Each sale goes straight to your available balance and you can withdraw it right away.")}</small></div>
        <div class="${course.guarantee_enabled ? "on" : ""}" data-g="1"><b>${ICON.shield} ${tr(`Com garantia de ${gd} dias`, `With a ${gd}-day guarantee`)}</b><small>${tr(`O selo de garantia aparece na página de venda e no checkout (dá mais confiança a quem compra). Em troca, o valor de cada venda fica retido ${gd} dias — o prazo em que o comprador pode pedir reembolso.`, `The guarantee badge shows on the sales page and checkout (more trust for buyers). In return, each sale is held for ${gd} days — the refund window.`)}</small></div>
      </div>
      <p class="small muted">${tr("Podes mudar quando quiseres. A escolha aplica-se às vendas feitas a partir desse momento.", "You can change this anytime. It applies to sales made from then on.")}</p>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button></form>`);
    const f = document.getElementById("f");
    f.guarantee_enabled.addEventListener("change", () => { f.querySelectorAll(".gar-cmp > div").forEach((el) => el.classList.toggle("on", el.dataset.g === (f.guarantee_enabled.checked ? "1" : "0"))); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = f.querySelector("button.btn-green"); busy(btn, true);
      try { course = await api.updateCourse(id, { guarantee_enabled: f.guarantee_enabled.checked }); dirty = false; saved(f.guarantee_enabled.checked ? tr(`Garantia de ${gd} dias activada.`, `${gd}-day guarantee turned on.`) : tr("Sem garantia: o dinheiro das vendas fica disponível na hora.", "No guarantee: sale money is available right away.")); go(`#/produtor/curso/${id}`); }
      catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "funil") {
    const mine = (await api.myCourses(course.producer_id).catch(() => [])).filter((x) => x.id !== id && x.status === "approved");
    if (!alive()) return;
    const byId = new Map(mine.map((x) => [x.id, x]));
    const opt = (cur) => `<option value="">${tr("— Nenhum —", "— None —")}</option>${mine.map((x) => `<option value="${esc(x.id)}" ${x.id === cur ? "selected" : ""}>${esc(x.title)} · ${esc(mzn(x.price_mzn))}</option>`).join("")}`;
    const block = (k, title, desc, icon, ph) => `<div class="panel fun-box"><h3>${icon} ${title}</h3><p class="small muted">${desc}</p>
      <label>${tr("Produto a oferecer", "Product to offer")}<select class="input" name="${k}_course_id">${opt(course[k + "_course_id"])}</select></label>
      <div class="two">
        <label>${tr("Preço especial (MZN)", "Special price (MZN)")}<input class="input" name="${k}_price_mzn" type="number" inputmode="numeric" min="20" step="1" value="${esc(course[k + "_price_mzn"] != null ? Math.round(course[k + "_price_mzn"]) : "")}" placeholder="${tr("ex.: 99", "e.g. 99")}"></label>
        <label>${tr("Frase curta (opcional)", "Short line (optional)")}<input class="input" name="${k}_text" maxlength="140" value="${esc(course[k + "_text"] || "")}" placeholder="${esc(ph)}"></label>
      </div></div>`;
    main.innerHTML = wrap(`${mine.length ? "" : `<div class="alert">${tr("Precisas de pelo menos outro produto aprovado (à venda) para criar estas ofertas.", "You need at least one other approved product to create these offers.")}</div>`}
      <form id="f" class="form">
      ${block("bump", "Order bump", tr("Aparece no checkout deste produto como uma caixa «Sim, quero adicionar». O comprador paga tudo junto e recebe os dois produtos.", "Shown at this product's checkout as a “Yes, add this too” box. The buyer pays once and gets both products."), ICON.gift, tr("ex.: Leva também o modelo pronto a usar", "e.g. Also get the ready-to-use template"))}
      ${block("upsell", "Upsell", tr("Aparece logo depois do pagamento confirmado (e na primeira visita à área de membros), com preço especial.", "Shown right after the payment is confirmed (and on the first visit to the members area), at a special price."), ICON.trend, tr("ex.: Dá o próximo passo com o curso avançado", "e.g. Take the next step with the advanced course"))}
      ${block("downsell", "Downsell", tr("Se o comprador recusar o upsell, mostra esta oferta mais acessível.", "If the buyer declines the upsell, show this more affordable offer."), ICON.tag, tr("ex.: Começa pelo essencial", "e.g. Start with the essentials"))}
      <p class="small muted">${tr("Os preços especiais têm de ser menores que o preço normal do produto oferecido (mínimo 20 MZN). Só produtos teus já aprovados.", "Special prices must be lower than the offered product's normal price (minimum 20 MZN). Only your approved products.")}</p>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button></form>`);
    const f = document.getElementById("f");
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fields = {};
      for (const k of ["bump", "upsell", "downsell"]) {
        const cid = f[k + "_course_id"].value || null, pv = f[k + "_price_mzn"].value ? Math.round(Number(f[k + "_price_mzn"].value)) : null, tx = f[k + "_text"].value.trim().slice(0, 140) || null;
        if (cid) {
          const target = byId.get(cid);
          if (!target) { toast(tr("Escolhe um produto teu aprovado.", "Choose one of your approved products."), "err"); return; }
          if (!(pv >= 20)) { toast(tr(`Escreve o preço especial (mínimo 20 MZN) para «${target.title}».`, `Enter the special price (min 20 MZN) for “${target.title}”.`), "err"); f[k + "_price_mzn"].focus(); return; }
          if (pv >= Number(target.price_mzn)) { toast(tr(`O preço especial de «${target.title}» tem de ser menor que ${mzn(target.price_mzn)}.`, `The special price for “${target.title}” must be lower than ${mzn(target.price_mzn)}.`), "err"); f[k + "_price_mzn"].focus(); return; }
        }
        fields[k + "_course_id"] = cid; fields[k + "_price_mzn"] = cid ? pv : null; fields[k + "_text"] = cid ? tx : null;
      }
      if (fields.upsell_course_id && fields.upsell_course_id === fields.downsell_course_id) { toast(tr("O downsell tem de ser um produto diferente do upsell.", "The downsell must be a different product from the upsell."), "err"); return; }
      const btn = f.querySelector("button.btn-green"); busy(btn, true);
      try { course = await api.updateCourse(id, fields); dirty = false; saved(tr("Ofertas guardadas.", "Offers saved.")); go(`#/produtor/curso/${id}`); }
      catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "afiliados") {
    main.innerHTML = wrap(`<form class="form" id="affForm">
      <label class="switch"><input type="checkbox" name="affiliate_enabled" ${course.affiliate_enabled ? "checked" : ""}><span>${tr("Permitir que afiliados promovam este produto", "Let affiliates promote this product")}</span></label>
      <label>${tr("Comissão do afiliado (%)", "Affiliate commission (%)")}<input class="input" name="affiliate_pct" type="number" min="0" max="80" step="1" value="${esc(course.affiliate_pct ?? 30)}"></label>
      <p class="small muted" id="affEx"></p>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button></form>
      <div class="aff-team" id="affTeam"></div>`);
    api.courseAffiliates(id).then((list) => {
      const box = document.getElementById("affTeam"); if (!box) return;
      box.innerHTML = `<h3>${tr("Os teus afiliados", "Your affiliates")} <small class="muted">(${list.length})</small></h3>` + (list.length
        ? `<div class="table-wrap"><table class="table"><thead><tr><th>${tr("Afiliado", "Affiliate")}</th><th>${tr("Cliques", "Clicks")}</th><th>${tr("Vendas", "Sales")}</th><th>${tr("Comissões pagas", "Commissions")}</th></tr></thead>
          <tbody>${list.map((x) => `<tr><td><b>${esc(x.name)}</b><br><small class="muted">${esc(x.code)}</small></td><td>${x.clicks}</td><td>${x.sales}</td><td>${esc(mzn(x.earned))}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="small muted">${tr("Ainda ninguém se afiliou. Com o programa ligado, o produto aparece no Mercado de afiliados.", "No affiliates yet. With the program on, the product shows in the Affiliate marketplace.")} <a href="#/afiliados">${tr("Ver o mercado", "See the marketplace")}</a></p>`);
    }).catch(() => {});
    const affForm = document.getElementById("affForm");
    const affEx = () => {
      const a = Number(affForm.affiliate_pct.value || 0), price = Number(course.price_mzn || 0);
      const rest = price * (1 - pctFee() / 100), aff = (rest * a) / 100;
      document.getElementById("affEx").textContent = price ? tr(`Numa venda de ${mzn(price)} feita por um afiliado: afiliado ${mzn(aff)}, tu ${mzn(rest - aff)}.`, `On a ${mzn(price)} sale by an affiliate: affiliate ${mzn(aff)}, you ${mzn(rest - aff)}.`) : "";
    };
    affEx(); affForm.affiliate_pct.addEventListener("input", affEx);
    affForm.addEventListener("submit", async (e) => {
      e.preventDefault(); const btn = affForm.querySelector("button"); busy(btn, true);
      try { course = await api.updateCourse(id, { affiliate_enabled: affForm.affiliate_enabled.checked, affiliate_pct: Number(affForm.affiliate_pct.value || 0) }); saved(tr("Afiliados actualizado.", "Affiliate settings saved.")); go(`#/produtor/curso/${id}`); }
      catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "pixel") {
    main.innerHTML = wrap(`<form class="form" id="pxForm">
      <label>${tr("ID do pixel do Meta (Facebook/Instagram)", "Meta pixel ID (Facebook/Instagram)")}<input class="input mono" name="meta_pixel_id" inputmode="numeric" maxlength="20" placeholder="123456789012345" value="${esc(course.meta_pixel_id || "")}"></label>
      <p class="small muted">${tr("Encontras o ID em Meta Business Suite → Gestor de Eventos → Origens de dados (número com 15 ou 16 dígitos). O pixel recebe: PageView e ViewContent (página do produto), InitiateCheckout (checkout) e Purchase (venda paga, com o valor em USD). Deixa em branco para desligar.", "Find the ID in Meta Business Suite → Events Manager → Data sources (15–16 digits). Leave blank to turn off.")}</p>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button></form>`);
    const pf = document.getElementById("pxForm");
    pf.addEventListener("submit", async (e) => {
      e.preventDefault();
      const v = pf.meta_pixel_id.value.replace(/\s/g, "");
      if (v && !/^\d{10,20}$/.test(v)) { toast(tr("O ID do pixel tem só números (10 a 20 dígitos).", "The pixel ID is digits only (10–20)."), "err"); pf.meta_pixel_id.focus(); return; }
      const btn = pf.querySelector("button"); busy(btn, true);
      try { course = await api.updateCourse(id, { meta_pixel_id: v || null }); saved(v ? tr("Pixel ligado a este produto.", "Pixel connected to this product.") : tr("Pixel desligado.", "Pixel removed.")); go(`#/produtor/curso/${id}`); }
      catch (err) { toast(err.message, "err"); busy(btn, false); }
    });
    return;
  }

  if (sec === "anunciar") {
    const cfg = state.settings.boost || {};
    const plans = (Array.isArray(cfg.plans) ? cfg.plans : []).filter((p) => Number(p.days) > 0 && Number(p.mzn) >= 0);
    if (course.status !== "approved" || cfg.enabled === false || !plans.length) {
      main.innerHTML = wrap(`<div class="alert">${course.status !== "approved" ? tr("Só podes anunciar depois de o produto ser aprovado e estar à venda.", "You can promote it once the product is approved and on sale.") : tr("Os anúncios estão desligados de momento.", "Ads are turned off right now.")}</div>`);
      return;
    }
    const s = state.settings;
    const [boosts, w] = await Promise.all([api.myBoosts(id).catch(() => []), api.wallet().catch(() => null)]);
    if (!alive()) return;
    const avail = Number(w?.available || 0);
    const STATUS = { pending: tr("À espera de confirmação", "Awaiting confirmation"), active: tr("Ativo", "Active"), rejected: tr("Recusado", "Rejected"), ended: tr("Terminado", "Ended") };
    const stOf = (b) => (b.status === "active" && b.ends_at && new Date(b.ends_at) < new Date() ? "ended" : b.status);
    const methods = [["wallet", tr("Saldo da Carteira", "Wallet balance"), tr(`Disponível: ${mzn(avail)}`, `Available: ${mzn(avail)}`)],
      ...(s.payment_mpesa?.number ? [["mpesa", "M-Pesa", s.payment_mpesa.number]] : []),
      ...(s.payment_emola?.number ? [["emola", "e-Mola", s.payment_emola.number]] : []),
      ...(s.payment_paypal?.email ? [["paypal", "PayPal", s.payment_paypal.email]] : [])];
    const usdOf = (v) => Math.max(1, Math.round((Number(v) / usdRate()) * 100) / 100).toFixed(2);
    main.innerHTML = wrap(`
      ${isSponsored(course) ? `<div class="alert alert-ok">${ICON.check} ${tr(`O teu produto está em destaque até <b>${esc(date(course.sponsored_until))}</b>. Um novo plano começa quando este acabar.`, `Your product is sponsored until <b>${esc(date(course.sponsored_until))}</b>. A new plan starts when this one ends.`)}</div>` : ""}
      <div class="boost-how"><span>🏠 ${tr("Página inicial", "Home page")}</span><span>🔎 ${tr("Topo da loja", "Top of the store")}</span><span>🏷️ ${tr("Selo «Patrocinado»", "“Sponsored” badge")}</span><span>📊 ${tr("Vistas e cliques", "Views and clicks")}</span></div>
      <form id="bf" class="form boost-form" novalidate>
        <h3>${tr("1. Escolhe o plano", "1. Pick a plan")}</h3>
        <div class="bplans">${plans.map((p, i) => `<label class="bplan"><input type="radio" name="days" value="${Number(p.days)}" ${i === Math.min(1, plans.length - 1) ? "checked" : ""}><b>${Number(p.days)} ${tr("dias", "days")}</b><span>${esc(mzn(p.mzn))}</span><small>≈ $${usdOf(p.mzn)} USD · ${esc(mzn(Number(p.mzn) / Number(p.days)))}/${tr("dia", "day")}</small></label>`).join("")}</div>
        <h3>${tr("2. Como vais pagar", "2. How you'll pay")}</h3>
        <div class="bmeth">${methods.map(([k, l, sub], i) => `<label class="bm"><input type="radio" name="method" value="${k}" ${i === 0 ? "checked" : ""}><b>${l}</b><small>${esc(sub)}</small></label>`).join("")}</div>
        <div class="bpay" id="bpay"></div>
        <p class="err-text" id="bErr" role="alert"></p>
        <button class="btn btn-primary btn-lg" id="bGo">${ICON.trend} ${tr("Anunciar agora", "Promote now")}</button>
      </form>
      <h3 class="bh-t">${tr("Os teus anúncios deste produto", "Your ads for this product")}</h3>
      ${boosts.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${tr("Plano", "Plan")}</th><th>${tr("Estado", "Status")}</th><th>${tr("Período", "Period")}</th><th>${tr("Vistas", "Views")}</th><th>${tr("Cliques", "Clicks")}</th></tr></thead>
        <tbody>${boosts.map((b) => `<tr><td><b>${b.days} ${tr("dias", "days")}</b><br><small class="muted">${esc(mzn(b.amount_mzn))} · ${esc(b.pay_method === "wallet" ? tr("Carteira", "Wallet") : methodLabel(b.pay_method))}</small></td>
          <td><span class="badge st-${stOf(b) === "active" ? "approved" : stOf(b) === "rejected" ? "rejected" : stOf(b) === "pending" ? "pending" : "draft"}">${STATUS[stOf(b)]}</span>${b.status === "rejected" && b.reason ? `<br><small class="muted">${esc(b.reason)}</small>` : ""}</td>
          <td>${b.starts_at ? `${esc(date(b.starts_at))} → ${esc(date(b.ends_at))}` : "—"}</td><td>${Number(b.views || 0)}</td><td>${Number(b.clicks || 0)}</td></tr>`).join("")}</tbody></table></div>`
        : `<p class="small muted">${tr("Ainda não anunciaste este produto.", "You haven't promoted this product yet.")}</p>`}`);
    const f = document.getElementById("bf"), pay = document.getElementById("bpay"), err = document.getElementById("bErr");
    const cur = () => { const d = Number(f.days.value); return plans.find((p) => Number(p.days) === d) || plans[0]; };
    const drawPay = () => {
      const m = f.method.value, p = cur();
      pay.innerHTML = m === "wallet"
        ? `<p class="small">${avail >= Number(p.mzn) ? tr(`Vamos descontar <b>${esc(mzn(p.mzn))}</b> do teu saldo e o anúncio começa logo.`, `We'll take <b>${esc(mzn(p.mzn))}</b> from your balance and the ad starts right away.`) : `<span class="err-text">${tr(`Saldo insuficiente (${esc(mzn(avail))}). Escolhe outra forma de pagamento.`, `Not enough balance (${esc(mzn(avail))}). Pick another payment method.`)}</span>`}</p>`
        : `<div class="bpay-box"><p>${m === "paypal"
            ? tr(`Envia <b>$${usdOf(p.mzn)} USD</b> por PayPal para <b>${esc(s.payment_paypal.email)}</b>.`, `Send <b>$${usdOf(p.mzn)} USD</b> by PayPal to <b>${esc(s.payment_paypal.email)}</b>.`)
            : tr(`Envia <b>${esc(mzn(p.mzn))}</b> por ${m === "mpesa" ? "M-Pesa" : "e-Mola"} para <b>${esc((m === "mpesa" ? s.payment_mpesa : s.payment_emola).number)}</b>${(m === "mpesa" ? s.payment_mpesa : s.payment_emola).name ? ` (${esc((m === "mpesa" ? s.payment_mpesa : s.payment_emola).name)})` : ""}.`, `Send <b>${esc(mzn(p.mzn))}</b> by ${m === "mpesa" ? "M-Pesa" : "e-Mola"} to <b>${esc((m === "mpesa" ? s.payment_mpesa : s.payment_emola).number)}</b>.`)}</p>
            <label>${m === "paypal" ? tr("Email PayPal que usaste ou ID da transação", "PayPal email you used or transaction ID") : tr("Código da transação (da mensagem de confirmação)", "Transaction code (from the confirmation SMS)")}<input class="input" name="ref" maxlength="80" placeholder="${m === "paypal" ? "nome@email.com" : "ex.: 8KJ2X4ZP1Q"}"></label>
            <small class="muted">${tr("A equipa confirma o pagamento e o anúncio começa logo a seguir.", "The team confirms the payment and the ad starts right after.")}</small></div>`;
    };
    drawPay();
    f.addEventListener("change", (e) => { if (e.target.name === "days" || e.target.name === "method") { err.textContent = ""; drawPay(); } });
    f.addEventListener("input", () => { err.textContent = ""; });
    f.addEventListener("submit", async (e) => {
      e.preventDefault(); err.textContent = "";
      const m = f.method.value, p = cur(), ref = (f.ref?.value || "").trim();
      if (m === "wallet" && avail < Number(p.mzn)) { err.textContent = tr("Saldo insuficiente na Carteira.", "Not enough wallet balance."); return; }
      if (m !== "wallet" && ref.length < 4) { err.textContent = tr("Escreve o código da transação para confirmarmos o pagamento.", "Enter the transaction code so we can confirm the payment."); f.ref?.focus(); return; }
      const btn = document.getElementById("bGo"); busy(btn, true);
      try {
        const b = await api.requestBoost(id, p.days, m, ref);
        toast(b.status === "active" ? tr("Anúncio ativo! O teu produto já está em «Patrocinados».", "Ad live! Your product is now in “Sponsored”.") : tr("Pedido enviado. Avisamos quando o pagamento for confirmado.", "Request sent. We'll let you know once the payment is confirmed."));
        go(`#/produtor/curso/${id}?sec=anunciar&t=${Date.now()}`);
      } catch (e2) { err.textContent = e2.message; busy(btn, false); }
    });
    return;
  }

  if (sec === "cupoes") {
    main.innerHTML = wrap(`<div id="coupons"></div>
      <form class="form coupon-form" id="cpForm">
        <div class="two"><input class="input" name="code" required pattern="[A-Za-z0-9_\\-]{3,30}" placeholder="${tr("CÓDIGO (ex.: PROMO20)", "CODE (e.g. PROMO20)")}" style="text-transform:uppercase" aria-label="${tr("Código", "Code")}"><input class="input" name="percent_off" type="number" min="1" max="90" required placeholder="% ${tr("desconto", "off")}" aria-label="%"></div>
        <div class="two"><input class="input" name="max_uses" type="number" min="1" placeholder="${tr("Limite de usos (opcional)", "Max uses (optional)")}" aria-label="${tr("Limite", "Limit")}"><input class="input" name="expires_at" type="date" aria-label="${tr("Validade", "Expiry")}" title="${tr("Validade (opcional)", "Expiry (optional)")}"></div>
        <button class="btn btn-outline-green">${ICON.plus} ${tr("Criar cupão", "Create coupon")}</button>
      </form>`);
    const box = document.getElementById("coupons");
    const renderCoupons = async () => {
      const [list2, uses] = await Promise.all([api.coupons(id), api.couponUses(id).catch(() => ({}))]);
      const base = `${siteUrl()}#/curso/${id}?cupao=`;
      box.dataset.list = JSON.stringify(list2.map((x) => [x.id, x.active]));
      box.innerHTML = list2.length ? `<div class="coupon-list">${list2.map((cp) => `<div class="coupon ${cp.active ? "" : "off"}" data-cp="${esc(cp.id)}">
          <div><b>${esc(cp.code)}</b> <span class="badge">−${Number(cp.percent_off)}%</span><small class="muted">${uses[cp.code] || 0}${cp.max_uses ? `/${cp.max_uses}` : ""} ${tr("usos", "uses")}${cp.expires_at ? ` · ${tr("até", "until")} ${esc(date(cp.expires_at))}` : ""}</small></div>
          <div class="cp-actions"><button class="icon-btn" data-cpact="copy" data-url="${esc(base + cp.code)}" title="${tr("Copiar link com cupão", "Copy link with coupon")}">${ICON.copy}</button>
          <button class="btn btn-sm btn-ghost-dark" data-cpact="toggle">${cp.active ? tr("Pausar", "Pause") : tr("Activar", "Activate")}</button>
          <button class="icon-btn danger" data-cpact="del">${ICON.trash}</button></div></div>`).join("")}</div>`
        : `<p class="small muted">${tr("Ainda não tens cupões.", "No coupons yet.")}</p>`;
    };
    await renderCoupons();
    document.getElementById("cpForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target, btn = f.querySelector("button"); busy(btn, true);
      const fd = Object.fromEntries(new FormData(f));
      try {
        await api.addCoupon({ course_id: id, code: fd.code.trim().toUpperCase(), percent_off: Number(fd.percent_off), max_uses: fd.max_uses ? Number(fd.max_uses) : null, expires_at: fd.expires_at ? new Date(fd.expires_at + "T23:59:59").toISOString() : null, active: true });
        f.reset(); toast(tr("Cupão criado.", "Coupon created.")); await renderCoupons();
      } catch (err) { toast(/duplicate|unique/i.test(err.message) ? tr("Já existe um cupão com esse código.", "A coupon with that code already exists.") : err.message, "err"); }
      busy(btn, false);
    });
    box.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-cpact]"); if (!b) return;
      const cid = b.closest("[data-cp]").dataset.cp;
      const active = new Map(JSON.parse(box.dataset.list || "[]")).get(cid);
      try {
        if (b.dataset.cpact === "copy") { copyText(b.dataset.url); return; }
        if (b.dataset.cpact === "toggle") await api.updateCoupon(cid, { active: !active });
        if (b.dataset.cpact === "del") { if (!(await modal({ title: tr("Apagar cupão?", "Delete coupon?"), confirm: tr("Apagar", "Delete"), danger: true }))) return; await api.deleteCoupon(cid); }
        await renderCoupons();
      } catch (err) { toast(err.message, "err"); }
    });
    return;
  }

  // ---------- Conteúdo: depende do tipo de produto ----------
  const type = course.product_type || "curso";
  const MAXB = 30 * 1024 * 1024;
  const ACCEPT = { curso: "video/*,.mp4,.m4v,.mov,.webm", ebook: ".pdf,.epub,application/pdf,application/epub+zip", template: ".zip,.xlsx,.docx,.pptx,.pdf,.png,.jpg,.jpeg,.txt", audio: "audio/*,.mp3,.m4a,.aac,.wav,.ogg,.opus" }[type];
  const kindOf = (f) => (/^video\//.test(f.type) || /\.(mp4|m4v|webm|mov)$/i.test(f.name) ? "video" : /^audio\//.test(f.type) || /\.(mp3|m4a|aac|wav|ogg)$/i.test(f.name) ? "audio" : /pdf|epub/.test(f.type) || /\.(pdf|epub)$/i.test(f.name) ? "doc" : "file");
  const KIND_IC = { video: ICON.play, audio: ICON.phone, doc: ICON.doc, file: ICON.box };
  const sizeTxt = (b) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
  const baseName = (n) => n.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim().slice(0, 120) || "—";
  const defaultMod = { curso: tr("Módulo 1", "Module 1"), ebook: tr("Capítulos", "Chapters"), template: tr("Ficheiros", "Files"), audio: tr("Episódios", "Episodes") }[type];
  const dropTxt = {
    curso: [tr("Carregar vídeo", "Upload video"), "MP4"],
    ebook: [tr("Carregar o ebook ou livro", "Upload the ebook or book"), "PDF, EPUB"],
    template: [tr("Carregar ficheiros", "Upload files"), "ZIP, Excel, Word, PowerPoint, PDF"],
    audio: [tr("Carregar áudios", "Upload audio"), "MP3, M4A, WAV"],
  }[type];
  const GUIDE = {
    curso: [tr("Como organizar o teu curso", "How to organise your course"), [
      tr("Divide o curso em <b>módulos</b> por tema (ex.: Introdução, Prática, Bónus).", "Split the course into <b>modules</b> by topic (e.g. Intro, Practice, Bonus)."),
      tr("Em cada <b>aula</b> põe um vídeo curto (5–15 min, até 30 MB) ou o link do YouTube «Não listado».", "In each <b>lesson</b> add a short video (5–15 min, max 30 MB) or an unlisted YouTube link."),
      tr("Junta um <b>PDF de apoio</b> quando ajudar (resumo, exercícios).", "Add a <b>supporting PDF</b> when useful (summary, exercises)."),
      tr("Os vídeos carregados aqui <b>não podem ser descarregados</b> pelos alunos.", "Videos uploaded here <b>can't be downloaded</b> by students.")]],
    ebook: [tr("Como organizar o teu ebook", "How to organise your ebook"), [
      tr("Carrega o <b>livro completo</b> em PDF (recomendado) ou EPUB.", "Upload the <b>full book</b> as PDF (recommended) or EPUB."),
      tr("Se for grande, divide em <b>capítulos</b> — até 30 MB por ficheiro.", "If it's large, split it into <b>chapters</b> — max 30 MB per file."),
      tr("O 1.º ficheiro aparece como <b>Livro principal</b>; os seguintes como capítulos ou bónus.", "The 1st file is the <b>Main book</b>; the others show as chapters or bonuses."),
      tr("Usa as setas para pôr os ficheiros pela ordem certa.", "Use the arrows to put files in the right order.")]],
    template: [tr("Como organizar o teu template", "How to organise your template"), [
      tr("Carrega os ficheiros que o comprador recebe: <b>ZIP, Excel, Word, PowerPoint, PDF</b> ou imagens.", "Upload the files buyers get: <b>ZIP, Excel, Word, PowerPoint, PDF</b> or images."),
      tr("Dá a cada ficheiro um <b>nome claro</b> (ex.: «Planilha de orçamento»).", "Give each file a <b>clear name</b> (e.g. “Budget spreadsheet”)."),
      tr("Inclui um PDF <b>«Como usar»</b> com as instruções.", "Include a <b>“How to use”</b> PDF with instructions."),
      tr("Até 30 MB por ficheiro.", "Max 30 MB per file.")]],
    audio: [tr("Como organizar o teu áudio", "How to organise your audio"), [
      tr("Carrega cada <b>episódio</b> em MP3 ou M4A (até 30 MB) ou cola o link.", "Upload each <b>episode</b> as MP3 or M4A (max 30 MB) or paste a link."),
      tr("Põe os episódios pela <b>ordem certa</b> com as setas.", "Put episodes in the <b>right order</b> with the arrows."),
      tr("Dá títulos que digam o que o ouvinte vai aprender.", "Use titles that say what listeners will learn."),
      tr("Os áudios carregados aqui <b>não podem ser descarregados</b>.", "Audio uploaded here <b>can't be downloaded</b>.")]],
  }[type];
  const guideHTML = `<details class="ct-guide" ${mods.reduce((a, m) => a + m.lessons.length, 0) ? "" : "open"}><summary>${ICON.help} ${GUIDE[0]}</summary><ol>${GUIDE[1].map((x) => `<li>${x}</li>`).join("")}</ol></details>`;
  const ROW_LABEL = (i) => ({ ebook: i === 0 ? tr("Livro principal", "Main book") : tr(`Capítulo / extra ${i}`, `Chapter / extra ${i}`), template: tr(`Ficheiro ${i + 1}`, `File ${i + 1}`), audio: tr(`Episódio ${i + 1}`, `Episode ${i + 1}`) }[type] || "");
  let mods2 = mods;
  const fileChip = (l) => (l.file_path ? `<span class="fchip">${KIND_IC[l.file_kind] || ICON.box}<span>${esc(l.file_name || tr("ficheiro", "file"))}</span><button type="button" data-act="file-del" title="${tr("Remover ficheiro", "Remove file")}">${ICON.trash}</button></span>` : "");
  const ensureModule = async () => {
    if (mods2.length) return mods2[0];
    const m = await api.addModule(id, defaultMod, 0);
    mods2 = [{ ...m, lessons: [] }];
    return mods2[0];
  };
  // Lê a duração do vídeo/áudio no próprio telemóvel/computador (sem enviar nada) para preencher os minutos sozinho
  const mediaMinutes = (file) => new Promise((res) => {
    if (!/^(video|audio)\//.test(file.type) && !/\.(mp4|m4v|mov|webm|mp3|m4a|aac|wav|ogg)$/i.test(file.name)) return res(0);
    let done = false; const fin = (v) => { if (!done) { done = true; try { URL.revokeObjectURL(el.src); } catch {} res(v); } };
    const el = document.createElement(/^audio\//.test(file.type) ? "audio" : "video");
    el.preload = "metadata";
    el.onloadedmetadata = () => fin(Number.isFinite(el.duration) ? Math.max(1, Math.round(el.duration / 60)) : 0);
    el.onerror = () => fin(0);
    setTimeout(() => fin(0), 5000);
    try { el.src = URL.createObjectURL(file); } catch { fin(0); }
  });
  const tooBig = (file) => {
    if (file.size <= MAXB) return false;
    toast(tr(`«${file.name}» tem ${sizeTxt(file.size)}. O máximo é 30 MB (cerca de 15 min em 720p) — divide o vídeo em partes ou usa o YouTube (não listado).`, `“${file.name}” is ${sizeTxt(file.size)}. Max is 30 MB — split the video or use YouTube (unlisted).`), "err");
    return true;
  };
  const uploadTo = async (file, lessonId, card, extra = {}) => {
    if (tooBig(file)) return false;
    card?.classList.add("uploading");
    const mins = await mediaMinutes(file);
    try {
      await sendFile(file, (f, p) => api.uploadContent(id, f, p), async (path) => {
        await api.updateLesson(lessonId, { file_path: path, file_name: file.name, file_kind: kindOf(file), ...(mins ? { duration_min: mins } : {}), ...extra });
        await renderContent();
      });
      return true;
    } catch { card?.classList.remove("uploading"); return false; }
  };

  const lessonCard = (m, l, li, mi = 0) => {
    const useFile = Boolean(l.file_path);
    const st = l.file_path ? `<span class="ls-st ok">${ICON.check} ${tr("Vídeo carregado", "Video uploaded")}</span>` : l.video_url ? `<span class="ls-st ok">${ICON.link} ${tr("Link do vídeo", "Video link")}</span>` : `<span class="ls-st warn">${tr("Sem vídeo", "No video")}</span>`;
    return `<div class="lesson" data-lesson="${esc(l.id)}">
      <div class="ls-tag"><b>${tr("Aula", "Lesson")} ${mi + 1}.${li + 1}</b>${st}${l.pdf_path ? `<span class="ls-st">${ICON.doc} PDF</span>` : ""}</div>
      <div class="ls-top"><input class="input" name="title" value="${esc(l.title)}" placeholder="${tr("Título da aula", "Lesson title")}"><label class="ls-min"><input class="input" name="duration_min" type="number" min="0" value="${esc(l.duration_min || 0)}"><span>min</span></label></div>
      <div class="src-tabs" role="tablist"><button type="button" data-src="link" class="${useFile ? "" : "on"}">${ICON.link} ${tr("Link do YouTube", "YouTube link")}</button><button type="button" data-src="file" class="${useFile ? "on" : ""}">${ICON.play} ${tr("Carregar vídeo", "Upload video")}</button></div>
      <div class="src-pane" data-pane="link" ${useFile ? "hidden" : ""}><input class="input" name="video_url" value="${esc(l.video_url || "")}" placeholder="https://youtu.be/…  ·  Vimeo  ·  Google Drive"><small class="muted">${tr("Dica: no YouTube escolhe «Não listado» para só os alunos verem.", "Tip: on YouTube choose “Unlisted” so only students see it.")}</small></div>
      <div class="src-pane" data-pane="file" ${useFile ? "" : "hidden"}>${l.file_path ? fileChip(l) : `<label class="drop sm">${ICON.plus}<span>${tr("Escolher vídeo", "Choose video")}</span><small>MP4 · ${tr("até 30 MB", "max 30 MB")}</small><input type="file" accept="${ACCEPT}" data-act="upload" hidden></label>`}</div>
      <div class="lesson-tools">
        ${l.pdf_path ? `<span class="fchip">${ICON.doc}<span>${tr("Material PDF", "PDF material")}</span><button type="button" data-act="pdf-del" title="${tr("Remover", "Remove")}">${ICON.trash}</button></span>`
          : `<label class="btn btn-sm btn-ghost-dark file-btn">${ICON.doc} ${tr("Material extra (PDF)", "Extra material (PDF)")}<input type="file" accept="application/pdf" data-act="pdf" hidden></label>`}
        <span class="spacer"></span>
        <button class="icon-btn" data-act="les-up" ${li === 0 ? "disabled" : ""} title="${tr("Subir", "Up")}">${ICON.up}</button>
        <button class="icon-btn" data-act="les-down" ${li === m.lessons.length - 1 ? "disabled" : ""} title="${tr("Descer", "Down")}">${ICON.down}</button>
        <button class="btn btn-sm btn-green" data-act="les-save">${tr("Guardar", "Save")}</button>
        <button class="icon-btn danger" data-act="les-del" title="${tr("Apagar", "Delete")}">${ICON.trash}</button>
      </div>
    </div>`;
  };
  const fileRow = (l, i, n) => `<div class="lesson frow ${type === "ebook" && i === 0 ? "main-file" : ""}" data-lesson="${esc(l.id)}">
      <span class="fr-ic">${KIND_IC[l.file_kind] || (l.video_url ? ICON.link : ICON.box)}</span>
      <div class="fr-main"><span class="fr-lbl">${ROW_LABEL(i)}</span><input class="input" name="title" value="${esc(l.title)}"><small>${l.file_path ? esc(l.file_name || "") : l.video_url ? esc(l.video_url) : tr("sem ficheiro", "no file")}</small></div>
      <div class="fr-act">
        <button class="icon-btn" data-act="les-up" ${i === 0 ? "disabled" : ""}>${ICON.up}</button>
        <button class="icon-btn" data-act="les-down" ${i === n - 1 ? "disabled" : ""}>${ICON.down}</button>
        <button class="btn btn-sm btn-green" data-act="les-save">${tr("Guardar", "Save")}</button>
        <button class="icon-btn danger" data-act="les-del">${ICON.trash}</button>
      </div></div>`;

  const header = type === "curso"
    ? `<div class="quick-up">
        <label class="drop big" id="drop">${ICON.plus}<span>${tr("Carregar vários vídeos de uma vez", "Upload several videos at once")}</span><small>${tr("Cada vídeo vira uma aula, com o nome e a duração preenchidos sozinhos · MP4 até 30 MB", "Each video becomes a lesson, with name and length filled in automatically · MP4 up to 30 MB")}</small><input type="file" id="files" accept="${ACCEPT}" multiple hidden></label>
        <details class="links-add"><summary>${ICON.link} ${tr("Ou colar vários links do YouTube (um por linha)", "Or paste several YouTube links (one per line)")}</summary>
          <form id="lb" class="form"><textarea class="input" name="links" rows="4" placeholder="https://youtu.be/…\nhttps://youtu.be/…"></textarea><button class="btn btn-sm btn-outline-green">${ICON.plus} ${tr("Criar aulas", "Create lessons")}</button></form></details>
      </div>
      <div class="sec-head"><span class="muted small">${tr("Organiza em módulos. As alterações nas aulas guardam-se sozinhas.", "Organise into modules. Lesson changes save automatically.")}</span><button class="btn btn-sm btn-primary" id="addMod">${ICON.plus} ${tr("Módulo", "Module")}</button></div>`
    : `<label class="drop big" id="drop">${ICON.plus}<span>${dropTxt[0]}</span><small>${dropTxt[1]} · ${tr("até 30 MB por ficheiro · podes escolher vários", "max 30 MB per file · you can pick several")}</small><input type="file" id="files" accept="${ACCEPT}" multiple hidden></label>
       ${type === "audio" ? `<form class="link-add" id="la"><input class="input" name="url" type="url" required placeholder="${tr("Ou cola o link do episódio (YouTube, Spotify, SoundCloud…)", "Or paste the episode link (YouTube, Spotify, SoundCloud…)")}"><button class="btn btn-outline-green">${ICON.plus} ${tr("Adicionar link", "Add link")}</button></form>` : ""}`;
  main.innerHTML = wrap(`${guideHTML}<div class="ct-sum" id="ct-sum"></div>${header}<div id="content"></div>`);

  const renderContent = async (reload = true) => {
    if (reload) mods2 = await api.courseContent(id);
    if (!alive()) return;
    const box = document.getElementById("content");
    const allL = mods2.flatMap((m) => m.lessons);
    const withMedia = allL.filter((l) => l.file_path || l.video_url).length;
    const mins = allL.reduce((a, l) => a + Number(l.duration_min || 0), 0);
    // actualiza a barra «Falta: …» com o conteúdo actual
    const miss = checklist(course, { lessons: allL.length, coupons: coupons.length, profileOk }).filter((x) => x.req && !x.ok);
    if (course.status !== "pending") document.querySelectorAll(".pub-bar small").forEach((el) => { el.textContent = miss.length ? tr(`Falta: ${miss.map((x) => x.t).join(", ")}`, `Missing: ${miss.map((x) => x.t).join(", ")}`) : tr("Tudo pronto para enviar!", "Ready to submit!"); });
    const sum = document.getElementById("ct-sum");
    if (sum) sum.innerHTML = type === "curso"
      ? `<span><b>${mods2.length}</b> ${mods2.length === 1 ? tr("módulo", "module") : tr("módulos", "modules")}</span><span><b>${allL.length}</b> ${allL.length === 1 ? tr("aula", "lesson") : tr("aulas", "lessons")}</span><span class="${withMedia < allL.length ? "warn" : "ok"}"><b>${withMedia}/${allL.length}</b> ${tr("com vídeo", "with video")}</span>${mins ? `<span><b>${mins}</b> min</span>` : ""}`
      : `<span><b>${allL.length}</b> ${{ ebook: tr("ficheiros do livro", "book files"), template: tr("ficheiros", "files"), audio: tr("episódios", "episodes") }[type]}</span>${allL.length ? `<span class="ok">${ICON.check} ${tr("pronto para enviar", "ready")}</span>` : `<span class="warn">${tr("carrega pelo menos 1 ficheiro", "upload at least 1 file")}</span>`}`;
    if (type !== "curso") {
      const all = allL;
      box.innerHTML = all.length ? `<div class="file-list">${all.map((l, i) => fileRow(l, i, all.length)).join("")}</div>` : `<p class="muted center small" style="padding:14px 0">${tr("Ainda não carregaste nada.", "Nothing uploaded yet.")}</p>`;
      return;
    }
    box.innerHTML = mods2.length ? mods2.map((m, mi) => `
      <div class="mod" data-mod="${esc(m.id)}">
        <div class="mod-head">
          <span class="mod-n">${tr("Módulo", "Module")} ${mi + 1}</span>
          <input class="input mod-title" value="${esc(m.title)}" aria-label="${tr("Título do módulo", "Module title")}">
          <button class="icon-btn" data-act="mod-up" ${mi === 0 ? "disabled" : ""} title="${tr("Subir", "Up")}">${ICON.up}</button>
          <button class="icon-btn" data-act="mod-down" ${mi === mods2.length - 1 ? "disabled" : ""} title="${tr("Descer", "Down")}">${ICON.down}</button>
          <button class="icon-btn danger" data-act="mod-del" title="${tr("Apagar", "Delete")}">${ICON.trash}</button>
        </div>
        ${m.lessons.map((l, li) => lessonCard(m, l, li, mi)).join("")}
        <button class="btn btn-sm btn-outline-green" data-act="les-add">${ICON.plus} ${tr("Adicionar aula", "Add lesson")}</button>
      </div>`).join("") : `<div class="empty-mod"><p class="muted">${tr("Começa por criar o primeiro módulo (ex.: «Introdução»).", "Start by creating the first module (e.g. “Introduction”).")}</p><button class="btn btn-primary" id="firstMod">${ICON.plus} ${tr("Criar módulo e primeira aula", "Create module and first lesson")}</button></div>`;
    document.getElementById("firstMod")?.addEventListener("click", async (e) => {
      busy(e.currentTarget, true);
      try { const m = await api.addModule(id, tr("Introdução", "Introduction"), 0); await api.addLesson({ module_id: m.id, course_id: id, title: tr("Aula 1", "Lesson 1"), position: 0 }); await renderContent(); }
      catch (err) { toast(err.message, "err"); }
    });
  };
  await renderContent(false);

  // Carregar vários ficheiros (ebook, template, áudio)
  // Vários ficheiros: envia um de cada vez; a aula/ficheiro só é criado depois do envio terminar bem
  const addFiles = async (files) => {
    const list = files.filter((f) => !tooBig(f));
    if (!list.length) return;
    if (list.length > 1) toast(tr(`${list.length} ficheiros na fila. Podes continuar a trabalhar.`, `${list.length} files queued. You can keep working.`));
    let okN = 0;
    for (const file of list) {
      try {
        const mins = await mediaMinutes(file);
        await sendFile(file, (f, p) => api.uploadContent(id, f, p), async (path) => {
          const m = type === "curso" && mods2.length ? mods2[mods2.length - 1] : await ensureModule();
          const pos = mods2.find((x) => x.id === m.id)?.lessons.length || 0;
          await api.addLesson({ module_id: m.id, course_id: id, title: baseName(file.name), position: pos, file_path: path, file_name: file.name, file_kind: kindOf(file), ...(mins ? { duration_min: mins } : {}) });
          await renderContent();
        });
        okN++;
      } catch { /* o painel mostra o erro e o botão «Tentar de novo» */ }
    }
    if (okN) toast(tr(`${okN} ficheiro(s) carregado(s).`, `${okN} file(s) uploaded.`));
  };
  const drop = document.getElementById("drop");
  if (drop) {
    document.getElementById("files").addEventListener("change", (e) => { const fl = [...e.target.files]; e.target.value = ""; addFiles(fl); });
    drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("over"); });
    drop.addEventListener("dragleave", () => drop.classList.remove("over"));
    drop.addEventListener("drop", (e) => { e.preventDefault(); drop.classList.remove("over"); addFiles([...e.dataTransfer.files]); });
  }
  document.getElementById("la")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim();
    try { const m = await ensureModule(); await api.addLesson({ module_id: m.id, course_id: id, title: tr(`Episódio ${m.lessons.length + 1}`, `Episode ${m.lessons.length + 1}`), video_url: url, position: m.lessons.length }); e.target.reset(); await renderContent(); toast(tr("Link adicionado.", "Link added.")); }
    catch (err) { toast(err.message, "err"); }
  });
  document.getElementById("lb")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const urls = e.target.links.value.split(/\s+/).map((x) => x.trim()).filter((x) => /^https:\/\/\S+$/.test(x)).slice(0, 50);
    if (!urls.length) { toast(tr("Cola pelo menos um link que comece por https://", "Paste at least one link starting with https://"), "err"); return; }
    const btn = e.target.querySelector("button"); busy(btn, true);
    try {
      const m = mods2.length ? mods2[mods2.length - 1] : await ensureModule();
      let pos = mods2.find((x) => x.id === m.id)?.lessons.length || 0;
      for (const u of urls) await api.addLesson({ module_id: m.id, course_id: id, title: tr(`Aula ${pos + 1}`, `Lesson ${pos + 1}`), video_url: u, position: pos++ });
      e.target.reset(); await renderContent();
      toast(tr(`${urls.length} aula(s) criada(s). Muda os títulos quando quiseres.`, `${urls.length} lesson(s) created. Rename them anytime.`));
    } catch (err) { toast(err.message, "err"); }
    busy(btn, false);
  });
  document.getElementById("addMod")?.addEventListener("click", async () => {
    try { await api.addModule(id, tr(`Módulo ${mods2.length + 1}`, `Module ${mods2.length + 1}`), mods2.length); await renderContent(); } catch (err) { toast(err.message, "err"); }
  });

  const content = document.getElementById("content");
  const findLesson = (el) => {
    const lesEl = el.closest("[data-lesson]");
    for (const m of mods2) { const l = m.lessons.find((x) => x.id === lesEl?.dataset.lesson); if (l) return { m, l, lesEl }; }
    return { m: mods2.find((x) => x.id === el.closest("[data-mod]")?.dataset.mod), l: null, lesEl };
  };
  content.addEventListener("change", async (e) => {
    const t = e.target;
    if (t.classList.contains("mod-title")) {
      try { await api.updateModule(t.closest("[data-mod]").dataset.mod, { title: t.value.trim() || "—" }); toast(tr("Módulo guardado.", "Module saved.")); } catch (err) { toast(err.message, "err"); }
      return;
    }
    const { l, lesEl } = findLesson(t);
    if (l && ["title", "duration_min", "video_url"].includes(t.name)) {
      const v = t.value.trim();
      const fields = t.name === "title" ? { title: v || "—" } : t.name === "duration_min" ? { duration_min: Math.max(0, Number(v || 0)) } : { video_url: v || null };
      if (t.name === "video_url" && v && !/^https:\/\/\S+$/.test(v)) { toast(tr("O link tem de começar por https://", "The link must start with https://"), "err"); return; }
      try { await api.updateLesson(l.id, fields); Object.assign(l, fields); dirty = false; lesEl?.classList.add("saved"); setTimeout(() => lesEl?.classList.remove("saved"), 1400); }
      catch (err) { toast(err.message, "err"); }
      return;
    }
    if (t.dataset.act === "upload") {
      const file = t.files[0]; if (!file || !l) return;
      t.value = "";
      if (await uploadTo(file, l.id, lesEl, { video_url: null })) toast(tr("Vídeo carregado.", "Video uploaded."));
    }
    if (t.dataset.act === "pdf") {
      const file = t.files[0]; if (!file || !l) return;
      t.value = "";
      if (file.size > MAXB) { toast(tr("PDF demasiado grande (máx. 30 MB).", "PDF too large (max 30 MB)."), "err"); return; }
      try { await sendFile(file, (f, p) => api.uploadMaterial(id, f, p), async (path) => { await api.updateLesson(l.id, { pdf_path: path }); await renderContent(); }); toast(tr("PDF anexado.", "PDF attached.")); }
      catch { /* erro visível no painel */ }
    }
  });
  content.addEventListener("click", async (e) => {
    const tab = e.target.closest("[data-src]");
    if (tab) {
      const card = tab.closest(".lesson");
      card.querySelectorAll("[data-src]").forEach((x) => x.classList.toggle("on", x === tab));
      card.querySelectorAll("[data-pane]").forEach((p2) => (p2.hidden = p2.dataset.pane !== tab.dataset.src));
      return;
    }
    const b = e.target.closest("[data-act]");
    if (!b || b.tagName === "INPUT") return;
    const act = b.dataset.act;
    const { m: mod, l: les, lesEl } = findLesson(b);
    const list2 = type === "curso" ? mod?.lessons : mods2.flatMap((x) => x.lessons);
    const swap = async (arr, i, j, update) => { await update(arr[i].id, { position: j }); await update(arr[j].id, { position: i }); };
    try {
      if (act === "mod-up" || act === "mod-down") {
        const i = mods2.indexOf(mod), j = act === "mod-up" ? i - 1 : i + 1;
        await Promise.all(mods2.map((m, k) => (m.position !== k ? api.updateModule(m.id, { position: k }) : null)));
        await swap(mods2, i, j, api.updateModule);
      } else if (act === "mod-del") {
        if (!(await modal({ title: tr("Apagar módulo?", "Delete module?"), body: tr("As aulas deste módulo também são apagadas.", "Its lessons will be deleted too."), confirm: tr("Apagar", "Delete"), danger: true }))) return;
        await Promise.all(mod.lessons.map((l) => api.removeContent(l.file_path).catch(() => null)));
        await api.deleteModule(mod.id);
      } else if (act === "les-add") {
        await api.addLesson({ module_id: mod.id, course_id: id, title: tr(`Aula ${mod.lessons.length + 1}`, `Lesson ${mod.lessons.length + 1}`), position: mod.lessons.length });
      } else if (act === "les-save") {
        busy(b, true);
        const g = (n) => lesEl.querySelector(`[name=${n}]`)?.value.trim();
        const fields = { title: g("title") || "—" };
        if (lesEl.querySelector("[name=duration_min]")) fields.duration_min = Number(g("duration_min") || 0);
        const linkPane = lesEl.querySelector("[data-pane=link]");
        if (linkPane && !linkPane.hidden) fields.video_url = g("video_url") || null;
        await api.updateLesson(les.id, fields);
        toast(tr("Guardado.", "Saved."));
        busy(b, false);
        return;
      } else if (act === "les-del") {
        if (!(await modal({ title: tr("Apagar?", "Delete?"), confirm: tr("Apagar", "Delete"), danger: true }))) return;
        await api.removeContent(les.file_path).catch(() => null);
        await api.deleteLesson(les.id);
      } else if (act === "les-up" || act === "les-down") {
        const i = list2.indexOf(les), j = act === "les-up" ? i - 1 : i + 1;
        await Promise.all(list2.map((l, k) => (l.position !== k ? api.updateLesson(l.id, { position: k }) : null)));
        await swap(list2, i, j, api.updateLesson);
      } else if (act === "file-del") {
        if (!(await modal({ title: tr("Remover o ficheiro?", "Remove the file?"), confirm: tr("Remover", "Remove"), danger: true }))) return;
        await api.removeContent(les.file_path).catch(() => null);
        await api.updateLesson(les.id, { file_path: null, file_name: null, file_kind: null });
      } else if (act === "pdf-del") {
        await api.updateLesson(les.id, { pdf_path: null });
      } else return;
      await renderContent();
    } catch (err) { toast(err.message, "err"); busy(b, false); }
  });
}

export { methodLabel, affLink, ensureProducer };
