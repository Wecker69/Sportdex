insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('disziplinbilder', 'disziplinbilder', true, 5242880, array['image/png'])
on conflict (id) do update
set public = true,
    file_size_limit = 5242880,
    allowed_mime_types = array['image/png'];

drop policy if exists "disziplinbilder authenticated uploads" on storage.objects;
drop policy if exists "disziplinbilder authenticated updates" on storage.objects;
drop policy if exists "disziplinbilder authenticated deletes" on storage.objects;
drop policy if exists "disziplinbilder app uploads" on storage.objects;
drop policy if exists "disziplinbilder app updates" on storage.objects;
drop policy if exists "disziplinbilder app deletes" on storage.objects;

drop function if exists public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text);
drop function if exists public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text);

create function public.create_leistung_with_optional_beitrag(
  p_disziplin_id uuid,
  p_wert numeric,
  p_share boolean default false,
  p_text text default null,
  p_bild_pfad text default null
)
returns table (
  leistung_id uuid,
  disziplin_id uuid,
  wert numeric,
  medaille text,
  erstellt_am timestamptz,
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
  bild_pfad := null;
  return next;
end;
$$;

revoke all on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text) from public;
grant execute on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text) to authenticated;
