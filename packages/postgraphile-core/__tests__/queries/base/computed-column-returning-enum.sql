with __local_0__ as (
  select to_json(
    (
      json_build_object(
        'id'::text,
        (__local_1__."id"),
        'firstName'::text,
        (__local_1__."first_name"),
        'lastName'::text,
        (__local_1__."last_name"),
        'stage'::text,
        (__local_1__."stage"),
        '@nextStage'::text,
        (
          select to_json(__local_2__) as "value"
          from "computed_column_enum"."applicants_next_stage"(__local_1__) as __local_2__
          where (TRUE) and (TRUE)
        )
      )
    )
  ) as "@nodes"
  from (
    select __local_1__.*
    from "computed_column_enum"."applicants" as __local_1__
    where (
      "computed_column_enum"."applicants_name_length"(__local_1__) = $1
    )
    and (
      "computed_column_enum"."applicants_next_stage"(__local_1__) = $2
    ) and (TRUE) and (TRUE)
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