export type Relation =
  | "EXTENDS" | "IMPLEMENTS" | "HAS_FIELD" | "PARAM"
  | "RETURNS" | "CALLS" | "NEW" | "ANNOTATED_BY";

export interface MethodInfo {
  name: string;
  returnType: string;
  paramTypes: string[];
  modifiers: string[];
  usedTypes: string[];
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
