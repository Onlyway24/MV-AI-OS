 . as $source
| (if ($source | has("runtime")) then $source.runtime else $source end) as $runtime
| select(
    ($source | type == "object")
    and ($runtime | type == "object")
    and (if ($source | has("runtime")) then
      (($source | keys | sort)
        == ["contractVersion", "maxRequestBytes", "runtime"])
      and $source.contractVersion == "1"
      and ($source.maxRequestBytes
        | type == "number"
        and floor == .
        and . >= 1
        and . <= 1048576)
    else true end)
    and $runtime.contractVersion == "1"
    and ($runtime.actorId
      | type == "string"
      and test("^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$"))
    and ($runtime.workspaceId
      | type == "string"
      and test("^[A-Za-z0-9][A-Za-z0-9@._:-]{0,127}$"))
    and $runtime.contentAgentMode == "deterministic"
    and ($runtime.permissions | type == "object")
    and ($runtime.permissions.actorGrants | type == "array")
    and ($runtime.permissions.policyGrants | type == "array")
    and ($runtime.permissions.taskGrants | type == "array")
    and ($runtime.sqlite | type == "object")
    and $runtime.sqlite.path == "/data/onlyway.sqlite"
    and ($runtime.sqlite.timeoutMs
      | type == "number"
      and floor == .
      and . >= 100
      and . <= 60000)
    and ($runtime | has("providerMode") | not)
    and ($runtime | has("modelProvider") | not)
    and ($runtime | has("livePaidActivation") | not)
    and (
      (($runtime | keys_unsorted)
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
