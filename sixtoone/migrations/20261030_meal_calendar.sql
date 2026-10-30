begin;
-- Additive migration: food_draws and make_food_draw are deliberately untouched.
create sequence public.meal_calendar_version_v22;
create table public.meal_calendar_v22 (
 meal_date date not null,
 slot text not null check(slot in ('lunch','dinner')),
 food text not null check(char_length(food) between 1 and 80),
 updated_by text not null check(char_length(updated_by) between 1 and 20),
 updated_at timestamptz not null default now(),
 version bigint not null default 1,
 primary key(meal_date,slot)
);
create table public.meal_calendar_audit_v22 (
 id bigint generated always as identity primary key,
 meal_date date not null, slot text not null,
 action text not null check(action in ('create','update','delete')),
 old_food text, new_food text,
 actor text not null, created_at timestamptz not null default now()
);
alter table public.meal_calendar_v22 enable row level security;
alter table public.meal_calendar_audit_v22 enable row level security;
revoke all on public.meal_calendar_v22, public.meal_calendar_audit_v22 from public,anon,authenticated;
grant select on public.meal_calendar_v22,public.meal_calendar_audit_v22 to anon,authenticated;
create policy calendar_read on public.meal_calendar_v22 for select to anon,authenticated using(true);
create policy audit_read on public.meal_calendar_audit_v22 for select to anon,authenticated using(true);
create function public.edit_meal_calendar_v22(p_date date,p_slot text,p_food text,p_actor text,p_version bigint,p_delete boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare old_row public.meal_calendar_v22%rowtype;
begin
 if p_date is null or p_slot is null or p_slot not in ('lunch','dinner') or p_actor is null or char_length(btrim(p_actor)) not between 1 and 20 or p_delete is null then raise exception '日期、时段或昵称无效'; end if;
 if not p_delete and (p_food is null or char_length(btrim(p_food)) not between 1 and 80) then raise exception '菜名须为1至80个字符'; end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext(p_date::text||p_slot));
 select * into old_row from public.meal_calendar_v22 where meal_date=p_date and slot=p_slot for update;
 if coalesce(old_row.version,0) is distinct from p_version then raise exception '安排已被其他人修改，请刷新后重试'; end if;
 if p_delete then
  if old_row.version is null then raise exception '没有可删除的安排'; end if;
  delete from public.meal_calendar_v22 where meal_date=p_date and slot=p_slot;
 else
  insert into public.meal_calendar_v22(meal_date,slot,food,updated_by,updated_at,version)
  values(p_date,p_slot,btrim(p_food),btrim(p_actor),clock_timestamp(),nextval('public.meal_calendar_version_v22'::regclass))
  on conflict(meal_date,slot) do update set food=excluded.food,updated_by=excluded.updated_by,updated_at=excluded.updated_at,version=excluded.version;
 end if;
 insert into public.meal_calendar_audit_v22(meal_date,slot,action,old_food,new_food,actor)
 values(p_date,p_slot,case when p_delete then 'delete' when old_row.version is null then 'create' else 'update' end,old_row.food,case when p_delete then null else btrim(p_food) end,btrim(p_actor));
end $$;
revoke all on function public.edit_meal_calendar_v22(date,text,text,text,bigint,boolean) from public;
grant execute on function public.edit_meal_calendar_v22(date,text,text,text,bigint,boolean) to anon,authenticated;
commit;
-- Run once. A second run fails and rolls back safely. Never drop tables to rerun.
