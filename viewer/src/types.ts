export type Relation =
  | "EXTENDS" | "IMPLEMENTS" | "HAS_FIELD" | "PARAM"
  | "RETURNS" | "CALLS" | "NEW" | "ANNOTATED_BY";

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

export interface GraphNode {
  id: string;
  name: string;
  pkg: string;
  kind: string;
  stereotypes: string[];
  methods?: MethodInfo[];
  fields?: FieldInfo[];
}

export interface GraphLink {
  source: string;
  target: string;
  relation: Relation;
  weight: number;
}

export interface GraphData {
  seed: string;
  depth: number;
  nodes: GraphNode[];
  links: GraphLink[];
}
