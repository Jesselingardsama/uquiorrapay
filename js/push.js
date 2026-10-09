// Cartão «Notificações de vendas»: liga as notificações neste aparelho (telemóvel, app ou computador).
import { api } from "./api.js?v=202610080932";
import { state, tr, toast, ICON } from "./ui.js?v=202610080932";

const supported = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window && Boolean(state.settings.push_public_key);
const keyBytes = (b64) => {
  const s = b64.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64.length + 3) % 4);
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
};
async function registration() {
  const r = await navigator.serviceWorker.getRegistration("/");
  if (r) return r;
  return navigator.serviceWorker.register("/sw.js", { scope: "/" });
}
async function currentSub() {
  try { const r = await navigator.serviceWorker.getRegistration("/"); return r ? await r.pushManager.getSubscription() : null; } catch { return null; }
}

export const pushCardHTML = () => `<div class="push-card" id="pushCard" hidden></div>`;

export async function wirePush() {
  const box = document.getElementById("pushCard");
  if (!box) return;
  const ios = /iPhone|iPad/i.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches;
  const paint = async () => {
    if (!supported()) {
      if (!ios) { box.hidden = true; return; }
      box.hidden = false;
      box.innerHTML = `<span class="pc-ic">🔔</span><div><b>${tr("Notificações de vendas", "Sales notifications")}</b><small>${tr("No iPhone, instala primeiro a app (Partilhar → Adicionar ao ecrã principal) e abre-a.", "On iPhone, first add the app to your home screen and open it.")}</small></div>`;
      return;
    }
    const sub = await currentSub();
    box.hidden = false;
    if (Notification.permission === "denied") {
      box.className = "push-card off";
      box.innerHTML = `<span class="pc-ic">🔕</span><div><b>${tr("Notificações bloqueadas", "Notifications blocked")}</b><small>${tr("Ativa em Definições do telemóvel → Apps → Uquiorrapay (ou Chrome) → Notificações, e volta a esta página.", "Allow them in your phone settings → Apps → Uquiorrapay (or Chrome) → Notifications.")}</small></div>`;
      return;
    }
    if (sub && Notification.permission === "granted") {
      box.className = "push-card on";
      box.innerHTML = `<span class="pc-ic">🔔</span><div><b>${tr("Notificações de vendas ativas", "Sales notifications on")}</b><small>${tr("Recebes um aviso neste aparelho a cada venda.", "You get an alert on this device for every sale.")}</small></div>
        <div class="pc-btns"><button type="button" class="btn btn-sm btn-soft" data-push="test">${tr("Testar", "Test")}</button><button type="button" class="btn btn-sm btn-ghost-dark" data-push="off">${tr("Desligar", "Turn off")}</button></div>`;
      return;
    }
    box.className = "push-card";
    box.innerHTML = `<span class="pc-ic">🔔</span><div><b>${tr("Recebe um aviso a cada venda", "Get an alert for every sale")}</b><small>${tr("Notificação no telemóvel (ou no computador), mesmo com o site fechado.", "Phone (or computer) notification, even with the site closed.")}</small></div>
      <div class="pc-btns"><button type="button" class="btn btn-sm btn-primary" data-push="on">${ICON.bolt} ${tr("Ativar notificações", "Turn on notifications")}</button></div>`;
  };
  box.addEventListener("click", async (e) => {
    const b = e.target.closest("[data-push]"); if (!b) return;
    b.disabled = true;
    try {
      if (b.dataset.push === "on") {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") { toast(tr("Sem autorização para notificações.", "Notifications not allowed."), "err"); return; }
        const reg = await registration();
        await navigator.serviceWorker.ready;
        const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.settings.push_public_key) });
        await api.savePushSub(sub, navigator.userAgent);
        toast(tr("Notificações ativas! A enviar um teste…", "Notifications on! Sending a test…"));
        await api.pushTest().catch(() => {});
      } else if (b.dataset.push === "test") {
        const r = await api.pushTest();
        toast(r?.push ? tr("Teste enviado. Deve aparecer daqui a pouco.", "Test sent. It should appear shortly.") : tr("Não foi possível enviar. Desliga e volta a ativar.", "Couldn't send. Turn off and on again."), r?.push ? "ok" : "err");
      } else if (b.dataset.push === "off") {
        const sub = await currentSub();
        if (sub) { await api.deletePushSub(sub.endpoint).catch(() => {}); await sub.unsubscribe().catch(() => {}); }
        toast(tr("Notificações desligadas neste aparelho.", "Notifications turned off on this device."));
      }
    } catch (err) { toast(err.message || String(err), "err"); }
    finally { b.disabled = false; paint(); }
  });
  paint();
}
