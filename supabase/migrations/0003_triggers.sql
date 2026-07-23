-- ============================================================
-- Sha7ntec — triggers that maintain forwarder performance history.
-- These run as the table owner (definer) so they update forwarders
-- regardless of the acting user's RLS.
-- ============================================================

-- Recompute a forwarder's bid stats from scratch (cheap; few bids per fwd).
create or replace function refresh_forwarder_bid_stats(p_forwarder uuid)
returns void language sql security definer set search_path = public as $$
  update forwarders f set
    total_bids = (select count(*) from bids b where b.forwarder_id = p_forwarder),
    avg_bid_amount = coalesce(
      (select round(avg(amount), 2) from bids b where b.forwarder_id = p_forwarder), 0)
  where f.id = p_forwarder;
$$;

create or replace function trg_bids_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform refresh_forwarder_bid_stats(new.forwarder_id);
  return new;
end;
$$;

create trigger bids_stats_after_insert
  after insert on bids
  for each row execute function trg_bids_after_write();

create trigger bids_stats_after_update
  after update of amount on bids
  for each row execute function trg_bids_after_write();

-- Wins counter.
create or replace function trg_awards_after_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update forwarders set total_wins = total_wins + 1
    where id = new.forwarder_id;
  return new;
end;
$$;

create trigger awards_wins_after_insert
  after insert on awards
  for each row execute function trg_awards_after_insert();

-- On-time percentage: recompute from deliveries vs the PO's promised_date.
create or replace function refresh_forwarder_ontime(p_forwarder uuid)
returns void language sql security definer set search_path = public as $$
  update forwarders f set on_time_pct = coalesce((
    select round(
      100.0 * count(*) filter (
        where d.delivered_at is not null
          and p.promised_date is not null
          and d.delivered_at::date <= p.promised_date
      ) / nullif(count(*) filter (where d.delivered_at is not null), 0), 2)
    from deliveries d
    join purchase_orders p on p.id = d.po_id
    where d.forwarder_id = p_forwarder
  ), 0)
  where f.id = p_forwarder;
$$;

create or replace function trg_deliveries_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform refresh_forwarder_ontime(new.forwarder_id);
  return new;
end;
$$;

create trigger deliveries_ontime_after_insert
  after insert on deliveries
  for each row execute function trg_deliveries_after_write();

create trigger deliveries_ontime_after_update
  after update of delivered_at on deliveries
  for each row execute function trg_deliveries_after_write();
