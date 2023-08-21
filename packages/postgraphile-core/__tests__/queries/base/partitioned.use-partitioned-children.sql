with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'id'::text,
        (__local_1__."id"),
        'description'::text,
        (__local_1__."description")
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."item_0" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."id" ASC
  ) __local_1__
),
__local_2__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_2__.data
    from __local_2__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'id'::text,
        (__local_1__."id"),
        'description'::text,
        (__local_1__."description")
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."item_1" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."id" ASC
  ) __local_1__
),
__local_2__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_2__.data
    from __local_2__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'id'::text,
        (__local_1__."id"),
        'description'::text,
        (__local_1__."description")
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."item_2" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."id" ASC
  ) __local_1__
),
__local_2__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_2__.data
    from __local_2__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'amount'::text,
        (__local_1__."amount"),
        'itemId'::text,
        (__local_1__."item_id"),
        '@warehouseByWarehouseId'::text,
        (
          select json_build_object(
            'id'::text,
            (__local_2__."id"),
            'location'::text,
            (__local_2__."location")
          ) as object
          from "partitioned"."warehouse" as __local_2__
          where (__local_1__."warehouse_id" = __local_2__."id") and (TRUE) and (TRUE)
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."stock_0" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."item_id" ASC,
    __local_1__."warehouse_id" ASC
  ) __local_1__
),
__local_3__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_3__.data
    from __local_3__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'amount'::text,
        (__local_1__."amount"),
        'itemId'::text,
        (__local_1__."item_id"),
        '@warehouseByWarehouseId'::text,
        (
          select json_build_object(
            'id'::text,
            (__local_2__."id"),
            'location'::text,
            (__local_2__."location")
          ) as object
          from "partitioned"."warehouse" as __local_2__
          where (__local_1__."warehouse_id" = __local_2__."id") and (TRUE) and (TRUE)
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."stock_1" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."item_id" ASC,
    __local_1__."warehouse_id" ASC
  ) __local_1__
),
__local_3__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_3__.data
    from __local_3__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'amount'::text,
        (__local_1__."amount"),
        'itemId'::text,
        (__local_1__."item_id"),
        '@warehouseByWarehouseId'::text,
        (
          select json_build_object(
            'id'::text,
            (__local_2__."id"),
            'location'::text,
            (__local_2__."location")
          ) as object
          from "partitioned"."warehouse" as __local_2__
          where (__local_1__."warehouse_id" = __local_2__."id") and (TRUE) and (TRUE)
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."stock_2" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."item_id" ASC,
    __local_1__."warehouse_id" ASC
  ) __local_1__
),
__local_3__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_3__.data
    from __local_3__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'amount'::text,
        (__local_1__."amount"),
        'itemId'::text,
        (__local_1__."item_id"),
        '@warehouseByWarehouseId'::text,
        (
          select json_build_object(
            'id'::text,
            (__local_2__."id"),
            'location'::text,
            (__local_2__."location")
          ) as object
          from "partitioned"."warehouse" as __local_2__
          where (__local_1__."warehouse_id" = __local_2__."id") and (TRUE) and (TRUE)
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."stock_3" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."item_id" ASC,
    __local_1__."warehouse_id" ASC
  ) __local_1__
),
__local_3__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_3__.data
    from __local_3__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'amount'::text,
        (__local_1__."amount"),
        'itemId'::text,
        (__local_1__."item_id"),
        '@warehouseByWarehouseId'::text,
        (
          select json_build_object(
            'id'::text,
            (__local_2__."id"),
            'location'::text,
            (__local_2__."location")
          ) as object
          from "partitioned"."warehouse" as __local_2__
          where (__local_1__."warehouse_id" = __local_2__."id") and (TRUE) and (TRUE)
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."stock_4" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."item_id" ASC,
    __local_1__."warehouse_id" ASC
  ) __local_1__
),
__local_3__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_3__.data
    from __local_3__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'id'::text,
        (__local_1__."id"),
        'location'::text,
        (__local_1__."location")
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."warehouse" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."id" ASC
  ) __local_1__
),
__local_2__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_2__.data
    from __local_2__
  ),
  '[]'::json
) as "data"