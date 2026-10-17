## 第8章 Claude Agent SDK(TypeScript / Python)

### この章で分かること

Claude Agent SDK は、Claude Code の agent loop(モデル呼び出し、ツール実行、コンテキスト管理、権限判定)を自分のプログラムから `query()` 一発で駆動するためのライブラリで、TypeScript(`@anthropic-ai/claude-agent-sdk` 0.3.302)と Python(`claude-agent-sdk` 0.2.168)の 2 系統がある。この章では、SDK が実際には同梱の `claude` バイナリをサブプロセスとして spawn し stdio で会話しているという実行モデルを起点に、Options の優先順位(filesystem 設定 < プログラム指定 < managed policy)、権限評価の 6 段階、in-process MCP ツール、subagent、セッション永続化(SessionStore)、構造化出力、hooks、コスト計測、ホスティングとサンドボックスまでを、公式リファレンスから検証済みのコードで押さえる。特に「デフォルトのシステムプロンプトは Claude Code のものではない」「TS の `env` は環境を置換する」「`canUseTool` は自動承認されたツール呼び出しには一切呼ばれない」「単発 `query()` はエラー結果を yield した後に throw する」といった、CLI 利用者が SDK に移ったときに必ず踏む差分を優先して扱う。最後に、課金(Max/Team の月次 API クレジット)と、claude.ai ログインを第三者製品に組み込めないという利用条件も整理する。

### 8.1 位置づけ、パッケージ、認証

#### SDK は CLI のラッパーである

`query()` を 1 回呼ぶごとに `claude` CLI のサブプロセスが 1 つ起動し、SDK はそれと stdio 経由で JSON メッセージをやり取りする。N セッション = N サブプロセスで、目安は 1 セッションあたり 1 GiB RAM、5 GiB ディスク、1 CPU。この構造から、以下の性質が導かれる。

- SDK のパッチ番号は同梱 Claude Code のバージョンと 1:1 に対応する(TS 0.3.302 は Claude Code v2.1.302 を同梱、npm マニフェストに `"claudeCodeVersion": "2.1.302"` がある)。「Claude Code v2.1.xxx 以降が必要」と書かれた機能は、同じパッチ番号以降の SDK リリースで使える。Python 0.2.168 は CLI 2.1.301 を同梱。
- バイナリは TS では `optionalDependencies`(`@anthropic-ai/claude-agent-sdk-{linux,darwin,win32}-{x64,arm64}` と linux musl 系)、Python ではプラットフォーム wheel として配布される。`npm ci --omit=optional` のように optional を落とすと `Native CLI binary for <platform>-<arch> not found` で失敗するので、その場合は別途インストールした `claude` を `pathToClaudeCodeExecutable`(TS)/ `cli_path`(Python)で指す。
- 標準出力が SDK のメッセージチャネルなので、サブプロセス側で stdout に何かを書く設定(後述の OTEL `console` exporter など)は禁止。

要件は TS が Node >= 18、peer deps に `zod ^4.0.0`、`@anthropic-ai/sdk >= 0.93.0`、`@modelcontextprotocol/sdk ^1.29.0`。Python は >= 3.10、依存は `anyio>=4`、`jsonschema>=4.20`、`mcp>=1.23,<3`(3.11 未満では `typing-extensions` も)。

```bash
npm init -y
npm pkg set type=module
npm install @anthropic-ai/claude-agent-sdk
npm install --save-dev tsx

# Python
uv init
uv add claude-agent-sdk
```

新規プロジェクトのセットアップ。実行は `npx tsx agent.ts` / `uv run agent.py`。SDK は `.env` を読まないので、`ANTHROPIC_API_KEY` は自分で環境に載せる。

#### 旧 Claude Code SDK からの移行

```python
# BEFORE (claude-code-sdk)
from claude_code_sdk import query, ClaudeCodeOptions

options = ClaudeCodeOptions(model="claude-opus-4-7", permission_mode="acceptEdits")

# AFTER (claude-agent-sdk)
from claude_agent_sdk import query, ClaudeAgentOptions

options = ClaudeAgentOptions(model="claude-opus-4-7", permission_mode="acceptEdits")

# TypeScript:
# import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
```

パッケージ名(`@anthropic-ai/claude-code` から `@anthropic-ai/claude-agent-sdk`、`claude-code-sdk` から `claude-agent-sdk`)とクラス名(`ClaudeCodeOptions` から `ClaudeAgentOptions`)の置換。破壊的変更は「システムプロンプトが Claude Code のものをデフォルトにしなくなった」こと(8.4 で詳述)。`settingSources` は v0.1.0 で一度「何も読まない」に変わった後に戻され、現在は `['user','project','local']` がデフォルト。Python <= 0.1.59 は `setting_sources=[]` を未指定と同じに扱っていたので、古いバージョンに依存した分離設計は見直す。

TS の実験的 V2 セッション API(`unstable_v2_createSession` / `unstable_v2_resumeSession` / `unstable_v2_prompt`、`SDKSession`、`SDKSessionOptions`)は 0.2.133 で非推奨化、0.3.142 で削除された(バージョンは 0.2.x から 0.3.142 に飛んでいる)。0.2 系のサンプルに基づくコードはコンパイルできないため、`query()` に AsyncIterable を渡すストリーミング入力か `options.resume` に書き換える。

#### 認証と利用条件

- API キー(`ANTHROPIC_API_KEY`)が基本。Bedrock / Vertex / Foundry / Claude Platform on AWS は `CLAUDE_CODE_USE_BEDROCK=1` / `CLAUDE_CODE_USE_VERTEX=1` / `CLAUDE_CODE_USE_FOUNDRY=1` / `CLAUDE_CODE_USE_ANTHROPIC_AWS=1` + `ANTHROPIC_AWS_WORKSPACE_ID`。
- Anthropic は、事前承認がない限り、第三者が自社製品(Agent SDK 製のエージェント含む)で claude.ai ログインやサブスクリプションのレート枠を提供することを認めていない。`claude setup-token` で得る `CLAUDE_CODE_OAUTH_TOKEN` はモデル呼び出しのみ可能で claude.ai コネクタは使えない。ブランド表記は「Claude Agent」「{YourAgentName} Powered by Claude」は可、「Claude Code」の名称や ASCII アートは不可。
- サブスクリプションの included usage を使い切ると `SDKRateLimitEvent` に `errorCode: 'credits_required'`、`canUserPurchaseCredits`、`hasChargeableSavedPaymentMethod`(v2.1.181+)が載る。

課金については公式ページの記述がこうなっている。Max 5x($100/月)、Max 20x($200/月)、Team(Standard シート $20、Premium シート $100、プール上限 $500/月)には Claude Platform の月次 API クレジットが含まれ、Claude API、Managed Agents、Agent SDK、`claude -p`、Playground を賄う。Claude Code(対話利用)、Claude アプリの追加利用、Claude Platform on AWS / Bedrock / Vertex / Foundry は対象外。Pro、Free、Enterprise は対象外。クレジットは claude.ai の Settings > Billing(Team は Organization settings > Billing)から Console 組織を 1 つだけリンクして使い(プラン加入から 7 日後、Max は本人、Team は Primary Owner / Owner、Console 側は Owner / Admin / Billing ロール)、リンク先はサポート経由でしか変更できない。請求サイクルごとに失効し繰り越しなし、付与分が購入分より先に消費され、リンクした組織は最低 Start tier(クレジットが $200 超なら Build tier)になる。枯渇すると API は `Your credit balance is too low...` で止まり、Claude Code セッションを試みると `Credit balance too low · Add funds: https://platform.claude.com/settings/billing` が出る。リンク組織内の全 API キーと workspace が残高を共有するので、プロジェクト別に上限を切りたいなら workspace の spend limit を使う。サポート記事側には「2026 年 6 月 15 日に予告されていた Agent SDK 利用の変更は一時停止され、Agent SDK / `claude -p` / サードパーティアプリは引き続きサブスクリプション枠から消費される」という注記があり、10 月 7 日の注記でクレジット付与が案内されている。Pro プランで SDK を個人利用する際の扱い(サブスクリプション枠から消費できるのか)は、クレジットページとサポート記事の記述が完全には噛み合っておらず、ここでは断定しない(未検証)。

### 8.2 実行モデル: query() と ClaudeSDKClient

#### シグネチャ

TS:

```typescript
query({ prompt: string | AsyncIterable<SDKUserMessage>, options?: Options }): Query
// Query extends AsyncGenerator<SDKMessage, void>
```

`Query` オブジェクトには制御メソッドが生えている: `interrupt`、`rewindFiles`、`setPermissionMode`、`setModel`(引数なしか `"default"` で Claude Code のデフォルトに戻す)、`setMaxThinkingTokens`、`applyFlagSettings`、`updateSettings`、`initializationResult`、`reinitialize`、`supportedCommands` / `supportedModels` / `supportedAgents`、`mcpServerStatus`、`getContextUsage`、`readFile`、`reloadPlugins` / `reloadSkills` / `reloadOutputStyles`、`accountInfo`、`reconnectMcpServer`、`toggleMcpServer`、`setMcpServers`、`readMcpResource`、`streamInput`、`stopTask`、`close`。

Python:

```python
query(*, prompt: str | AsyncIterable[dict], options: ClaudeAgentOptions | None, transport: Transport | None) -> AsyncIterator[Message]
```

Python の `query()` は素のイテレータで、制御メソッド(`interrupt`、`set_model`、`set_permission_mode`、`rewind_files`、`reconnect_mcp_server` など)は `ClaudeSDKClient` に生えている。`ClaudeSDKClient` は `client.query()` を複数回呼ぶ間、セッション ID を自動で追跡する。`transport` は `ClaudeAgentOptions` のフィールドではなく、`query()` と `ClaudeSDKClient.__init__` の引数である。

#### 最小構成(公式 quickstart、verbatim)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

// Agentic loop: streams messages as Claude works
for await (const message of query({
  prompt: "Review utils.py for bugs that would cause crashes. Fix any issues you find.",
  options: {
    allowedTools: ["Read", "Edit", "Glob"], // Auto-approve these tools
    permissionMode: "acceptEdits" // Auto-approve file edits
  }
})) {
  // Print human-readable output
  if (message.type === "assistant" && message.message?.content) {
    for (const block of message.message.content) {
      if ("text" in block) {
        console.log(block.text); // Claude's reasoning
      } else if ("name" in block) {
        console.log(`Tool: ${block.name}`); // Tool being called
      }
    }
  } else if (message.type === "result") {
    console.log(`Done: ${message.subtype}`); // Final result
  }
}
```

TS では content が `message.message.content` にある(二重の `message`)点に注意。

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AssistantMessage, ResultMessage


async def main():
    # Agentic loop: streams messages as Claude works
    async for message in query(
        prompt="Review utils.py for bugs that would cause crashes. Fix any issues you find.",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Edit", "Glob"],  # Auto-approve these tools
            permission_mode="acceptEdits",  # Auto-approve file edits
        ),
    ):
        # Print human-readable output
        if isinstance(message, AssistantMessage):
            for block in message.content:
                if hasattr(block, "text"):
                    print(block.text)  # Claude's reasoning
                elif hasattr(block, "name"):
                    print(f"Tool: {block.name}")  # Tool being called
        elif isinstance(message, ResultMessage):
            print(f"Done: {message.subtype}")  # Final result


asyncio.run(main())
```

Python は `isinstance()` でクラス判定し、`session_id` は `SystemMessage.data` の中にある。

#### メッセージ型

主要 5 種: `SystemMessage`(subtype `init` / `compact_boundary` / `informational` / `worker_shutting_down` など)、`AssistantMessage`(content block ごとに 1 件、同じ message id を共有)、`UserMessage`(tool result)、`StreamEvent`(`includePartialMessages` 有効時のみ)、`ResultMessage`。TS の `SDKMessage` union は現在 36 メンバーあり、`SDKMirrorErrorMessage`、`SDKConversationResetMessage`、`SDKRateLimitEvent`、`SDKTaskNotificationMessage`、`SDKPermissionDeniedMessage`、`SDKAPIRetryMessage`、`SDKStatusMessage` などが含まれる。`prompt_suggestion` のような末尾 system イベントは result の後に届くことがあるので、`result` で `break` せず完走させる。

init メッセージには `claude_code_version`、`apiKeySource`、`output_style`、`skills` / `slash_commands`、`plugins` / `plugin_errors`(TS 0.3.283+)、`mcp_servers[].status`、`fast_mode_state`、そして `capabilities`(v2.1.205+)が載る。バージョン文字列をパースするのではなく `capabilities`(`interrupt_receipt_v1`、`interrupt_cancel_queued_v1`、`sdk_mcp_manifests`、`sdk_mcp_tools_list_changed`)で機能検出するのが公式推奨。Python では 0.2.166 から `SystemInitData` 型で `cast(SystemInitData, msg.data)` できる。

#### ResultMessage

subtype は `success` / `error_max_turns` / `error_max_budget_usd` / `error_during_execution` / `error_max_structured_output_retries`。`result` テキストは `success` のときだけ存在し、`total_cost_usd`、`usage`、`num_turns`、`session_id` は全 subtype に載る。`stop_reason` は `end_turn` / `max_tokens` / `refusal`(クラッシュ時は null)。TS の `terminal_reason` は loop 終了理由を 19 値で列挙する(`completed`、`max_turns`、`tool_deferred`、`aborted_streaming`、`aborted_tools`、`hook_stopped`、`stop_hook_prevented`、`background_requested`、`blocking_limit`、`rapid_refill_breaker`、`prompt_too_long`、`image_error`、`model_error`、`api_error`、`malformed_tool_use_exhausted`、`budget_exhausted`、`structured_output_retry_exhausted`、`tool_deferred_unavailable`、`turn_setup_failed`)。

```python
@dataclass
class ResultMessage:
    subtype: str
    duration_ms: int
    duration_api_ms: int
    is_error: bool
    num_turns: int
    session_id: str
    stop_reason: str | None = None
    total_cost_usd: float | None = None
    usage: dict[str, Any] | None = None
    result: str | None = None
    structured_output: Any = None
    model_usage: dict[str, ModelUsage] | None = None
    permission_denials: list[Any] | None = None
    deferred_tool_use: DeferredToolUse | None = None
    errors: list[str] | None = None
    api_error_status: int | None = None
    uuid: str | None = None
    terminal_reason: str | None = None
    origin: MessageOrigin | None = None
```

Python の `ResultMessage` dataclass。重要な罠: 最終 API リクエストが失敗した場合は subtype が `success` のまま `is_error=True`、`api_error_status` が入って届く(`api_error_status` は `success` のときだけ入る)。したがって分岐は `terminal_reason` を先に見る。`total_cost_usd` / `usage` / `model_usage` は Optional なので None チェックが要る。`terminal_reason` は古い CLI、`/voice` `/usage` などのローカルコマンド結果、合成された致命エラー結果では None。Python はエラー結果の後に `ResultError`(`ProcessError` のサブクラス、>= 0.2.140)を raise する。

TS の result にはさらに診断用フィールドがある: `result_index`(0.3.268、欠番は結果の欠落)、`local_command`(モデルターンなしで完了した slash command 名)、`startup_failure_reason`(0.3.274)、`fast_mode_state` / `fast_mode_disabled_reason`(`sdk_opt_in_required` なら `settings` か `applyFlagSettings()` で `fastMode: true`)、`ttft_ms` / `ttft_stream_ms`、`api_error_status`。

#### 本番形の単発エージェント(agent-loop ページ、verbatim)

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

let sessionId: string | undefined;

try {
  for await (const message of query({
    prompt: "Find and fix the bug causing test failures in the auth module",
    options: {
      allowedTools: ["Read", "Edit", "Bash", "Glob", "Grep"], // Listing tools here auto-approves them (no prompting)
      settingSources: ["project"], // Load CLAUDE.md, skills, hooks from current directory
      maxTurns: 30, // Prevent runaway sessions
      effort: "high" // Thorough reasoning for complex debugging
    }
  })) {
    // Save the session ID to resume later if needed
    if (message.type === "system" && message.subtype === "init") {
      sessionId = message.session_id;
    }

    // Handle the final result
    if (message.type === "result") {
      if (message.subtype === "success") {
        console.log(`Done: ${message.result}`);
      } else if (message.subtype === "error_max_turns") {
        // Agent ran out of turns. Resume with a higher limit.
        console.log(`Hit turn limit. Resume session ${sessionId} to continue.`);
      } else if (message.subtype === "error_max_budget_usd") {
        console.log("Hit budget limit.");
      } else {
        console.log(`Stopped: ${message.subtype}`);
      }
      console.log(`Cost: $${message.total_cost_usd.toFixed(4)}`);
    }
  }
} catch (error) {
  // A single-shot query() throws after yielding an error result. If the
  // failure was an error result, the error subtype branches above have
  // already run; connection or process failures yield no result message.
  console.log(`Session ended with an error: ${error}`);
}
```

単発 `query()` は `error_*` 結果を yield した後に throw する。try/catch は必須で、result 分岐と catch の両方が走る前提でログを設計する。ストリーミング入力モードのセッションはキャップに当たっても生き続ける。

#### ストリーミング入力モード(推奨)

`prompt` に `AsyncIterable<SDKUserMessage>` を渡すとストリーミング入力モードになり、画像添付、メッセージのキューイング、割り込み、ターン間の `setModel` / `setPermissionMode` / `applyFlagSettings` が使える。単発モードでは画像・キュー・割り込みが使えない。

```typescript
import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";

function userMessage(text: string): SDKUserMessage {
  return { type: "user", message: { role: "user", content: text }, parent_tool_use_id: null };
}

// Hold the second prompt until the setters have run.
let startSecondTurn!: () => void;
const secondTurnReady = new Promise<void>((resolve) => {
  startSecondTurn = resolve;
});

async function* turnPrompts(): AsyncGenerator<SDKUserMessage, void> {
  yield userMessage("Reply with exactly: ready");
  await secondTurnReady;
  yield userMessage("Reply with exactly: done");
}

const session = query({
  prompt: turnPrompts(),
  options: {
    model: "claude-sonnet-5",
  },
});

let turnModel = "";
let completedTurns = 0;

for await (const message of session) {
  if (message.type === "assistant") {
    turnModel = message.message.model;
  } else if (message.type === "result") {
    completedTurns += 1;
    if (completedTurns === 1) {
      console.log(`First turn model: ${turnModel}`);
      await session.setModel("claude-opus-5");
      await session.setPermissionMode("acceptEdits");
      startSecondTurn();
    } else {
      console.log(`Second turn model: ${turnModel}`);
      break;
    }
  }
}
```

V2 セッション API の代替となる正規のマルチターンパターン。ジェネレータが次の yield を Promise で止め、result を受けてからセッター実行、次ターンを解放する。ジェネレータ内で例外が起きると TS は `Claude Code process aborted by user` として表面化するが、Python は debug レベルでログされるだけでセッションが無言で止まる。

```python
import asyncio

from claude_agent_sdk import AssistantMessage, ClaudeAgentOptions, ClaudeSDKClient

async def main():
    options = ClaudeAgentOptions(model="claude-sonnet-5")

    async with ClaudeSDKClient(options=options) as client:
        await client.query("Reply with exactly: ready")
        first_model = ""
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                first_model = message.model

        await client.set_model("claude-opus-5")
        await client.set_permission_mode("acceptEdits")

        await client.query("Reply with exactly: done")
        second_model = ""
        async for message in client.receive_response():
            if isinstance(message, AssistantMessage):
                second_model = message.model

    print(f"First turn model: {first_model}")
    print(f"Second turn model: {second_model}")

asyncio.run(main())
```

Python 版。`receive_response()` は最初の `ResultMessage` で止まるので、1 ターンにつき `query()` と `receive_response()` を 1 対で使う。ループを `break` で抜けると asyncio のクリーンアップで問題が出るので避け、`interrupt()` 後はバッファが残るため `receive_response()` で読み切ってから次の `query()` を送る。

`SDKUserMessage` の制御フィールド: `priority: 'now' | 'next' | 'later'`、`shouldQuery: false`(モデルターンを消費せず transcript に文脈だけ追加)、`priority: 'now'` + `origin: { kind: 'human' }`(v2.1.286+、実行中の shell / subagent / MCP 作業を中断せず background に送る。WebFetch / WebSearch は v2.1.287+)、`client_composed`、`pasted_content`(0.3.277)、`inline_pastes`(0.3.280)。`verbatimPrompts` / `verbatim_prompts`(TS >= 0.3.280、Py >= 0.2.158、CLI 2.1.248+)は全メッセージに `client_composed` を立てて `@path` 展開と slash command ディスパッチを無効化する。

TS には `startup()`(initialize ハンドシェイクまで済ませた `WarmQuery` を返す、`initializeTimeoutMs` デフォルト 60000)と `prewarm()`(alpha、>= 0.3.282、約 230 から 260 MB の予備プロセスを保持し `SpareProcess.claim({ prompt, options: { cwd } })` で後から束縛)がある。claim 時に変えられないもの(`mcpServers`、`hooks`、`canUseTool`、`settingSources`、`systemPrompt`、`plugins`)は予備プロセスごとに固定、`resume` / `continue` / `forkSession` を含む options で prewarm すると throw。

### 8.3 Options の階層: settingSources、settings、env

#### settingSources と優先順位

- `settingSources` 未指定は `['user','project','local']` と同義(CLI と同じ)。`[]` で filesystem 設定を切り離す。ただし managed policy settings、`~/.claude.json`、auto memory、claude.ai MCP コネクタ、サンドボックスのクレデンシャル deny/mask エントリは `[]` でも読まれる。
- Python で `skills` を指定しつつ `setting_sources` 未指定の場合は user と project だけが読まれ、local は読まれない(python.md の `setting_sources` 行に明記)。
- 優先順位: local > project > user。`agents`、`allowedTools`、`settings`、`applyFlagSettings` などプログラム指定は filesystem 設定をすべて上書きし、managed policy settings はプログラム指定をさらに上書きする。
- `settings` オプション(ファイルパス、インライン JSON 文字列、TS ではオブジェクト)は "flag-settings" 層に入る。`outputStyle` はトップレベル Option ではなく `settings` の中で指定する。

#### env の意味が TS と Python で違う

TS の `env` はサブプロセス環境を「置換」する。`...process.env` を展開し忘れると PATH、HOME、`ANTHROPIC_API_KEY` が消える。Python の `env` は継承環境に「マージ」され、指定値が優先。`env` は Claude Code のノブを渡す唯一のチャネルで、`ENABLE_TOOL_SEARCH`、`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`、`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`、`CLAUDE_CONFIG_DIR`、`OTEL_*`、`API_TIMEOUT_MS`、`CLAUDE_CODE_MAX_RETRIES`、`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`、`ENABLE_PROMPT_CACHING_1H`、`CLAUDE_AGENT_SDK_CLIENT_APP`(User-Agent タグ)がここを通る。

```typescript
const options = {
  env: {
    ...process.env, // env replaces the subprocess environment, so keep inherited variables
    ENABLE_TOOL_SEARCH: "auto:5", // Activate tool search when deferrable definitions reach 5% of context
    API_TIMEOUT_MS: "120000",
    CLAUDE_CODE_MAX_RETRIES: "2",
    CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS: "120000",
  },
};
```

tool search とタイムアウト系ノブの合成例。デフォルトは `API_TIMEOUT_MS` 600000、`CLAUDE_CODE_MAX_RETRIES` 10(上限 15。`CLAUDE_CODE_RETRY_WATCHDOG=1` で容量エラーを無限リトライし、v2.1.199+ では他の一時エラーのデフォルトを 300 に上げて上限を外す)、`CLAUDE_ENABLE_STREAM_WATCHDOG` はデフォルト有効で `CLAUDE_STREAM_IDLE_TIMEOUT_MS` は 300000(最小値も同じ)、`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` のデフォルトは idle timeout + 5 分。`includePartialMessages` 時に届く `ping` イベントは生存確認として扱う。TS では `tool_progress` に 30 秒ごとの heartbeat(`heartbeat: true`、>= 0.3.214)が来て長時間ツールとストールを区別できるが、subagent 内のツール呼び出しには出ない。

#### 上限: maxTurns、maxBudgetUsd、effort、thinking

- `maxTurns` はツール使用ターンのみを数え、`0` は無制限(未指定と同じ)。
- `maxBudgetUsd` はクライアント側推定のキャップで、1 レスポンス + 実行中 subagent 分だけ超過しうる。`0` は起動時に拒否されセッションが走らない。キャップ到達で background subagent を停止し新規 spawn を `Budget limit reached` で拒否する(v2.1.217+)。再開セッションから復元された過去合計はカウントしない。ストリーミング入力モードでは max-turns はキューされたメッセージごとにリセット、budget は `/clear` まで累積。
- `temperature` / `top_p` / `max_tokens` は Options にない。代わりに `effort`(`low` / `medium` / `high` / `xhigh` / `max`)、`thinking`(`ThinkingConfig`: `adaptive` / `enabled{budgetTokens}` / `disabled`、`display: 'summarized' | 'omitted'`)、spend cap を使う。`maxThinkingTokens` は非推奨。effort と extended thinking は独立。Opus 4.7+ の API デフォルト display は `omitted` なので thinking テキストが欲しければ `display: 'summarized'` を明示(Bedrock / Vertex には display が渡らない)。TS では `budgetTokens` が optional、Python では `budget_tokens: int` 必須。0.3.300 から `thinking: { type: 'disabled' }` と `maxThinkingTokens: 0` は thinking を切れないモデルでは adaptive として動く。
- `fallbackModel` / `fallback_model` は単一モデルまたはカンマ区切りチェーン。各ユーザーターンの開始時に primary を再試行し、TS は fallback == model で throw。モデル切替は prompt cache を無効化する。

#### 実行中の設定変更(TS)

`applyFlagSettings()` が汎用ランタイムセッター。次ターンに反映: `effortLevel`、`ultracode`、`permissions`、`hooks`、`skillOverrides`、`fastMode`、`agent`。現ターン中に反映: `model`(v2.1.212+)。効果なし: システムプロンプト系。`null` でキーをクリア(`effortLevel: null` はモデルデフォルトに戻る。`effort` オプション値ではない)。連続呼び出しは shallow merge。`applyFlagSettings({ effortLevel: 'xhigh', ultracode: true })` または `effortLevel: "ultracode"`(v2.1.203+)で ultracode を途中から有効化できる。`updateSettings('localSettings', { outputStyle })` / `updateSettings('userSettings', { effortLevel })`(関数自体は 0.3.257、`userSettings` は 0.3.277)は許可された 1 キーをディスクに書く。`max` は session-only なので `userSettings` に `effortLevel: 'max'` を書いても何も書かれない。remote transport 越しや `settingSources` がそのソースを含まない場合は reject。`reinitialize()`(v2.1.195+)は transport 断の後に保留中の permission request を再配信するので、`canUseTool` は `requestId` 単位で冪等にしておく。

### 8.4 システムプロンプト

デフォルトは「最小限」のプロンプトで、tool calling の説明はあるが `claude_code` preset の安全性・セキュリティ指示を含まない。`claude -p` が Claude Code のプロンプトをデフォルトで使うのとは異なる。CLI 同等の挙動が欲しければ preset を明示する。

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "Triage the open issues in this repo",
  options: {
    systemPrompt: {
      type: "preset",
      preset: "claude_code",
      append: "You operate Acme's internal triage workflow. Label issues by component and severity.",
      excludeDynamicSections: true
    }
  }
})) {
  // ...
}
```

Python は `system_prompt={"type": "preset", "preset": "claude_code", "append": "...", "exclude_dynamic_sections": True}`。`excludeDynamicSections: true`(TS >= 0.2.98、Py >= 0.1.58)はユーザー固有の文脈(auto-memory パスなど)を最初の user message に移し、同一設定ならマシンをまたいで prompt cache を共有できる。

重要な挙動: Claude Code v2.1.265 以降(TS 0.3.265 / Py 0.2.153 から同梱)、システムプロンプトはセッション最初のリクエストで記録され、compaction まで再利用される。したがって `resume` / `continue` 時に `append` やカスタムプロンプトを変えても次ターンでは反映されない。開発中の試行錯誤には `snapshot: false`(フィールドは TS 0.3.257 / Py 0.2.153)で毎リクエスト再構築できるが、本番では次の user message で指示を入れるか、hook の `additionalContext`(UserPromptSubmit / PostToolUse)で注入する。bare mode(`extraArgs` で `--bare`、または `CLAUDE_CODE_SIMPLE=1`)では `snapshot: true` を指定しない限り記録はオフ。

#### 静的/動的の cache 分割(TS のみ)

```typescript
import { readFile } from "node:fs/promises";
import { query, SYSTEM_PROMPT_DYNAMIC_BOUNDARY } from "@anthropic-ai/claude-agent-sdk";

// Identical on every request
const instructions = await readFile("triage-instructions.md", "utf8");
// Different on every request
const ticketContext = "Customer plan: Enterprise. Other open tickets from this customer: 3.";

for await (const message of query({
  prompt: "Triage ticket 4821",
  options: {
    systemPrompt: [instructions, SYSTEM_PROMPT_DYNAMIC_BOUNDARY, ticketContext]
  }
})) {
  // ...
}
```

marker の前後を 2 つの text block として送り、それぞれに cache breakpoint を置く。片側の文字列は空行で結合、2 つ目の marker は除去、marker 文字列自体は Claude に届かない。CLI では `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` の行(v2.1.275+)。分割されるのは Claude API 直接か Claude Platform on AWS のみで、Bedrock / Vertex / Foundry / LLM gateway、`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` では 1 block。Python には array 形式がなく、大きなプロンプトは `system_prompt={"type": "file", "path": ...}` を使う。Python の文字列 `system_prompt` は argv に載るので Linux では約 128 KB で `Argument list too long`、Windows ではコマンドライン全体が約 32 KB で落ちる。

カスタム文字列プロンプトにする場合は preset にある「system reminder とは何か」の説明が消えるので、その一文を自分で足す。Claude に実際に届いたものを確認するには `OTEL_LOG_RAW_API_BODIES=file:<dir>` か `ANTHROPIC_BASE_URL` 背後のロギング gateway を使う(SDK のメッセージストリームには system reminder は含まれない)。組み込み文脈を切るノブ: settings `includeGitInstructions: false`(env `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS=1`)、`attribution: { commit: '', pr: '' }`、`CLAUDE_CODE_DISABLE_CLAUDE_MDS=1`、`CLAUDE_CODE_DISABLE_ATTACHMENTS=1`、`CLAUDE_CODE_DISABLE_FILE_MENTIONS=1`(v2.1.299+)。

CLAUDE.md は毎リクエスト再注入される(prompt cache される)ので、永続ルールは初期プロンプトではなく CLAUDE.md に置く。compaction は古いメッセージを要約に置き換えるので初期プロンプト内の指示は消えうる。auto-compaction は `compact_boundary`(`compact_metadata.pre_tokens` と trigger)を emit し、CLAUDE.md の "Summary instructions" セクション、PreCompact hook、`/compact` でカスタマイズできる。

### 8.5 権限モデル

#### 評価順序

1. hooks(PreToolUse)
2. deny rules
3. ask rules
4. permission mode
5. allow rules
6. `canUseTool` コールバック

この順序から導かれる帰結:

- 先の段階(allow rule、`acceptEdits`、`bypassPermissions`)で自動承認された呼び出しは `canUseTool` に一切到達しない。毎回検査したい処理は PreToolUse hook に置く。TS は `canUseTool` を `bypassPermissions` やベア名の `allowedTools` と併用すると process warning `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` を出す。
- deny rule は `bypassPermissions` でも勝つ。ベア名 deny(`Bash`)はツールをコンテキストから消し、スコープ付き deny(`Bash(rm *)`)はツールを見せたままにする(モデルが試して 1 ターン無駄にすることがある)。
- `allowedTools` は `bypassPermissions` を制限しない(未記載ツールも承認される)。制限したいなら `disallowedTools`。
- allow rule の glob はリテラルの `mcp__<server>__` 接頭辞の後でのみ有効。`['*']` や `['mcp__*']` は警告付きで無視される。
- `Edit(path)` ルールは Write / NotebookEdit も統制し、`Write(path)` は何にもマッチしない。`//path` は絶対パス、`/path` はルールのソース位置(SDK オプションなら cwd)起点。

`tools` / `allowedTools` / `disallowedTools` は別レイヤーで動く。`tools: [...]` とベア名 `disallowedTools` は「可用性」(コンテキストから除去。`tools: []` は組み込みを全部外し MCP ツールだけにする)、`allowedTools` とスコープ付き `disallowedTools` は「権限」を変える。Python の `tools` は `{"type": "preset", "preset": "claude_code"}` も受け付ける。読み取り系(Read、Glob、Grep、`readOnlyHint` 付き MCP ツール)は並列実行、Edit / Write / Bash / カスタムツールはデフォルト逐次。

#### permissionMode

`default` / `acceptEdits` / `plan` / `dontAsk` / `auto` / `bypassPermissions`。

- TS 0.3.286 から、`permissionMode` 省略は `default` と同義ではなくなり、設定次第で `auto` モードで始まる。auto モードで始まったセッションはベア `Bash` のような広い allow rule を落とす。0.3.302 では「サードパーティプロバイダ、テレメトリ無効、またはフレッシュインストールでは省略時に `default` で始まる。auto を維持するなら `permissionMode: 'auto'` を渡す」に変わった。依存があるならモードを明示する。
- `bypassPermissions` は TS で `allowDangerouslySkipPermissions: true` も必要。Unix で root / sudo として、認識されたサンドボックス外では起動を拒否する。`allowDangerouslySkipPermissions: true` + `permissionMode: 'plan'` は edit を引き続き `canUseTool` に送り、後からの bypass への切替を許すだけ。
- `dontAsk` は `canUseTool` を呼ばず、AskUserQuestion、`requiresUserInteraction` な MCP ツール、org-ask コネクタツール、ネットワークパス読み取り、重要パスの rm を deny する。
- `plan` はファイル編集と(v2.1.212+)ファイル変更系シェルコマンドを allow rule に関係なく `canUseTool` に回す。
- `acceptEdits` は Edit / Write と cwd または `additionalDirectories` 内の mkdir / touch / rm / rmdir / mv / cp / sed だけを自動承認し、MCP ツールは自動承認しない(`allowedTools: ['mcp__server__*']` を使う)。
- subagent への継承: `AgentDefinition.permissionMode` は親が `default` / `dontAsk` / `plan` のときだけ適用され、`bypassPermissions` は親がそのモードでない限り subagent に適用されない(v2.1.267+)。
- auto モードはモデル依存。`setModel` / `applyFlagSettings` で非対応モデルに切り替えると `default` に落ち、`system` subtype `status` に `permissionMode: 'default'` を載せた `SDKStatusMessage` が出る。対応モデルが有効になるまで `set_permission_mode('auto')` は `Cannot set permission mode to auto: auto mode unavailable for this model` で失敗(v2.1.299+)。
- TS `permissionPrompts: 'none'`(v2.1.259+)はプロンプトが出るはずの呼び出しを、PermissionRequest hook に機会を与えた後に全部 deny する。

#### canUseTool

TS: `(toolName, input, { signal, suggestions?, blockedPath?, mcpServer?, decisionReason?, defaultToNo?, suppressAlwaysAllowRule?, toolUseID, agentID?, requestId }) => Promise<PermissionResult | null>`。`mcpServer` は 0.3.274、`defaultToNo` / `suppressAlwaysAllowRule` は 0.3.268、`requestId` と `null` 返却は Claude Code v2.1.199 が必要。`null` は、自前チャネルで `requestId` を echo した `control_response` を既に送った場合にのみ返してよく、それ以外で `null` を返すと permission prompt はタイムアウトしないのでツール呼び出しは永久にブロックされる。

Python: `(tool_name, input_data, context: ToolPermissionContext) -> PermissionResultAllow | PermissionResultDeny`。

```python
@dataclass
class ToolPermissionContext:
    signal: Any | None = None  # Future: abort signal support
    suggestions: list[PermissionUpdate] = field(default_factory=list)
    tool_use_id: str | None = None
    agent_id: str | None = None
    blocked_path: str | None = None
    decision_reason: str | None = None
    title: str | None = None
    display_name: str | None = None
    description: str | None = None
```

`title`("Claude wants to read foo.txt")、`display_name`("Read file")、`description` は UI にそのまま出せるプロンプト文。`decision_reason` は PreToolUse hook が `ask` を返したときの理由。

```typescript
canUseTool: async (toolName, input, { suggestions = [] }) => {
  const choice = await askUser(`Allow ${toolName}?`, ["once", "always", "no"]);

  if (choice === "always") {
    const persist = suggestions.filter(
      (s) => s.destination === "localSettings"
    );
    return {
      behavior: "allow",
      updatedInput: input,
      updatedPermissions: persist
    };
  }
  if (choice === "once") {
    return { behavior: "allow", updatedInput: input };
  }
  return { behavior: "deny", message: "User declined" };
};
```

承認と「今後も許可」の実装。`suggestions` を `destination: 'localSettings'` で echo するとルールが永続化される。Python は `PermissionResultAllow(updated_input=input_data, updated_permissions=[s for s in context.suggestions if s.destination == "localSettings"])`(>= 0.1.80)。`updatedInput` は v2.1.207 から省略可(以前は省略すると validation error で deny)。deny は `interrupt: true` を付けられる。

`AskUserQuestion` も `toolName: 'AskUserQuestion'` として `canUseTool` に流れてくる。1 から 4 問、各 2 から 4 択。`updatedInput: { questions: <元のまま>, answers: { <質問文>: <ラベル | 配列 | ', ' 結合> }, response? }` で allow を返す。subagent 内では使えない。TS `toolConfig.askUserQuestion.previewFormat: 'markdown' | 'html'` で選択肢プレビューを付けられる。

人間承認が長時間かかる場合、`canUseTool` を pending のまま放置するより、PreToolUse hook で `permissionDecision: 'defer'` を返す方がよい。ターンは `stop_reason: 'tool_deferred'` で終わり、後で resume する。`Notification` hook は `canUseTool` で約 6 秒待った permission request に対して `permission_prompt` を発火する(TS >= 0.3.233 / Py >= 0.2.139)ので、Slack / pager 通知の置き場所になる。

```python
import asyncio

from claude_agent_sdk import ClaudeAgentOptions, ResultMessage, query
from claude_agent_sdk.types import (
    HookMatcher,
    PermissionResultAllow,
    PermissionResultDeny,
    ToolPermissionContext,
)


async def can_use_tool(
    tool_name: str, input_data: dict, context: ToolPermissionContext
) -> PermissionResultAllow | PermissionResultDeny:
    # Display the tool request
    print(f"\nTool: {tool_name}")
    if tool_name == "Bash":
        print(f"Command: {input_data.get('command')}")
        if input_data.get("description"):
            print(f"Description: {input_data.get('description')}")
    else:
        print(f"Input: {input_data}")

    # Get user approval
    response = input("Allow this action? (y/n): ")

    # Return allow or deny based on user's response
    if response.lower() == "y":
        # Allow: tool executes with the original (or modified) input
        return PermissionResultAllow(updated_input=input_data)
    else:
        # Deny: tool doesn't execute, Claude sees the message
        return PermissionResultDeny(message="User denied this action")


# Required workaround: dummy hook keeps the stream open for can_use_tool
async def dummy_hook(input_data, tool_use_id, context):
    return {"continue_": True}


async def prompt_stream():
    yield {
        "type": "user",
        "message": {
            "role": "user",
            "content": "Create a test file in /tmp and then delete it",
        },
    }


async def main():
    async for message in query(
        prompt=prompt_stream(),
        options=ClaudeAgentOptions(
            can_use_tool=can_use_tool,
            hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[dummy_hook])]},
        ),
    ):
        if isinstance(message, ResultMessage) and message.subtype == "success":
            print(message.result)


asyncio.run(main())
```

Python 公式ページ(user-input)が今も掲載している "dummy hook" パターン。ただし Python CHANGELOG 0.2.140 は「`can_use_tool` が文字列プロンプトでも動くようになり、stdin は permission request を受けるため開いたままになる」と記しているため、この回避策は現在は必須ではない可能性が高い。公式ページの記述としてそのまま示すが、新規コードではまず hook なしで試す。

#### Programmatic hooks

```typescript
import { query, HookCallback, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";

// Define a hook callback with the HookCallback type
const protectEnvFiles: HookCallback = async (input, toolUseID, { signal }) => {
  // Cast input to the specific hook type for type safety
  const preInput = input as PreToolUseHookInput;

  // Cast tool_input to access its properties (typed as unknown in the SDK)
  const toolInput = preInput.tool_input as Record<string, unknown>;
  const filePath = toolInput?.file_path as string;
  const fileName = filePath?.split("/").pop();

  // Block the operation if targeting a .env file
  if (fileName?.toLowerCase() === ".env") {
    return {
      hookSpecificOutput: {
        hookEventName: preInput.hook_event_name,
        permissionDecision: "deny",
        permissionDecisionReason: "Cannot modify .env files"
      }
    };
  }

  // Return empty object to allow the operation
  return {};
};

for await (const message of query({
  prompt: "Create a .env file with the standard local development database configuration",
  options: {
    hooks: {
      // Register the hook for PreToolUse events
      // The matcher filters to only Write and Edit tool calls
      PreToolUse: [{ matcher: "Write|Edit", hooks: [protectEnvFiles] }]
    }
  }
})) {
  // Filter for assistant and result messages
  if (message.type === "assistant" || message.type === "result") {
    console.log(message);
  }
}
```

`.env` への書き込みを deny する PreToolUse hook。Python は `hooks={"PreToolUse": [HookMatcher(matcher="Write|Edit", hooks=[protect_env_files])]}` で、コールバックは `{"hookSpecificOutput": {"hookEventName": input_data["hook_event_name"], "permissionDecision": "deny", "permissionDecisionReason": "..."}}` か `{}` を返す。matcher はツール名にマッチし、ファイルパスにはマッチしない。

仕組みのポイント:

- 返却: `{}` で許可。`hookSpecificOutput.permissionDecision` は `allow` / `deny` / `ask` / `defer`、`permissionDecisionReason`、`updatedInput`(0.3.300 から検証され未知キーは落とされる。`canUseTool` の `updatedInput` は対象外)。PostToolUse は `additionalContext`、`updatedToolOutput`(任意のツール)、`updatedMCPToolOutput`(MCP のみ、旧)、`classifierContext`(TS >= 0.3.236、auto モード分類器向けの短い同期メモ)。
- 複数 PreToolUse の決定は deny > defer > ask > allow。hook は並列実行。
- デフォルトタイムアウト: 多くのイベントで 600 秒、UserPromptSubmit / PreModelSwitch / PostModelSwitch は 30 秒、MessageDisplay は 10 秒、SessionEnd は 1.5 秒。PreToolUse がタイムアウトするとツール呼び出しはブロックされ理由が tool result に入る(v2.1.210+)。UserPromptSubmit のタイムアウトはプロンプトをブロック、Stop / SubagentStop のタイムアウトは「決定なし」扱い(v2.1.273 以前は他 hook の決定を破棄していた)、PreModelSwitch は切替をブロック。
- 副作用だけの hook は `{ async: true, asyncTimeout }`(Python は `async_`)で非同期化。Python は `continue` の代わりに `continue_`。
- hook は subagent 内でも発火し `agent_id` / `agent_type` が付く(Python では PreToolUse / PostToolUse / PostToolUseFailure / PermissionRequest で optional、SubagentStart / SubagentStop で必須)。
- settings.json の filesystem hook とプログラム hook は併走する。
- イベントのパリティ差: Python は PreToolUse、PostToolUse、PostToolUseFailure、UserPromptSubmit、Stop、SubagentStart、SubagentStop、PreCompact、Notification、PermissionRequest の 10 種のみ。TS はさらに SessionStart、SessionEnd、Setup、PostToolBatch、UserPromptExpansion、MessageDisplay、StopFailure、PostCompact、PreModelSwitch、PostModelSwitch、PermissionDenied、TeammateIdle、TaskCreated、TaskCompleted、Elicitation、ElicitationResult、ConfigChange、InstructionsLoaded、WorktreeCreate / WorktreeRemove、CwdChanged、FileChanged、DirectoryAdded の 23 種。Python で SessionStart / SessionEnd が必要なら `setting_sources` 経由の settings.json コマンド hook にするか、`receive_response()` の最初のメッセージを init トリガーにする。

### 8.6 カスタムツール(in-process MCP)と外部 MCP

#### in-process MCP サーバー

```typescript
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

// Define a tool: name, description, input schema, handler
const getTemperature = tool(
  "get_temperature",
  "Get the current temperature at a location",
  {
    latitude: z.number().describe("Latitude coordinate"), // .describe() adds a field description Claude sees
    longitude: z.number().describe("Longitude coordinate")
  },
  async (args) => {
    // args is typed from the schema: { latitude: number; longitude: number }
    const response = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${args.latitude}&longitude=${args.longitude}&current=temperature_2m&temperature_unit=fahrenheit`
    );
    const data: any = await response.json();

    // Return a content array - Claude sees this as the tool result
    return {
      content: [{ type: "text", text: `Temperature: ${data.current.temperature_2m}°F` }]
    };
  }
);

// Wrap the tool in an in-process MCP server
const weatherServer = createSdkMcpServer({
  name: "weather",
  version: "1.0.0",
  tools: [getTemperature]
});

// Use it
import { query } from "@anthropic-ai/claude-agent-sdk";

for await (const message of query({
  prompt: "What's the temperature in San Francisco?",
  options: {
    mcpServers: { weather: weatherServer },
    allowedTools: ["mcp__weather__get_temperature"]
  }
})) {
  // "result" is the final message after all tool calls complete
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

`tool(name, description, zodShape, handler, extras?)` + `createSdkMcpServer({ name, version?, instructions?, tools?, alwaysLoad?, timeout? })`。`timeout` は 0.3.248 から、1000 ms 以上。ハンドラはホストプロセス内で動くのでサブプロセスを立てずに自前コードを呼べる。

```python
from typing import Annotated, Any
import httpx
from claude_agent_sdk import tool, create_sdk_mcp_server


# Define a tool: name, description, input schema, handler
@tool(
    "get_temperature",
    "Get the current temperature at a location",
    {
        "latitude": Annotated[float, "Latitude coordinate"],
        "longitude": Annotated[float, "Longitude coordinate"],
    },
)
async def get_temperature(args: dict[str, Any]) -> dict[str, Any]:
    async with httpx.AsyncClient() as client:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": args["latitude"],
                "longitude": args["longitude"],
                "current": "temperature_2m",
                "temperature_unit": "fahrenheit",
            },
        )
        data = response.json()

    # Return a content array - Claude sees this as the tool result
    return {
        "content": [
            {
                "type": "text",
                "text": f"Temperature: {data['current']['temperature_2m']}°F",
            }
        ]
    }


# Wrap the tool in an in-process MCP server
weather_server = create_sdk_mcp_server(
    name="weather",
    version="1.0.0",
    tools=[get_temperature],
)

# Use it
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, ResultMessage


async def main():
    options = ClaudeAgentOptions(
        mcp_servers={"weather": weather_server},
        allowed_tools=["mcp__weather__get_temperature"],
    )

    async for message in query(
        prompt="What's the temperature in San Francisco?",
        options=options,
    ):
        # ResultMessage is the final message after all tool calls complete
        if isinstance(message, ResultMessage) and message.subtype == "success":
            print(message.result)


asyncio.run(main())
```

Python は `@tool(name, description, input_schema, annotations=None)` + `create_sdk_mcp_server(name, version='1.0.0', tools=None)`。スキーマは簡易 dict(`{"lat": float}`)、`Annotated[type, 'desc']`、完全な JSON Schema dict(enum / optional / range が必要なら必須)、`NotRequired` 付き TypedDict の 4 形式。

名前解決と出力の仕様:

- 完全名は `mcp__{server_key}__{tool_name}`。キーの `.` や空白は `_` に置換(`my.server` は `mcp__my_server__list_issues`)。`mcp__weather__*` のワイルドカード可。
- ハンドラの返値は `{ content: [...], structuredContent?, isError? }`。Python は `content` と `is_error` しか転送せず(`structuredContent`、バイナリ `resource.blob`、audio block は警告付きで破棄)、`structuredContent` が必要なら standalone MCP サーバーにする。TS では `structuredContent` を返すと Claude には JSON と image / resource block だけが渡り、`content` の text block は重複とみなされ転送されない。TS の audio block はディスクに保存されパスが渡る。
- `readOnlyHint` annotation を付けると並列実行される。Python `ToolAnnotations` は snake_case のヒント名も受け、`maxResultSizeChars`(0.2.140+、最大 500,000)で 1 ツールのインライン結果上限を上げられる。
- TS `extras.alwaysLoad: true` または `createSdkMcpServer({ alwaysLoad: true })` で tool search の遅延対象から外す。`extras.searchHint` は遅延リストに出る 1 行の説明。Zod スキーマが JSON Schema に変換できないツールは process warning `CLAUDE_SDK_MCP_TOOL_SCHEMA_UNCONVERTIBLE` 付きで落とされる(0.3.286 以前はサーバー全体がツール 0 件になっていた)。
- 0.3.301 から sdk 型 MCP サーバー設定のツールごとに `permission_policy`(`always_ask` | `always_deny`)を付けられ、`initialize` と `setMcpServers()` で適用される。
- 0.3.282 で `@anthropic-ai/claude-agent-sdk/core` エントリポイントが追加され、自分でインストールした zod / MCP SDK を使う。

#### 外部 MCP サーバー

設定の型は stdio `{ command, args, env }`、sse `{ type: 'sse', url, headers }`、http `{ type: 'http', url, headers }`(`streamable-http` は JSON ファイルでのみ受理、SDK 型では不可)、sdk `{ type: 'sdk', name, instance }`(TS は `timeout?` も)。TS の型定義には `claudeai-proxy`(`{ type, url, id }`)もある。

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/Users/me/projects"]
    },
    "secure-api": {
      "type": "http",
      "url": "https://api.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

プロジェクト直下の `.mcp.json`。project setting source が有効なときだけ読まれ、`${VAR}` は実行時に展開される。コードで渡す場合(TS)は `mcpServers: { github: { type: "http", url: "https://api.githubcopilot.com/mcp/", headers: { Authorization: \`Bearer ${process.env.GITHUB_TOKEN}\` } } }, allowedTools: ["mcp__github__list_issues"]`。`strictMcpConfig` は `.mcp.json`、user settings、plugin サーバー、claude.ai コネクタを無視する。

接続と出力の挙動:

- init の `mcp_servers[].status` は `pending` / `connected` / `failed` / `needs-auth` / `disabled`。`pending` は失敗ではない(キャッシュ済みツールリストか接続中)。
- 最初のターンの待ち: `options.mcpServers` に stdio / HTTP / SSE があると `MCP_TIMEOUT`(デフォルト 30 秒)までブロック。settings ファイルや plugin 由来の pending サーバーに対する待ちは、`options.mcpServers` が空か SDK サーバーのみなら 2 秒(in-process SDK サーバー自体の接続とツール列挙は `MCP_TIMEOUT` まで待つ)。`CLAUDE_CODE_MCP_STARTUP_WAIT_MS`(v2.1.274+)で上書き。0.3.142 から MCP 接続はデフォルトで background(`MCP_CONNECTION_NONBLOCKING=0` で接続バッチ全体をブロック、上限 5 秒、`MCP_CONNECT_TIMEOUT_MS` で調整)。`MCP_TOOL_TIMEOUT` は実行中ツール呼び出しの上限。`permissionPromptToolName` のサーバーと `alwaysLoad: true` のサーバーは起動時にツール到着を待つ。
- 対話的 OAuth は走らない。自分で OAuth を完了して Bearer ヘッダを渡す。
- 出力が 25,000 トークン(`MAX_MCP_OUTPUT_TOKENS`)または 50,000 文字を超えるとファイルに保存されパスに置き換わる。MCP `structuredContent` は JSON 1,048,576 文字超で落とされ `structuredContentOmitted: true` になる(in-process SDK サーバーは対象外)。
- リモートサーバーが 5 回再接続に失敗すると `failed` / `needs-auth` になるので `reconnectMcpServer()` / `reconnect_mcp_server()` を呼ぶ。`toggleMcpServer()` は `setMcpServers` で追加したサーバーに v2.1.285、in-process SDK サーバーに v2.1.286 が必要。
- MCP の description 上限は 0.3.296 で 2,048 から 4,096 文字に、tool search 経由では 16,384 文字(0.3.295+)。

#### Tool search

tool search はデフォルト ON で、MCP / SDK ツールのスキーマを遅延ロードする。`ENABLE_TOOL_SEARCH` は unset / `true` / `auto` / `auto:N` / `false`。`auto` は遅延可能な定義のトークン数がコンテキストウィンドウの 10% に達したら有効化(`auto:5` で 5%)。1 回の検索で最大 5 ツール(デフォルト)、カタログ上限 10,000 ツール。`disallowedTools` で ToolSearch を外すと tool search 自体が切れる。自動的に無効になる条件: first-party でない `ANTHROPIC_BASE_URL`、Opus 4 / Sonnet 4 より前のモデル、Azure-hosted Foundry、`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`(v2.1.227+ は managed settings で維持可)/ HIPAA 構成。Vertex では Opus 4.5 / Sonnet 4.5 / Haiku 4.5 が下限(v2.1.221 以前は Vertex 全モデルで無効)。無効化されると全 MCP スキーマが毎ターン載る。目安として 50 ツールで 10 から 20K トークン、30 から 50 ツールを超えると選択精度が落ちる。

### 8.7 Subagents と Workflow

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

try {
  for await (const message of query({
    prompt: "Audit every service in this repo for unhandled promise rejections",
    options: {
      allowedTools: ["Read", "Grep", "Glob", "Agent"],
      agents: {
        "code-reviewer": {
          description: "Expert code review specialist. Use for quality, security, and maintainability reviews.",
          prompt: "You are a code review specialist with expertise in security, performance, and best practices.",
          tools: ["Read", "Grep", "Glob"],
          model: "sonnet"
        }
      },
      // env replaces the subprocess environment, so spread process.env to keep PATH
      env: {
        ...process.env,
        CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1",
        CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS: "5",
      },
      maxBudgetUsd: 5,
    },
  })) {
    if (message.type === "result") {
      console.log(`${message.subtype}: $${message.total_cost_usd}`);
    }
  }
} catch (error) {
  // A single-shot query() throws after yielding an error result,
  // so the budget-capped result has already been logged above.
  console.error(`Session ended with an error: ${error}`);
}
```

subagents ページの `AgentDefinition` 例と上限例の合成。Python は `AgentDefinition(description=..., prompt=..., tools=[...], model="sonnet")`、`env={...}`、`max_budget_usd=5.0`。

`AgentDefinition` の必須は `description` と `prompt`。任意: `tools`、`disallowedTools`、`model`(alias / `'inherit'` / 完全 ID)、`skills`(preload)、`memory`、`mcpServers`、`initialPrompt`、`maxTurns`、`autoCompactWindow`(TS >= 0.3.296)、`background`、`omitClaudeMd`(TS >= 0.3.271)、`effort`、`permissionMode`、`criticalSystemReminder_EXPERIMENTAL`(TS)。Python の `AgentDefinition` は `ClaudeAgentOptions` と違い camelCase(`disallowedTools`、`permissionMode`、`maxTurns`)で、snake_case は TypeError。Python には `autoCompactWindow` と `omitClaudeMd` がない。

挙動:

- プログラム定義の agent は同名の `.claude/agents/` を上書きする。`allowedTools` に `Agent` を含める。
- subagent は v2.1.198 からデフォルト background 実行。fork でない subagent は新鮮なコンテキスト(自分の prompt + Agent ツールのプロンプト + プロジェクト CLAUDE.md + ツール定義)で始まり、親の履歴も親のシステムプロンプトも持たない。TS 0.3.302 で fork subagent(`subagent_type: "fork"`)がデフォルト ON になり、`CLAUDE_CODE_FORK_SUBAGENT=0` で無効化できる。fork デフォルトと `AgentDefinition` 各フィールド(`omitClaudeMd`、`tools` など)の相互作用は changelog にしか記述がない(未検証)。
- subagent 内のメッセージは `parent_tool_use_id`(TS では `agent_id` も、>= 0.3.292)を持つ。ツールは tool_use block では `Agent`、init の tools リストでは `Task` として現れるので両方にマッチさせる。Agent ツール結果の `tool_use_result` は `AgentOutput` 型で、テキストを parse せずそこから描画する。
- subagent の再開は Agent ツール結果から `agentId: <id>` を取り出して同じセッションを resume する。組み込みの Explore / Plan は one-shot で `agentId` を返さない。`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` で general-purpose を外す。
- v2.1.210 から subagent の最終メッセージはスキャンされ、制御タグの模倣はバックスラッシュで無害化される。
- 上限: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`(デフォルト 3、`1` でネスト禁止)、`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`(デフォルト 20、超過で `Concurrent subagent limit reached`)、`maxBudgetUsd`。TS >= 0.3.219 / Py >= 0.2.127。subagent ごとの wall-clock deadline は存在せず、`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` はストール監視であって総実行時間の上限ではない(hosting ページの Known limitations)。
- Opus 5 は委譲しやすく、`claude_code` preset は Opus 5 で「頼まれない限り Agent を呼ぶな」の一文を足すが、カスタムプロンプトには付かない。
- `forwardSubagentText`(TS、Py >= 0.2.140)で subagent の text / thinking block を `parent_tool_use_id` 付きメッセージとして転送できる。token 単位の delta は subagent からは転送されない。

数十から数百の agent を回すなら `Workflow` ツール(TS >= 0.3.149、`allowedTools` に `Workflow`)。返値は `{ status: "async_launched" | "remote_launched"; taskId; taskType?; workflowName?; runId?; summary?; transcriptDir?; scriptPath?; sessionUrl?; warning?; error? }` で即時に返る。構文エラーのスクリプトでも `async_launched` で返るので `error` を確認する。`scriptPath` を使うにはセッションのツールに `Read` が要る。`args` は JSON 文字列ではなく実際の JSON 値。`resumeFromRunId` で同一セッション内 run を `agent()` 結果キャッシュ付きで再開できる。Agent teams(共有タスクリストと inter-agent メッセージによる複数インスタンス協調)は CLI 機能で、SDK オプションからは直接設定できない。SDK のマルチエージェント primitive は `agents` と Workflow の 2 つ。

### 8.8 セッション: resume、fork、SessionStore、checkpointing

#### 基本

- `continue: true`(TS)/ `continue_conversation=True`(Py)は cwd の最新セッションを再開。`resume: <id>` で特定セッション。`forkSession: true` + `resume` で新 ID に分岐。`resumeSessionAt` + `resumeDropsTurn` で再開時に切り詰め(Py 0.2.137、`resume_drops_turn` は v2.1.223)。`persistSession: false`(TS のみ)でメモリ内のみ。Python の代替は `env` に `CLAUDE_CODE_SKIP_PROMPT_HISTORY` を設定して transcript 書き込みを抑止する。
- セッションファイルは `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl`(`CLAUDE_CONFIG_DIR` 設定時は `$CLAUDE_CONFIG_DIR/projects/`)。cwd は英数字以外を `-` に置換、200 文字で切ってハッシュ付加。v2.1.223 から resume は現在のプロジェクトディレクトリ外も探す(同一マシンのみ)。`CLAUDE_CODE_PROJECT_DIR_NAME`(TS >= 0.3.234 / Py >= 0.2.140)でディレクトリ名を固定。
- ヘルパー: TS `listSessions`、`getSessionMessages`、`getSessionInfo`、`renameSession`、`tagSession`、`forkSession`。Python `list_sessions`、`get_session_messages`、`get_session_info`、`rename_session`、`tag_session`、`fork_session`(同期、`up_to_message_id` / `title` 付き)。

```typescript
function forkSession(
  sessionId: string,
  options?: ForkSessionOptions
): Promise<ForkSessionResult>;
```

standalone の fork ヘルパー。`{ dir?, upToMessageId?, title? }` で途中のメッセージから分岐でき、`{ sessionId }` を `resume` に渡す。fork には元のファイル checkpoint は含まれない。非 UUID、存在しないセッション、空 transcript、不明な `upToMessageId` で throw(Python は ValueError / FileNotFoundError)。

セッションが永続化するのは会話であってファイルシステムではない。ファイル状態は file checkpointing で扱う。

#### SessionStore(外部ストレージへのミラー)

```typescript
// Exported from @anthropic-ai/claude-agent-sdk as
// SessionStore, SessionKey, SessionStoreEntry, SessionSummaryEntry.

type SessionKey = {
  projectKey: string;
  sessionId: string;
  subpath?: string;
};

type SessionStore = {
  // Required
  append(key: SessionKey, entries: SessionStoreEntry[]): Promise<void>;
  load(key: SessionKey): Promise<SessionStoreEntry[] | null>;

  // Optional
  listSessions?(
    projectKey: string,
  ): Promise<Array<{ sessionId: string; mtime: number }>>;
  listSessionSummaries?(projectKey: string): Promise<SessionSummaryEntry[]>;
  delete?(key: SessionKey): Promise<void>;
  listSubkeys?(key: {
    projectKey: string;
    sessionId: string;
  }): Promise<string[]>;
};

// Quick start
import { query, InMemorySessionStore } from "@anthropic-ai/claude-agent-sdk";

const store = new InMemorySessionStore();

let sessionId: string | undefined;
try {
  for await (const message of query({
    prompt: "List the TypeScript files under src/",
    options: { sessionStore: store },
  })) {
    if (message.type === "result") {
      sessionId = message.session_id;
    }
  }
} catch (error) {
  console.error(`Session ended with an error: ${error}`);
}

// Resume from the store. The agent has full context from the first call.
for await (const message of query({
  prompt: "Summarize what those files do",
  options: { sessionStore: store, resume: sessionId },
})) {
  if (message.type === "result" && message.subtype === "success") {
    console.log(message.result);
  }
}
```

`sessionStore` / `session_store` アダプタは JSONL transcript を自前バックエンドにミラーする。Python は `from claude_agent_sdk import InMemorySessionStore` と `ClaudeAgentOptions(session_store=store, resume=session_id)`。

設計上の要点:

- dual-write: CLI は常にローカルディスクに先に書く。ストアから resume した run は終了時にローカルコピーを削除するので、ストアが唯一の永続コピーになる。
- `SessionKey.subpath` は `subagents/agent-<id>`。元の run と同じ cwd から resume する。
- 参照アダプタ(S3、Redis、Postgres)は両リポジトリの `examples/` にあり、パッケージには含まれない。適合テストは TS `examples/session-stores/shared/conformance.ts`、Python `claude_agent_sdk.testing.run_session_store_conformance`。
- ミラー書き込みは best-effort で最大 3 回試行、失敗すると `{ type: 'system', subtype: 'mirror_error' }` が流れてそのバッチは破棄される。タイムアウトした append は再試行されない。`entry.uuid` で重複排除する。
- `persistSession: false` および file checkpointing とは併用不可(起動時に throw)。`continue: true` はストアに `listSessions` がないと throw。`forkSession({ sessionStore })` はバイトコピーでなく sessionId / UUID を書き換える。
- ストアからの resume は一時 `CLAUDE_CONFIG_DIR` に credentials / `.claude.json`(TS >= 0.3.222 では user `settings.json` も。ただし `enabledPlugins`、`extraKnownMarketplaces`、`additionalMarketplaces`、`env.CLAUDE_CONFIG_DIR` は除去)を seed する。Python は settings.json をコピーしないので、user settings の `apiKeyHelper` に依存していると `Not logged in` で失敗する。
- Python 固有: `session_store_flush: 'batched' | 'eager'`(デフォルト batched)、`load_timeout_ms`(デフォルト 60000)。ストア系ヘルパーは `_from_store` / `_via_store` サフィックス。

#### File checkpointing

`enableFileCheckpointing: true` + `extraArgs: { 'replay-user-messages': null }`(Python `extra_args={"replay-user-messages": None}`)で user message の UUID を受け取り、ストリームが開いている間に `rewindFiles(uuid)` / `rewind_files(uuid)` を呼ぶか、空プロンプトでセッションを resume してループ内から rewind する。イテレータ終了後に呼ぶと `ProcessTransport is not ready for writing`。追跡対象は Write / Edit / NotebookEdit のみで、Bash による書き込みと subagent の編集(foreground の `context: fork` skill を除く)は追跡されない。rewind はファイルを戻すだけで会話は戻さない。symlink / hard link はスキップされ `RewindFilesResult.skippedLinks` に数えられる(v2.1.216+)。TS は `{ dryRun: true }` 可。CLI 同等は `CLAUDE_CODE_ENABLE_SDK_FILE_CHECKPOINTING=true claude -p --resume <id> --rewind-files <uuid>`。

### 8.9 ストリーミング出力と構造化出力

#### 部分メッセージ

`includePartialMessages` / `include_partial_messages` で生の API stream event が流れる(TS `SDKPartialAssistantMessage` type `'stream_event'`、Python `claude_agent_sdk.types.StreamEvent`)。テキスト delta は `content_block_delta` の `delta.type === 'text_delta'`、ツール入力は `input_json_delta.partial_json`。順序は `StreamEvent(message_start)` ... `AssistantMessage`(完成 block。その block の `content_block_stop` より前に届く)... `ResultMessage`。stream event はメインセッションのみ。構造化出力の JSON は未検証の `input_json_delta` として流れ、検証済みの結果だけが `structured_output` に入る。v2.1.290(TS >= 0.3.290、Py >= 0.2.164)から切断されたストリームでも `message_stop` は届くが、切断された tool_use block には `content_block_stop` が来ないので未完了として扱う。

#### 構造化出力

```typescript
import { z } from "zod";
import { query } from "@anthropic-ai/claude-agent-sdk";

// Define schema with Zod
const FeaturePlan = z.object({
  feature_name: z.string(),
  summary: z.string(),
  steps: z.array(
    z.object({
      step_number: z.number(),
      description: z.string(),
      estimated_complexity: z.enum(["low", "medium", "high"])
    })
  ),
  risks: z.array(z.string())
});

type FeaturePlan = z.infer<typeof FeaturePlan>;

// Convert to JSON Schema using the draft-07 target the SDK expects
const schema = z.toJSONSchema(FeaturePlan, { target: "draft-7" });

// Use in query
try {
  for await (const message of query({
    prompt:
      "Plan how to add dark mode support to a React app. Break it into implementation steps.",
    options: {
      outputFormat: {
        type: "json_schema",
        schema: schema
      }
    }
  })) {
    if (message.type === "result" && message.subtype === "success" && message.structured_output) {
      // Validate and get fully typed result
      const parsed = FeaturePlan.safeParse(message.structured_output);
      if (parsed.success) {
        const plan: FeaturePlan = parsed.data;
        console.log(`Feature: ${plan.feature_name}`);
      }
    }
  }
} catch (error) {
  console.error(`Session ended with an error: ${error}`);
}
```

`outputFormat: { type: 'json_schema', schema }`。Python は `output_format={"type": "json_schema", "schema": FeaturePlan.model_json_schema()}` と `FeaturePlan.model_validate(message.structured_output)`。SDK は JSON Schema draft-07 で検証するので、Zod のデフォルト(2020-12)は `target: "draft-7"` に変える。無効なスキーマは起動時に失敗(v2.1.205+。以前は無言で無視)。`format` キーワードは注釈扱い。失敗 subtype は `error_max_structured_output_retries` だが、`success` で `structured_output` がないケースも失敗として扱う。モデル fallback 中に完成した出力が取り消されることがあるので `errors` を確認する。0.3.302 で「API が応答を refuse した場合に `structured_output` として渡していた問題」が修正され、payload なしのエラーになる。

### 8.10 Skills と Plugins

Skills は filesystem のみ(`.claude/skills/<name>/SKILL.md`、`~/.claude/skills/`、リポジトリルートまでの親ディレクトリ、`additionalDirectories` / `add_dirs`)でプログラム登録 API はない。`skills` オプションは `'all'` | `[names]` | `[]` で、指定すると `Skill` ツールが `allowedTools` に自動追加される(`tools` も渡すなら `'Skill'` を含める)。名前は厳密一致(`docs:*` のようなワイルドカードは拒否、TS >= 0.3.221 / Py >= 0.2.129)。`setting_sources=[]` は `skills: 'all'` でも skill を無効化する(user / project ソースが要る)。プロンプト中の `/<name>` ディスパッチは `skills` allowlist に関係なく user-invocable skill を実行する。init の `skills` / `slash_commands` は user-invocable なものだけを列挙。未知の `/name` はエラーにならず注記付きでモデルに送られる(v2.1.274+)。`/compact` は `compact_boundary` を emit、`/clear` はコンテキストとコスト合計をリセット(ストリーミングモードでのみ意味がある)。Plugin skill は `/plugin-name:skill-name`。

Plugins はローカルパスのみ: `plugins: [{ type: 'local', path }]`(`type` は `local` のみ)。相対パスは cwd 基準、チルダは展開されない、存在しないパスは無言でスキップ。init の `plugins` と `plugin_errors`(inline の失敗は `inline[0]` のような位置タグ)で確認する。Marketplace plugin は先にダウンロードする(CLI でインストールしたものは `~/.claude/plugins/`)。plugin root は `skills/`、`agents/`、`hooks/`、`commands/`、`.claude-plugin/` の親で、`plugin.json` は任意。0.3.301 で `Query.reloadPlugins({ addPlugins })` が追加され実行中セッションに plugin フォルダを追加できるが、typescript.md リファレンスは今も `reloadPlugins({ holdOnCacheImpact })` しか記載していない(changelog のみ)。plugin 提供 MCP サーバーのツール名はサーバーセグメントに `plugin_` 接頭辞が付く。

Task 追跡ツール(TaskCreate / TaskUpdate / TaskList / TaskGet、`CLAUDE_CODE_ENABLE_TASKS=0` で TodoWrite)は v2.1.268 から Opus 4.7、Sonnet 4.6、Haiku 4.5 およびそれ以前のモデルでのみデフォルト有効。他モデルでは `allowedTools` / `tools` に Task ツール名を書くか `env` に `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`。割り当てられた task id は `tool_use_result`(`TaskCreateOutput { task: { id, subject } }`)にしかない。Claude Code は `id` / `task_id` を `taskId` に、`active_form` を `activeForm` に実行前に修復するが、ストリームには生のモデル入力が流れるので TaskUpdate のフィールドは防御的に読む。

### 8.11 コスト計測と観測性

#### コストの読み方

`total_cost_usd` / `costUSD` はビルド時に同梱された価格表によるクライアント側推定で、請求データではない(`usage.inference_geo === 'us'` では 1.1 倍のデータレジデンシー係数、TS >= 0.3.239 / Py >= 0.2.144)。エンドユーザーへの課金や金銭的判断には使わない。`usage` はメインループのみ、`total_cost_usd` と `modelUsage` / `model_usage` は subagent を含む(permission classifier やトークンカウント要求のような helper call は除く)。`ModelUsage` のフィールドは `inputTokens`、`outputTokens`、`thinkingTokens?`(TS >= 0.3.257 / Py >= 0.2.150)、`cacheReadInputTokens`、`cacheCreationInputTokens`、`webSearchRequests`、`costUSD`、`contextWindow`、`maxOutputTokens`、`canonicalModel?` / `provider?`(v2.1.218+)、`costBasis?`(`'list' | 'managed' | 'unknown'`、v2.1.246+)。ステップごとの assistant `output_tokens` は `message_start` のプレースホルダなので、出力トークンは result から読む。並列ツール呼び出しは message id を共有するので id で重複排除する。ストリーミング入力モードでは `total_cost_usd` / `modelUsage` は呼び出し内で累積(最新 result を読む。合算しない)。`/clear` `/reset` `/new` でリセットされ `SDKConversationResetMessage` / `ConversationResetMessage`(Python 0.2.137 以前はイテレータが落としていた)が出る。v2.1.277 から resume したセッションは過去合計を復元するので、result を合算すると二重計上になる。

prompt cache TTL は API キー認証でデフォルト 5 分。`ENABLE_PROMPT_CACHING_1H=1` または `CLAUDE_CODE_PROMPT_CACHE_TTL` / `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`(`5m` | `1h`)で延長。サブスクリプションでは included usage 内なら自動で 1h、usage credit を消費し始めると 5m に落ちる(`promptCacheTtl=1h` で維持)。

1M コンテキスト: `context-1m-2025-08-07` beta は Claude API 上の Sonnet 4.5 / Sonnet 4 で退役済みで、渡すと 200K 超のリクエストが失敗する。デフォルトで 1M のモデル(`claude-sonnet-5-5`、`claude-opus-5-5`)を使うか `[1m]` サフィックス(`claude-opus-4-6[1m]`)を付ける。

#### OpenTelemetry

```bash
CLAUDE_CODE_ENABLE_TELEMETRY=1
CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1
OTEL_TRACES_EXPORTER=otlp
OTEL_METRICS_EXPORTER=otlp
OTEL_LOGS_EXPORTER=otlp
OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf
OTEL_EXPORTER_OTLP_ENDPOINT=http://collector.example.com:4318
```

コンテナの環境変数として渡す(SDK の `env` 経由でも同じ)。SDK 自体は何も emit せず、CLI がメトリクス(`OTEL_METRICS_EXPORTER`)、ログイベント(`OTEL_LOGS_EXPORTER`)、beta トレース(`OTEL_TRACES_EXPORTER` + `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1`)を `CLAUDE_CODE_ENABLE_TELEMETRY=1` のときに出す。`console` exporter は stdout に書くので SDK 下では絶対に使わない。span 名は `claude_code.interaction`、`claude_code.llm_request`、`claude_code.tool`(子に `blocked_on_user`、`execution`)、`claude_code.hook`(`ENABLE_BETA_TRACING_DETAILED=1` + `BETA_TRACING_ENDPOINT` が必要)。アプリ側でアクティブな span があれば W3C `TRACEPARENT` / `TRACESTATE` が自動注入され Bash コマンドにも転送される。デフォルト export 間隔はメトリクス 60 秒、トレース / ログ 5 秒なので、短命な呼び出しでは `OTEL_METRIC_EXPORT_INTERVAL` / `OTEL_LOGS_EXPORT_INTERVAL` / `OTEL_TRACES_EXPORT_INTERVAL` を 1000 に下げる。exporter のエラーは `CLAUDE_CODE_OTEL_DIAG_STDERR=1`(v2.1.179+)で stderr コールバックに出る。内容のゲートは `OTEL_LOG_USER_PROMPTS`、`OTEL_LOG_TOOL_DETAILS`、`OTEL_LOG_TOOL_CONTENT`、`OTEL_LOG_RAW_API_BODIES`(`=1` または `file:<dir>`)。`OTEL_SERVICE_NAME` と `OTEL_RESOURCE_ATTRIBUTES` でタグ付け(`enduser.id` / `tenant.id` はパーセントエンコード)。

### 8.12 ホスティングとセキュア配備

#### セッションパターンとテナント分離

4 パターン: ephemeral(1 回ごとに `query()`)、long-running(TS `streamInput()` / `startup()` / `prewarm()`、Py `ClaudeSDKClient`)、hybrid(SessionStore 必須)、multi-agent container。ローカルディスク状態は transcript、CLAUDE.md memory、作業ディレクトリの成果物で、SessionStore がミラーするのは transcript のみ。コンテナへのルーティングは sessionId の consistent hashing。既知の制限: トップレベルのセッションタイムアウトがない(`maxTurns` で代替)、長いセッションでメモリが成長、広い並列 subagent fanout はレート制限に当たる、subagent ごとの wall-clock deadline がない。必要なネットワークは api.anthropic.com またはプロバイダエンドポイントへのアウトバウンド HTTPS だけで、サブプロセスは listen しない。ループを自前で回す必要がなければ Managed Agents が代替。

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";

declare const prompt: string;
declare const tenantDir: string;
declare const configDir: string;

for await (const message of query({
  prompt,
  options: {
    cwd: tenantDir,
    settingSources: [],
    env: {
      ...process.env,
      CLAUDE_CONFIG_DIR: configDir,
      CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
    },
  },
})) {
  // ...
}

// Python:
// ClaudeAgentOptions(cwd=tenant_dir, setting_sources=[],
//     env={"CLAUDE_CONFIG_DIR": config_dir, "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"})
```

マルチテナント分離の最小セット。`query()` のデフォルトオプションに分離を頼らない。テナントごとにファイルシステム、`settingSources: []`、`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`、`CLAUDE_CONFIG_DIR`、`cwd` を分け、必要なら `strictMcpConfig` と `ENABLE_CLAUDEAI_MCP_SERVERS=false` で claude.ai コネクタも遮断する。

#### 隔離境界とクレデンシャル

```bash
docker run \
  --cap-drop ALL \
  --security-opt no-new-privileges \
  --security-opt seccomp=/path/to/seccomp-profile.json \
  --read-only \
  --tmpfs /tmp:rw,noexec,nosuid,size=100m \
  --tmpfs /home/agent:rw,noexec,nosuid,size=500m \
  --network none \
  --memory 2g \
  --cpus 2 \
  --pids-limit 100 \
  --user 1000:1000 \
  -v /path/to/code:/workspace:ro \
  -v /var/run/proxy.sock:/var/run/proxy.sock:ro \
  agent-image
```

secure-deployment ページの Docker 構成。`--network none` でネットワークインターフェースを持たず、ホスト上の proxy に繋がる Unix socket だけが外界への経路になる。クレデンシャルはコンテナ外の proxy に置く(サンプリングは `ANTHROPIC_BASE_URL`、それ以外は `HTTP_PROXY` / `HTTPS_PROXY`。他の HTTPS サービスにヘッダを注入するには TLS 終端 proxy が要る)。Node の `fetch()` はデフォルトで `HTTP_PROXY` を無視するので Node 24+ では `NODE_USE_ENV_PROXY=1`。他の境界は sandbox-runtime(`npm install @anthropic-ai/sandbox-runtime`、bubblewrap / sandbox-exec)、gVisor runsc(単純 syscall で約 2 倍、重い file I/O で 10 から 200 倍のオーバーヘッド)、Firecracker VM + vsock。マウントしてはいけないもの: `.env` / `.env.local`、`~/.git-credentials`、`~/.aws/credentials`、`~/.config/gcloud/application_default_credentials.json`、`~/.azure/`、`~/.docker/config.json`、`~/.kube/config`、`.npmrc` / `.pypirc`、`*-service-account.json`、`*.pem` / `*.key`。

#### プログラム指定の sandbox

```python
import asyncio

from claude_agent_sdk import query, ClaudeAgentOptions

sandbox_settings = {
    "enabled": True,
    "autoAllowBashIfSandboxed": True,
    "failIfUnavailable": True,
    "network": {"allowLocalBinding": True},
}


async def main():
    try:
        async for message in query(
            prompt="Build and test my project",
            options=ClaudeAgentOptions(sandbox=sandbox_settings),
        ):
            print(message)
    except Exception as error:
        # A single-shot query() raises after yielding an error result,
        # such as when failIfUnavailable is set and the sandbox can't start.
        print(f"Session ended with an error: {error}")


asyncio.run(main())
```

`SandboxSettings` のフィールド(typescript.md): `enabled`、`failIfUnavailable`(TS デフォルト true)、`autoAllowBashIfSandboxed`(true)、`excludedCommands`、`allowUnsandboxedCommands`(true。モデルが `dangerouslyDisableSandbox` を立てて permission にフォールバックできる)、`network`、`filesystem.denyWrite`、`ignoreViolations`(`Record<string, string[]>`)、`enableWeakerNestedSandbox`、`ripgrep`。Python の TypedDict には `failIfUnavailable` と `filesystem` がなく(設定すれば転送はされる)、デフォルトでは sandbox が使えないとき stderr に警告を出してサンドボックスなしで実行するので、必ず明示する。python.md は `SandboxIgnoreViolations` を `{file, network}` と記載しているが、Python 0.2.166 で `dict[str, list[str]]` に変わっており、docs がコードに遅れている。0.3.296 から `sandbox` オプションはインラインの `settings.sandbox` を破棄せずマージする。

### 落とし穴と対策

- **システムプロンプトが最小限**: `claude -p` と同じ挙動を期待するなら `systemPrompt: { type: 'preset', preset: 'claude_code' }` を明示。カスタム文字列にするなら system reminder の説明文を自分で足す。
- **TS `env` は置換、Python は マージ**: TS では必ず `...process.env` を展開する。PATH / HOME / API キーの消失は「`claude` が見つからない」「Not logged in」として現れる。
- **単発 `query()` はエラー結果の後に throw / raise**: try/catch なしだと result 分岐でログした直後にクラッシュする。長命セッションならストリーミング入力モードに切り替える。
- **result で break しない**: `prompt_suggestion` などの system イベントが後続する。Python の `receive_response()` は最初の ResultMessage で自然に止まる。
- **`canUseTool` は自動承認を見ない**: 全呼び出しの監査は PreToolUse hook に。`bypassPermissions` やベア名 `allowedTools` と併用すると `CLAUDE_SDK_CAN_USE_TOOL_SHADOWED` 警告。`null` 返却は自前チャネルで応答済みのときだけ。
- **`permissionMode` 省略の意味が変わった**: 0.3.286 から auto で始まりうる、0.3.302 でサードパーティプロバイダ / フレッシュインストールは default に戻った。依存があるなら明示。
- **`bypassPermissions` は `allowedTools` で絞れない**: 絞るのは `disallowedTools`。TS は `allowDangerouslySkipPermissions: true` 併用、root / sudo では拒否。
- **`acceptEdits` は MCP を自動承認しない**: `allowedTools: ['mcp__server__*']`。glob はリテラル `mcp__<server>__` の後のみ。
- **`maxBudgetUsd: 0` は起動拒否、`maxTurns: 0` は無制限**: 予算は 1 レスポンス + 実行中 subagent 分超過しうるので余裕を持つ。
- **コストは推定値、ストリーミングでは累積値**: 合算せず最新 result を読む。resume は過去合計を復元する(v2.1.277+)。`usage` は subagent を含まない。
- **Zod は draft-7 へ変換**: `z.toJSONSchema(S, { target: 'draft-7' })`。`success` でも `structured_output` が空なら失敗扱い。
- **Python `@tool` は `content` と `is_error` しか返せない**: `structuredContent` が要るなら standalone MCP。簡易 dict スキーマでは enum / optional が書けない。
- **Python `AgentDefinition` は camelCase**: `disallowedTools`、`permissionMode`、`maxTurns`。snake_case は TypeError。
- **subagent ツールの名前が二重**: tool_use block は `Agent`、init の tools は `Task`。AskUserQuestion は subagent 内で使えない。
- **Python の hook は 10 イベントのみ**: SessionStart / SessionEnd は settings.json のコマンド hook で。`continue_` / `async_` のキー名。`max_turns` でセッションが終わるときは hook が発火しないことがある。
- **resume 時のシステムプロンプト変更は反映されない**: compaction まで初回記録が再利用される。開発中は `snapshot: false`、本番は user message か hook `additionalContext` で注入。
- **Python の文字列 `system_prompt` は argv 長制限に当たる**: Linux 約 128 KB、Windows 約 32 KB。`{"type": "file", "path": ...}` を使う。
- **ストリーミング入力のジェネレータ例外**: TS は `Claude Code process aborted by user`、Python は debug ログのみで無言停止。ハングしたら debug ログを有効にしてジェネレータを疑う。
- **SessionStore の併用制限**: `persistSession: false` と file checkpointing は起動時 throw。ストアから resume した run はローカルを消すので、`mirror_error` で落ちたバッチは残らない。Python はストア resume で user settings.json をコピーしないため `apiKeyHelper` が `Not logged in`。
- **File checkpointing の範囲**: `replay-user-messages` が必須。Bash 書き込みと subagent 編集は追跡外。イテレータ終了後の `rewindFiles()` は `ProcessTransport is not ready for writing`。
- **Plugin / Skill の無言スキップ**: `type: 'local'` のみ、チルダ不可、存在しないパスは無視。init の `plugins` / `plugin_errors` を必ず検査。`setting_sources=[]` は `skills: 'all'` を無効化する。
- **MCP の `pending` は失敗ではない**: `failed` / `needs-auth` だけが使用不能。対話的 OAuth は走らない。25,000 トークン超の出力はファイルパスに化ける。
- **tool search の静かな無効化**: first-party でない `ANTHROPIC_BASE_URL`、Azure Foundry、Opus 4 以前、`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` / HIPAA。すると全 MCP スキーマが毎ターン載る。
- **OTEL `console` exporter 禁止**: stdout は SDK のチャネル。export エラーは `CLAUDE_CODE_OTEL_DIAG_STDERR=1` がないと見えない。
- **Python sandbox `failIfUnavailable` デフォルト false**: 無言でサンドボックス外実行になる。TS は true。両方で明示。
- **`settingSources: []` では止まらないもの**: managed policy、`~/.claude.json`、auto memory、claude.ai コネクタ。マルチテナントでは `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`、テナント別 `CLAUDE_CONFIG_DIR` / `cwd`、`strictMcpConfig` / `ENABLE_CLAUDEAI_MCP_SERVERS=false`。
- **claude.ai ログインを製品に組み込めない**: API キーを使う。Max / Team の月次クレジットは Console 組織を 1 つリンクして使い、Claude Code 本体や Bedrock / Vertex / Foundry には使えない。
- **hook / permission のタイムアウト**: PreToolUse デフォルト 600 秒、超過でツール呼び出しはブロック(v2.1.210+)。`canUseTool` は永久に pending になりうるので、長い人間承認は PreToolUse `defer`。
- **V2 API は消えた**: `unstable_v2_*` は 0.3.142 で削除。`query()` + async generator または `resume` へ。

### 中級者が次にやること

1. **CLI 同等の単発エージェントを 1 本作って差分を体感する**: `systemPrompt` preset、`settingSources: ['project']`、`permissionMode: 'default'` 明示、`maxTurns` / `maxBudgetUsd`、try/catch、`terminal_reason` 優先の result 分岐。これを雛形にする。
2. **ストリーミング入力モードへ移行する**: 8.2 の Promise ゲート付き async generator(TS)か `ClaudeSDKClient`(Python)でマルチターン化し、ターン間の `setModel` / `setPermissionMode` / `applyFlagSettings` を試す。`priority: 'now'` + `origin: { kind: 'human' }` で実行中作業を background 化する UI を作る。
3. **権限レイヤーを 3 層で設計する**: 絶対に通さないものは deny rule(ベア名ならコンテキストから消える)、毎回検査したいものは PreToolUse hook(`.env` 保護の例を拡張)、人間判断が要るものだけ `canUseTool` + `suggestions` の永続化 + `Notification` hook の `permission_prompt` で通知。長い承認待ちは `defer` に切り替える。
4. **社内 API を in-process MCP に包む**: `readOnlyHint` で並列化、`searchHint` で tool search に乗せる、Python で `structuredContent` が要るなら standalone MCP に分ける。init の `mcp_servers[].status` と `capabilities` をログに残す。
5. **subagent に上限を付けて fanout する**: `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1`、`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`、`maxBudgetUsd` を同時に設定し、`parent_tool_use_id` / `agent_id` で出力を帰属させる。数十以上なら `Workflow` ツールと `error` フィールドの検査。
6. **SessionStore を Postgres か S3 に実装する**: `append` / `load` から始めて `listSessions` を足し、`run_session_store_conformance` / `conformance.ts` で適合を確認。`mirror_error` のメトリクス化と `entry.uuid` の重複排除を入れる。
7. **構造化出力をパイプラインに組み込む**: draft-7 スキーマ、`error_max_structured_output_retries` と「`success` だが空」の両方を失敗扱い、`errors` を記録。
8. **コストと観測性を配線する**: `modelUsage` を result ごとに記録(ストリーミングでは最新値)、OTLP exporter と `OTEL_RESOURCE_ATTRIBUTES` にテナント ID、短命呼び出しでは export 間隔を 1000 ms に。`OTEL_LOG_RAW_API_BODIES=file:` で実際のシステムプロンプトを一度確認する。
9. **隔離境界を決めてから配備する**: `--network none` + proxy socket の Docker か sandbox-runtime。`SandboxSettings.failIfUnavailable` を明示、クレデンシャルは proxy に、テナント分離の 5 点セット(cwd、`settingSources: []`、`CLAUDE_CONFIG_DIR`、`CLAUDE_CODE_DISABLE_AUTO_MEMORY`、`strictMcpConfig`)。
10. **SDK を上げる前に CHANGELOG を読む習慣**: パッチ番号は CLI バージョンと同じで、`permissionMode` 省略時の挙動(0.3.286 / 0.3.302)や fork subagent デフォルト(0.3.302)のような挙動変更がパッチで入る。`capabilities` による機能検出に寄せ、バージョン文字列のパースを避ける。

### 出典

- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/agent-sdk/quickstart
- https://code.claude.com/docs/en/agent-sdk/configuration
- https://code.claude.com/docs/en/agent-sdk/agent-loop
- https://code.claude.com/docs/en/agent-sdk/claude-code-features
- https://code.claude.com/docs/en/agent-sdk/sessions
- https://code.claude.com/docs/en/agent-sdk/session-storage
- https://code.claude.com/docs/en/agent-sdk/streaming-vs-single-mode
- https://code.claude.com/docs/en/agent-sdk/user-input
- https://code.claude.com/docs/en/agent-sdk/streaming-output
- https://code.claude.com/docs/en/agent-sdk/structured-outputs
- https://code.claude.com/docs/en/agent-sdk/custom-tools
- https://code.claude.com/docs/en/agent-sdk/mcp
- https://code.claude.com/docs/en/agent-sdk/tool-search
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://code.claude.com/docs/en/agent-sdk/modifying-system-prompts
- https://code.claude.com/docs/en/agent-sdk/skills
- https://code.claude.com/docs/en/agent-sdk/plugins
- https://code.claude.com/docs/en/agent-sdk/permissions
- https://code.claude.com/docs/en/agent-sdk/hooks
- https://code.claude.com/docs/en/agent-sdk/file-checkpointing
- https://code.claude.com/docs/en/agent-sdk/cost-tracking
- https://code.claude.com/docs/en/agent-sdk/observability
- https://code.claude.com/docs/en/agent-sdk/hosting
- https://code.claude.com/docs/en/agent-sdk/secure-deployment
- https://code.claude.com/docs/en/agent-sdk/todo-tracking
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/agent-sdk/python
- https://code.claude.com/docs/en/agent-sdk/migration-guide
- https://code.claude.com/docs/en/agent-sdk/typescript-v2-preview
- https://github.com/anthropics/claude-agent-sdk-typescript/blob/main/CHANGELOG.md
- https://github.com/anthropics/claude-agent-sdk-python/blob/main/CHANGELOG.md
- https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk
- https://pypi.org/project/claude-agent-sdk/
- https://platform.claude.com/docs/en/about-claude/api-credits-for-subscribers
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
