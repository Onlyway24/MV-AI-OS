import type { Clock } from "../../ports/clock.js";
import type { WorkflowCommand, WorkflowInstance, WorkflowInstanceStatus, WorkflowStepInstanceStatus, WorkflowTransitionResult } from "./workflow-runtime.js";

const WF: Readonly<Record<WorkflowInstanceStatus, readonly WorkflowInstanceStatus[]>> = { ACTIVE:["PAUSED","COMPLETED","FAILED","CANCELLED"], PAUSED:["ACTIVE","CANCELLED"], COMPLETED:[], FAILED:[], CANCELLED:[] };
const STEP: Readonly<Record<WorkflowStepInstanceStatus, readonly WorkflowStepInstanceStatus[]>> = { PENDING:["READY","CANCELLED"], READY:["AWAITING_RESULT","CANCELLED"], AWAITING_RESULT:["SUCCEEDED","FAILED","CANCELLED"], SUCCEEDED:[], FAILED:[], CANCELLED:[] };
export class WorkflowStateError extends Error { public constructor(message:string, public readonly code:string) { super(message); this.name="WorkflowStateError"; } }
export class DeterministicWorkflowStateMachine {
  public constructor(private readonly clock: Clock) {}
  public apply(instance: WorkflowInstance, command: WorkflowCommand): WorkflowTransitionResult {
    const fingerprint=JSON.stringify({ expectedVersion:command.expectedVersion,kind:command.kind,reasonCode:command.reasonCode,stepId:command.stepId });
    const receipt=instance.receipts.find(({commandId})=>commandId===command.commandId);
    if(receipt!==undefined){ if(receipt.fingerprint!==fingerprint) throw new WorkflowStateError("command ID conflicts with prior command","command_conflict"); return freeze({instance,outcome:"REPLAYED",nonExecuting:true}); }
    if(command.expectedVersion!==instance.version) throw new WorkflowStateError("expected workflow version is stale","version_conflict");
    if(instance.status==="CANCELLED"||instance.status==="COMPLETED"||instance.status==="FAILED") throw new WorkflowStateError("terminal workflow cannot transition","terminal_workflow");
    let status: WorkflowInstanceStatus=instance.status; let steps=instance.steps.map((step)=>({...step}));
    if(command.kind==="PAUSE") status=transition(WF,status,"PAUSED","workflow");
    else if(command.kind==="RESUME") status=transition(WF,status,"ACTIVE","workflow");
    else if(command.kind==="CANCEL"){ status=transition(WF,status,"CANCELLED","workflow"); steps=steps.map((step)=>step.status==="SUCCEEDED"||step.status==="FAILED"?step:{...step,status:"CANCELLED",blockers:[]}); }
    else if(command.kind==="ACTIVATE"){ if(status!=="ACTIVE") throw new WorkflowStateError("workflow is not active","invalid_transition"); steps=steps.map((step)=>step.status==="PENDING"?{...step,status:"READY",blockers:[]}:step); }
    else { if(command.stepId===undefined) throw new WorkflowStateError("step command requires stepId","invalid_command"); const index=steps.findIndex((step)=>step.stepId===command.stepId); const step=steps[index]; if(step===undefined) throw new WorkflowStateError("unknown workflow step","unknown_step"); const target=command.kind==="COMPLETE_STEP"?"SUCCEEDED":"FAILED"; steps[index]={...step,status:transition(STEP,step.status,target,"step")}; if(target==="FAILED") status=transition(WF,status,"FAILED","workflow"); else if(steps.every((candidate)=>candidate.status==="SUCCEEDED")) status=transition(WF,status,"COMPLETED","workflow"); }
    const stopReason: WorkflowInstance["stopReason"]=status==="CANCELLED"?"CANCELLED_BY_OPERATOR":status==="FAILED"?"FAILED_STEP":"NONE"; const updated=freeze({...instance,status,steps,stopReason,version:instance.version+1,updatedAt:this.clock.now().toISOString(),receipts:[...instance.receipts,{commandId:command.commandId,fingerprint,resultingVersion:instance.version+1}]});
    return freeze({instance:updated,outcome:"APPLIED",nonExecuting:true});
  }
}
export function isWorkflowTransitionAllowed(from:WorkflowInstanceStatus,to:WorkflowInstanceStatus):boolean{return WF[from].includes(to);}
export function isWorkflowStepTransitionAllowed(from:WorkflowStepInstanceStatus,to:WorkflowStepInstanceStatus):boolean{return STEP[from].includes(to);}
function transition<T extends string>(table:Readonly<Record<string,readonly string[]>>,from:T,to:T,kind:string):T{if(!table[from]?.includes(to))throw new WorkflowStateError(`invalid ${kind} transition`,"invalid_transition");return to;}
function freeze<T>(value:T):T{if(typeof value!=="object"||value===null||Object.isFrozen(value))return value;Object.freeze(value);for(const entry of Object.values(value))freeze(entry);return value;}
