// Uquiorrapay — ferramentas do administrador para utilizadores
//   POST {action:"recovery_link", user_id}
//     · conta com email real  → o Supabase envia o email de nova palavra-passe ao utilizador (o admin nunca vê o link)
//     · conta criada por telefone (email sintético) → devolve o link ao admin para o enviar ao dono da conta
// Só para administradores com 2FA activo (is_admin com a sessão de quem chama).
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const admin = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
const ALLOWED = [/^https:\/\/([a-z0-9-]+\.)?uquiorrapay\.pages\.dev$/, /^https:\/\/(www\.)?uquiorrapay\.com$/];
const cors = (req: Request) => {
  const o = req.headers.get("Origin") || "";
  return {
    "Access-Control-Allow-Origin": ALLOWED.some((r) => r.test(o)) ? o : "https://uquiorrapay.pages.dev",
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
};
const SYNTHETIC = /@telefone\.uquiorrapay\.com$/i;

Deno.serve(async (req) => {
  const h = cors(req);
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return json({ error: "Método inválido" }, 405);
  try {
    const auth = req.headers.get("Authorization") || "";
    if (!/^Bearer\s+ey/.test(auth)) return json({ error: "Sessão inválida" }, 401);
    const asUser = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
    const { data: me } = await asUser.auth.getUser(auth.replace(/^Bearer\s+/i, ""));
    if (!me?.user) return json({ error: "Sessão inválida" }, 401);
    const { data: isAdm } = await asUser.rpc("is_admin");
    if (!isAdm) return json({ error: "Sem permissão (confirma o código de 2 passos)" }, 403);

    const body = await req.json().catch(() => ({}));
    if (body.action !== "recovery_link") return json({ error: "Acção inválida" }, 400);
    if (!/^[0-9a-f-]{36}$/i.test(String(body.user_id || ""))) return json({ error: "Utilizador inválido" }, 400);
    const { data: u } = await admin.auth.admin.getUserById(body.user_id);
    const email = u?.user?.email;
    if (!email) return json({ error: "Utilizador sem email" }, 404);

    const { data: siteRow } = await admin.from("settings").select("value").eq("key", "site_url").maybeSingle();
    const site = String(siteRow?.value || "https://uquiorrapay.pages.dev").replace(/\/$/, "") + "/";
    const meta = {
      actor: me.user.id, actor_email: me.user.email ?? null, target: email,
      ip: (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].slice(0, 64),
      user_agent: (req.headers.get("user-agent") || "").slice(0, 200),
    };

    if (!SYNTHETIC.test(email)) {
      const { error } = await admin.auth.resetPasswordForEmail(email, { redirectTo: site + "#/nova-senha" });
      if (error) return json({ error: error.message }, 400);
      await admin.from("audit_log").insert({ ...meta, action: "admin.recovery_email" });
      return json({ sent: true, email });
    }

    const { data, error } = await admin.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: site } });
    if (error || !data?.properties?.action_link) return json({ error: error?.message || "Não foi possível gerar o link" }, 400);
    await admin.from("audit_log").insert({ ...meta, action: "admin.recovery_link" });
    return json({ link: data.properties.action_link, email });
  } catch (e) {
    console.error(e);
    return json({ error: "Erro interno" }, 500);
  }
});
