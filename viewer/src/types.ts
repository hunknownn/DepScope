export type Relation =
  | "EXTENDS" | "IMPLEMENTS" | "HAS_FIELD" | "PARAM"
  | "RETURNS" | "CALLS" | "NEW" | "ANNOTATED_BY"
  | "ONE_TO_MANY" | "MANY_TO_ONE" | "ONE_TO_ONE" | "MANY_TO_MANY"
  | "USES_ENTITY";

export interface MethodInfo {
  name: string;
  descriptor: string;
  returnType: string;
  paramTypes: string[];
  modifiers: string[];
  usedTypes: string[];
  calls?: CallSite[];
  startLine?: number;
}

export interface CallSite {
  order: number;
  ownerFqn: string;
  name: string;
  descriptor: string;
  kind: string;
  line: number;
}

export interface CallFlowNode {
  classFqn: string;
  className: string;
  method: string;
  descriptor: string;
  kind: string;
  order: number;
  line: number;
  recursive: boolean;
  external: boolean;
  truncated: boolean;
  calls: CallFlowNode[];
}

export interface SourceSnippet {
  path: string | null;
  fromLine: number;
  toLine: number;
  callLine: number;
  lines: string[];
}

export interface FieldInfo {
  name: string;
  type: string;
  modifiers: string[];
}

export interface ColumnInfo {
  fieldName: string;
  columnName?: string | null;
  javaType: string;
  primaryKey: boolean;
  nullable: boolean;
  unique: boolean;
  length?: number | null;
  generatedValue?: string | null;
}

export interface EntityInfo {
  kind: "entity" | "mappedSuperclass" | "embeddable";
  tableName?: string | null;
  columns: ColumnInfo[];
}

export interface GraphNode {
  id: string;
  name: string;
  pkg: string;
  kind: string;
  stereotypes: string[];
  methods?: MethodInfo[];
  fields?: FieldInfo[];
  entity?: EntityInfo | null;
}

export interface GraphLink {
  source: string;
  target: string;
  relation: Relation;
  weight: number;
  label?: string | null;
}

export interface GraphData {
  seed: string;
  depth: number;
  nodes: GraphNode[];
  links: GraphLink[];
}
