# Elbavol : Lovable Clone but with K8S

## Architecture Draw

<img width="1296" height="865" alt="elbavol" src="https://github.com/user-attachments/assets/cef5423b-928a-446d-b5ce-d208613d2a70" />

### Agent Flow of Execution

```
START
  │
  ▼
analyze
  │
  ├─needsEnhancement?──► enhance ──┐
  │                               │
  └───────────────► plan ────────┘
                    │
                    ▼
               get_context
                    │
                    ▼
                 execute
                 (tools run in parallel with SSE updates)
                    │
                    ▼
                validate
                    │
          ┌─────────┼─────────┐
          │         │         │
    buildStatus     │   iterations >= 8
    === "success"   │         │
          │         │         │
          ▼         ▼         ▼
      test_build    execute    END
          │
          ├─buildStatus === "tested"?──► push ──► save ──► run ──► END
          │
          └───────────────► fix_errors ──┐
                                        │
                                        ▼
                                   test_build
```

**Tool Execution Details:**
- Tools execute directly (no toolExecutor wrapper)
- Parallel execution for independent operations
- Real-time SSE updates for each tool:
  - `tool_executing`: When tool starts
  - `tool_completed`: When tool succeeds
  - `tool_error`: When tool fails
  - `tool_retry`: When tool is retried
  - `execution_complete`: When all tools finish

### Todo

- fix cicd
- deploy yml to GEK
- test the workflow local
- serving the diffs to frontend
- operating using k8s programatiaclly
 