-- Aplicada no Supabase em 2026-10-09 (migração «mpesa_direct_and_payouts»).
-- M-Pesa directo (Vodacom Open API): segredos novos e pagamento automático dos levantamentos (B2C).
alter table public.withdrawals
  add column if not exists payout_ref text,
  add column if not exists payout_txn text,
  add column if not exists payout_at timestamptz;

-- admin_set_gateway_secret / admin_gateway_status: aceitam também mpesa_api_key, mpesa_public_key e mpesa_service_code
-- (ver definição completa no projecto Supabase)

-- Levantamento pago pela M-Pesa (só a Edge Function «gateways», com service role)
CREATE OR REPLACE FUNCTION public.withdrawal_payout_begin(_id uuid, _ref text)
 RETURNS json LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare w record;
begin
  update public.withdrawals set payout_ref = _ref, payout_at = now()
   where id = _id and status = 'pending' and payout_ref is null
   returning * into w;
  if w is null then return null; end if;
  return row_to_json(w);
end $function$;

CREATE OR REPLACE FUNCTION public.withdrawal_payout_finish(_id uuid, _ok boolean, _txn text, _note text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
begin
  if _ok then
    update public.withdrawals set status = 'paid', payout_txn = _txn, admin_note = _note where id = _id and status = 'pending';
  else
    update public.withdrawals set payout_ref = null, payout_at = null, admin_note = _note where id = _id and status = 'pending';
  end if;
  perform private.audit(case when _ok then 'withdrawal.payout.paid' else 'withdrawal.payout.failed' end, _id::text, jsonb_build_object('txn', _txn, 'note', _note));
end $function$;

revoke all on function public.withdrawal_payout_begin(uuid, text), public.withdrawal_payout_finish(uuid, boolean, text, text) from public, anon, authenticated;
grant execute on function public.withdrawal_payout_begin(uuid, text), public.withdrawal_payout_finish(uuid, boolean, text, text) to service_role;

-- Ordem de preferência: M-Pesa directo e e2Payments à frente da Pagar
update public.settings set value = jsonb_set(value::jsonb, '{order}', '["mpesa","e2payments","pagar","paysuite"]'::jsonb)::json where key = 'gateway';

-- Tentativas de pagamento: novo fornecedor «mpesa» (migração «payment_attempts_mpesa_provider»)
alter table public.payment_attempts drop constraint if exists payment_attempts_provider_check;
alter table public.payment_attempts add constraint payment_attempts_provider_check check (provider = any (array['paysuite'::text, 'pagar'::text, 'e2payments'::text, 'mpesa'::text]));
