-- Aplicada no Supabase em 2026-10-09 (migração «guarantee_per_product_and_funnel_offers»).
-- Garantia por produto (saque na hora por defeito), order bump, upsell e downsell.
alter table public.courses
  add column if not exists guarantee_enabled boolean not null default false,
  add column if not exists bump_course_id uuid references public.courses(id) on delete set null,
  add column if not exists bump_price_mzn numeric check (bump_price_mzn is null or bump_price_mzn > 0),
  add column if not exists bump_text text,
  add column if not exists upsell_course_id uuid references public.courses(id) on delete set null,
  add column if not exists upsell_price_mzn numeric check (upsell_price_mzn is null or upsell_price_mzn > 0),
  add column if not exists upsell_text text,
  add column if not exists downsell_course_id uuid references public.courses(id) on delete set null,
  add column if not exists downsell_price_mzn numeric check (downsell_price_mzn is null or downsell_price_mzn > 0),
  add column if not exists downsell_text text;

alter table public.orders
  add column if not exists bump_course_id uuid references public.courses(id) on delete set null,
  add column if not exists bump_mzn numeric not null default 0,
  add column if not exists offer_kind text check (offer_kind is null or offer_kind in ('upsell','downsell')),
  add column if not exists offer_from uuid references public.courses(id) on delete set null,
  add column if not exists hold_until timestamptz;

-- Pedido: preço da oferta especial (upsell/downsell), order bump e comissão sobre o total
create or replace function public.orders_before_insert()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare c record; cp record; aff record; src record; bc record; pct numeric; rate numeric; price numeric; remaining numeric; off numeric := 0; intl boolean; offer_price numeric;
begin
  select * into c from public.courses where id = new.course_id;
  if c is null or c.status <> 'approved' then raise exception 'Curso indisponível'; end if;
  if public.is_enrolled(auth.uid(), new.course_id) then raise exception 'Já tens acesso a este curso'; end if;
  new.buyer_id := auth.uid();
  new.status := 'pending';
  new.paid_at := null; new.hold_until := null;
  new.payer_txn := null; new.proof_at := null;
  new.gateway := 'manual'; new.gateway_payment_id := null; new.checkout_url := null;
  rate := coalesce((public.get_setting('rates')->>'USD')::numeric, 64);
  intl := new.payment_method = 'paypal' and coalesce(c.price_usd, 0) >= 1;

  -- Oferta especial (upsell / downsell) só para quem já comprou o produto de origem, do mesmo produtor
  if new.offer_kind is not null then
    if new.offer_from is null then raise exception 'Oferta inválida'; end if;
    select * into src from public.courses where id = new.offer_from;
    if src is null or src.producer_id is distinct from c.producer_id or src.id = c.id then raise exception 'Oferta inválida'; end if;
    if not public.is_enrolled(auth.uid(), src.id) then raise exception 'Esta oferta é só para quem comprou o produto anterior'; end if;
    if new.offer_kind = 'upsell' then
      if src.upsell_course_id is distinct from c.id then raise exception 'Oferta inválida'; end if;
      offer_price := src.upsell_price_mzn;
    else
      if src.downsell_course_id is distinct from c.id then raise exception 'Oferta inválida'; end if;
      offer_price := src.downsell_price_mzn;
    end if;
    if offer_price is null or offer_price <= 0 or offer_price >= c.price_mzn then
      offer_price := null; new.offer_kind := null; new.offer_from := null;
    end if;
  else
    new.offer_from := null;
  end if;

  new.list_price_mzn := case when intl then round(c.price_usd * rate, 2) else c.price_mzn end;
  price := new.list_price_mzn;
  new.discount_mzn := 0;
  if offer_price is not null then
    -- a oferta especial substitui o preço (sem cupão)
    price := offer_price;
    new.discount_mzn := greatest(round(new.list_price_mzn - offer_price, 2), 0);
    new.coupon_code := null;
  elsif new.coupon_code is not null and btrim(new.coupon_code) <> '' then
    new.coupon_code := upper(btrim(new.coupon_code));
    select * into cp from public.coupons
      where course_id = c.id and code = new.coupon_code and active
        and (expires_at is null or expires_at > now());
    if cp is null then raise exception 'Cupão inválido ou expirado'; end if;
    if cp.max_uses is not null and (select count(*) from public.orders o where o.course_id = c.id and o.coupon_code = cp.code and o.status = 'paid') >= cp.max_uses then
      raise exception 'Este cupão já atingiu o limite de utilizações';
    end if;
    off := cp.percent_off;
    new.discount_mzn := round(price * cp.percent_off / 100, 2);
    price := price - new.discount_mzn;
  else
    new.coupon_code := null;
  end if;

  -- Order bump: produto extra do mesmo produtor, ao preço definido pelo produtor
  new.bump_mzn := 0;
  if new.bump_course_id is not null then
    select * into bc from public.courses where id = new.bump_course_id;
    if bc is null or bc.status <> 'approved' or c.bump_course_id is distinct from bc.id or bc.producer_id is distinct from c.producer_id
       or bc.id = c.id or public.is_enrolled(auth.uid(), bc.id) then
      new.bump_course_id := null;
    else
      new.bump_mzn := coalesce(c.bump_price_mzn, bc.price_mzn);
    end if;
  end if;

  new.amount_mzn := price + new.bump_mzn;
  pct := public.plan_commission(c.producer_id);
  new.commission_pct := pct;
  new.commission_mzn := round(new.amount_mzn * pct / 100, 2);
  remaining := new.amount_mzn - new.commission_mzn;
  new.affiliate_id := null; new.affiliate_mzn := 0;
  if c.affiliate_enabled and new.affiliate_code is not null and btrim(new.affiliate_code) <> '' then
    select * into aff from public.affiliations where code = upper(btrim(new.affiliate_code)) and course_id = c.id;
    if aff is not null and aff.user_id <> auth.uid() and aff.user_id is distinct from c.producer_id then
      new.affiliate_id := aff.user_id;
      new.affiliate_mzn := round(remaining * c.affiliate_pct / 100, 2);
    end if;
  end if;
  if new.affiliate_id is null then new.affiliate_code := null; end if;
  new.producer_net_mzn := remaining - new.affiliate_mzn;
  if new.payment_method = 'paypal' then
    new.pay_currency := 'USD';
    new.pay_amount := (case when intl and offer_price is null then round(c.price_usd * (100 - off) / 100, 2) else round(price / rate, 2) end)
                    + (case when new.bump_mzn > 0 then round(new.bump_mzn / rate, 2) else 0 end);
  else
    new.pay_currency := 'MZN';
    new.pay_amount := new.amount_mzn;
  end if;
  new.reference := 'UQ' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  return new;
end $function$;

-- Pago: inscreve (também no order bump) e calcula até quando o valor fica retido (só se o produto tiver garantia)
create or replace function public.orders_after_update()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare g boolean; gd int; hd int;
begin
  if new.status = 'paid' and old.status is distinct from 'paid' then
    select coalesce(guarantee_enabled, false) into g from public.courses where id = new.course_id;
    gd := case when coalesce(g, false) then coalesce((public.get_setting('guarantee_days'))::text::int, 0) else 0 end;
    hd := coalesce((public.get_setting('payout_hold_days'))::text::int, 0);
    update public.orders
       set paid_at = coalesce(paid_at, now()),
           hold_until = coalesce(paid_at, now()) + make_interval(days => greatest(gd, hd, 0))
     where id = new.id and (paid_at is null or hold_until is null);
    insert into public.enrollments (user_id, course_id, order_id)
    values (new.buyer_id, new.course_id, new.id) on conflict do nothing;
    if new.bump_course_id is not null then
      insert into public.enrollments (user_id, course_id, order_id)
      values (new.buyer_id, new.bump_course_id, new.id) on conflict do nothing;
    end if;
  elsif old.status = 'paid' and new.status in ('refunded','cancelled') then
    delete from public.enrollments where user_id = new.buyer_id and course_id = new.course_id;
    if new.bump_course_id is not null then
      delete from public.enrollments where user_id = new.buyer_id and course_id = new.bump_course_id and order_id = new.id;
    end if;
  end if;
  return new;
end $function$;

-- Carteira: o valor fica disponível logo (saque na hora), salvo se o produto tiver garantia activa
create or replace function public.my_wallet()
 returns json
 language plpgsql
 stable security definer
 set search_path to 'public'
as $function$
declare uid uuid := auth.uid(); hold int; gdays int; prod_ok numeric; prod_hold numeric; aff_ok numeric; aff_hold numeric; wd_paid numeric; wd_pend numeric; minw numeric; ads numeric; plans numeric;
begin
  if uid is null then return null; end if;
  hold := coalesce((public.get_setting('payout_hold_days'))::text::int, 0);
  gdays := coalesce((public.get_setting('guarantee_days'))::text::int, 0);
  minw := coalesce((public.get_setting('min_withdrawal'))::text::numeric, 500);
  select coalesce(sum(o.producer_net_mzn) filter (where coalesce(o.hold_until, o.paid_at + make_interval(days => hold)) <= now()),0),
         coalesce(sum(o.producer_net_mzn) filter (where coalesce(o.hold_until, o.paid_at + make_interval(days => hold)) >  now()),0)
    into prod_ok, prod_hold
    from public.orders o join public.courses c on c.id = o.course_id
   where o.status = 'paid' and c.producer_id = uid;
  select coalesce(sum(o.affiliate_mzn) filter (where coalesce(o.hold_until, o.paid_at + make_interval(days => hold)) <= now()),0),
         coalesce(sum(o.affiliate_mzn) filter (where coalesce(o.hold_until, o.paid_at + make_interval(days => hold)) >  now()),0)
    into aff_ok, aff_hold
    from public.orders o where o.status = 'paid' and o.affiliate_id = uid;
  select coalesce(sum(amount_mzn) filter (where status = 'paid'),0), coalesce(sum(amount_mzn) filter (where status = 'pending'),0)
    into wd_paid, wd_pend from public.withdrawals where user_id = uid;
  select coalesce(sum(amount_mzn),0) into ads from public.boosts where producer_id = uid and pay_method = 'wallet' and status <> 'rejected';
  select coalesce(sum(amount_mzn),0) into plans from public.plan_payments where user_id = uid and mode = 'wallet' and status = 'paid';
  return json_build_object(
    'producer_total', prod_ok + prod_hold, 'affiliate_total', aff_ok + aff_hold,
    'on_hold', prod_hold + aff_hold,
    'withdrawn', wd_paid, 'withdraw_pending', wd_pend, 'ads_spent', ads, 'plans_spent', plans,
    'available', greatest(prod_ok + aff_ok - wd_paid - wd_pend - ads - plans, 0),
    'hold_days', hold, 'guarantee_days', gdays, 'min_withdrawal', minw);
end $function$;
