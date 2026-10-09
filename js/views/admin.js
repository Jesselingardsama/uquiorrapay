// Administração: resumo de tarefas, revisão de produtos, pagamentos, levantamentos, utilizadores, definições e segurança.
import { api } from "../api.js?v=202610091700";
import { state, tr, esc, mzn, siteUrl, statusBadge, date, toast, modal, emptyState, methodLabel, isAdmin, dashShell, supportOk, ICON, copyText, catLabel, dateTime, trackUpload, donutSVG, areaSVG, dailySeries, deltaHTML } from "../ui.js?v=202610091700";
import { go, rerender, bumpAdminCounts } from "../app.js?v=202610091700";
import { adminSecurityLog } from "./security.js?v=202610091700";
import { pushCardHTML, wirePush } from "../push.js?v=202610091700";
import { DOCS, KYC_TXT } from "./kyc.js?v=202610091700";
import { OB } from "./onboarding.js?v=202610091700";

const TABS = () => ({
  resumo: [tr("Resumo", "Overview"), tr("O que precisa da tua atenção hoje.", "What needs your attention today.")],
  revisao: [tr("Revisão de produtos", "Product review"), tr("Aprova ou rejeita os produtos enviados pelos produtores.", "Approve or reject products submitted by creators.")],
  pedidos: [tr("Pagamentos", "Payments"), tr("Confirma os pagamentos manuais (M-Pesa, e-Mola, PayPal) com o código da transacção.", "Confirm manual payments with the transaction code.")],
  levantamentos: [tr("Levantamentos", "Withdrawals"), tr("Paga aos produtores e afiliados e marca como pago.", "Pay creators and affiliates and mark as paid.")],
  anuncios: [tr("Anúncios", "Ads"), tr("Confirma os destaques pagos e define os preços dos planos.", "Confirm paid promotions and set plan prices.")],
  verificacoes: [tr("Verificação de identidade", "Identity verification"), tr("Confere os documentos (KYC) antes de libertar levantamentos.", "Check documents (KYC) before releasing withdrawals.")],
  cursos: [tr("Todos os produtos", "All products"), tr("Destaca, edita ou retira produtos da montra.", "Feature, edit or unpublish products.")],
  utilizadores: [tr("Utilizadores", "Users"), tr("Contas registadas e papéis.", "Registered accounts and roles.")],
  definicoes: [tr("Definições", "Settings"), tr("Comissão, garantia, formas de pagamento, suporte e segurança.", "Commission, guarantee, payments, support and security.")],
  seguranca: [tr("Registo de segurança", "Security log"), tr("Histórico de acções sensíveis.", "History of sensitive actions.")],
});

export async function admin(main, { tab = "resumo" }, query, alive) {
  const T = TABS();
  if (!T[tab]) tab = "resumo";
  main.innerHTML = dashShell("admin-" + tab, `
    <div class="adm-head"><div><h1 class="page-title">${esc(T[tab][0])}</h1><p class="muted">${esc(T[tab][1])}</p></div>
      ${tab !== "resumo" ? `<a class="btn btn-sm btn-ghost-dark" href="#/admin">← ${tr("Resumo", "Overview")}</a>` : ""}</div>
    <nav class="tabs adm-tabs">${Object.entries(T).map(([k, [l]]) => `<a href="#/admin/${k}" class="${k === tab ? "on" : ""}">${esc(l)}</a>`).join("")}</nav>
    <div id="tab"><div class="loading"><span></span><span></span><span></span></div></div>`);
  const box = document.getElementById("tab");
  const fn = { resumo, revisao, pedidos, levantamentos, anuncios, verificacoes, cursos, utilizadores, definicoes, seguranca }[tab];
  await fn(box, query, alive);
}

async function seguranca(box, _q, alive) {
  const html = await adminSecurityLog();
  if (alive()) box.innerHTML = html;
}

async function resumo(box, _q, alive) {
  const [s, wds, pend, orders, sets, gws, mfa, ob, bos, paidOrders] = await Promise.all([
    api.adminStats(), api.adminWithdrawals("pending").catch(() => []), api.adminCourses("pending").catch(() => []),
    api.adminOrders("pending").catch(() => []), api.settings().catch(() => ({})), api.gatewayStatus().catch(() => null),
    api.mfaFactors().catch(() => ({ verified: [] })), api.adminOnboardingStats().catch(() => null), api.adminBoosts("pending").catch(() => []),
    api.adminOrders("paid").catch(() => []),
  ]);
  if (!alive()) return;
  const withCode = orders.filter((o) => o.payer_txn).length;
  const wdSum = wds.reduce((a, x) => a + Number(x.amount_mzn), 0);
  const task = (n, title, sub, href, btn, tone = "") => `<a class="adm-task ${n ? tone : "done"}" href="${href}">
      <b class="n">${n}</b><div><h3>${title}</h3><small>${sub}</small></div><span class="btn btn-sm ${n ? "btn-green" : "btn-ghost-dark"}">${n ? btn : tr("Ver", "View")}</span></a>`;
  const alerts = [];
  if (!mfa.verified?.length) alerts.push([tr("Ativa a verificação em 2 passos na tua conta de administrador.", "Turn on 2-step verification for your admin account."), "#/seguranca", tr("Ativar", "Turn on")]);
  if (!(sets.payment_mpesa?.number)) alerts.push([tr("Falta o número M-Pesa para pagamentos manuais.", "M-Pesa number for manual payments is missing."), "#/admin/definicoes", tr("Preencher", "Fill in")]);
  if (!(sets.payment_emola?.number)) alerts.push([tr("Falta o número e-Mola para pagamentos manuais.", "e-Mola number for manual payments is missing."), "#/admin/definicoes", tr("Preencher", "Fill in")]);
  { const g = sets.gateway || {}; if (!g.paysuite_enabled && !g.pagar_enabled && !g.e2_enabled) alerts.push([tr("Nenhum pagamento automático ligado (PaySuite, Pagar.co.mz ou e2Payments). Os clientes pagam pelo método manual.", "No automatic payment enabled (PaySuite, Pagar.co.mz or e2Payments). Customers pay manually."), "#/admin/definicoes", tr("Abrir", "Open")]); }
  if (!sets.support_whatsapp) alerts.push([tr("Falta o WhatsApp de apoio ao cliente.", "Customer support WhatsApp is missing."), "#/admin/definicoes", tr("Preencher", "Fill in")]);
  { const g = sets.gateway || {}; if (g.pagar_enabled && gws && !(gws.pagar_api_key_set && gws.pagar_signing_secret_set)) alerts.push([tr("A Pagar.co.mz está ligada mas falta a chave da API ou o segredo de assinatura — os pagamentos automáticos falham.", "Pagar.co.mz is on but the API key or signing secret is missing — automatic payments fail."), "#/admin/definicoes", tr("Corrigir", "Fix")]); }
  // Últimos 30 dias vs 30 anteriores (pagamentos confirmados)
  const DAY = 864e5, now = Date.now(), tOf = (o) => new Date(o.paid_at || o.created_at).getTime();
  const p30 = paidOrders.filter((o) => now - tOf(o) < 30 * DAY), pPrev = paidOrders.filter((o) => now - tOf(o) >= 30 * DAY && now - tOf(o) < 60 * DAY);
  const sum = (arr, k) => arr.reduce((a, o) => a + Number(o[k] || 0), 0);
  const vs = tr("vs 30 dias antes", "vs previous 30 days");
  const byM = {};
  for (const o of paidOrders) { const k = o.payment_method || "manual"; byM[k] = (byM[k] || 0) + 1; }
  const COLORS = ["var(--gold)", "#2FA36B", "#F7D57A", "#1B6B45", "#8FA39A"];
  const parts = Object.entries(byM).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v], i) => ({ l: methodLabel(k) || k, v, c: COLORS[i] }));
  box.innerHTML = `${pushCardHTML()}
    <div class="stats kpis">
      <div class="stat kpi hl"><span>${tr("Receita da plataforma", "Platform revenue")}</span><b>${esc(mzn(s.commission))}</b>${deltaHTML(sum(p30, "commission_mzn"), sum(pPrev, "commission_mzn"), vs)}</div>
      <a class="stat kpi" href="#/admin/pedidos?estado=paid"><span>${tr("Vendas confirmadas", "Confirmed sales")}</span><b>${esc(mzn(s.gross))}</b>${deltaHTML(sum(p30, "amount_mzn"), sum(pPrev, "amount_mzn"), vs)}</a>
      <a class="stat kpi" href="#/admin/cursos"><span>${tr("Produtos publicados", "Published products")}</span><b>${s.approved}</b><small class="kpi-d">${pend.length} ${tr("por rever", "to review")}</small></a>
      <a class="stat kpi" href="#/admin/utilizadores"><span>${tr("Utilizadores", "Users")}</span><b>${s.users}</b><small class="kpi-d">${tr("contas registadas", "registered accounts")}</small></a>
    </div>

    <div class="dk-grid adm-dk">
      <div class="dk-card dk-trend">
        <div class="dk-ch"><h2>${tr("Receita da plataforma", "Platform revenue")}</h2><small class="muted">${tr("acumulado em 30 dias", "30-day running total")}</small></div>
        <b class="dk-amt">${esc(mzn(sum(p30, "commission_mzn")))}</b><small class="muted">${p30.length} ${tr("vendas pagas", "paid sales")} · ${esc(mzn(sum(p30, "amount_mzn")))} ${tr("vendidos", "sold")}</small>
        ${areaSVG(dailySeries(paidOrders, 30, "paid_at", (o) => Number(o.commission_mzn || 0)).reduce((acc, v, i) => (acc.push((acc[i - 1] || 0) + v), acc), []), { id: "arA" })}
      </div>
      <div class="dk-card dk-sales">
        <div class="dk-ch"><h2>${tr("Formas de pagamento", "Payment methods")}</h2></div>
        <div class="dk-sales-in">
          ${donutSVG(parts, String(paidOrders.length), tr("pagamentos", "payments"))}
          <div class="dk-legend">${parts.length ? `<ul>${parts.map((x) => `<li><i style="background:${x.c}"></i><span>${esc(x.l)}</span><b>${x.v}</b></li>`).join("")}</ul>` : `<p class="small muted">${tr("Ainda sem pagamentos confirmados.", "No confirmed payments yet.")}</p>`}</div>
        </div>
      </div>
    </div>

    <h2 class="adm-h2">${tr("Para fazer agora", "To do now")}</h2>
    <div class="adm-tasks">
      ${task(orders.length, tr("Pagamentos por confirmar", "Payments to confirm"), orders.length ? tr(`${withCode} com código da transacção enviado`, `${withCode} with transaction code`) : tr("Tudo confirmado", "All confirmed"), "#/admin/pedidos?estado=pending", tr("Confirmar", "Confirm"), "hot")}
      ${task(pend.length, tr("Produtos por rever", "Products to review"), pend.length ? esc(pend.slice(0, 2).map((c) => c.title).join(" · ")) : tr("Nada para rever", "Nothing to review"), "#/admin/revisao", tr("Rever", "Review"), "hot")}
      ${task(wds.length, tr("Levantamentos por pagar", "Withdrawals to pay"), wds.length ? esc(mzn(wdSum)) : tr("Nada para pagar", "Nothing to pay"), "#/admin/levantamentos", tr("Pagar", "Pay"), "hot")}
      ${bos.length ? task(bos.length, tr("Anúncios por confirmar", "Ads to confirm"), esc(bos.slice(0, 2).map((b) => b.courses?.title || "").join(" · ")), "#/admin/anuncios", tr("Confirmar", "Confirm"), "hot") : ""}
    </div>
    ${alerts.length ? `<h2 class="adm-h2">${tr("Avisos", "Alerts")}</h2><div class="adm-alerts">${alerts.map(([t, h, b]) => `<div class="adm-alert"><span>${ICON.help}</span><p>${t}</p><a class="btn btn-sm btn-soft" href="${h}">${b}</a></div>`).join("")}</div>` : ""}
    ${ob && ob.total ? obStats(ob) : ""}`;
  wirePush();
}

// Respostas ao questionário de boas-vindas (de onde vêm os utilizadores e o que querem)
function obStats(ob) {
  const o = OB();
  const bars = (title, key, list) => {
    const data = ob[key] || {}, tot = Object.values(data).reduce((a, b) => a + Number(b), 0) || 1;
    const rows = list.map(([k, l]) => [l, Number(data[k] || 0)]).filter((r) => r[1]).sort((a, b) => b[1] - a[1]);
    return `<div class="panel ob-stat"><h3>${title}</h3>${rows.length ? rows.map(([l, n]) => `<div class="obs-row"><span>${esc(l)}</span><div class="obs-bar"><i style="width:${Math.round((n / tot) * 100)}%"></i></div><b>${n}</b></div>`).join("") : `<p class="small muted">—</p>`}</div>`;
  };
  return `<h2 class="adm-h2">${tr("Quem está a chegar", "Who is signing up")} <small class="muted">(${ob.total} ${tr("respostas", "answers")})</small></h2>
    <div class="ob-stats">${bars(tr("Como soube", "How they heard"), "source", o.source)}${bars(tr("Já vende?", "Already selling?"), "sells", o.sells)}${bars(tr("Objetivo", "Goal"), "goal", o.goal)}${bars(tr("Tipo de produto", "Product type"), "product", [...o.product, ["comprar", tr("Só comprar", "Only buying")]])}</div>`;
}

// Caixa com o parecer da IA
const RULE_TXT = () => ({ G1: tr("Conteúdo adulto", "Adult content"), G2: tr("Promessas falsas", "False promises"), G3: tr("Saúde", "Health"), G4: tr("Dinheiro/apostas", "Money/betting"), G5: tr("Pirataria", "Piracy"), G6: tr("Fraude", "Fraud"), G7: tr("Ilegal/perigoso", "Illegal/dangerous"), G8: tr("Ódio/assédio", "Hate/harassment"), G9: tr("Qualidade", "Quality") });
const VERD = () => ({ aprovar: [tr("Recomenda aprovar", "Recommends approval"), "ok"], rever: [tr("Tem dúvidas — decide tu", "Unsure — your call"), "warn"], rejeitar: [tr("Recomenda rejeitar", "Recommends rejecting"), "bad"] });
function aiBox(r) {
  if (!r) return `<div class="ai-box none">${SPARK} ${tr("Ainda sem análise da IA.", "No AI review yet.")} <button type="button" class="link-btn" data-act="ai">${tr("Analisar agora", "Analyse now")}</button></div>`;
  const [vt, vc] = VERD()[r.verdict] || [r.verdict, "warn"];
  const rt = RULE_TXT();
  return `<div class="ai-box v-${vc}">
    <div class="ai-top">${SPARK}<b>${esc(vt)}</b><span class="ai-score">${esc(r.score)}/100</span><small>${tr("confiança", "confidence")} ${esc(r.confidence || "")}</small>${r.auto ? `<span class="badge">${r.auto === "approve" ? tr("aprovado automaticamente", "auto-approved") : tr("rejeitado automaticamente", "auto-rejected")}</span>` : ""}</div>
    <p class="small">${esc(r.summary || "")}</p>
    ${(r.flags || []).length ? `<ul class="ai-flags">${r.flags.map((f) => `<li class="sev-${esc(f.severity)}"><b>${esc(rt[f.rule] || f.rule)}</b> · ${esc(f.severity)}${f.minors ? " · <b>" + tr("MENORES", "MINORS") + "</b>" : ""}<br><small>${esc(f.evidence || "")}</small></li>`).join("")}</ul>` : ""}
    ${r.media_not_seen ? `<p class="small muted">${ICON.play} ${tr(`${r.media_not_seen} vídeo(s)/áudio(s) não vistos pela IA — confirma tu em «Ver aulas».`, `${r.media_not_seen} video/audio item(s) not seen by the AI — check them in “View lessons”.`)}</p>` : ""}
    ${r.producer_message ? `<details><summary class="small">${tr("Mensagem sugerida ao produtor", "Suggested message to creator")}</summary><p class="small">${esc(r.producer_message)}</p></details>` : ""}
    <button type="button" class="link-btn small" data-act="ai">${tr("Analisar de novo", "Re-analyse")}</button>
  </div>`;
}
const SPARK = `<svg class="spark" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/></svg>`;

async function revisao(box, _q, alive) {
  const [rows, recent] = await Promise.all([api.adminCourses("pending"), api.adminAiRecent().catch(() => [])]);
  if (!alive()) return;
  const auto = recent.filter((c) => c.ai_review?.auto);
  box.innerHTML = (rows.length ? `<div class="review-list">${rows.map((c) => `
    <div class="panel review" data-id="${esc(c.id)}">
      <div><h3>${esc(c.title)}</h3><p class="muted small">${esc(c.producer_name || "")} · ${esc(catLabel(c.category))} · ${c.language === "en" ? "English" : "Português"} · ${esc(mzn(c.price_mzn))} · ${tr("enviado", "submitted")} ${esc(date(c.submitted_at))}</p>
        ${c.subtitle ? `<p>${esc(c.subtitle)}</p>` : ""}
        <p class="small">${supportOk(c) ? `${tr("Suporte", "Support")}: ${esc(c.support_whatsapp)} · ${esc(c.support_email)}` : `<span class="err-text">${tr("Sem suporte ao comprador — não é possível aprovar", "No buyer support — cannot approve")}</span>`}</p>
        ${aiBox(c.ai_review)}</div>
      <div class="actions">
        <a class="btn btn-sm btn-ghost-dark" href="#/curso/${esc(c.id)}" target="_blank">${tr("Pré-visualizar", "Preview")}</a>
        <a class="btn btn-sm btn-ghost-dark" href="#/aprender/${esc(c.id)}" target="_blank">${tr("Ver aulas", "View lessons")}</a>
        <button class="btn btn-sm btn-danger" data-act="reject">${tr("Rejeitar", "Reject")}</button>
        <button class="btn btn-sm btn-green" data-act="approve">${tr("Aprovar", "Approve")}</button>
      </div>
    </div>`).join("")}</div>`
    : emptyState(tr("Nada para rever.", "Nothing to review."), tr("Os cursos enviados pelos produtores aparecem aqui.", "Courses submitted by creators appear here.")))
    + (auto.length ? `<div class="panel ai-recent"><h3>${SPARK} ${tr("Decisões automáticas da IA", "Automatic AI decisions")}</h3>
        <p class="small muted">${tr("Podes reverter qualquer decisão em «Produtos».", "You can reverse any decision in “Products”.")}</p>
        <ul>${auto.map((c) => `<li><a href="#/curso/${esc(c.id)}" target="_blank">${esc(c.title)}</a> — ${c.ai_review.auto === "approve" ? `<span class="badge st-approved">${tr("aprovado", "approved")}</span>` : `<span class="badge st-rejected">${tr("rejeitado", "rejected")}</span>`} <small class="muted">${esc(c.ai_review.score)}/100 · ${esc(dateTime(c.ai_reviewed_at))}</small></li>`).join("")}</ul></div>` : "");
  box.onclick = async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    try {
      if (b.dataset.act === "ai") {
        b.disabled = true; b.textContent = tr("A analisar… (até 1 minuto)", "Analysing… (up to 1 minute)");
        const r = await api.aiReview(id);
        toast(r?.auto === "approve" ? tr("A IA aprovou o produto.", "The AI approved the product.") : r?.auto === "reject" ? tr("A IA rejeitou o produto.", "The AI rejected the product.") : tr("Análise concluída.", "Review done."));
      } else if (b.dataset.act === "approve") {
        await api.updateCourse(id, { status: "approved" });
        toast(tr("Produto aprovado e publicado.", "Product approved and published."));
      } else {
        const c = rows.find((x) => x.id === id);
        const reason = await modal({ title: tr("Rejeitar curso", "Reject course"), body: tr("Explica ao produtor o que tem de corrigir.", "Tell the creator what to fix."), input: tr("Motivo…", "Reason…"), confirm: tr("Rejeitar", "Reject"), danger: true, value: c?.ai_review?.producer_message || "" });
        if (!reason) return;
        await api.updateCourse(id, { status: "rejected", rejection_reason: reason });
        toast(tr("Curso rejeitado.", "Course rejected."));
      }
      bumpAdminCounts(); rerender();
    } catch (err) { toast(err.message, "err"); rerender(); }
  };
}

async function pedidos(box, query, alive) {
  const st = query.estado ?? "pending";
  const rows = await api.adminOrders(st || null);
  if (!alive()) return;
  const filt = [["pending", tr("Por confirmar", "To confirm")], ["paid", tr("Pagos", "Paid")], ["cancelled", tr("Cancelados", "Cancelled")], ["", tr("Todos", "All")]];
  box.innerHTML = `<div class="pills">${filt.map(([k, l]) => `<a class="pill ${k === st ? "on" : ""}" href="#/admin/pedidos?estado=${k}">${esc(l)}</a>`).join("")}</div>
    ${rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>${tr("Data", "Date")}</th><th>${tr("Referência", "Reference")}</th><th>${tr("Cliente", "Customer")}</th><th>${tr("Curso", "Course")}</th><th>${tr("Método", "Method")}</th><th>${tr("Valor", "Amount")}</th><th>${tr("Código pago", "Payment code")}</th><th>${tr("Estado", "Status")}</th><th></th></tr></thead>
      <tbody>${rows.map((o) => `<tr data-id="${esc(o.id)}">
        <td>${esc(date(o.created_at))}</td><td><b>${esc(o.reference)}</b></td>
        <td>${esc(o.profiles?.full_name || "")}<div class="small muted">${esc(o.profiles?.email || "")}${o.payer_phone ? " · " + esc(o.payer_phone) : ""}</div></td>
        <td>${esc(o.courses?.title || "")}</td><td>${esc(methodLabel(o.payment_method))}</td>
        <td>${esc(o.pay_currency === "USD" ? `$${Number(o.pay_amount).toFixed(2)}` : mzn(o.amount_mzn))}${o.coupon_code ? `<div class="small muted">${tr("cupão", "coupon")} ${esc(o.coupon_code)}</div>` : ""}${o.affiliate_code ? `<div class="small muted">${tr("afiliado", "affiliate")} ${esc(o.affiliate_code)}</div>` : ""}</td>
        <td>${o.payer_txn ? `<b class="txn">${esc(o.payer_txn)}</b><div class="small muted">${esc(date(o.proof_at))}</div>` : o.gateway && o.gateway !== "manual" ? `<span class="small">${esc(o.gateway)}</span>` : `<span class="muted">—</span>`}</td>
        <td>${statusBadge(o.status, "order")}</td>
        <td class="actions">${o.status === "pending" ? `<button class="btn btn-sm btn-green" data-act="paid">${tr("Confirmar pagamento", "Confirm payment")}</button><button class="btn btn-sm btn-ghost-dark" data-act="cancelled">${tr("Cancelar", "Cancel")}</button>`
          : o.status === "paid" ? `<button class="btn btn-sm btn-ghost-dark" data-act="refunded">${tr("Reembolsar", "Refund")}</button>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>` : emptyState(tr("Sem pedidos.", "No orders."))}`;
  box.onclick = async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    const act = b.dataset.act;
    if (act !== "paid" && !(await modal({ title: act === "refunded" ? tr("Reembolsar pedido?", "Refund order?") : tr("Cancelar pedido?", "Cancel order?"), body: act === "refunded" ? tr("O aluno perde o acesso ao curso.", "The student loses access to the course.") : "", confirm: tr("Sim", "Yes"), danger: true }))) return;
    try { await api.setOrderStatus(id, act); toast(act === "paid" ? tr("Pagamento confirmado. O aluno já tem acesso.", "Payment confirmed. The student now has access.") : tr("Pedido actualizado.", "Order updated.")); bumpAdminCounts(); rerender(); }
    catch (err) { toast(err.message, "err"); }
  };
}

async function levantamentos(box, query, alive) {
  const st = query.estado ?? "pending";
  const rows = await api.adminWithdrawals(st || null);
  const uids = [...new Set(rows.map((w) => w.user_id))];
  const [kmap, holds] = await Promise.all([api.adminKycMap(uids).catch(() => []), api.adminHolds().catch(() => [])]);
  if (!alive()) return;
  const kycOf = (id) => kmap.find((k) => k.user_id === id);
  const holdOf = (id) => holds.find((h) => h.user_id === id && h.withdraw_hold);
  const norm = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z ]/g, "").split(/\s+/).filter((w) => w.length > 2);
  const sameName = (a, b) => { const A = norm(a), B = norm(b); return A.filter((w) => B.includes(w)).length >= 2; };
  const filt = [["pending", tr("Por pagar", "To pay")], ["paid", tr("Pagos", "Paid")], ["rejected", tr("Recusados", "Rejected")], ["", tr("Todos", "All")]];
  box.innerHTML = `<div class="pills">${filt.map(([k, l]) => `<a class="pill ${k === st ? "on" : ""}" href="#/admin/levantamentos?estado=${k}">${esc(l)}</a>`).join("")}</div>
    ${rows.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>${tr("Data", "Date")}</th><th>${tr("Utilizador", "User")}</th><th>${tr("Valor", "Amount")}</th><th>${tr("Para", "To")}</th><th>${tr("Estado", "Status")}</th><th></th></tr></thead>
      <tbody>${rows.map((w) => `<tr data-id="${esc(w.id)}">
        <td>${esc(date(w.created_at))}</td>
        <td>${esc(w.profiles?.full_name || "")}<div class="small muted">${esc(w.profiles?.email || "")}</div>
          <div class="small">${kycOf(w.user_id)?.status === "approved" ? `<span class="badge st-approved">${ICON.check} ${tr("identidade verificada", "ID verified")}</span>` : `<span class="badge st-rejected">${tr("sem verificação", "not verified")}</span>`}${holdOf(w.user_id) ? ` <span class="badge st-rejected">${ICON.lock} ${tr("retido", "on hold")}</span>` : ""}</div></td>
        <td><b>${esc(mzn(w.amount_mzn))}</b></td>
        <td>${esc(methodLabel(w.method))}<div class="small"><b>${esc(w.account_number)}</b> · ${esc(w.account_name)}</div>
          ${kycOf(w.user_id) && !sameName(kycOf(w.user_id).full_name, w.account_name) ? `<div class="small err-text">⚠ ${tr("Titular diferente do nome verificado", "Holder differs from verified name")}: ${esc(kycOf(w.user_id).full_name)}</div>` : ""}</td>
        <td>${statusBadge(w.status, "wd")}${w.admin_note ? `<div class="small muted">${esc(w.admin_note)}</div>` : ""}</td>
        <td class="actions">${w.status === "pending" ? `<button class="btn btn-sm btn-green" data-act="paid">${tr("Marcar como pago", "Mark as paid")}</button><button class="btn btn-sm btn-ghost-dark" data-act="rejected">${tr("Recusar", "Reject")}</button>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>` : emptyState(tr("Sem pedidos de levantamento.", "No withdrawal requests."))}`;
  box.onclick = async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    let note = null;
    if (b.dataset.act === "rejected") {
      note = await modal({ title: tr("Recusar levantamento", "Reject withdrawal"), body: tr("O valor volta ao saldo do utilizador.", "The amount returns to the user's balance."), input: tr("Motivo…", "Reason…"), confirm: tr("Recusar", "Reject"), danger: true });
      if (!note) return;
    } else {
      note = await modal({ title: tr("Confirmar pagamento", "Confirm payment"), body: tr("Confirma que já transferiste o valor. Podes indicar o código da transferência.", "Confirm you've already sent the money. You can add the transfer code."), input: tr("Código da transferência", "Transfer code"), confirm: tr("Marcar como pago", "Mark as paid") });
      if (!note) return;
    }
    try { await api.setWithdrawalStatus(id, b.dataset.act, note); toast(tr("Levantamento actualizado.", "Withdrawal updated.")); bumpAdminCounts(); rerender(); }
    catch (err) { toast(err.message, "err"); }
  };
}

// ---------- Anúncios (destaque pago) ----------
async function anuncios(box, query, alive) {
  const st = query.estado ?? "pending";
  const [rows, sets] = await Promise.all([api.adminBoosts(st === "ativos" ? "active" : st || ""), api.settings().catch(() => ({}))]);
  if (!alive()) return;
  const cfg = sets.boost || { enabled: true, plans: [] };
  const plans = [0, 1, 2].map((i) => cfg.plans?.[i] || { days: [3, 7, 30][i], mzn: [150, 300, 1000][i] });
  const list = st === "ativos" ? rows.filter((b) => b.ends_at && new Date(b.ends_at) > new Date()) : rows;
  const filt = [["pending", tr("Por confirmar", "To confirm")], ["ativos", tr("A decorrer", "Running")], ["rejected", tr("Recusados", "Rejected")], ["", tr("Todos", "All")]];
  const PAY = { wallet: tr("Carteira", "Wallet"), mpesa: "M-Pesa", emola: "e-Mola", paypal: "PayPal" };
  box.innerHTML = `<div class="pills">${filt.map(([k, l]) => `<a class="pill ${k === st ? "on" : ""}" href="#/admin/anuncios?estado=${k}">${esc(l)}</a>`).join("")}</div>
    ${list.length ? `<div class="table-wrap"><table class="table">
      <thead><tr><th>${tr("Data", "Date")}</th><th>${tr("Produto", "Product")}</th><th>${tr("Plano", "Plan")}</th><th>${tr("Pagamento", "Payment")}</th><th>${tr("Resultados", "Results")}</th><th></th></tr></thead>
      <tbody>${list.map((b) => `<tr data-id="${esc(b.id)}">
        <td>${esc(date(b.created_at))}</td>
        <td><a href="#/curso/${esc(b.course_id)}"><b>${esc(b.courses?.title || "—")}</b></a><div class="small muted">${esc(b.profile?.full_name || "")} · ${esc(b.profile?.email || "")}</div></td>
        <td><b>${b.days} ${tr("dias", "days")}</b><div class="small">${esc(mzn(b.amount_mzn))}</div></td>
        <td>${esc(PAY[b.pay_method] || b.pay_method)}${b.payer_ref ? `<div class="small"><b>${esc(b.payer_ref)}</b></div>` : ""}</td>
        <td>${b.status === "active" ? `${esc(date(b.starts_at))} → ${esc(date(b.ends_at))}<div class="small muted">${Number(b.views)} ${tr("vistas", "views")} · ${Number(b.clicks)} ${tr("cliques", "clicks")}</div>` : b.status === "rejected" ? `<span class="badge st-rejected">${tr("Recusado", "Rejected")}</span><div class="small muted">${esc(b.reason || "")}</div>` : `<span class="badge st-pending">${tr("Por confirmar", "To confirm")}</span>`}</td>
        <td class="actions">${b.status === "pending" ? `<button class="btn btn-sm btn-green" data-act="ok">${tr("Pagamento recebido", "Payment received")}</button><button class="btn btn-sm btn-ghost-dark" data-act="no">${tr("Recusar", "Reject")}</button>` : ""}</td>
      </tr>`).join("")}</tbody></table></div>` : emptyState(st === "pending" ? tr("Nenhum anúncio por confirmar.", "No ads to confirm.") : tr("Sem anúncios.", "No ads."))}
    <form class="form panel boost-cfg" id="bcf">
      <h3>${tr("Planos de destaque", "Promotion plans")}</h3>
      <label class="switch"><input type="checkbox" name="enabled" ${cfg.enabled !== false ? "checked" : ""}><span>${tr("Permitir que os produtores anunciem", "Let creators promote products")}</span></label>
      ${plans.map((p, i) => `<div class="two"><label>${tr(`Plano ${i + 1} — dias`, `Plan ${i + 1} — days`)}<input class="input" name="d${i}" type="number" min="1" max="90" required value="${Number(p.days)}"></label><label>${tr("Preço (MZN)", "Price (MZN)")}<input class="input" name="m${i}" type="number" min="0" step="1" required value="${Number(p.mzn)}"></label></div>`).join("")}
      <p class="small muted">${tr("Pagos com saldo da Carteira começam logo. Pagos por M-Pesa, e-Mola ou PayPal começam quando carregares em «Pagamento recebido».", "Wallet-paid ads start right away. M-Pesa, e-Mola or PayPal ones start when you click “Payment received”.")}</p>
      <button class="btn btn-green">${tr("Guardar planos", "Save plans")}</button>
    </form>`;
  box.onclick = async (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    let reason = null;
    if (b.dataset.act === "no") {
      reason = await modal({ title: tr("Recusar anúncio", "Reject ad"), body: tr("O produtor vê o motivo no painel.", "The creator sees the reason in their dashboard."), input: tr("Motivo (ex.: pagamento não encontrado)", "Reason (e.g. payment not found)"), confirm: tr("Recusar", "Reject"), danger: true });
      if (!reason) return;
    } else if (!(await modal({ title: tr("Confirmar pagamento do anúncio?", "Confirm ad payment?"), body: tr("Confirma que recebeste o valor com este código. O anúncio começa já.", "Confirm you received the money with this code. The ad starts now."), confirm: tr("Confirmar e ativar", "Confirm and activate") }))) return;
    try { await api.adminReviewBoost(id, b.dataset.act === "ok", reason); toast(b.dataset.act === "ok" ? tr("Anúncio ativo.", "Ad is live.") : tr("Anúncio recusado.", "Ad rejected.")); bumpAdminCounts(); rerender(); }
    catch (err) { toast(err.message, "err"); }
  };
  document.getElementById("bcf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target, btn = f.querySelector("button");
    const plans2 = [0, 1, 2].map((i) => ({ days: Math.round(Number(f[`d${i}`].value)), mzn: Math.round(Number(f[`m${i}`].value)) })).filter((p) => p.days >= 1 && p.days <= 90 && p.mzn >= 0);
    if (new Set(plans2.map((p) => p.days)).size !== plans2.length) { toast(tr("Cada plano tem de ter um número de dias diferente.", "Each plan needs a different number of days."), "err"); return; }
    btn.disabled = true;
    try { await api.saveSetting("boost", { enabled: f.enabled.checked, plans: plans2.sort((a, b) => a.days - b.days) }); state.settings.boost = { enabled: f.enabled.checked, plans: plans2 }; toast(tr("Planos guardados.", "Plans saved.")); }
    catch (err) { toast(err.message, "err"); }
    btn.disabled = false;
  });
}

async function verificacoes(box, query, alive) {
  const st = query.estado ?? "pending";
  const rows = await api.adminKyc(st || null);
  if (!alive()) return;
  const filt = [["pending", tr("Por verificar", "To check")], ["approved", tr("Verificadas", "Verified")], ["rejected", tr("Recusadas", "Rejected")], ["", tr("Todas", "All")]];
  const age = (d) => Math.floor((Date.now() - new Date(d)) / (365.25 * 864e5));
  box.innerHTML = `<div class="pills">${filt.map(([k, l]) => `<a class="pill ${k === st ? "on" : ""}" href="#/admin/verificacoes?estado=${k}">${esc(l)}</a>`).join("")}</div>
    ${rows.length ? `<div class="review-list">${rows.map((k) => `<div class="panel kyc-rev" data-id="${esc(k.user_id)}">
      <div class="kr-data">
        <h3>${esc(k.full_name)} <span class="badge st-${k.status === "approved" ? "approved" : k.status === "rejected" ? "rejected" : "pending"}">${esc(KYC_TXT()[k.status])}</span></h3>
        <dl>
          <dt>${tr("Conta", "Account")}</dt><dd>${esc(k.profile.full_name || "")} · ${esc(k.profile.email || "")} · ${esc(k.profile.phone || "")}</dd>
          <dt>${tr("Documento", "Document")}</dt><dd>${esc(DOCS()[k.doc_type] || k.doc_type)} · <b class="mono">${esc(k.doc_number)}</b></dd>
          <dt>${tr("Nascimento", "Born")}</dt><dd>${esc(date(k.birth_date))} (${age(k.birth_date)} ${tr("anos", "years")})</dd>
          <dt>${tr("Morada", "Address")}</dt><dd>${esc(k.address)}</dd>
          <dt>${tr("Enviado", "Sent")}</dt><dd>${esc(dateTime(k.submitted_at))}</dd>
          ${k.rejection_reason ? `<dt>${tr("Motivo", "Reason")}</dt><dd class="err-text">${esc(k.rejection_reason)}</dd>` : ""}
        </dl>
        ${norm2(k.full_name) !== norm2(k.profile.full_name) ? `<p class="small err-text">⚠ ${tr("O nome do documento é diferente do nome da conta — confere.", "Document name differs from account name — check.")}</p>` : ""}
      </div>
      <div class="kr-files">${[["front_path", tr("Frente", "Front")], ["back_path", tr("Verso", "Back")], ["selfie_path", "Selfie"]].filter(([f]) => k[f]).map(([f, l]) => `<button type="button" class="kr-file" data-file="${esc(k[f])}"><span>${ICON.doc}</span>${l}</button>`).join("")}</div>
      ${k.status === "pending" ? `<div class="actions"><button class="btn btn-sm btn-danger" data-act="no">${tr("Recusar", "Reject")}</button><button class="btn btn-sm btn-green" data-act="yes">${ICON.check} ${tr("Aprovar identidade", "Approve identity")}</button></div>` : ""}
    </div>`).join("")}</div>` : emptyState(tr("Nada para verificar.", "Nothing to check."), tr("Os pedidos de verificação de identidade aparecem aqui.", "Identity verification requests appear here."))}
    <p class="small muted">${ICON.lock} ${tr("Confere: a foto do documento é legível e não foi editada; a selfie mostra a mesma pessoa a segurar o documento; o nome e o número coincidem; tem 18 anos ou mais. Os links das imagens expiram em 5 minutos.", "Check: the document is legible and unedited; the selfie shows the same person holding it; name and number match; 18+. Image links expire in 5 minutes.")}</p>`;
  box.onclick = async (e) => {
    const fb = e.target.closest("[data-file]");
    if (fb) {
      try {
        const url = await api.kycFileUrl(fb.dataset.file);
        const wrap = document.createElement("div"); wrap.className = "modal-wrap";
        wrap.innerHTML = `<div class="modal kyc-view"><div class="modal-actions"><a class="btn btn-ghost-dark btn-sm" href="${esc(url)}" target="_blank" rel="noopener">${tr("Abrir noutra janela", "Open in new tab")}</a><button class="btn btn-sm btn-primary" data-x="1">${tr("Fechar", "Close")}</button></div>${/\.pdf(\?|$)/i.test(fb.dataset.file) ? `<p class="muted">${tr("PDF — abre noutra janela.", "PDF — open in a new tab.")}</p>` : `<img src="${esc(url)}" alt="">`}</div>`;
        document.body.appendChild(wrap);
        wrap.addEventListener("click", (ev) => { if (ev.target === wrap || ev.target.closest("[data-x]")) wrap.remove(); });
      } catch (err) { toast(err.message, "err"); }
      return;
    }
    const b = e.target.closest("[data-act]"); if (!b) return;
    const id = b.closest("[data-id]").dataset.id;
    try {
      if (b.dataset.act === "yes") {
        if (!(await modal({ title: tr("Aprovar esta identidade?", "Approve this identity?"), body: tr("Confirmaste os documentos e a selfie. O utilizador passa a poder levantar.", "You checked the documents and selfie. The user will be able to withdraw."), confirm: tr("Aprovar", "Approve") }))) return;
        await api.adminKycDecide(id, true, null);
        toast(tr("Identidade aprovada.", "Identity approved."));
      } else {
        const reason = await modal({ title: tr("Recusar verificação", "Reject verification"), body: tr("Diz ao utilizador o que corrigir.", "Tell the user what to fix."), input: tr("Ex.: foto desfocada; o nome não coincide; falta o verso", "E.g. blurry photo; name doesn't match; back missing"), confirm: tr("Recusar", "Reject"), danger: true });
        if (!reason) return;
        await api.adminKycDecide(id, false, reason);
        toast(tr("Verificação recusada.", "Verification rejected."));
      }
      bumpAdminCounts(); rerender();
    } catch (err) { toast(err.message, "err"); }
  };
}
const norm2 = (x) => String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, " ").trim();

async function cursos(box, _q, alive) {
  const rows = await api.adminCourses();
  if (!alive()) return;
  box.innerHTML = rows.length ? `<div class="table-wrap"><table class="table">
    <thead><tr><th>${tr("Curso", "Course")}</th><th>${tr("Produtor", "Creator")}</th><th>${tr("Preço", "Price")}</th><th>${tr("Estado", "Status")}</th><th>${tr("Destaque", "Featured")}</th><th></th></tr></thead>
    <tbody>${rows.map((c) => `<tr data-id="${esc(c.id)}">
      <td><b>${esc(c.title)}</b></td><td>${esc(c.producer_name || "")}</td><td>${esc(mzn(c.price_mzn))}</td><td>${statusBadge(c.status)}</td>
      <td><input type="checkbox" data-act="featured" ${c.featured ? "checked" : ""}></td>
      <td class="actions"><a class="btn btn-sm btn-ghost-dark" href="#/curso/${esc(c.id)}">${tr("Ver", "View")}</a><a class="btn btn-sm btn-ghost-dark" href="#/produtor/curso/${esc(c.id)}">${tr("Editar", "Edit")}</a>
        ${c.status === "approved" ? `<button class="btn btn-sm btn-danger-ghost" data-act="unpublish">${tr("Retirar", "Unpublish")}</button>` : `<button class="btn btn-sm btn-danger-ghost" data-act="delete">${ICON.trash} ${tr("Apagar", "Delete")}</button>`}</td>
    </tr>`).join("")}</tbody></table></div>` : emptyState(tr("Sem cursos.", "No courses."));
  box.onchange = async (e) => {
    if (e.target.dataset.act !== "featured") return;
    try { await api.updateCourse(e.target.closest("[data-id]").dataset.id, { featured: e.target.checked }); toast(tr("Actualizado.", "Updated.")); } catch (err) { toast(err.message, "err"); }
  };
  box.onclick = async (e) => {
    const del = e.target.closest("[data-act=delete]");
    if (del) {
      if (!(await modal({ title: tr("Apagar este produto?", "Delete this product?"), body: tr("Apaga o produto e as aulas. Não pode ser desfeito.", "Deletes the product and lessons. Cannot be undone."), confirm: tr("Apagar", "Delete"), danger: true }))) return;
      try { await api.deleteCourse(del.closest("[data-id]").dataset.id); toast(tr("Produto apagado.", "Product deleted.")); rerender(); }
      catch (err) { toast(/foreign|violat|restrict/i.test(err.message) ? tr("Este produto tem vendas registadas e não pode ser apagado — fica em rascunho (não aparece na montra).", "This product has sales and can't be deleted.") : err.message, "err"); }
      return;
    }
    const b = e.target.closest("[data-act=unpublish]"); if (!b) return;
    const reason = await modal({ title: tr("Retirar curso da montra", "Unpublish course"), input: tr("Motivo para o produtor…", "Reason for the creator…"), confirm: tr("Retirar", "Unpublish"), danger: true });
    if (!reason) return;
    try { await api.updateCourse(b.closest("[data-id]").dataset.id, { status: "rejected", rejection_reason: reason }); rerender(); } catch (err) { toast(err.message, "err"); }
  };
}

async function utilizadores(box, _q, alive) {
  const rows = await api.users();
  const [kmap, holds] = await Promise.all([api.adminKycMap(rows.map((u) => u.id)).catch(() => []), api.adminHolds().catch(() => [])]);
  if (!alive()) return;
  const kst = (id) => kmap.find((k) => k.user_id === id)?.status;
  const hold = (id) => holds.find((h) => h.user_id === id && h.withdraw_hold);
  box.innerHTML = `<div class="table-wrap"><table class="table">
    <thead><tr><th>${tr("Nome", "Name")}</th><th>Email</th><th>${tr("Telefone", "Phone")}</th><th>${tr("Desde", "Since")}</th><th>${tr("Identidade", "Identity")}</th><th>${tr("Produtor", "Creator")}</th><th>Admin</th><th></th></tr></thead>
    <tbody>${rows.map((u) => `<tr data-id="${esc(u.id)}">
      <td>${esc(u.full_name || "")}</td><td>${/@telefone\.uquiorrapay\.com$/i.test(u.email || "") ? `<span class="muted">${tr("conta por telefone", "phone account")}</span>` : esc(u.email || "")}</td><td>${esc(u.phone || "")}</td><td>${esc(date(u.created_at))}</td>
      <td>${kst(u.id) ? `<span class="badge st-${kst(u.id) === "approved" ? "approved" : kst(u.id) === "rejected" ? "rejected" : "pending"}">${esc(KYC_TXT()[kst(u.id)])}</span>` : `<span class="muted small">—</span>`}${hold(u.id) ? `<div class="small err-text">${ICON.lock} ${tr("retido", "on hold")}: ${esc(hold(u.id).reason || "")}</div>` : ""}</td>
      <td><input type="checkbox" data-role="producer" ${u.roles.includes("producer") ? "checked" : ""}></td>
      <td><input type="checkbox" data-role="admin" ${u.roles.includes("admin") ? "checked" : ""} ${u.id === state.user.id ? "disabled" : ""}></td>
      <td class="actions">${u.id !== state.user.id ? `<button class="btn btn-sm ${hold(u.id) ? "btn-green" : "btn-danger-ghost"}" data-hold="${esc(u.id)}" data-on="${hold(u.id) ? "1" : ""}" data-name="${esc(u.full_name || "")}">${ICON.lock} ${hold(u.id) ? tr("Libertar levantamentos", "Release withdrawals") : tr("Reter levantamentos", "Hold withdrawals")}</button>` : ""}${u.id !== state.user.id ? `<button class="btn btn-sm btn-ghost-dark" data-rec="${esc(u.id)}" data-phone="${esc(u.phone || "")}" data-name="${esc(u.full_name || "")}">${ICON.lock} ${tr("Link de nova senha", "Password link")}</button>` : ""}</td>
    </tr>`).join("")}</tbody></table></div>
    <p class="small muted">${tr("«Link de nova senha»: para clientes que esqueceram a palavra-passe. Envia o link pelo WhatsApp; vale por pouco tempo e só funciona uma vez.", "“Password link”: for customers who forgot their password. Send it via WhatsApp; it expires soon and works once.")}</p>`;
  box.onclick = async (e) => {
    const hb = e.target.closest("[data-hold]");
    if (hb) {
      const on = !hb.dataset.on;
      let reason = null;
      if (on) {
        reason = await modal({ title: tr(`Reter levantamentos de ${hb.dataset.name || "este utilizador"}?`, "Hold withdrawals?"), body: tr("Medida preventiva: o saldo fica na conta mas não pode ser levantado até libertares. O utilizador vê o motivo.", "Preventive measure: the balance stays but can't be withdrawn until you release it. The user sees the reason."), input: tr("Motivo (ex.: disputa de pagamento, verificação em curso)", "Reason (e.g. payment dispute, verification in progress)"), confirm: tr("Reter", "Hold"), danger: true });
        if (!reason) return;
      } else if (!(await modal({ title: tr("Libertar levantamentos?", "Release withdrawals?"), confirm: tr("Libertar", "Release") }))) return;
      try { await api.adminSetHold(hb.dataset.hold, on, reason); toast(on ? tr("Levantamentos retidos.", "Withdrawals on hold.") : tr("Levantamentos libertados.", "Withdrawals released.")); rerender(); }
      catch (err) { toast(err.message, "err"); }
      return;
    }
    const b = e.target.closest("[data-rec]"); if (!b) return;
    if (!(await modal({ title: tr(`Nova palavra-passe para ${b.dataset.name || "este utilizador"}?`, "New password for this user?"), body: tr("Contas com email recebem o link directamente por email. Só nas contas criadas por telefone é que o link te é mostrado, para o enviares ao dono da conta (confirma pelo número).", "Accounts with an email get the link by email. Only phone-created accounts show you the link, to send to the account owner (check the number)."), confirm: tr("Continuar", "Continue") }))) return;
    b.disabled = true;
    try {
      const r = await api.recoveryLink(b.dataset.rec);
      if (r.sent) { toast(tr(`Email de nova palavra-passe enviado para ${r.email}.`, `Password email sent to ${r.email}.`)); b.disabled = false; return; }
      const wa = String(b.dataset.phone || "").replace(/\D/g, "");
      const msg = tr(`Olá! Para criares uma nova palavra-passe na Uquiorrapay, abre este link (válido por pouco tempo):\n${r.link}`, `Hi! To set a new Uquiorrapay password open this link:\n${r.link}`);
      const wrap = document.createElement("div");
      wrap.className = "modal-wrap";
      wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><h3>${tr("Link de nova senha", "Password link")}</h3>
        <p class="muted small">${esc(r.email)}</p>
        <textarea class="input" rows="4" readonly>${esc(r.link)}</textarea>
        <div class="modal-actions">
          <button class="btn btn-ghost-dark" data-x="close">${tr("Fechar", "Close")}</button>
          <button class="btn btn-soft" data-x="copy">${ICON.copy} ${tr("Copiar", "Copy")}</button>
          ${wa ? `<a class="btn btn-green" target="_blank" rel="noopener" href="https://wa.me/${wa.length === 9 ? "258" + wa : wa}?text=${encodeURIComponent(msg)}">${ICON.whats} WhatsApp</a>` : ""}
        </div></div>`;
      document.body.appendChild(wrap);
      wrap.addEventListener("click", (ev) => {
        const x = ev.target.closest("[data-x]");
        if (x?.dataset.x === "copy") copyText(r.link);
        if (x?.dataset.x === "close" || ev.target === wrap) wrap.remove();
      });
    } catch (err) { toast(err.message, "err"); }
    b.disabled = false;
  };
  box.onchange = async (e) => {
    const r = e.target.dataset.role; if (!r) return;
    try { await api.setRole(e.target.closest("[data-id]").dataset.id, r, e.target.checked); toast(tr("Papel actualizado.", "Role updated.")); }
    catch (err) { toast(err.message, "err"); e.target.checked = !e.target.checked; }
  };
}

async function definicoes(box, _q, alive) {
  const [s, gws] = await Promise.all([api.settings(), api.gatewayStatus().catch(() => null)]);
  if (!alive()) return;
  const gw = s.gateway || {};
  const rates = s.rates || {};
  const mp = s.payment_mpesa || {}, em = s.payment_emola || {}, pp = s.payment_paypal || {};
  const ai = s.ai || {};
  box.innerHTML = `<form id="sf" class="form settings">
    <div class="panel"><h3>${tr("Comissão e garantia", "Commission & guarantee")}</h3>
      <label>${tr("Dias de garantia (só nos produtos em que o produtor activa a garantia)", "Guarantee days (only on products where the creator turns it on)")}<input class="input" name="guarantee_days" type="number" min="0" max="60" value="${esc(s.guarantee_days ?? 3)}"></label>
      <p class="small muted">${tr("Sem garantia, o valor da venda fica disponível na hora na carteira do produtor. Com garantia, fica retido estes dias.", "Without a guarantee, the sale amount is available right away in the creator's wallet. With a guarantee, it is held for these days.")}</p>
      <label>${tr("Comissão da plataforma (%)", "Platform commission (%)")}<input class="input" name="commission_pct" type="number" min="0" max="90" step="0.5" value="${esc(s.commission_pct ?? 9.5)}"></label></div>
    <div class="panel"><h3>${tr("Câmbios (quantos MZN vale 1 unidade)", "Exchange rates (MZN per unit)")}</h3>
      <div class="three">${["USD", "BRL", "ZAR", "EUR"].map((c) => `<label>1 ${c} =<input class="input" name="rate_${c}" type="number" step="0.01" min="0.01" value="${esc(rates[c] ?? "")}"></label>`).join("")}</div></div>
    <div class="panel"><h3>${tr("Receber pagamentos", "Receiving payments")}</h3>
      <p class="small muted">${tr("Aparecem nas instruções de pagamento do cliente. Deixa em branco para a equipa contactar o cliente.", "Shown in the customer's payment instructions. Leave blank for the team to contact the customer.")}</p>
      <div class="two"><label>${tr("Número M-Pesa", "M-Pesa number")}<input class="input" name="mpesa_number" value="${esc(mp.number || "")}"></label><label>${tr("Nome do titular M-Pesa", "M-Pesa account name")}<input class="input" name="mpesa_name" value="${esc(mp.name || "")}"></label></div>
      <div class="two"><label>${tr("Número e-Mola", "e-Mola number")}<input class="input" name="emola_number" value="${esc(em.number || "")}"></label><label>${tr("Nome do titular e-Mola", "e-Mola account name")}<input class="input" name="emola_name" value="${esc(em.name || "")}"></label></div>
      <label>${tr("Email PayPal", "PayPal email")}<input class="input" name="paypal_email" type="email" value="${esc(pp.email || "")}"></label></div>
    <div class="panel"><h3>${tr("Pixels de anúncios", "Ad pixels")}</h3>
      <p class="small muted">${tr("Mede visitas, inícios de compra e vendas para os teus anúncios. Cola só o ID; deixa em branco para desligar. Os produtores podem pôr o pixel deles em cada produto.", "Measures visits, checkouts and sales for your ads. Paste the ID only; leave blank to turn off.")}</p>
      <div class="three">
        <label>${tr("Pixel do Meta (Facebook/Instagram)", "Meta pixel (Facebook/Instagram)")}<input class="input mono" name="px_meta" inputmode="numeric" pattern="[0-9]{10,20}" placeholder="123456789012345" value="${esc((s.tracking || {}).meta_pixel || "")}"></label>
        <label>${tr("Pixel do TikTok", "TikTok pixel")}<input class="input mono" name="px_tiktok" pattern="[A-Za-z0-9]{10,30}" placeholder="C0ABCDEF12345" value="${esc((s.tracking || {}).tiktok_pixel || "")}"></label>
        <label>Google Analytics 4<input class="input mono" name="px_ga" pattern="G-[A-Za-z0-9]{4,20}" placeholder="G-XXXXXXX" value="${esc((s.tracking || {}).ga4 || "")}"></label>
      </div></div>
    <div class="panel"><h3>📲 ${tr("App Android (APK)", "Android app (APK)")}</h3>
      <p class="small muted">${tr("O ficheiro fica disponível em", "The file is available at")} <a href="#/app">uquiorrapay.com/#/app</a> ${tr("e na página inicial. Para atualizar a app, envia o novo APK (assinado com a mesma chave).", "and on the home page. To update, upload the new APK (signed with the same key).")}</p>
      ${(s.android_apk || {}).url ? `<p class="small">✅ ${tr("Versão", "Version")} <b>${esc(s.android_apk.version || "—")}</b> · ${(Number(s.android_apk.size || 0) / 1048576).toFixed(1)} MB · ${esc(String(s.android_apk.updated_at || "").slice(0, 10))} · <a href="${esc(s.android_apk.url)}">${tr("baixar", "download")}</a></p>` : `<p class="small muted">${tr("Ainda não enviaste o APK.", "No APK uploaded yet.")}</p>`}
      <div class="two"><label>${tr("Ficheiro .apk ou .zip do PWABuilder", ".apk or PWABuilder .zip")}<input class="input" id="apkFile" type="file"></label>
        <label>${tr("Versão", "Version")}<input class="input" id="apkVer" maxlength="20" placeholder="1.0.0" value="${esc((s.android_apk || {}).version || "")}"></label></div>
      <button type="button" class="btn btn-sm btn-green" id="apkUp">⬆ ${tr("Enviar APK", "Upload APK")}</button></div>
    <div class="panel gw-set"><h3>${tr("Pagamento automático", "Automatic payment")}</h3>
      <p class="small muted">${tr("Podes ligar vários fornecedores. O site usa o primeiro da lista que estiver disponível; se falhar, passa automaticamente ao seguinte. Se nenhum funcionar, o cliente paga pelo método manual. As chaves ficam encriptadas no servidor.", "You can enable several providers. The site uses the first available one; if it fails it moves to the next automatically. If none work, the customer pays manually. Keys are stored encrypted on the server.")}</p>
      <label>${tr("Ordem de preferência", "Preference order")}<select class="input" name="gw_order">${[
        ["pagar,e2payments,paysuite", "Pagar.co.mz → e2Payments → PaySuite"],
        ["e2payments,pagar,paysuite", "e2Payments → Pagar.co.mz → PaySuite"],
        ["paysuite,pagar,e2payments", "PaySuite → Pagar.co.mz → e2Payments"],
        ["paysuite,e2payments,pagar", "PaySuite → e2Payments → Pagar.co.mz"],
        ["pagar,paysuite,e2payments", "Pagar.co.mz → PaySuite → e2Payments"],
        ["e2payments,paysuite,pagar", "e2Payments → PaySuite → Pagar.co.mz"],
      ].map(([v, l]) => `<option value="${v}" ${(gw.order || ["pagar", "e2payments", "paysuite"]).join(",") === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
      ${(() => {
        const st = (k) => gws?.[k + "_set"] ? `<span class="badge st-approved">${tr("guardada", "saved")}</span>` : `<span class="badge">${tr("vazia", "empty")}</span>`;
        const key = (name, label, ph = "") => `<label>${label} ${st(name)}<input class="input" name="${name}" type="password" autocomplete="off" placeholder="${gws?.[name + "_set"] ? "••••••••" : ph}"></label>`;
        const hook = `${siteUrl()}api/pagar-webhook`;
        return `
        <details class="gw-box" ${gw.pagar_enabled ? "open" : ""}><summary><b>Pagar.co.mz</b> <small>M-Pesa · e-Mola</small>${gw.pagar_enabled ? `<span class="badge st-approved">${tr("ligado", "on")}</span>` : ""}</summary>
          <label class="switch"><input type="checkbox" name="pagar_enabled" ${gw.pagar_enabled ? "checked" : ""}><span>${tr("Ligar Pagar.co.mz", "Enable Pagar.co.mz")}</span></label>
          <div class="two">${key("pagar_api_key", tr("Chave da API", "API key"), "sk_live_…")}${key("pagar_signing_secret", tr("Segredo de assinatura", "Signing secret"))}</div>
          ${key("pagar_webhook_secret", tr("Segredo do webhook", "Webhook secret"))}
          <p class="small muted">${tr("No painel da Pagar, em Webhooks, cola este endereço:", "In the Pagar dashboard, under Webhooks, paste this URL:")} <code class="gw-url">${esc(hook)}</code> <button type="button" class="link-btn" data-copyurl="${esc(hook)}">${tr("Copiar", "Copy")}</button><br>${tr("Valores entre 20 e 40 000 MZN. Acima disso o site passa ao fornecedor seguinte.", "Amounts between 20 and 40,000 MZN. Above that the next provider is used.")}</p>
          <label>${tr("Tokens de verificação do domínio (Frontend e Backend)", "Domain verification tokens (Frontend and Backend)")}<textarea class="input mono" name="pagar_verification" rows="3" placeholder="pagar-verification=dom_…">${esc(typeof s.pagar_verification === "string" ? s.pagar_verification : "")}</textarea></label>
          <p class="small muted">${tr("Copia os tokens do painel da Pagar (Endereços → Token de verificação) e cola aqui, um por linha. O site publica-os sozinho em", "Copy the tokens from the Pagar dashboard and paste them here, one per line. The site publishes them at")} <code>${esc(siteUrl())}.well-known/pagar-verification.txt</code>. ${tr("Depois carrega em «Verificar» na Pagar.", "Then press “Verify” at Pagar.")}</p>
        </details>
        <details class="gw-box" ${gw.e2_enabled ? "open" : ""}><summary><b>e2Payments</b> <small>M-Pesa · e-Mola</small>${gw.e2_enabled ? `<span class="badge st-approved">${tr("ligado", "on")}</span>` : ""}</summary>
          <label class="switch"><input type="checkbox" name="e2_enabled" ${gw.e2_enabled ? "checked" : ""}><span>${tr("Ligar e2Payments", "Enable e2Payments")}</span></label>
          <div class="two">${key("e2_client_id", "Client ID")}${key("e2_client_secret", "Client Secret")}</div>
          <div class="two">${key("e2_mpesa_wallet", tr("ID da carteira M-Pesa (sem #)", "M-Pesa wallet ID (without #)"))}${key("e2_emola_wallet", tr("ID da carteira e-Mola (sem #)", "e-Mola wallet ID (without #)"))}</div>
          <p class="small muted">${tr("Encontras estes dados em e2payments.explicador.co.mz → Credenciais e Carteiras.", "Find these at e2payments.explicador.co.mz → Credentials and Wallets.")}</p>
        </details>
        <details class="gw-box" ${gw.paysuite_enabled ? "open" : ""}><summary><b>PaySuite</b> <small>M-Pesa · e-Mola · ${tr("cartão", "card")}</small>${gw.paysuite_enabled ? `<span class="badge st-approved">${tr("ligado", "on")}</span>` : ""}</summary>
          <label class="switch"><input type="checkbox" name="paysuite_enabled" ${gw.paysuite_enabled ? "checked" : ""}><span>${tr("Ligar PaySuite", "Enable PaySuite")}</span></label>
          ${key("paysuite_token", tr("Chave (token) da API", "API token"))}
        </details>
        <h4 class="gw-sub">🌍 ${tr("Pagamento internacional", "International payments")}</h4>
        <details class="gw-box" ${gw.paypal_enabled ? "open" : ""}><summary><b>PayPal</b> <small>${tr("conta PayPal · cartão Visa/Mastercard", "PayPal account · Visa/Mastercard card")}</small>${gw.paypal_enabled ? `<span class="badge st-approved">${gw.paypal_live ? tr("ligado (real)", "on (live)") : tr("ligado (teste)", "on (sandbox)")}</span>` : ""}</summary>
          <label class="switch"><input type="checkbox" name="paypal_enabled" ${gw.paypal_enabled ? "checked" : ""}><span>${tr("Ligar PayPal e cartão internacional", "Enable PayPal and international card")}</span></label>
          <label class="switch"><input type="checkbox" name="paypal_live" ${gw.paypal_live ? "checked" : ""}><span>${tr("Modo real (LIVE). Desligado = modo de teste (sandbox)", "Live mode. Off = sandbox test mode")}</span></label>
          <div class="two">${key("paypal_client_id", "Client ID")}${key("paypal_secret", "Secret")}</div>
          <p class="small muted">${tr("Onde encontrar: developer.paypal.com → entra com a conta PayPal Business → Apps & Credentials → escolhe <b>Live</b> (ou Sandbox para testar) → Create App → copia o Client ID e o Secret. O cliente paga em dólares (câmbio das definições) e pode usar cartão sem ter conta PayPal.", "Where: developer.paypal.com → sign in with your PayPal Business account → Apps & Credentials → choose <b>Live</b> (or Sandbox to test) → Create App → copy Client ID and Secret. Customers pay in USD and can use a card without a PayPal account.")}</p>
        </details>
        <p class="small muted">🇲🇿 ${tr("Cartão nacional: a Pagar.co.mz ainda só aceita M-Pesa e e-Mola, por isso no checkout aparece «Em breve».", "Local card: Pagar.co.mz only supports M-Pesa and e-Mola for now, so checkout shows “Coming soon”.")}</p>`;
      })()}
    </div>
    <div class="panel"><h3>${tr("Carteira e levantamentos", "Wallet & withdrawals")}</h3>
      <div class="two"><label>${tr("Dias extra de retenção para todas as vendas (0 = saque na hora)", "Extra hold days for all sales (0 = instant withdrawal)")}<input class="input" name="payout_hold_days" type="number" min="0" max="60" value="${esc(s.payout_hold_days ?? 0)}"></label>
      <label>${tr("Levantamento mínimo (MZN)", "Minimum withdrawal (MZN)")}<input class="input" name="min_withdrawal" type="number" min="0" step="50" value="${esc(s.min_withdrawal ?? 500)}"></label></div></div>
    <div class="panel"><h3>${tr("Apoio ao cliente", "Customer support")}</h3>
      <div class="two"><label>WhatsApp<input class="input" name="support_whatsapp" placeholder="+258 84 000 0000" value="${esc(s.support_whatsapp || "")}"></label><label>Email<input class="input" name="support_email" type="email" value="${esc(s.support_email || "")}"></label></div>
      <label>${tr("Link do grupo do WhatsApp", "WhatsApp group link")}<input class="input" name="whatsapp_group" type="url" placeholder="https://chat.whatsapp.com/…" value="${esc(typeof s.whatsapp_group === "string" ? s.whatsapp_group : "")}"></label>
      <p class="small muted">${tr("Ao tocar no botão verde do WhatsApp, o visitante escolhe: falar com o suporte ou entrar no grupo.", "Tapping the green WhatsApp button lets visitors choose: talk to support or join the group.")}</p></div>
    <div class="panel"><h3>${tr("Avisos por email", "Email notifications")}</h3>
      <p class="small muted">${tr(`Os avisos vão para <b>${esc(typeof s.admin_email === "string" ? s.admin_email : "")}</b>. Usa o Resend (resend.com): API Keys → Create API Key → cola aqui.`, `Alerts go to <b>${esc(typeof s.admin_email === "string" ? s.admin_email : "")}</b>. Uses Resend (resend.com): API Keys → Create API Key → paste here.`)}</p>
      <p class="small">${tr("Estado da chave", "Key status")}: ${gws?.resend_api_key_set ? `<span class="badge st-approved">${tr("guardada", "saved")}</span>` : `<span class="badge">${tr("não configurada", "not set")}</span>`}</p>
      <div class="two"><label>${tr("Chave da API do Resend", "Resend API key")}<input class="input" name="resend_api_key" type="password" autocomplete="off" placeholder="${gws?.resend_api_key_set ? "••••••••" : "re_…"}"></label>
        <label>${tr("Remetente", "Sender")}<input class="input" name="notify_from" value="${esc(typeof s.notify_from === "string" ? s.notify_from : "Uquiorrapay <onboarding@resend.dev>")}"></label></div>
      <div class="notif-grid">${[
        ["admin_orders", tr("Novo pedido (para mim)", "New order (to me)")],
        ["admin_sales", tr("Venda confirmada (para mim)", "Confirmed sale (to me)")],
        ["admin_withdrawals", tr("Pedido de levantamento (para mim)", "Withdrawal request (to me)")],
        ["producer_sales", tr("Venda (para o produtor)", "Sale (to the creator)")],
        ["buyer_access", tr("Acesso liberado (para o comprador)", "Access granted (to the buyer)")],
      ].map(([k, l]) => `<label class="switch"><input type="checkbox" name="nt_${k}" ${(s.notify || {})[k] !== false ? "checked" : ""}><span>${l}</span></label>`).join("")}</div>
      <p class="small muted">${tr("Até ligares o domínio uquiorrapay.com ao Resend, só chegam os emails enviados para o email da tua conta Resend (os do produtor e do comprador ficam à espera do domínio).", "Until uquiorrapay.com is verified in Resend, only emails to your Resend account address are delivered.")}</p>
      <button type="button" class="btn btn-sm btn-outline-green" id="ntest">${tr("Enviar email de teste", "Send test email")}</button></div>
    <div class="panel"><h3>${ICON.shield} ${tr("Verificação e conformidade (KYC)", "Verification & compliance (KYC)")}</h3>
      <label class="switch"><input type="checkbox" name="kyc_required" ${(s.kyc || {}).required_withdrawal !== false ? "checked" : ""}><span>${tr("Exigir identidade verificada para levantar dinheiro (recomendado)", "Require verified identity to withdraw (recommended)")}</span></label>
      <label>${tr("Prazo máximo de processamento dos levantamentos (dias)", "Maximum withdrawal processing time (days)")}<input class="input" name="kyc_days" type="number" min="1" max="15" value="${esc((s.kyc || {}).withdraw_days ?? 3)}"></label>
      <p class="small muted">${tr("Para reter levantamentos de uma conta suspeita (disputa, fraude, reclamações), usa «Reter levantamentos» em Utilizadores.", "To hold a suspicious account's withdrawals (dispute, fraud, complaints), use “Hold withdrawals” in Users.")}</p></div>
    <div class="panel ai-set"><h3>${SPARK} ${tr("Inteligência artificial", "Artificial intelligence")}</h3>
      <p class="small muted">${tr("Usa o Claude (Anthropic). Cria a chave em console.anthropic.com → API Keys e cola aqui. Fica guardada encriptada no servidor e nunca aparece no site.", "Uses Claude (Anthropic). Create the key at console.anthropic.com → API Keys and paste it here. It's stored encrypted on the server and never shown on the site.")}</p>
      <p class="small">${tr("Estado da chave", "Key status")}: ${gws?.anthropic_api_key_set ? `<span class="badge st-approved">${tr("guardada", "saved")}</span>` : `<span class="badge">${tr("não configurada — a IA está parada", "not set — AI is off")}</span>`}</p>
      <label>${tr("Chave da API da Anthropic", "Anthropic API key")}<input class="input" name="anthropic_api_key" type="password" autocomplete="off" placeholder="${gws?.anthropic_api_key_set ? "••••••••" : "sk-ant-…"}"></label>
      <div class="notif-grid">
        <label class="switch"><input type="checkbox" name="ai_assistant" ${ai.assistant === true ? "checked" : ""}><span><b>${tr("Respostas por IA", "AI answers")}</b> — ${tr("assistente no site (dúvidas e recomendações) e sugestões de títulos/descrições para produtores", "site assistant (questions and recommendations) and title/description suggestions for creators")}</span></label>
        <label class="switch"><input type="checkbox" name="ai_review" ${ai.review !== false ? "checked" : ""}><span><b>${tr("Revisão por IA", "AI review")}</b> — ${tr("analisa cada produto enviado para análise", "analyses every submitted product")}</span></label>
        <label class="switch"><input type="checkbox" name="ai_auto_approve" ${ai.auto_approve !== false ? "checked" : ""}><span>${tr("Aprovar automaticamente produtos muito bem feitos (sem nenhum alerta)", "Auto-approve excellent products (no alerts at all)")}</span></label>
        <label class="switch"><input type="checkbox" name="ai_auto_reject" ${ai.auto_reject_severe !== false ? "checked" : ""}><span>${tr("Rejeitar automaticamente casos graves (adulto, ilegal, golpes, ódio)", "Auto-reject severe cases (adult, illegal, scams, hate)")}</span></label>
        <label class="switch"><input type="checkbox" name="ai_auto_media" ${ai.auto_approve_media === true ? "checked" : ""}><span>${tr("Permitir aprovação automática de produtos só com vídeo/áudio (a IA não vê vídeos — não recomendado)", "Allow auto-approval of video/audio-only products (the AI can't watch videos — not recommended)")}</span></label>
      </div>
      <div class="three">
        <label>${tr("Nota mínima para aprovar sozinho", "Minimum score to auto-approve")}<input class="input" name="ai_approve_min" type="number" min="70" max="100" value="${esc(ai.approve_min ?? 90)}"></label>
        <label>${tr("Mensagens por pessoa/dia", "Messages per person/day")}<input class="input" name="ai_chat_daily" type="number" min="1" max="500" value="${esc(ai.chat_daily ?? 30)}"></label>
        <label>${tr("Limite total por dia (custos)", "Total daily limit (cost)")}<input class="input" name="ai_daily_cap" type="number" min="10" max="100000" value="${esc(ai.daily_cap ?? 1500)}"></label>
      </div>
      <p class="small muted">${tr("Custo: cada revisão custa poucos cêntimos de dólar (mais com PDFs grandes); cada resposta do assistente custa menos de 1 cêntimo. Os limites protegem contra abusos. Carrega saldo em console.anthropic.com → Billing.", "Cost: each review is a few US cents (more with large PDFs); each assistant reply is under 1 cent. Limits protect against abuse. Add credit at console.anthropic.com → Billing.")}</p>
    </div>
    <div class="panel"><h3>${tr("Segurança e acesso", "Security & sign-in")}</h3>
      <label>${tr("Chave do site Cloudflare Turnstile (anti-robô)", "Cloudflare Turnstile site key (anti-bot)")}<input class="input" name="turnstile_site_key" autocomplete="off" value="${esc(typeof s.turnstile_site_key === "string" ? s.turnstile_site_key : "")}" placeholder="0x4AAAAAAA…"></label>
      <p class="small muted">${tr("Cola aqui a chave do SITE (pública). A chave SECRETA vai só no Supabase → Authentication → Attack Protection. Guarda primeiro aqui, depois ativa no Supabase.", "Paste the SITE (public) key here. The SECRET key goes only in Supabase → Authentication → Attack Protection. Save here first, then enable in Supabase.")}</p>
      <label class="switch"><input type="checkbox" name="google_login" ${s.google_login === true ? "checked" : ""}><span>${tr("Mostrar «Continuar com Google» (ativa primeiro o Google no Supabase)", "Show “Continue with Google” (enable Google in Supabase first)")}</span></label></div>
    <button class="btn btn-green">${tr("Guardar definições", "Save settings")}</button>
  </form>`;
  box.querySelectorAll("[data-copyurl]").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copyurl)));
  document.getElementById("ntest").addEventListener("click", async (e) => {
    const b = e.currentTarget; b.disabled = true;
    try {
      const r = await api.notifyTest();
      if (r?.ok) toast(tr("Email de teste enviado! Vê a tua caixa de entrada (e o spam).", "Test email sent! Check your inbox (and spam)."));
      else toast(tr("Não foi enviado: ", "Not sent: ") + (r?.error || r?.message || "?"), "err");
    } catch (err) { toast(err.message, "err"); }
    b.disabled = false;
  });
  document.getElementById("apkUp")?.addEventListener("click", async (e) => {
    let file = document.getElementById("apkFile").files[0];
    const btn = e.currentTarget;
    if (!file) { toast(tr("Escolhe o ficheiro .apk (ou o .zip do PWABuilder).", "Choose the .apk file (or the PWABuilder .zip)."), "err"); return; }
    btn.disabled = true; btn.textContent = tr("A preparar…", "Preparing…");
    try {
      // O PWABuilder entrega um .zip: tiramos o .apk de lá de dentro automaticamente
      if (!(await isZip(file))) throw new Error(tr("Este ficheiro não é um APK. Escolhe o .apk (ou o .zip que o PWABuilder deu).", "This isn't an APK. Choose the .apk (or the PWABuilder .zip)."));
      const inner = await apkFromZip(file);
      if (inner === null) throw new Error(tr("Não encontrei nenhum .apk dentro do .zip.", "No .apk found inside the .zip."));
      if (inner !== "self") file = inner;
      if (file.size > 50 * 1048576) throw new Error(tr("APK demasiado grande (máx. 50 MB).", "APK too large (max 50 MB)."));
      btn.textContent = tr("A enviar…", "Uploading…");
      const job = trackUpload("uquiorrapay.apk", file.size);
      try { await api.uploadApk(file, document.getElementById("apkVer").value.trim(), job.progress); }
      catch (err) { job.fail?.(err.message); throw err; }
      job.ok(tr("Concluído ✓", "Done ✓"));
      state.settings = { ...state.settings, ...(await api.settings()) };
      toast(tr("APK publicado! Já aparece em «Baixar a app».", "APK published!")); rerender();
    } catch (err) { if (!err.cancelled) toast(err.message, "err"); btn.disabled = false; btn.textContent = tr("Enviar APK", "Upload APK"); }
  });
  document.getElementById("sf").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const btn = e.target.querySelector("button"); btn.disabled = true;
    try {
      const newRates = { MZN: 1 };
      for (const c of ["USD", "BRL", "ZAR", "EUR"]) newRates[c] = Number(f[`rate_${c}`]) || rates[c];
      await Promise.all([
        api.saveSetting("commission_pct", Number(f.commission_pct)),
        api.saveSetting("rates", newRates),
        api.saveSetting("payment_mpesa", { number: f.mpesa_number.trim(), name: f.mpesa_name.trim() }),
        api.saveSetting("payment_emola", { number: f.emola_number.trim(), name: f.emola_name.trim() }),
        api.saveSetting("payment_paypal", { email: f.paypal_email.trim() }),
        api.saveSetting("support_whatsapp", f.support_whatsapp.trim()),
        api.saveSetting("support_email", f.support_email.trim()),
        api.saveSetting("pagar_verification", (String(f.pagar_verification || "").match(/dom_[A-Za-z0-9_-]{10,80}/g) || []).join("\n")),
        api.saveSetting("whatsapp_group", /^https:\/\/chat\.whatsapp\.com\/[A-Za-z0-9]+$/.test(String(f.whatsapp_group || "").trim()) ? String(f.whatsapp_group).trim() : ""),
        api.saveSetting("payout_hold_days", Number(f.payout_hold_days || 0)),
        api.saveSetting("guarantee_days", Number(f.guarantee_days || 0)),
        api.saveSetting("min_withdrawal", Number(f.min_withdrawal || 0)),
        api.saveSetting("gateway", { ...gw, paysuite_enabled: Boolean(f.paysuite_enabled), pagar_enabled: Boolean(f.pagar_enabled), e2_enabled: Boolean(f.e2_enabled), paypal_enabled: Boolean(f.paypal_enabled), paypal_live: Boolean(f.paypal_live), order: String(f.gw_order || "pagar,e2payments,paysuite").split(",") }),
        api.saveSetting("turnstile_site_key", String(f.turnstile_site_key || "").trim()),
        api.saveSetting("tracking", { meta_pixel: String(f.px_meta || "").replace(/\D/g, "").slice(0, 20), tiktok_pixel: String(f.px_tiktok || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 30), ga4: /^G-[A-Z0-9]{4,20}$/i.test(String(f.px_ga || "").trim()) ? String(f.px_ga).trim().toUpperCase() : "" }),
        api.saveSetting("google_login", Boolean(f.google_login)),
        api.saveSetting("notify_from", String(f.notify_from || "").trim() || "Uquiorrapay <onboarding@resend.dev>"),
        api.saveSetting("notify", Object.fromEntries(["admin_orders", "admin_sales", "admin_withdrawals", "producer_sales", "buyer_access"].map((k) => [k, Boolean(f["nt_" + k])]))),
        api.saveSetting("kyc", { ...(s.kyc || {}), required_withdrawal: Boolean(f.kyc_required), withdraw_days: Math.min(15, Math.max(1, Number(f.kyc_days) || 3)) }),
        api.saveSetting("ai", { ...ai, assistant: Boolean(f.ai_assistant), review: Boolean(f.ai_review), auto_approve: Boolean(f.ai_auto_approve), auto_reject_severe: Boolean(f.ai_auto_reject), auto_approve_media: Boolean(f.ai_auto_media),
          approve_min: Math.min(100, Math.max(70, Number(f.ai_approve_min) || 90)), chat_daily: Math.max(1, Number(f.ai_chat_daily) || 30), daily_cap: Math.max(10, Number(f.ai_daily_cap) || 1500) }),
      ]);
      if (f.anthropic_api_key && f.anthropic_api_key.trim()) {
        if (!/^sk-ant-/.test(f.anthropic_api_key.trim())) throw new Error(tr("A chave da Anthropic começa por «sk-ant-».", "The Anthropic key starts with “sk-ant-”."));
        await api.setGatewaySecret("anthropic_api_key", f.anthropic_api_key.trim()); e.target.anthropic_api_key.value = "";
      }
      if (f.resend_api_key && f.resend_api_key.trim()) { await api.setGatewaySecret("resend_api_key", f.resend_api_key.trim()); e.target.resend_api_key.value = ""; }
      const GW_KEYS = ["paysuite_token", "pagar_api_key", "pagar_signing_secret", "pagar_webhook_secret", "e2_client_id", "e2_client_secret", "e2_mpesa_wallet", "e2_emola_wallet", "paypal_client_id", "paypal_secret"];
      let gwSaved = false;
      for (const k of GW_KEYS) {
        let v = String(f[k] || "").trim();
        if (!v) continue;
        if (/wallet/.test(k)) v = v.replace(/^#/, "");
        await api.setGatewaySecret(k, v); e.target[k].value = ""; gwSaved = true;
      }
      state.settings = { ...state.settings, ...(await api.settings()) };
      toast(tr("Definições guardadas.", "Settings saved."));
      if (f.anthropic_api_key || f.resend_api_key || gwSaved) setTimeout(rerender, 400);
    } catch (err) { toast(err.message, "err"); }
    btn.disabled = false;
  });
}

export { go, isAdmin };

// ---------- APK: aceita o .apk ou o .zip do PWABuilder (extrai o .apk sem bibliotecas) ----------
async function isZip(file) {
  const h = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  return h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04; // «PK» (APK e ZIP têm este início)
}
async function apkFromZip(file) {
  const buf = new Uint8Array(await file.arrayBuffer()), dv = new DataView(buf.buffer);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error("ZIP inválido");
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const dec = new TextDecoder();
  let isApk = false;
  for (let n = 0; n < count && dv.getUint32(p, true) === 0x02014b50; n++) {
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    const name = dec.decode(buf.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (name === "AndroidManifest.xml") isApk = true;
    if (!/\.apk$/i.test(name) || /\/\._|__MACOSX/.test(name)) continue;
    const start = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true);
    const data = buf.subarray(start, start + csize);
    let out;
    if (method === 0) out = data;
    else if (method === 8) out = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
    else throw new Error("ZIP com compressão não suportada");
    if (usize && out.length !== usize) throw new Error("ZIP danificado");
    return new File([out], "uquiorrapay.apk", { type: "application/vnd.android.package-archive" });
  }
  return isApk ? "self" : null; // o próprio ficheiro já é um APK
}
