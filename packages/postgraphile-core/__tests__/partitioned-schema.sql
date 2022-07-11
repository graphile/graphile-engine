drop schema if exists partitioned cascade;

create schema partitioned;

create table partitioned.temperature_log (
    temperature int,
    log_date date not null
) partition by range (log_date);

create table partitioned.temperature_log_y2022m07 partition OF partitioned.temperature_log
    FOR VALUES FROM ('2022-07-01') TO ('2022-07-31');
