alter table public.follow
  add column if not exists status text not null default 'angenommen';

alter table public.follow
  add column if not exists erstellt_am timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'follow_status_check'
      and conrelid = 'public.follow'::regclass
  ) then
    alter table public.follow
      add constraint follow_status_check check (status in ('angefragt', 'angenommen'));
  end if;
end;
$$;

update public.follow
set status = 'angenommen'
where status is null;

create index if not exists follow_gefolgter_status_erstellt_idx
  on public.follow (gefolgter_id, status, erstellt_am desc);

create index if not exists follow_follower_status_idx
  on public.follow (follower_id, status);

insert into public.nutzer (id, nutzername, wertungsklasse)
select
  u.id,
  'user_' || substr(replace(u.id::text, '-', ''), 1, 8),
  case
    when u.raw_user_meta_data ->> 'wertungsklasse' in ('m', 'w') then u.raw_user_meta_data ->> 'wertungsklasse'
    else 'm'
  end
from auth.users u
where not exists (
  select 1
  from public.nutzer n
  where n.id = u.id
);

create or replace function public.protect_follow_status()
returns trigger
language plpgsql
as $$
begin
  if auth.uid() is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  if tg_op = 'INSERT' then
    if new.follower_id <> auth.uid() then
      raise exception 'Follow-Anfragen koennen nur im eigenen Namen erstellt werden';
    end if;
    if new.gefolgter_id = auth.uid() then
      raise exception 'Selbst-Follows sind nicht erlaubt';
    end if;
    if new.status <> 'angefragt' then
      raise exception 'Neue Follows muessen als Anfrage beginnen';
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if new.follower_id <> old.follower_id or new.gefolgter_id <> old.gefolgter_id then
      raise exception 'Follow-IDs duerfen nicht geaendert werden';
    end if;
    if old.status = 'angefragt' and new.status = 'angenommen' and auth.uid() = old.gefolgter_id then
      return new;
    end if;
    raise exception 'Diese Follow-Aenderung ist nicht erlaubt';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_follow_status_trigger on public.follow;
create trigger protect_follow_status_trigger
  before insert or update on public.follow
  for each row execute function public.protect_follow_status();

create or replace view public.oeffentliche_profile
as
with beste_leistungen as (
  select
    l.nutzer_id,
    l.disziplin_id,
    case max(case l.medaille
      when 'gold' then 4
      when 'silber' then 3
      when 'bronze' then 2
      when 'keine' then 1
      when 'unbewertet' then 1
      else 0
    end)
      when 4 then 'gold'
      when 3 then 'silber'
      when 2 then 'bronze'
      when 1 then 'keine'
      else 'offen'
    end as medaille
  from public.leistung l
  group by l.nutzer_id, l.disziplin_id
)
select
  n.id,
  n.nutzername,
  n.profilbild,
  n.rank,
  coalesce(count(distinct bl.disziplin_id), 0)::integer as dex,
  coalesce(count(distinct bl.disziplin_id) filter (where bl.medaille = 'bronze'), 0)::integer as bronze,
  coalesce(count(distinct bl.disziplin_id) filter (where bl.medaille = 'silber'), 0)::integer as silver,
  coalesce(count(distinct bl.disziplin_id) filter (where bl.medaille = 'gold'), 0)::integer as gold,
  coalesce(count(distinct f_in.follower_id), 0)::integer as followers,
  coalesce(count(distinct f_out.gefolgter_id), 0)::integer as following
from public.nutzer n
left join beste_leistungen bl
  on bl.nutzer_id = n.id
left join public.follow f_in
  on f_in.gefolgter_id = n.id
 and f_in.status = 'angenommen'
left join public.follow f_out
  on f_out.follower_id = n.id
 and f_out.status = 'angenommen'
group by n.id, n.nutzername, n.profilbild, n.rank;

create or replace function public.accept_follow_and_request_back(requester_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  reverse_status text;
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  if requester_id is null or requester_id = current_user_id then
    raise exception 'Ungueltige Anfrage';
  end if;

  update public.follow
  set status = 'angenommen'
  where follower_id = requester_id
    and gefolgter_id = current_user_id
    and status = 'angefragt';

  if not found then
    raise exception 'Keine offene Anfrage gefunden';
  end if;

  select status
    into reverse_status
  from public.follow
  where follower_id = current_user_id
    and gefolgter_id = requester_id;

  if reverse_status is null then
    insert into public.follow (follower_id, gefolgter_id, status)
    values (current_user_id, requester_id, 'angefragt');
    return 'created';
  end if;

  return reverse_status;
end;
$$;

revoke all on function public.accept_follow_and_request_back(uuid) from public;
grant execute on function public.accept_follow_and_request_back(uuid) to authenticated;

drop policy if exists "eigene follows lesen" on public.follow;
create policy "eigene follows lesen"
  on public.follow for select
  to authenticated
  using (auth.uid() = follower_id or auth.uid() = gefolgter_id);

drop policy if exists "eigene follows anlegen" on public.follow;
create policy "eigene follows anlegen"
  on public.follow for insert
  to authenticated
  with check (auth.uid() = follower_id and follower_id <> gefolgter_id and status = 'angefragt');

drop policy if exists "follow-anfragen annehmen" on public.follow;
create policy "follow-anfragen annehmen"
  on public.follow for update
  to authenticated
  using (auth.uid() = gefolgter_id and status = 'angefragt')
  with check (auth.uid() = gefolgter_id and status = 'angenommen');

drop policy if exists "eigene follows loeschen" on public.follow;
create policy "eigene follows loeschen"
  on public.follow for delete
  to authenticated
  using (auth.uid() = follower_id or auth.uid() = gefolgter_id);

grant select on public.oeffentliche_profile to anon, authenticated;
