DO $$
BEGIN
  if current_setting('wal_level') is distinct from 'logical' then
    raise exception 'wal_level must be set to ''logical'', your database has it set to ''%''. Please edit your `%` file and restart PostgreSQL.', current_setting('wal_level'), current_setting('config_file');
  end if;
  if (current_setting('max_replication_slots')::int >= 1) is not true then
    raise exception 'Your max_replication_slots setting is too low, it must be greater than 1. Please edit your `%` file and restart PostgreSQL.', current_setting('config_file');
  end if;
  if (current_setting('max_wal_senders')::int >= 1) is not true then
    raise exception 'Your max_wal_senders setting is too low, it must be greater than 1. Please edit your `%` file and restart PostgreSQL.', current_setting('config_file');
  end if;

  PERFORM pg_drop_replication_slot('postgraphile');
EXCEPTION
  WHEN undefined_object THEN
    -- NO ACTION
    PERFORM 1;
END;
$$ language plpgsql;


drop schema if exists app_public cascade;

create schema app_public;
set search_path to app_public, public;

create function viewer_id() returns int as $$
  select nullif(current_setting('jwt.claims.user_id', true), '')::int;
$$ language sql stable;

create table foo (
  id serial primary key,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table bar (
  id serial primary key,
  foo_id int not null references foo on delete cascade,
  name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create function odd_foos() returns setof foo as $$
  select * from app_public.foo where id % 2 = 1;
$$ language sql stable;

create function odd_foos_list() returns foo[] as $$
  select array_agg(foo.*) from app_public.foo where id % 2 = 1;
$$ language sql stable;

create function foo_one() returns foo as $$
  select * from app_public.foo where id = 1;
$$ language sql stable;

create function tg__update_timestamps() returns trigger as $$
begin
  if tg_op = 'INSERT' then
    new.created_at = now();
    new.updated_at = now();
  else
    new.created_at = old.created_at;
    new.updated_at = GREATEST(now(), old.updated_at + interval '1 microsecond');
  end if;
  return new;
end;
$$ language plpgsql;

create trigger _100_timestamps before insert or update on foo for each row execute procedure tg__update_timestamps();
create trigger _100_timestamps before insert or update on bar for each row execute procedure tg__update_timestamps();

insert into foo (name) values
  ('Adam'),
  ('Benjie'),
  ('Caroline'),
  ('Dave'),
  ('Ellie'),
  ('Francine');

insert into bar(foo_id, name) values
  (1, 'China'),
  (2, 'PostGraphile'),
  (2, 'GraphQL'),
  (3, 'Rabbits'),
  (4, 'Buns'),
  (5, 'Folk');
