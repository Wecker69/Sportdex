create or replace function public.validate_leistung_value()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  discipline public.disziplin%rowtype;
  decimals numeric;
begin
  select * into discipline
  from public.disziplin
  where id = new.disziplin_id;

  if discipline.id is null then
    raise exception 'Disziplin nicht gefunden';
  end if;

  if new.wert is null then
    raise exception 'Leistungswert erforderlich';
  end if;

  if new.wert < 0 then
    raise exception 'Negative Werte sind nicht erlaubt';
  end if;

  if discipline.einheit in ('Sekunden', 'Meter', 'Stufe') and new.wert <= 0 then
    raise exception 'Dieser Wert muss groesser als null sein';
  end if;

  if discipline.nachkommastellen = 0 and new.wert <> trunc(new.wert) then
    raise exception 'Diese Disziplin erlaubt nur ganze Zahlen';
  end if;

  decimals := power(10::numeric, discipline.nachkommastellen);
  if discipline.nachkommastellen > 0 and new.wert <> round(new.wert * decimals) / decimals then
    raise exception 'Zu viele Nachkommastellen';
  end if;

  if discipline.name in ('20x Freiwurf', '20x Dreierwuerfe') and new.wert > 20 then
    raise exception 'Maximal 20 Treffer moeglich';
  end if;

  if discipline.name = '5x Lattenschiessen' and new.wert > 5 then
    raise exception 'Maximal 5 Treffer moeglich';
  end if;

  if discipline.name = 'Distanzwurf' and new.wert not in (1, 2, 3) then
    raise exception 'Ungueltige Distanzwurf-Stufe';
  end if;

  return new;
end;
$$;

drop trigger if exists validate_leistung_value_trigger on public.leistung;
create trigger validate_leistung_value_trigger
  before insert or update of wert, disziplin_id on public.leistung
  for each row execute function public.validate_leistung_value();

create or replace function public.create_leistung_with_optional_beitrag(
  p_disziplin_id uuid,
  p_wert numeric,
  p_share boolean default false,
  p_text text default null
)
returns table (
  leistung_id uuid,
  disziplin_id uuid,
  wert numeric,
  medaille text,
  erstellt_am timestamptz,
  beitrag_id uuid
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

  insert into public.leistung (nutzer_id, disziplin_id, wert)
  values (current_user_id, p_disziplin_id, p_wert)
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
  beitrag_id := saved_beitrag.id;
  return next;
end;
$$;

revoke all on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text) from public;
grant execute on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text) to authenticated;

create or replace function public.feed_beitraege(p_limit integer default 10, p_offset integer default 0)
returns table (
  beitrag_id uuid,
  beitrag_text text,
  beitrag_erstellt_am timestamptz,
  leistung_id uuid,
  wert numeric,
  medaille text,
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
