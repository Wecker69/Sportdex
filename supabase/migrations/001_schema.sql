create extension if not exists pgcrypto;

create table if not exists public.nutzer (
  id uuid primary key references auth.users(id) on delete cascade,
  nutzername text not null unique,
  vorname text,
  nachname text,
  wertungsklasse text not null check (wertungsklasse in ('m', 'w')),
  geburtsdatum date,
  profilbild text,
  beschreibung text,
  rank integer not null default 1 check (rank > 0),
  erstellt_am timestamptz not null default now(),
  constraint nutzername_format check (nutzername = lower(nutzername) and nutzername ~ '^[a-z0-9_]{3,24}$')
);

create table if not exists public.disziplin (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  beschreibung text not null,
  kategorie_1 text not null,
  kategorie_2 text,
  einheit text not null,
  nachkommastellen integer not null check (nachkommastellen >= 0 and nachkommastellen <= 4),
  bewertungsrichtung text not null check (bewertungsrichtung in ('hoeher', 'niedriger')),
  bronze_m numeric,
  silber_m numeric,
  gold_m numeric,
  bronze_w numeric,
  silber_w numeric,
  gold_w numeric,
  dsa boolean not null default false,
  generation integer not null check (generation > 0),
  aktiv boolean not null default true,
  sortierung integer not null unique check (sortierung > 0),
  erstellt_am timestamptz not null default now()
);

create table if not exists public.leistung (
  id uuid primary key default gen_random_uuid(),
  nutzer_id uuid not null references public.nutzer(id) on delete cascade,
  disziplin_id uuid not null references public.disziplin(id) on delete restrict,
  wert numeric not null,
  medaille text not null default 'unbewertet' check (medaille in ('keine', 'bronze', 'silber', 'gold', 'unbewertet')),
  erstellt_am timestamptz not null default now()
);

create table if not exists public.beitrag (
  id uuid primary key default gen_random_uuid(),
  leistung_id uuid not null unique references public.leistung(id) on delete cascade,
  text text,
  erstellt_am timestamptz not null default now()
);

create table if not exists public.follow (
  follower_id uuid not null references public.nutzer(id) on delete cascade,
  gefolgter_id uuid not null references public.nutzer(id) on delete cascade,
  erstellt_am timestamptz not null default now(),
  primary key (follower_id, gefolgter_id),
  constraint follow_no_self check (follower_id <> gefolgter_id)
);

create index if not exists disziplin_aktiv_sortierung_idx on public.disziplin (aktiv, sortierung);
create index if not exists disziplin_kategorie_idx on public.disziplin (kategorie_1, kategorie_2);
create index if not exists leistung_nutzer_idx on public.leistung (nutzer_id, erstellt_am desc);
create index if not exists leistung_disziplin_idx on public.leistung (disziplin_id);
create index if not exists beitrag_leistung_idx on public.beitrag (leistung_id);
create index if not exists follow_gefolgter_idx on public.follow (gefolgter_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  raw_name text;
  raw_class text;
begin
  raw_name := lower(coalesce(new.raw_user_meta_data ->> 'nutzername', split_part(new.email, '@', 1)));
  raw_name := regexp_replace(raw_name, '[^a-z0-9_]', '_', 'g');
  raw_name := left(raw_name, 24);
  if length(raw_name) < 3 then
    raw_name := 'user_' || substr(replace(new.id::text, '-', ''), 1, 8);
  end if;

  raw_class := coalesce(new.raw_user_meta_data ->> 'wertungsklasse', 'm');
  if raw_class not in ('m', 'w') then
    raw_class := 'm';
  end if;

  insert into public.nutzer (id, nutzername, wertungsklasse)
  values (new.id, raw_name, raw_class)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.protect_user_rank()
returns trigger
language plpgsql
as $$
begin
  new.nutzername := lower(new.nutzername);
  if tg_op = 'UPDATE' and current_user = 'authenticated' and new.rank <> old.rank then
    new.rank := old.rank;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_user_rank_trigger on public.nutzer;
create trigger protect_user_rank_trigger
  before insert or update on public.nutzer
  for each row execute function public.protect_user_rank();

create or replace function public.calculate_medal(
  value numeric,
  direction text,
  bronze numeric,
  silver numeric,
  gold numeric
)
returns text
language plpgsql
immutable
as $$
begin
  if value is null or direction is null then
    return 'unbewertet';
  end if;

  if bronze is null and silver is null and gold is null then
    return 'unbewertet';
  end if;

  if direction = 'hoeher' then
    if gold is not null and value >= gold then return 'gold'; end if;
    if silver is not null and value >= silver then return 'silber'; end if;
    if bronze is not null and value >= bronze then return 'bronze'; end if;
  elsif direction = 'niedriger' then
    if gold is not null and value <= gold then return 'gold'; end if;
    if silver is not null and value <= silver then return 'silber'; end if;
    if bronze is not null and value <= bronze then return 'bronze'; end if;
  end if;

  return 'keine';
end;
$$;

create or replace function public.set_leistung_medaille()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  class text;
  discipline public.disziplin%rowtype;
begin
  select wertungsklasse into class from public.nutzer where id = new.nutzer_id;
  select * into discipline from public.disziplin where id = new.disziplin_id;

  if class = 'w' then
    new.medaille := public.calculate_medal(new.wert, discipline.bewertungsrichtung, discipline.bronze_w, discipline.silber_w, discipline.gold_w);
  elsif class = 'm' then
    new.medaille := public.calculate_medal(new.wert, discipline.bewertungsrichtung, discipline.bronze_m, discipline.silber_m, discipline.gold_m);
  else
    new.medaille := 'unbewertet';
  end if;

  return new;
end;
$$;

drop trigger if exists set_leistung_medaille_trigger on public.leistung;
create trigger set_leistung_medaille_trigger
  before insert or update of wert, disziplin_id, nutzer_id, medaille on public.leistung
  for each row execute function public.set_leistung_medaille();

create or replace function public.disable_used_disziplin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if exists (select 1 from public.leistung where disziplin_id = old.id) then
    update public.disziplin set aktiv = false where id = old.id;
    return null;
  end if;
  return old;
end;
$$;

drop trigger if exists disable_used_disziplin_trigger on public.disziplin;
create trigger disable_used_disziplin_trigger
  before delete on public.disziplin
  for each row execute function public.disable_used_disziplin();

create or replace view public.oeffentliche_profile
as
select id, nutzername, profilbild, rank
from public.nutzer;

alter table public.nutzer enable row level security;
alter table public.disziplin enable row level security;
alter table public.leistung enable row level security;
alter table public.beitrag enable row level security;
alter table public.follow enable row level security;

drop policy if exists "aktive disziplinen sind lesbar" on public.disziplin;
create policy "aktive disziplinen sind lesbar"
  on public.disziplin for select
  using (aktiv = true);

drop policy if exists "eigene nutzerzeile lesen" on public.nutzer;
create policy "eigene nutzerzeile lesen"
  on public.nutzer for select
  to authenticated
  using (auth.uid() = id);

drop policy if exists "eigene nutzerzeile anlegen" on public.nutzer;
create policy "eigene nutzerzeile anlegen"
  on public.nutzer for insert
  to authenticated
  with check (auth.uid() = id and rank = 1);

drop policy if exists "eigenes profil bearbeiten" on public.nutzer;
create policy "eigenes profil bearbeiten"
  on public.nutzer for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "eigene leistungen lesen" on public.leistung;
create policy "eigene leistungen lesen"
  on public.leistung for select
  to authenticated
  using (auth.uid() = nutzer_id);

drop policy if exists "eigene leistungen anlegen" on public.leistung;
create policy "eigene leistungen anlegen"
  on public.leistung for insert
  to authenticated
  with check (auth.uid() = nutzer_id);

drop policy if exists "eigene leistungen bearbeiten" on public.leistung;
create policy "eigene leistungen bearbeiten"
  on public.leistung for update
  to authenticated
  using (auth.uid() = nutzer_id)
  with check (auth.uid() = nutzer_id);

drop policy if exists "eigene leistungen loeschen" on public.leistung;
create policy "eigene leistungen loeschen"
  on public.leistung for delete
  to authenticated
  using (auth.uid() = nutzer_id);

drop policy if exists "eigene beitraege lesen" on public.beitrag;
create policy "eigene beitraege lesen"
  on public.beitrag for select
  to authenticated
  using (exists (
    select 1 from public.leistung
    where leistung.id = beitrag.leistung_id
      and leistung.nutzer_id = auth.uid()
  ));

drop policy if exists "beitraege fuer eigene leistungen anlegen" on public.beitrag;
create policy "beitraege fuer eigene leistungen anlegen"
  on public.beitrag for insert
  to authenticated
  with check (exists (
    select 1 from public.leistung
    where leistung.id = beitrag.leistung_id
      and leistung.nutzer_id = auth.uid()
  ));

drop policy if exists "eigene beitraege bearbeiten" on public.beitrag;
create policy "eigene beitraege bearbeiten"
  on public.beitrag for update
  to authenticated
  using (exists (
    select 1 from public.leistung
    where leistung.id = beitrag.leistung_id
      and leistung.nutzer_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.leistung
    where leistung.id = beitrag.leistung_id
      and leistung.nutzer_id = auth.uid()
  ));

drop policy if exists "eigene beitraege loeschen" on public.beitrag;
create policy "eigene beitraege loeschen"
  on public.beitrag for delete
  to authenticated
  using (exists (
    select 1 from public.leistung
    where leistung.id = beitrag.leistung_id
      and leistung.nutzer_id = auth.uid()
  ));

drop policy if exists "eigene follows lesen" on public.follow;
create policy "eigene follows lesen"
  on public.follow for select
  to authenticated
  using (auth.uid() = follower_id or auth.uid() = gefolgter_id);

drop policy if exists "eigene follows anlegen" on public.follow;
create policy "eigene follows anlegen"
  on public.follow for insert
  to authenticated
  with check (auth.uid() = follower_id and follower_id <> gefolgter_id);

drop policy if exists "eigene follows loeschen" on public.follow;
create policy "eigene follows loeschen"
  on public.follow for delete
  to authenticated
  using (auth.uid() = follower_id);

grant usage on schema public to anon, authenticated;
grant select on public.disziplin to anon, authenticated;
grant select, insert, update, delete on public.nutzer, public.leistung, public.beitrag, public.follow to authenticated;
grant select on public.oeffentliche_profile to anon, authenticated;
