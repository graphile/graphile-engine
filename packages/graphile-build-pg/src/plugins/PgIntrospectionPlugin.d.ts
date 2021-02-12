import { SchemaBuilder, Options } from "graphile-build";
export enum PgEntityKind {
  NAMESPACE = "namespace",
  PROCEDURE = "procedure",
  CLASS = "class",
  TYPE = "type",
  ATTRIBUTE = "attribute",
  CONSTRAINT = "constraint",
  EXTENSION = "extension",
  INDEX = "index",
}

export interface PgNamespace {
  kind: PgEntityKind.NAMESPACE;
  id: string;
  name: string;
  comment: string | undefined;
  description: string | undefined;
  tags: { [tag: string]: true | string | Array<string> };
}

export interface PgProc {
  kind: PgEntityKind.PROCEDURE;
  id: string;
  name: string;
  comment: string | undefined;
  description: string | undefined;
  namespaceId: string;
  namespaceName: string;
  isStrict: boolean;
  returnsSet: boolean;
  isStable: boolean;
  returnTypeId: string;
  argTypeIds: Array<string>;
  argNames: Array<string>;
  argModes: Array<"i" | "o" | "b" | "v" | "t">;
  inputArgsCount: number;
  argDefaultsNum: number;
  namespace: PgNamespace;
  tags: { [tag: string]: true | string | Array<string> };
  cost: number;
  aclExecutable: boolean;
  language: string;
}

export interface PgClass {
  kind: PgEntityKind.CLASS;
  id: string;
  name: string;
  comment: string | undefined;
  description: string | undefined;
  classKind: string;
  namespaceId: string;
  namespaceName: string;
  typeId: string;
  isSelectable: boolean;
  isInsertable: boolean;
  isUpdatable: boolean;
  isDeletable: boolean;
  isExtensionConfigurationTable: boolean;
  namespace: PgNamespace;
  type: PgType;
  tags: { [tag: string]: boolean | string | Array<string> };
  attributes: Array<PgAttribute>;
  constraints: Array<PgConstraint>;
  foreignConstraints: Array<PgConstraint>;
  primaryKeyConstraint: PgConstraint | undefined;
  aclSelectable: boolean;
  aclInsertable: boolean;
  aclUpdatable: boolean;
  aclDeletable: boolean;
  canUseAsterisk: boolean;
}

export interface PgType {
  kind: PgEntityKind.TYPE;
  id: string;
  name: string;
  comment: string | undefined;
  description: string | undefined;
  namespaceId: string;
  namespaceName: string;
  type: string;
  category: string;
  domainIsNotNull: boolean;
  arrayItemTypeId: string | undefined;
  arrayItemType: PgType | undefined;
  arrayType: PgType | undefined;
  typeLength: number | undefined;
  isPgArray: boolean;
  classId: string | undefined;
  class: PgClass | undefined;
  domainBaseTypeId: string | undefined;
  domainBaseType: PgType | undefined;
  domainTypeModifier: number | undefined;
  domainHasDefault: boolean;
  enumVariants: string[] | undefined;
  enumDescriptions: string[] | undefined;
  rangeSubTypeId: string | undefined;
  tags: { [tag: string]: true | string | Array<string> };
  isFake?: boolean;
}

export interface PgAttribute {
  kind: PgEntityKind.ATTRIBUTE;
  classId: string;
  num: number;
  name: string;
  comment: string | undefined;
  description: string | undefined;
  typeId: string;
  typeModifier: number;
  isNotNull: boolean;
  hasDefault: boolean;
  identity: "" | "a" | "d";
  class: PgClass;
  type: PgType;
  namespace: PgNamespace;
  tags: { [tag: string]: true | string | Array<string> };
  aclSelectable: boolean;
  aclInsertable: boolean;
  aclUpdatable: boolean;
  isIndexed: boolean | undefined;
  isUnique: boolean | undefined;
  columnLevelSelectGrant: boolean;
}

export interface PgConstraint {
  kind: PgEntityKind.CONSTRAINT;
  id: string;
  name: string;
  type: string;
  classId: string;
  class: PgClass;
  foreignClassId: string | undefined;
  foreignClass: PgClass | undefined;
  comment: string | undefined;
  description: string | undefined;
  keyAttributeNums: Array<number>;
  keyAttributes: Array<PgAttribute>;
  foreignKeyAttributeNums: Array<number>;
  foreignKeyAttributes: Array<PgAttribute>;
  namespace: PgNamespace;
  isIndexed: boolean | undefined;
  tags: { [tag: string]: true | string | Array<string> };
}

export interface PgExtension {
  kind: PgEntityKind.EXTENSION;
  id: string;
  name: string;
  namespaceId: string;
  namespaceName: string;
  relocatable: boolean;
  version: string;
  configurationClassIds?: Array<string>;
  comment: string | undefined;
  description: string | undefined;
  tags: { [tag: string]: true | string | Array<string> };
}

export interface PgIndex {
  kind: PgEntityKind.INDEX;
  id: string;
  name: string;
  namespaceName: string;
  classId: string;
  numberOfAttributes: number;
  indexType: string;
  isUnique: boolean;
  isPrimary: boolean;
  isPartial: boolean;
  attributeNums: Array<number>;
  attributePropertiesAsc: Array<boolean> | undefined;
  attributePropertiesNullsFirst: Array<boolean> | undefined;
  description: string | undefined;
  tags: { [tag: string]: true | string | Array<string> };
}

export type PgIntrospectionResultsByKind = {
  __pgVersion: number;
  attribute: PgAttribute[];
  attributeByClassIdAndNum: {
    [classId: string]: { [num: string]: PgAttribute };
  };
  class: PgClass[];
  classById: { [classId: string]: PgClass };
  constraint: PgConstraint[];
  extension: PgExtension[];
  extensionById: { [extId: string]: PgExtension };
  index: PgIndex[];
  namespace: PgNamespace[];
  namespaceById: { [namespaceId: string]: PgNamespace };
  procedure: PgProc[];
  type: PgType[];
  typeById: { [typeId: string]: PgType };
};

export type PgEntity =
  | PgNamespace
  | PgProc
  | PgClass
  | PgType
  | PgAttribute
  | PgConstraint
  | PgExtension
  | PgIndex;

export default function PgIntrospectionPlugin(
  builder: SchemaBuilder,
  options: Options
): Promise<void> | void;
