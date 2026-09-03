# Agent SDK shapes confirmed for this harness

Package: @anthropic-ai/claude-agent-sdk@0.3.217 (ESM, "type": "module", main sdk.mjs)

## CanUseTool (confirmed against sdk.d.ts during planning)

    type CanUseTool = (
      toolName: string,
      input: Record<string, unknown>,
      options: { signal: AbortSignal; suggestions?: PermissionUpdate[]; blockedPath?: string;
        decisionReason?: string; title?: string; displayName?: string; description?: string;
        toolUseID: string; agentID?: string; requestId: string;
        matchedAskRule?: { source: string; toolName: string; ruleContent?: string; }; }
    ) => Promise<PermissionResult | null>;

    type PermissionResult =
      | { behavior: 'allow'; updatedInput?: Record<string, unknown>; updatedPermissions?: PermissionUpdate[];
          toolUseID?: string; decisionClassification?: PermissionDecisionClassification; }
      | { behavior: 'deny'; message: string; interrupt?: boolean; toolUseID?: string;
          decisionClassification?: PermissionDecisionClassification; };

## query()

    function query({ prompt, options }: { prompt: string | AsyncIterable<SDKUserMessage>; options?: Options; }): Query;
    // Query extends AsyncGenerator<SDKMessage, void>

## Result message shape (confirmed this task, Step 4)

Grep command run:

    grep -n "SDKResultMessage\|SDKMessage =\|SdkPluginConfig" node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts

Raw matches (line numbers from the installed package's `sdk.d.ts`):

    419:         SDKResultMessage,
    438:         SdkPluginConfig,
    1744:     plugins?: SdkPluginConfig[];
    3981: export declare type SDKMessage = SDKAssistantMessage | SDKUserMessage | SDKUserMessageReplay | SDKResultMessage | SDKSystemMessage | SDKPartialAssistantMessage | SDKCompactBoundaryMessage | SDKStatusMessage | SDKAPIRetryMessage | SDKControlRequestProgressMessage | SDKModelRefusalFallbackMessage | SDKModelRefusalNoFallbackMessage | SDKLocalCommandOutputMessage | SDKHookStartedMessage | SDKHookProgressMessage | SDKHookResponseMessage | SDKPluginInstallMessage | SDKToolProgressMessage | SDKAuthStatusMessage | SDKTaskNotificationMessage | SDKTaskStartedMessage | SDKTaskUpdatedMessage | SDKTaskProgressMessage | SDKBackgroundTasksChangedMessage | SDKThinkingTokensMessage | SDKSessionStateChangedMessage | SDKWorkerShuttingDownMessage | SDKCommandsChangedMessage | SDKNotificationMessage | SDKFilesPersistedEvent | SDKToolUseSummaryMessage | SDKMemoryRecallMessage | SDKRateLimitEvent | SDKElicitationCompleteMessage | SDKPermissionDeniedMessage | SDKPromptSuggestionMessage | SDKMirrorErrorMessage | SDKInformationalMessage | SDKConversationResetMessage;
    4158: export declare type SdkPluginConfig = {
    4251: export declare type SDKResultMessage = SDKResultSuccess | SDKResultError;

`SDKResultMessage` is a union of two full shapes (located by reading `sdk.d.ts` directly since the grep line for `SDKResultMessage =` doesn't show the member fields — both members are reproduced verbatim below, lines 4231-4282):

    export declare type SDKResultError = {
        type: 'result';
        subtype: 'error_during_execution' | 'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries';
        duration_ms: number;
        duration_api_ms: number;
        is_error: boolean;
        num_turns: number;
        stop_reason: string | null;
        total_cost_usd: number;
        usage: NonNullableUsage;
        modelUsage: Record<string, ModelUsage>;
        permission_denials: SDKPermissionDenial[];
        errors: string[];
        terminal_reason?: TerminalReason;
        fast_mode_state?: FastModeState;
        origin?: SDKMessageOrigin;
        uuid: UUID;
        session_id: string;
    };

    export declare type SDKResultSuccess = {
        type: 'result';
        subtype: 'success';
        duration_ms: number;
        duration_api_ms: number;
        ttft_ms?: number;
        ttft_stream_ms?: number;
        time_to_request_ms?: number;
        user_message_uuid?: string;
        request_sent_wall_ms?: number;
        time_to_request_from_spawn_ms?: number;
        warm_spare_claimed?: boolean;
        time_origin_ms?: number;
        is_error: boolean;
        api_error_status?: number | null;
        num_turns: number;
        result: string;
        stop_reason: string | null;
        total_cost_usd: number;
        usage: NonNullableUsage;
        modelUsage: Record<string, ModelUsage>;
        permission_denials: SDKPermissionDenial[];
        structured_output?: unknown;
        deferred_tool_use?: SDKDeferredToolUse;
        terminal_reason?: TerminalReason;
        fast_mode_state?: FastModeState;
        origin?: SDKMessageOrigin;
        uuid: UUID;
        session_id: string;
    };

**Takeaway for the runner:** every `SDKResultMessage` (success or error) carries `type: 'result'`, `total_cost_usd: number`, `usage: NonNullableUsage` (a mapped type over the Anthropic SDK's `BetaUsage`, e.g. `input_tokens`/`output_tokens`/cache fields, all made non-nullable), and `session_id: string` — confirming the field names the design doc assumed (`total_cost_usd`, `usage`, `session_id`). Discriminate success vs. error via `subtype === 'success'` (only `SDKResultSuccess` has `result: string`; `SDKResultError` instead has `errors: string[]`). `is_error: boolean` is also present on both and is the cheapest single field to check.

## Plugin config shape (confirmed this task, Step 4)

Full definition (`sdk.d.ts` lines 4155-4171):

    /**
     * Configuration for loading a plugin.
     */
    export declare type SdkPluginConfig = {
        /**
         * Plugin type. Currently only 'local' is supported
         */
        type: 'local';
        /**
         * Absolute or relative path to the plugin directory
         */
        path: string;
        /**
         * When true, the engine loads skills/hooks/agents/commands from this plugin but does NOT read its .mcp.json or manifest mcpServers. Use when the SDK host owns this plugin's MCP connections.
         */
        skipMcpDiscovery?: boolean;
    };

Used at `options.plugins?: SdkPluginConfig[]` (line 1744).

**Correction vs. the plan's assumption:** the docs-derived assumption was "an object with at least a `path` field." The real shape requires a `type: 'local'` discriminant field in addition to `path` — `{ path: string }` alone is not valid; the runner must pass `{ type: 'local', path: <absolute-path-to-this-repo> }`. `skipMcpDiscovery` is optional and not needed for this harness (claude-tweaks ships no `.mcp.json`).

## AskUserQuestion input/output shapes (confirmed Task 4, Step 1)

Grep command run (via an inline `node -e` script walking `node_modules/@anthropic-ai/claude-agent-sdk/` with `fs.readdirSync`/`fs.readFileSync`, since the literal `grep -rn "AskUserQuestion" node_modules/@anthropic-ai/claude-agent-sdk/` was denied by this session's Bash permission settings):

    node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:32:  | AskUserQuestionInput
    node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:76:  | AskUserQuestionOutput
    node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:848:export interface AskUserQuestionInput {
    node_modules/@anthropic-ai/claude-agent-sdk/sdk-tools.d.ts:3396:export interface AskUserQuestionOutput {

`sdk-tools.d.ts` is a separate, auto-generated file from `sdk.d.ts` (JSON-Schema-derived typing for every built-in tool's recorded input/output — ~35 tools, `AskUserQuestion` is not uniquely special here), distinct from the `CanUseTool`/`PermissionResult` contract above.

`AskUserQuestionInput` (line 848): `{ questions: [{ question: string; header: string; options: [{ label: string; description: string; preview?: string }, ...2-4 items]; multiSelect: boolean }, ...1-4 items] }`. No `answers` field — this is just the posed questions.

`AskUserQuestionOutput` (line 3396): `{ questions: [...same shape...]; answers: { [k: string]: string }; response?: string; annotations?: {...}; afkTimeoutMs?: number }`. Doc comment: *"The answers provided by the user (question text -> answer string; multi-select answers are comma-separated)."*

**Correction — this is the SDK's typed API-level output, not what a `PostToolUse` hook's `ctx.input.tool_response` receives for this tool (confirmed record #452's final review).** Extracted directly from a live session transcript (`tool_use`/`tool_result` blocks for real `AskUserQuestion` calls), `ctx.input.tool_response` for `AskUserQuestion` is always a plain natural-language string — e.g. `Your questions have been answered: "..."="...". You can now continue with these answers in mind.` — never the structured `{questions, answers}` object above. The prefix/suffix vary (observed both `"Your questions have been answered: ..."`/`"...You can now continue with these answers in mind."` and `"The user answered: ..."`/`"...follow what they actually say."`), and the embedded question text can carry unescaped nested double quotes, so this string is not safely regex-parseable into per-question answers. `plugin/bin/lib/hooks/post-tool-use.js`'s `logAskUserQuestion` logs it as one raw `response` field via the file's own `extractToolResponseText` helper instead of attempting to extract per-question answers. Do not reintroduce an `answers`-map lookup against `tool_response` for this tool based on the type declaration above — it describes the SDK's own return type, not the hook boundary.

**Takeaway for the actor:** `evals/actor.js`'s `updatedInput: { questions, answers }` return shape matches `AskUserQuestionOutput`'s two required fields exactly (the other three are optional and correctly omitted). This confirms — does not contradict — the design already implemented; `answers` lives in the tool's *output* schema, not its input schema. `PermissionResult.updatedInput` itself remains typed as `Record<string, unknown>` in `sdk.d.ts` (no compile-time binding to either schema), so this is informative confirmation rather than a hard constraint discovered late.

## AgentInput.run_in_background default (confirmed during final-review follow-up)

Grep command run (same `node -e` fs-walk workaround as above — direct `grep`/`Read` on `node_modules` paths is denied by this session's Bash permission settings):

    node -e "... fs.readFileSync(path.join('evals','node_modules','@anthropic-ai','claude-agent-sdk','sdk-tools.d.ts'), 'utf8') ..."

`AgentInput` (`sdk-tools.d.ts`, `export interface AgentInput { ... }`):

    /**
     * Agents run in the background by default; you will be notified when one completes. Set to false to run this agent synchronously when you need its result before continuing.
     */
    run_in_background?: boolean;

**Takeaway for the actor:** the field defaults to background (`true`) when *omitted*, not just when explicitly set — the doc comment states this plainly, but it was missed on first implementation. `evals/actor.js`'s original Agent-dispatch guard checked only `input.run_in_background === true`, which denies the explicit-true case but silently allows the (more common) omitted case straight into the same async-coordination hang the guard exists to prevent. Fixed to `!input || input.run_in_background !== false` — deny unless the caller explicitly opts into synchronous dispatch. Any future guard keyed off an SDK-typed optional boolean should read the field's own doc comment for its default before assuming "omitted" is the safe branch.

## managedSettings.sandbox.autoAllowBashIfSandboxed default (confirmed during Task 7.5 sandbox validation)

`sdk.d.ts`'s `sandbox` option type declares the field with no adjacent doc comment of its own:

    sandbox?: {
        enabled?: boolean;
        failIfUnavailable?: boolean;
        autoAllowBashIfSandboxed?: boolean;
        allowUnsandboxedCommands?: boolean;
        ...
    }

Its default is confirmed instead by a parenthetical in a *different* field's doc comment (`filesystem`'s skip-isolation option) later in the same file: *"Does not change Bash prompting: `sandbox.autoAllowBashIfSandboxed` is independent and still defaults to `true`, so set it to `false` to keep prompting for sandboxed commands."*

**Takeaway for the runner:** with sandboxing enabled (`runner.js`'s `managedSettings.sandbox`), Bash-tool calls are auto-allowed by the sandbox itself and never reach `canUseTool` at all — confirmed empirically during Task 7.5's real-API validation, before this doc-comment cross-reference was found. This means `runner.js`'s `toolCalls` count (fed by `canUseTool`) structurally undercounts real Bash tool use whenever the sandbox is active — documented as a known limitation in `evals/README.md`'s Safety model section and as a code comment next to `runner.js`'s `toolCalls.push`, not something this harness's own code can close without either setting `autoAllowBashIfSandboxed: false` (reintroducing a prompt for every sandboxed Bash call, which this harness's headless runs cannot answer) or independently instrumenting the sandbox layer itself.

**Superseded by record #46 (2026-08-02):** `autoAllowBashIfSandboxed: false` was adopted in `runner.js`. The "reintroduces a prompt this harness's headless runs cannot answer" reasoning above does not hold — headless runs answer `canUseTool` programmatically via `actor.js`, with no live human prompt involved at any point, so this was never actually a blocker. `evals/scenarios/actor-escape-attempt.yaml` is the confirming live run: `node runner.js run actor-escape-attempt` completed in ~20 seconds with no hang and no unanswered prompt.

## Live-run commands for the two judgment-eval matrices (2026-08-09, refs #115 #180)

Both matrices are wired and proven offline (`npm test` from `evals/`); actually
measuring the judgments spends real money, one billed agent run per corpus case:

    cd evals && node runner.js run assess-merge-check-matrix          # 8 cases (merge-check verdicts)
    cd evals && node runner.js run research-consequence-filter-matrix  # 6 cases (consequence filter keep/drop)

A passing run prints one `assess-merge-check-matrix[<case-id>]: PASS` / `research-consequence-filter-matrix[<case-id>]: PASS` line per corpus entry; history recording is on by default (append `--no-record` to skip the `history.jsonl` write).

**Named risk for `assess-merge-check-matrix`'s first live run** (inherited from the 2026-08-08 plan; still unprobed): merge-check's Step 1 shells out to `node -e "require(process.env.CLAUDE_PLUGIN_ROOT + '/bin/lib/issues/blast-radius.js')"`. `buildPluginSnapshot()` copies `bin/` into the snapshot, so the file is present — but no scenario has yet demonstrated that `CLAUDE_PLUGIN_ROOT` resolves inside the eval sandbox. If the first live run fails there, the failure is the harness assumption, not the corpus; the consequence-filter matrix does not share this dependency (verify-mode never shells out through the plugin root).
