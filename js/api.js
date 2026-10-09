// Única camada que fala com o Supabase. Todas as funções devolvem dados ou lançam Error.
import { CONFIG } from "./config.js?v=202610092030";

// Se a sessão expirou (comum no telemóvel depois de estar parado), renova e repete o pedido sozinho.
// Antes era preciso repetir a acção duas vezes (a 1.ª falhava, a 2.ª já ia com a sessão renovada).
let refreshing = null;
async function freshToken() {
  refreshing = refreshing || sb.auth.refreshSession().finally(() => { setTimeout(() => { refreshing = null; }, 0); });
  const { data } = await refreshing;
  return data?.session?.access_token || null;
}
async function authFetch(input, init = {}) {
  const res = await fetch(input, init);
  const url = typeof input === "string" ? input : input?.url || "";
  if (url.includes("/auth/v1/")) return res;
  let expired = res.status === 401;
  if (!expired && [400, 403].includes(res.status) && url.includes("/storage/v1/")) {
    try { expired = /jwt|expired/i.test(await res.clone().text()); } catch {}
  }
  if (!expired) return res;
  const h = new Headers(init.headers || (typeof input !== "string" ? input.headers : undefined) || {});
  if (!/^Bearer\s+ey/.test(h.get("Authorization") || "")) return res; // pedido sem sessão de utilizador
  try {
    const t = await freshToken();
    if (!t) return res;
    h.set("Authorization", `Bearer ${t}`);
    return await fetch(input, { ...init, headers: h });
  } catch { return res; }
}
const sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: authFetch },
});
// Ao voltar à página (telemóvel), renova a sessão antes de o utilizador fazer alguma coisa
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") sb.auth.getSession().catch(() => {}); });

function ok({ data, error }) {
  if (error) throw new Error(error.message || String(error));
  return data;
}

// ---------- Verificação de ficheiros antes de enviar (anti-vírus básico) ----------
const BLOCKED_EXT = /\.(exe|msi|bat|cmd|com|scr|pif|vbs|vbe|js|jse|wsf|wsh|ps1|psm1|sh|bash|jar|apk|app|dmg|dll|so|html?|xhtml|svg|php|py|rb|pl|hta|lnk|reg|iso|docm|xlsm|pptm|dotm|xltm|doc|xls|ppt)$/i;
export async function checkFileSafe(file, { images = false } = {}) {
  const name = String(file?.name || "");
  if (BLOCKED_EXT.test(name)) throw new Error("Por segurança, este tipo de ficheiro não é aceite.");
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const txt = String.fromCharCode(...head);
  const hex = Array.from(head.slice(0, 4), (b) => b.toString(16).padStart(2, "0")).join("");
  const exe = txt.startsWith("MZ") || hex === "7f454c46" || txt.startsWith("#!") || ["cafebabe", "feedface", "feedfacf", "cefaedfe", "cffaedfe"].includes(hex);
  if (exe) throw new Error("Este ficheiro parece um programa (executável) e foi bloqueado.");
  if (/^\s*</.test(txt) && !/\.txt$/i.test(name)) throw new Error("Este ficheiro contém código de página web e foi bloqueado.");
  const ext = (name.split(".").pop() || "").toLowerCase();
  const ok = {
    pdf: txt.startsWith("%PDF"),
    zip: txt.startsWith("PK"), epub: txt.startsWith("PK"), docx: txt.startsWith("PK"), xlsx: txt.startsWith("PK"), pptx: txt.startsWith("PK"),
    png: hex === "89504e47", jpg: hex.startsWith("ffd8ff"), jpeg: hex.startsWith("ffd8ff"), webp: txt.startsWith("RIFF") && txt.slice(8, 12) === "WEBP",
  }[ext];
  if (ok === false) throw new Error("O conteúdo do ficheiro não corresponde à extensão (." + ext + "). Foi bloqueado.");
  if (images && !["png", "jpg", "jpeg", "webp"].includes(ext)) throw new Error("Usa uma imagem JPG, PNG ou WEBP.");
  return true;
}
export const MAX_UPLOAD_MB = 30;

// ---------- Envio de ficheiros com barra de progresso e novas tentativas ----------
// O telemóvel muitas vezes não diz o tipo do ficheiro (ou diz um tipo estranho). Decidimos pela extensão.
const MIME = {
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav", ogg: "audio/ogg", oga: "audio/ogg", opus: "audio/ogg",
  pdf: "application/pdf", epub: "application/epub+zip", zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", txt: "text/plain",
};
const extOf = (name) => (String(name).split(".").pop() || "").toLowerCase();
export function mimeFor(file) {
  const ext = extOf(file.name);
  if (MIME[ext]) return MIME[ext];
  const t = String(file.type || "");
  if (/^video\//.test(t)) return "video/mp4";
  if (/^audio\//.test(t)) return "audio/mpeg";
  throw new Error(`Formato «.${ext || "?"}» não aceite. Aceitamos: MP4, MOV, MP3, M4A, WAV, PDF, EPUB, ZIP, Word, Excel, PowerPoint, JPG, PNG e TXT.`);
}
const safeName = (n) => String(n).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(-80) || "ficheiro";

// Capa: converte qualquer foto (incl. as grandes do telemóvel) para JPG leve, 1600 px de largura no máximo
async function prepareCover(file) {
  if (!/^image\//.test(file.type || "") && !/\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(file.name || "")) throw new Error("Escolhe uma imagem (JPG ou PNG).");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("Não foi possível abrir esta imagem. Usa JPG ou PNG (no iPhone: partilhar → guardar como JPG).")); i.src = url; });
    const scale = Math.min(1, 1600 / Math.max(img.naturalWidth, 1));
    const w = Math.max(1, Math.round(img.naturalWidth * scale)), h = Math.max(1, Math.round(img.naturalHeight * scale));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, w, h); ctx.drawImage(img, 0, 0, w, h);
    const blob = await new Promise((res) => c.toBlob(res, "image/jpeg", 0.85));
    if (!blob) throw new Error("Não foi possível preparar a imagem.");
    return blob;
  } finally { URL.revokeObjectURL(url); }
}

function uploadError(status, body) {
  const msg = String(body?.message || body?.error || "");
  if (status === 413 || /size|large|exceed/i.test(msg)) return `Ficheiro demasiado grande (máx. ${MAX_UPLOAD_MB} MB).`;
  if (status === 415 || /mime|type/i.test(msg)) return "Formato de ficheiro não aceite.";
  if (status === 401 || /jwt|token|expired/i.test(msg)) return "A tua sessão expirou. Entra de novo e repete o envio.";
  if (status === 403 || /row-level|policy|unauthori/i.test(msg)) return "Sem permissão para enviar para este produto. Confirma que entraste com a conta dona do produto (e o código de 2 passos, se tiveres).";
  if (status === 409 || /exists|duplicate/i.test(msg)) return "Já existe um ficheiro com este nome. Tenta de novo.";
  return msg || `Falha no envio (erro ${status}).`;
}

// Envia com XMLHttpRequest para ter progresso real. Tenta de novo até 2 vezes se a internet falhar.
async function xhrUpload(bucket, path, blob, contentType, onProgress, { upsert = false } = {}) {
  const enc = path.split("/").map(encodeURIComponent).join("/");
  for (let attempt = 0; ; attempt++) {
    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("A tua sessão expirou. Entra de novo e repete o envio.");
    try {
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${CONFIG.SUPABASE_URL}/storage/v1/object/${bucket}/${enc}`);
        xhr.setRequestHeader("Authorization", `Bearer ${token}`);
        xhr.setRequestHeader("apikey", CONFIG.SUPABASE_KEY);
        xhr.setRequestHeader("x-upsert", upsert ? "true" : "false");
        xhr.setRequestHeader("Content-Type", contentType);
        xhr.setRequestHeader("cache-control", "max-age=3600");
        xhr.timeout = 15 * 60 * 1000;
        xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(e.loaded / e.total); };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) { onProgress?.(1); resolve(); return; }
          let body = {}; try { body = JSON.parse(xhr.responseText); } catch {}
          const code = Number(body.statusCode) || xhr.status;
          const err = new Error(uploadError(code, body));
          err.expired = code === 401 || /jwt|token|expired/i.test(String(body.message || body.error || ""));
          err.fatal = !err.expired;
          reject(err);
        };
        xhr.onerror = () => reject(new Error("A ligação à internet falhou durante o envio."));
        xhr.ontimeout = () => reject(new Error("O envio demorou demasiado. Verifica a internet e tenta de novo."));
        onProgress?.(0, () => xhr.abort());
        xhr.onabort = () => { const e = new Error("Envio cancelado."); e.fatal = true; e.cancelled = true; reject(e); };
        xhr.send(blob);
      });
      return;
    } catch (err) {
      if (err.fatal || attempt >= 2) throw err;
      if (err.expired) { await freshToken().catch(() => {}); continue; } // sessão expirada: renova e envia logo de novo
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
}

const COURSE_COLS = "id,producer_id,producer_name,title,subtitle,description,cover_url,category,language,price_mzn,status,rejection_reason,featured,product_type,affiliate_enabled,affiliate_pct,learn_points,requirements,audience,support_email,support_whatsapp,support_info,promo_video_url,compare_price_mzn,bonuses,price_usd,sponsored_until,created_at,updated_at,submitted_at,approved_at,meta_pixel_id,guarantee_enabled,bump_course_id,bump_price_mzn,bump_text,upsell_course_id,upsell_price_mzn,upsell_text,downsell_course_id,downsell_price_mzn,downsell_text";

export const api = {
  // ---------- Sessão ----------
  async session() {
    const { data } = await sb.auth.getSession();
    return data.session;
  },
  onAuthChange(cb) {
    sb.auth.onAuthStateChange((event, session) => cb(event, session));
  },
  async signUp({ email, password, full_name, phone, country, captchaToken }) {
    return ok(await sb.auth.signUp({
      email, password,
      options: { data: { full_name, phone, country }, emailRedirectTo: location.origin + location.pathname, ...(captchaToken ? { captchaToken } : {}) },
    }));
  },
  async resendConfirmation(email) {
    return ok(await sb.auth.resend({ type: "signup", email, options: { emailRedirectTo: location.origin + location.pathname } }));
  },
  async signIn({ email, password, captchaToken }) {
    return ok(await sb.auth.signInWithPassword({ email, password, options: captchaToken ? { captchaToken } : undefined }));
  },
  // ---------- Verificação em 2 passos (códigos de app autenticadora, TOTP) ----------
  async mfaLevel() {
    const { data, error } = await sb.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error) return { currentLevel: null, nextLevel: null };
    return data;
  },
  async mfaFactors() {
    const data = ok(await sb.auth.mfa.listFactors());
    return { verified: (data.totp || []).filter((f) => f.status === "verified"), all: data.all || [] };
  },
  async mfaEnroll() {
    // apaga tentativas antigas não confirmadas antes de criar uma nova
    const { all } = await this.mfaFactors();
    for (const f of all.filter((x) => x.status !== "verified")) { try { await sb.auth.mfa.unenroll({ factorId: f.id }); } catch {} }
    return ok(await sb.auth.mfa.enroll({ factorType: "totp", friendlyName: "Uquiorrapay " + new Date().toISOString().slice(0, 16) }));
  },
  async mfaVerify(factorId, code) {
    return ok(await sb.auth.mfa.challengeAndVerify({ factorId, code: String(code).replace(/\D/g, "") }));
  },
  async mfaUnenroll(factorId) {
    return ok(await sb.auth.mfa.unenroll({ factorId }));
  },
  async logEvent(action) {
    try { await sb.rpc("log_security_event", { _action: action }); } catch {}
  },
  async securityLog({ mine = false, limit = 100 } = {}) {
    let q = sb.from("audit_log").select("id,at,actor,actor_email,action,target,details,ip,user_agent").order("at", { ascending: false }).limit(limit);
    if (mine) q = q.eq("actor", (await this.session())?.user?.id).in("action", ["login", "mfa.on", "mfa.off", "password.change"]);
    return ok(await q);
  },
  async signOutEverywhere() {
    await sb.auth.signOut({ scope: "global" });
  },
  async phoneAvailable(phone) {
    const { data, error } = await sb.rpc("phone_available", { _phone: phone });
    if (error) return true; // em caso de falha, a base de dados volta a verificar ao gravar
    return data !== false;
  },
  async signInGoogle() {
    try { sessionStorage.setItem("uq_oauth", "1"); } catch {}
    return ok(await sb.auth.signInWithOAuth({ provider: "google", options: { redirectTo: location.origin + location.pathname } }));
  },
  async resetPassword(email, captchaToken) {
    return ok(await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname + "#/nova-senha", ...(captchaToken ? { captchaToken } : {}) }));
  },
  async updatePassword(password) {
    return ok(await sb.auth.updateUser({ password }));
  },
  async signOut() {
    await sb.auth.signOut();
  },
  async myRoles() {
    const rows = ok(await sb.rpc("my_roles"));
    return (rows || []).map((r) => (typeof r === "string" ? r : r.my_roles));
  },
  async myProfile(uid) {
    return ok(await sb.from("profiles").select("*").eq("id", uid).maybeSingle());
  },
  async saveOnboarding(answers) {
    return ok(await sb.rpc("save_onboarding", { _a: answers }));
  },
  async adminOnboardingStats() {
    return ok(await sb.rpc("admin_onboarding_stats"));
  },
  async updateProfile(uid, fields) {
    return ok(await sb.from("profiles").update(fields).eq("id", uid).select().single());
  },

  // ---------- Definições ----------
  async settings() {
    const rows = ok(await sb.from("settings").select("key,value"));
    return Object.fromEntries(rows.map((r) => [r.key, r.value]));
  },
  async saveSetting(key, value) {
    return ok(await sb.from("settings").upsert({ key, value, updated_at: new Date().toISOString() }).select());
  },

  // ---------- Cursos públicos ----------
  async publicStats() {
    return ok(await sb.rpc("public_stats")) || {};
  },
  async listApproved({ q = "", category = "", language = "", type = "", featured = false, limit = 60 } = {}) {
    let qb = sb.from("courses").select(COURSE_COLS).eq("status", "approved");
    if (type) qb = qb.eq("product_type", type);
    if (category) qb = qb.eq("category", category);
    if (language) qb = qb.eq("language", language);
    if (featured) qb = qb.eq("featured", true);
    if (q) qb = qb.or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,subtitle.ilike.%${q.replace(/[%,()]/g, " ")}%`);
    return ok(await qb.order("featured", { ascending: false }).order("approved_at", { ascending: false }).limit(limit));
  },
  async course(id) {
    return ok(await sb.from("courses").select(COURSE_COLS).eq("id", id).maybeSingle());
  },
  // ---------- Destaque pago (anúncios dentro do site) ----------
  async listSponsored({ limit = 12 } = {}) {
    return ok(await sb.from("courses").select(COURSE_COLS).eq("status", "approved").gt("sponsored_until", new Date().toISOString()).limit(limit));
  },
  async myBoosts(courseId) {
    let qb = sb.from("boosts").select("*").order("created_at", { ascending: false }).limit(30);
    if (courseId) qb = qb.eq("course_id", courseId);
    return ok(await qb);
  },
  async requestBoost(courseId, days, method, ref) {
    return ok(await sb.rpc("request_boost", { _course: courseId, _days: Number(days), _method: method, _ref: ref || null }));
  },
  async boostTrack(courseId, kind) {
    try { await sb.rpc("boost_track", { _course: courseId, _kind: kind }); } catch {}
  },
  async adminBoosts(status = "") {
    let qb = sb.from("boosts").select("*, courses(title)").order("created_at", { ascending: false }).limit(100);
    if (status) qb = qb.eq("status", status);
    const rows = ok(await qb);
    const ids = [...new Set(rows.map((r) => r.producer_id))];
    const profs = ids.length ? ok(await sb.from("profiles").select("id,full_name,email").in("id", ids)) : [];
    return rows.map((r) => ({ ...r, profile: profs.find((p) => p.id === r.producer_id) || {} }));
  },
  async adminReviewBoost(id, approve, reason) {
    return ok(await sb.rpc("admin_review_boost", { _id: id, _approve: approve, _reason: reason || null }));
  },
  async outline(courseId) {
    const rows = ok(await sb.rpc("course_outline", { _course: courseId })) || [];
    const mods = [];
    const byId = new Map();
    for (const r of rows) {
      if (!byId.has(r.module_id)) {
        const m = { id: r.module_id, title: r.module_title, position: r.module_position, lessons: [] };
        byId.set(r.module_id, m);
        mods.push(m);
      }
      if (r.lesson_id) byId.get(r.module_id).lessons.push({ id: r.lesson_id, title: r.lesson_title, position: r.lesson_position, duration_min: r.duration_min });
    }
    return mods;
  },
  async studentCount(courseId) {
    return ok(await sb.rpc("course_student_count", { _course: courseId })) || 0;
  },

  // ---------- Compras ----------
  async isEnrolled(uid, courseId) {
    const rows = ok(await sb.from("enrollments").select("course_id").eq("user_id", uid).eq("course_id", courseId));
    return rows.length > 0;
  },
  async enrollment(uid, courseId) {
    const rows = ok(await sb.from("enrollments").select("course_id,last_lesson_id,last_seen_at").eq("user_id", uid).eq("course_id", courseId).limit(1));
    return rows[0] || null;
  },
  async lessonTitles(ids) {
    if (!ids.length) return {};
    const rows = ok(await sb.from("lessons").select("id,title").in("id", ids));
    return Object.fromEntries(rows.map((r) => [r.id, r.title]));
  },
  // bump_course_id: order bump escolhido no checkout; offer_kind/offer_from: upsell ou downsell depois de uma compra
  async createOrder({ course_id, payment_method, payer_phone, coupon_code = null, affiliate_code = null, bump_course_id = null, offer_kind = null, offer_from = null }) {
    return ok(await sb.from("orders").insert({ course_id, payment_method, payer_phone, coupon_code, affiliate_code, bump_course_id, offer_kind, offer_from }).select("*").single());
  },
  async myOrders(uid) {
    return ok(await sb.from("orders").select("*, courses!orders_course_id_fkey(title)").eq("buyer_id", uid).order("created_at", { ascending: false }));
  },
  async pendingOrderFor(uid, courseId) {
    const rows = ok(await sb.from("orders").select("*").eq("buyer_id", uid).eq("course_id", courseId).eq("status", "pending").order("created_at", { ascending: false }).limit(1));
    return rows[0] || null;
  },
  async myEnrollments(uid) {
    return ok(await sb.from("enrollments").select(`course_id, created_at, last_lesson_id, last_seen_at, courses(${COURSE_COLS})`).eq("user_id", uid).order("created_at", { ascending: false }));
  },

  // ---------- Aulas ----------
  async courseContent(courseId) {
    const mods = ok(await sb.from("modules").select("id,title,position").eq("course_id", courseId).order("position"));
    const lessons = ok(await sb.from("lessons").select("*").eq("course_id", courseId).order("position"));
    return mods.map((m) => ({ ...m, lessons: lessons.filter((l) => l.module_id === m.id) }));
  },
  async progress(uid, courseId) {
    const rows = ok(await sb.from("lesson_progress").select("lesson_id").eq("user_id", uid).eq("course_id", courseId));
    return new Set(rows.map((r) => r.lesson_id));
  },
  async allProgress(uid) {
    return ok(await sb.from("lesson_progress").select("course_id, lesson_id").eq("user_id", uid));
  },
  async setComplete(uid, courseId, lessonId, done) {
    if (done) return ok(await sb.from("lesson_progress").upsert({ user_id: uid, course_id: courseId, lesson_id: lessonId }));
    return ok(await sb.from("lesson_progress").delete().eq("user_id", uid).eq("lesson_id", lessonId));
  },
  // «Continuar onde parei»: guarda a última aula aberta (não bloqueia se falhar)
  async markSeen(lessonId) {
    try { await sb.rpc("mark_seen", { _lesson: lessonId }); } catch {}
  },
  // Comentários e perguntas por aula
  async lessonComments(lessonId) {
    return ok(await sb.from("lesson_comments").select("id,lesson_id,user_id,parent_id,author_name,is_producer,body,created_at").eq("lesson_id", lessonId).order("created_at").limit(300));
  },
  async addComment(lessonId, body, parentId = null) {
    return ok(await sb.from("lesson_comments").insert({ lesson_id: lessonId, body, parent_id: parentId }).select().single());
  },
  async deleteComment(id) {
    return ok(await sb.from("lesson_comments").delete().eq("id", id));
  },
  async producerQuestions() {
    return ok(await sb.rpc("producer_questions")) || [];
  },
  async lessonCounts(courseIds) {
    if (!courseIds.length) return {};
    const rows = ok(await sb.from("lessons").select("course_id").in("course_id", courseIds));
    const out = {};
    rows.forEach((r) => (out[r.course_id] = (out[r.course_id] || 0) + 1));
    return out;
  },
  async materialUrl(path, seconds = 3600) {
    const { data, error } = await sb.storage.from("materials").createSignedUrl(path, seconds);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },

  // ---------- Produtor ----------
  async myProducerRequest(uid) {
    const rows = ok(await sb.from("producer_requests").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(1));
    return rows[0] || null;
  },
  async becomeProducer() {
    return ok(await sb.rpc("become_producer"));
  },
  async requestProducer(uid, { motivation, topic }) {
    return ok(await sb.from("producer_requests").insert({ user_id: uid, motivation, topic }).select().single());
  },
  async myCourses(uid) {
    return ok(await sb.from("courses").select(COURSE_COLS).eq("producer_id", uid).order("updated_at", { ascending: false }));
  },
  async createCourse(fields) {
    return ok(await sb.from("courses").insert(fields).select(COURSE_COLS).single());
  },
  async updateCourse(id, fields) {
    return ok(await sb.from("courses").update(fields).eq("id", id).select(COURSE_COLS).single());
  },
  async deleteCourse(id) {
    return ok(await sb.from("courses").delete().eq("id", id));
  },
  // Cria uma cópia em rascunho (base de dados) e copia os ficheiros privados para a pasta da cópia
  async duplicateCourse(id) {
    const r = ok(await sb.rpc("duplicate_course", { _id: id }));
    let failed = 0;
    for (const f of r.files || []) {
      const { error } = await sb.storage.from("materials").copy(f.from, f.to);
      if (error && !/exists|duplicate/i.test(error.message)) failed++;
    }
    return { id: r.id, failed };
  },
  async uploadCover(courseId, file, onProgress) {
    const img = await prepareCover(file);
    const path = `${courseId}/capa-${Date.now()}.jpg`;
    await xhrUpload("covers", path, img, "image/jpeg", onProgress, { upsert: true });
    return sb.storage.from("covers").getPublicUrl(path).data.publicUrl;
  },
  // Ficheiro de conteúdo (vídeo, áudio, ebook, template…) no armazenamento privado
  async uploadContent(courseId, file, onProgress) {
    await checkFileSafe(file);
    const type = mimeFor(file);
    if (file.size > MAX_UPLOAD_MB * 1048576) throw new Error(`«${file.name}» tem ${(file.size / 1048576).toFixed(1)} MB. O máximo é ${MAX_UPLOAD_MB} MB.`);
    const path = `${courseId}/${Date.now()}-${safeName(file.name)}`;
    await xhrUpload("materials", path, file, type, onProgress);
    return path;
  },
  async removeContent(path) {
    if (path) await sb.storage.from("materials").remove([path]);
  },
  async uploadMaterial(courseId, file, onProgress) {
    await checkFileSafe(file);
    if (!/\.pdf$/i.test(file.name)) throw new Error("Escolhe um ficheiro PDF.");
    if (file.size > MAX_UPLOAD_MB * 1048576) throw new Error(`PDF demasiado grande (máx. ${MAX_UPLOAD_MB} MB).`);
    const path = `${courseId}/${Date.now()}-${safeName(file.name)}`;
    await xhrUpload("materials", path, file, "application/pdf", onProgress);
    return path;
  },
  async addModule(courseId, title, position) {
    return ok(await sb.from("modules").insert({ course_id: courseId, title, position }).select().single());
  },
  async updateModule(id, fields) {
    return ok(await sb.from("modules").update(fields).eq("id", id).select().single());
  },
  async deleteModule(id) {
    return ok(await sb.from("modules").delete().eq("id", id));
  },
  async addLesson(fields) {
    return ok(await sb.from("lessons").insert(fields).select().single());
  },
  async updateLesson(id, fields) {
    return ok(await sb.from("lessons").update(fields).eq("id", id).select().single());
  },
  async deleteLesson(id) {
    return ok(await sb.from("lessons").delete().eq("id", id));
  },
  async salesForProducer(uid) {
    const courses = ok(await sb.from("courses").select("id").eq("producer_id", uid));
    const ids = courses.map((c) => c.id);
    if (!ids.length) return [];
    return ok(await sb.from("orders").select("id,reference,course_id,amount_mzn,commission_mzn,producer_net_mzn,affiliate_code,coupon_code,status,created_at,paid_at,payment_method, courses!orders_course_id_fkey(title)").in("course_id", ids).order("created_at", { ascending: false }));
  },

  // ---------- Cupões ----------
  async checkCoupon(courseId, code) {
    return ok(await sb.rpc("check_coupon", { _course: courseId, _code: code }));
  },
  async coupons(courseId) {
    return ok(await sb.from("coupons").select("*").eq("course_id", courseId).order("created_at", { ascending: false }));
  },
  async addCoupon(fields) {
    return ok(await sb.from("coupons").insert(fields).select().single());
  },
  async updateCoupon(id, fields) {
    return ok(await sb.from("coupons").update(fields).eq("id", id).select().single());
  },
  async deleteCoupon(id) {
    return ok(await sb.from("coupons").delete().eq("id", id));
  },
  async couponUses(courseId) {
    const rows = ok(await sb.from("orders").select("coupon_code").eq("course_id", courseId).eq("status", "paid").not("coupon_code", "is", null));
    const out = {};
    rows.forEach((r) => (out[r.coupon_code] = (out[r.coupon_code] || 0) + 1));
    return out;
  },

  // ---------- Afiliados ----------
  async affiliateMarket() {
    return ok(await sb.rpc("affiliate_market2")) || [];
  },
  // Visita vinda de um link de afiliado (o visitante é um número aleatório guardado no aparelho)
  async trackClick(code) {
    try {
      let v = localStorage.getItem("uq_vid");
      if (!v) { v = crypto.randomUUID().replace(/-/g, ""); localStorage.setItem("uq_vid", v); }
      await sb.rpc("track_affiliate_click", { _code: String(code).toUpperCase().slice(0, 20), _visitor: v });
    } catch {}
  },
  async myAffiliateStats() {
    return ok(await sb.rpc("my_affiliate_stats")) || [];
  },
  async courseAffiliates(courseId) {
    return ok(await sb.rpc("course_affiliates", { _course: courseId })) || [];
  },
  async joinAffiliate(courseId) {
    return ok(await sb.rpc("join_affiliate", { _course: courseId }));
  },
  async myAffiliations(uid) {
    return ok(await sb.from("affiliations").select(`id, code, course_id, created_at, courses(${COURSE_COLS})`).eq("user_id", uid).order("created_at", { ascending: false }));
  },
  async affiliateSales(uid) {
    return ok(await sb.from("orders").select("id,reference,course_id,amount_mzn,affiliate_mzn,status,created_at,paid_at, courses!orders_course_id_fkey(title)").eq("affiliate_id", uid).order("created_at", { ascending: false }));
  },

  // ---------- Carteira ----------
  async wallet() {
    return ok(await sb.rpc("my_wallet"));
  },
  async requestWithdrawal({ amount, method, account, name }) {
    return ok(await sb.rpc("request_withdrawal", { _amount: Number(amount), _method: method, _account: account, _name: name }));
  },
  // ---------- Verificação de identidade (KYC) e retenções ----------
  async kycMine() {
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return null;
    const [k, h] = await Promise.all([
      sb.from("kyc_verifications").select("status,full_name,doc_type,rejection_reason,submitted_at,reviewed_at").eq("user_id", user.id).maybeSingle(),
      sb.from("account_holds").select("withdraw_hold,reason").eq("user_id", user.id).maybeSingle(),
    ]);
    return { kyc: ok(k), hold: ok(h) };
  },
  // Envia uma foto/PDF do documento para a pasta privada do utilizador
  // Documento/selfie da verificação: reconhece o tipo pelo conteúdo (fotos do telemóvel às vezes vêm sem extensão),
  // reduz a foto para JPG leve e, se o telemóvel não a conseguir reduzir, envia o original.
  async kycUpload(file, kind, onProgress) {
    if (!file || !file.size) throw new Error("O ficheiro está vazio. Escolhe outra fotografia.");
    const h = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const hex = Array.from(h.slice(0, 4), (x) => x.toString(16).padStart(2, "0")).join("");
    const txt = String.fromCharCode(...h);
    const fmt = hex.startsWith("ffd8ff") ? "jpg" : hex === "89504e47" ? "png" : txt.startsWith("RIFF") && txt.slice(8, 12) === "WEBP" ? "webp"
      : txt.startsWith("%PDF") ? "pdf" : /ftyp(heic|heix|mif1|msf1|hevc)/.test(txt.slice(4, 12)) ? "heic" : "";
    // Formato desconhecido mas parece imagem (ex.: GIF, BMP, foto sem tipo): tenta converter em JPG no próprio telemóvel
    if (!fmt && (/^image\//.test(file.type || "") || /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i.test(file.name || ""))) {
      try { const conv = await prepareCover(new File([file], file.name || "foto.jpg", { type: file.type || "image/jpeg" })); return await this.kycUpload(new File([conv], "foto.jpg", { type: "image/jpeg" }), kind, onProgress); } catch {}
    }
    if (!fmt) throw new Error("Formato não reconhecido. Usa uma fotografia (JPG ou PNG) ou um PDF.");
    if (fmt === "pdf" && kind === "selfie") throw new Error("A selfie tem de ser uma fotografia, não um PDF.");
    if (file.size > 25 * 1048576) throw new Error("Ficheiro demasiado grande (máx. 25 MB).");
    let blob = file, type = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" }[fmt];
    if (fmt !== "pdf") {
      try { blob = await prepareCover(new File([file], `foto.${fmt === "heic" ? "heic" : fmt}`, { type: fmt === "heic" ? "image/heic" : type })); type = "image/jpeg"; }
      catch {
        if (fmt === "heic") throw new Error("O telemóvel guardou a foto em HEIC. Tira uma captura de ecrã da foto (ou muda a câmara para JPG) e envia de novo.");
        blob = file; // envia o original
      }
    }
    if (blob.size > 10 * 1048576) throw new Error("Ficheiro demasiado grande (máx. 10 MB). Tira a foto com menos resolução ou envia um PDF mais leve.");
    const { data: { user } } = await sb.auth.getUser();
    if (!user) throw new Error("A tua sessão expirou. Entra de novo e repete o envio.");
    const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" }[type];
    const path = `${user.id}/${kind}-${Date.now()}.${ext}`;
    try { await xhrUpload("kyc", path, blob, type, onProgress); }
    catch (err) { if (/permissão|permission|policy/i.test(err.message)) throw new Error("O servidor recusou o envio. Sai e entra de novo na conta (com o código de 2 passos, se tiveres) e tenta outra vez."); throw err; }
    return path;
  },
  async kycSubmit(f) {
    return ok(await sb.rpc("kyc_submit", { _full_name: f.full_name, _doc_type: f.doc_type, _doc_number: f.doc_number, _nuit: null, _birth: f.birth_date, _address: f.address, _front: f.front_path, _back: f.back_path || null, _selfie: f.selfie_path }));
  },
  async adminKyc(status = "pending") {
    let qb = sb.from("kyc_verifications").select("*");
    if (status) qb = qb.eq("status", status);
    const rows = ok(await qb.order("submitted_at", { ascending: true }));
    const ids = rows.map((r) => r.user_id);
    const profs = ids.length ? ok(await sb.from("profiles").select("id,full_name,email,phone").in("id", ids)) : [];
    return rows.map((r) => ({ ...r, profile: profs.find((p) => p.id === r.user_id) || {} }));
  },
  async kycFileUrl(path) {
    const { data, error } = await sb.storage.from("kyc").createSignedUrl(path, 300);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
  async adminKycDecide(userId, approve, reason) {
    return ok(await sb.rpc("admin_kyc_decide", { _user: userId, _approve: approve, _reason: reason || null }));
  },
  async adminHolds() {
    return ok(await sb.from("account_holds").select("*"));
  },
  async adminKycMap(ids) {
    if (!ids.length) return [];
    return ok(await sb.from("kyc_verifications").select("user_id,status,full_name").in("user_id", ids));
  },
  async adminSetHold(userId, hold, reason) {
    return ok(await sb.rpc("admin_set_hold", { _user: userId, _hold: hold, _reason: reason || null }));
  },
  async myWithdrawals(uid) {
    return ok(await sb.from("withdrawals").select("*").eq("user_id", uid).order("created_at", { ascending: false }));
  },

  // ---------- Pagamento ----------
  async submitProof(orderId, txn) {
    return ok(await sb.rpc("submit_payment_proof", { _order: orderId, _txn: txn }));
  },
  async order(id) {
    return ok(await sb.from("orders").select("*, courses!orders_course_id_fkey(id,title,meta_pixel_id)").eq("id", id).maybeSingle());
  },
  async gatewayEnabled() {
    try {
      const { data, error } = await sb.functions.invoke("gateways?action=status", { body: {} });
      if (error) return false;
      return Boolean(data?.enabled);
    } catch { return false; }
  },
  // Que pagamentos automáticos estão ligados: telemóvel (Pagar/e2/PaySuite) e PayPal (internacional)
  async gatewayInfo() {
    try {
      const { data, error } = await sb.functions.invoke("gateways?action=status", { body: {} });
      if (error) return { enabled: false, paypal: false, mpesa_payouts: false };
      return { enabled: Boolean(data?.enabled), paypal: Boolean(data?.paypal), mpesa_payouts: Boolean(data?.mpesa_payouts), providers: data?.providers || [] };
    } catch { return { enabled: false, paypal: false, mpesa_payouts: false }; }
  },
  // Inicia o pagamento automático no primeiro fornecedor disponível (Pagar.co.mz, e2Payments ou PaySuite) ou no PayPal
  // ---------- App Android: ficheiro APK público ----------
  async uploadApk(file, version, onProgress) {
    const path = "app/uquiorrapay.apk";
    await xhrUpload("downloads", path, file, "application/vnd.android.package-archive", onProgress, { upsert: true });
    const { data } = sb.storage.from("downloads").getPublicUrl(path);
    const value = { url: `${data.publicUrl}?v=${Date.now()}`, version: String(version || "").slice(0, 20), size: file.size, updated_at: new Date().toISOString() };
    await this.saveSetting("android_apk", value);
    return value;
  },
  // ---------- Notificações push (vendas) ----------
  async savePushSub(sub, ua) {
    const j = sub.toJSON ? sub.toJSON() : sub;
    const { error } = await sb.rpc("save_push_sub", { _endpoint: j.endpoint, _p256dh: j.keys?.p256dh, _auth: j.keys?.auth, _ua: ua || null });
    if (error) throw new Error(error.message);
  },
  async deletePushSub(endpoint) {
    return ok(await sb.from("push_subscriptions").delete().eq("endpoint", endpoint));
  },
  async myPushSubs() {
    return ok(await sb.from("push_subscriptions").select("endpoint,created_at"));
  },
  async pushTest() {
    const { data, error } = await sb.functions.invoke("notify", { body: { type: "push.test" } });
    if (error) throw new Error(error.message);
    return data;
  },
  async startPayment(orderId, returnUrl, kind = "") {
    const { data, error } = await sb.functions.invoke("gateways?action=start", { body: { order_id: orderId, return_url: returnUrl, kind } });
    if (error) throw new Error((await error.context?.json?.().catch(() => null))?.error || error.message);
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async pollPayment(orderId) {
    const { data, error } = await sb.functions.invoke("gateways?action=poll", { body: { order_id: orderId } });
    if (error) throw new Error(error.message);
    return data;
  },
  async verifyPayment(orderId) {
    const { data, error } = await sb.functions.invoke("paysuite?action=verify", { body: { order_id: orderId } });
    if (error) throw new Error(error.message);
    return data;
  },

  // ---------- Administração ----------
  async adminWithdrawals(status = "pending") {
    let qb = sb.from("withdrawals").select("*, profiles(full_name,email,phone)");
    if (status) qb = qb.eq("status", status);
    return ok(await qb.order("created_at", { ascending: true }));
  },
  async setWithdrawalStatus(id, status, note) {
    return ok(await sb.from("withdrawals").update({ status, admin_note: note || null }).eq("id", id).select().single());
  },
  // Paga (ou confirma) um levantamento directamente pela M-Pesa B2C — só admin com 2FA
  async adminPayout(id, check = false) {
    const { data, error } = await sb.functions.invoke(`gateways?action=${check ? "payout_check" : "payout"}`, { body: { withdrawal_id: id } });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async setGatewaySecret(key, value) {
    return ok(await sb.rpc("admin_set_gateway_secret", { _key: key, _value: value }));
  },
  async gatewayStatus() {
    return ok(await sb.rpc("admin_gateway_status"));
  },
  async recoveryLink(userId) {
    const { data, error } = await sb.functions.invoke("admin-users", { body: { action: "recovery_link", user_id: userId } });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    if (data?.error) throw new Error(data.error);
    return data;
  },
  // ---------- IA ----------
  async aiReview(courseId) {
    const { data, error } = await sb.functions.invoke("ai-review", { body: { course_id: courseId, manual: true } });
    if (error) { let m = error.message; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    if (data?.error) throw new Error(data.error);
    return data.review;
  },
  async aiAsk(body) {
    const { data, error } = await sb.functions.invoke("ai-assistant", { body });
    if (error) { let m = "O assistente não está disponível agora."; try { m = (await error.context.json()).error || m; } catch {} throw new Error(m); }
    if (data?.error) throw new Error(data.error);
    return data;
  },
  async notifyTest() {
    const { data, error } = await sb.functions.invoke("notify", { body: { type: "test" } });
    if (error) throw new Error(error.message);
    return data;
  },

  async adminAiRecent() {
    return ok(await sb.from("courses").select("id,title,status,producer_name,ai_review,ai_reviewed_at").not("ai_review", "is", null).order("ai_reviewed_at", { ascending: false }).limit(12));
  },
  async adminCourses(status) {
    let qb = sb.from("courses").select(COURSE_COLS + ",ai_review,ai_reviewed_at");
    if (status) qb = qb.eq("status", status);
    return ok(await qb.order("updated_at", { ascending: false }));
  },
  async adminOrders(status) {
    let qb = sb.from("orders").select("*, courses!orders_course_id_fkey(title), profiles!orders_buyer_id_fkey(full_name,email,phone)");
    if (status) qb = qb.eq("status", status);
    return ok(await qb.order("created_at", { ascending: false }).limit(200));
  },
  async setOrderStatus(id, status) {
    return ok(await sb.from("orders").update({ status }).eq("id", id).select().single());
  },
  async producerRequests(status = "pending") {
    return ok(await sb.from("producer_requests").select("*, profiles(full_name,email,phone)").eq("status", status).order("created_at", { ascending: true }));
  },
  async reviewProducerRequest(id, status) {
    return ok(await sb.from("producer_requests").update({ status }).eq("id", id).select().single());
  },
  async users() {
    const profiles = ok(await sb.from("profiles").select("*").order("created_at", { ascending: false }).limit(300));
    const roles = ok(await sb.from("user_roles").select("user_id,role"));
    return profiles.map((p) => ({ ...p, roles: roles.filter((r) => r.user_id === p.id).map((r) => r.role) }));
  },
  async setRole(uid, role, on) {
    if (on) return ok(await sb.from("user_roles").upsert({ user_id: uid, role }));
    return ok(await sb.from("user_roles").delete().eq("user_id", uid).eq("role", role));
  },
  async adminStats() {
    const [courses, orders, users] = await Promise.all([
      sb.from("courses").select("status"),
      sb.from("orders").select("status,amount_mzn,commission_mzn"),
      sb.from("profiles").select("id", { count: "exact", head: true }),
    ]);
    const c = ok(courses), o = ok(orders);
    if (users.error) throw new Error(users.error.message);
    const paid = o.filter((x) => x.status === "paid");
    return {
      users: users.count || 0,
      approved: c.filter((x) => x.status === "approved").length,
      pendingCourses: c.filter((x) => x.status === "pending").length,
      pendingOrders: o.filter((x) => x.status === "pending").length,
      gross: paid.reduce((s, x) => s + Number(x.amount_mzn || 0), 0),
      commission: paid.reduce((s, x) => s + Number(x.commission_mzn || 0), 0),
    };
  },
};
