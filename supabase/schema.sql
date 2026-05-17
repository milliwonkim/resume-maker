-- ============================================================
-- Resume Builder Schema (Supabase)
-- Supabase 기본 bigint ID를 사용합니다
-- ============================================================

-- resumes 테이블 재생성
drop table if exists resume_sections cascade;
drop table if exists resumes cascade;

create table resumes (
  id        bigint generated always as identity primary key,
  title     text        not null default '새 이력서',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- resume_sections 테이블 (id를 개별 PK로)
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
  new.updated_at = now();
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
