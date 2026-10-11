create or replace function public.protect_user_rank()
returns trigger
language plpgsql
as $$
begin
  new.nutzername := lower(new.nutzername);

  if tg_op = 'INSERT' and current_user = 'authenticated' and new.rank not in (1, 2, 3) then
    new.rank := 1;
  end if;

  if tg_op = 'UPDATE' and current_user = 'authenticated' and new.rank <> old.rank then
    if old.rank = 9 then
      new.rank := old.rank;
    elsif new.rank not in (1, 2, 3) then
      raise exception 'Profilart nicht erlaubt';
    end if;
  end if;

  return new;
end;
$$;
