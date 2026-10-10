drop policy if exists "eigenes profil loeschen" on public.nutzer;
create policy "eigenes profil loeschen"
  on public.nutzer for delete
  to authenticated
  using (auth.uid() = id);
