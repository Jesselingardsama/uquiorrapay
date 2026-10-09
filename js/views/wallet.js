// Carteira (saldo e levantamentos) e programa de afiliados.
import { api } from "../api.js?v=202610080932";
import { state, tr, esc, mzn, date, toast, emptyState, statusBadge, methodLabel, coverHTML, priceHTML, catLabel, typeLabel, copyText, dashShell, ICON, photo, PHOTOS, siteUrl } from "../ui.js?v=202610080932";
import { rerender } from "../app.js?v=202610080932";

function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle("busy", on); } }
const siteBase = () => siteUrl();
export const affLink = (courseId, code) => `${siteBase()}#/curso/${courseId}?ref=${code}`;

// ---------- Carteira (Saldo · Extrato · Levantamentos) ----------
export async function wallet(main, { tab = "saldo" }, query, alive) {
  const [w, wds, kr] = await Promise.all([api.wallet(), api.myWithdrawals(state.user.id), api.kycMine().catch(() => null)]);
  if (!alive()) return;
  const W = w || {};
  const n = (k) => Number(W[k] || 0);
  const min = n("min_withdrawal") || 500;
  const hold = n("hold_days") || 3;
  const avail = n("available");
  const p = state.profile || {};
  const kcfg = state.settings.kyc || {};
  const wdDays = Number(kcfg.withdraw_days ?? 3);
  const kst = kr?.kyc?.status || "none";
  const needKyc = kcfg.required_withdrawal !== false && kst !== "approved";
  const onHold = Boolean(kr?.hold?.withdraw_hold);
  const blocked = needKyc || onHold;
  const kycBox = onHold ? `<div class="alert alert-err">${ICON.lock} <b>${tr("Levantamentos temporariamente retidos", "Withdrawals temporarily on hold")}</b> — ${esc(kr.hold.reason || "")}. ${tr("Fala com o suporte.", "Contact support.")} <a href="#/contacto">${tr("Contacto", "Contact")}</a></div>`
    : needKyc ? `<div class="alert kyc-need">${ICON.idcard} <div><b>${kst === "pending" ? tr("Identidade em análise", "Identity under review") : kst === "rejected" ? tr("Verificação recusada — envia de novo", "Verification rejected — send again") : tr("Verifica a tua identidade para levantar", "Verify your identity to withdraw")}</b><br><small>${kst === "pending" ? tr("Assim que for aprovada, podes pedir levantamentos.", "Once approved, you can request withdrawals.") : tr("Leva 2 minutos: documento de identificação + selfie. É obrigatório para segurança e prevenção de fraude.", "Takes 2 minutes: ID document + selfie. Required for security and fraud prevention.")}</small></div>${kst === "pending" ? "" : `<a class="btn btn-green btn-sm" href="#/verificacao">${tr("Verificar agora", "Verify now")}</a>`}</div>` : "";
  const tabs = [["saldo", "#/carteira", ICON.cash, tr("Saldo", "Balance")], ["extrato", "#/carteira/extrato", ICON.list, tr("Extrato", "Statement")], ["levantamentos", "#/carteira/levantamentos", ICON.wallet, tr("Levantamentos", "Withdrawals")]];
  const tabBar = `<nav class="wallet-tabs">${tabs.map(([k, h, ic, l]) => `<a class="${k === tab ? "on" : ""}" href="${h}">${ic}<span>${l}</span></a>`).join("")}</nav>`;
  const title = { saldo: tr("A minha carteira", "My wallet"), extrato: tr("Extrato", "Statement"), levantamentos: tr("Levantamentos", "Withdrawals") }[tab] || tr("A minha carteira", "My wallet");
  let body = "";

  if (tab === "extrato") {
    const [sales, aff] = await Promise.all([api.salesForProducer(state.user.id).catch(() => []), api.affiliateSales(state.user.id).catch(() => [])]);
    if (!alive()) return;
    const items = [
      ...sales.filter((s) => s.status === "paid").map((s) => ({ d: s.paid_at || s.created_at, t: tr("Venda", "Sale"), cat: "venda", desc: `${s.courses?.title || ""} · ${s.reference}`, v: Number(s.producer_net_mzn || 0) })),
      ...aff.filter((s) => s.status === "paid").map((s) => ({ d: s.paid_at || s.created_at, t: tr("Comissão de afiliado", "Affiliate commission"), cat: "afiliado", desc: `${s.courses?.title || ""} · ${s.reference}`, v: Number(s.affiliate_mzn || 0) })),
      ...wds.filter((x) => x.status !== "rejected").map((x) => ({ d: x.created_at, t: tr("Levantamento", "Withdrawal"), cat: "levantamento", desc: `${methodLabel(x.method)} · ${x.account_number}${x.status === "pending" ? ` · ${tr("em processamento", "processing")}` : ""}`, v: -Number(x.amount_mzn || 0) })),
    ].sort((a2, b2) => new Date(b2.d) - new Date(a2.d));
    const q = (query.q || "").toLowerCase(), cat = query.cat || "";
    const rows = items.filter((x) => (!cat || x.cat === cat) && (!q || x.desc.toLowerCase().includes(q)));
    body = `<div class="stats three-s">
        <div class="stat"><span>${tr("Saldo disponível", "Available balance")}</span><b class="ok-text">${esc(mzn(avail))}</b><small>&nbsp;</small></div>
        <div class="stat"><span>${tr("Valores a receber", "Amounts receivable")}</span><b>${esc(mzn(n("on_hold")))}</b><small>${tr(`liberta ${hold} dias após a venda`, `released ${hold} days after the sale`)}</small></div>
        <div class="stat"><span>${tr("Saldo total", "Total balance")}</span><b>${esc(mzn(avail + n("on_hold")))}</b><small>&nbsp;</small></div>
      </div>
      <div class="card-box">
        <div class="sb-head"><b>${tr("Transacções", "Transactions")}</b><small>MZN</small></div>
        <form class="filters-bar" id="xf">
          <input class="input" name="q" type="search" value="${esc(query.q || "")}" placeholder="${tr("Pesquisar por referência ou produto", "Search by reference or product")}">
          <select class="input" name="cat"><option value="">${tr("Todas as categorias", "All categories")}</option><option value="venda" ${cat === "venda" ? "selected" : ""}>${tr("Vendas", "Sales")}</option><option value="afiliado" ${cat === "afiliado" ? "selected" : ""}>${tr("Comissões de afiliado", "Affiliate commissions")}</option><option value="levantamento" ${cat === "levantamento" ? "selected" : ""}>${tr("Levantamentos", "Withdrawals")}</option></select>
          <button class="btn btn-green">${tr("Filtrar", "Filter")}</button>
        </form>
        ${rows.length ? `<div class="tx-list">${rows.map((x) => `<div class="tx"><div><b>${esc(x.t)}</b><small>${esc(x.desc)}</small></div><div class="tx-r"><b class="${x.v < 0 ? "neg" : "pos"}">${x.v < 0 ? "−" : "+"}${esc(mzn(Math.abs(x.v)))}</b><small>${esc(date(x.d))}</small></div></div>`).join("")}</div>`
          : `<p class="muted center" style="padding:30px 0">${tr("Nenhum resultado encontrado.", "No results found.")}</p>`}
      </div>`;
  } else if (tab === "levantamentos") {
    body = `<form id="wd" class="card-box form">
        <h2>${tr("Pedir levantamento", "Request a withdrawal")}</h2>
        <p class="muted small">${tr(`Disponível: ${mzn(avail)} · Mínimo: ${mzn(min)}`, `Available: ${mzn(avail)} · Minimum: ${mzn(min)}`)}</p>
        ${kycBox}
        ${avail < min ? `<div class="alert">${tr(`Ainda não tens saldo suficiente. Precisas de pelo menos ${mzn(min)} disponíveis.`, `Not enough balance yet. You need at least ${mzn(min)} available.`)}</div>` : ""}
        <label>${tr("Valor (MZN)", "Amount (MZN)")}<input class="input" name="amount" type="number" min="${min}" max="${Math.floor(avail)}" step="1" required value="${avail >= min ? Math.floor(avail) : ""}"></label>
        <label>${tr("Receber por", "Receive via")}<select class="input" name="method"><option value="mpesa">M-Pesa</option><option value="emola">e-Mola</option><option value="bank">${tr("Transferência bancária", "Bank transfer")}</option></select></label>
        <div class="two">
          <label><span id="accLbl">${tr("Número", "Number")}</span><input class="input" name="account" required value="${esc(p.phone || "")}" placeholder="84 123 4567"></label>
          <label>${tr("Nome do titular", "Account holder")}<input class="input" name="name" required value="${esc(p.full_name || "")}"></label>
        </div>
        <button class="btn btn-green" ${avail < min || blocked ? "disabled" : ""}>${tr("Pedir levantamento", "Request withdrawal")}</button>
        <p class="small muted">${tr(`Prazo de processamento: até ${wdDays} dias. Pode variar por validações de segurança, indisponibilidade do parceiro de pagamento, feriados ou força maior. O titular da conta deve ser a pessoa verificada.`, `Processing time: up to ${wdDays} days. May vary due to security checks, payment partner downtime, holidays or force majeure. The account holder must be the verified person.`)}</p>
      </form>
      <div class="card-box">
        <h2>${tr("Histórico", "History")}</h2>
        ${wds.length ? `<div class="table-wrap"><table class="table">
          <thead><tr><th>${tr("Data", "Date")}</th><th>${tr("Valor", "Amount")}</th><th>${tr("Para", "To")}</th><th>${tr("Estado", "Status")}</th><th>${tr("Nota", "Note")}</th></tr></thead>
          <tbody>${wds.map((x) => `<tr><td>${esc(date(x.created_at))}</td><td><b>${esc(mzn(x.amount_mzn))}</b></td><td>${esc(methodLabel(x.method))} · ${esc(x.account_number)}</td><td>${statusBadge(x.status, "wd")}</td><td class="small muted">${esc(x.admin_note || "")}</td></tr>`).join("")}</tbody>
        </table></div>` : `<p class="muted">${tr("Ainda não fizeste levantamentos.", "No withdrawals yet.")}</p>`}
      </div>`;
  } else {
    body = `${kycBox}<a class="card-box notif" href="#/carteira/extrato"><span>${tr("Movimentos da carteira", "Wallet activity")}</span>${ICON.chev}</a>
      <div class="card-box bal">
        <div class="bal-h"><b>${tr("Saldo", "Balance")}</b><span class="cur-tag">🇲🇿 MZN</span></div>
        <div class="bal-row"><small>${tr("Saldo disponível", "Available balance")}</small><b class="ok-text">${esc(mzn(avail))}</b></div>
        <div class="bal-row"><small>${ICON.clock} ${tr("Valores a receber", "Amounts receivable")}</small><b>${esc(mzn(n("on_hold")))}</b><em>${tr(`Ficam disponíveis ${hold} dias depois de cada venda (garantia ao comprador).`, `Become available ${hold} days after each sale (buyer guarantee).`)}</em></div>
        <div class="bal-row"><small>${tr("Saldo total", "Total balance")}</small><b>${esc(mzn(avail + n("on_hold")))}</b></div>
        <div class="bal-foot"><a class="btn btn-outline-green" href="#/carteira/levantamentos">${tr("Pedir levantamento", "Request withdrawal")}</a></div>
      </div>
      <div class="stats">
        <div class="stat"><span>${tr("Ganhos como produtor", "Creator earnings")}</span><b>${esc(mzn(n("producer_total")))}</b><small>&nbsp;</small></div>
        <div class="stat"><span>${tr("Ganhos como afiliado", "Affiliate earnings")}</span><b>${esc(mzn(n("affiliate_total")))}</b><small>&nbsp;</small></div>
        <div class="stat"><span>${tr("Já levantado", "Withdrawn")}</span><b>${esc(mzn(n("withdrawn")))}</b><small>${n("withdraw_pending") ? `${esc(mzn(n("withdraw_pending")))} ${tr("em processamento", "processing")}` : n("ads_spent") ? `${esc(mzn(n("ads_spent")))} ${tr("usados em anúncios", "spent on ads")}` : "&nbsp;"}</small></div>
      </div>`;
  }

  main.innerHTML = dashShell("carteira", `<div class="wallet-page">
    ${tab !== "saldo" ? `<a class="back dark" href="#/carteira">← ${tr("Voltar", "Go back")}</a>` : ""}
    <div class="sec-head"><h1 class="page-title light">${title}</h1><a class="help-link" href="#/contacto">${tr("Ajuda", "Help")} ${ICON.help}</a></div>
    ${body}${tabBar}</div>`);

  document.getElementById("xf")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const params = new URLSearchParams();
    for (const [k, v] of new FormData(e.target)) if (v) params.set(k, v);
    location.hash = "#/carteira/extrato" + (params.toString() ? "?" + params : "");
  });
  const f = document.getElementById("wd");
  if (!f) return;
  f.method.addEventListener("change", () => { document.getElementById("accLbl").textContent = f.method.value === "bank" ? "NIB / IBAN" : tr("Número", "Number"); });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = f.querySelector("button"); busy(btn, true);
    const fd = Object.fromEntries(new FormData(f));
    try {
      await api.requestWithdrawal({ amount: fd.amount, method: fd.method, account: fd.account.trim(), name: fd.name.trim() });
      toast(tr("Pedido de levantamento enviado.", "Withdrawal requested."));
      rerender();
    } catch (err) { toast(err.message, "err"); busy(btn, false); }
  });
}

// ---------- Afiliados ----------
// Kit de divulgação: link, mensagem pronta e botões de partilha
const shareText = (c, link) => `${c.title}${c.subtitle ? ` — ${c.subtitle}` : ""}\n${Number(c.price_mzn) ? `💰 ${mzn(c.price_mzn)}` : ""}\n👉 ${link}`;
function openShare(c, code) {
  document.getElementById("share-kit")?.remove();
  const link = affLink(c.id || c.course_id, code), msg = shareText(c, link), enc = encodeURIComponent;
  const wrap = document.createElement("div");
  wrap.id = "share-kit"; wrap.className = "modal-wrap";
  wrap.innerHTML = `<div class="modal share-kit" role="dialog" aria-modal="true" aria-label="${tr("Divulgar", "Promote")}">
    <button type="button" class="sk-x" data-skx aria-label="${tr("Fechar", "Close")}">✕</button>
    <h3>${tr("Divulga e ganha", "Promote and earn")} ${Number(c.affiliate_pct || 0)}%</h3>
    <p class="muted small">${esc(c.title)}</p>
    <label class="sk-l">${tr("O teu link", "Your link")}</label>
    <div class="link-box"><code>${esc(link)}</code><button class="icon-btn" data-copy="${esc(link)}" title="${tr("Copiar", "Copy")}">${ICON.copy}</button></div>
    <div class="sk-btns">
      <a class="sk-b wa" target="_blank" rel="noopener" href="https://wa.me/?text=${enc(msg)}">${ICON.whats} WhatsApp</a>
      <a class="sk-b fb" target="_blank" rel="noopener" href="https://www.facebook.com/sharer/sharer.php?u=${enc(link)}"><b>f</b> Facebook</a>
      <a class="sk-b tg" target="_blank" rel="noopener" href="https://t.me/share/url?url=${enc(link)}&text=${enc(c.title)}"><b>➤</b> Telegram</a>
    </div>
    <label class="sk-l">${tr("Mensagem pronta (podes mudar)", "Ready-made message (edit as you like)")}</label>
    <textarea class="input" rows="4" id="skMsg">${esc(msg)}</textarea>
    <div class="sk-foot"><button type="button" class="btn btn-green btn-sm" id="skCopy">${ICON.copy} ${tr("Copiar mensagem", "Copy message")}</button>
      ${c.cover_url ? `<a class="btn btn-soft btn-sm" href="${esc(c.cover_url)}" target="_blank" rel="noopener" download>${tr("Descarregar a capa", "Download cover")}</a>` : ""}</div>
    <p class="small muted">${tr("O link fica guardado no aparelho do cliente durante 30 dias: se ele comprar nesse período, a comissão é tua.", "The link is remembered on the buyer's device for 30 days: if they buy in that time, the commission is yours.")}</p>
  </div>`;
  document.body.appendChild(wrap);
  const close = () => { wrap.remove(); window.removeEventListener("hashchange", close); };
  wrap.addEventListener("click", (e) => {
    if (e.target === wrap || e.target.closest("[data-skx]")) { close(); return; }
    const cp = e.target.closest("[data-copy]"); if (cp) copyText(cp.dataset.copy);
    if (e.target.closest("#skCopy")) copyText(wrap.querySelector("#skMsg").value);
  });
  window.addEventListener("hashchange", close);
}

export async function affiliates(main, _p, query, alive) {
  const tab = ["mercado", "links", "vendas"].includes(query.t) ? query.t : "mercado";
  const [market, stats, sales] = await Promise.all([
    api.affiliateMarket().catch(() => []),
    state.user ? api.myAffiliateStats().catch(() => []) : [],
    state.user && tab === "vendas" ? api.affiliateSales(state.user.id).catch(() => []) : [],
  ]);
  if (!alive()) return;
  const joined = new Map(stats.map((a) => [a.course_id, a.code]));
  const tot = stats.reduce((o, x) => ({ clicks: o.clicks + Number(x.clicks || 0), sales: o.sales + Number(x.sales || 0), earned: o.earned + Number(x.earned || 0) }), { clicks: 0, sales: 0, earned: 0 });
  const conv = (cl, sa) => (Number(cl) ? `${Math.min(100, Math.round((Number(sa) / Number(cl)) * 1000) / 10)}%` : "—");
  const tabs = [["mercado", tr("Mercado", "Marketplace"), market.length], ["links", tr("Os meus links", "My links"), stats.length], ["vendas", tr("As minhas vendas", "My sales"), ""]];

  const intro = `<div class="afm-hero">
    <div><span class="afm-k">${tr("Mercado de afiliados", "Affiliate marketplace")}</span>
      <h1>${tr("Vende produtos de outros criadores e ganha comissão", "Sell other creators' products and earn commission")}</h1>
      <div class="afm-steps"><span><b>1</b>${tr("Escolhe um produto", "Pick a product")}</span><span><b>2</b>${tr("Partilha o teu link", "Share your link")}</span><span><b>3</b>${tr("Ganha em cada venda", "Earn on every sale")}</span></div></div>
    ${state.user ? `<div class="afm-kpis"><div><b>${tot.clicks}</b><span>${tr("cliques", "clicks")}</span></div><div><b>${tot.sales}</b><span>${tr("vendas", "sales")}</span></div><div class="hl"><b>${esc(mzn(tot.earned))}</b><span>${tr("ganhos", "earned")}</span></div></div>`
      : `<a class="btn btn-primary" href="#/registar">${tr("Criar conta grátis", "Create free account")}</a>`}
  </div>`;

  const card = (c) => {
    const code = joined.get(c.id), hot = Number(c.sales_30d) >= 3;
    return `<div class="afm-card" data-id="${esc(c.id)}" data-t="${esc((c.title + " " + (c.producer_name || "")).toLowerCase())}" data-cat="${esc(c.category || "")}">
      <a class="afm-img" href="#/curso/${esc(c.id)}">${coverHTML(c)}${hot ? `<span class="afm-hot">🔥 ${tr("Em alta", "Hot")}</span>` : c.featured ? `<span class="afm-hot feat">★ ${tr("Destaque", "Featured")}</span>` : ""}<span class="afm-pct">${Number(c.affiliate_pct)}%</span></a>
      <div class="afm-body">
        <small class="muted">${esc(typeLabel(c.product_type))} · ${esc(catLabel(c.category || ""))}</small>
        <h3 class="clamp2">${esc(c.title)}</h3>
        <small class="muted">${tr("por", "by")} ${esc(c.producer_name || "Uquiorrapay")}</small>
        <div class="afm-earn"><span>${tr("Ganhas por venda", "You earn per sale")}</span><b>${esc(mzn(c.est_commission))}</b><small>${tr("Preço", "Price")} ${esc(mzn(c.price_mzn))}</small></div>
        <p class="afm-meta">${Number(c.sales_30d) ? `${c.sales_30d} ${tr("vendas em 30 dias", "sales in 30 days")} · ` : ""}${Number(c.affiliates) || 0} ${Number(c.affiliates) === 1 ? tr("afiliado", "affiliate") : tr("afiliados", "affiliates")}</p>
        <div class="afm-btns"><a class="btn btn-sm btn-ghost-dark" href="#/curso/${esc(c.id)}">${tr("Ver página", "View page")}</a>
          ${code ? `<button class="btn btn-sm btn-green" data-share>${ICON.link} ${tr("Divulgar", "Promote")}</button>` : `<button class="btn btn-sm btn-primary" data-join>${tr("Quero promover", "Promote this")}</button>`}</div>
      </div>
    </div>`;
  };

  let body;
  if (tab === "mercado") {
    body = market.length ? `<div class="afm-tools">
        <input class="input" id="afmQ" type="search" placeholder="${tr("Pesquisar produto ou criador…", "Search product or creator…")}">
        <select class="input" id="afmCat"><option value="">${tr("Todas as categorias", "All categories")}</option>${[...new Set(market.map((c) => c.category).filter(Boolean))].map((c) => `<option value="${esc(c)}">${esc(catLabel(c))}</option>`).join("")}</select>
        <div class="afm-sort">${[["vendas", tr("Mais vendidos", "Best sellers")], ["comissao", tr("Maior comissão", "Highest commission")], ["recentes", tr("Mais recentes", "Newest")]].map(([k, l], i) => `<button type="button" class="${i === 0 ? "on" : ""}" data-sort="${k}">${l}</button>`).join("")}</div>
      </div>
      <div class="afm-grid" id="afmGrid">${market.map(card).join("")}</div>
      <p class="muted center afm-none" id="afmNone" hidden>${tr("Nenhum produto encontrado.", "No products found.")}</p>`
      : emptyState(tr("Ainda não há produtos com afiliação aberta.", "No products open to affiliates yet."), tr("Os criadores ligam o programa de afiliados na página do produto.", "Creators turn on the affiliate program on the product page."));
  } else if (!state.user) {
    body = emptyState(tr("Entra para ver os teus links", "Sign in to see your links"), "", `<a class="btn btn-primary" href="#/entrar">${tr("Entrar", "Sign in")}</a>`);
  } else if (tab === "links") {
    body = stats.length ? `<div class="afl-list">${stats.map((a) => `<div class="afl" data-id="${esc(a.course_id)}" data-code="${esc(a.code)}">
        <div class="afl-head">${coverHTML({ ...a, id: a.course_id }, "xs")}<div><b>${esc(a.title)}</b><small class="muted">${tr("Comissão", "Commission")} ${Number(a.affiliate_pct)}% · ${tr("código", "code")} ${esc(a.code)}</small></div>
          <button class="btn btn-sm btn-green" data-share>${ICON.link} ${tr("Divulgar", "Promote")}</button></div>
        <div class="afl-kpis"><div><b>${a.clicks}</b><span>${tr("cliques", "clicks")}</span></div><div><b>${a.sales}</b><span>${tr("vendas", "sales")}</span></div><div><b>${conv(a.clicks, a.sales)}</b><span>${tr("conversão", "conversion")}</span></div><div class="hl"><b>${esc(mzn(a.earned))}</b><span>${tr("ganhos", "earned")}</span></div></div>
        ${Number(a.pending) ? `<p class="small afl-pend">⏳ ${a.pending} ${tr("venda(s) à espera de pagamento", "sale(s) awaiting payment")}</p>` : ""}
        <div class="link-box"><code>${esc(affLink(a.course_id, a.code))}</code><button class="icon-btn" data-copy="${esc(affLink(a.course_id, a.code))}" title="${tr("Copiar", "Copy")}">${ICON.copy}</button></div>
      </div>`).join("")}</div>
      <p class="small muted">${tr("Os cliques contam uma visita por pessoa por dia. As comissões entram na tua Carteira quando o pagamento é confirmado.", "Clicks count one visit per person per day. Commissions go to your Wallet once payment is confirmed.")}</p>`
      : emptyState(tr("Ainda não promoves nenhum produto.", "You're not promoting any product yet."), "", `<a class="btn btn-primary" href="#/afiliados">${tr("Ver o mercado", "See the marketplace")}</a>`);
  } else {
    const paid = sales.filter((x) => x.status === "paid");
    body = `<div class="stats">
        <div class="stat"><span>${tr("Cliques nos teus links", "Clicks on your links")}</span><b>${tot.clicks}</b><small>&nbsp;</small></div>
        <div class="stat"><span>${tr("Vendas confirmadas", "Confirmed sales")}</span><b>${paid.length}</b><small>${tr("conversão", "conversion")} ${conv(tot.clicks, paid.length)}</small></div>
        <div class="stat hl"><span>${tr("Comissões", "Commissions")}</span><b>${esc(mzn(paid.reduce((s2, x) => s2 + Number(x.affiliate_mzn || 0), 0)))}</b><small><a href="#/carteira" style="color:inherit">${tr("Ver carteira", "View wallet")} →</a></small></div>
      </div>
      ${sales.length ? `<div class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>${tr("Data", "Date")}</th><th>${tr("Produto", "Product")}</th><th>${tr("Valor", "Amount")}</th><th>${tr("Comissão", "Commission")}</th><th>${tr("Estado", "Status")}</th></tr></thead>
        <tbody>${sales.map((x) => `<tr><td>${esc(date(x.paid_at || x.created_at))}</td><td>${esc(x.courses?.title || "")}</td><td>${esc(mzn(x.amount_mzn))}</td><td><b>${esc(mzn(x.affiliate_mzn))}</b></td><td>${statusBadge(x.status, "order")}</td></tr>`).join("")}</tbody></table></div></div>`
        : emptyState(tr("Ainda sem vendas como afiliado.", "No affiliate sales yet."))}`;
  }

  const inner = `${intro}
    <nav class="tabs">${tabs.map(([k, l, n]) => `<a href="#/afiliados?t=${k}" class="${k === tab ? "on" : ""}">${esc(l)}${n !== "" && n ? ` <span class="tab-n">${n}</span>` : ""}</a>`).join("")}</nav>
    <div id="affBody">${body}</div>`;
  main.innerHTML = state.user ? dashShell("afiliados", inner) : `<section class="page container">${inner}</section>`;

  // Pesquisa, categoria e ordenação no próprio telemóvel (sem recarregar)
  const grid = document.getElementById("afmGrid");
  if (grid) {
    const byId = new Map(market.map((c) => [c.id, c]));
    let sort = "vendas";
    const apply = () => {
      const q = (document.getElementById("afmQ").value || "").trim().toLowerCase(), cat = document.getElementById("afmCat").value;
      const cards = [...grid.children];
      cards.sort((x, y) => {
        const a1 = byId.get(x.dataset.id), b1 = byId.get(y.dataset.id);
        if (sort === "comissao") return Number(b1.est_commission) - Number(a1.est_commission);
        if (sort === "recentes") return String(b1.approved_at || "").localeCompare(String(a1.approved_at || ""));
        return Number(b1.sales_30d || 0) - Number(a1.sales_30d || 0) || Number(b1.est_commission) - Number(a1.est_commission);
      }).forEach((el) => grid.appendChild(el));
      let shown = 0;
      cards.forEach((el) => { const ok = (!q || el.dataset.t.includes(q)) && (!cat || el.dataset.cat === cat); el.hidden = !ok; if (ok) shown++; });
      document.getElementById("afmNone").hidden = shown > 0;
    };
    document.getElementById("afmQ").addEventListener("input", apply);
    document.getElementById("afmCat").addEventListener("change", apply);
    main.querySelector(".afm-sort").addEventListener("click", (e) => {
      const b = e.target.closest("[data-sort]"); if (!b) return;
      sort = b.dataset.sort; main.querySelectorAll(".afm-sort button").forEach((x) => x.classList.toggle("on", x === b)); apply();
    });
    apply();
  }

  if (query.curso) document.querySelector(`[data-id="${CSS.escape(query.curso)}"]`)?.scrollIntoView({ block: "center" });
  const find = (id) => market.find((c) => c.id === id) || stats.find((a) => a.course_id === id);
  main.onclick = async (e) => {
    const cp = e.target.closest("[data-copy]");
    if (cp) { copyText(cp.dataset.copy); return; }
    const sh = e.target.closest("[data-share]");
    if (sh) { const id = sh.closest("[data-id]").dataset.id; openShare(find(id), joined.get(id) || sh.closest("[data-code]")?.dataset.code); return; }
    const j = e.target.closest("[data-join]");
    if (!j) return;
    if (!state.user) {
      try { sessionStorage.setItem("uq_after_login", "#/afiliados"); } catch {}
      location.hash = "#/registar"; return;
    }
    const id = j.closest("[data-id]").dataset.id;
    busy(j, true);
    try {
      const code = await api.joinAffiliate(id);
      joined.set(id, code);
      toast(tr("Pronto! O teu link foi criado.", "Done! Your link is ready."));
      j.outerHTML = `<button class="btn btn-sm btn-green" data-share>${ICON.link} ${tr("Divulgar", "Promote")}</button>`;
      openShare(find(id), code);
    } catch (err) { toast(err.message, "err"); busy(j, false); }
  };
}
