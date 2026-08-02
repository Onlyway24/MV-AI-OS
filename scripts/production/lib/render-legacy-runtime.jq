. as $runtime
| select(
    type == "object"
    and .contractVersion == "1"
    and (.actorId
      | type == "string"
      and test("^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$"))
    and (.workspaceId
      | type == "string"
      and test("^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$"))
    and .contentAgentMode == "deterministic"
    and (.permissions | type == "object")
    and (.permissions.actorGrants | type == "array")
    and (.permissions.policyGrants | type == "array")
    and (.permissions.taskGrants | type == "array")
    and (.sqlite | type == "object")
    and .sqlite.path == "/data/onlyway.sqlite"
    and (.sqlite.timeoutMs
      | type == "number"
      and floor == .
      and . >= 100
      and . <= 60000)
    and (has("providerMode") | not)
    and (has("modelProvider") | not)
    and (has("livePaidActivation") | not)
    and (
      (keys_unsorted
        - [
            "actorId",
            "contentAgentMode",
            "contractVersion",
            "permissions",
            "sqlite",
            "workspaceId"
          ])
      | length
    ) == 0
  )
| {
    contractVersion: "1",
    maxRequestBytes: 262144,
    runtime: {
      actorId: $runtime.actorId,
      contentAgentMode: "deterministic",
      contractVersion: "1",
      permissions: {
        actorGrants: [],
        policyGrants: [],
        taskGrants: []
      },
      providerMode: "OFFLINE_REHEARSAL",
      sqlite: {
        path: "/var/lib/onlyway/mv-ai-os.sqlite",
        timeoutMs: 5000
      },
      workspaceId: $runtime.workspaceId
    }
  }
