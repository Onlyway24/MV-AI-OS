import type { LocalWorkflowCommandResponse } from "./local-workflow-command.js";

export interface LocalWorkflowCommandReceipt { readonly commandId: string; readonly fingerprint: string; readonly response: LocalWorkflowCommandResponse; }
export interface LocalWorkflowOwnership { readonly instanceId: string; readonly workspaceId: string; readonly actorId: string; }
export interface LocalWorkflowCommandRepository { getById(commandId: string): Promise<LocalWorkflowCommandReceipt | undefined>; insert(receipt: LocalWorkflowCommandReceipt): Promise<void>; getOwnership(instanceId: string): Promise<LocalWorkflowOwnership | undefined>; insertOwnership(ownership: LocalWorkflowOwnership): Promise<void>; }
