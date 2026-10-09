// Assistente com IA (canto inferior direito): responde a dúvidas e recomenda produtos à venda.
// Só aparece quando o admin liga «Respostas por IA» nas Definições.
import { api } from "./api.js?v=202610092130";
import { state, tr, esc } from "./ui.js?v=202610092130";

const KEY = "uq_ai_chat";
const ICON_AI = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M12 8.5l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9z" fill="currentColor"/></svg>`;
let msgs = [];
let busy = false;
try { msgs = JSON.parse(sessionStorage.getItem(KEY) || "[]").slice(-20); } catch { msgs = []; }
const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs.slice(-20))); } catch {} };

// Texto da IA → HTML seguro (só negrito, listas e links internos #/…)
function md(t) {
  return esc(t)
    .replace(/\[([^\]]{1,120})\]\((#\/[a-z0-9\-/?=&]{1,120})\)/gi, (_m, label, href) => `<a href="${href}">${label}</a>`)
    .replace(/\*\*([^*]{1,200})\*\*/g, "<b>$1</b>")
    .replace(/(^|\n)[•\-*] (.+)/g, "$1<span class=\"li\">• $2</span>")
    .replace(/\n/g, "<br>");
}

function el() { return document.getElementById("ai-chat"); }
function renderMsgs() {
  const box = el()?.querySelector(".aic-msgs"); if (!box) return;
  const hello = `<div class="aic-m bot">${md(tr("Olá! 👋 Sou o assistente da Uquiorrapay. Posso ajudar a encontrar um curso ou ebook, explicar como comprar, ou como vender os teus produtos.", "Hi! 👋 I'm the Uquiorrapay assistant. I can help you find a course or ebook, explain how to buy, or how to sell your products."))}</div>`;
  const chips = msgs.length ? "" : `<div class="aic-chips">${[
    tr("Que curso me recomendas?", "What course do you recommend?"),
    tr("Como faço para comprar?", "How do I buy?"),
    tr("Como vendo os meus produtos?", "How do I sell my products?"),
    tr("Como recebo o dinheiro das vendas?", "How do I get paid?"),
  ].map((q) => `<button type="button" class="chip">${esc(q)}</button>`).join("")}</div>`;
  box.innerHTML = hello + msgs.map((m) => `<div class="aic-m ${m.role === "user" ? "me" : "bot"}">${m.role === "user" ? esc(m.content) : md(m.content)}</div>`).join("") + chips + (busy ? `<div class="aic-m bot typing"><span></span><span></span><span></span></div>` : "");
  box.scrollTop = box.scrollHeight;
}

async function send(text) {
  text = String(text || "").trim().slice(0, 1500);
  if (!text || busy) return;
  msgs.push({ role: "user", content: text });
  busy = true; renderMsgs(); save();
  try {
    const r = await api.aiAsk({ mode: "chat", messages: msgs.slice(-10) });
    msgs.push({ role: "assistant", content: r.text || "…" });
  } catch (err) {
    msgs.push({ role: "assistant", content: err.message + " " + tr("Também podes falar connosco em [Contacto](#/contacto).", "You can also reach us at [Contact](#/contacto).") });
  }
  busy = false; save(); renderMsgs();
}

function open() {
  const c = el(); if (!c) return;
  c.classList.add("open");
  renderMsgs();
  setTimeout(() => c.querySelector("textarea")?.focus(), 50);
}
function close() { el()?.classList.remove("open"); }

export function mountAssistant() {
  const on = Boolean(state.settings.ai && state.settings.ai.assistant);
  let c = el();
  if (!on) { c?.remove(); document.body.classList.remove("has-ai"); return; }
  document.body.classList.add("has-ai");
  if (c) return;
  c = document.createElement("div");
  c.id = "ai-chat";
  c.innerHTML = `<button type="button" class="aic-fab" aria-label="${tr("Assistente", "Assistant")}">${ICON_AI}<span>${tr("Ajuda", "Help")}</span></button>
    <section class="aic-panel" role="dialog" aria-label="${tr("Assistente Uquiorrapay", "Uquiorrapay assistant")}">
      <header><b>${ICON_AI} ${tr("Assistente", "Assistant")}</b><small>${tr("Respostas por IA — podem ter erros", "AI answers — may contain mistakes")}</small>
        <button type="button" class="aic-new" title="${tr("Nova conversa", "New chat")}">↺</button><button type="button" class="aic-x" aria-label="${tr("Fechar", "Close")}">×</button></header>
      <div class="aic-msgs" aria-live="polite"></div>
      <form class="aic-form"><textarea rows="1" maxlength="1500" placeholder="${tr("Escreve a tua pergunta…", "Type your question…")}"></textarea><button class="btn btn-green btn-sm" aria-label="${tr("Enviar", "Send")}">➤</button></form>
    </section>`;
  document.body.appendChild(c);
  c.addEventListener("click", (e) => {
    if (e.target.closest(".aic-fab")) { c.classList.contains("open") ? close() : open(); return; }
    if (e.target.closest(".aic-x")) { close(); return; }
    if (e.target.closest(".aic-new")) { msgs = []; save(); renderMsgs(); return; }
    const chip = e.target.closest(".chip"); if (chip) { send(chip.textContent); return; }
    const a = e.target.closest(".aic-msgs a[href^='#/']"); if (a && innerWidth < 720) close();
  });
  const ta = c.querySelector("textarea");
  c.querySelector("form").addEventListener("submit", (e) => { e.preventDefault(); const v = ta.value; ta.value = ""; send(v); });
  ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); c.querySelector("form").requestSubmit(); } });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
