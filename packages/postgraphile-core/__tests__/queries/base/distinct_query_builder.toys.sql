with __local_0__ as (
  select to_json(
    (
      json_build_object(
        '__identifiers'::text,
        json_build_array(__local_1__."id"),
        'id'::text,
        (__local_1__."id"),
        'name'::text,
        (__local_1__."name"),
        'color'::text,
        (__local_1__."color")
      )
    )
  ) as "@nodes"
  from (
    select distinct on (__local_1__."color") __local_1__.*
    from "distinct_query_builder"."toys" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."color" ASC,
    __local_1__."id" ASC
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
        '__identifiers'::text,
        json_build_array(__local_1__."id"),
        'id'::text,
        (__local_1__."id"),
        'name'::text,
        (__local_1__."name"),
        'color'::text,
        (__local_1__."color")
      )
    )
  ) as "@nodes"
  from (
    select distinct on (
      __local_1__."id",
      __local_1__."name"
    ) __local_1__.*
    from "distinct_query_builder"."toys" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."id" ASC,
    __local_1__."name" ASC,
    __local_1__."id" ASC
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
        '__identifiers'::text,
        json_build_array(__local_1__."id"),
        'id'::text,
        (__local_1__."id"),
        'name'::text,
        (__local_1__."name"),
        'color'::text,
        (__local_1__."color")
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "distinct_query_builder"."toys" as __local_1__
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
        '__identifiers'::text,
        json_build_array(__local_1__."id"),
        'id'::text,
        (__local_1__."id"),
        'name'::text,
        (__local_1__."name"),
        'color'::text,
        (__local_1__."color")
      )
    )
  ) as "@nodes"
  from (
    select distinct on (__local_1__."color") __local_1__.*
    from "distinct_query_builder"."toys" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."color" ASC,
    __local_1__."id" ASC
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
) as "data",
(
  select json_build_object(
    'totalCount'::text,
    count(1)
  )
  from "distinct_query_builder"."toys" as __local_1__
  where 1 = 1
) as "aggregates"