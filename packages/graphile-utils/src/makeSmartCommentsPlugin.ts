import { SchemaBuilder, Build, Plugin, Options } from "graphile-build";
import { PgEntityKind, PgEntity } from "graphile-build-pg";
import { inspect } from "util";
import { entityIsIdentifiedBy } from "./introspectionHelpers";

export type SmartCommentFilterFunction<T> = (input: T) => boolean;

export type SmartCommentTags = {
  [tagName: string]: null | true | string | string[];
};

export interface SmartCommentRule<T extends PgEntity = PgEntity> {
  kind: PgEntityKind;
  match: string | SmartCommentFilterFunction<T>;
  tags?: SmartCommentTags;
  description?: string;
}

interface CompiledSmartCommentRule<T extends PgEntity> {
  kind: T["kind"];
  match: SmartCommentFilterFunction<T>;
  tags?: SmartCommentTags;
  description?: string;
}

type SmartCommentSupportedKinds =
  | PgEntityKind.CLASS
  | PgEntityKind.ATTRIBUTE
  | PgEntityKind.CONSTRAINT
  | PgEntityKind.PROCEDURE;

const meaningByKind: {
  [kind in SmartCommentSupportedKinds]: string;
} = {
  [PgEntityKind.CLASS]:
    "for tables, composite types, views and materialized views",
  [PgEntityKind.ATTRIBUTE]: "for columns/attributes (of any 'class' type)",
  [PgEntityKind.CONSTRAINT]: "for table constraints",
  [PgEntityKind.PROCEDURE]: "for functions/procedures",
};

const validKinds = Object.entries(meaningByKind)
  .map(([kind, meaning]) => `'${kind}' (${meaning})`)
  .join(", ");

function compileRule<T extends PgEntity>(
  rule: SmartCommentRule<T>
): CompiledSmartCommentRule<T> {
  const { kind, match: incomingMatch, ...rest } = rule;
  if (!Object.prototype.hasOwnProperty.call(meaningByKind, kind)) {
    throw new Error(
      `makeSmartCommentsPlugin rule has invalid kind '${kind}'; valid kinds are: ${validKinds}`
    );
  }

  const match: SmartCommentFilterFunction<T> = obj => {
    if (obj.kind !== kind) {
      return false;
    }

    if (typeof incomingMatch === "function") {
      // User supplied a match function; delegate to that:
      return incomingMatch(obj);
    } else if (typeof incomingMatch === "string") {
      // It's a fully-qualified case-sensitive name of the thing.
      return entityIsIdentifiedBy(obj, incomingMatch);
    } else {
      throw new Error(
        "makeSmartCommentsPlugin rule 'match' is neither a string nor a function"
      );
    }
  };
  return {
    kind,
    match,
    ...rest,
  };
}

export default function makeSmartCommentsPlugin(
  ruleOrRules: SmartCommentRule | SmartCommentRule[]
): Plugin {
  const rawRules = Array.isArray(ruleOrRules) ? ruleOrRules : [ruleOrRules];
  const rules = rawRules.map(compileRule);
  return (builder: SchemaBuilder, _options: Options) => {
    builder.hook("build", (build: Build) => {
      const { pgIntrospectionResultsByKind } = build;
      rules.forEach((rule, idx) => {
        const relevantIntrospectionResults: PgEntity[] =
          pgIntrospectionResultsByKind[rule.kind];

        let hits = 0;
        relevantIntrospectionResults.forEach(entity => {
          if (!rule.match(entity)) {
            return;
          }
          hits++;
          if (rule.tags) {
            // Overwrite relevant tags
            Object.assign(entity.tags, rule.tags);
          }
          if (rule.description != null) {
            // Overwrite comment if specified
            entity.description = rule.description;
          }
        });

        // Let people know if their rules don't match; it's probably a mistake.
        if (hits === 0) {
          console.warn(
            `WARNING: there were no matches for makeSmartCommentsPlugin rule ${idx} - ${inspect(
              rawRules[idx]
            )}`
          );
        }
      });
      return build;
    });
  };
}

export type SmartCommentsJSON = {
  [kind in SmartCommentSupportedKinds]: {
    [identifier: string]: {
      tags?: SmartCommentTags;
      description?: string;
      columns?: {
        [columnName: string]: {
          tags?: SmartCommentTags;
          description?: string;
        };
      };
    };
  };
};

export function makeSmartCommentsPluginFromJSON(
  specByIdentifierByKind: SmartCommentsJSON
) {
  const rules: SmartCommentRule[] = [];
  for (const rawKind of Object.keys(specByIdentifierByKind)) {
    const kind = PgEntityKind[rawKind];
    if (!kind) {
      throw new Error(
        `makeSmartCommentsPlugin JSON rule has invalid kind '${kind}'; valid kinds are: ${validKinds}`
      );
    }
    const specByIdentifier = specByIdentifierByKind[kind];
    for (const identifier of Object.keys(specByIdentifier)) {
      const spec = specByIdentifier[identifier];
      const { tags, description, columns, ...rest } = spec;
      if (Object.keys(rest).length > 0) {
        console.warn(
          `WARNING: makeSmartCommentsPluginFromJSON only supports tags, description and columns currently, you have also set '${rest.join(
            "', '"
          )}'`
        );
      }
      rules.push({
        kind,
        match: identifier,
        tags,
        description,
      });
      if (columns) {
        if (kind !== PgEntityKind.CLASS) {
          throw new Error(
            `makeSmartCommentsPluginFromJSON: 'columns' is only valid on a class; you tried to set it on a '${kind}'`
          );
        }
        for (const columnName of Object.keys(columns)) {
          const columnSpec = columns[columnName];
          const {
            tags: columnTags,
            description: columnDescription,
            ...columnRest
          } = columnSpec;
          if (Object.keys(columnRest).length > 0) {
            console.warn(
              `WARNING: makeSmartCommentsPluginFromJSON columns only supports tags and description currently, you have also set '${columnRest.join(
                "', '"
              )}'`
            );
          }
          rules.push({
            kind: PgEntityKind.ATTRIBUTE,
            match: `${identifier}.${columnName}`,
            tags: columnTags,
            description: columnDescription,
          });
        }
      }
    }
  }
  return makeSmartCommentsPlugin(rules);
}
