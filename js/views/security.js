// Segurança da conta: verificação em 2 passos (códigos de 6 dígitos), últimos acessos, sessões
// e registo de segurança da administração.
import { api } from "../api.js?v=202610092030";
import { state, tr, esc, toast, dashShell, ICON, dateTime, modal, copyText, brandHTML, isAdmin, loading, errorBox } from "../ui.js?v=202610092030";
import { go, refreshUser, rerender } from "../app.js?v=202610092030";

const ACTIONS = () => ({
  login: tr("Entrada na conta", "Sign-in"),
  "mfa.on": tr("2 passos ativado", "2-step turned on"),
  "mfa.off": tr("2 passos desativado", "2-step turned off"),
  "password.change": tr("Palavra-passe alterada", "Password changed"),
  "order.paid": tr("Pedido pago", "Order paid"),
  "order.cancelled": tr("Pedido cancelado", "Order cancelled"),
  "order.refunded": tr("Pedido reembolsado", "Order refunded"),
  "order.amount_mismatch": tr("⚠ Valor pago diferente do pedido", "⚠ Paid amount mismatch"),
  "withdrawal.request": tr("Pedido de levantamento", "Withdrawal request"),
  "withdrawal.paid": tr("Levantamento pago", "Withdrawal paid"),
  "withdrawal.rejected": tr("Levantamento recusado", "Withdrawal rejected"),
  "course.approved": tr("Produto aprovado", "Product approved"),
  "course.rejected": tr("Produto recusado", "Product rejected"),
  "course.pending": tr("Produto enviado para revisão", "Product submitted"),
  "course.draft": tr("Produto voltou a rascunho", "Product back to draft"),
  "role.add": tr("Papel atribuído", "Role added"),
  "role.remove": tr("Papel removido", "Role removed"),
  "settings.change": tr("Definição alterada", "Setting changed"),
  "gateway.secret": tr("Chave PaySuite alterada", "PaySuite key changed"),
  "profile.admin_edit": tr("Perfil editado pelo admin", "Profile edited by admin"),
  "admin.recovery_link": tr("Link de nova senha gerado", "Password link generated"),
});
const actLabel = (a) => ACTIONS()[a] || a;
const browser = (ua = "") => {
  ua = String(ua);
  const os = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iPhone/iPad" : /Windows/i.test(ua) ? "Windows" : /Mac OS/i.test(ua) ? "Mac" : /Linux/i.test(ua) ? "Linux" : "";
  const b = /Edg\//.test(ua) ? "Edge" : /OPR\//.test(ua) ? "Opera" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "";
  return [b, os].filter(Boolean).join(" · ") || tr("Navegador desconhecido", "Unknown browser");
};

// ---------- Ecrã de código ao entrar (contas com 2 passos ativo) ----------
export async function mfaChallenge(main) {
  if (!state.user) { go("#/entrar"); return; }
  if (!state.mfaPending) { go("#/painel"); return; }
  let factor;
  try { factor = (await api.mfaFactors()).verified[0]; } catch {}
  main.innerHTML = `<section class="auth3 solo"><div class="auth3-main">
    <div class="auth3-top">${brandHTML("dark")}</div>
    <div class="auth3-card">
      <div class="sec-ic">${ICON.shield}</div>
      <h1>${tr("Verificação em 2 passos", "2-step verification")}</h1>
      <p class="auth3-sub">${tr("Abre a tua app autenticadora (Google Authenticator, Microsoft Authenticator…) e escreve o código de 6 dígitos da Uquiorrapay.", "Open your authenticator app and enter the 6-digit Uquiorrapay code.")}</p>
      <form id="mf" class="form">
        <input class="input code-in" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required placeholder="000000" autofocus>
        <button class="btn btn-green btn-block">${tr("Verificar", "Verify")}</button>
      </form>
      <p class="center small auth3-alt"><a href="#" id="out">${tr("Sair e entrar com outra conta", "Sign out")}</a></p>
      <p class="small muted center">${tr("Perdeste o telemóvel? Fala com o suporte para recuperar a conta.", "Lost your phone? Contact support to recover your account.")}</p>
    </div></div></section>`;
  document.body.classList.add("auth-page");
  const f = document.getElementById("mf");
  f.code.addEventListener("input", () => { f.code.value = f.code.value.replace(/\D/g, "").slice(0, 6); if (f.code.value.length === 6) f.requestSubmit(); });
  document.getElementById("out").addEventListener("click", async (e) => { e.preventDefault(); await api.signOut(); go("#/entrar"); });
  let tries = 0;
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (!factor) { toast(tr("Não encontrámos o teu método de 2 passos.", "No 2-step method found."), "err"); return; }
    const btn = f.querySelector("button"); btn.disabled = true;
    try {
      await api.mfaVerify(factor.id, f.code.value);
      await refreshUser();
      api.logEvent("login");
      let next = null; try { next = sessionStorage.getItem("uq_after_login"); sessionStorage.removeItem("uq_after_login"); } catch {}
      toast(tr("Sessão verificada.", "Session verified."));
      const target = next && next !== "#/verificar" ? next : (isAdmin() ? "#/admin" : "#/painel");
      if (location.hash === target) rerender(); else go(target);
    } catch {
      tries++;
      toast(tr("Código errado ou expirado. Tenta o código novo.", "Wrong or expired code. Try the new code."), "err");
      f.code.value = ""; btn.disabled = false;
      if (tries >= 5) { await api.signOut(); toast(tr("Demasiadas tentativas. Entra novamente.", "Too many attempts. Sign in again."), "err"); go("#/entrar"); }
    }
  });
}

// ---------- Página Segurança da conta ----------
export async function securityPage(main, _p, _q, alive) {
  main.innerHTML = dashShell("seguranca", loading());
  let factors = { verified: [] }, log = [];
  try { [factors, log] = await Promise.all([api.mfaFactors(), api.securityLog({ mine: true, limit: 15 }).catch(() => [])]); }
  catch (err) { if (alive()) main.innerHTML = dashShell("seguranca", errorBox(err)); return; }
  if (!alive()) return;
  const on = factors.verified.length > 0;
  main.innerHTML = dashShell("seguranca", `
    <div class="adm-head"><h1 class="page-title">${tr("Segurança da conta", "Account security")}</h1>${isAdmin() ? `<a class="btn btn-sm btn-ghost-dark" href="#/perfil">${tr("Dados pessoais", "Personal details")}</a>` : ""}</div>
    <div class="panel sec-card ${on ? "ok" : "warn"}">
      <div class="sec-head"><span class="sec-ic sm">${ICON.shield}</span><div>
        <h3>${tr("Verificação em 2 passos", "2-step verification")} ${on ? `<span class="badge st-approved">${tr("Ativa", "On")}</span>` : `<span class="badge st-pending">${tr("Desativada", "Off")}</span>`}</h3>
        <p class="muted">${tr("Além da palavra-passe, pede um código de 6 dígitos gerado no teu telemóvel. Mesmo que alguém descubra a tua senha, não entra sem o código.", "Besides your password, asks for a 6-digit code from your phone. Even if someone learns your password, they can't sign in without the code.")}</p>
      </div></div>
      <div id="mfa-box">${on
        ? `<button class="btn btn-outline-danger" id="mfa-off">${tr("Desativar", "Turn off")}</button>`
        : `<button class="btn btn-green" id="mfa-on">${ICON.shield} ${tr("Ativar verificação em 2 passos", "Turn on 2-step verification")}</button>
           ${isAdmin() ? `<p class="small warn-text">${tr("Recomendado: como administrador, ativa já. Depois de ativo, todas as ações de administração exigem o código.", "Recommended for admins. Once on, all admin actions require the code.")}</p>` : ""}`}</div>
    </div>

    <div class="panel">
      <h3>${tr("Palavra-passe", "Password")}</h3>
      <form id="pw" class="form"><div class="two">
        <label>${tr("Nova palavra-passe", "New password")}<input class="input" name="p1" type="password" autocomplete="new-password" required minlength="10"></label>
        <label>${tr("Repete a nova palavra-passe", "Repeat new password")}<input class="input" name="p2" type="password" autocomplete="new-password" required minlength="10"></label></div>
        <p class="small muted">${tr("Mínimo 10 caracteres, com letras e números. Não uses a mesma senha de outros sites.", "At least 10 characters with letters and numbers. Don't reuse passwords.")}</p>
        <button class="btn btn-green">${tr("Alterar palavra-passe", "Change password")}</button>
      </form>
    </div>

    <div class="panel">
      <div class="row-between"><h3>${tr("Últimos acessos", "Recent activity")}</h3>
        <button class="btn btn-sm btn-soft" id="out-all">${tr("Terminar sessão em todos os aparelhos", "Sign out everywhere")}</button></div>
      <p class="small muted">${tr("Se vires um acesso que não reconheces, muda já a palavra-passe e termina a sessão em todos os aparelhos.", "If you see activity you don't recognise, change your password and sign out everywhere.")}</p>
      ${log.length ? `<div class="sec-log">${log.map((r) => `<div class="sl-row"><b>${esc(actLabel(r.action))}</b><span>${esc(browser(r.user_agent))}${r.ip ? ` · IP ${esc(r.ip)}` : ""}</span><small>${esc(dateTime(r.at))}</small></div>`).join("")}</div>`
        : `<p class="muted">${tr("Ainda sem registos.", "No activity yet.")}</p>`}
    </div>

    <div class="panel sec-tips">
      <h3>${tr("Dicas para manter a conta segura", "Tips to keep your account safe")}</h3>
      <ul>
        <li>${ICON.check} ${tr("A Uquiorrapay nunca pede a tua senha ou código por WhatsApp, SMS ou chamada.", "Uquiorrapay never asks for your password or code by WhatsApp, SMS or phone.")}</li>
        <li>${ICON.check} ${tr("Confirma sempre que o endereço é uquiorrapay.pages.dev antes de entrar.", "Always check the address before signing in.")}</li>
        <li>${ICON.check} ${tr("Não partilhes o teu código M-Pesa/e-Mola com ninguém.", "Never share your M-Pesa/e-Mola PIN.")}</li>
      </ul>
    </div>`);

  document.getElementById("mfa-on")?.addEventListener("click", () => enrollFlow());
  document.getElementById("mfa-off")?.addEventListener("click", async () => {
    const ok = await modal({ title: tr("Desativar a verificação em 2 passos?", "Turn off 2-step verification?"), body: tr("A tua conta fica protegida só pela palavra-passe.", "Your account will be protected by password only."), confirm: tr("Desativar", "Turn off"), danger: true });
    if (!ok) return;
    try {
      await api.logEvent("mfa.off");
      for (const f of factors.verified) await api.mfaUnenroll(f.id);
      await refreshUser();
      toast(tr("Verificação em 2 passos desativada.", "2-step verification turned off."));
      securityPage(main, _p, _q, alive);
    } catch (err) { toast(err.message, "err"); }
  });

  const pw = document.getElementById("pw");
  pw.addEventListener("submit", async (e) => {
    e.preventDefault();
    const a = pw.p1.value, b = pw.p2.value;
    if (a !== b) { toast(tr("As palavras-passe não são iguais.", "Passwords don't match."), "err"); return; }
    if (!(a.length >= 10 && /[a-zA-Z]/.test(a) && /\d/.test(a))) { toast(tr("Usa 10 ou mais caracteres, com letras e números.", "Use 10+ characters with letters and numbers."), "err"); return; }
    const btn = pw.querySelector("button"); btn.disabled = true;
    try { await api.updatePassword(a); api.logEvent("password.change"); pw.reset(); toast(tr("Palavra-passe alterada.", "Password changed.")); }
    catch (err) { toast(/reauth|recent/i.test(err.message) ? tr("Por segurança, sai e entra de novo antes de mudar a senha.", "For security, sign in again first.") : err.message, "err"); }
    btn.disabled = false;
  });

  document.getElementById("out-all").addEventListener("click", async () => {
    const ok = await modal({ title: tr("Terminar todas as sessões?", "Sign out everywhere?"), body: tr("Vais sair deste e de todos os outros aparelhos.", "You'll be signed out on all devices."), confirm: tr("Terminar", "Sign out"), danger: true });
    if (!ok) return;
    await api.signOutEverywhere();
    go("#/entrar");
  });

  async function enrollFlow() {
    const box = document.getElementById("mfa-box");
    box.innerHTML = loading();
    let en;
    try { en = await api.mfaEnroll(); } catch (err) { box.innerHTML = errorBox(err); return; }
    const qr = String(en.totp?.qr_code || "");
    const qrSrc = qr.startsWith("data:") ? qr : `data:image/svg+xml;utf-8,${encodeURIComponent(qr)}`;
    const secret = en.totp?.secret || "";
    box.innerHTML = `<ol class="mfa-steps">
        <li><b>${tr("Instala uma app autenticadora", "Install an authenticator app")}</b><span>${tr("Google Authenticator ou Microsoft Authenticator (grátis, na Play Store / App Store).", "Google Authenticator or Microsoft Authenticator (free).")}</span></li>
        <li><b>${tr("Lê este código QR com a app", "Scan this QR code with the app")}</b>
          <div class="mfa-qr"><img src="${esc(qrSrc)}" alt="QR"></div>
          <span>${tr("Não consegues ler? Escreve esta chave na app:", "Can't scan? Enter this key in the app:")}</span>
          <div class="co-dest"><b class="mono">${esc(secret.replace(/(.{4})/g, "$1 ").trim())}</b><button type="button" class="co-copy" id="cp-sec">${ICON.copy}</button></div></li>
        <li><b>${tr("Escreve o código de 6 dígitos que aparece na app", "Enter the 6-digit code shown in the app")}</b>
          <form id="mfa-v" class="form inline-code"><input class="input code-in" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required placeholder="000000"><button class="btn btn-green">${tr("Confirmar e ativar", "Confirm and turn on")}</button></form></li>
      </ol>
      <p class="small muted">${tr("Guarda bem o telemóvel. Se o perderes, contacta o suporte para recuperar o acesso.", "Keep your phone safe. If you lose it, contact support.")}</p>`;
    document.getElementById("cp-sec").addEventListener("click", () => copyText(secret));
    const v = document.getElementById("mfa-v");
    v.code.addEventListener("input", () => { v.code.value = v.code.value.replace(/\D/g, "").slice(0, 6); });
    v.addEventListener("submit", async (e) => {
      e.preventDefault();
      const btn = v.querySelector("button"); btn.disabled = true;
      try {
        await api.mfaVerify(en.id, v.code.value);
        await refreshUser();
        api.logEvent("mfa.on");
        toast(tr("Verificação em 2 passos ativada!", "2-step verification is on!"));
        securityPage(main, _p, _q, alive);
      } catch { toast(tr("Código errado. Confirma a hora do telemóvel e tenta o código novo.", "Wrong code. Check your phone's clock and try again."), "err"); btn.disabled = false; v.code.value = ""; }
    });
  }
}

// ---------- Admin: registo de segurança ----------
export async function adminSecurityLog() {
  const rows = await api.securityLog({ limit: 200 });
  const bad = rows.filter((r) => r.action === "order.amount_mismatch").length;
  return `${bad ? `<div class="alert alert-err">${tr(`Atenção: ${bad} pagamento(s) com valor diferente do pedido foram bloqueados.`, `Warning: ${bad} payment(s) with mismatched amount were blocked.`)}</div>` : ""}
    <p class="muted small">${tr("Tudo o que muda dinheiro, papéis ou definições fica registado aqui automaticamente e não pode ser apagado pelo site.", "Everything that changes money, roles or settings is logged here automatically and cannot be deleted from the site.")}</p>
    ${rows.length ? `<div class="table-wrap"><table class="table"><thead><tr><th>${tr("Quando", "When")}</th><th>${tr("Ação", "Action")}</th><th>${tr("Quem", "Who")}</th><th>${tr("Alvo", "Target")}</th><th>${tr("Origem", "Origin")}</th></tr></thead><tbody>
      ${rows.map((r) => `<tr class="${r.action === "order.amount_mismatch" ? "row-alert" : ""}"><td>${esc(dateTime(r.at))}</td><td><b>${esc(actLabel(r.action))}</b></td><td>${esc(r.actor_email || (r.actor ? "—" : tr("Sistema / PaySuite", "System / PaySuite")))}</td><td><small>${esc(String(r.target || "").slice(0, 40))}</small></td><td><small>${esc(r.ip || "")}${r.user_agent ? ` · ${esc(browser(r.user_agent))}` : ""}</small></td></tr>`).join("")}
    </tbody></table></div>` : `<p class="muted">${tr("Ainda sem registos.", "No entries yet.")}</p>`}`;
}
