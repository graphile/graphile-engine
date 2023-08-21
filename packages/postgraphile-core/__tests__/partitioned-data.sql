insert into partitioned.item (id, description) values
  (1, 'Hair dryer'),
  (2, 'Capacitor'),
  (3, 'Wagon'),
  (4, 'Fan');

insert into partitioned.warehouse (id, location) values
  (1, 'Carmel, IN'),
  (2, 'Cincinnati, OH'),
  (3, 'Chicago, IL');

insert into partitioned.stock (item_id, warehouse_id, amount) values
  (1, 1, 50),
  (1, 2, 3),
  (1, 3, 92),
  (2, 1, 20),
  (2, 2, 7),
  (2, 3, 9),
  (3, 1, 2),
  (3, 2, 9),
  (3, 3, 0),
  (4, 1, 56),
  (4, 2, 30),
  (4, 3, 101);
