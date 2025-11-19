# Elbavol : Lovable Clone but with K8S

## Architecture Draw

<img width="1296" height="865" alt="elbavol" src="https://github.com/user-attachments/assets/cef5423b-928a-446d-b5ce-d208613d2a70" />

### Agent Flow of Execution

```
START
  │
  ▼
check_prompt (userGivenPromptCheckerNode: validate prompt safety)
  │
  ▼
get_context (read existing project files)
  │
  ▼
analyze (smartAnalyzer: analyze intent, complexity)
  │
  ▼
enhance (enhancePromptNode: enhance prompt with LLM)
  │
  ▼
plan (planerNode: create detailed execution plan)
  │
  ▼
execute (run tool calls in parallel with SSE updates)
  │
  ▼
validate (check build status)
  │
  ├─buildStatus === "success"?
  │   │
  │   ▼
  │ test_build
  │   │
  │   ├─buildStatus === "tested"?──► push ──► save ──► run ──► END
  │   │
  │   └─errors?──► fix_errors ──┐
  │                             │
  └─buildStatus === "errors"?   │
      │                         │
      ▼                         │
   fix_errors ──────────────────┘
      │
      └──► execute (re-run tools with fixes)
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
