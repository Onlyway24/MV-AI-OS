import { InMemoryRepositoryTransactionRunner } from "../support/in-memory-repositories.js";
import { runRepositoryConformance } from "./repository-conformance.js";

runRepositoryConformance(
  "In-memory",
  () => new InMemoryRepositoryTransactionRunner(),
);
