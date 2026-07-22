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

**Takeaway for the actor:** `evals/actor.js`'s `updatedInput: { questions, answers }` return shape matches `AskUserQuestionOutput`'s two required fields exactly (the other three are optional and correctly omitted). This confirms — does not contradict — the design already implemented; `answers` lives in the tool's *output* schema, not its input schema. `PermissionResult.updatedInput` itself remains typed as `Record<string, unknown>` in `sdk.d.ts` (no compile-time binding to either schema), so this is informative confirmation rather than a hard constraint discovered late.
