alter table public.beitrag
  add column if not exists bild_pfad text;

create unique index if not exists beitrag_bild_pfad_unique
  on public.beitrag (bild_pfad)
  where bild_pfad is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('beitragsbilder', 'beitragsbilder', false, 1048576, array['image/webp', 'image/jpeg'])
on conflict (id) do update
set public = false,
    file_size_limit = 1048576,
    allowed_mime_types = array['image/webp', 'image/jpeg'];

drop policy if exists "beitragsbilder eigene uploads" on storage.objects;
create policy "beitragsbilder eigene uploads"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'beitragsbilder'
    and split_part(name, '/', 1) = auth.uid()::text
    and lower(coalesce((metadata ->> 'mimetype'), '')) in ('image/webp', 'image/jpeg')
    and coalesce((metadata ->> 'size')::bigint, 0) <= 1048576
    and coalesce((metadata ->> 'width')::integer, 0) between 1 and 1440
    and coalesce((metadata ->> 'height')::integer, 0) between 1 and 1440
    and name ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(webp|jpg|jpeg)$'
  );

drop policy if exists "beitragsbilder eigene unverknuepfte lesen" on storage.objects;
create policy "beitragsbilder eigene unverknuepfte lesen"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'beitragsbilder'
    and split_part(name, '/', 1) = auth.uid()::text
  );

drop policy if exists "beitragsbilder berechtigte beitraege lesen" on storage.objects;
create policy "beitragsbilder berechtigte beitraege lesen"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'beitragsbilder'
    and exists (
      select 1
      from public.beitrag b
      join public.leistung l on l.id = b.leistung_id
      where b.bild_pfad = storage.objects.name
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
    )
  );

drop policy if exists "beitragsbilder eigene unverknuepfte loeschen" on storage.objects;
create policy "beitragsbilder eigene unverknuepfte loeschen"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'beitragsbilder'
    and split_part(name, '/', 1) = auth.uid()::text
    and not exists (
      select 1
      from public.beitrag b
      where b.bild_pfad = storage.objects.name
    )
  );

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

  if p_bild_pfad is not null then
    if not p_share then
      raise exception 'Bilder koennen nur mit geteilten Beitraegen gespeichert werden';
    end if;
    if split_part(p_bild_pfad, '/', 1) <> current_user_id::text then
      raise exception 'Bildpfad gehoert nicht zum angemeldeten Nutzer';
    end if;
    if p_bild_pfad !~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}\.(webp|jpg|jpeg)$' then
      raise exception 'Ungueltiger Bildpfad';
    end if;
    if not exists (
      select 1
      from storage.objects o
      where o.bucket_id = 'beitragsbilder'
        and o.name = p_bild_pfad
        and lower(coalesce(o.metadata ->> 'mimetype', '')) in ('image/webp', 'image/jpeg')
        and coalesce((o.metadata ->> 'size')::bigint, 0) <= 1048576
        and coalesce((o.metadata ->> 'width')::integer, 0) between 1 and 1440
        and coalesce((o.metadata ->> 'height')::integer, 0) between 1 and 1440
    ) then
      raise exception 'Bild wurde nicht gefunden oder ist ungueltig';
    end if;

    select b.*
      into saved_beitrag
    from public.beitrag b
    join public.leistung l on l.id = b.leistung_id
    where b.bild_pfad = p_bild_pfad
      and l.nutzer_id = current_user_id;

    if saved_beitrag.id is not null then
      select *
        into saved_leistung
      from public.leistung
      where id = saved_beitrag.leistung_id;

      leistung_id := saved_leistung.id;
      disziplin_id := saved_leistung.disziplin_id;
      wert := saved_leistung.wert;
      medaille := saved_leistung.medaille;
      erstellt_am := saved_leistung.erstellt_am;
      beitrag_id := saved_beitrag.id;
      bild_pfad := saved_beitrag.bild_pfad;
      return next;
      return;
    end if;
  end if;

  insert into public.leistung (nutzer_id, disziplin_id, wert)
  values (current_user_id, p_disziplin_id, p_wert)
  returning * into saved_leistung;

  if p_share then
    insert into public.beitrag (leistung_id, text, bild_pfad)
    values (saved_leistung.id, nullif(trim(coalesce(p_text, '')), ''), p_bild_pfad)
    returning * into saved_beitrag;
  end if;

  leistung_id := saved_leistung.id;
  disziplin_id := saved_leistung.disziplin_id;
  wert := saved_leistung.wert;
  medaille := saved_leistung.medaille;
  erstellt_am := saved_leistung.erstellt_am;
  beitrag_id := saved_beitrag.id;
  bild_pfad := saved_beitrag.bild_pfad;
  return next;
end;
$$;

revoke all on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text) from public;
grant execute on function public.create_leistung_with_optional_beitrag(uuid, numeric, boolean, text, text) to authenticated;

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
    b.bild_pfad,
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
