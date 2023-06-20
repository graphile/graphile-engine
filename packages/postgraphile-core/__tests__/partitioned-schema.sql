drop schema if exists partitioned cascade;

create schema partitioned;

CREATE TABLE partitioned.item (
    id integer PRIMARY KEY,
    description text NOT NULL
) PARTITION BY hash (id);
CREATE TABLE partitioned.item_0 PARTITION OF partitioned.item FOR VALUES WITH (modulus 3, remainder 0);
CREATE TABLE partitioned.item_1 PARTITION OF partitioned.item FOR VALUES WITH (modulus 3, remainder 1);
CREATE TABLE partitioned.item_2 PARTITION OF partitioned.item FOR VALUES WITH (modulus 3, remainder 2);

CREATE TABLE partitioned.warehouse (
    id integer primary key,
    location text not null
);

CREATE TABLE partitioned.stock (
    item_id integer not null REFERENCES partitioned.item,
    warehouse_id integer not null REFERENCES partitioned.warehouse,
    amount int not null,
    PRIMARY KEY (item_id, warehouse_id)
) partition by hash (warehouse_id);
CREATE TABLE partitioned.stock_0 PARTITION OF partitioned.stock FOR VALUES WITH (modulus 5, remainder 0);
CREATE TABLE partitioned.stock_1 PARTITION OF partitioned.stock FOR VALUES WITH (modulus 5, remainder 1);
CREATE TABLE partitioned.stock_2 PARTITION OF partitioned.stock FOR VALUES WITH (modulus 5, remainder 2);
CREATE TABLE partitioned.stock_3 PARTITION OF partitioned.stock FOR VALUES WITH (modulus 5, remainder 3);
CREATE TABLE partitioned.stock_4 PARTITION OF partitioned.stock FOR VALUES WITH (modulus 5, remainder 4);
