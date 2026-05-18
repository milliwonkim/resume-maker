-- ============================================================
-- Resume Builder Schema (Supabase)
-- Supabase 기본 bigint ID를 사용하고, 섹션 content는 compact JSON 형태로 저장합니다.
-- ============================================================

-- resumes 테이블 재생성
create extension if not exists pgcrypto;

drop table if exists resume_sections cascade;
drop table if exists resumes cascade;

create table resumes (
  id        bigint generated always as identity primary key,
  user_id   uuid        not null references auth.users(id) on delete cascade,
  title     text        not null default '새 이력서',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table resume_sections (
  id          bigint generated always as identity primary key,
  resume_id   bigint      not null references resumes(id) on delete cascade,
  type        text        not null,
  layout      text        not null default 'layout1',
  content     jsonb       not null default '{}',
  order_index integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- updated_at 자동 갱신 트리거
create or replace function update_updated_at()
returns trigger as $$
begin
  if new.updated_at is not distinct from old.updated_at then
    new.updated_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

create trigger resumes_updated_at
  before update on resumes
  for each row execute function update_updated_at();

create trigger resume_sections_updated_at
  before update on resume_sections
  for each row execute function update_updated_at();

-- 인덱스
create index on resume_sections(resume_id);
create index on resume_sections(resume_id, order_index);
create index on resumes(user_id);

alter table resumes enable row level security;
alter table resume_sections enable row level security;

create policy "Users can read own resumes"
  on resumes for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own resumes"
  on resumes for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own resumes"
  on resumes for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy "Users can delete own resumes"
  on resumes for delete
  to authenticated
  using (user_id = auth.uid());

create policy "Users can read own resume sections"
  on resume_sections for select
  to authenticated
  using (
    exists (
      select 1
      from resumes
      where resumes.id = resume_sections.resume_id
        and resumes.user_id = auth.uid()
    )
  );

create policy "Users can insert own resume sections"
  on resume_sections for insert
  to authenticated
  with check (
    exists (
      select 1
      from resumes
      where resumes.id = resume_sections.resume_id
        and resumes.user_id = auth.uid()
    )
  );

create policy "Users can update own resume sections"
  on resume_sections for update
  to authenticated
  using (
    exists (
      select 1
      from resumes
      where resumes.id = resume_sections.resume_id
        and resumes.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1
      from resumes
      where resumes.id = resume_sections.resume_id
        and resumes.user_id = auth.uid()
    )
  );

create policy "Users can delete own resume sections"
  on resume_sections for delete
  to authenticated
  using (
    exists (
      select 1
      from resumes
      where resumes.id = resume_sections.resume_id
        and resumes.user_id = auth.uid()
    )
  );

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'resume-images',
  'resume-images',
  true,
  4194304,
  array['image/jpeg', 'image/png', 'image/webp', 'image/gif']
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Anyone can read resume images" on storage.objects;
drop policy if exists "Users can upload own resume images" on storage.objects;
drop policy if exists "Users can update own resume images" on storage.objects;
drop policy if exists "Users can delete own resume images" on storage.objects;

create policy "Anyone can read resume images"
  on storage.objects for select
  using (bucket_id = 'resume-images');

create policy "Users can upload own resume images"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'resume-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can update own resume images"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'resume-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'resume-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can delete own resume images"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'resume-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

grant usage on schema public to anon, authenticated;
grant all on table resumes to authenticated;
grant all on table resume_sections to authenticated;

-- 고아 이력서 소유권 이전 함수
-- 현재 로그인한 사용자가 auth.users에 존재하지 않는 user_id를 가진 이력서를 모두 자신의 것으로 가져옵니다.
create or replace function claim_orphaned_resumes()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  updated_count integer;
begin
  update resumes
  set user_id = auth.uid()
  where user_id not in (select id from auth.users);

  get diagnostics updated_count = row_count;
  return updated_count;
end;
$$;

grant execute on function claim_orphaned_resumes() to authenticated;
