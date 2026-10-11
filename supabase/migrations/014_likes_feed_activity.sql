create table if not exists public."like" (
  beitrag_id uuid not null references public.beitrag(id) on delete cascade,
  nutzer_id uuid not null references public.nutzer(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (beitrag_id, nutzer_id)
);

create index if not exists like_nutzer_erstellt_idx
  on public."like" (nutzer_id, erstellt_am desc);

create index if not exists like_beitrag_erstellt_idx
  on public."like" (beitrag_id, erstellt_am desc);

alter table public."like" enable row level security;

create or replace function public.can_view_beitrag(p_beitrag_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.beitrag b
    join public.leistung l on l.id = b.leistung_id
    where b.id = p_beitrag_id
      and auth.uid() is not null
      and (
        l.nutzer_id = auth.uid()
        or exists (
          select 1
          from public.follow f
          where f.follower_id = auth.uid()
            and f.gefolgter_id = l.nutzer_id
            and f.status = 'angenommen'
        )
      )
  );
$$;

revoke all on function public.can_view_beitrag(uuid) from public;
grant execute on function public.can_view_beitrag(uuid) to authenticated;

drop policy if exists "likes zu sichtbaren beitraegen lesen" on public."like";
create policy "likes zu sichtbaren beitraegen lesen"
  on public."like" for select
  to authenticated
  using (public.can_view_beitrag(beitrag_id));

drop policy if exists "eigene likes fuer sichtbare beitraege anlegen" on public."like";
create policy "eigene likes fuer sichtbare beitraege anlegen"
  on public."like" for insert
  to authenticated
  with check (auth.uid() = nutzer_id and public.can_view_beitrag(beitrag_id));

drop policy if exists "eigene likes loeschen" on public."like";
create policy "eigene likes loeschen"
  on public."like" for delete
  to authenticated
  using (auth.uid() = nutzer_id);

grant select, insert, delete on public."like" to authenticated;

create or replace function public.toggle_beitrag_like(p_beitrag_id uuid)
returns table (
  beitrag_id uuid,
  liked_by_me boolean,
  like_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  if p_beitrag_id is null or not public.can_view_beitrag(p_beitrag_id) then
    raise exception 'Beitrag nicht gefunden oder nicht sichtbar';
  end if;

  delete from public."like" l
  where l.beitrag_id = p_beitrag_id
    and l.nutzer_id = current_user_id;

  if found then
    toggle_beitrag_like.beitrag_id := p_beitrag_id;
    toggle_beitrag_like.liked_by_me := false;
  else
    insert into public."like" (beitrag_id, nutzer_id)
    values (p_beitrag_id, current_user_id)
    on conflict do nothing;

    toggle_beitrag_like.beitrag_id := p_beitrag_id;
    toggle_beitrag_like.liked_by_me := true;
  end if;

  select count(*)::integer
    into toggle_beitrag_like.like_count
  from public."like" l
  where l.beitrag_id = p_beitrag_id;

  return next;
end;
$$;

revoke all on function public.toggle_beitrag_like(uuid) from public;
grant execute on function public.toggle_beitrag_like(uuid) to authenticated;

drop function if exists public.feed_beitraege(integer, integer);

create function public.feed_beitraege(p_limit integer default 10, p_offset integer default 0)
returns table (
  beitrag_id uuid,
  beitrag_text text,
  beitrag_erstellt_am timestamptz,
  bild_pfad text,
  leistung_id uuid,
  wert numeric,
  medaille text,
  geleistet_am date,
  disziplin_id uuid,
  disziplin_name text,
  einheit text,
  nachkommastellen integer,
  autor_id uuid,
  nutzername text,
  profilbild text,
  rank integer,
  like_count integer,
  liked_by_me boolean
)
language sql
security definer
set search_path = public
as $$
  select
    b.id as beitrag_id,
    b.text as beitrag_text,
    b.erstellt_am as beitrag_erstellt_am,
    b.bild_pfad,
    l.id as leistung_id,
    l.wert,
    l.medaille,
    l.geleistet_am,
    d.id as disziplin_id,
    d.name as disziplin_name,
    d.einheit,
    d.nachkommastellen,
    n.id as autor_id,
    n.nutzername,
    n.profilbild,
    n.rank,
    coalesce(likes.like_count, 0)::integer as like_count,
    exists (
      select 1
      from public."like" own_like
      where own_like.beitrag_id = b.id
        and own_like.nutzer_id = auth.uid()
    ) as liked_by_me
  from public.beitrag b
  join public.leistung l on l.id = b.leistung_id
  join public.disziplin d on d.id = l.disziplin_id
  join public.nutzer n on n.id = l.nutzer_id
  left join lateral (
    select count(*)::integer as like_count
    from public."like" counted_like
    where counted_like.beitrag_id = b.id
  ) likes on true
  where public.can_view_beitrag(b.id)
  order by b.erstellt_am desc, b.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.feed_beitraege(integer, integer) from public;
grant execute on function public.feed_beitraege(integer, integer) to authenticated;

create or replace function public.received_like_activity(p_limit integer default 10, p_offset integer default 0)
returns table (
  beitrag_id uuid,
  beitrag_text text,
  liked_at timestamptz,
  liker_id uuid,
  liker_name text,
  liker_profilbild text,
  liker_rank integer,
  leistung_id uuid,
  wert numeric,
  medaille text,
  geleistet_am date,
  disziplin_id uuid,
  disziplin_name text
)
language sql
security definer
set search_path = public
as $$
  select
    b.id as beitrag_id,
    b.text as beitrag_text,
    li.erstellt_am as liked_at,
    liker.id as liker_id,
    liker.nutzername as liker_name,
    liker.profilbild as liker_profilbild,
    liker.rank as liker_rank,
    l.id as leistung_id,
    l.wert,
    l.medaille,
    l.geleistet_am,
    d.id as disziplin_id,
    d.name as disziplin_name
  from public."like" li
  join public.beitrag b on b.id = li.beitrag_id
  join public.leistung l on l.id = b.leistung_id
  join public.disziplin d on d.id = l.disziplin_id
  join public.nutzer liker on liker.id = li.nutzer_id
  where auth.uid() is not null
    and l.nutzer_id = auth.uid()
    and li.nutzer_id <> auth.uid()
  order by li.erstellt_am desc, li.beitrag_id desc, li.nutzer_id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.received_like_activity(integer, integer) from public;
grant execute on function public.received_like_activity(integer, integer) to authenticated;

create or replace function public.own_like_activity(p_limit integer default 10, p_offset integer default 0)
returns table (
  beitrag_id uuid,
  beitrag_text text,
  liked_at timestamptz,
  author_id uuid,
  author_name text,
  author_profilbild text,
  author_rank integer,
  leistung_id uuid,
  wert numeric,
  medaille text,
  geleistet_am date,
  disziplin_id uuid,
  disziplin_name text
)
language sql
security definer
set search_path = public
as $$
  select
    b.id as beitrag_id,
    b.text as beitrag_text,
    li.erstellt_am as liked_at,
    author.id as author_id,
    author.nutzername as author_name,
    author.profilbild as author_profilbild,
    author.rank as author_rank,
    l.id as leistung_id,
    l.wert,
    l.medaille,
    l.geleistet_am,
    d.id as disziplin_id,
    d.name as disziplin_name
  from public."like" li
  join public.beitrag b on b.id = li.beitrag_id
  join public.leistung l on l.id = b.leistung_id
  join public.disziplin d on d.id = l.disziplin_id
  join public.nutzer author on author.id = l.nutzer_id
  where auth.uid() is not null
    and li.nutzer_id = auth.uid()
    and public.can_view_beitrag(b.id)
  order by li.erstellt_am desc, li.beitrag_id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.own_like_activity(integer, integer) from public;
grant execute on function public.own_like_activity(integer, integer) to authenticated;
