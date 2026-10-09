// Conta: entrar, registar, perfil, checkout, os meus cursos, aulas e pedido para ser produtor.
import { api } from "../api.js?v=202610091700";
import { initiateCheckout, purchase, registration } from "../track.js?v=202610091700";
import { state, tr, esc, mzn, money, priceHTML, offerPriceHTML, hasStrike, cleanBonuses, coverHTML, videoEmbed, toast, modal, emptyState, errorBox, statusBadge, methodLabel, date, ICON, isProducer, isAdmin, loading, dashShell, getRef, gDays, supportOk, brandHTML, copyText, CONFIG, intlPrice, usdFmt, usdRate, supportWa, hasGuarantee, TYPES, typeLabel } from "../ui.js?v=202610091700";
import { go, refreshUser, rerender } from "../app.js?v=202610091700";
import { mountCaptcha, captchaOn } from "../captcha.js?v=202610091700";
const needCaptcha = () => toast(tr("Confirma que não és um robô.", "Please confirm you're not a robot."), "err");

const afterLogin = () => {
  let next = null;
  try { next = sessionStorage.getItem("uq_after_login"); sessionStorage.removeItem("uq_after_login"); } catch {}
  return next;
};

// Botão «Reenviar email de confirmação» (espera 60 s entre envios)
function bindResend(btn, email) {
  if (!btn) return;
  btn.addEventListener("click", async () => {
    btn.disabled = true;
    try {
      await api.resendConfirmation(email);
      toast(tr("Email de confirmação reenviado. Vê também o spam.", "Confirmation email sent again. Check spam too."));
      let n = 60; const t0 = btn.textContent;
      const iv = setInterval(() => { btn.textContent = `${t0} (${--n}s)`; if (n <= 0) { clearInterval(iv); btn.textContent = t0; btn.disabled = false; } }, 1000);
    } catch (err) { toast(/rate|seconds|limit/i.test(err.message) ? tr("Espera um minuto antes de pedir outro email.", "Wait a minute before requesting another email.") : err.message, "err"); btn.disabled = false; }
  });
}

// Ecrã de autenticação leve: cartão claro + painel de marca (sem fotografia pesada)
const isEmail = (v) => String(v).includes("@");
const SYNTH = /@telefone\.uquiorrapay\.com$/i;
export const isPhoneAccount = (email) => SYNTH.test(String(email || ""));

function authShell(title, sub, body, tab = "") {
  return `<section class="auth3">
    <div class="auth3-main">
      <div class="auth3-top">${brandHTML("dark")}<a class="auth3-help" href="#/contacto">${ICON.help}<span>${tr("Ajuda", "Help")}</span></a></div>
      <div class="auth3-card">
        ${tab ? `<div class="auth3-tabs"><a class="${tab === "in" ? "on" : ""}" href="#/entrar">${tr("Entrar", "Sign in")}</a><a class="${tab === "up" ? "on" : ""}" href="#/registar">${tr("Criar conta", "Sign up")}</a></div>` : ""}
        <h1>${title}</h1>${sub ? `<p class="auth3-sub">${sub}</p>` : ""}${body}
      </div>
      <div class="auth3-foot"><a href="#/contacto">${tr("Suporte", "Support")}</a>·<a href="#/termos">${tr("Termos", "Terms")}</a>·<a href="#/privacidade">${tr("Privacidade", "Privacy")}</a></div>
    </div>
    <aside class="auth3-side" aria-hidden="true">
      <div class="as-in">
        <span class="as-badge">${ICON.bag} Uquiorrapay</span>
        <h2>${tr("Vende o que sabes.<br><span>Aprende com quem faz.</span>", "Sell what you know.<br><span>Learn from those who do.</span>")}</h2>
        <ul>
          <li><i>${ICON.check}</i>${tr("Criar conta é grátis", "Free to sign up")}</li>
          <li><i>${ICON.check}</i>${tr("Cria e publica cursos, ebooks e mais", "Create and publish courses, ebooks and more")}</li>
          <li><i>${ICON.check}</i>${tr("Recebe as vendas na tua carteira", "Get paid into your wallet")}</li>
        </ul>
        <div class="as-card"><span class="ic">${ICON.trend}</span><div><small>${tr("As tuas vendas", "Your sales")}</small><b>${tr("Nova venda!", "New sale!")}</b></div></div>
      </div>
    </aside>
  </section>`;
}
const googleBtn = () => (CONFIG.GOOGLE_LOGIN || state.settings.google_login === true)
  ? `<button type="button" class="btn btn-soft btn-block" id="g"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.3-1.6 3.9-5.5 3.9-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.8 3.3 14.6 2.3 12 2.3 6.6 2.3 2.3 6.6 2.3 12s4.3 9.7 9.7 9.7c5.6 0 9.3-3.9 9.3-9.5 0-.6-.1-1.1-.2-1.6z"/></svg>${tr("Continuar com Google", "Continue with Google")}</button><div class="or"><span>${tr("ou", "or")}</span></div>`
  : "";
function bindGoogle() {
  document.getElementById("g")?.addEventListener("click", async () => {
    try { await api.signInGoogle(); } catch (err) { toast(err.message, "err"); }
  });
}
function busy(btn, on) { btn.disabled = on; btn.classList.toggle("busy", on); }
// Erros por baixo do campo
function fieldErrors(form) {
  form.querySelectorAll(".input").forEach((i) => {
    const show = () => {
      const lab = i.closest("label"); if (!lab) return;
      let e = lab.querySelector(".f-err");
      if (i.validity.valid) { e?.remove(); i.classList.remove("err"); return; }
      if (!e) { e = document.createElement("small"); e.className = "f-err"; lab.appendChild(e); }
      i.classList.add("err");
      e.textContent = i.validity.valueMissing ? tr("Campo obrigatório", "Required field") : i.validationMessage;
    };
    i.addEventListener("blur", show); i.addEventListener("invalid", (ev) => { ev.preventDefault(); show(); });
    i.addEventListener("input", () => { if (i.classList.contains("err")) show(); });
  });
}
const validPw = (v) => v.length >= 10 && /[a-zA-Z]/.test(v) && /\d/.test(v);

export function loginRequired() {
  return authShell(tr("Entra para continuar", "Sign in to continue"), tr("Precisas de uma conta para aceder a esta página.", "You need an account to access this page."),
    `<div class="form"><a class="btn btn-green btn-block" href="#/entrar">${tr("Entrar", "Sign in")}</a><a class="btn btn-soft btn-block" href="#/registar">${tr("Criar conta grátis", "Create free account")}</a></div>`);
}
export function producerRequired() {
  return authShell(tr("Área de produtores", "Creator area"), tr("Cria o teu primeiro produto para abrir esta área.", "Create your first product to open this area."),
    `<a class="btn btn-green btn-block" href="#/ser-produtor">${tr("Criar produto", "Create product")}</a>`);
}

// ---------- Entrar ----------
export async function signIn(main) {
  if (state.user) { go(afterLogin() || (isAdmin() ? "#/admin" : "#/painel")); return; }
  main.innerHTML = authShell(tr("Bem-vindo de volta", "Welcome back"), tr("Entra com o teu email e palavra-passe.", "Sign in with your email and password."), `
    ${googleBtn()}
    <form id="f" class="form" novalidate>
      <label>Email<input class="input" name="email" type="email" required autocomplete="email" placeholder="${tr("O teu email", "Your email")}"></label>
      <label><span class="row-between">${tr("Palavra-passe", "Password")}<a class="small" href="#/recuperar">${tr("Esqueceste-te?", "Forgot it?")}</a></span><input class="input" name="password" type="password" required autocomplete="current-password" placeholder="${tr("A tua palavra-passe", "Your password")}"></label>
      <button class="btn btn-green btn-block">${tr("Entrar", "Sign in")}</button>
    </form>
    <p class="center small auth3-alt">${tr("Ainda não tens conta?", "No account yet?")} <a href="#/registar">${tr("Cria grátis", "Sign up free")}</a></p>`, "in");
  bindGoogle();
  const f = document.getElementById("f");
  fieldErrors(f);
  const cap = await mountCaptcha(f);
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!f.checkValidity()) { f.querySelectorAll(".input").forEach((i) => i.dispatchEvent(new Event("blur"))); return; }
    if (captchaOn() && !cap.check()) { needCaptcha(); return; }
    const btn = f.querySelector("button.btn-green");
    busy(btn, true);
    try {
      await api.signIn({ email: f.email.value.trim(), password: f.password.value, captchaToken: cap.token() });
      await refreshUser();
      if (state.mfaPending) { go("#/verificar"); return; }
      api.logEvent("login");
      toast(tr("Sessão iniciada.", "Signed in."));
      go(afterLogin() || (isAdmin() ? "#/admin" : "#/painel"));
    } catch (err) {
      cap.reset();
      if (/confirm/i.test(err.message)) {
        const em = f.email.value.trim();
        f.querySelector(".need-confirm")?.remove();
        f.insertAdjacentHTML("afterbegin", `<div class="alert need-confirm">${tr("A tua conta ainda não está activada. Abre o email de confirmação que te enviámos para", "Your account isn't activated yet. Open the confirmation email we sent to")} <b>${esc(em)}</b>.<br><button type="button" class="btn btn-soft btn-sm" id="resendC">${tr("Reenviar email de confirmação", "Resend confirmation email")}</button></div>`);
        bindResend(document.getElementById("resendC"), em);
        busy(btn, false);
        return;
      }
      const msg = /invalid/i.test(err.message) ? tr("Email ou palavra-passe incorrectos.", "Wrong email or password.") : err.message;
      toast(msg, "err");
      busy(btn, false);
    }
  });
}

// ---------- Criar conta ----------
export async function signUp(main, _p, query) {
  if (state.user) { go(afterLogin() || (isAdmin() ? "#/admin" : "#/painel")); return; }
  const goal0 = query.produtor ? "sell" : "buy";
  main.innerHTML = authShell(tr("Cria a tua conta", "Create your account"), tr("É grátis e leva menos de um minuto.", "It's free and takes less than a minute."), `
    ${googleBtn()}
    <form id="f" class="form" novalidate>
      <label>${tr("Nome completo", "Full name")}<input class="input" name="full_name" required minlength="3" autocomplete="name" placeholder="${tr("O teu nome", "Your name")}"></label>
      <label>Email<input class="input" name="email" type="email" required autocomplete="email" value="${esc(query.email || "")}" placeholder="${tr("O teu email", "Your email")}"></label>
      <label>${tr("Número de telefone", "Phone number")}<input class="input" name="phone" type="tel" required autocomplete="tel" inputmode="tel" placeholder="${tr("ex.: 84 123 4567", "e.g. 84 123 4567")}"></label>
      <label>${tr("Palavra-passe", "Password")}<input class="input" name="password" type="password" required autocomplete="new-password" placeholder="${tr("10 ou mais caracteres, letras e números", "10+ characters, letters and numbers")}"></label>
      <div class="goal"><span class="flabel">${tr("O que queres fazer?", "What do you want to do?")}</span>
        <div class="goal-seg"><button type="button" data-goal="sell" class="${goal0 === "sell" ? "on" : ""}">${ICON.trend}${tr("Vender", "Sell")}</button><button type="button" data-goal="buy" class="${goal0 === "buy" ? "on" : ""}">${ICON.cap}${tr("Comprar", "Buy")}</button></div></div>
      <label class="check"><input type="checkbox" name="terms" required> <span>${tr('Aceito os <a href="#/termos" target="_blank">Termos de Uso</a> e a <a href="#/privacidade" target="_blank">Política de Privacidade</a>.', 'I accept the <a href="#/termos" target="_blank">Terms of Use</a> and <a href="#/privacidade" target="_blank">Privacy Policy</a>.')}</span></label>
      <button class="btn btn-green btn-block">${tr("Criar conta grátis", "Create free account")}</button>
    </form>
    <p class="center small auth3-alt">${tr("Já tens conta?", "Already have an account?")} <a href="#/entrar">${tr("Entra aqui", "Sign in")}</a></p>`, "up");
  bindGoogle();
  const f = document.getElementById("f");
  fieldErrors(f);
  const cap = await mountCaptcha(f);
  let goal = goal0;
  f.querySelector(".goal-seg").addEventListener("click", (e) => {
    const b = e.target.closest("[data-goal]"); if (!b) return;
    goal = b.dataset.goal; f.querySelectorAll(".goal-seg button").forEach((x) => x.classList.toggle("on", x === b));
  });
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    f.phone.setCustomValidity(f.phone.value.replace(/\D/g, "").length >= 9 ? "" : tr("Escreve um número com pelo menos 9 dígitos.", "Enter a number with at least 9 digits."));
    f.password.setCustomValidity(validPw(f.password.value) ? "" : tr("Usa 10 ou mais caracteres, com letras e números.", "Use 10+ characters with letters and numbers."));
    if (!f.checkValidity()) {
      f.querySelectorAll(".input").forEach((i) => i.dispatchEvent(new Event("blur")));
      if (!f.terms.checked) toast(tr("Aceita os Termos de Uso para continuar.", "Accept the Terms of Use to continue."), "err");
      return;
    }
    if (captchaOn() && !cap.check()) { needCaptcha(); return; }
    const btn = f.querySelector("button.btn-green");
    busy(btn, true);
    const id = f.email.value.trim(), full_name = f.full_name.value.trim(), password = f.password.value, phone = f.phone.value.trim();
    try {
      if (!(await api.phoneAvailable(phone))) throw new Error(tr("Este número já está associado a outra conta.", "This number is already linked to another account."));
      try { if (!sessionStorage.getItem("uq_after_login")) sessionStorage.setItem("uq_after_login", goal === "sell" ? "#/painel" : "#/cursos"); } catch {}
      const res = await api.signUp({ full_name, email: id, password, phone, country: "MZ", captchaToken: cap.token() });
      try { registration(); } catch {}
      if (res?.session) { toast(tr("Conta criada!", "Account created!")); go(afterLogin() || "#/painel"); return; }
      // Veio do checkout: depois de confirmar o email (mesmo noutro separador), volta ao pagamento
      try { const nx = sessionStorage.getItem("uq_after_login") || ""; if (nx.startsWith("#/checkout/")) localStorage.setItem("uq_after_confirm", JSON.stringify({ h: nx, t: Date.now() })); } catch {}
      main.innerHTML = authShell(tr("Confirma o teu email", "Confirm your email"), "", `
        <div class="alert alert-ok">${tr(`Enviámos um link de confirmação para <b>${esc(id)}</b>. Abre o email e carrega no link para activar a conta.`, `We sent a confirmation link to <b>${esc(id)}</b>. Open it to activate your account.`)}</div>
        <p class="small muted">${tr("Não encontras? Vê a pasta de spam ou promoções. O link vale 24 horas.", "Can't find it? Check your spam or promotions folder. The link is valid for 24 hours.")}</p>
        <a class="btn btn-green btn-block" href="#/entrar">${tr("Já confirmei, entrar", "I've confirmed, sign in")}</a>
        <button type="button" class="btn btn-soft btn-block" id="resendC">${tr("Reenviar email", "Resend email")}</button>`);
      bindResend(document.getElementById("resendC"), id);
    } catch (err) {
      cap.reset();
      toast(/registered/i.test(err.message) ? tr("Este email já tem conta. Entra ou recupera a palavra-passe.", "This email already has an account.") : err.message, "err");
      busy(btn, false);
    }
  });
}

export async function forgot(main) {
  main.innerHTML = authShell(tr("Recuperar palavra-passe", "Reset password"), tr("Enviamos-te um link para criares uma nova.", "We'll email you a link to set a new one."), `
    <form id="f" class="form"><label>Email<input class="input" name="email" type="email" required placeholder="${tr("O teu email", "Your email")}"></label>
    <button class="btn btn-green btn-block">${tr("Enviar link", "Send link")}</button></form>
    <p class="center small auth3-alt"><a href="#/entrar">← ${tr("Voltar a entrar", "Back to sign in")}</a></p>`);
  const cap = await mountCaptcha(document.getElementById("f"));
  document.getElementById("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    if (captchaOn() && !cap.check()) { needCaptcha(); return; }
    const btn = e.target.querySelector("button"); busy(btn, true);
    try {
      await api.resetPassword(new FormData(e.target).get("email"), cap.token());
      e.target.outerHTML = `<div class="alert alert-ok">${tr("Se o email existir, vais receber o link em poucos minutos.", "If the email exists, you'll receive the link in a few minutes.")}</div>`;
    } catch (err) { cap.reset(); toast(err.message, "err"); busy(btn, false); }
  });
}

export async function newPassword(main) {
  main.innerHTML = authShell(tr("Nova palavra-passe", "New password"), tr("10 ou mais caracteres, com letras e números.", "10+ characters, with letters and numbers."), `
    <form id="f" class="form"><label>${tr("Nova palavra-passe", "New password")}<input class="input" name="p" type="password" required autocomplete="new-password"></label>
    <button class="btn btn-green btn-block">${tr("Guardar", "Save")}</button></form>`);
  const f = document.getElementById("f");
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const v = f.p.value;
    if (!validPw(v)) { toast(tr("Usa 10 ou mais caracteres, com letras e números.", "Use 10+ characters with letters and numbers."), "err"); return; }
    const btn = f.querySelector("button.btn-green"); busy(btn, true);
    try { await api.updatePassword(v); api.logEvent("password.change"); toast(tr("Palavra-passe alterada.", "Password updated.")); go("#/painel"); }
    catch (err) { toast(err.message, "err"); busy(btn, false); }
  });
}

// ---------- Perfil ----------
export async function profile(main) {
  const p = state.profile || {};
  main.innerHTML = dashShell("perfil", `
    <h1 class="page-title">${tr("Dados pessoais", "Personal details")}</h1>
    <p class="muted" style="margin:-12px 0 18px">${tr("Usamos o teu nome e telefone para te pagar e para contacto sobre as vendas.", "We use your name and phone to pay you and to contact you about sales.")}</p>
    <form id="f" class="panel form">
      <label>${tr("Nome completo", "Full name")}<input class="input" name="full_name" value="${esc(p.full_name || "")}" required></label>
      ${isPhoneAccount(state.user.email) ? `<p class="small muted">${tr("Entras na Uquiorrapay com o teu número de telefone.", "You sign in to Uquiorrapay with your phone number.")}</p>` : `<label>Email<input class="input" value="${esc(state.user.email)}" disabled></label>`}
      <div class="two">
        <label>${tr("Telefone (M-Pesa / e-Mola)", "Phone (M-Pesa / e-Mola)")}<input class="input" name="phone" required value="${esc(p.phone || "")}" placeholder="84 123 4567"></label>
        <label>${tr("País", "Country")}<input class="input" name="country" value="${esc(p.country || "MZ")}" maxlength="2"></label>
      </div>
      <label>${tr("Sobre mim (aparece aos alunos)", "About me (shown to students)")}<textarea class="input" name="bio" rows="3" maxlength="600">${esc(p.bio || "")}</textarea></label>
      <button class="btn btn-green">${tr("Guardar", "Save")}</button>
    </form>
    <div class="panel"><h3>${tr("Palavra-passe e verificação em 2 passos", "Password and 2-step verification")}</h3><a class="btn btn-outline-green" href="#/seguranca">${ICON.shield} ${tr("Abrir Segurança da conta", "Open account security")}</a></div>
    <div class="panel"><h3>${tr("Os meus papéis", "My roles")}</h3><p>${state.roles.map((r) => `<span class="badge">${esc({ student: tr("Aluno", "Student"), producer: tr("Produtor", "Creator"), admin: "Admin" }[r] || r)}</span>`).join(" ")}</p></div>
  `);
  document.getElementById("f").addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"); busy(btn, true);
    const fd = Object.fromEntries(new FormData(e.target));
    try { state.profile = await api.updateProfile(state.user.id, fd); toast(tr("Perfil guardado.", "Profile saved.")); rerender(); }
    catch (err) { toast(err.message, "err"); busy(btn, false); }
  });
}

// ---------- Checkout (2 ecrãs: escolher forma de pagamento → dados → instruções) ----------
const BACK = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 6l-6 6 6 6"/></svg>`;
const PAY_IC = { paypal: ["P", "#1F4FA3"] };
const CARD_SVG = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6.5 15h4"/></svg>`;
const payIcon = (m) => {
  if (m === "mpesa" || m === "emola") return `<span class="pm-ic logo"><img src="img/pay/${m}.png?v=202610091700" alt="${m === "mpesa" ? "M-Pesa" : "e-Mola"}"></span>`;
  if (m === "card" || m === "card_mz") return `<span class="pm-ic card">${CARD_SVG}</span>`;
  const [l, c] = PAY_IC[m] || ["•", "#0F5132"]; return `<span class="pm-ic" style="--c:${c}">${l}</span>`;
};
function payInstructions(order, course) {
  const s = state.settings;
  const cfg = { mpesa: s.payment_mpesa || {}, emola: s.payment_emola || {}, paypal: s.payment_paypal || {} }[order.payment_method] || {};
  const amount = order.pay_currency === "USD" ? `$${Number(order.pay_amount).toFixed(2)} USD` : mzn(order.pay_amount ?? order.amount_mzn);
  const dest = order.payment_method === "paypal" ? cfg.email : cfg.number;
  const wa = supportWa();
  const waText = encodeURIComponent(`Olá! Fiz o pedido ${order.reference} do curso "${course.title}".`);
  const steps = dest
    ? `<ol class="co-steps">
        <li><span>1</span><div>${tr(`Envia <b>${esc(amount)}</b> por ${methodLabel(order.payment_method)} para`, `Send <b>${esc(amount)}</b> via ${methodLabel(order.payment_method)} to`)}<div class="co-dest">${payIcon(order.payment_method)}<b>${esc(dest)}</b>${cfg.name ? `<small>${esc(cfg.name)}</small>` : ""}<button type="button" class="co-copy" data-copy="${esc(String(dest).replace(/\s/g, ""))}">${ICON.copy}</button></div></div></li>
        <li><span>2</span><div>${tr("Na descrição escreve a referência", "In the description write the reference")}<div class="co-dest"><b>${esc(order.reference)}</b><button type="button" class="co-copy" data-copy="${esc(order.reference)}">${ICON.copy}</button></div></div></li>
        <li><span>3</span><div>${tr("Escreve abaixo o código da transacção que recebeste por SMS.", "Enter below the transaction code you received by SMS.")}</div></li>
      </ol>`
    : `<p class="co-note">${tr(`A nossa equipa vai contactar-te${order.payer_phone ? ` pelo número <b>${esc(order.payer_phone)}</b>` : ""} para concluir o pagamento de <b>${esc(amount)}</b>.`, `Our team will contact you${order.payer_phone ? ` on <b>${esc(order.payer_phone)}</b>` : ""} to complete the payment of <b>${esc(amount)}</b>.`)}</p>`;
  const proof = order.payer_txn
    ? `<div class="co-done">${ICON.check}<div><b>${tr("Código recebido", "Code received")}: ${esc(order.payer_txn)}</b><small>${tr("Estamos a confirmar. O produto aparece em «Os meus cursos» assim que for confirmado.", "We're confirming it. The product appears in “My courses” once confirmed.")}</small></div></div>`
    : `<form id="pf" class="form co-form">
        <label>${tr("Código da transacção", "Transaction code")}<input class="input" id="txn" name="txn" required minlength="4" maxlength="40" placeholder="${tr("ex.: 8KJ2X4ZP1Q", "e.g. 8KJ2X4ZP1Q")}" style="text-transform:uppercase"></label>
        <button class="btn btn-green btn-block">${tr("Enviar código", "Send code")}</button>
      </form>`;
  return `<div class="co-status"><span class="badge st-pending">${tr("Pagamento pendente", "Payment pending")}</span><small>${tr("Ref.", "Ref.")} <b>${esc(order.reference)}</b></small></div>
    ${steps}${proof}
    <div class="co-actions">
      ${state.gateway ? `<button class="btn btn-primary btn-block" id="gw">${tr("Pagar agora online", "Pay online now")}</button>` : ""}
      ${wa ? `<a class="btn btn-soft" target="_blank" rel="noopener" href="https://wa.me/${wa}?text=${waText}">${ICON.whats} ${tr("Ajuda", "Help")}</a>` : ""}
      <a class="btn btn-soft" href="#/meus-cursos">${tr("Os meus cursos", "My courses")}</a>
    </div>`;
}

function bindOrder(box, order, course) {
  box.querySelectorAll("[data-copy]").forEach((b) => b.addEventListener("click", () => copyText(b.dataset.copy)));
  box.querySelector("#pf")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector("button"); busy(btn, true);
    const txn = new FormData(e.target).get("txn").trim().toUpperCase();
    try {
      await api.submitProof(order.id, txn);
      order.payer_txn = txn;
      toast(tr("Código enviado. Obrigado!", "Code sent. Thank you!"));
      box.querySelector(".co-body").innerHTML = payInstructions(order, course); bindOrder(box, order, course);
    } catch (err) { toast(err.message, "err"); busy(btn, false); }
  });
  box.querySelector("#gw")?.addEventListener("click", async (e) => { await goGateway(e.currentTarget, order.id); });
}

// Pagamento automático: tenta o primeiro fornecedor disponível. Devolve true se arrancou; false se falhou (passa ao manual)
let lastGwError = "";
async function goGateway(btn, orderId, quiet = false, kind = "") {
  busy(btn, true);
  lastGwError = "";
  try {
    const r = await api.startPayment(orderId, `${location.origin}${location.pathname}#/pagamento/${orderId}`, kind);
    if (r.mode === "redirect" && r.url) { location.href = r.url; return true; }
    pushWait(orderId, btn);
    return true;
  } catch (err) {
    lastGwError = err.message;
    if (!quiet) toast(err.message, "err");
    busy(btn, false);
    return false;
  }
}

// Ecrã «Confirma no teu telemóvel» enquanto o cliente põe o PIN do M-Pesa / e-Mola
function pushWait(orderId, btn) {
  const card = (btn && btn.closest(".co-card")) || document.querySelector(".co-card") || document.getElementById("main");
  const body = card.querySelector(".co-body") || card;
  let stop = false, t0 = Date.now();
  body.innerHTML = `<div class="co-push" role="status">
      <div class="push-ic"><span></span>${ICON.phone || "📱"}</div>
      <h2>${tr("Confirma o pagamento no teu telemóvel", "Confirm the payment on your phone")}</h2>
      <p class="muted">${tr("Vais receber um pedido do M-Pesa / e-Mola. Escreve o teu PIN para concluir. Não feches esta página.", "You'll get an M-Pesa / e-Mola prompt. Enter your PIN to finish. Don't close this page.")}</p>
      <div class="push-bar"><span></span></div>
      <small class="muted" id="pushT">${tr("A aguardar confirmação…", "Waiting for confirmation…")}</small>
      <button type="button" class="btn btn-soft btn-sm" id="pushCancel">${tr("Pagar de outra forma", "Pay another way")}</button>
    </div>`;
  body.querySelector("#pushCancel").addEventListener("click", () => { stop = true; rerender(); });
  const tick = async () => {
    if (stop || !document.body.contains(body)) return;
    try {
      const r = await api.pollPayment(orderId);
      if (r.status === "paid") { stop = true; go(`#/pagamento/${orderId}?t=${Date.now()}`); return; }
      if (r.status === "failed") {
        stop = true;
        body.innerHTML = `<div class="co-push failed"><div class="push-ic err">!</div><h2>${tr("O pagamento não foi concluído", "Payment not completed")}</h2>
          <p class="muted">${esc(r.error || tr("O PIN não foi confirmado.", "The PIN wasn't confirmed."))}</p>
          <div class="co-btns"><button type="button" class="btn btn-green" id="pushRetry">${tr("Tentar de novo", "Try again")}</button><button type="button" class="btn btn-soft" id="pushManual">${tr("Pagar manualmente", "Pay manually")}</button></div></div>`;
        body.querySelector("#pushRetry").addEventListener("click", (e) => goGateway(e.currentTarget, orderId));
        body.querySelector("#pushManual").addEventListener("click", () => rerender());
        return;
      }
    } catch { /* tenta outra vez */ }
    const s = Math.round((Date.now() - t0) / 1000);
    const el = body.querySelector("#pushT"); if (el) el.textContent = tr(`A aguardar confirmação… ${s}s`, `Waiting for confirmation… ${s}s`);
    setTimeout(tick, 4000);
  };
  setTimeout(tick, 4000);
}

// Página de checkout (modelo «Pagamento seguro»): resumo + garantias ao lado, dados e forma de pagamento no centro
function ckPage(c, { total, disc = 0, code = "", usd = "", bump = null, offer = null, main: inner }) {
  const bonuses = cleanBonuses(c.bonuses);
  const wa = String(c.support_whatsapp || "").replace(/\D/g, "");
  const usdTxt = Number(c.price_mzn) > 0 ? usd || usdFmt(intlPrice(c, Number(c.price_mzn) ? Math.round((disc / Number(c.price_mzn)) * 100) : 0)) : "";
  const intlView = Boolean(usdTxt) && state.currency !== "MZN"; // visitante de fora: o total principal é em dólares
  return `<section class="cko">
    <header class="ck-head"><a class="ck-back" href="#/curso/${esc(c.id)}" aria-label="${tr("Voltar ao produto", "Back to product")}">${BACK}</a><b>${ICON.lock} ${tr("Pagamento seguro", "Secure checkout")}</b><span class="ck-safe">● ${tr("ligação protegida", "protected connection")}</span></header>
    <div class="ck-grid">
      <aside class="ck-side">
        <div class="ck-card"><h2>${tr("Resumo do pedido", "Order summary")}</h2>
          <div class="ck-prod">${coverHTML(c, "xs")}<div><b>${esc(c.title)}</b><small>${tr("Acesso digital imediato", "Instant digital access")}${c.producer_name ? ` · ${esc(c.producer_name)}` : ""}</small></div></div>
          <p class="ck-row"><span>${tr("Preço", "Price")}</span><span>${intlView ? esc(usdFmt(intlPrice(c))) : `${hasStrike(c) ? `<s class="muted">${esc(mzn(c.compare_price_mzn))}</s> ` : ""}${esc(Number(c.price_mzn) === 0 ? tr("Grátis", "Free") : mzn(c.price_mzn))}`}</span></p>
          ${bonuses.length ? `<p class="ck-row"><span>${ICON.gift} ${bonuses.length} ${bonuses.length > 1 ? tr("bónus", "bonuses") : tr("bónus", "bonus")}</span><span class="ok-text">${tr("incluído", "included")}</span></p>` : ""}
          ${disc && code ? `<p class="ck-row ok-text"><span>${tr("Cupão", "Coupon")} ${esc(code)}</span><span>−${esc(mzn(disc))}</span></p>` : offer && offer.disc ? `<p class="ck-row ok-text"><span>${ICON.gift} ${tr("Oferta especial", "Special offer")}</span><span>−${esc(mzn(offer.disc))}</span></p>` : ""}
          ${bump ? `<p class="ck-row"><span>${ICON.plus} ${esc(bump.title)}</span><span>+${esc(mzn(bump.price))}</span></p>` : ""}
          <p class="ck-row tot"><span>${tr("Total", "Total")}</span><span id="ckTotal">${esc(Number(total) === 0 ? tr("Grátis", "Free") : intlView ? usdTxt : mzn(total))}</span></p>
          ${usdTxt ? (intlView ? `<p class="ck-row ck-intl"><span>🇲🇿 M-Pesa · e-Mola</span><span>${esc(mzn(total))}</span></p>` : `<p class="ck-row ck-intl"><span>🌍 ${tr("Internacional", "International")}</span><span id="ckUsd">${esc(usdTxt)}</span></p>`) : ""}
        </div>
        <div class="ck-card ck-badges">
          ${hasGuarantee(c) ? `<p class="ck-badge">${ICON.shield}<span><b>${tr(`Garantia de ${gDays()} dias`, `${gDays()}-day guarantee`)}</b><small>${tr("Se não for para ti, pedes o reembolso dentro do prazo.", "If it's not for you, ask for a refund within the period.")}</small></span></p>` : ""}
          <p class="ck-badge">${ICON.bolt}<span><b>${tr("Entrega imediata", "Instant delivery")}</b><small>${tr("O acesso aparece em «Os meus cursos» logo após a confirmação do pagamento.", "Access appears in “My courses” right after payment is confirmed.")}</small></span></p>
          ${wa || c.support_email ? `<p class="ck-badge">${ICON.whats}<span><b>${tr("Suporte do produtor", "Creator support")}</b><small>${wa ? `WhatsApp +${esc(wa)}` : esc(c.support_email)}</small></span></p>` : ""}
        </div>
      </aside>
      <div class="ck-main co-card">${inner}</div>
    </div>
  </section>`;
}
const MZ_PHONE = /^(\+?258)?8[2-7]\d{7}$/;

export async function checkout(main, { id }, query, alive) {
  const c = await api.course(id);
  if (!alive()) return;
  if (!c || c.status !== "approved" || !supportOk(c)) { main.innerHTML = `<section class="page container narrow">${emptyState(tr("Produto indisponível", "Product unavailable"), tr("Este produto ainda não pode ser comprado.", "This product can't be purchased yet."))}</section>`; return; }
  const free = Number(c.price_mzn) === 0;
  try { if (!free) initiateCheckout(c, c.price_mzn); } catch {}

  // Sem sessão: mostra o resumo e pede para entrar ou criar conta (volta aqui depois)
  if (!state.user) {
    try { sessionStorage.setItem("uq_after_login", location.hash); } catch {}
    main.innerHTML = ckPage(c, { total: c.price_mzn, main: `<h2>${tr("Os teus dados", "Your details")}</h2>
      <p class="muted">${tr("Para receberes o acesso ao produto, entra na tua conta ou cria uma conta grátis (leva 1 minuto). Depois voltas directamente a este pagamento.", "To receive access, sign in or create a free account (takes 1 minute). Then you come straight back to this payment.")}</p>
      <div class="ck-auth"><a class="btn btn-green btn-block btn-lg" href="#/registar">${tr("Criar conta e continuar", "Create account and continue")}</a><a class="btn btn-soft btn-block" href="#/entrar">${tr("Já tenho conta — entrar", "I have an account — sign in")}</a></div>
      <p class="ck-terms">${ICON.lock} ${tr("Os teus dados ficam protegidos. Nunca pedimos o PIN do M-Pesa ou e-Mola.", "Your data is protected. We never ask for your M-Pesa or e-Mola PIN.")}</p>` });
    return;
  }

  const [enrolled, pending, gw] = await Promise.all([api.isEnrolled(state.user.id, id), api.pendingOrderFor(state.user.id, id), free ? { enabled: false, paypal: false } : api.gatewayInfo()]);
  if (!alive()) return;
  // Oferta especial (upsell/downsell) vinda da página pós-compra: #/checkout/<id>?oferta=upsell&de=<produto comprado>
  let offer = null;
  if (!free && ["upsell", "downsell"].includes(query.oferta) && query.de) {
    const [src, bought] = await Promise.all([api.course(query.de).catch(() => null), api.isEnrolled(state.user.id, query.de).catch(() => false)]);
    const op = Number(src?.[`${query.oferta}_price_mzn`] || 0);
    if (src && bought && src.producer_id === c.producer_id && src[`${query.oferta}_course_id`] === id && op > 0 && op < Number(c.price_mzn)) offer = { kind: query.oferta, from: src.id, price: op, disc: Number(c.price_mzn) - op, title: src.title };
  }
  // Order bump: produto extra do mesmo produtor, oferecido no checkout com um clique
  let bump = null, bumpOn = false;
  if (!free && !offer && c.bump_course_id) {
    const [bc, has] = await Promise.all([api.course(c.bump_course_id).catch(() => null), api.isEnrolled(state.user.id, c.bump_course_id).catch(() => true)]);
    if (bc && bc.status === "approved" && bc.producer_id === c.producer_id && !has) bump = { id: bc.id, title: bc.title, price: Number(c.bump_price_mzn) > 0 ? Number(c.bump_price_mzn) : Number(bc.price_mzn), normal: Number(bc.price_mzn), text: c.bump_text || "" };
  }
  if (!alive()) return;
  const gateway = Boolean(gw.enabled), paypalApi = Boolean(gw.paypal);
  const paypalManual = !paypalApi && Boolean(state.settings.payment_paypal?.email);
  // pagamento automático conforme o método do pedido: telemóvel (Pagar/e2/PaySuite) ou PayPal (internacional)
  const autoFor = (m) => (m === "paypal" ? paypalApi : gateway);
  state.gateway = pending ? autoFor(pending.payment_method) : gateway;
  const ref = getRef(id);
  let pctOff = 0, couponCode = "";
  const disc = () => (offer ? offer.disc : Math.round(Number(c.price_mzn) * pctOff) / 100);
  const bumpV = () => (bumpOn && bump ? bump.price : 0);
  const total = () => Number(c.price_mzn) - disc() + bumpV();

  const showOrder = async (order) => {
    const bc = order.bump_course_id ? await api.course(order.bump_course_id).catch(() => null) : null;
    if (!alive()) return;
    main.innerHTML = ckPage(c, { total: Number(order.amount_mzn), disc: Number(order.discount_mzn || 0), code: order.coupon_code || "", usd: order.pay_currency === "USD" && order.pay_amount != null ? usdFmt(order.pay_amount) : "",
      bump: order.bump_course_id ? { title: bc?.title || tr("Produto extra", "Extra product"), price: Number(order.bump_mzn || 0) } : null, offer: order.offer_kind ? { disc: Number(order.discount_mzn || 0) } : null,
      main: `<h2>${tr("Concluir pagamento", "Complete payment")}</h2><div class="co-body">${payInstructions(order, c)}</div>` });
    bindOrder(main.querySelector(".co-card"), order, c);
  };

  if (enrolled) {
    main.innerHTML = ckPage(c, { total: c.price_mzn, main: `<h2>${tr("Já tens acesso", "You already have access")}</h2><p class="muted">${tr("Este produto já está em «Os meus cursos».", "This product is already in “My courses”.")}</p><a class="btn btn-green btn-block btn-lg" href="#/aprender/${esc(id)}">${tr("Abrir", "Open")} ${ICON.arrow}</a>` });
    return;
  }
  if (pending) { await showOrder(pending); return; }

  const pf = state.profile || {};
  const synth = isPhoneAccount(state.user.email);
  // [chave, nome, disponível, nota]
  const SOON = tr("Em breve", "Coming soon");
  const national = [["mpesa", "M-Pesa", true, ""], ["emola", "e-Mola", true, ""], ["card_mz", tr("Cartão nacional", "Local card"), false, SOON]];
  const international = [["paypal", "PayPal", paypalApi || paypalManual, paypalApi || paypalManual ? "" : SOON], ["card", tr("Cartão internacional", "International card"), paypalApi, paypalApi ? "Visa · Mastercard" : SOON]];
  let method = state.currency !== "MZN" && (paypalApi || paypalManual) ? "paypal" : "mpesa";
  const isIntl = (m) => m === "paypal" || m === "card";
  const usdOf = (mz) => Math.round((Number(mz) / usdRate()) * 100) / 100;
  const usd = () => usdFmt((offer ? usdOf(offer.price) : intlPrice(c, pctOff)) + (bumpOn && bump ? usdOf(bump.price) : 0));
  const pmTile = ([k, l, on, note]) => `<label class="ck-pm ${on ? "" : "off"}"><input type="radio" name="m" value="${k}" ${k === method ? "checked" : ""} ${on ? "" : "disabled"}>${payIcon(k)}<span class="ck-pm-t"><b>${l}</b>${note ? `<small>${esc(note)}</small>` : ""}</span></label>`;
  const payLabel = () => free ? tr("Inscrever-me grátis", "Enrol for free")
    : isIntl(method) ? (autoFor("paypal") ? `${ICON.lock} ${tr("Pagar", "Pay")} ${esc(usd())}` : tr(`Confirmar pedido · ${usd()}`, `Place order · ${usd()}`))
    : gateway ? `${ICON.lock} ${tr("Pagar", "Pay")} ${esc(mzn(total()))}` : tr(`Confirmar pedido · ${mzn(total())}`, `Place order · ${mzn(total())}`);
  // Quem está fora de Moçambique vê primeiro o pagamento internacional (PayPal e cartão)
  const localFirst = state.currency === "MZN";
  const natG = () => `
        <div class="ck-group"><h4>🇲🇿 ${tr("Moçambique", "Mozambique")}<small>M-Pesa · e-Mola · ${tr("em meticais", "in meticais")}</small></h4>
          <div class="ck-tabs three" role="radiogroup">${national.map(pmTile).join("")}</div></div>
`;
  const intlG = () => `
        <div class="ck-group"><h4>🌍 ${tr("Pagamento internacional", "International")}<small>${tr("em dólares", "in US dollars")} · ${esc(usd())}</small></h4>
          <div class="ck-tabs" role="radiogroup">${international.map(pmTile).join("")}</div></div>
`;
  // «keep»: valores já escritos (para não os perder ao redesenhar, ex.: ao marcar o order bump)
  const form = (keep = null) => {
    main.innerHTML = ckPage(c, { total: total(), disc: disc(), code: couponCode, usd: Number(c.price_mzn) > 0 ? usd() : "", bump: bumpOn && bump ? { title: bump.title, price: bump.price } : null, offer: offer ? { disc: offer.disc } : null, main: `
      <form id="ckf" class="form ck-form" novalidate>
        ${offer ? `<div class="ck-offer">${ICON.gift}<span>${tr(`Oferta especial por teres comprado «${esc(offer.title)}»: <b>${esc(mzn(offer.price))}</b> em vez de ${esc(mzn(c.price_mzn))}.`, `Special offer for buying “${esc(offer.title)}”: <b>${esc(mzn(offer.price))}</b> instead of ${esc(mzn(c.price_mzn))}.`)}</span></div>` : ""}
        <h2>${tr("Os teus dados", "Your details")}</h2>
        <label>${tr("Nome completo", "Full name")}<input class="input" name="full_name" autocomplete="name" required minlength="3" maxlength="80" value="${esc(pf.full_name || "")}"></label>
        <label>${tr("Email", "Email")}<input class="input" name="email" type="email" value="${esc(synth ? "" : state.user.email || "")}" ${synth ? `placeholder="${tr("(conta criada com telefone)", "(phone account)")}"` : ""} readonly></label>
        <label>WhatsApp<input class="input" name="whatsapp" type="tel" inputmode="tel" autocomplete="tel" required value="${esc(pf.phone || "")}" placeholder="84 123 4567"></label>
        ${free ? "" : `<h2 class="ck-h2">${tr("Forma de pagamento", "Payment method")}</h2>
        ${localFirst ? natG() + intlG() : intlG() + natG()}
        <div class="ck-pane" data-pane="tel" ${isIntl(method) ? "hidden" : ""}>
          <label>${tr("Número que vai pagar", "Paying number")}<input class="input" name="payer_phone" type="tel" inputmode="tel" value="${esc(pf.phone || "")}" placeholder="84 123 4567"></label>
          <p class="ck-note">${gateway ? tr("Vais receber um pedido de confirmação no telemóvel. Insere o teu PIN para concluir.", "You'll get a confirmation prompt on your phone. Enter your PIN to finish.") : tr("Depois de confirmares, mostramos o número para onde enviar o valor e a referência.", "After confirming, we show the number to send the amount to and the reference.")}</p>
        </div>
        <div class="ck-pane" data-pane="paypal" ${method === "paypal" ? "" : "hidden"}><p class="ck-note">${paypalApi ? tr(`Vais ser levado ao PayPal para pagar <b>${esc(usd())}</b> com a tua conta. Depois voltas aqui automaticamente.`, `You'll go to PayPal to pay <b>${esc(usd())}</b> with your account, then come back here automatically.`) : tr(`Total em dólares: <b>${esc(usd())}</b>. Depois de confirmares, mostramos o email PayPal para onde enviar.`, `Total in dollars: <b>${esc(usd())}</b>. After confirming, we show the PayPal email.`)}</p></div>
        <div class="ck-pane" data-pane="card" ${method === "card" ? "" : "hidden"}><p class="ck-note">${tr(`Pagas <b>${esc(usd())}</b> com cartão Visa ou Mastercard numa página segura do PayPal — não precisas de ter conta PayPal. Os dados do cartão não passam pela Uquiorrapay.`, `Pay <b>${esc(usd())}</b> by Visa or Mastercard on a secure PayPal page — no PayPal account needed. Card details never touch Uquiorrapay.`)}</p></div>
        ${bump ? `<label class="ck-bump ${bumpOn ? "on" : ""}"><input type="checkbox" id="bumpChk" ${bumpOn ? "checked" : ""}><span class="ck-bump-t"><b>${ICON.gift} ${tr("Sim, quero adicionar", "Yes, add this too")}: ${esc(bump.title)}</b><small>${esc(bump.text || tr("Oferta exclusiva só nesta compra. Recebes os dois produtos juntos.", "Exclusive offer, only with this purchase. You get both products together."))}</small><em>${bump.normal > bump.price ? `<s>${esc(mzn(bump.normal))}</s>` : ""}+${esc(mzn(bump.price))}</em></span></label>` : ""}
        ${offer ? "" : `<div class="ck-coupon">${couponCode ? `<span class="ok-text">${ICON.tag} ${tr("Cupão", "Coupon")} <b>${esc(couponCode)}</b> −${pctOff}%</span> <button type="button" class="link-btn" id="cpDel">${tr("Remover", "Remove")}</button>`
          : `<button type="button" class="link-btn" id="cpOpen">${ICON.tag} ${tr("Tenho um cupão de desconto", "I have a discount coupon")}</button><div class="cp-inline" id="cpf" hidden><input class="input" id="cp" placeholder="${tr("CÓDIGO", "CODE")}" maxlength="30" value="${esc(query.cupao || "")}"><button type="button" class="btn btn-green btn-sm" id="cpApply">${tr("Aplicar", "Apply")}</button></div>`}</div>`}`}
        ${ref ? `<p class="co-ref">${ICON.link} ${tr("Indicado por um afiliado", "Referred by an affiliate")} · ${esc(ref)}</p>` : ""}
        <p class="err-text ck-err" id="ckErr" role="alert"></p>
        <button class="btn btn-primary btn-block btn-lg ck-pay" id="go">${payLabel()}</button>
        <p class="ck-terms">${tr("Ao comprar, aceitas os", "By purchasing you accept the")} <a href="#/termos">${tr("Termos de Uso", "Terms of Use")}</a> ${tr("e a", "and the")} <a href="#/privacidade">${tr("Política de Privacidade", "Privacy Policy")}</a>.</p>
      </form>` });
    const f = document.getElementById("ckf");
    if (keep) { for (const k of ["full_name", "whatsapp", "payer_phone"]) if (f[k] && keep[k] != null) f[k].value = keep[k]; }
    const snapshot = () => ({ full_name: f.full_name.value, whatsapp: f.whatsapp.value, payer_phone: f.payer_phone?.value });
    document.getElementById("bumpChk")?.addEventListener("change", (e) => { bumpOn = e.target.checked; form(snapshot()); });
    f.querySelectorAll("input[name=m]").forEach((r) => r.addEventListener("change", () => {
      method = r.value;
      const pane = method === "paypal" ? "paypal" : method === "card" ? "card" : "tel";
      f.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== pane));
      document.getElementById("go").innerHTML = payLabel();
    }));
    // o número que paga acompanha o WhatsApp enquanto o cliente não o mudar
    let payerTouched = false;
    f.payer_phone?.addEventListener("input", () => { payerTouched = true; });
    f.whatsapp.addEventListener("input", () => { if (f.payer_phone && !payerTouched) f.payer_phone.value = f.whatsapp.value; });
    document.getElementById("cpOpen")?.addEventListener("click", (e) => { e.currentTarget.hidden = true; const box = document.getElementById("cpf"); box.hidden = false; box.querySelector("input").focus(); });
    document.getElementById("cpApply")?.addEventListener("click", () => applyCoupon(document.getElementById("cp").value, false));
    document.getElementById("cp")?.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); applyCoupon(e.target.value, false); } });
    document.getElementById("cpDel")?.addEventListener("click", () => { pctOff = 0; couponCode = ""; form(); });
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = document.getElementById("ckErr");
      const name = f.full_name.value.trim(), wa = f.whatsapp.value.replace(/[\s-]/g, ""), ph = f.payer_phone ? f.payer_phone.value.replace(/[\s-]/g, "") : "";
      let msg = "";
      if (name.length < 3) msg = tr("Escreve o teu nome completo.", "Enter your full name.");
      else if (wa.replace(/\D/g, "").length < 9) msg = tr("Escreve um WhatsApp válido, com pelo menos 9 dígitos.", "Enter a valid WhatsApp number with at least 9 digits.");
      else if (!free && !isIntl(method) && !MZ_PHONE.test(ph)) msg = tr(`Escreve o número ${method === "emola" ? "e-Mola" : "M-Pesa"} que vai pagar, com 9 dígitos (ex.: 84 123 4567).`, `Enter the paying ${method === "emola" ? "e-Mola" : "M-Pesa"} number, 9 digits (e.g. 84 123 4567).`);
      else if (!free && method === "emola" && !/^(\+?258)?8[67]/.test(ph)) msg = tr("O número e-Mola tem de começar por 86 ou 87. Se o teu número é 84/85, escolhe M-Pesa.", "e-Mola numbers start with 86 or 87. If yours is 84/85, choose M-Pesa.");
      else if (!free && method === "mpesa" && !/^(\+?258)?8[45]/.test(ph)) msg = tr("O número M-Pesa tem de começar por 84 ou 85. Se o teu número é 86/87, escolhe e-Mola.", "M-Pesa numbers start with 84 or 85. If yours is 86/87, choose e-Mola.");
      err.textContent = msg;
      if (msg) { (msg.includes("nome") || msg.includes("name") ? f.full_name : msg.includes("WhatsApp") ? f.whatsapp : f.payer_phone)?.focus(); return; }
      const upd = {};
      if (name !== (pf.full_name || "")) upd.full_name = name;
      if (f.whatsapp.value.trim() !== (pf.phone || "")) upd.phone = f.whatsapp.value.trim();
      if (Object.keys(upd).length) { try { state.profile = await api.updateProfile(state.user.id, upd); } catch { /* o número pode já estar noutra conta; segue sem guardar */ } }
      await placeOrder(document.getElementById("go"), { payment_method: free ? "mpesa" : isIntl(method) ? "paypal" : method, payer_phone: free ? null : isIntl(method) ? wa : ph, kind: method === "card" ? "card" : method === "paypal" ? "paypal" : "" });
    });
  };
  const applyCoupon = async (raw, silent) => {
    const code = String(raw || "").trim().toUpperCase();
    if (!code) return;
    try {
      const p = await api.checkCoupon(id, code);
      if (p) { pctOff = Number(p); couponCode = code; toast(tr(`Cupão aplicado: −${pctOff}%`, `Coupon applied: −${pctOff}%`)); form(); }
      else if (!silent) toast(tr("Cupão inválido ou expirado.", "Invalid or expired coupon."), "err");
    } catch (err) { if (!silent) toast(err.message, "err"); }
  };

  const placeOrder = async (btn, { payment_method, payer_phone, kind = "" }) => {
    busy(btn, true);
    try {
      const order = await api.createOrder({ course_id: id, payment_method, payer_phone, coupon_code: couponCode || null, affiliate_code: ref, bump_course_id: bumpOn && bump ? bump.id : null, offer_kind: offer?.kind || null, offer_from: offer?.from || null });
      if (Number(order.amount_mzn) === 0 || order.status === "paid") { toast(tr("Inscrição feita!", "Enrolled!")); go(`#/aprender/${id}`); return; }
      state.gateway = autoFor(payment_method);
      if (state.gateway) {
        await showOrder(order);
        if (await goGateway(main.querySelector("#gw") || btn, order.id, true, kind)) return;
        // Nenhum fornecedor respondeu: mostra as instruções de pagamento manual para o cliente não ficar parado
        state.gateway = false;
        toast(/MODO DE TESTE/.test(lastGwError) ? lastGwError : tr("O pagamento automático está indisponível de momento. Paga pelo método manual abaixo.", "Automatic payment is unavailable right now. Use the manual method below."), "err");
      }
      toast(tr("Pedido registado.", "Order placed."));
      await showOrder(order);
      window.scrollTo(0, 0);
    } catch (err) { toast(err.message, "err"); busy(btn, false); }
  };

  form();
  if (query.cupao && !free) applyCoupon(query.cupao, true);
}

// ---------- Upsell / downsell depois da compra (configurados pelo produtor no produto comprado) ----------
async function funnelOffers(srcId) {
  const src = await api.course(srcId).catch(() => null);
  if (!src || !state.user) return [];
  const pick = async (kind) => {
    const cid = src[`${kind}_course_id`], price = Number(src[`${kind}_price_mzn`] || 0);
    if (!cid || !(price > 0)) return null;
    const [c2, has] = await Promise.all([api.course(cid).catch(() => null), api.isEnrolled(state.user.id, cid).catch(() => true)]);
    if (!c2 || c2.status !== "approved" || c2.producer_id !== src.producer_id || has || !(price < Number(c2.price_mzn))) return null;
    return { kind, c: c2, price, text: src[`${kind}_text`] || "" };
  };
  const [up, down] = await Promise.all([pick("upsell"), pick("downsell")]);
  return [up, down].filter(Boolean);
}
function offerBoxHTML(o, srcId) {
  const off = Math.round((1 - o.price / Number(o.c.price_mzn)) * 100);
  return `<div class="upsell-box" data-kind="${o.kind}">
    <span class="upsell-k">${o.kind === "upsell" ? tr("Oferta especial só agora", "One-time special offer") : tr("Última oportunidade", "Last chance")}</span>
    <div class="upsell-prod">${coverHTML(o.c, "xs")}<div><b>${esc(o.c.title)}</b><small>${esc(o.text || tr("Complementa o que acabaste de comprar.", "Complements what you just bought."))}</small></div></div>
    <p class="upsell-price"><s>${esc(mzn(o.c.price_mzn))}</s><b>${esc(mzn(o.price))}</b>${off >= 1 ? `<em class="off-badge">−${off}%</em>` : ""}</p>
    <div class="upsell-btns"><a class="btn btn-primary btn-block" data-upsell-yes href="#/checkout/${esc(o.c.id)}?oferta=${o.kind}&de=${esc(srcId)}">${tr("Sim, quero aproveitar", "Yes, I want it")} ${ICON.arrow}</a><button type="button" class="link-btn" data-upsell-no>${tr("Não, obrigado", "No, thanks")}</button></div>
  </div>`;
}
// Mostra o upsell; se o cliente recusar, mostra o downsell. «once»: depois de responder, não volta a aparecer neste aparelho
async function mountFunnel(el, srcId, { after = false, once = false } = {}) {
  if (!el) return;
  const key = `uq_funnel_${srcId}`;
  try { if (once && localStorage.getItem(key)) return; } catch {}
  const list = await funnelOffers(srcId);
  if (!list.length || !document.body.contains(el)) return;
  const [first, second] = list;
  const html = `<div class="upsell-wrap">${offerBoxHTML(first, srcId)}${second ? `<div hidden data-next>${offerBoxHTML(second, srcId)}</div>` : ""}</div>`;
  if (after) el.insertAdjacentHTML("afterend", html); else el.innerHTML = html;
  const wrap = after ? el.nextElementSibling : el.querySelector(".upsell-wrap");
  const seen = () => { if (once) { try { localStorage.setItem(key, "1"); } catch {} } };
  wrap.addEventListener("click", (e) => {
    if (e.target.closest("[data-upsell-yes]")) { seen(); return; }
    const no = e.target.closest("[data-upsell-no]"); if (!no) return;
    const box = no.closest(".upsell-box"), next = wrap.querySelector("[data-next]");
    if (box.dataset.kind === "upsell" && next && next.hidden) { box.remove(); next.hidden = false; return; }
    seen(); wrap.remove();
  });
}

// Regresso do pagamento online
export async function paymentReturn(main, { id }, _q, alive) {
  if (_q?.cancelado) {
    const o0 = await api.order(id).catch(() => null);
    if (!alive()) return;
    main.innerHTML = `<section class="page container narrow center">${emptyState(tr("Pagamento cancelado", "Payment cancelled"), tr("Não foi cobrado nada. Podes tentar de novo ou escolher outra forma de pagamento.", "Nothing was charged. Try again or choose another payment method."),
      `<div class="order-actions" style="justify-content:center"><a class="btn btn-green" href="#/checkout/${esc(o0?.course_id || "")}">${tr("Voltar ao pagamento", "Back to payment")}</a></div>`)}</section>`;
    return;
  }
  main.innerHTML = `<section class="page container narrow center">${loading()}<p class="muted">${tr("A confirmar o pagamento…", "Confirming payment…")}</p></section>`;
  try { await api.verifyPayment(id); } catch (err) { console.warn(err); }
  try { await api.pollPayment(id); } catch (err) { console.warn(err); }
  const o = await api.order(id).catch(() => null);
  if (!alive()) return;
  if (!o) { main.innerHTML = `<section class="page container narrow">${emptyState(tr("Pedido não encontrado", "Order not found"))}</section>`; return; }
  if (o.status === "paid") {
    try { if (Number(o.amount_mzn) > 0) purchase(o, { id: o.course_id, title: o.courses?.title, meta_pixel_id: o.courses?.meta_pixel_id }); } catch {}
    main.innerHTML = `<section class="page container narrow center"><div class="success-ic">${ICON.check}</div><h1 class="page-title">${tr("Pagamento confirmado!", "Payment confirmed!")}</h1>
      <p class="lead-dark">${tr(`Já tens acesso a «${esc(o.courses?.title || "")}».`, `You now have access to “${esc(o.courses?.title || "")}”.`)}</p>
      <a class="btn btn-primary btn-lg" href="#/aprender/${esc(o.course_id)}">${tr("Começar o curso", "Start the course")} ${ICON.arrow}</a><div id="funnel"></div></section>`;
    mountFunnel(document.getElementById("funnel"), o.course_id);
    return;
  }
  main.innerHTML = `<section class="page container narrow center">${emptyState(tr("Ainda não recebemos a confirmação", "We haven't received confirmation yet"), tr("Se já pagaste, espera um minuto e verifica de novo.", "If you've paid, wait a minute and check again."),
    `<div class="order-actions" style="justify-content:center"><button class="btn btn-green" id="again">${tr("Verificar de novo", "Check again")}</button><a class="btn btn-ghost-dark" href="#/checkout/${esc(o.course_id)}">${tr("Voltar ao pagamento", "Back to payment")}</a></div>`)}</section>`;
  document.getElementById("again").addEventListener("click", () => rerender());
}

// ---------- Os meus cursos ----------
export async function myCourses(main, _p, _q, alive) {
  const [enr, orders, progress] = await Promise.all([api.myEnrollments(state.user.id), api.myOrders(state.user.id), api.allProgress(state.user.id)]);
  const ids = enr.map((e) => e.course_id);
  const [counts, titles] = await Promise.all([api.lessonCounts(ids).catch(() => ({})), api.lessonTitles(enr.map((e) => e.last_lesson_id).filter(Boolean)).catch(() => ({}))]);
  if (!alive()) return;
  const done = {};
  progress.forEach((p) => (done[p.course_id] = (done[p.course_id] || 0) + 1));
  const pending = orders.filter((o) => o.status === "pending");
  const pctOf = (c) => { const t = counts[c.id] || 0; return t ? Math.round(((done[c.id] || 0) / t) * 100) : 0; };
  // «Continuar onde parei»: o curso visto mais recentemente que ainda não está concluído
  const last = enr.filter((e) => e.courses && e.last_seen_at && e.last_lesson_id && titles[e.last_lesson_id]).sort((x, y) => String(y.last_seen_at).localeCompare(String(x.last_seen_at)))[0];
  const contHref = (e) => `#/aprender/${esc(e.course_id)}${e.last_lesson_id && titles[e.last_lesson_id] ? `/${esc(e.last_lesson_id)}` : ""}`;
  // Secções por tipo de produto: cursos, ebooks, templates e áudios/podcasts (separador «Todos» mostra todas)
  const TYPE_TABS = [["", tr("Todos", "All")], ["curso", tr("Cursos", "Courses")], ["ebook", "Ebooks"], ["template", "Templates"], ["audio", tr("Áudios e podcasts", "Audio & podcasts")]];
  const typeOf = (c) => (TYPES.includes(c?.product_type) ? c.product_type : "curso");
  const tipo = TYPE_TABS.some(([k]) => k && k === _q?.tipo) ? _q.tipo : "";
  const countBy = {};
  enr.forEach((e) => { if (e.courses) countBy[typeOf(e.courses)] = (countBy[typeOf(e.courses)] || 0) + 1; });
  const SEC = { curso: tr("Os meus cursos", "My courses"), ebook: tr("Os meus ebooks", "My ebooks"), template: tr("Os meus templates", "My templates"), audio: tr("Os meus áudios e podcasts", "My audio & podcasts") };
  const EMPTY = { curso: tr("Ainda não tens cursos.", "You don't have any courses yet."), ebook: tr("Ainda não tens ebooks.", "You don't have any ebooks yet."), template: tr("Ainda não tens templates.", "You don't have any templates yet."), audio: tr("Ainda não tens áudios nem podcasts.", "You don't have any audio or podcasts yet.") };
  const GO = {
    curso: [tr("Começar", "Start"), tr("Continuar", "Continue"), tr("Rever", "Review")],
    ebook: [tr("Ler", "Read"), tr("Continuar a ler", "Keep reading"), tr("Reler", "Read again")],
    template: [tr("Abrir", "Open"), tr("Abrir", "Open"), tr("Abrir", "Open")],
    audio: [tr("Ouvir", "Listen"), tr("Continuar a ouvir", "Keep listening"), tr("Ouvir de novo", "Listen again")],
  };
  const card = (e) => {
    const c = e.courses, t = typeOf(c);
    const pct = pctOf(c), started = (done[c.id] || 0) > 0 || e.last_lesson_id;
    return `<a class="card course-card" href="${contHref(e)}">${coverHTML(c)}<div class="card-body">
      <span class="mc-type">${esc(typeLabel(t))}</span>
      <h3>${esc(c.title)}</h3><p class="muted small">${esc(c.producer_name || "")}</p>
      <div class="progress"><div style="width:${pct}%"></div></div>
      <div class="row-between small"><span>${pct}% ${tr("concluído", "complete")}</span><span class="cc-go">${GO[t][pct === 100 ? 2 : started ? 1 : 0]} ${ICON.arrow}</span></div>
    </div></a>`;
  };
  const section = (t) => {
    const items = enr.filter((e) => e.courses && typeOf(e.courses) === t);
    if (!items.length) return "";
    return `<h2 class="mc-h">${SEC[t]} <span class="tab-n">${items.length}</span></h2><div class="grid courses">${items.map(card).join("")}</div>`;
  };
  const tabs = `<nav class="tabs mc-tabs">${TYPE_TABS.map(([k, l]) => `<a href="#/meus-cursos${k ? `?tipo=${k}` : ""}" class="${k === tipo ? "on" : ""}">${l}${k && countBy[k] ? ` <span class="tab-n">${countBy[k]}</span>` : ""}</a>`).join("")}</nav>`;
  const library = !enr.length
    ? emptyState(tr("Ainda não tens produtos.", "You don't have any products yet."), tr("Explora a montra e começa a aprender hoje.", "Explore the marketplace and start learning today."), `<a class="btn btn-primary" href="#/cursos">${tr("Ver produtos", "Browse products")}</a>`)
    : tabs + (tipo ? (section(tipo) || emptyState(EMPTY[tipo], "", `<a class="btn btn-primary" href="#/cursos?tipo=${esc(tipo)}">${tr("Ver na montra", "Browse the store")}</a>`)) : ["curso", "ebook", "template", "audio"].map(section).join(""));
  main.innerHTML = dashShell("cursos", `
    <h1 class="page-title">${tr("Área de membros", "Members area")}</h1>
    <p class="muted" style="margin:-12px 0 18px">${tr("Os produtos que compraste. Continua de onde paraste.", "The products you bought. Continue where you left off.")}</p>
    ${last ? `<a class="continue-hero" href="${contHref(last)}">
        <div class="ch-img">${coverHTML(last.courses)}<span class="ch-play">${ICON.play}</span></div>
        <div class="ch-txt"><small>${tr("Continuar onde paraste", "Continue where you left off")}</small><h2>${esc(last.courses.title)}</h2>
          <p>${typeOf(last.courses) === "curso" ? tr("Aula", "Lesson") : tr("Conteúdo", "Content")}: <b>${esc(titles[last.last_lesson_id])}</b></p>
          <div class="progress"><div style="width:${pctOf(last.courses)}%"></div></div><span class="small">${pctOf(last.courses)}% ${tr("concluído", "complete")}</span>
          <span class="btn btn-primary">${ICON.play} ${tr("Continuar", "Continue")}</span></div></a>` : ""}
    ${pending.length ? `<div class="panel"><h3>${tr("Pagamentos pendentes", "Pending payments")}</h3>
      <div class="table-wrap"><table class="table"><thead><tr><th>${tr("Curso", "Course")}</th><th>${tr("Referência", "Reference")}</th><th>${tr("Valor", "Amount")}</th><th></th></tr></thead><tbody>
      ${pending.map((o) => `<tr><td>${esc(o.courses?.title || "")}</td><td><b>${esc(o.reference)}</b></td><td>${esc(mzn(o.amount_mzn))}</td><td><a class="btn btn-sm btn-primary" href="#/checkout/${esc(o.course_id)}">${tr("Concluir pagamento", "Complete payment")}</a></td></tr>`).join("")}
      </tbody></table></div></div>` : ""}
    ${library}
  `);
}

// ---------- Leitor de aulas ----------
// Caixa de suporte do produtor (página de venda e área do aluno)
export function supportBox(c) {
  if (!c.support_email && !c.support_whatsapp && !c.support_info) return "";
  const wa = String(c.support_whatsapp || "").replace(/\D/g, "");
  return `<div class="support-box"><h4>${ICON.help} ${tr("Suporte do produtor", "Creator support")}</h4>
    ${c.support_info ? `<p>${esc(c.support_info).replace(/\n/g, "<br>")}</p>` : ""}
    <div class="sp-links">${wa ? `<a class="btn btn-sm btn-green" href="https://wa.me/${wa}" target="_blank" rel="noopener">${ICON.whats} WhatsApp</a>` : ""}${c.support_email ? `<a class="btn btn-sm btn-soft" href="mailto:${esc(c.support_email)}">${esc(c.support_email)}</a>` : ""}</div></div>`;
}

// Dificulta descarregar vídeos/áudios: bloqueia clique direito e arrastar, e renova o link temporário quando expira
function protectMedia(box, path) {
  const m = box.querySelector("video, audio"); if (!m) return;
  box.addEventListener("contextmenu", (e) => e.preventDefault());
  box.addEventListener("dragstart", (e) => e.preventDefault());
  let renewing = false, tries = 0;
  m.addEventListener("error", async () => {
    if (renewing || ++tries > 3) return; renewing = true;
    const t = m.currentTime, playing = !m.paused;
    try { m.src = await api.materialUrl(path, 600); m.currentTime = t; if (playing) m.play().catch(() => {}); } catch {}
    setTimeout(() => { renewing = false; }, 5000);
  });
  // a marca de água muda de lugar a cada 20 s (desencoraja gravar o ecrã)
  const wm = box.querySelector(".wm");
  if (wm) { const pos = [["8%", "10%"], ["60%", "15%"], ["15%", "70%"], ["55%", "75%"], ["35%", "45%"]]; let i = 0; setInterval(() => { i = (i + 1) % pos.length; wm.style.left = pos[i][0]; wm.style.top = pos[i][1]; }, 20000); }
}

const ago = (v) => {
  const s = Math.max(1, Math.round((Date.now() - new Date(v).getTime()) / 1000));
  if (s < 60) return tr("agora", "now");
  const m = Math.round(s / 60); if (m < 60) return tr(`há ${m} min`, `${m} min ago`);
  const h = Math.round(m / 60); if (h < 24) return tr(`há ${h} h`, `${h} h ago`);
  const d = Math.round(h / 24); if (d < 30) return tr(`há ${d} dia${d > 1 ? "s" : ""}`, `${d} day${d > 1 ? "s" : ""} ago`);
  return date(v);
};

// Comentários e perguntas da aula (alunos perguntam; o produtor responde com selo «Produtor»)
async function mountComments(box, { lesson, owner, highlight }) {
  const me = state.user.id, mod = owner || isAdmin();
  let list = [];
  const one = (c, reply = false) => `<div class="cm ${reply ? "reply" : ""} ${c.is_producer ? "by-prod" : ""} ${highlight === c.id ? "hl" : ""}" id="cm-${esc(c.id)}">
      <span class="cm-av">${esc((c.author_name || "A")[0].toUpperCase())}</span>
      <div class="cm-b"><div class="cm-h"><b>${esc(c.author_name || tr("Aluno", "Student"))}</b>${c.is_producer ? `<span class="cm-badge">${tr("Produtor", "Creator")}</span>` : ""}<small>${esc(ago(c.created_at))}</small></div>
        <p>${esc(c.body).replace(/\n/g, "<br>")}</p>
        <div class="cm-a">${reply ? "" : `<button type="button" class="link-btn" data-reply="${esc(c.id)}">${tr("Responder", "Reply")}</button>`}${c.user_id === me || mod ? `<button type="button" class="link-btn danger" data-cdel="${esc(c.id)}">${tr("Apagar", "Delete")}</button>` : ""}</div>
        <div class="cm-rf" data-rf="${esc(c.id)}"></div></div></div>`;
  const draw = () => {
    const tops = list.filter((c) => !c.parent_id).reverse();
    const kids = (id) => list.filter((c) => c.parent_id === id);
    box.innerHTML = `<h3 class="cm-title">${ICON.chat} ${tr("Comentários e perguntas", "Comments & questions")} <small>${list.length || ""}</small></h3>
      <form class="cm-form" id="cmF"><textarea class="input" name="body" rows="2" maxlength="2000" required minlength="2" placeholder="${mod ? tr("Escreve um aviso ou comentário para os alunos…", "Write a note or comment for students…") : tr("Tens uma dúvida sobre esta aula? Escreve aqui — o produtor responde.", "Got a question about this lesson? Write it here — the creator will reply.")}"></textarea>
        <button class="btn btn-green btn-sm">${tr("Publicar", "Post")}</button></form>
      <div class="cm-list">${tops.length ? tops.map((c) => one(c) + kids(c.id).map((r) => one(r, true)).join("")).join("") : `<p class="muted small cm-empty">${tr("Ainda não há comentários. Sê o primeiro a perguntar!", "No comments yet. Be the first to ask!")}</p>`}</div>`;
    if (highlight) setTimeout(() => document.getElementById(`cm-${highlight}`)?.scrollIntoView({ behavior: "smooth", block: "center" }), 150);
  };
  const load = async () => { try { list = await api.lessonComments(lesson.id); } catch (err) { list = []; box.innerHTML = errorBox(err); return; } draw(); };
  box.onsubmit = async (e) => {
    e.preventDefault();
    const f = e.target, body = f.body.value.trim(), btn = f.querySelector("button");
    if (body.length < 2) return;
    busy(btn, true);
    try { await api.addComment(lesson.id, body, f.dataset.parent || null); highlight = null; await load(); toast(tr("Publicado.", "Posted.")); }
    catch (err) { toast(err.message, "err"); busy(btn, false); }
  };
  box.onclick = async (e) => {
    const r = e.target.closest("[data-reply]");
    if (r) {
      const slot = box.querySelector(`[data-rf="${r.dataset.reply}"]`);
      if (slot.innerHTML) { slot.innerHTML = ""; return; }
      slot.innerHTML = `<form class="cm-form sm" data-parent="${esc(r.dataset.reply)}"><textarea class="input" name="body" rows="2" maxlength="2000" required minlength="2" placeholder="${tr("Escreve a resposta…", "Write your reply…")}"></textarea><button class="btn btn-green btn-sm">${tr("Responder", "Reply")}</button></form>`;
      slot.querySelector("textarea").focus();
      return;
    }
    const d = e.target.closest("[data-cdel]");
    if (d) {
      if (!(await modal({ title: tr("Apagar este comentário?", "Delete this comment?"), confirm: tr("Apagar", "Delete"), danger: true }))) return;
      try { await api.deleteComment(d.dataset.cdel); await load(); } catch (err) { toast(err.message, "err"); }
    }
  };
  await load();
}

export async function learn(main, { id, lesson }, query, alive) {
  const c = await api.course(id);
  if (!alive()) return;
  if (!c) { main.innerHTML = `<section class="page container">${emptyState(tr("Curso não encontrado", "Course not found"))}</section>`; return; }
  const owner = c.producer_id === state.user.id;
  const enr = await api.enrollment(state.user.id, id);
  const enrolled = Boolean(enr);
  if (!enrolled && !owner && !isAdmin()) {
    main.innerHTML = `<section class="page container narrow">${emptyState(tr("Ainda não tens acesso a este curso", "You don't have access to this course yet"), "", `<a class="btn btn-primary" href="#/curso/${esc(id)}">${tr("Ver o curso", "View course")}</a>`)}</section>`;
    return;
  }
  const [mods, done] = await Promise.all([api.courseContent(id), enrolled ? api.progress(state.user.id, id) : new Set()]);
  if (!alive()) return;
  const all = mods.flatMap((m) => m.lessons);
  if (!all.length) { main.innerHTML = `<section class="page container narrow">${emptyState(tr("Este curso ainda não tem aulas.", "This course has no lessons yet."))}</section>`; return; }
  // «Continuar onde parei»: sem aula escolhida, abre a última vista; senão a primeira por concluir
  const resumed = !lesson && enr?.last_lesson_id ? all.find((l) => l.id === enr.last_lesson_id) : null;
  const cur = all.find((l) => l.id === lesson) || resumed || all.find((l) => !done.has(l.id)) || all[0];
  const idx = all.indexOf(cur);
  const next = all[idx + 1], prev = all[idx - 1];
  const pct = Math.round((done.size / all.length) * 100);
  if (enrolled) api.markSeen(cur.id);
  if (resumed && idx > 0) toast(tr("A continuar de onde paraste.", "Picking up where you left off."));
  const wide = window.matchMedia("(min-width: 980px)").matches;
  const curMod = mods.find((m) => m.lessons.includes(cur));
  let n = 0;

  main.innerHTML = `<section class="lx">
    <div class="lx-top">
      <a class="lx-back" href="#/meus-cursos" aria-label="${tr("Os meus cursos", "My courses")}">←</a>
      <div class="lx-tt"><small>${esc(c.producer_name || "")}</small><b>${esc(c.title)}</b></div>
      <div class="lx-pct" title="${done.size}/${all.length}"><span style="--p:${pct}">${pct}%</span></div>
    </div>
    <div class="lx-grid">
      <div class="lx-main">
        <div id="player">${cur.file_path ? `<div class="video">${loading()}</div>`
          : !cur.video_url && cur.pdf_path ? `<div class="doc-view">${ICON.doc}<h3>${esc(cur.title)}</h3><p class="muted">${tr("Este conteúdo é um documento PDF.", "This content is a PDF document.")}</p><button class="btn btn-primary" id="pdf2">${tr("Abrir documento", "Open document")}</button></div>`
          : `<div class="video">${videoEmbed(cur.video_url)}</div>`}</div>
        <div class="lx-bar">
          <div class="lx-info"><small>${esc(curMod?.title || "")} · ${tr("Aula", "Lesson")} ${idx + 1}/${all.length}${cur.duration_min ? ` · ${cur.duration_min} min` : ""}</small><h1>${esc(cur.title)}</h1></div>
          <div class="lx-act">
            ${cur.pdf_path ? `<button class="btn btn-outline-green btn-sm" id="pdf">${ICON.doc} ${tr("Material PDF", "PDF material")}</button>` : ""}
            ${enrolled ? `<button class="btn btn-sm ${done.has(cur.id) ? "btn-outline-green" : "btn-green"}" id="done">${done.has(cur.id) ? `${ICON.check} ${tr("Concluída", "Done")}` : tr("Marcar como concluída", "Mark as done")}</button>` : ""}
          </div>
        </div>
        <div class="lx-nav">
          ${prev ? `<a class="btn btn-ghost-dark btn-sm" href="#/aprender/${esc(id)}/${esc(prev.id)}">← ${tr("Anterior", "Previous")}</a>` : "<span></span>"}
          ${next ? `<a class="btn btn-primary btn-sm" href="#/aprender/${esc(id)}/${esc(next.id)}">${tr("Próxima aula", "Next lesson")} →</a>` : ""}
        </div>
        ${pct === 100 ? `<div class="alert alert-ok small">${tr("Parabéns, concluíste o curso!", "Congratulations, you finished!")}</div>` : ""}
        <details class="lx-list" id="lxList" ${wide ? "open" : ""}>
          <summary><span>${ICON.list} ${tr("Aulas do curso", "Course lessons")}</span><small>${done.size}/${all.length} ${tr("concluídas", "done")}</small><i class="lx-chev">${ICON.down}</i></summary>
          <div class="lx-mods">${mods.map((m, mi) => { const md = m.lessons.filter((l) => done.has(l.id)).length; return `<details class="lx-mod" ${wide || m === curMod ? "open" : ""}>
            <summary><b>${esc(m.title)}</b><small>${md}/${m.lessons.length}</small></summary>
            ${m.lessons.map((l) => { n++; return `<a class="lx-les ${l.id === cur.id ? "on" : ""} ${done.has(l.id) ? "done" : ""}" href="#/aprender/${esc(id)}/${esc(l.id)}">
              <span class="lx-n">${done.has(l.id) ? ICON.check : l.id === cur.id ? ICON.play : n}</span><span class="lx-lt">${esc(l.title)}</span>${l.duration_min ? `<em>${l.duration_min}m</em>` : ""}</a>`; }).join("")}
          </details>`; }).join("")}</div>
        </details>
        <div class="lx-tabs" role="tablist"><button type="button" class="on" data-tab="cm">${ICON.chat} ${tr("Perguntas", "Questions")}</button><button type="button" data-tab="sp">${ICON.help} ${tr("Suporte", "Support")}</button></div>
        <div class="lx-pane" data-pane="cm"><div id="comments">${loading()}</div></div>
        <div class="lx-pane" data-pane="sp" hidden>${supportBox(c) || `<p class="muted small">${tr("O produtor ainda não indicou contactos de suporte.", "The creator hasn't added support contacts yet.")}</p>`}</div>
      </div>
    </div>
  </section>`;
  // move a lista de aulas para a coluna lateral no computador
  if (wide) { const side = document.createElement("aside"); side.className = "lx-side"; side.appendChild(document.getElementById("lxList")); main.querySelector(".lx-grid").appendChild(side); }
  // Oferta especial do produtor (upsell/downsell) — uma vez por produto; útil quando o pagamento foi confirmado mais tarde (manual)
  if (enrolled && !owner && !isAdmin()) mountFunnel(main.querySelector(".lx-nav"), id, { after: true, once: true });
  main.querySelector(".lx-tabs").addEventListener("click", (e) => {
    const t = e.target.closest("[data-tab]"); if (!t) return;
    main.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b === t));
    main.querySelectorAll("[data-pane]").forEach((p) => (p.hidden = p.dataset.pane !== t.dataset.tab));
  });
  main.querySelector(".lx-les.on")?.scrollIntoView({ block: "nearest" });
  mountComments(document.getElementById("comments"), { lesson: cur, owner, highlight: query?.c || null });
  if (cur.file_path) {
    const k = cur.file_kind;
    // Vídeo e áudio: link temporário (10 min, renovado sozinho), sem botão de descarregar, sem clique direito, com marca de água do aluno
    api.materialUrl(cur.file_path, k === "video" || k === "audio" ? 600 : 3600).then((url) => {
      const box = document.getElementById("player"); if (!box) return;
      if (k === "video" || k === "audio") {
        const who = esc(state.user.email || "");
        box.innerHTML = k === "video"
          ? `<div class="video protected"><video src="${esc(url)}" controls playsinline controlslist="nodownload noremoteplayback" disablepictureinpicture disableremoteplayback preload="metadata"></video><span class="wm">${who}</span></div>`
          : `<div class="video protected"><div class="audio-wrap"><audio src="${esc(url)}" controls controlslist="nodownload noremoteplayback" preload="metadata"></audio></div></div>`;
        protectMedia(box, cur.file_path);
        return;
      }
      box.innerHTML = `<div class="doc-view">${ICON.doc}<h3>${esc(cur.title)}</h3><p class="muted">${esc(cur.file_name || "")}</p><a class="btn btn-primary" href="${esc(url)}" target="_blank" rel="noopener">${k === "doc" ? tr("Abrir / ler", "Open / read") : tr("Descarregar ficheiro", "Download file")}</a></div>`;
    }).catch((err) => { const box = document.getElementById("player"); if (box) box.innerHTML = errorBox(err); });
  }
  document.getElementById("pdf2")?.addEventListener("click", () => document.getElementById("pdf")?.click());
  document.getElementById("pdf")?.addEventListener("click", async () => {
    try { window.open(await api.materialUrl(cur.pdf_path), "_blank", "noopener"); } catch (err) { toast(err.message, "err"); }
  });
  document.getElementById("done")?.addEventListener("click", async (e) => {
    const b = e.currentTarget; busy(b, true);
    try {
      const on = !done.has(cur.id);
      await api.setComplete(state.user.id, id, cur.id, on);
      if (on && next) go(`#/aprender/${id}/${next.id}`); else rerender();
    } catch (err) { toast(err.message, "err"); busy(b, false); }
  });
}

// ---------- Ser produtor: qualquer utilizador pode criar; a equipa revê cada produto ----------
export async function becomeProducer(main) {
  main.innerHTML = `<section class="page container narrow center">${loading()}</section>`;
  try {
    if (!isProducer()) { await api.becomeProducer(); await refreshUser(); }
    go("#/produtor/curso/novo");
  } catch (err) { main.innerHTML = `<section class="page container narrow">${errorBox(err)}</section>`; }
}

export { errorBox, statusBadge, date };
