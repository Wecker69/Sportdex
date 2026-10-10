alter table public.leistung
  add column if not exists geleistet_am date;

update public.leistung
set geleistet_am = erstellt_am::date
where geleistet_am is null;

alter table public.leistung
  alter column geleistet_am set default current_date,
  alter column geleistet_am set not null;

drop function if exists public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text);
drop function if exists public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text);
drop function if exists public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text, date);

create function public.create_leistung_with_optional_beitrag(
  p_disziplin_id uuid,
  p_wert numeric,
  p_share boolean default false,
  p_text text default null,
  p_bild_pfad text default null,
  p_geleistet_am date default current_date
)
returns table (
  leistung_id uuid,
  disziplin_id uuid,
  wert numeric,
  medaille text,
  erstellt_am timestamptz,
  geleistet_am date,
  beitrag_id uuid,
  bild_pfad text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_leistung public.leistung%rowtype;
  saved_beitrag public.beitrag%rowtype;
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  if p_disziplin_id is null then
    raise exception 'Disziplin erforderlich';
  end if;

  insert into public.leistung (nutzer_id, disziplin_id, wert, geleistet_am)
  values (current_user_id, p_disziplin_id, p_wert, coalesce(p_geleistet_am, current_date))
  returning * into saved_leistung;

  if p_share then
    insert into public.beitrag (leistung_id, text)
    values (saved_leistung.id, nullif(trim(coalesce(p_text, '')), ''))
    returning * into saved_beitrag;
  end if;

  leistung_id := saved_leistung.id;
  disziplin_id := saved_leistung.disziplin_id;
  wert := saved_leistung.wert;
  medaille := saved_leistung.medaille;
  erstellt_am := saved_leistung.erstellt_am;
  geleistet_am := saved_leistung.geleistet_am;
  beitrag_id := saved_beitrag.id;
  bild_pfad := null;
  return next;
end;
$$;

revoke all on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text, date) from public;
grant execute on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text, date) to authenticated;

drop function if exists public.update_leistung_with_optional_beitrag(uuid, numeric, boolean, text);
drop function if exists public.update_leistung_with_optional_beitrag(uuid, numeric, boolean, text, date);

create function public.update_leistung_with_optional_beitrag(
  p_leistung_id uuid,
  p_wert numeric,
  p_share boolean default false,
  p_text text default null,
  p_geleistet_am date default current_date
)
returns table (
  leistung_id uuid,
  disziplin_id uuid,
  wert numeric,
  medaille text,
  erstellt_am timestamptz,
  geleistet_am date,
  beitrag_id uuid,
  beitrag_text text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  saved_leistung public.leistung%rowtype;
  saved_beitrag public.beitrag%rowtype;
begin
  if current_user_id is null then
    raise exception 'Anmeldung erforderlich';
  end if;

  if p_leistung_id is null then
    raise exception 'Leistung erforderlich';
  end if;

  update public.leistung
  set wert = p_wert,
      geleistet_am = coalesce(p_geleistet_am, geleistet_am, current_date)
  where id = p_leistung_id
    and nutzer_id = current_user_id
  returning * into saved_leistung;

  if saved_leistung.id is null then
    raise exception 'Leistung nicht gefunden';
  end if;

  if p_share then
    insert into public.beitrag (leistung_id, text)
    values (saved_leistung.id, nullif(trim(coalesce(p_text, '')), ''))
    on conflict (leistung_id) do update
      set text = excluded.text
    returning * into saved_beitrag;
  else
    delete from public.beitrag
    where leistung_id = saved_leistung.id;
  end if;

  leistung_id := saved_leistung.id;
  disziplin_id := saved_leistung.disziplin_id;
  wert := saved_leistung.wert;
  medaille := saved_leistung.medaille;
  erstellt_am := saved_leistung.erstellt_am;
  geleistet_am := saved_leistung.geleistet_am;
  beitrag_id := saved_beitrag.id;
  beitrag_text := saved_beitrag.text;
  return next;
end;
$$;

revoke all on function public.update_leistung_with_optional_beitrag(uuid, numeric, boolean, text, date) from public;
grant execute on function public.update_leistung_with_optional_beitrag(uuid, numeric, boolean, text, date) to authenticated;

drop function if exists public.feed_beitraege(integer, integer);

create function public.feed_beitraege(p_limit integer default 10, p_offset integer default 0)
returns table (
  beitrag_id uuid,
  beitrag_text text,
  beitrag_erstellt_am timestamptz,
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
  rank integer
)
language sql
security definer
set search_path = public
as $$
  select
    b.id as beitrag_id,
    b.text as beitrag_text,
    b.erstellt_am as beitrag_erstellt_am,
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
    n.rank
  from public.beitrag b
  join public.leistung l on l.id = b.leistung_id
  join public.disziplin d on d.id = l.disziplin_id
  join public.nutzer n on n.id = l.nutzer_id
  where auth.uid() is not null
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
  order by b.erstellt_am desc, b.id desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.feed_beitraege(integer, integer) from public;
grant execute on function public.feed_beitraege(integer, integer) to authenticated;
