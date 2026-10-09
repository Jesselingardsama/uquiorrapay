// Verificação de identidade (KYC): o utilizador envia a frente e o verso do documento; a equipa confirma.
import { api } from "../api.js?v=202610080932";
import { state, tr, esc, toast, dashShell, ICON, dateTime } from "../ui.js?v=202610080932";
import { rerender } from "../app.js?v=202610080932";

export const DOCS = () => ({ bi: tr("Bilhete de Identidade (BI)", "National ID (BI)"), passaporte: tr("Passaporte", "Passport"), dire: "DIRE", carta: tr("Carta de condução", "Driving licence") });
export const KYC_TXT = () => ({ pending: tr("Em análise", "Under review"), approved: tr("Verificada", "Verified"), rejected: tr("Recusada", "Rejected") });

function busy(btn, on) { if (btn) { btn.disabled = on; btn.classList.toggle("busy", on); } }

// Caixa de uma fotografia: «Tirar foto» (abre a câmara) ou «Galeria / ficheiro»
const drop = (name, kind, title, sub, subId = "") => `<div class="kyc-drop" data-kind="${kind}" data-name="${name}">
    <b>${ICON.doc} ${title}</b><small${subId ? ` id="${subId}"` : ""}>${sub}</small>
    <img class="kd-prev" alt="" hidden>
    <span class="kf-name"></span>
    <div class="kd-btns">
      <label class="btn btn-sm btn-green">📷 ${tr("Tirar foto", "Take photo")}<input type="file" name="${name}_cam" accept="image/*" capture="environment" hidden></label>
      <label class="btn btn-sm btn-soft">🖼️ ${tr("Galeria / ficheiro", "Gallery / file")}<input type="file" name="${name}" accept="image/*,.jpg,.jpeg,.png,.webp,.heic,application/pdf" hidden></label>
    </div></div>`;
// Guarda no aparelho o que já foi enviado e o que foi escrito: se o telemóvel recarregar a página ao abrir a câmara, nada se perde
const KEY = () => `uq_kyc_${state.user?.id || ""}`;
const loadDraft = () => { try { return JSON.parse(sessionStorage.getItem(KEY()) || "{}"); } catch { return {}; } };
const saveDraft = (d) => { try { sessionStorage.setItem(KEY(), JSON.stringify(d)); } catch {} };

export async function verification(main, _p, _q, alive) {
  const r = await api.kycMine().catch(() => ({ kyc: null, hold: null }));
  if (!alive()) return;
  const k = r.kyc, h = r.hold;
  const p = state.profile || {};
  const days = Number(state.settings.kyc?.withdraw_days ?? 3);
  const status = k?.status || "none";
  const head = `<h1 class="page-title">${tr("Verificação de identidade", "Identity verification")}</h1>
    <p class="muted">${tr("Para tua segurança e para cumprir as regras contra fraude e branqueamento de capitais, precisamos de confirmar quem és antes do primeiro levantamento.", "For your security and to comply with anti-fraud and anti-money-laundering rules, we need to confirm who you are before your first withdrawal.")}</p>`;
  const holdBox = h?.withdraw_hold ? `<div class="alert alert-err">${ICON.lock} <b>${tr("Levantamentos temporariamente retidos", "Withdrawals temporarily on hold")}</b> — ${esc(h.reason || "")}. ${tr("Fala com o suporte para resolver.", "Contact support to resolve it.")} <a href="#/contacto">${tr("Contacto", "Contact")}</a></div>` : "";

  if (status === "approved" || status === "pending") {
    main.innerHTML = dashShell("verificacao", `${head}${holdBox}
      <div class="card-box kyc-state st-${status}">
        <div class="ks-ic">${status === "approved" ? ICON.check : ICON.clock}</div>
        <div><h2>${status === "approved" ? tr("Identidade verificada", "Identity verified") : tr("Documentos em análise", "Documents under review")}</h2>
          <p class="muted">${status === "approved" ? tr(`Podes pedir levantamentos. O prazo de processamento é de até ${days} dias.`, `You can request withdrawals. Processing takes up to ${days} days.`) : tr("Normalmente respondemos em até 2 dias úteis. Recebes a resposta aqui.", "We usually reply within 2 business days. You'll see the answer here.")}</p>
          <p class="small">${esc(k.full_name)} · ${esc(DOCS()[k.doc_type] || k.doc_type)} · ${tr("enviado", "sent")} ${esc(dateTime(k.submitted_at))}</p>
          ${status === "approved" ? `<a class="btn btn-green btn-sm" href="#/carteira/levantamentos">${tr("Ir para levantamentos", "Go to withdrawals")}</a>` : ""}</div>
      </div>`);
    return;
  }

  main.innerHTML = dashShell("verificacao", `${head}${holdBox}
    ${status === "rejected" ? `<div class="alert alert-err"><b>${tr("Verificação recusada", "Verification rejected")}:</b> ${esc(k.rejection_reason || "")} — ${tr("corrige e envia de novo.", "fix it and send again.")}</div>` : ""}
    <form id="kf" class="card-box form kyc-form" novalidate>
      <h2>${tr("1. Os teus dados", "1. Your details")}</h2>
      <label>${tr("Nome completo (igual ao documento)", "Full name (as on the document)")}<input class="input" name="full_name" required minlength="5" maxlength="120" value="${esc(k?.full_name || p.full_name || "")}"></label>
      <div class="two">
        <label>${tr("Tipo de documento", "Document type")}<select class="input" name="doc_type">${Object.entries(DOCS()).map(([v, l]) => `<option value="${v}" ${k?.doc_type === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <label>${tr("Número do documento", "Document number")}<input class="input" name="doc_number" required minlength="5" maxlength="30" autocomplete="off"></label>
      </div>
      <label>${tr("Data de nascimento", "Date of birth")}<input class="input" name="birth_date" type="date" required max="${new Date(Date.now() - 18 * 365.25 * 864e5).toISOString().slice(0, 10)}"></label>
      <label>${tr("Morada (bairro, cidade)", "Address (area, city)")}<input class="input" name="address" required minlength="5" maxlength="200" placeholder="${tr("Ex.: Bairro Cololo, Quelimane", "E.g. Bairro Cololo, Quelimane")}"></label>

      <h2>${tr("2. Fotografias do documento", "2. Document photos")}</h2>
      <p class="small muted">${tr("Fotos nítidas, sem reflexos, com os 4 cantos do documento visíveis. Podes tirar a foto agora ou escolher da galeria (JPG, PNG, WEBP ou PDF). Cada foto é enviada logo que a escolhes.", "Clear photos, no glare, all 4 corners visible. Take the photo now or pick it from your gallery (JPG, PNG, WEBP or PDF). Each photo uploads as soon as you pick it.")}</p>
      <div class="kyc-files">
        ${drop("front", "frente", tr("Frente do documento", "Document front"), tr("Obrigatório", "Required"))}
        ${drop("back", "verso", tr("Verso do documento", "Document back"), tr("Obrigatório para BI, DIRE e carta", "Required for ID, DIRE and licence"), "backReq")}
      </div>

      <label class="check"><input type="checkbox" name="consent" required> <span>${tr("Confirmo que os dados são verdadeiros e autorizo a Uquiorrapay a verificá-los junto de parceiros de pagamento e prestadores tecnológicos, apenas para segurança, prevenção de fraude e cumprimento legal. Ver a", "I confirm the details are true and authorise Uquiorrapay to verify them with payment partners and technology providers, only for security, fraud prevention and legal compliance. See the")} <a href="#/privacidade" target="_blank">${tr("Política de Privacidade", "Privacy Policy")}</a>.</span></label>
      <p class="err-text kyc-err" id="kErr" role="alert"></p>
      <button class="btn btn-green">${ICON.shield} ${tr("Enviar para verificação", "Submit for verification")}</button>
      <p class="small muted">${ICON.lock} ${tr("Os documentos ficam guardados em área privada e só a equipa de verificação os pode ver.", "Documents are stored privately and only the verification team can see them.")}</p>
    </form>`);

  const f = document.getElementById("kf"), kErr = document.getElementById("kErr");
  const needBack = () => f.doc_type.value !== "passaporte";
  const syncBack = () => { document.getElementById("backReq").textContent = needBack() ? tr("Obrigatório", "Required") : tr("Opcional para passaporte", "Optional for passport"); };
  syncBack(); f.doc_type.addEventListener("change", syncBack);
  // Cada fotografia é enviada logo que é escolhida (mostra progresso, pré-visualização e erro na própria caixa)
  const draft = loadDraft();
  const up = {}; // name -> { path, job, err }
  for (const n of ["full_name", "doc_type", "doc_number", "birth_date", "address"]) if (draft.f?.[n] && f[n] && !(n === "full_name" && f[n].value)) f[n].value = draft.f[n];
  syncBack();
  const keepForm = () => { const d = loadDraft(); d.f = Object.fromEntries(["full_name", "doc_type", "doc_number", "birth_date", "address"].map((n) => [n, f[n]?.value || ""])); saveDraft(d); };
  f.addEventListener("input", keepForm); f.addEventListener("change", (e) => { if (e.target.type !== "file") keepForm(); });
  const markDone = (box, label) => { box.classList.remove("busy-up", "bad"); box.classList.add("has"); box.querySelector(".kf-name").textContent = `✓ ${tr("Enviado", "Uploaded")}${label ? ` — ${label}` : ""}`; };
  for (const [name, v] of Object.entries(draft.up || {})) {
    const box = f.querySelector(`.kyc-drop[data-name="${name}"]`);
    if (box && v?.path) { up[name] = { path: v.path }; markDone(box, v.label || ""); }
  }
  f.querySelectorAll(".kyc-drop input[type=file]").forEach((inp) => inp.addEventListener("change", () => {
    const box = inp.closest(".kyc-drop"), name = box.dataset.name, file = inp.files[0], tag = box.querySelector(".kf-name"), prev = box.querySelector(".kd-prev");
    if (!file) return;
    box.classList.remove("has", "bad"); box.classList.add("busy-up"); tag.textContent = tr("A preparar a foto…", "Preparing the photo…"); kErr.textContent = "";
    prev.hidden = true;
    if (/^image\//.test(file.type) && !/heic|heif/i.test(file.type)) { try { prev.src = URL.createObjectURL(file); prev.hidden = false; prev.onerror = () => { prev.hidden = true; }; } catch {} }
    const job = api.kycUpload(file, box.dataset.kind, (fr) => { if (typeof fr === "number") tag.textContent = tr(`A enviar… ${Math.round(fr * 100)}%`, `Uploading… ${Math.round(fr * 100)}%`); })
      .then((path) => {
        up[name] = { path }; markDone(box, file.name || "");
        const d = loadDraft(); d.up = { ...(d.up || {}), [name]: { path, label: file.name || "" } }; saveDraft(d);
        return path;
      })
      .catch((err) => { up[name] = { err: err.message }; box.classList.remove("busy-up"); box.classList.add("bad"); prev.hidden = true; tag.textContent = `${err.message} ${tr("Tenta de novo com «Tirar foto» ou outra imagem.", "Try again with “Take photo” or another image.")}`; return null; })
      .finally(() => { inp.value = ""; });
    up[name] = { job };
  }));
  f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(f));
    const fail = (m, el) => { kErr.textContent = m; el?.scrollIntoView({ behavior: "smooth", block: "center" }); };
    if (String(fd.full_name || "").trim().length < 5) return fail(tr("Escreve o nome completo, igual ao documento.", "Enter your full name as on the document."), f.full_name);
    if (String(fd.doc_number || "").replace(/\s/g, "").length < 5) return fail(tr("Escreve o número do documento (pelo menos 5 caracteres).", "Enter the document number (at least 5 characters)."), f.doc_number);
    if (!fd.birth_date) return fail(tr("Escolhe a data de nascimento.", "Choose your date of birth."), f.birth_date);
    if (fd.birth_date > f.birth_date.max) return fail(tr("Tens de ter pelo menos 18 anos.", "You must be at least 18."), f.birth_date);
    if (String(fd.address || "").trim().length < 5) return fail(tr("Escreve a morada (bairro e cidade).", "Enter your address (area and city)."), f.address);
    const btn = f.querySelector("button.btn-green"); busy(btn, true);
    await Promise.all(Object.values(up).map((x) => x.job).filter(Boolean));
    const front = up.front?.path, back = up.back?.path || null;
    if (!front) { busy(btn, false); return fail(up.front?.err || tr("Falta a fotografia da frente do documento.", "Missing the document front photo."), f.querySelector('[data-name="front"]')); }
    if (needBack() && !back) { busy(btn, false); return fail(up.back?.err || tr("Falta a fotografia do verso do documento.", "Missing the document back photo."), f.querySelector('[data-name="back"]')); }
    if (!f.consent.checked) { busy(btn, false); return fail(tr("Marca a confirmação no fim do formulário.", "Tick the confirmation at the end of the form."), f.consent); }
    try {
      await api.kycSubmit({ full_name: fd.full_name.trim(), doc_type: fd.doc_type, doc_number: fd.doc_number, birth_date: fd.birth_date, address: fd.address.trim(), front_path: front, back_path: back, selfie_path: null });
      saveDraft({});
      toast(tr("Documentos enviados! Recebes a resposta aqui.", "Documents sent! You'll see the answer here."));
      rerender();
    } catch (err) { kErr.textContent = err.message; busy(btn, false); }
  });
}
