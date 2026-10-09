-- Aplicada no Supabase em 2026-10-09 (migrações «security_hardening_oct_2026» e «kyc_retention_cleanup»).

-- 1. Funções: visitantes anónimos só chamam o que é catálogo público.
revoke execute on function public.admin_review_boost(uuid, boolean, text) from anon;
revoke execute on function public.request_boost(uuid, integer, text, text) from anon;
revoke execute on function public.coupons_plan_guard() from anon;
revoke execute on function public.lesson_comments_guard() from anon;
revoke execute on function public.affiliate_market() from anon;

-- 2. Tabelas: visitantes anónimos nunca escrevem nestas; ninguém trunca pela API.
revoke insert, update, delete, truncate on public.boosts, public.plan_payments, public.producer_plans, public.push_subscriptions from anon;
revoke truncate on all tables in schema public from anon, authenticated;

-- 3. Administração só com 2FA activo.
create or replace function public.is_admin()
 returns boolean language sql stable security definer set search_path to 'public'
as $function$
  select public.has_role(auth.uid(), 'admin')
     and exists (select 1 from auth.mfa_factors f where f.user_id = auth.uid() and f.status = 'verified')
     and public.mfa_ok()
$function$;

-- 4. Sem promoção automática a admin pelo email de registo. Para dar admin a uma conta:
--    insert into public.user_roles (user_id, role) values ('<uuid do utilizador>', 'admin');
create or replace function public.handle_new_user()
 returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare ph text;
begin
  ph := nullif(trim(new.raw_user_meta_data->>'phone'), '');
  if ph is not null and exists (select 1 from public.profiles where phone_norm = public.norm_phone(ph)) then
    ph := null;
  end if;
  insert into public.profiles (id, full_name, email, country, phone)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', split_part(new.email,'@',1)),
          new.email,
          coalesce(new.raw_user_meta_data->>'country','MZ'),
          ph)
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'student') on conflict do nothing;
  return new;
end $function$;

-- 5. A IA não aprova sozinha produtos só com vídeo/áudio.
update public.settings set value = value || '{"auto_approve_media": false}'::jsonb, updated_at = now() where key = 'ai';

-- 6. Extensão pg_net: continua em public (não suporta SET SCHEMA; mover exigiria drop/create da extensão). Aviso apenas cosmético.

-- 7. Retenção KYC: apaga as imagens 30 dias depois da decisão (função «kyc-cleanup», todos os dias às 04:30 UTC).
create or replace function private.kyc_cleanup()
 returns void language plpgsql security definer set search_path to 'public'
as $function$
declare sec text;
begin
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'notify_secret';
  perform net.http_post(
    url := 'https://dzwbccqqvcmqmmqtdgzw.supabase.co/functions/v1/kyc-cleanup',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', coalesce(sec, '')),
    timeout_milliseconds := 20000);
exception when others then
  raise warning 'kyc_cleanup falhou: %', sqlerrm;
end $function$;
select cron.schedule('uq-kyc-cleanup', '30 4 * * *', 'select private.kyc_cleanup()');

-- 8. A permissão EXECUTE vinha do grupo PUBLIC; retira-se de PUBLIC e concede-se só a quem precisa.
revoke execute on function public.admin_review_boost(uuid, boolean, text) from public, anon;
grant execute on function public.admin_review_boost(uuid, boolean, text) to authenticated, service_role;
revoke execute on function public.request_boost(uuid, integer, text, text) from public, anon;
grant execute on function public.request_boost(uuid, integer, text, text) to authenticated, service_role;
revoke execute on function public.affiliate_market() from public, anon;
grant execute on function public.affiliate_market() to authenticated, service_role;
revoke execute on function public.coupons_plan_guard() from public, anon, authenticated;
revoke execute on function public.lesson_comments_guard() from public, anon, authenticated;
revoke execute on function public.gateway_mark_paid2(uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.gateway_plan_paid(uuid, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.get_gateway_secret(text) from public, anon, authenticated;
revoke execute on function public.notify_secret_ok(text) from public, anon, authenticated;
