import { SchemaBuilder, Build, Plugin, Options } from "graphile-build";
import { PgEntityKind, PgEntity } from "graphile-build-pg";
import { inspect } from "util";
import { entityIsIdentifiedBy } from "./introspectionHelpers";

export type SmartTagFilterFunction<T> = (input: T) => boolean;

export type SmartTagTags = {
  [tagName: string]: null | true | string | string[];
};

export interface SmartTagRule<T extends PgEntity = PgEntity> {
  kind: PgEntityKind;
  match: string | SmartTagFilterFunction<T>;
  tags?: SmartTagTags;
  description?: string;
}

interface CompiledSmartTagRule<T extends PgEntity> {
  kind: T["kind"];
  match: SmartTagFilterFunction<T>;
  tags?: SmartTagTags;
  description?: string;
}

type SmartTagSupportedKinds =
  | PgEntityKind.CLASS
  | PgEntityKind.ATTRIBUTE
  | PgEntityKind.CONSTRAINT
  | PgEntityKind.PROCEDURE;

const meaningByKind: {
  [kind in SmartTagSupportedKinds]: string;
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
  rule: SmartTagRule<T>
): CompiledSmartTagRule<T> {
  const { kind, match: incomingMatch, ...rest } = rule;
  if (!Object.prototype.hasOwnProperty.call(meaningByKind, kind)) {
    throw new Error(
      `makeSmartTagsPlugin rule has invalid kind '${kind}'; valid kinds are: ${validKinds}`
    );
  }

  const match: SmartTagFilterFunction<T> = obj => {
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
        "makeSmartTagsPlugin rule 'match' is neither a string nor a function"
      );
    }
  };
  return {
    kind,
    match,
    ...rest,
  };
}

function rulesFrom(
  ruleOrRules: SmartTagRule | SmartTagRule[]
): [CompiledSmartTagRule<PgEntity>[], SmartTagRule[]] {
  const rawRules = Array.isArray(ruleOrRules) ? ruleOrRules : [ruleOrRules];
  return [rawRules.map(compileRule), rawRules];
}

type UpdateRulesCallback = (ruleOrRules: SmartTagRule | SmartTagRule[]) => void;

type SubscribeToUpdatesCallback = (
  cb: UpdateRulesCallback | null
) => void | Promise<void>;

export default function makeSmartTagsPlugin(
  ruleOrRules: SmartTagRule | SmartTagRule[],
  subscribeToUpdatesCallback?: SubscribeToUpdatesCallback | null
): Plugin {
  let [rules, rawRules] = rulesFrom(ruleOrRules);
  return (builder: SchemaBuilder, _options: Options) => {
    if (subscribeToUpdatesCallback) {
      builder.registerWatcher(
        async triggerRebuild => {
          await subscribeToUpdatesCallback(newRuleOrRules => {
            [rules, rawRules] = rulesFrom(newRuleOrRules);
            triggerRebuild();
          });
        },
        async () => {
          await subscribeToUpdatesCallback(null);
        }
      );
    }

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
            `WARNING: there were no matches for makeSmartTagsPlugin rule ${idx} - ${inspect(
              rawRules[idx]
            )}`
          );
        }
      });
      return build;
    });
  };
}

export type SmartTagsJSON = {
  [kind in SmartTagSupportedKinds]: {
    [identifier: string]: {
      tags?: SmartTagTags;
      description?: string;
      columns?: {
        [columnName: string]: {
          tags?: SmartTagTags;
          description?: string;
        };
      };
    };
  };
};

function smartTagRulesFromJSON(
  specByIdentifierByKind: SmartTagsJSON
): SmartTagRule[] {
  const rules: SmartTagRule[] = [];
  for (const rawKind of Object.keys(specByIdentifierByKind)) {
    const kind = PgEntityKind[rawKind];
    if (!kind) {
      throw new Error(
        `makeSmartTagsPlugin JSON rule has invalid kind '${kind}'; valid kinds are: ${validKinds}`
      );
    }
    const specByIdentifier = specByIdentifierByKind[kind];
    for (const identifier of Object.keys(specByIdentifier)) {
      const spec = specByIdentifier[identifier];
      const { tags, description, columns, ...rest } = spec;
      if (Object.keys(rest).length > 0) {
        console.warn(
          `WARNING: makeSmartTagsPluginFromJSON only supports tags, description and columns currently, you have also set '${rest.join(
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
            `makeSmartTagsPluginFromJSON: 'columns' is only valid on a class; you tried to set it on a '${kind}'`
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
              `WARNING: makeSmartTagsPluginFromJSON columns only supports tags and description currently, you have also set '${columnRest.join(
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
  return rules;
}

type UpdateJSONCallback = (json: SmartTagsJSON) => void;

type SubscribeToJSONUpdatesCallback = (
  cb: UpdateJSONCallback | null
) => void | Promise<void>;

export function makeSmartTagsPluginFromJSON(
  json: SmartTagsJSON,
  subscribeToJSONUpdatesCallback?: SubscribeToJSONUpdatesCallback | null
) {
  // Get rules from JSON
  let rules = smartTagRulesFromJSON(json);

  // Wrap listener callback with JSON conversion
  const subscribeToUpdatesCallback: SubscribeToUpdatesCallback | null = subscribeToJSONUpdatesCallback
    ? cb => {
        if (!cb) {
          return subscribeToJSONUpdatesCallback(cb);
        } else {
          return subscribeToJSONUpdatesCallback(json => {
            rules = smartTagRulesFromJSON(json);
            return cb(rules);
          });
        }
      }
    : null;

  return makeSmartTagsPlugin(rules, subscribeToUpdatesCallback);
}
