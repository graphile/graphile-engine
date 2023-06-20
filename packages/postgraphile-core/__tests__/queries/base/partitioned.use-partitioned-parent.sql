with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'id'::text,
        (__local_1__."id"),
        'description'::text,
        (__local_1__."description"),
        '@stocksByItemId'::text,
        (
          with __local_2__ as (
            select to_json(
              (
                json_build_object(
                  'amount'::text,
                  (__local_3__."amount"),
                  '@warehouseByWarehouseId'::text,
                  (
                    select json_build_object(
                      'id'::text,
                      (__local_4__."id"),
                      'location'::text,
                      (__local_4__."location")
                    ) as object
                    from "partitioned"."warehouse" as __local_4__
                    where (__local_3__."warehouse_id" = __local_4__."id") and (TRUE) and (TRUE)
                  )
                )
              )
            ) as "@nodes"
            from (
              select __local_3__.*
              from "partitioned"."stock" as __local_3__
              where (__local_3__."item_id" = __local_1__."id") and (TRUE) and (TRUE)
              order by __local_3__."item_id" ASC,
              __local_3__."warehouse_id" ASC
            ) __local_3__
          ),
          __local_5__ as (
            select json_agg(
              to_json(__local_2__)
            ) as data
            from __local_2__
          )
          select json_build_object(
            'data'::text,
            coalesce(
              (
                select __local_5__.data
                from __local_5__
              ),
              '[]'::json
            )
          )
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."item" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."id" ASC
  ) __local_1__
),
__local_6__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_6__.data
    from __local_6__
  ),
  '[]'::json
) as "data"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'amount'::text,
        (__local_1__."amount"),
        '@itemByItemId'::text,
        (
          select json_build_object(
            'id'::text,
            (__local_2__."id"),
            'description'::text,
            (__local_2__."description")
          ) as object
          from "partitioned"."item" as __local_2__
          where (__local_1__."item_id" = __local_2__."id") and (TRUE) and (TRUE)
        ),
        '@warehouseByWarehouseId'::text,
        (
          select json_build_object(
            'id'::text,
            (__local_3__."id"),
            'location'::text,
            (__local_3__."location")
          ) as object
          from "partitioned"."warehouse" as __local_3__
          where (__local_1__."warehouse_id" = __local_3__."id") and (TRUE) and (TRUE)
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "partitioned"."stock" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."item_id" ASC,
    __local_1__."warehouse_id" ASC
  ) __local_1__
),
__local_4__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_4__.data
    from __local_4__
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
        (__local_1__."location"),
        '@stocksByWarehouseId'::text,
        (
          with __local_2__ as (
            select to_json(
              (
                json_build_object(
                  'amount'::text,
                  (__local_3__."amount"),
                  '@itemByItemId'::text,
                  (
                    select json_build_object(
                      'id'::text,
                      (__local_4__."id"),
                      'description'::text,
                      (__local_4__."description")
                    ) as object
                    from "partitioned"."item" as __local_4__
                    where (__local_3__."item_id" = __local_4__."id") and (TRUE) and (TRUE)
                  )
                )
              )
            ) as "@nodes"
            from (
              select __local_3__.*
              from "partitioned"."stock" as __local_3__
              where (__local_3__."warehouse_id" = __local_1__."id") and (TRUE) and (TRUE)
              order by __local_3__."item_id" ASC,
              __local_3__."warehouse_id" ASC
            ) __local_3__
          ),
          __local_5__ as (
            select json_agg(
              to_json(__local_2__)
            ) as data
            from __local_2__
          )
          select json_build_object(
            'data'::text,
            coalesce(
              (
                select __local_5__.data
                from __local_5__
              ),
              '[]'::json
            )
          )
        )
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
__local_6__ as (
  select json_agg(
    to_json(__local_0__)
  ) as data
  from __local_0__
)
select coalesce(
  (
    select __local_6__.data
    from __local_6__
  ),
  '[]'::json
) as "data"