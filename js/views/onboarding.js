// Boas-vindas «Vamos preparar a tua conta» — assistente de 4 passos (uma pergunta de cada vez), aparece uma vez
import { api } from "../api.js?v=202610080932";
import { state, tr, esc, photo, PHOTOS, brandHTML, isAdmin, toast, ICON } from "../ui.js?v=202610080932";
import { go } from "../app.js?v=202610080932";

export const OB = () => ({
  source: [["instagram", "Instagram", "📸"], ["facebook", "Facebook", "👍"], ["tiktok", "TikTok", "🎵"], ["whatsapp", "WhatsApp", "💬"], ["google", tr("Google / Pesquisa", "Google / Search"), "🔎"], ["youtube", "YouTube", "▶️"], ["amigo", tr("Indicação de amigo", "Friend referral"), "🤝"], ["outro", tr("Outro", "Other"), "✨"]],
  sells: [["sim", tr("Sim, já vendo", "Yes, I already sell"), "💼", tr("Já tenho produtos ou clientes", "I already have products or customers")], ["nao", tr("Não, é o meu início", "No, I'm just starting"), "🌱", tr("Quero começar do zero", "I want to start from scratch")]],
  stage: [["zero", tr("Ainda não fiz nenhuma venda", "I haven't made a sale yet")], ["algumas", tr("Algumas vendas, mas não frequentes", "A few sales, not frequent")], ["recorrentes", tr("Vendas recorrentes todos os meses", "Recurring sales every month")], ["vivo", tr("Já vivo de produtos digitais", "I already live off digital products")], ["alto", tr("Faturo alto (6 dígitos ou mais)", "High revenue (6 digits or more)")]],
  goal: [["conhecimento", tr("Monetizar o meu conhecimento", "Monetise my knowledge"), "🎓"], ["renda", tr("Gerar uma renda extra", "Earn extra income"), "💰"], ["emprego", tr("Substituir o meu emprego", "Replace my job"), "🚀"], ["escalar", tr("Escalar um negócio existente", "Scale an existing business"), "📈"], ["marca", tr("Divulgar a minha marca ou serviço", "Promote my brand or service"), "📣"], ["comprar", tr("Só quero comprar e aprender", "I just want to buy and learn"), "🛒"]],
  product: [["curso", tr("Curso online (vídeos)", "Online course (videos)"), "🎬"], ["ebook", tr("E-book / PDF", "E-book / PDF"), "📘"], ["mentoria", tr("Mentoria ou consultoria", "Mentoring or consulting"), "🧭"], ["templates", tr("Templates ou ferramentas", "Templates or tools"), "🧩"], ["comunidade", tr("Comunidade ou assinatura", "Community or membership"), "👥"], ["nao_sei", tr("Ainda não sei", "Not sure yet"), "🤔"]],
});

// Rotas da área interna que pedem o questionário antes de abrir
const GATED = ["painel", "meus-cursos", "produtor", "carteira"];
// Questionário de entrada desligado a pedido do dono: ninguém é interrompido ao entrar
const ONBOARDING_ON = false;
export function needsOnboarding(path) {
  return ONBOARDING_ON && Boolean(state.user && state.profile && !state.profile.onboarded_at && !isAdmin() && !state.mfaPending && GATED.includes(path.split("/")[1]));
}

const safeNext = (n) => (/^#\/[\w\-/?=&%.]*$/.test(n || "") && !/boas-vindas/.test(n) ? n : "");

export async function onboarding(main, _p, query) {
  const next = safeNext(query.next);
  if (!ONBOARDING_ON || state.profile?.onboarded_at) { go(next || "#/painel"); return; }
  const o = OB();
  const first = esc(String(state.profile?.full_name || "").split(" ")[0] || "");
  const a = { source: "", source_other: "", sells: "", stage: "", goal: "", product: "" };
  // passos que existem conforme as respostas
  const steps = () => ["source", "sells", ...(a.sells === "sim" ? ["stage"] : []), "goal", ...(a.goal === "comprar" ? [] : ["product"])];
  let cur = "source";

  const Q = {
    source: [tr("Como soubeste da Uquiorrapay?", "How did you hear about Uquiorrapay?"), tr("Ajuda-nos a perceber onde nos encontraste.", "Help us understand where you found us.")],
    sells: [tr("Já vendes produtos digitais?", "Do you already sell digital products?"), tr("Não há resposta certa — é só para te mostrarmos o caminho ideal.", "There's no right answer — it's just to show you the ideal path.")],
    stage: [tr("Em que fase estão as tuas vendas?", "What stage are your sales at?"), tr("Assim adaptamos as dicas ao teu nível.", "So we can adapt tips to your level.")],
    goal: [tr("Qual é o teu principal objetivo?", "What is your main goal?"), tr("Escolhe o que mais se parece contigo.", "Pick the one that fits you best.")],
    product: [tr("Que tipo de produto queres vender?", "What kind of product do you want to sell?"), tr("Podes mudar de ideias mais tarde.", "You can change your mind later.")],
  };
  const tile = (name, k, l, ic, sub = "") => `<button type="button" class="obw-tile ${a[name] === k ? "on" : ""}" data-n="${name}" data-v="${k}" aria-pressed="${a[name] === k}">
      <span class="obw-ic">${ic}</span><span class="obw-tx"><b>${esc(l)}</b>${sub ? `<small>${esc(sub)}</small>` : ""}</span><i class="obw-ck">${ICON.check}</i></button>`;
  const body = () => {
    if (cur === "source") return `<div class="obw-grid g4">${o.source.map(([k, l, ic]) => tile("source", k, l, ic)).join("")}</div>
      <input class="input obw-other" name="source_other" maxlength="80" value="${esc(a.source_other)}" placeholder="${tr("Onde nos conheceste? (opcional)", "Where did you find us? (optional)")}" ${a.source === "outro" ? "" : "hidden"}>`;
    if (cur === "sells") return `<div class="obw-grid g2">${o.sells.map(([k, l, ic, sub]) => tile("sells", k, l, ic, sub)).join("")}</div>`;
    if (cur === "stage") return `<div class="obw-ladder">${o.stage.map(([k, l], i) => tile("stage", k, l, `<em>${i + 1}</em>`)).join("")}</div>`;
    if (cur === "goal") return `<div class="obw-grid g3">${o.goal.map(([k, l, ic]) => tile("goal", k, l, ic)).join("")}</div>`;
    return `<div class="obw-grid g3">${o.product.map(([k, l, ic]) => tile("product", k, l, ic)).join("")}</div>`;
  };

  const draw = () => {
    const list = steps(), i = list.indexOf(cur), last = i === list.length - 1;
    const pct = Math.round(((i + (a[cur] ? 1 : 0)) / list.length) * 100);
    main.innerHTML = `<section class="obw">
      <aside class="obw-side" style="--obw-bg:url('${photo(PHOTOS.hero, 1000)}')">
        <div class="obw-side-in">
          ${brandHTML()}
          <h2>${first ? tr(`Bem-vindo, ${first}!`, `Welcome, ${first}!`) : tr("Bem-vindo!", "Welcome!")}</h2>
          <p>${tr("Vamos preparar a tua conta. São só algumas perguntas rápidas.", "Let's set up your account. Just a few quick questions.")}</p>
          <ul>${[tr("Recomendações à tua medida", "Recommendations that fit you"), tr("Dicas para a primeira venda", "Tips for your first sale"), tr("Menos de 1 minuto", "Less than a minute")].map((t) => `<li>${ICON.check}<span>${t}</span></li>`).join("")}</ul>
        </div>
      </aside>
      <div class="obw-main">
        <div class="obw-top">
          <span class="obw-step">${tr(`Pergunta ${i + 1} de ${list.length}`, `Question ${i + 1} of ${list.length}`)}</span>
          <div class="obw-bar"><span style="width:${pct}%"></span></div>
          <div class="obw-dots">${list.map((s, j) => `<i class="${j < i ? "done" : j === i ? "cur" : ""}"></i>`).join("")}</div>
        </div>
        <form id="ob" class="obw-card" novalidate>
          <h1>${Q[cur][0]}</h1>
          <p class="obw-sub">${Q[cur][1]}</p>
          ${body()}
          <p class="obw-err" id="obErr" role="alert"></p>
          <div class="obw-nav">
            ${i > 0 ? `<button type="button" class="btn btn-ghost-dark" id="obBack">← ${tr("Voltar", "Back")}</button>` : "<span></span>"}
            <button class="btn ${last ? "btn-primary" : "btn-green"} btn-lg" id="${last ? "obGo" : "obNext"}">${last ? `${tr("Concluir e entrar", "Finish and enter")} ${ICON.arrow}` : `${tr("Continuar", "Continue")} ${ICON.arrow}`}</button>
          </div>
        </form>
      </div>
    </section>`;
    const f = document.getElementById("ob"), err = document.getElementById("obErr");
    f.querySelectorAll(".obw-tile").forEach((b) => b.addEventListener("click", () => {
      a[b.dataset.n] = b.dataset.v;
      if (b.dataset.n === "sells" && a.sells !== "sim") a.stage = "";
      if (b.dataset.n === "goal" && a.goal === "comprar") a.product = "";
      draw(); // actualiza a marca, a barra de progresso e o botão (o nº de perguntas pode mudar)
      if (a.source === "outro" && cur === "source") { document.querySelector(".obw-other")?.focus(); return; }
      // avança sozinho depois de escolher (exceto no último passo)
      if (steps().indexOf(cur) < steps().length - 1) setTimeout(() => document.getElementById("ob")?.requestSubmit(), 220);
    }));
    f.querySelector(".obw-other")?.addEventListener("input", (e) => { a.source_other = e.target.value; });
    document.getElementById("obBack")?.addEventListener("click", () => { cur = steps()[steps().indexOf(cur) - 1]; draw(); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (!a[cur]) {
        err.textContent = { source: tr("Escolhe onde nos conheceste.", "Choose where you found us."), sells: tr("Diz-nos se já vendes produtos digitais.", "Tell us if you already sell digital products."), stage: tr("Escolhe a fase das tuas vendas.", "Choose your sales stage."), goal: tr("Escolhe o teu objetivo.", "Choose your goal."), product: tr("Escolhe o tipo de produto.", "Choose the product type.") }[cur];
        f.querySelector(".obw-card, .obw-grid, .obw-ladder")?.classList.add("shake"); setTimeout(() => f.querySelector(".shake")?.classList.remove("shake"), 400);
        return;
      }
      const list = steps(), i = list.indexOf(cur);
      if (i < list.length - 1) { cur = list[i + 1]; draw(); return; }
      const btn = document.getElementById("obGo"); btn.disabled = true; btn.classList.add("busy");
      try {
        await api.saveOnboarding({ ...a, product: a.goal === "comprar" ? "comprar" : a.product });
        state.profile = { ...state.profile, onboarded_at: new Date().toISOString() };
        toast(tr("Tudo pronto! Bem-vindo à Uquiorrapay.", "All set! Welcome to Uquiorrapay."));
        go(a.goal === "comprar" && (!next || next === "#/painel") ? "#/cursos" : next || "#/painel");
      } catch (e2) { err.textContent = e2.message; btn.disabled = false; btn.classList.remove("busy"); }
    });
  };
  draw();
}
