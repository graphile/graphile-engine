insert into pg11.network values
  (1, '192.168.0.0', '192.168.0.0/16', '08:00:2b:01:02:03', '08:00:2b:01:02:03:04:05'),
  (2, '192.168.0.1', '192.168', '08-00-2b-01-02-03', '08-00-2b-01-02-03-04-05'),
  (3, '172.16.0.0/12', '172.16.0.0/12', '08002b:010203', '08002b:0102030405'),
  (4, '172.16.0.1/12', '172.16.0', '08002b-010203', '08002b-0102030405'),
  (5, '2001:4f8:3:ba::', '2001:4f8:3:ba::/64', '0800.2b01.0203', '0800.2b01.0203.0405'),
  (6, '2001:4f8:3:ba:2e0:81ff:fe22:d1f1', '2001:4f8:3:ba:2e0:81ff:fe22:d1f1/128', '08002b010203', '0800-2b01-0203-0405'),
  (7, '::ffff:1.2.3.0/120', '::ffff:1.2.3.0/120', '0800-2b01-0203', '08002b01:02030405'),
  (8, '::ffff:1.2.3.0/128', '::ffff:1.2.3.0/128', 'AABBCCDDEEFF', '08002b0102030405');

alter sequence pg11.network_id_seq restart with 9;

insert into pg11.types values
  (
    11,
    null,
    null,
    null,
    null
  ),
  (
    12,
    'postgraphile_test_authenticator',
    'b',
    ARRAY[1, 2, 2098288669218571760],
    (1, '2', 'blue', '4be8a712-3ff7-432e-aa34-fdb43fbd838d', 'FOO_BAR', '', interval '6 hours', 8)
  );

alter sequence pg11.types_id_seq restart with 15;

alter table pg11.always_as_identity alter column id restart with 1;
alter table pg11.by_default_as_identity alter column id restart with 1;
