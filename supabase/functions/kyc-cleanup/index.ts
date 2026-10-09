// Uquiorrapay — retenção de dados de identidade (KYC)
// Chamada diariamente pela base de dados (cron → private.kyc_cleanup → pg_net) com o cabeçalho x-notify-secret.
// Apaga as fotos do documento e a selfie 30 dias depois de a verificação ser aprovada ou rejeitada.
// O resultado da verificação (nome, tipo e número do documento, datas) mantém-se; só as imagens são eliminadas.
import { createClient } from "npm:@supabase/supabase-js@2";

const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const RETENTION_DAYS = 30;

Deno.serve(async (req) => {
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "Content-Type": "application/json" } });
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  try {
    const ok = await admin.rpc("notify_secret_ok", { _s: req.headers.get("x-notify-secret") || "" });
    if (!ok.data) return json({ error: "Não autorizado" }, 401);
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 86400_000).toISOString();
    const { data: rows, error } = await admin.from("kyc_verifications")
      .select("user_id,front_path,back_path,selfie_path")
      .in("status", ["approved", "rejected"]).lt("reviewed_at", cutoff)
      .or("front_path.not.is.null,back_path.not.is.null,selfie_path.not.is.null")
      .limit(200);
    if (error) return json({ error: error.message }, 500);
    let files = 0, users = 0;
    for (const r of rows || []) {
      const paths = [r.front_path, r.back_path, r.selfie_path].filter(Boolean) as string[];
      if (paths.length) {
        const { error: rmErr } = await admin.storage.from("kyc").remove(paths);
        if (rmErr) { console.error("kyc remove", r.user_id, rmErr.message); continue; }
        files += paths.length;
      }
      const { error: upErr } = await admin.from("kyc_verifications").update({ front_path: null, back_path: null, selfie_path: null }).eq("user_id", r.user_id);
      if (upErr) { console.error("kyc update", r.user_id, upErr.message); continue; }
      users++;
    }
    // Ficheiros órfãos (enviados mas nunca submetidos) com mais de 60 dias
    const { data: objs } = await admin.storage.from("kyc").list("", { limit: 1000 });
    let orphans = 0;
    for (const folder of objs || []) {
      if (!folder.name || folder.id) continue; // pastas (uma por utilizador) não têm id
      const { data: inner } = await admin.storage.from("kyc").list(folder.name, { limit: 100 });
      const { data: kv } = await admin.from("kyc_verifications").select("front_path,back_path,selfie_path,status").eq("user_id", folder.name).maybeSingle();
      const keep = new Set([kv?.front_path, kv?.back_path, kv?.selfie_path].filter(Boolean));
      const old = (inner || []).filter((f) => f.name && !keep.has(`${folder.name}/${f.name}`) && f.created_at && Date.now() - new Date(f.created_at).getTime() > 60 * 86400_000)
        .map((f) => `${folder.name}/${f.name}`);
      if (old.length) { const { error: e2 } = await admin.storage.from("kyc").remove(old); if (!e2) orphans += old.length; }
    }
    console.log("kyc-cleanup", { users, files, orphans });
    return json({ ok: true, users, files, orphans });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno" }, 500);
  }
});
