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

  if tg_op = 'DELETE' then
    if auth.uid() = old.follower_id and old.status in ('angefragt', 'angenommen') then
      return old;
    end if;
    if auth.uid() = old.gefolgter_id and old.status in ('angefragt', 'angenommen') then
      return old;
    end if;
    raise exception 'Diese Follow-Loeschung ist nicht erlaubt';
  end if;

  return new;
end;
$$;

drop trigger if exists protect_follow_status_trigger on public.follow;
create trigger protect_follow_status_trigger
  before insert or update or delete on public.follow
  for each row execute function public.protect_follow_status();

drop function if exists public.accept_follow_and_request_back(uuid);
