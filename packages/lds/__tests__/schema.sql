DO $$
BEGIN
  if current_setting('wal_level') is distinct from 'logical' then
    raise exception 'wal_level must be set to ''logical'', your database has it set to ''%''. Please edit your `%` file and restart PostgreSQL.', current_setting('wal_level'), current_setting('config_file');
  end if;
  if (current_setting('max_replication_slots')::int > 1) is not true then
    raise exception 'Your max_replication_slots setting is too low, it must be greater than 1. Please edit your `%` file and restart PostgreSQL.', current_setting('config_file');
  end if;
  if (current_setting('max_wal_senders')::int > 1) is not true then
    raise exception 'Your max_wal_senders setting is too low, it must be greater than 1. Please edit your `%` file and restart PostgreSQL.', current_setting('config_file');
  end if;

  SELECT pg_drop_replication_slot('test_slot');
EXCEPTION
  WHEN undefined_object THEN
    -- NO ACTION
    PERFORM 1;
END;
$$ language plpgsql;


drop schema if exists app_public cascade;

create schema app_public;
set search_path to app_public, public;

create table foo (
  id serial primary key,
  name text
);

create table bar (
  id serial primary key,
  foo_id int not null references foo on delete cascade,
  name text
);

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