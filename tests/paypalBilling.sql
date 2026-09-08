-- Run via an administrative connection. Every fixture update is rolled back.
begin;
do $$
declare u uuid; expires timestamptz := now()+interval '30 days'; result boolean;
begin
 select id into u from public.users where not coalesce(is_premium,false) limit 1;
 if u is null then raise exception 'No free-account fixture available'; end if;
 perform public.apply_billing_entitlement(u,'paypal','I-ROLLBACK-TEST',jsonb_build_object('is_premium',true,'premium_until',expires,'premium_plan','premium_monthly'));
 perform public.apply_billing_entitlement(u,'stripe','primary',jsonb_build_object('is_premium',false));
 select is_premium and premium_until=expires into result from public.users where id=u;
 if result is distinct from true then raise exception 'Stripe cancellation removed PayPal access'; end if;
 perform public.apply_billing_entitlement(u,'paypal','I-ROLLBACK-TEST',jsonb_build_object('is_premium',true,'premium_until',expires,'premium_plan','premium_monthly'));
 if (select count(*) from public.billing_entitlements where user_id=u and subscription_id='I-ROLLBACK-TEST') <> 1 then raise exception 'Duplicate entitlement'; end if;
 perform public.apply_billing_entitlement(u,'paypal','I-ROLLBACK-TEST',jsonb_build_object('is_premium',false));
 select is_premium into result from public.users where id=u;
 if result is distinct from false then raise exception 'Refund did not remove PayPal-only access'; end if;
 if has_function_privilege('authenticated','public.apply_billing_entitlement(uuid,text,text,jsonb,timestamptz)','EXECUTE') then raise exception 'Customer can write paid access'; end if;
 if has_table_privilege('authenticated','public.paypal_checkouts','INSERT') then raise exception 'Customer can forge checkout'; end if;
end $$;
rollback;
