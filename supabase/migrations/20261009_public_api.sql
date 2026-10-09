-- Aplicada no Supabase em 2026-10-09 (migração «public_api_keys_webhooks»).
-- API pública (estilo Pagar): chaves por produtor, webhooks assinados, registo de entregas e limite de pedidos.

create table if not exists public.api_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null default 'Chave',
  prefix text not null,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
create index if not exists api_keys_user_idx on public.api_keys (user_id);

create table if not exists public.api_webhooks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  url text not null check (url ~ '^https://[^\s]+$' and length(url) <= 500),
  secret text not null default encode(extensions.gen_random_bytes(24), 'hex'),
  events text[] not null default '{order.paid,order.refunded,order.cancelled}',
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists api_webhooks_user_idx on public.api_webhooks (user_id);

create table if not exists public.api_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.api_webhooks(id) on delete cascade,
  user_id uuid not null,
  event text not null,
  order_id uuid,
  status_code int,
  ok boolean not null default false,
  attempts int not null default 1,
  error text,
  created_at timestamptz not null default now()
);
create index if not exists api_webhook_deliveries_user_idx on public.api_webhook_deliveries (user_id, created_at desc);

create table if not exists public.api_requests (
  id bigserial primary key,
  key_id uuid not null,
  at timestamptz not null default now(),
  path text,
  status int
);
create index if not exists api_requests_key_at_idx on public.api_requests (key_id, at desc);

-- RLS: só o dono (com 2FA confirmado) vê/gere; o segredo da chave nunca sai da base
alter table public.api_keys enable row level security;
alter table public.api_webhooks enable row level security;
alter table public.api_webhook_deliveries enable row level security;
alter table public.api_requests enable row level security;
revoke all on public.api_keys, public.api_webhooks, public.api_webhook_deliveries, public.api_requests from anon, public;
grant select, delete on public.api_keys to authenticated;
grant select, insert, update, delete on public.api_webhooks to authenticated;
grant select on public.api_webhook_deliveries to authenticated;
create policy "api_keys: dono vê" on public.api_keys for select using (user_id = auth.uid() and public.mfa_ok());
create policy "api_keys: dono apaga" on public.api_keys for delete using (user_id = auth.uid() and public.mfa_ok());
create policy "api_webhooks: dono gere" on public.api_webhooks for all using (user_id = auth.uid() and public.mfa_ok()) with check (user_id = auth.uid() and public.mfa_ok());
create policy "api_webhook_deliveries: dono vê" on public.api_webhook_deliveries for select using (user_id = auth.uid() and public.mfa_ok());

-- Criar chave (mostrada uma única vez; só o hash fica guardado)
CREATE OR REPLACE FUNCTION public.api_key_create(_name text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare raw text; kid uuid;
begin
  if auth.uid() is null then raise exception 'Precisas de entrar'; end if;
  if not public.mfa_ok() then raise exception 'Confirma o código de 2 passos primeiro'; end if;
  if not (public.has_role(auth.uid(), 'producer') or public.is_admin()) then raise exception 'Só produtores podem criar chaves de API'; end if;
  if (select count(*) from public.api_keys where user_id = auth.uid() and revoked_at is null) >= 5 then
    raise exception 'Limite de 5 chaves activas. Revoga uma chave antiga primeiro.';
  end if;
  raw := 'uq_live_' || encode(extensions.gen_random_bytes(24), 'hex');
  insert into public.api_keys (user_id, name, prefix, key_hash)
  values (auth.uid(), left(coalesce(nullif(btrim(_name), ''), 'Chave'), 60), left(raw, 16), encode(extensions.digest(raw, 'sha256'), 'hex'))
  returning id into kid;
  perform private.audit('api.key.create', kid::text, jsonb_build_object('name', _name));
  return json_build_object('id', kid, 'key', raw, 'prefix', left(raw, 16));
end $function$;

CREATE OR REPLACE FUNCTION public.api_key_revoke(_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.uid() is null then raise exception 'Precisas de entrar'; end if;
  if not public.mfa_ok() then raise exception 'Confirma o código de 2 passos primeiro'; end if;
  update public.api_keys set revoked_at = now() where id = _id and user_id = auth.uid() and revoked_at is null;
  if not found then raise exception 'Chave não encontrada'; end if;
  perform private.audit('api.key.revoke', _id::text, '{}'::jsonb);
end $function$;

-- Só a edge function «api» (service role) autentica chaves e cria pedidos em nome do cliente
CREATE OR REPLACE FUNCTION public.api_auth(_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare k record;
begin
  if _key is null or _key !~ '^uq_live_[0-9a-f]{48}$' then return null; end if;
  select * into k from public.api_keys where key_hash = encode(extensions.digest(_key, 'sha256'), 'hex') and revoked_at is null;
  if k is null then return null; end if;
  update public.api_keys set last_used_at = now() where id = k.id and (last_used_at is null or last_used_at < now() - interval '1 minute');
  return json_build_object('key_id', k.id, 'user_id', k.user_id);
end $function$;

CREATE OR REPLACE FUNCTION public.api_create_order(_buyer uuid, _course uuid, _method text, _phone text, _coupon text, _affiliate text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o record;
begin
  if _buyer is null or _course is null then raise exception 'Dados em falta'; end if;
  perform set_config('request.jwt.claim.sub', _buyer::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', _buyer, 'role', 'authenticated')::text, true);
  insert into public.orders (course_id, payment_method, payer_phone, coupon_code, affiliate_code)
  values (_course, case when _method in ('mpesa','emola','paypal') then _method else 'mpesa' end, nullif(btrim(coalesce(_phone,'')), ''), nullif(btrim(coalesce(_coupon,'')), ''), nullif(btrim(coalesce(_affiliate,'')), ''))
  returning * into o;
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  return row_to_json(o);
end $function$;

revoke all on function public.api_auth(text), public.api_create_order(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.api_auth(text), public.api_create_order(uuid, uuid, text, text, text, text) to service_role;
revoke all on function public.api_key_create(text), public.api_key_revoke(uuid) from public, anon;
grant execute on function public.api_key_create(text), public.api_key_revoke(uuid) to authenticated, service_role;

-- Quando um pedido muda de estado, a edge function «api?action=dispatch» envia os webhooks assinados
CREATE OR REPLACE FUNCTION private.api_dispatch()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ev text; sec text; prod uuid;
begin
  if tg_op <> 'UPDATE' or new.status is not distinct from old.status then return null; end if;
  ev := case new.status::text when 'paid' then 'order.paid' when 'refunded' then 'order.refunded' when 'cancelled' then 'order.cancelled' else null end;
  if ev is null then return null; end if;
  select producer_id into prod from public.courses where id = new.course_id;
  if not exists (select 1 from public.api_webhooks w where w.user_id = prod and w.active and ev = any(w.events)) then return null; end if;
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'notify_secret';
  perform net.http_post(
    url := 'https://dzwbccqqvcmqmmqtdgzw.supabase.co/functions/v1/api?action=dispatch',
    body := jsonb_build_object('order_id', new.id, 'event', ev),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', coalesce(sec, '')),
    timeout_milliseconds := 15000);
  return null;
exception when others then
  raise warning 'api_dispatch falhou: %', sqlerrm;
  return null;
end $function$;

create or replace trigger z_api_dispatch after update on public.orders for each row execute function private.api_dispatch();
