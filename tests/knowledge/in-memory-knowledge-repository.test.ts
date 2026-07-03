import { InMemoryKnowledgeRepository } from "../support/in-memory-knowledge-repository.js";
import { runKnowledgeRepositoryConformance } from "./repository-conformance.js";

runKnowledgeRepositoryConformance(
  "In-memory",
  () => new InMemoryKnowledgeRepository(),
);
