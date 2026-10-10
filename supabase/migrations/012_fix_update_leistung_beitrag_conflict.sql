create or replace function public.update_leistung_with_optional_beitrag(
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

  update public.leistung l
  set wert = p_wert,
      geleistet_am = coalesce(p_geleistet_am, l.geleistet_am, current_date)
  where l.id = p_leistung_id
    and l.nutzer_id = current_user_id
  returning l.* into saved_leistung;

  if saved_leistung.id is null then
    raise exception 'Leistung nicht gefunden';
  end if;

  if p_share then
    insert into public.beitrag as b (leistung_id, text)
    values (saved_leistung.id, nullif(trim(coalesce(p_text, '')), ''))
    on conflict on constraint beitrag_leistung_id_key do update
      set text = excluded.text
    returning b.* into saved_beitrag;
  else
    delete from public.beitrag b
    where b.leistung_id = saved_leistung.id;
  end if;

  update_leistung_with_optional_beitrag.leistung_id := saved_leistung.id;
  update_leistung_with_optional_beitrag.disziplin_id := saved_leistung.disziplin_id;
  update_leistung_with_optional_beitrag.wert := saved_leistung.wert;
  update_leistung_with_optional_beitrag.medaille := saved_leistung.medaille;
  update_leistung_with_optional_beitrag.erstellt_am := saved_leistung.erstellt_am;
  update_leistung_with_optional_beitrag.geleistet_am := saved_leistung.geleistet_am;
  update_leistung_with_optional_beitrag.beitrag_id := saved_beitrag.id;
  update_leistung_with_optional_beitrag.beitrag_text := saved_beitrag.text;
  return next;
end;
$$;

revoke all on function public.update_leistung_with_optional_beitrag(uuid, numeric, boolean, text, date) from public;
grant execute on function public.update_leistung_with_optional_beitrag(uuid, numeric, boolean, text, date) to authenticated;
