import type { TaskRecord, TaskState } from "../core/models/task.js";

export interface TaskUpdateExpectation {
  readonly state: TaskState;
  readonly updatedAt: string;
}

export interface TaskRepository {
  getById(taskId: string): Promise<TaskRecord | undefined>;
  getByRequestId(requestId: string): Promise<TaskRecord | undefined>;
  insert(task: TaskRecord): Promise<void>;
  update(
    task: TaskRecord,
    expectation: TaskUpdateExpectation,
  ): Promise<void>;
}
