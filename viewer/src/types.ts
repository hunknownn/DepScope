export type Relation =
  | "EXTENDS" | "IMPLEMENTS" | "HAS_FIELD" | "PARAM"
  | "RETURNS" | "CALLS" | "NEW" | "ANNOTATED_BY";

export interface GraphNode {
  id: string;
  name: string;
  pkg: string;
  kind: string;
  stereotypes: string[];
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
