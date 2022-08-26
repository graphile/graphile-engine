select to_json(
  json_build_array(__local_0__."id")
) as "__identifiers",
to_json(
  (
    select coalesce(
      (
        select json_agg(__local_1__."object")
        from (
          select json_build_object(
            'name'::text,
            (__local_2__."name")
          ) as object
          from named_query_builder.categories as __local_2__
          where (
            __local_2__.id IN (
              select __local_3__."category_id"
              from "named_query_builder"."toy_categories" as __local_3__
              where (__local_3__.toy_id = __local_0__.id) and (TRUE) and (TRUE)
            )
          ) and (TRUE) and (TRUE)
        ) as __local_1__
      ),
      '[]'::json
    )
  )
) as "@categories"
from "named_query_builder"."toys" as __local_0__
where (
  __local_0__."id" = $1
) and (TRUE) and (TRUE)

select to_json(
  json_build_array(__local_0__."id")
) as "__identifiers",
to_json(
  (
    select coalesce(
      (
        select json_agg(__local_1__."object")
        from (
          select json_build_object(
            'name'::text,
            (__local_2__."name")
          ) as object
          from named_query_builder.categories as __local_2__
          where (
            __local_2__.id IN (
              select __local_3__."category_id"
              from "named_query_builder"."toy_categories" as __local_3__
              where (__local_3__.toy_id = __local_0__.id)
              and (
                __local_3__.approved = $1
              ) and (TRUE) and (TRUE)
            )
          ) and (TRUE) and (TRUE)
        ) as __local_1__
      ),
      '[]'::json
    )
  )
) as "@categories"
from "named_query_builder"."toys" as __local_0__
where (
  __local_0__."id" = $2
) and (TRUE) and (TRUE)

select to_json(
  json_build_array(__local_0__."id")
) as "__identifiers",
to_json(
  (
    select coalesce(
      (
        select json_agg(__local_1__."object")
        from (
          select json_build_object(
            'name'::text,
            (__local_2__."name")
          ) as object
          from named_query_builder.categories as __local_2__
          where (
            __local_2__.id IN (
              select __local_3__."category_id"
              from "named_query_builder"."toy_categories" as __local_3__
              where (__local_3__.toy_id = __local_0__.id)
              and (
                __local_3__.approved = $1
              ) and (TRUE) and (TRUE)
            )
          ) and (TRUE) and (TRUE)
        ) as __local_1__
      ),
      '[]'::json
    )
  )
) as "@categories"
from "named_query_builder"."toys" as __local_0__
where (
  __local_0__."id" = $2
) and (TRUE) and (TRUE)