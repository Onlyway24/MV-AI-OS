import type { AgentManifest } from "./agent-manifest.js";
import { RegistryError } from "../errors/core-error.js";
import type { Validator } from "../validation/validation.js";

export interface AgentRegistry {
  get(agentId: string, version: string): AgentManifest | undefined;
  list(): readonly AgentManifest[];
  findActiveByTaskType(taskType: string): readonly AgentManifest[];
}

export class ImmutableAgentRegistry implements AgentRegistry {
  readonly #manifests: ReadonlyMap<string, AgentManifest>;
  readonly #orderedManifests: readonly AgentManifest[];

  public constructor(
    manifests: readonly unknown[],
    validator: Validator<AgentManifest>,
  ) {
    const manifestMap = new Map<string, AgentManifest>();
    const orderedManifests: AgentManifest[] = [];

    for (const candidate of manifests) {
      const validation = validator.validate(candidate);
      if (!validation.ok) {
        throw new RegistryError(
          "agent_manifest_invalid",
          "An agent manifest failed validation",
          {
            issues: validation.issues.map(({ code, message, path }) => ({
              code,
              message,
              path,
            })),
          },
        );
      }

      const manifest = freezeManifest(validation.value);
      const key = manifestKey(manifest.agentId, manifest.version);
      if (manifestMap.has(key)) {
        throw new RegistryError(
          "duplicate_agent_manifest",
          `Agent manifest ${key} is registered more than once`,
          {
            agentId: manifest.agentId,
            version: manifest.version,
          },
        );
      }

      manifestMap.set(key, manifest);
      orderedManifests.push(manifest);
    }

    this.#manifests = manifestMap;
    this.#orderedManifests = Object.freeze(orderedManifests);
  }

  public get(agentId: string, version: string): AgentManifest | undefined {
    return this.#manifests.get(manifestKey(agentId, version));
  }

  public list(): readonly AgentManifest[] {
    return this.#orderedManifests;
  }

  public findActiveByTaskType(taskType: string): readonly AgentManifest[] {
    return Object.freeze(
      this.#orderedManifests.filter(
        (manifest) =>
          manifest.status === "active" && manifest.taskTypes.includes(taskType),
      ),
    );
  }
}

function manifestKey(agentId: string, version: string): string {
  return `${agentId}@${version}`;
}

function freezeManifest(manifest: AgentManifest): AgentManifest {
  return Object.freeze({
    ...manifest,
    handoffTargets: Object.freeze([...manifest.handoffTargets]),
    inputContract: Object.freeze({ ...manifest.inputContract }),
    knowledgeAccess: Object.freeze([...manifest.knowledgeAccess]),
    limits: Object.freeze({ ...manifest.limits }),
    memoryAccess: Object.freeze({
      ...manifest.memoryAccess,
      read: Object.freeze([...manifest.memoryAccess.read]),
    }),
    outputContract: Object.freeze({ ...manifest.outputContract }),
    taskTypes: Object.freeze([...manifest.taskTypes]),
    tools: Object.freeze([...manifest.tools]),
    workflowProposals: Object.freeze([...manifest.workflowProposals]),
  });
}
