// Proteção anti-robô (Cloudflare Turnstile) nos formulários de entrar, criar conta e recuperar senha.
// Só fica ativa quando a chave do site (pública) é guardada em Admin → Definições.
import { state, tr } from "./ui.js?v=202610092130";

let loader;
function load() {
  if (window.turnstile) return Promise.resolve();
  if (!loader) {
    loader = new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => res();
      s.onerror = () => { loader = null; rej(new Error("captcha")); };
      document.head.appendChild(s);
    });
  }
  return loader;
}

export const captchaOn = () => typeof state.settings.turnstile_site_key === "string" && state.settings.turnstile_site_key.trim().length > 10;

// Coloca o desafio antes do botão principal do formulário. Devolve { token(), reset(), check() }.
export async function mountCaptcha(form) {
  const none = { token: () => undefined, reset() {}, check: () => true };
  if (!captchaOn() || !form) return none;
  const box = document.createElement("div");
  box.className = "captcha";
  const btn = form.querySelector("button.btn-green") || form.querySelector("button");
  (btn || form.lastElementChild)?.before(box);
  let tok, id;
  try {
    await load();
    id = window.turnstile.render(box, {
      sitekey: state.settings.turnstile_site_key.trim(),
      language: state.lang === "en" ? "en" : "pt",
      callback: (t) => { tok = t; },
      "expired-callback": () => { tok = undefined; },
      "error-callback": () => { tok = undefined; },
    });
  } catch {
    box.innerHTML = `<small class="muted">${tr("Não foi possível carregar a verificação anti-robô. Recarrega a página.", "Could not load the anti-bot check. Reload the page.")}</small>`;
  }
  return {
    token: () => tok,
    reset() { tok = undefined; try { window.turnstile.reset(id); } catch {} },
    check() { return Boolean(tok); },
  };
}
