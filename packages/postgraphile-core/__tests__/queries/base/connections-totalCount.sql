select (
  select json_build_object(
    'totalCount'::text,
    count(1)
  )
  from "c"."person" as __local_0__
  where 1 = 1
) as "aggregates"

with __local_0__ as (
  select to_json(
    (
      json_build_object(
        '__identifiers'::text,
        json_build_array(__local_1__."id"),
        '@friends'::text,
        (
          select json_build_object(
            'aggregates'::text,
            (
              select json_build_object(
                'totalCount'::text,
                count(1)
              )
              from "c"."person_friends"(__local_1__) as __local_2__
              where 1 = 1
            )
          )
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "c"."person" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."id" ASC
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

select (
  select json_build_object(
    'totalCount'::text,
    count(1)
  )
  from "c"."table_set_query"( ) as __local_0__
  where 1 = 1
) as "aggregates"