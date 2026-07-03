import { InMemoryMemoryRepository } from "../../src/memory/testing/in-memory-memory-repository.js";
import { runMemoryRepositoryConformance } from "./repository-conformance.js";

runMemoryRepositoryConformance(
  "In-memory",
  () => new InMemoryMemoryRepository(),
);
