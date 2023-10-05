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
    __local_1__."name" ASC
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
    order by __local_1__."color" DESC,
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
  ) as "@nodes",
  to_json(
    json_build_array(
      'name_asc',
      'color_desc',
      json_build_array(
        __local_1__."color",
        __local_1__."name",
        __local_1__."id"
      )
    )
  ) as "__cursor"
  from (
    select distinct on (__local_1__."color") __local_1__.*
    from "distinct_query_builder"."toys" as __local_1__
    where (TRUE) and (TRUE)
    order by __local_1__."color" DESC,
    __local_1__."name" ASC,
    __local_1__."id" ASC
    limit 1
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
  ) as "@nodes",
  to_json(
    json_build_array(
      'name_asc',
      'color_desc',
      json_build_array(
        __local_1__."color",
        __local_1__."name",
        __local_1__."id"
      )
    )
  ) as "__cursor"
  from (
    select distinct on (__local_1__."color") __local_1__.*
    from "distinct_query_builder"."toys" as __local_1__
    where (
      (
        (
          (
            (
              'name_asc',
              'color_desc'
            ) = (
              $1,
              $2
            )
          ) AND (
            (
              (
                __local_1__."color" < $3
              ) OR (
                __local_1__."color" = $3 AND (
                  (
                    __local_1__."name" > $4
                  ) OR (
                    __local_1__."name" = $4 AND (
                      (
                        __local_1__."id" > $5
                      ) OR (
                        __local_1__."id" = $5 AND false
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
    ) and (TRUE)
    order by __local_1__."color" DESC,
    __local_1__."name" ASC,
    __local_1__."id" ASC
    limit 1
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
  ) as "@nodes",
  to_json(
    json_build_array(
      'name_asc',
      'color_desc',
      json_build_array(
        __local_1__."color",
        __local_1__."name",
        __local_1__."id"
      )
    )
  ) as "__cursor"
  from (
    with __local_2__ as (
      select distinct on (__local_1__."color") __local_1__.*
      from "distinct_query_builder"."toys" as __local_1__
      where (TRUE)
      and (
        (
          (
            (
              (
                'name_asc',
                'color_desc'
              ) = (
                $1,
                $2
              )
            ) AND (
              (
                (
                  __local_1__."color" > $3
                ) OR (
                  __local_1__."color" = $3 AND (
                    (
                      __local_1__."name" < $4
                    ) OR (
                      __local_1__."name" = $4 AND (
                        (
                          __local_1__."id" < $5
                        ) OR (
                          __local_1__."id" = $5 AND false
                        )
                      )
                    )
                  )
                )
              )
            )
          )
        )
      )
      order by __local_1__."color" ASC,
      __local_1__."name" DESC,
      __local_1__."id" DESC
      limit 1
    )
    select *
    from __local_2__
    order by (
      row_number( ) over (partition by 1)
    ) desc
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
) as "data",
(
  select json_build_object(
    'totalCount'::text,
    count(1)
  )
  from "distinct_query_builder"."toys" as __local_1__
  where 1 = 1
) as "aggregates"