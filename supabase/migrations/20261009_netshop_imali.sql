-- Aplicadas no Supabase em 2026-10-09 (migrações «imali_netshop_secrets_and_providers», «payout_provider_column», «disable_public_api»).
-- Novos fornecedores NetShop e iMali Way; levantamentos automáticos com fornecedor registado; API pública desligada.

alter table public.payment_attempts drop constraint if exists payment_attempts_provider_check;
alter table public.payment_attempts add constraint payment_attempts_provider_check check (provider = any (array['paysuite'::text, 'pagar'::text, 'e2payments'::text, 'mpesa'::text, 'imali'::text, 'netshop'::text]));

-- admin_set_gateway_secret / admin_gateway_status: aceitam também
--   netshop_api_key, netshop_wallet_id, netshop_webhook_secret,
--   imali_api_key, imali_public_key, imali_client_id, imali_store_account, imali_webhook_secret
-- (ver definição completa no projecto Supabase)

alter table public.withdrawals add column if not exists payout_provider text;
CREATE OR REPLACE FUNCTION public.withdrawal_payout_begin(_id uuid, _ref text, _provider text default 'mpesa')
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare w record;
begin
  update public.withdrawals set payout_ref = _ref, payout_at = now(), payout_provider = _provider
   where id = _id and status = 'pending' and payout_ref is null
   returning * into w;
  if w is null then return null; end if;
  return row_to_json(w);
end $function$;
revoke all on function public.withdrawal_payout_begin(uuid, text, text) from public, anon, authenticated;
grant execute on function public.withdrawal_payout_begin(uuid, text, text) to service_role;

-- API pública (cancelada): desligada. Para apagar de vez, correr no SQL Editor do Supabase:
--   drop trigger if exists z_api_dispatch on public.orders;
--   drop function if exists private.api_dispatch();
--   drop function if exists public.api_key_create(text), public.api_key_revoke(uuid), public.api_auth(text), public.api_create_order(uuid, uuid, text, text, text, text);
--   drop table if exists public.api_webhook_deliveries, public.api_webhooks, public.api_requests, public.api_keys;
-- e apagar a Edge Function «api» em Edge Functions.
alter table public.orders disable trigger z_api_dispatch;
revoke all on public.api_keys, public.api_webhooks, public.api_webhook_deliveries, public.api_requests from authenticated, anon, public;
revoke all on function public.api_key_create(text), public.api_key_revoke(uuid) from authenticated, anon, public;
