## 第13章 Claude Codeで「AIのための仕組み」を作る設計パターン(Anthropic Engineering等)

### この章で分かること

Anthropic Engineering の一連の記事(Building effective agents、Effective context engineering、Effective harnesses、Harness design、Multi-agent research system、Demystifying evals など)で示された「AIエージェントのための仕組み」の設計原則を、Claude Code のプリミティブ(CLAUDE.md、rules、skills、subagent、fork、dynamic workflows、agent teams、hooks、/goal、headless)にどう写像するかを扱う。中心となる主張は三つで、(1) 最小構成から始め計測して複雑さを足す、(2) コンテキストは有限の「注意バジェット」であり、何を載せ何を外に出すかを設計する、(3) 「指示」は助言であって保証ではなく、保証が要る箇所は hooks と permissions で決定論的に固める。後半では、Claude Code の仕組みと一対一で対応する Messages API / Managed Agents 側の機構(memory tool、context editing、server-side compaction、tool search、programmatic tool calling、advisor、memory stores、dreams)を列挙し、ローカルで組んだ仕組みを API 製品へ移植する際の対応表として使えるようにする。各挙動にはバージョン番号(v2.1.xxx)と beta header を明記する。

### 13.1 設計原則: workflow と agent、そして「最小の解」

Building effective agents(2024年12月)は用語を分ける。「Workflows are systems where LLMs and tools are orchestrated through predefined code paths.」であり、agent は「typically just LLMs using tools based on environmental feedback in a loop」である。同記事は五つの workflow パターン(prompt chaining、routing、parallelization の sectioning / voting、orchestrator-workers、evaluator-optimizer)を挙げ、常に「find the simplest solution possible, and only increase complexity when needed」を要求する。

Claude Code へ写像すると次の対応になる。

| Anthropic のパターン | Claude Code での実装 |
|---|---|
| prompt chaining | 手順を番号付けした skill + 各段の hook によるゲート |
| routing | skill / subagent の description をモデルが選ぶ(description は routing の表面) |
| parallelization | 並列 subagent、/batch(5〜30 の worktree 隔離 subagent)、dynamic workflows の parallel() |
| orchestrator-workers | メインセッション + subagent、または workflow script |
| evaluator-optimizer | /goal、Stop hook、別コンテキストの reviewer subagent |

「最小の解」はハーネス設計にも効く。Harness design for long-running application development(2026年3月24日)は、ハーネスの各コンポーネントが「そのモデルが単独でできないこと」の仮定をエンコードしていると述べ、モデルのリリースごとに各コンポーネントを再検証せよと勧める。具体例として、Sonnet 4.5 で必要だった context reset は Opus 4.5 に移行した時点で不要になり(モデル自身が「context anxiety」をほぼ解消した)、Opus 4.6 ではさらに sprint 構造が外されて evaluator は run 終了時の一回に集約された。planner と evaluator は残っている。コスト実測は、単独実行 20分 / $9 に対し v1 フルハーネス 6時間 / $200、v2 で DAW を構築した run は 3時間50分 / $124.70 である。

Building multi-agent systems(2026年1月23日)は multi-agent を採用する条件を三つに絞る。context protection(サブタスクが約1,000トークン超のほぼ無関係な出力を生む)、parallelization(目的は速度ではなく網羅性)、specialization(20以上のツール、無関係なドメイン)。トークンは 3〜10倍を見込む。分割は writer / tester / reviewer のような問題中心ではなく context 中心に行う。問題中心分割は「telephone game」を起こし、調整コストが作業を上回った。

### 13.2 コンテキストエンジニアリングを Claude Code の仕組みで読む

Effective context engineering for AI agents(2025年9月)の定義は「find the smallest set of high-signal tokens that maximize the likelihood of your desired outcome」である。コンテキストは満ちるほど劣化する(context rot)ので、システムプロンプトは「right altitude」(脆い if-else と曖昧な指示の中間)、例は最小の正準例、ツールは重複なし、取得は軽量な識別子(パス、クエリ)で just-in-time に行う。長時間タスク向けの三手段は、compaction(限界に近い会話を要約して再開)、structured note-taking(「the agent regularly writes notes persisted to memory outside of the context window」)、sub-agent isolation(「a condensed, distilled summary of its work」を返す)。同記事は「One of the safest lightest touch forms of compaction is tool result clearing」とも述べる。Claude Code はこの記事が言う hybrid モデル(CLAUDE.md を事前ロード + 実行時の agentic file search)を実装している。

#### 各機能のコンテキストコスト

features-overview の表を要約すると、CLAUDE.md は全リクエストで全文、output style も毎回、skill は description が毎回で本文は使用時(disable-model-invocation なら 0)、MCP はツール名のみ(スキーマは tool search で遅延ロード)、subagent は隔離、hooks は出力を返さない限り 0。機能追加の引き金も明文化されている: 同じ規約違反が2回→CLAUDE.md、同じプロンプトを繰り返す→user-invocable skill、ブラウザからのコピペ→MCP、副作業がコンテキストを圧迫→subagent、毎回必ず起きるべき→hook、2つ目のリポジトリ→plugin。

#### CLAUDE.md の読み込みと上限

読み込み順は managed policy → ~/.claude/CLAUDE.md → ./CLAUDE.md または ./.claude/CLAUDE.md → ./CLAUDE.local.md で、ファイルシステムの root から cwd まで「All discovered files are concatenated into context rather than overriding each other.」である。サブディレクトリの CLAUDE.md はそこにあるファイルを読み書きしたときにオンデマンドで載る。@import は importing file からの相対で最大4ホップ、プロジェクトファイル内の外部 import は承認ダイアログを出す。HTML コメントは注入前に除去される。上限は 4 MiB だが、best-practices は 200行未満を目安とし「Bloated CLAUDE.md files cause Claude to ignore your actual instructions!」と警告する。`/doctor` が削減案を出し、`/doctor prompt-audit`(v2.1.283+)は CLAUDE.md / AGENTS.md / rules / skills / subagents / output styles の矛盾や陳腐化を監査して編集案を提示する(適用はしない)。

公式の最小例(プロジェクト root の CLAUDE.md):

```markdown
# Code style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Destructure imports when possible (eg. import { foo } from 'bar')

# Workflow
- Be sure to typecheck when you're done making a series of code changes
- Prefer running single tests, and not the whole test suite, for performance
```

Claude が推測できないことだけを書く。`/context` でロードを確認する。

パス限定 rule(.claude/rules/api.md)。該当 glob のファイルを読み書きしたときだけロードされる:

```markdown
---
paths:
  - "src/api/**/*.ts"
---

# API Development Rules

- All API endpoints must include input validation
- Use the standard error response format
- Include OpenAPI documentation comments
```

#### compaction の実際の挙動

context-window の記述では、compaction はまず古いツール出力をクリアし、次に会話を要約する。root の CLAUDE.md とパス限定でない rules は compaction 後に再読込されるが、サブディレクトリ CLAUDE.md とパス限定 rules は該当ファイルを再び触るまで失われる。起動済み skill の本文は再注入されるが「capped at 5,000 tokens per skill and 25,000 tokens total; oldest dropped first」なので、重要な指示は SKILL.md の先頭に置く。最近変更したファイルは最大5件が再読込され、5,000トークン超はパス参照になる。skill 一覧は再ロードされない。hooks が過去に追加したコンテキストは特別扱いされず、他の会話と一緒に要約される(「hooks は compaction を回避する」という理解は誤り)。単一の巨大出力でコンテキストが再び満ちると auto-compaction は thrashing エラーで停止する。

制御手段: `/compact <focus>`、CLAUDE.md の「Compact Instructions」セクション、`/autocompact <tokens>`(v2.1.288+ でモデル別に保存、`--autocompact` は一回限り、`CLAUDE_CODE_AUTO_COMPACT_WINDOW` が最優先、範囲 100K〜1M)、PreCompact(matcher manual|auto、exit 2 で阻止)と PostCompact hooks、`/btw` は履歴に残らない横質問。デフォルトの auto-compact 閾値はモデルのコンテキスト上限(cloud セッションは上限接近時、Sonnet 4.6 / Opus 4.6 の非拡張コンテキストと `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` は 200K、ネイティブ 1M モデルは約 967K)。

compaction 後の再注入は SessionStart hook の `compact` matcher で行うのが公式の手段である(.claude/settings.json):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Reminder: use pnpm, run tests before committing'"
          }
        ]
      }
    ]
  }
}
```

SessionStart の source は startup / resume / clear / compact / fork。

#### auto memory と subagent 用 memory

auto memory は user / feedback / project / reference の4種のノートを `~/.claude/projects/<project>/memory/` に書き、MEMORY.md をインデックスにする。「The first 200 lines of `MEMORY.md`, or the first 25KB, whichever comes first, are loaded at the start of every conversation.」であり、トピックファイルはオンデマンド。リポジトリ単位(worktree 間で共有)、マシンローカル、非 fork の subagent には渡らない。切り替えは `/memory`(autoMemoryEnabled)、`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`、移動は `autoMemoryDirectory`。subagent には frontmatter の `memory: user|project|local` で別ディレクトリ(`~/.claude/agent-memory/<name>/` など)を与えられる。

#### skill 一覧のバジェット

skill description の一覧はコンテキストの 1%(`skillListingBudgetFraction`、または `SLASH_COMMAND_TOOL_CHAR_BUDGET`)に収まるよう、使用頻度の低い skill から description(名前は残る)が落とされる。一件あたりの上限は `skillListingMaxDescChars`(既定 1,536 文字、description + when_to_use)。常時ロードしたくない skill は `skillOverrides` で絞る(settings.json):

```json
{
  "skillOverrides": {
    "legacy-context": "name-only",
    "deploy": "off"
  }
}
```

`/skill-doctor` が未使用 skill を見つけ、`claude plugin validate .claude/skills`(v2.1.233+)が frontmatter の不正を検出する。

### 13.3 長時間稼働ハーネス: initializer / progress / evaluator

Effective harnesses for long-running agents(2025年11月)の v1 構成は、最初のセッションを initializer agent とし、init.sh、claude-progress.txt、200件超の feature list JSON(各項目は category / description / steps[] / passes: false)、初期コミットを作らせる。以後のセッションはすべて coding agent で、起動時に cwd、git log、progress file、feature list、smoke test で現状把握し、ONE feature だけ実装してコミットし progress を更新する。feature list を Markdown ではなく JSON にしたのは、モデルが上書きしにくいため。テスト削除は「It is unacceptable to remove or edit tests because this could lead to missing or buggy functionality.」と禁止し、「Self-verify all features. Only mark features as passing after careful testing.」と要求する。initializer と coding agent はシステムプロンプト・ツール・ハーネスを共有し、最初の user prompt だけが違う。記事の実験は Opus 4.5、quickstart の README は claude-sonnet-4-5-20250929 を既定とし、200 のテストケース、app_spec.txt、.claude_settings.json を同梱する(github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding)。

Harness design v2 が発見した二つの失敗モードは、context anxiety(上限が近づくと早めに切り上げる)と self-evaluation leniency(自己採点が甘い)である。evaluator は Playwright で製品の深さ・機能・ビジュアル・コード品質に硬い閾値を置き、一つでも落ちれば sprint 失敗とする。ただし evaluator は初期状態では「real issues を見つけた後で自分を説得して承認してしまった」ため、数ラウンドのプロンプト調整が要った。

#### Memory tool の protocol を CLAUDE.md の雛形にする

Messages API の memory tool(`type: memory_20250818`、beta header 不要、Claude 4 以降)はクライアント側実装で、Claude が view / create / str_replace / insert / delete / rename を `/memories` 配下に発行し、ハンドラが実行する。API はシステムプロンプトに memory protocol を自動注入する:

```json
{
  "model": "claude-opus-5-5",
  "max_tokens": 2048,
  "messages": [{"role": "user", "content": "Help me respond to this customer service ticket."}],
  "tools": [{"type": "memory_20250818", "name": "memory"}]
}

// System prompt text the API adds automatically when the memory tool is present:
// IMPORTANT: ALWAYS VIEW YOUR MEMORY DIRECTORY BEFORE DOING ANYTHING ELSE.
// MEMORY PROTOCOL:
// 1. Use the `view` command of your `memory` tool to check for earlier progress.
// 2. ... (work on the task) ...
//    - As you make progress, record status / progress / thoughts etc in your memory.
// ASSUME INTERRUPTION: Your context window might be reset at any moment, so you risk losing any progress that is not recorded in your memory directory.
```

この文面は claude-progress.txt を使う Claude Code の CLAUDE.md や coding-agent プロンプトにそのまま転用できる。セキュリティ上は、パスが `/memories` 配下に留まるか検証(`/memories/../../secrets.env` のような traversal を拒否)、ファイルサイズ上限、古いファイルの失効を実装する。

#### 実運用例: 科学計算の数日 run と C コンパイラ

Long-running Claude for scientific computing(2026年3月23日、Opus 4.6)のハーネスは、編集可能な計画兼ルールとしての CLAUDE.md、失敗したアプローチを記録する lab-notes としての CHANGELOG.md(「without them, successive sessions will re-attempt the same dead ends.」)、参照実装のテストオラクル、「Commit and push after every meaningful unit of work.」「Never commit code that breaks existing passing tests.」というルール、SLURM の GPU ジョブ内 tmux、`--max-iterations 20` と "DONE" プロミスで再プロンプトするラッパー。著者は足場は一時的なものだとし、密結合な問題には並列ワーカーより逐次の一エージェント + subagent が向くとする。

Building a C compiler(2026年2月、Opus 4.6)は 16 の Claude Code agent を約2週間(約2,000 セッション、入力約 2B / 出力 140M トークン、$20,000 弱)走らせ、オーケストレータなしで git だけで協調させた。bare の upstream リポジトリ、agent ごとの Docker、`current_tasks/` のロックファイルを git sync で取り合う、頻繁な merge、ループごとに新しいコンテナ。環境設計の教訓: verifier はほぼ完璧でないと Claude は別の問題を解く、新機能が旧機能を壊すなら CI / 回帰ゲートを足す、出力は数行に抑え詳細はファイルへ、ERROR と理由を grep 可能な一行に、サマリは事前計算、時間感覚のない agent 向けに `--fast`(agent ごとに決定論的な 1% / 10% サンプル)、README / progress の維持を義務化、全 agent が同じバグ(kernel)で詰まったら信頼できるコンパイラ(GCC オラクル)を使うファイルを乱択して別々のバグに向かわせる、cleanup / perf / docs の専任 agent。

### 13.4 検証ループの階段

best-practices は検証の強度を四段階で示す。(1) プロンプトで確認を依頼、(2) `/goal` で毎ターン別の evaluator が条件を再評価、(3) Stop hook を決定論的ゲートに、(4) 新しい subagent や workflow による adversarial review(「a fresh model try to refute the result, so the agent doing the work isn't the one grading it.」)。成功を主張させるのではなく、テスト出力やスクリーンショットという証拠を出させる。reviewer への注意として、欠陥を探せと言われた reviewer は健全な成果にも何か報告するので、正しさと要件のギャップだけを挙げるよう指示する。`/code-review` は新しい subagent で正しさのレビューを走らせる同梱 skill。

#### /goal の仕組み

「`/goal` is a wrapper around a session-scoped prompt-based Stop hook.」各ターン後に小型高速モデル(`ANTHROPIC_DEFAULT_HAIKU_MODEL`)が 4,000 文字以下の条件を、Claude が会話に出した内容だけで判定し(ツールは走らせない)、not-yet-met / met / impossible を返す。ツールを使わないターンが何度か続くと goal は設定されたまま停止する。`-p` でも動く(`claude -p "/goal ..."`、進捗は stream-json)。バックグラウンド作業中は評価を遅延し、check-in は 30分 → 1時間 → 2時間ごとにバックオフ、idle check-in は goal あたり最大3回(v2.1.246+、`CLAUDE_CODE_GOAL_CHECKIN_MINUTES`、0 で無効化)。一時的な API エラーは3回再試行、auth / credit / context overflow / model エラーでクリアされる。`disableAllHooks` や `allowManagedHooksOnly` 下では使えない。無人で回すには auto mode と組み合わせ、条件に「or stop after N turns」を含めて上限を切る。

#### Stop hook: prompt 型と agent 型

Stop / SubagentStop hook は exit 2 または `{decision: "block", reason}` で停止を阻止する。入力には stop_hook_active、last_assistant_message、background_tasks、session_crons が含まれる。「Claude Code applies an 8-consecutive-continuation cap: after stop hooks have continued the turn eight times in a row, Claude Code overrides the next block and ends the turn.」(ツール呼び出しでリセット、`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` で変更)。

prompt 型 Stop hook(.claude/settings.json、`/goal` が包んでいるのと同じ機構):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Claude should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

agent 型 Stop hook(実験的。verifier subagent を起動し、既定 60秒タイムアウト、最大 50 ツールターンでテストを実行できる):

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify that all unit tests pass. Run the test suite and check the results. $ARGUMENTS",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

command 型 Stop hook の無限継続ガード(スクリプト先頭):

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop
fi
# ... rest of your hook logic
```

阻止せずに促すだけなら `hookSpecificOutput.additionalContext` を返す:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "Stop",
    "additionalContext": "Please run the test suite before finishing"
  }
}
```

最終メッセージは last_assistant_message から読む(transcript ファイルが Stop 時点で最終メッセージを含む保証はない)。prompt hook の ok:false の扱いはイベントごとに異なり、PostToolBatch / UserPromptSubmit / UserPromptExpansion は常にターン終了、PostToolUseFailure / TaskCreated は常に継続、PreToolUse(v2.1.210 以降。それ以前は tool error として継続)と PostToolUse の deny は `continueOnBlock: true` がなければターンを終える。agent hook はどこでも continueOnBlock: true 相当で動く。

#### 読み取り専用 reviewer と hook バックストップ

evaluator-optimizer の Claude Code 版は、別コンテキスト、強いモデル、Edit / Write なしの reviewer subagent である(.claude/agents/security-reviewer.md):

```markdown
---
name: security-reviewer
description: Reviews code for security vulnerabilities
tools: Read, Grep, Glob, Bash
model: opus
---
You are a senior security engineer. Review code for:
- Injection vulnerabilities (SQL, XSS, command injection)
- Authentication and authorization flaws
- Secrets or credentials in code
- Insecure data handling

Provide specific line references and suggested fixes.
```

「指示」を hook で裏打ちする例(.claude/agents/db-reader.md)。システムプロンプトは read-only を求め、hook が決定論的に強制する:

```markdown
---
name: db-reader
description: Execute read-only database queries. Use when analyzing data or generating reports.
tools: Bash
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-readonly-query.sh"
---

You are a database analyst with read-only access. Execute SELECT queries to answer questions about the data.
```

hook スクリプト(scripts/validate-readonly-query.sh、JSON は stdin、exit 2 で阻止、stderr が理由として Claude に戻る):

```bash
#!/bin/bash
# Blocks SQL write operations, allows SELECT queries

# Read JSON input from stdin
INPUT=$(cat)

# Extract the command field from tool_input using jq
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // empty')

if [ -z "$COMMAND" ]; then
  exit 0
fi

# Block write operations (case-insensitive)
if echo "$COMMAND" | grep -iE '\b(INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|TRUNCATE|REPLACE|MERGE)\b' > /dev/null; then
  echo "Blocked: Write operations not allowed. Use SELECT queries only." >&2
  exit 2
fi

exit 0
```

hook の exit code は 0 成功(stdout の JSON で制御)、2 阻止、それ以外は非阻止エラーで、「Exit code 1 without valid JSON output is a non-blocking error」。複数 PreToolUse hook の優先順位は deny > defer > ask > allow、`updatedInput` で入力を書き換えられる。既定タイムアウトは command / http / mcp_tool 600秒、prompt 30秒、agent 60秒。`async: true` はタイムアウトなしの背景実行、`onFailure: block`(v2.1.295+)で hook 失敗を阻止扱いにできる。memory.md の一文「To block an action regardless of what Claude decides, use a PreToolUse hook instead.」が設計の分水嶺である。

### 13.5 オーケストレーション: subagent、fork、dynamic workflows、agent teams

agents.md は並列実行の表面を五つ挙げる: subagent(一セッション内で Claude が委譲)、agent view(`claude agents`、背景セッション)、agent teams(lead + peers、実験的)、projects(cloud threads)、dynamic workflows(script)。補助として worktrees、cross-session messaging、/batch。選択軸は、誰が調整するか(Claude がターンごとに / 自分 / lead agent / script)、ワーカー同士が会話する必要があるか、同じファイルを触るか(「Agent teams don't isolate teammates in worktrees, so partition the work so each teammate owns a different set of files.」)。

#### subagent の実体と上限

非 fork subagent は Claude Code のシステムプロンプトではなく自分のシステムプロンプト、委譲メッセージ、CLAUDE.md(Explore / Plan または `omitClaudeMd` を除く)、git status スナップショット、事前ロード skill、SendMessage があれば sibling roster を受け取り、会話履歴・output style・メインの auto memory は受け取らない。frontmatter は name と description のみ必須で、tools、disallowedTools、model、permissionMode(manual も可)、maxTurns(v2.1.246+ で部分出力を返し SendMessage で再開可)、autoCompactWindow(100000〜1000000、v2.1.296+)、skills、mcpServers、hooks、memory、background、omitClaudeMd(v2.1.271+)、effort、`isolation: worktree`、initialPrompt、experimental.cacheTtl(v2.1.248+)が使える。未知のフィールドは無視される。名前衝突時は managed > --agents > .claude/agents/ > ~/.claude/agents/ > plugin。モデルは per-invocation > frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` > main の順(v2.1.251 以前は env var が先)、`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`(v2.1.257+)で全上書き。

上限: ネスト深さ既定 3(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`、1 で無効。ブログの「5段」は v2.1.172〜216 の古い値)、同時 20(`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`、v2.1.217+)、description の合計は約 15,000 トークンが起動時警告の目安。Explore / Plan は one-shot で再開不可、`permissions.deny` の `Agent(Explore)` で型ごとに禁止、`CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1`(v2.1.198+)で組み込みを外す。transcript は `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`、cleanupPeriodDays(30)で削除。

fork subagent(`/subtask`、type fork)は会話・システムプロンプト・ツールを継承し、親の prompt cache を再利用するので「a fork costs less than a fresh subagent for tasks that need the same context」。対話セッションでは v2.1.232 から既定 on、`-p` / SDK では `CLAUDE_CODE_FORK_SUBAGENT=1` が必要。fork mode では subagent が背景で走り Agent ツールの run_in_background パラメータが消える。fork は fork できず、編集を分けるには `isolation: "worktree"`。`Agent(fork)` ルールで禁止できる。

skill 側から fork する例(SKILL.md。`!`command`` は Claude が skill を見る前に実行され、失敗すると起動が中止される):

```yaml
---
name: pr-summary
description: Summarize changes in a pull request
context: fork
agent: Explore
allowed-tools: Bash(gh *)
---

## Pull request context
- PR diff: !`gh pr diff`
- PR comments: !`gh pr view --comments`
- Changed files: !`gh pr diff --name-only`

## Your task
Summarize this pull request...
```

#### dynamic workflows(2026年5月28日 GA)

「A workflow moves the plan into code.」オーケストレーションを JavaScript にし、runtime が実行する。`agent()` は subagent を一つ起動、`pipeline()` はリスト項目ごとに一つ、`parallel()` は集合を同時実行、`phase()` / `log()` は進捗表示の注釈、`args` が入力。中間結果は script の変数に留まり Claude のコンテキストに入らない。上限: 同時 16(`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` 1〜256、v2.1.269+、CPU 制約で減る)、parallel() / pipeline() 一回あたり 4,096 項目、run あたり 1,000 agent、実行中のユーザー入力なし、script からのファイルシステム / shell なし、`import()` なし。`agent()` は停止・回復不能時に null を返すので `.filter(Boolean)` が要る。`schema` で JSON 出力を強制し、検証は最大5回再試行(MAX_STRUCTURED_OUTPUT_RETRIES)、`required` と `additionalProperties: false` が矛盾するような schema は起動前に弾かれる。`Date.now()` / `Math.random()` / `new Date()` は replay の決定性のため throw する。

保存先は `.claude/workflows/` または `~/.claude/workflows/`、`/<name>` で実行、plugin は `/plugin:name`。`export const meta` は最初の文かつリテラルオブジェクトでなければ補完から消える。編集後は `/reload-skills`、作成支援は `/workflow-authoring`(v2.1.248+)。

```javascript
export const meta = {
  name: 'audit-routes',
  description: 'Audit every route handler for missing auth checks',
}

const found = await agent('List every .ts file under src/routes/.', {
  schema: { type: 'object', required: ['files'], properties: { files: { type: 'array', items: { type: 'string' } } } },
})

const audits = await pipeline(found.files, file =>
  agent(`Audit ${file} for missing authentication checks.`, { label: file }),
)

return audits.filter(Boolean)
```

replay: 完了した agent はプロンプトが変わらない限りキャッシュ結果を返す。「If a script starts A, B, C, and D in that order and B fails, relaunching returns A from cache and runs B, C, and D again.」保存結果が無ければ `nothing to resume`。stall は最大5回自動再起動(`stallMs`、`CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`)、`agent stalled on all 6 attempts` 等のエラーで終わる。usage limit に当たると run は一時停止(対話 + claude.ai サブスク + autoContinueAtUsageLimit、最大2回)。25 agent 超または 1.5M トークン超で Large workflow 警告、`workflowSizeGuideline` は unrestricted / small(<5)/ medium(<10、既定)/ large(<50)。

ultracode: `/effort ultracode`(`claude --effort ultracode` は effort xhigh も設定)で実質的なタスクごとに workflow を計画させる。プロンプト内の `ultracode` キーワードは「The keyword is an opt-in only in a prompt you type yourself」であり、`-p`、SDK、scheduled task、webhook では効かない(v2.1.210)。on のときは Large 警告なし、同時 subagent 上限なし、auto mode の初回承認なし。無効化は `disableWorkflows: true` / `CLAUDE_CODE_DISABLE_WORKFLOWS=1`。headless では Workflow ツールが通常の permission 評価を通るので、「add `Workflow` to your allow rules to approve every workflow, or `Workflow(<name>)` to approve one saved workflow by name.」。auto mode では script が agent() に渡すプロンプトは script-computed テキストとして扱われ、分類器の「ユーザー要求」にならない。

prompt cache: workflow agent と in-process teammate はメイン会話とは別の 5分 TTL を共有し(`subagentPromptCacheTtl: 1h` で延長、書き込みコスト増)、fan-out 時は最初の agent の prefix がキャッシュされるまで sibling を `CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS`(5000)だけ待たせる。「Two agents that run with the same model, effort level, agent type, tools, output schema, and working directory build the same tools-and-system-prompt prefix」なので、これらを揃えるほどヒットする。

#### agent teams(実験的)

「Agent teams are experimental and disabled by default. Enable them by setting `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`」。settings.json:

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

有効化すると、Claude が名前で指名した subagent は teammate として起動する(対話セッションのみ、fork と `isolation` 指定は除外)。協調はファイルロック付きの共有タスクリストと `~/.claude/teams/{team}/inboxes/` の JSON メールボックス、品質ゲートは TeammateIdle / TaskCreated / TaskCompleted hook(exit 2 で阻止)。制約: in-process teammate は /resume で復元されない、1セッション1チーム、ネスト不可、lead 固定、permission mode は spawn 時に継承(dontAsk は不可)、分割ペインは tmux / iTerm2。teammate は CLAUDE.md / MCP / skills を読むが lead の履歴は持たず、subagent 定義のうち tools / model / disallowedTools / effort / autoCompactWindow / 本文だけを適用し、`skills` は無視、SendMessage と Task は disallowedTools に書いても残る。agent 間メッセージは別の Claude セッション由来として flag され同意を付与できず、auto mode では分類器が各メッセージを審査する。推奨は teammate 3〜5、各 5〜6 タスク。

#### Agent SDK から subagent を定義する

`agents` マップで AgentDefinition を渡すと「Programmatically defined agents take precedence over filesystem-based agents with the same name.」。TypeScript SDK は subprocess の env を置換(`...process.env` を spread する)、Python はマージ。autoCompactWindow(TS v0.3.296+)と omitClaudeMd(TS v0.3.271+)は TypeScript のみ。Workflow ツールは TS SDK v0.3.149+。公式2例を合成した Python 例(深さ・同時数・予算の上限付き):

```python
import asyncio
from claude_agent_sdk import query, ClaudeAgentOptions, AgentDefinition, ResultMessage


async def main():
    async for message in query(
        prompt="Audit every service in this repo for unhandled promise rejections",
        options=ClaudeAgentOptions(
            allowed_tools=["Read", "Grep", "Glob", "Agent"],
            agents={
                "code-reviewer": AgentDefinition(
                    description="Expert code review specialist. Use for quality, security, and maintainability reviews.",
                    prompt="You are a code review specialist...",
                    tools=["Read", "Grep", "Glob"],
                    model="sonnet",
                ),
            },
            # env is merged on top of the inherited environment
            env={
                "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "1",
                "CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS": "5",
            },
            max_budget_usd=5.0,
        ),
    ):
        if isinstance(message, ResultMessage):
            print(f"{message.subtype}: ${message.total_cost_usd}")


asyncio.run(main())
```

予算超過は `error_max_budget_usd` で終わる。v2.1.210 以降、subagent の最終メッセージは control tag 模倣(`<system-reminder>` 風)、permission 設定への言及、`Human:` / `Assistant:` ターンマーカーがスキャンされ、バックスラッシュで無害化し、control tag と permission 設定への言及には `[harness: ...]` マーカー行が付く(ターンマーカーには付かない)。`CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1` で general-purpose を外せる。

### 13.6 ツール / ACI 設計とコード実行

Building effective agents の SWE-bench チームはプロンプトよりツールに時間を使い、「Requiring absolute filepaths eliminated errors that occurred with relative paths after the agent changed directories.」と報告する。Claude Code の Read / Edit が絶対パスを要求するのはこのためで、同じ原則が自作 MCP ツールにも当てはまる。Writing effective tools for agents(2025年9月)の要点: エンドポイントを 1:1 でラップしない、複数ステップを `schedule_event` / `get_customer_context` のように統合、service / resource で namespace、UUID でなく自然言語の高シグナル項目を返す、`response_format: concise|detailed`、ページングと切り詰めに行動可能なエラー文(「For Claude Code, we restrict tool responses to 25,000 tokens by default.」)、description は新人のオンボーディングのように書く。Claude に最適化させた description は専門家の手書きより良く、held-out でも勝った。手順は `claude mcp add <name> <command>` でプロトタイプ → 複数呼び出しの現実的タスクで評価(精度、実行時間、呼び出し数、トークン、エラー)→ transcript を Claude Code に貼ってツールをリファクタ。Multi-agent research system でも tool-testing agent に description を書き直させて完了時間を 40% 削った。

`input_examples`(1〜5件、最小 / 部分 / 全部の形)は複雑なパラメータの精度を 72% から 90% に上げ、tool search で発見された deferred tool と一緒に展開される。think tool(append-only の scratchpad ツール)は τ-bench airline の pass^1 を 0.332 → 0.584 に上げた(本文は 0.370 / 0.570 と記述が揺れている)が、2025年12月15日の更新で多くの場合 extended thinking が推奨になった。残る教訓は、複雑なポリシーはツール description ではなくシステムプロンプトに worked example 付きで置くこと。

#### tool search と deferred loading

Claude Code では MCP のツール定義は既定で遅延ロードされ、tool search で引く。「Set `ENABLE_TOOL_SEARCH=auto` to load schemas upfront when they fit within 10% of the context window, or `ENABLE_TOOL_SEARCH=false` to load everything.」起動時の目安(対話セッションの試算)はシステムプロンプト約 4,200、auto memory 約 680、環境情報約 280、MCP ツール名約 120 トークン。

API 側の Tool Search Tool は `tool_search_tool_regex_20251119`(Python `re.search`、200文字以下)と `tool_search_tool_bm25_20251119`(自然言語、500文字以下)。ツールに `defer_loading: true` を付ける(定義自体は毎回送る)、3〜5 のホットなツールは非 deferred、非 deferred が最低一つないと 400、deferred は最大 10,000、結果は既定 5件。「Never set `defer_loading: true` on the tool search tool itself.」defer_loading と cache_control の併用は 400。Advanced tool use の計測では約 77K トークンの定義が約 8.7K に(85%削減)、Opus 4 の MCP eval 49%→74%、Opus 4.5 79.5%→88.1%。

```json
{"type": "tool_search_tool_regex_20251119", "name": "tool_search_tool_regex"}
{"name": "get_weather", "description": "Get current weather for a location", "input_schema": {"type": "object", "properties": {"location": {"type": "string"}}, "required": ["location"]}, "defer_loading": true}
```

#### programmatic tool calling と Code execution with MCP

Programmatic tool calling は GA(beta header 不要)。`code_execution_20260120`(または `code_execution_20260521`)を加え、ツールに `allowed_callers: ["code_execution_20260120"]` を付けると、Claude は Python を書いてツールを async 関数として await し、中間結果はコンテキストに入らない。tool_use ブロックは `caller {type, tool_id}` を持ち、継続リクエストには container id が必須、保留中の呼び出しは約4分でタイムアウト、idle コンテナは約5分で回収、30日で再利用不可。「Do not rely on `allowed_callers` as a security boundary.」Engineering 記事の計測はリサーチタスクで 43,588 → 27,297 トークン(37%減)。

```json
{
  "tools": [
    {"type": "code_execution_20260120", "name": "code_execution"},
    {
      "name": "query_database",
      "description": "Execute a SQL query against the sales database. Returns a list of rows as JSON objects.",
      "input_schema": {"type": "object", "properties": {"sql": {"type": "string", "description": "SQL query to execute"}}, "required": ["sql"]},
      "allowed_callers": ["code_execution_20260120"]
    }
  ]
}
```

Claude が書くコード側:

```python
import json

rows = json.loads(await query_database({'sql': '<sql>'}))
top_customers = sorted(rows, key=lambda x: x['revenue'], reverse=True)[:5]
print(f'Top 5 customers: {top_customers}')
```

Code execution with MCP(2025年11月)は MCP サーバを型付きラッパーのファイル木(`servers/google-drive/getDocument.ts`)として見せ、agent にコードを書かせることで Drive → Salesforce のタスクを約 150,000 トークンから約 2,000 トークン(98.7%減)にした。利点は progressive disclosure、サンドボックス内でのフィルタ、コードによる制御フロー、PII をモデルに渡す前にトークン化できるプライバシー、ヘルパーの永続化(「Adding a `SKILL.md` file turns a saved function into a structured skill that models can reference.」)。代償は資源制限と監視付きの安全なサンドボックス。Claude Code での等価物は、可能なら MCP より CLI(gh、aws)、スクリプトを同梱した skill、Bash でのデータパイプである。

#### Skill 設計の規則

Equipping agents for the real world with Agent Skills の定義は「organized folders of instructions, scripts, and resources that agents can discover and load dynamically」で、三段階の progressive disclosure(起動時はメタデータ、関連時に本文、必要時にリンク先ファイル / スクリプト)を取り、スクリプトはコンテキストに入らずに実行される。platform 側の authoring 規則: name は 64 文字以下の小文字・数字・ハイフンで「anthropic」「claude」を含めない、description は 1,024 文字以下・三人称で「何を」と「いつ」を書く、「Keep SKILL.md body under 500 lines for optimal performance」、参照は一階層(ネストした参照は `head -100` で部分読みされる)、100行超のファイルには目次、自由度はタスクの脆さに合わせる、決定論的処理は同梱スクリプトにし execute か read かを明示、MCP ツールは `ServerName:tool_name` の完全修飾名。「Create evaluations BEFORE writing extensive documentation」が開発順序で、skill なしのギャップ特定 → 3シナリオ → ベースライン → 最小の指示 → 反復、Claude A(著者)/ Claude B(利用者)ループ、Haiku / Sonnet / Opus で試す。評価 JSON の形:

```json
{
  "skills": ["pdf-processing"],
  "query": "Extract all text from this PDF file and save it to output.txt",
  "files": ["test-files/document.pdf"],
  "expected_behavior": [
    "Successfully reads the PDF file using an appropriate PDF processing library or command-line tool",
    "Extracts text content from all pages in the document without missing any pages",
    "Saves the extracted text to a file named output.txt in a clear, readable format"
  ]
}
```

platform 側に組み込みランナーはない。Claude Code の `claude plugin eval` に `tool_used: Skill` grader があり plugin skill を検証できる。

手動起動専用 skill の公式例(.claude/skills/fix-issue/SKILL.md、`disable-model-invocation: true` で description はコンテキストに載らず自動起動もしない。`/fix-issue 1234` で呼ぶ):

```markdown
---
name: fix-issue
description: Fix a GitHub issue
disable-model-invocation: true
---
Analyze and fix the GitHub issue: $ARGUMENTS.

1. Use `gh issue view` to get the issue details
2. Understand the problem described in the issue
3. Search the codebase for relevant files
4. Implement the necessary changes to fix the issue
5. Write and run tests to verify the fix
6. Ensure code passes linting and type checking
7. Create a descriptive commit message
8. Push and create a PR
```

disable-model-invocation の skill は subagent に事前ロードできず `/loop` からも走らない。

### 13.7 評価(evals)と headless 実行

Demystifying evals for AI agents(2026年1月9日)の語彙: task / trial / grader / transcript(trajectory)/ outcome、eval harness と agent harness は別物。pass@k(k回のうち1回以上成功、k で上がる)と pass^k(k回すべて成功、k で下がる)、「With a 75% per-trial success rate over 3 trials, pass^3 is about 42%, since 0.75³ ≈ 0.42.」outcome eval は終了状態を、trajectory eval は経路を見るが、固定のツール順序を強いる grader は「overly brittle」。grader は code-based(速いが脆い)、model-based(柔軟だが較正が要る。rubric 次元ごとに独立した judge、「Unknown」の逃げ道を与える)、human(gold standard)。実失敗から 20〜50 タスク、参照解を保持、正例と負例を均衡、0% pass はたいてい grader の故障、capability eval が 100% 近くになったら regression suite へ昇格、transcript を読む。落とし穴: trial 間の共有状態(前 trial の git 履歴を agent が読んだ事例)、閾値の誤設定、飽和、インフラノイズ。

Quantifying infrastructure noise(2026年2月5日)は Terminal-Bench 2.0 で資源の多寡だけで 6 ポイント動くこと、厳密な 1x 制限でインフラエラー率 5.8%(上限なし 0.5%)を示し、保証割当 + 別の kill ceiling(例として 3x、インフラエラーを約3分の2削減)、資源を「first-class experimental variable」として扱う、3 ポイント未満のリーダーボード差を信用しないことを勧める。Claude Code の eval をコンテナ / CI で回すなら CPU / RAM / 時間を固定し、複数回・複数時刻で走らせ、倍率を記録する。Multi-agent research system の eval 指針も同じ方向で、初期は約 20 クエリ、LLM judge の 0〜1 スコア + pass/fail(事実精度、引用精度、完全性、ソース品質、ツール効率)、状態を持つ agent は end-state で評価する。

#### headless の部品

`claude -p` は `--output-format json`(result、session_id、total_cost_usd、usage)または `--json-schema`(structured_output フィールド)、stream-json では parent_tool_use_id で subagent 木を復元でき、`--forward-subagent-text`(v2.1.211+)で全深度の subagent テキストが流れる。system/init には plugin_errors、mcp_server_errors(v2.1.219+)、capabilities 配列が入る。`--bare` は hooks / skills / CLAUDE.md / MCP / auto memory を飛ばす再現可能モードで「`--bare` is the recommended mode for scripted and SDK calls, and will become the default for `-p` in a future release.」(ANTHROPIC_API_KEY が必要、OAuth 不可)。`--max-budget-usd`、`--permission-mode dontAsk`、`--permission-prompts none`(v2.1.259+、permission_denied メッセージと result の permission_denials)。

```bash
claude -p "Extract the main function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
  | jq '.structured_output'

session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"
```

自前スクリプトからの sectioning(CI では `--bare` を追加):

```bash
for file in $(cat files.txt); do
  claude -p "Migrate $file from Python 2 to Python 3. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)" \
    --permission-mode dontAsk
done
```

注意点: パイプ stdin は 10MB 上限、`-p` は背景作業を最大10分待つ(`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`)、SIGTERM は 143 で終了しターンは未完(SIGINT でターンを終える。`CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1` で継続可)、`--bare` なしの `-p` は untrusted フォルダでもプロジェクト hooks を走らせ .mcp.json を接続する。

#### セッション内スケジューリング

`/loop <interval> <prompt>` は cron タスクを作る(1分粒度、ジッタあり、「Recurring tasks automatically expire 7 days after creation.」、セッションあたり 50 件、CronCreate / CronList / CronDelete)。interval なしは ScheduleWakeup で 1分〜1時間の自己ペース、素の `/loop` はメンテナンスプロンプトか `.claude/loop.md`(25,000 バイト以下)。タスクはセッションが idle のときだけ発火し、`--resume` で復元されるが自己ペース loop は除く。耐久性が要るなら cloud Routines(最小1時間、マシン不要)や Desktop の scheduled task。`CLAUDE_CODE_DISABLE_CRON=1` で無効化。

### 13.8 封じ込め: auto mode、sandbox、記憶の汚染

Steering Claude Code(2026年6月18日)の整理では、常時必要な事実は root CLAUDE.md(200行未満)、チーム別規約はサブディレクトリ CLAUDE.md、制約は paths 付き rules、手順は skills、隔離した副作業は subagent、決定論的自動化は hooks、役割変更は output style(既定のシステムプロンプトを置換し、`keep-coding-instructions: true` がなければ組み込みのコーディング指示を落とす。指示の重みは最も高い)、一回限りの調子は `--append-system-prompt`(指示が増えるほど遵守率が落ちる)。「A real guardrail needs to be deterministic, and the enforcement methods are hooks and permissions.」

auto mode(v2.1.283 から対話 terminal / VS Code の既定開始モード。2026年3月25日の記事)は、ツール出力へのサーバ側 prompt-injection probe と、user メッセージとツール呼び出しだけを見る Sonnet 4.6 の transcript 分類器(stage 1 は単一トークンの yes/no で「err on the side of blocking」、stage 2 は chain-of-thought で再確認)の二層。判定は safe-tool allowlist / ユーザールール → プロジェクト内編集(分類器を通さない)→ shell / web / 外部連携 / subagent / プロジェクト外操作は分類器、の順。実測は実アクション 10,000 件で誤検知 0.4%、実際の過剰行動 52 件のうち見逃し 17%、合成の exfiltration で見逃し 5.7%(stage 1 単体は 8.5% / 6.6% / 1.8%)。deny-and-continue は理由を tool result として返し、連続3回または累計20回で人間にエスカレーション、`claude -p` ではプロセス終了。auto mode に入ると広い allow ルール(素の Bash、ワイルドカード付きインタプリタ、package-manager run)は落ちる。ポリシーテンプレートは environment(既定の信頼範囲は現在の git repo)、block rules(既定 20 以上、破壊 / 流出、セキュリティ劣化、信頼境界の越境、レビュー回避の4群)、allow exceptions の三スロットで、`claude auto-mode defaults` が印字する。subagent への委譲は分類され(deny 可)、戻りは警告のみ。

sandboxing(2025年10月)は OS レベルのファイルシステム隔離(cwd の読み書き)と Unix socket 経由 proxy によるネットワーク隔離(Linux は bubblewrap、macOS は seatbelt)で、社内の permission prompt を 84% 削減した。片方だけでは prompt-injected な agent が流出や脱出をできるので両層が必須。`/sandbox` で有効化、runtime は github.com/anthropic-experimental/sandbox-runtime。How we contain Claude(2026年5月25日)の順序は決定論的な環境層 → 確率的なモデル層 → 外部コンテンツの制限で、incident として、hooks が trust prompt 前に実行された(修正済み)、フィッシングされたユーザーの依頼による資格情報 POST は 25回中24回成功(egress とファイルシステム境界だけが止める)、allowlist 上の api.anthropic.com 経由で攻撃者のキーを使った流出(VM 内 MITM proxy でセッショントークン必須にして修正)。「Every function reachable through any domain on an allowlist is now an attack surface.」未解決のリスクは、永続メモリの汚染(CLAUDE.md、memory、workspace、scheduled agent の状態)、multi-agent の信頼昇格(sub-agent 出力を高信頼扱いすると injection の経路になる)、agent の identity(自分の principal とユーザーの権限)。Claude Code 側の対応は subagent 出力スキャン(v2.1.210)、agent 間メッセージの untrusted フラグ、Managed Agents の read_only memory store、`-p` では trust ダイアログが出ないので `--bare` を使うこと、カスタム proxy / allowlist より gVisor / seccomp / hypervisor のような成熟したプリミティブを使うこと。

### 13.9 API 側の対応物: Claude Code の仕組みを製品に移す

Agent SDK overview の位置づけ表: Agent SDK は Claude Code の agent を自分のプロセスに埋め込む、CLI は対話、Client SDK の tool runner はループを自分で書く、Managed Agents は Anthropic がループを運用する。Agent SDK のループは「gather context → take action → verify work → repeat.」で、検証層は rules-based(lint / 型)、visual(スクリーンショット、Playwright MCP)、LLM-as-judge(最も頑健でない)の三つ。

| Claude Code | Messages API / Managed Agents |
|---|---|
| auto memory、claude-progress.txt | memory tool(memory_20250818)、Managed Agents memory stores(agent-memory-2026-07-22)|
| compaction(ツール出力クリア → 要約) | context editing(context-management-2025-06-27)、threshold compaction(compact-2026-01-12)、on-demand compaction(compact-2026-09-04)|
| MCP 定義の遅延ロード | tool search tool(tool_search_tool_regex / bm25_20251119)|
| スクリプトで CLI / MCP を呼ぶ | programmatic tool calling(code_execution_20260120、GA)|
| reviewer subagent に `model: opus` | advisor tool(advisor_20260301、advisor-tool-2026-03-01)|
| subagent / dynamic workflows | Managed Agents multiagent_20261001(subagents / workflows / advisor)|
| MEMORY.md の手動整理 | dreams(dreaming-2026-04-21、研究プレビュー)|

#### context editing と server-side compaction

context editing は `clear_tool_uses_20250919`(既定: 100,000 入力トークンで発火、直近 3 ツール使用を保持。clear_at_least、exclude_tools、clear_tool_inputs)と `clear_thinking_20251015`(thinking_turns の N か all)。「When using multiple strategies, the `clear_thinking_20251015` strategy must be listed first in the `edits` array.」クリア地点で prompt cache は無効化され、適用結果は `response.context_management.applied_edits`、`count_tokens` で事前確認できる。

```python
context_management={
    "edits": [
        {
            "type": "clear_thinking_20251015",
            "keep": {"type": "thinking_turns", "value": 2},
        },
        {
            "type": "clear_tool_uses_20250919",
            "trigger": {"type": "input_tokens", "value": 50000},
            "keep": {"type": "tool_uses", "value": 5},
        },
    ]
},
```

threshold compaction(既定 150,000 入力トークン、最小 50,000、pause_after_compaction と instructions):

```python
response = client.beta.messages.create(
    betas=["compact-2026-01-12"],
    model="claude-opus-5-5",
    max_tokens=4096,
    messages=messages,
    context_management={"edits": [{"type": "compact_20260112"}]},
)
```

on-demand compaction はトップレベルの `compaction: {type: summarize}` で署名付き compaction ブロックを返し、以後のリクエストでは messages の先頭に置く。「You can't combine `compaction` with `context_management` on one request.」

```python
summary = client.beta.messages.create(
    model="claude-opus-5-5",
    max_tokens=4096,
    system=SYSTEM,
    betas=["compact-2026-09-04"],
    messages=history,
    compaction={"type": "summarize"},
)
if summary.stop_reason == "compaction":
    history = [{"role": "assistant", "content": summary.content}]
```

stop_reason が compaction でないケース(max_tokens、model_context_window_exceeded、tool_use、refusal、end_turn)は 200 で返るので分岐が要る。400 の code は compaction_block_misplaced / compaction_signature_invalid / compaction_content_mismatch / compaction_nothing_to_summarize、529 の compaction_unavailable は再試行可。instructions は 16,384 文字以下で既定プロンプトを置換、要約範囲内の画像・ドキュメント・取得 URL は失われ、途中の role:system メッセージも要約で消えるので再掲する。SDK の tool runner は `compact_before_next_turn()` を持ち、「Both SDKs have deprecated this client-side option in favor of server-side compaction」。

#### advisor tool

安価な executor が生成中にサーバ側で強い advisor を呼ぶ。「The advisor must be Claude Sonnet 4.6 or a more capable model, and it must be at least as capable as the executor.」advisor 出力は通常 400〜700 テキストトークン(thinking 込みで 1,400〜1,800)で advisor 側の料金、`usage.iterations` の advisor_message として現れる。オプションは max_uses、max_tokens(1024 以上)、caching {type: ephemeral, ttl: 5m|1h}。Sonnet 5.5 / Fable 5.1 / Mythos 5.1 / Opus 5.5 / Opus 5 / Fable 5 / Mythos 5 / Haiku 5.5 の advisor は advisor_redacted_result(暗号化)を返し、claude-opus-4-8 などは平文。user メッセージに `(Advisor: please keep your guidance under 80 words ...)` のような長さ指定を置いて steer できる。

```python
response = client.beta.messages.create(
    model="claude-sonnet-5",
    max_tokens=4096,
    betas=["advisor-tool-2026-03-01"],
    tools=[
        {
            "type": "advisor_20260301",
            "name": "advisor",
            "model": "claude-opus-5-5",
        }
    ],
    messages=[{"role": "user", "content": "Build a concurrent worker pool in Go with graceful shutdown."}],
)
```

#### Managed Agents

beta header `managed-agents-2026-04-01`。Agent(model、system prompt、tools、MCP、skills)+ Environment(cloud または self-hosted sandbox)+ Session(append-only のイベントログ)+ Events で、「Pre-built, configurable agent harness that runs in managed infrastructure」。prompt caching と compaction は組み込み、scheduled deployment あり、状態をサーバ側に持つため ZDR / HIPAA 非対象。Scaling Managed Agents(2026年4月8日)は brain(Claude + harness)、hands(sandbox / tools、`execute(name, input) → string`)、session(getEvents / emitEvent)を仮想化して差し替え可能にし、lazy provisioning で p50 TTFT 約 60%、p95 90% 超を短縮、資格情報は sandbox にも harness にも届かない。

`multiagent_20261001` ブロックは subagents(永続 session thread、「Delegation is one level deep, and a session can have at most 25 child threads at a time, idle ones included.」、predefined リストは最大 20)、workflows(サーバ実行の phase 付きプログラム。開始判断は agent、system prompt で誘導)、advisor(primary thread のみ、thread 上限に含まれない)を合成する。inline agents は既定 on、`inline_agents {type: disabled}` には predefined を1つ以上付けないと 400。predefined 参照は作成 / 更新時にバージョン固定。自分の multiagent ブロックを持つ agent は他の subagent になれない。`ant__` 接頭辞は予約、advisor は `anthropic.advisor` を予約。session 作成時に budget を設定すると run を含めて上限が効き、超過で一時停止、引き上げで再開。

```json
{
  "multiagent": {
    "type": "multiagent_20261001",
    "subagents": {
      "type": "enabled",
      "inline_agents": { "type": "disabled" },
      "predefined_agents": ["agent_01J8XkN5uT3vHpLqRfWdY2", { "type": "self" }]
    },
    "workflows": {
      "type": "enabled",
      "inline_agents": { "type": "disabled" },
      "predefined_agents": [
        { "type": "agent", "id": "agent_01Lm4cV8yQ2tNs7XbKdR5h", "version": 2 }
      ]
    }
  }
}
```

workflow run を始める条件は system prompt に書く(Claude Code の CLAUDE.md で ultracode の発火条件を書くのと同じ技法):

```text
You review contracts. When you're asked to review more than a few contracts, start a workflow run that reads them in parallel and combines the findings. Review one or two contracts yourself, without a run.
```

失敗処理(「One agent failing must not fail the run」)も明示する。「Plan first... wait for my go-ahead」は強制されない。

memory store(store エンドポイントは `agent-memory-2026-07-22`、sessions は `managed-agents-2026-04-01`。両方送ると 400)は sandbox の `/mnt/memory/<slug>/` にマウントされ、memory あたり 100 kB(約 25k トークン)、store あたり 10,000 件、session あたり 8 store、attach は session 作成時のみ、version は不変で 30 日保持、redact 可、`content_sha256` で楽観的並行制御。self-hosted sandbox では 15 秒間隔の同期コピー(session 終了時にもう一度)であり live mount ではない。既定 access は read_write だが、「If the agent processes untrusted input (user-supplied prompts, fetched web content, or third-party tool output), a successful prompt injection could write malicious content into the store.」ので参照用は read_only にする。

```python
session = client.beta.sessions.create(
    agent=agent.id,
    environment_id=environment.id,
    resources=[
        {
            "type": "memory_store",
            "memory_store_id": store.id,
            "access": "read_write",
            "instructions": "User preferences and project context. Check before starting any task.",
        }
    ],
)
```

dreams(`dreaming-2026-04-21` + `managed-agents-2026-04-01`、研究プレビュー)は memory store と 1〜100 の session transcript を読み、重複排除・再編成した新しい store を書く非同期ジョブで「The input store is never modified, so you can review the output and discard it if you don't like the result.」instructions は 4,096 文字以下、行単位の編集はできない。状態は pending → running → completed / failed / canceled、標準トークン料金。Claude Code のローカルには dream 相当はなく、MEMORY.md の整理は手動か Claude 主導である。

### 落とし穴と対策

- 指示は保証ではない。CLAUDE.md / rules / skills / output style は助言で、強制は hooks(PreToolUse exit 2 または permissionDecision deny)と permission rules だけ。hook の exit 1 は非阻止エラーであり、ポリシー強制には exit 2 を使う。
- Stop hook と /goal には上限がある。ツール呼び出しなしで 8 回連続継続するとターンが終わる(`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`)。/goal の evaluator はツールを走らせないので、transcript 上で証明できる条件を書く。
- prompt hook の PreToolUse deny(v2.1.210 以降)と PostToolUse deny は `continueOnBlock: true` がないとターンを終える。agent hook は常に継続。
- compaction 後、サブディレクトリ CLAUDE.md とパス限定 rules は再び触るまで消える。hook が追加した文脈も要約される。対策は SessionStart の `compact` matcher で再注入し、skill の重要指示は先頭 5,000 トークン内に置く。
- auto memory は MEMORY.md の先頭 200 行 / 25KB だけが載り、マシンローカルで、非 fork subagent には渡らない。subagent の `memory` は別ディレクトリ。
- workflow script は import / ファイルシステム / `Date.now()` / `Math.random()` / `new Date()` が使えない(replay の決定性)。agent() は null を返しうるので `.filter(Boolean)`。fan-out 途中の失敗は、その後に始まった agent をすべて再実行する。`meta` は最初の文でリテラル。
- `ultracode` キーワードは人間が打ったプロンプトでしか効かない。`-p` / SDK では `Workflow` または `Workflow(<name>)` の allow ルール、auto mode、bypass、PreToolUse allow、canUseTool のいずれかが必要。plan mode では PreToolUse の承認だけでは始まらない。
- workflow はトークンを大量に消費する。Large 警告(25 agent 超 / 1.5M トークン超)は助言であり ultracode 時は出ない。同時 subagent 20 の制限も ultracode 下では効かない。`workflowSizeGuideline` と `--max-budget-usd` で枠を決める。
- agent teams を有効にすると、名前で呼んだ subagent は全部 teammate になる。worktree 隔離なし、/resume で復元されず、ネスト不可、teammate の permission prompt は lead に出る。
- `--bare` なしの `claude -p` は untrusted フォルダでも hooks を実行し .mcp.json を接続する。`--bare` は ANTHROPIC_API_KEY が必要で CLAUDE.md / skills / auto memory / hooks を飛ばす。
- `-p` は背景作業を最大 10 分待つ。SIGTERM は 143 で未完終了、stdin は 10MB まで。
- auto mode に入ると広い allow ルールが落ちる。連続 3 回 / 累計 20 回の deny でエスカレーション、`-p` では終了。実際の過剰行動の約 17% を見逃すので、高リスクなインフラ作業ではレビューの代替にならない。
- API: `compaction` と `context_management` は同一リクエストで併用不可。threshold の compaction ブロックは末尾に付くが on-demand のブロックは先頭に置く(ブロックの後に残った要約済みメッセージは黙って再送される)。要約範囲内の画像 / ドキュメント / 取得 URL は消える。
- memory store の API は `agent-memory-2026-07-22` を `managed-agents-2026-04-01` の代わりに送る(両方で 400)。attach は session 作成時のみ、8 store / session、100 kB / memory、10,000 memory / store。既定 read_write は injection の永続化リスク。
- tool search: 非 deferred ツールが最低一つ必要、defer_loading と cache_control の併用は 400、regex は 200 文字、BM25 は 500 文字、定義は毎回全部送る。`srvtoolu_` ID に tool_result を返さない。
- programmatic tool calling: allowed_callers は安全境界ではない。継続時の container id 必須、保留呼び出しは約 4 分でタイムアウト、tool-result の user メッセージは tool_result ブロックのみ。
- Managed Agents multiagent: 委譲は一段、自前の multiagent ブロックを持つ agent は他の subagent になれない、inline disabled には predefined が 1 つ以上要る、参照はバージョン固定、advisor 出力は advisor モデルによって redacted。
- subagent description は合計約 15,000 トークンの警告閾値を共有する。Explore / Plan は再開不可。subagent の最終出力は v2.1.210 以降スキャンされ、control tag / turn marker の模倣は無害化される。
- eval: trial 間の共有状態(キャッシュ、git 履歴、残留ファイル)は相関した失敗を生む。資源制限で約 6 ポイント動く。固定ツール順序の grader は正しい解を落とす。0% pass はまず grader を疑う。
- workflow / teammate の prompt cache は別の 5 分 TTL(`subagentPromptCacheTtl: 1h` は高コスト)。sibling がキャッシュを共有するのは model / effort / agent type / tools / output schema / cwd が一致するときだけ。
- 自己評価は甘い。generator と evaluator を分け、few-shot のスコア付き例で較正し、人間の判断に対して数ラウンド調整する前提で組む。
- `/loop` の繰り返しタスクは 7 日で失効し、session が idle のときだけ発火し、自己ペース loop は `--resume` で戻らない。耐久性が要るなら Routines / GitHub Actions / Desktop の scheduled task。
- コミュニティの「Ralph Wiggum loop」plugin(`/ralph-loop`、completion-promise フラグ等)は第三者情報(未検証)。公式に確認できるのは科学計算 run の `--max-iterations 20` と "DONE" ラッパーだけで、/goal、prompt / agent Stop hook、/loop がその役割を担う。
- 「A harness for every task」ブログで挙げられたとされる六つのオーケストレーションパターン(classify-and-act、fan-out-and-synthesize、adversarial verification、generate-and-filter、tournament など)は原文を取得できておらず第三者要約のみ(未検証)。

### 中級者が次にやること

1. **CLAUDE.md を 200 行以下に刈り、「Compact Instructions」と ASSUME INTERRUPTION 文を入れる。** `/doctor` と `/doctor prompt-audit`(v2.1.283+)の提案を適用し、memory tool の protocol 文面を claude-progress.txt 用に書き換えて追加する。`/context` でロード量を確認する。
2. **initializer / coding の二段ハーネスを自分のリポジトリで再現する。** 最初のセッションで init.sh、claude-progress.txt、`features.json`(各項目 category / description / steps / passes: false)、初期コミットを作らせ、以後は「ONE feature、コミット、progress 更新」だけを指示する coding プロンプトを skill(`disable-model-invocation: true`)にする。CHANGELOG.md に失敗したアプローチを書かせるルールを CLAUDE.md に足す。
3. **検証を階段で強化する。** まず `/goal "<条件> or stop after 20 turns"` を auto mode で試し、次に prompt 型 Stop hook、必要ならテストを実際に走らせる agent 型 Stop hook に置き換える。`stop_hook_active` ガードと `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` を忘れない。
4. **reviewer を分離する。** `model: opus`、`tools: Read, Grep, Glob, Bash` の reviewer subagent を `.claude/agents/` に置き、「正しさと要件のギャップだけを報告」と書く。`/code-review` との差を実際の PR で比べる。
5. **「指示」を hook に昇格させる。** 守られないルールを一つ選び、PreToolUse の command hook(exit 2)に移す。db-reader の `validate-readonly-query.sh` を雛形にする。compaction 後に消える rule は SessionStart `compact` matcher で再注入する。
6. **dynamic workflow を一本書く。** `/workflow-authoring` で `.claude/workflows/<name>.js` を作り、`agent()` の `schema` で JSON を取り、`pipeline()` で fan-out、`.filter(Boolean)` で null を除く。`-p` から動かすなら `Workflow(<name>)` の allow ルールを settings に足す。`workflowSizeGuideline` と予算を決めてから走らせる。
7. **eval を 20 タスクから始める。** 実失敗から task を集め、`claude -p --bare --output-format json --json-schema` で structured_output と total_cost_usd を取り、grader は code-based から。pass^k で一貫性を測り、コンテナの CPU / RAM を固定し複数回走らせる。
8. **ツール設計をツールに改善させる。** `claude mcp add` でプロトタイプし、複数呼び出しの現実的タスクで transcript を取り、Claude Code に description を書き直させる。`input_examples` を 1〜5 件付ける。10 ツール以上なら Claude Code 側の遅延ロードを前提に、API 側では tool search の defer_loading を設計する。
9. **API 製品化のときは対応表どおりに移す。** auto memory → memory tool / memory store(参照用は read_only)、compaction → threshold か on-demand(併用不可)、reviewer → advisor、workflow → Managed Agents multiagent。beta header は文中の表記をそのまま使う。
10. **封じ込めを先に決める。** `/sandbox` を有効化し、auto mode の block rules を `claude auto-mode defaults` で確認、CI では `--bare` + `--max-budget-usd` + `--permission-prompts none`。subagent 出力や agent 間メッセージを高信頼扱いしない設計を CLAUDE.md とレビュー手順に明記する。

### 出典

- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/engineering/harness-design-long-running-apps
- https://claude.com/blog/building-agents-with-the-claude-agent-sdk
- https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them
- https://www.anthropic.com/engineering/writing-tools-for-agents
- https://www.anthropic.com/engineering/advanced-tool-use
- https://www.anthropic.com/engineering/code-execution-with-mcp
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://www.anthropic.com/engineering/infrastructure-noise
- https://www.anthropic.com/engineering/building-c-compiler
- https://www.anthropic.com/research/long-running-Claude
- https://www.anthropic.com/engineering/claude-code-auto-mode
- https://www.anthropic.com/engineering/claude-code-sandboxing
- https://www.anthropic.com/engineering/how-we-contain-claude
- https://www.anthropic.com/engineering/claude-think-tool
- https://www.anthropic.com/engineering/managed-agents
- https://claude.com/blog/introducing-dynamic-workflows-in-claude-code
- https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/goal
- https://code.claude.com/docs/en/scheduled-tasks
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/memory-tool
- https://platform.claude.com/docs/en/build-with-claude/context-editing
- https://platform.claude.com/docs/en/build-with-claude/compaction
- https://platform.claude.com/docs/en/build-with-claude/compaction-on-demand
- https://platform.claude.com/docs/en/build-with-claude/compaction-threshold
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-search-tool
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/programmatic-tool-calling
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/advisor-tool
- https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-runner
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
- https://platform.claude.com/docs/en/managed-agents/overview
- https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration
- https://platform.claude.com/docs/en/managed-agents/memory
- https://platform.claude.com/docs/en/managed-agents/dreams
- https://github.com/anthropics/claude-quickstarts/tree/main/autonomous-coding
