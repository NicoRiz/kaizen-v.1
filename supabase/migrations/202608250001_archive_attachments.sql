insert into storage.buckets (id, name, public)
values ('archive-attachments', 'archive-attachments', false)
on conflict (id) do update set public = false;

drop policy if exists "Users can read own archive attachments" on storage.objects;
create policy "Users can read own archive attachments"
  on storage.objects for select to authenticated
  using (bucket_id = 'archive-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can upload own archive attachments" on storage.objects;
create policy "Users can upload own archive attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'archive-attachments' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Users can delete own archive attachments" on storage.objects;
create policy "Users can delete own archive attachments"
  on storage.objects for delete to authenticated
  using (bucket_id = 'archive-attachments' and (storage.foldername(name))[1] = auth.uid()::text);
