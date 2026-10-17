## 第4章 サブエージェントと並列実行(Agent teams, worktrees)

### この章で分かること

Claude Code の並列化は「誰が調整するか」「ワーカー同士が会話する必要があるか」「同じファイルを触るか」の3問で手段が決まる。本章では subagent の定義ファイルの読み込み順序と frontmatter の全フィールド、モデル/effort/ツールの解決順、background と fork の挙動、agent teams の内部構造(共有タスクリストとメールボックス)、cross-session messaging のソケット仕様、worktree 分離の強制範囲と抜け穴、agent view(`claude agents`)のスクリプト連携までを、2026年10月16日時点の v2.1.302 までの公式ドキュメントと changelog に基づいて整理する。各設定は再現可能なスニペットとして示し、バージョン依存の挙動は版番号を併記する。落とし穴は「サイレントに無視される設定」と「意図せず teams が形成される」ケースを中心に扱う。

### 4.1 並列化の5つの面と3つの補助機構

公式の `agents` ページが正典の決定表になっている。並列化の面は5つ(subagents、agent view、agent teams、dynamic workflows、projects)、補助機構は3つ(worktrees、cross-session messaging、`/batch`)である。`/batch` は「1つの大きな変更を 5〜30 個の worktree 分離 subagent に分割する skill」であり、独立した調整方式ではなく subagents と worktrees のパッケージ利用にすぎない。

| 問い | 答えと手段 |
|---|---|
| 誰が調整するか | Claude が1つの会話内で調整 → subagents。あなたが手渡す → agent view。Claude が計画し割り当てる → agent teams。スクリプトが計画を持つ → workflows |
| ワーカー同士が話すか | subagent は spawner にのみ報告。agent view のセッションはあなたにのみ報告。teammate 同士はメッセージ可能 |
| 同じファイルを触るか | worktrees で分離。subagent とあなた自身が動かすセッションは個別 worktree を使える。**agent teams は teammate を worktree 分離しない**ので、ファイル所有権で作業を分割する |

ここで混同しやすいのは、fork した subagent(`/subtask`)と `/fork`(セッションを background にコピー)が別物である点である。前者は会話履歴を継承する subagent、後者は agent view のセッション複製である。

### 4.2 subagent 定義の読み込み順序と frontmatter

#### スコープの優先順位

同名の定義が複数ある場合、優先順位は以下の通り(数字が小さいほど勝つ)。

| 優先 | 場所 | 範囲 |
|---|---|---|
| 1 | managed settings | 組織全体 |
| 2 | `--agents` CLI フラグ | 現在のセッション |
| 3 | `.claude/agents/` | 現在のプロジェクト(cwd から上に辿り、最も近いものが勝つ) |
| 4 | `~/.claude/agents/` | 全プロジェクト |
| 5 | plugin の `agents/` | plugin が有効な場所 |

ディレクトリは再帰的に走査されるが、識別子はファイル名ではなく `name` フィールドのみから決まる。同一ツリー内で `name` が重複した場合はファイルシステムの読み込み順(未定義)で解決され、`/doctor` が警告する。plugin のサブフォルダはスコープ付き id の一部になる(`my-plugin:review:security`)。

`~/.claude/agents` と `.claude/agents` は監視されライブリロードされるが、セッション開始後に新規作成した agents ディレクトリ、`--add-dir` / `/add-dir` 配下の `.claude/agents`、`--disable-slash-commands` で起動したセッションの3ケースは再起動が必要である。

#### 最小構成と本文の意味

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
tools: Read, Glob, Grep
model: sonnet
---

You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```

`.claude/agents/code-reviewer.md` に置く。必須は `name` と `description` のみ。本文が subagent のシステムプロンプトになり、Claude Code 本体のシステムプロンプトは含まれない。

#### frontmatter フィールド全体

`name`、`description`(必須)、`tools`、`disallowedTools`、`model`、`permissionMode`、`maxTurns`、`autoCompactWindow`、`skills`、`mcpServers`、`hooks`、`memory`、`background`、`omitClaudeMd`、`effort`、`isolation`、`color`、`initialPrompt`、`experimental`(`cacheTtl`)。複数語のフィールドは camelCase で、表と完全一致しなければならない。認識しないフィールドはエラーなしに無視される(v2.1.296 以降は debug ログに "does not recognize or apply" と最大5件まで記録)。`name` は256文字以内、`:` を含まず、`-` で始められない。hooks には `name` が `agent_type` として渡される。

#### サイレントにスキップされるファイル

以下の条件に該当するファイルは、セッション内では何も警告されずに読み込まれない。エラーは `--debug` ログにのみ出る。

- 1行目に `---` がない
- `name` がない(ドキュメントファイルとして扱われる。ただし plugin の subagent はファイル名で読み込まれる)
- `name` が不正
- `description` がない
- YAML が解析できない

事前チェックには `claude plugin validate .claude/agents`(v2.1.233 以降)を使う。

#### 組み込み subagent

- **Explore**: 読み取り専用。CLAUDE.md と git status をスキップする。thoroughness は quick / medium / very thorough。
- **Plan**: plan mode 内の読み取り専用リサーチ。
- **general-purpose**: subagent が使える全ツール。
- **claude**: 汎用。dispatch された background セッションの既定エージェント。モデルは「独自のものを持たず、モデル解決順に従う」。
- **statusline-setup**(Sonnet)、**claude-code-guide**(Haiku)。

Explore のモデル規則は配信経路で異なる。Claude サブスクリプション、Anthropic Console、`ANTHROPIC_BASE_URL` 経由の LLM ゲートウェイでは、メイン会話が Fable のとき Explore は `opus` エイリアスのモデルに切り替わる。Amazon Bedrock、Google Cloud の Agent Platform、Microsoft Foundry、Claude Platform on AWS、Claude apps gateway ではメインのモデルのままである。changelog 2.1.284 により、プロキシ背後の未知のモデル ID では Explore はそのモデルを継承する。ユーザー/プロジェクトスコープに `name: Explore` の定義を置くと組み込みを上書きし、その `model` が有効になるので、`model: haiku` で探索を安価にできる。

組み込みの制限方法は4つある。`permissions.deny: ["Agent(Explore)"]`、`Agent` ツール全体の deny、`CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1`(v2.1.198 以降)、`-p`/SDK での `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`。general-purpose のフォールバックがないセッションで `subagent_type` を省略した Agent 呼び出しは `subagent_type is required` で失敗する。

```json
{
  "permissions": {
    "deny": ["Agent(Explore)", "Agent(my-custom-agent)"]
  },
  "env": {
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2"
  }
}
```

settings.json。特定 subagent の無効化と入れ子深さの上限を同時に設定する例(公式の2つのスニペットを結合)。`Agent(fork)` を deny すると fork mode は維持したまま fork だけ止まる。

### 4.3 モデル、effort、thinking の解決順

#### subagent のモデル(v2.1.251 以降)

1. 呼び出しごとの `model` パラメータ(mod の `agent.spawn` hook はこれを置き換える)
2. 定義の `model` frontmatter(`inherit` はメイン会話のモデル)
3. `CLAUDE_CODE_SUBAGENT_MODEL` 環境変数
4. メイン会話のモデル

v2.1.251 より前は環境変数が最優先で、`model: inherit` すら上書きしていた。ファミリーエイリアス(例 `opus`)はメインがそのファミリーならメインの正確な ID([1m] を含む)に解決される。もう1つ、Bedrock の application inference profile ARN のような未解決の非 Anthropic ファミリーでも `opus` だけはメインのモデルに解決される(`ANTHROPIC_DEFAULT_OPUS_MODEL` が設定されていれば別)。`availableModels` でブロックされたファミリーエイリアスは許可された最新版に置換され(v2.1.222 以降)、それ以外のブロック値は継承モデルに置換されて対話セッションでは警告が出る。`/tasks` は subagent ごとのモデルと effort を表示する(v2.1.242 以降)。

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku",
    "CLAUDE_CODE_SUBAGENT_MODEL_FORCE": "1"
  }
}
```

settings.json。`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1`(v2.1.257 以降)は frontmatter と呼び出しごとのモデルを無視して subagent、teammate、workflow agent をすべて指定モデルで動かす。例外は fork と `model: inherit` の `context: fork` skill で、これらはメインのモデルのまま。FORCE だけを設定した場合、subagent はメインのモデルで動き、Explore は前述の規則に従う。

#### effort と thinking

effort の優先順位は `CLAUDE_CODE_EFFORT_LEVEL` 環境変数 > 呼び出しごとの `effort` パラメータ(v2.1.292 以降、resume を通じて維持) > frontmatter `effort` > セッションの effort。値は low / medium / high / xhigh / max でモデルにより利用可否が変わる。

extended thinking は v2.1.198 以降メイン会話の設定を継承する。subagent 単位の thinking 設定は存在しない(v2.1.198 以前は常に無効だった)。

### 4.4 ツールの解決とフィルタ

#### tools / disallowedTools の組み合わせ

- どちらも未設定: subagent が使える全ツールを継承
- `tools` のみ: 列挙したもののみ
- `disallowedTools` のみ: 親の全ツールから列挙分を除外
- 両方: `disallowedTools` が先に適用され、両方に載ったツールは削除される

```yaml
---
name: no-writes
description: Inherits the available tools except file writes
disallowedTools: Write, Edit
---
```

`.claude/agents/no-writes.md`。MCP サーバー単位のワイルドカードも使える。`tools` に `mcp__github__*`(1サーバーを許可)、`disallowedTools` に `mcp__github` または `mcp__github__*`(1サーバーを拒否)、`mcp__*`(全 MCP を拒否)。`tools` のエントリが1つも解決しない場合、v2.1.208 以降は通常 `Agent would be spawned with zero tools` で起動に失敗する(それ以前はツールなしで起動していた)。subagent の起動自体は権限プロンプトを出さない。auto mode では `SubagentHandback`(v2.1.271 以降)が `tools` から外しても `disallowedTools` に載せても注入される。

#### 非 fork subagent に必ず適用される2つのフィルタ

**削除リスト**: AskUserQuestion、EnterPlanMode、ExitPlanMode(`permissionMode: plan` でなければ)、ScheduleWakeup、WaitForMcpServers、Workflow、EndConversation、深さ上限に達した場合の Agent。AskUserQuestion は subagent では決して使えない。

**background フィルタ**: background で動く subagent は全 MCP ツールを保持するが、組み込みツールは `Read`、`Grep`、`Glob`、`LSP`、`Bash`、`PowerShell`、`Edit`、`Write`、`NotebookEdit`、`WebFetch`、`WebSearch`、`TodoWrite`、`Skill`、`ToolSearch`、`EnterWorktree`、`ExitWorktree`、`Monitor`、`TaskStop`、`SendMessage`、`Artifact`(auto mode では `SubagentHandback` も)に限定される。`ListAgents` は background で落ちる。対話セッションでは background が既定なので、**同じ定義が foreground と background で異なるツールセットに解決される**。fork は両フィルタをスキップする。teammate は追加で `TaskCreate/TaskGet/TaskList/TaskUpdate` と `CronCreate/CronDelete/CronList` を保持する。macOS/Linux/WSL ではメインに Glob/Grep がなくても subagent が受け取る場合がある。

#### Agent(...) 許可リストの適用範囲

```yaml
---
name: coordinator
description: Coordinates work across specialized agents
tools: Agent(worker, researcher), Read, Bash
---
```

`Agent(worker, researcher)` の型リストは、この agent が `claude --agent coordinator` でメインスレッドとして動くときのみ有効。subagent 定義の中では括弧内のリストは無視され、`Agent` があれば深さ上限まで任意の型を spawn できる。`Agent` を `tools` から外せば spawn 不可になる。`Task(...)` は v2.1.63 以降エイリアスとして残っている。

### 4.5 mcpServers、hooks、skills、memory

#### mcpServers: サーバーを subagent に閉じ込める

```yaml
---
name: browser-tester
description: Tests features in a real browser using Playwright
mcpServers:
  # Inline definition: scoped to this subagent only
  - playwright:
      type: stdio
      command: npx
      args: ["-y", "@playwright/mcp@latest"]
  # Reference by name: reuses an already-configured server
  - github
---

Use the Playwright tools to navigate, screenshot, and interact with pages.
```

`.claude/agents/browser-tester.md`。インライン定義(stdio/http/sse/ws)は subagent 開始時に接続し終了時に切断されるので、ツール説明がメイン会話のコンテキストを消費しない。文字列参照は親セッションの接続を共有する。プロジェクトの `.claude/agents/` にあるインラインサーバーはそのフォルダを trust した後にのみ読み込まれる(v2.1.238 以降、親フォルダの trust は不可)。名前参照、`~/.claude/agents/`、`--agents`、SDK、managed settings 由来のインラインサーバーは trust を確認しない。managed の MCP allow/deny、`--strict-mcp-config`、`--bare` は適用されるが、`--strict-mcp-config` は `--agents`/SDK 経由のサーバーをフィルタしない。plugin subagent ではこのフィールドは無視される。

#### hooks: subagent がアクティブな間だけ

```yaml
---
name: code-reviewer
description: Review code changes with automatic linting
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/validate-command.sh"
  PostToolUse:
    - matcher: "Edit|Write"
      hooks:
        - type: command
          command: "./scripts/run-linter.sh"
---
```

frontmatter の hooks はこの subagent がアクティブな間だけ走り、`Stop` は `SubagentStop` に変換される。プロジェクトレベルの frontmatter hooks はそのフォルダ自体の trust が必要(v2.1.218 以降)で、`-p` セッションは trusted と見なされない。trust 前でも subagent は動くが hooks はスキップされ、debug ログにのみ記録される。

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

`tools: Bash` と PreToolUse matcher `Bash` を持つ `db-reader` agent と組み合わせる読み取り専用バリデータ。exit 2 でブロック。`chmod +x` しないと hook 自体が失敗し、ブロックにならない。

```json
{
  "hooks": {
    "SubagentStart": [
      {
        "matcher": "db-agent",
        "hooks": [
          { "type": "command", "command": "./scripts/setup-db-connection.sh" }
        ]
      }
    ],
    "SubagentStop": [
      {
        "hooks": [
          { "type": "command", "command": "./scripts/cleanup-db-connection.sh" }
        ]
      }
    ]
  }
}
```

`.claude/settings.json`。settings 側の hooks(PreToolUse 等)は subagent 内でも発火する。SubagentStart/SubagentStop の matcher は agent の `name`。plugin agent の場合は `:` が入るため、`^my-plugin:db-agent$` のようにアンカー付き正規表現にする。

#### skills: プリロードであってアクセス制限ではない

```yaml
---
name: api-developer
description: Implement API endpoints following team conventions
skills:
  - api-conventions
  - error-handling-patterns
---

Implement API endpoints. Follow the conventions and patterns from the preloaded skills.
```

列挙した skill の全文が起動時に注入される(最初の32個まで、v2.1.295 以降の上限)。アクセスを制限するものではなく、制限したければ `Skill` を tools から外す。`disable-model-invocation: true` の skill(同梱の `/verify` を含む)はプリロードできない。`context: fork` の skill(skill 側が agent を決める)の逆方向の機構である。agent team の teammate にはいずれの表示モードでも `skills` は適用されない。

#### memory: 永続ディレクトリ

```yaml
---
name: code-reviewer
description: Reviews code for quality and best practices
memory: user
---

You are a code reviewer. As you review code, update your agent memory with
patterns, conventions, and recurring issues you discover.
```

`user` → `~/.claude/agent-memory/<name>/`、`project` → `.claude/agent-memory/<name>/`、`local` → `.claude/agent-memory-local/<name>/`。MEMORY.md の先頭200行または25KB がシステムプロンプトに注入され、Read/Write/Edit が自動で有効化される。公式は VCS で共有できる `project` を推奨し、本文に自己キュレーションの指示を書くことを勧めている。auto memory が無効(`autoMemoryEnabled: false` または `CLAUDE_CODE_DISABLE_AUTO_MEMORY`)だと何もしない。

#### autoCompactWindow と cacheTtl

```yaml
---
name: log-reader
description: Reads long log files and reports the errors it finds
autoCompactWindow: 200000
---
```

v2.1.296 以降。範囲は 100000〜1000000 のプレーン整数。`200k` は 200 と解釈されて範囲外となり、警告なしに無視される。`CLAUDE_CODE_AUTO_COMPACT_WINDOW` はこのフィールドを上書きし、`CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` も適用される。`--agent` でメインセッションとして動く場合は無効。圧縮はトランスクリプトに `{"type":"system","subtype":"compact_boundary","compactMetadata":{"trigger":"auto","preTokens":167189}}` として記録される。別途 `experimental:\n  cacheTtl: 1h`(v2.1.248 以降)でプロンプトキャッシュ寿命を選べるが、サブスクリプションが usage credits を使っている間は無視される。Bedrock/Agent Platform/Foundry で有効かは明記されていない(未検証)。

### 4.6 permissionMode の実効範囲

値は `default`(`manual` の別名)、`acceptEdits`、`auto`、`dontAsk`、`bypassPermissions`、`plan`。ただし有効なのはメイン会話が default / dontAsk / plan のときのみで、メインが bypassPermissions / acceptEdits / auto のときは subagent もそのモードで動き、フィールドは無視される。v2.1.267 以降、subagent は自力で bypassPermissions に昇格できない(メインが既に bypass のときのみ有効)。`auto` は auto mode が使えなければフォールバックする。plugin subagent はこのフィールドを完全に無視する。auto mode では classifier が subagent の最終レポートも配信前に審査する。

### 4.7 委譲の制御: description、@-mention、--agent

自動委譲は `description` だけで決まる。全定義の description 合計が15,000トークンを超えると起動時に警告が出る(読み込みはされる)。「Use proactively」「Use immediately after」のような表現が自動委譲を促す。

```markdown
---
name: code-reviewer
description: Expert code review specialist. Proactively reviews code for quality, security, and maintainability. Use immediately after writing or modifying code.
tools: Read, Grep, Glob, Bash
model: inherit
---

You are a senior code reviewer ensuring high standards of code quality and security.

When invoked:
1. Run git diff to see recent changes
2. Focus on modified files
3. Begin review immediately

Review checklist:
- Code is clear and readable
- Functions and variables are well-named
- No duplicated code
- Proper error handling
- No exposed secrets or API keys
- Input validation implemented
- Good test coverage
- Performance considerations addressed

Provide feedback organized by priority:
- Critical issues (must fix)
- Warnings (should fix)
- Suggestions (consider improving)

Include specific examples of how to fix issues.
```

明示的な呼び出しは3段階で強制力が上がる。自然言語 < @-mention(`@"code-reviewer (agent)"` または `@agent-<name>`) < セッション全体の `claude --agent <name>` / `"agent"` 設定。@-mention はどの subagent が動くかは保証するが、タスクプロンプトは依然 Claude が書く。

```json
{
  "agent": "code-reviewer"
}
```

`.claude/settings.json`。`claude --agent code-reviewer` が上書きする。agent 本文が Claude Code のシステムプロンプトを完全に置き換え(本文が空でなければ)、resume を通じて維持される。`initialPrompt` は最初のターンとして自動送信される。`--agent` のときは `omitClaudeMd` を設定しても CLAUDE.md とプロジェクトメモリは読み込まれる。独自プロンプトの `-p` セッションは git status スナップショットなしで始まる。

```bash
claude --agents '{
  "code-reviewer": {
    "description": "Expert code reviewer. Use proactively after code changes.",
    "prompt": "You are a senior code reviewer. Focus on code quality, security, and best practices.",
    "tools": ["Read", "Grep", "Glob", "Bash"],
    "model": "sonnet"
  },
  "debugger": {
    "description": "Debugging specialist for errors and test failures.",
    "prompt": "You are an expert debugger. Analyze errors, identify root causes, and provide fixes."
  }
}'
```

セッション限定の定義(優先度2、プロジェクトファイルより上)。`-p` では JSON ファイルパスも受け付ける(v2.1.281 以降)。`color` と `experimental` は無視される。

### 4.8 background、fork、resume、入れ子、同時実行

#### foreground / background の決定順

1. in-process teammate の subagent → foreground
2. `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` → foreground
3. fork mode on(対話セッションの既定) → 常に background。`run_in_background` パラメータは取り除かれ、Claude は foreground を要求できない
4. fork mode off → 既定 background、Claude が結果を必要とするときは foreground。`background: true` frontmatter で background に固定

fork mode の既定は対話セッションで on(v2.1.232 以降)。changelog 2.1.302(2026-10-16)によれば `claude -p`、Agent SDK、デスクトップアプリ、VS Code でも on になり、`CLAUDE_CODE_FORK_SUBAGENT=0` で全面オフ、`claude mcp serve` は決して提供しない。ただし 2026-10-17 時点の sub-agents ページはまだ「`-p` と SDK では既定オフ」と記述しており、changelog の方が新しい。同じ 2.1.302 で、デスクトップ/VS Code はメイン会話の subagent を常に background で動かし、`-p`/SDK/デスクトップ/VS Code における subagent 自身の Agent 呼び出しは既定で foreground になった。

background subagent の権限プロンプトはメインセッションに subagent 名付きで表示され、Esc で1回分を拒否する。そこでセッション全体の許可を与えればセッション全体に適用される。Ctrl+B で実行中タスクを background に送れる。結果は後のターンに完了通知として届き、Claude はそれを待ってから報告する(v2.1.211 以降)。完了行はパネルから即座に消え、`/tasks to see subagents` のフッターヒントが30秒出る。失敗/停止行は30秒残る。

#### fork subagent

fork は会話履歴、システムプロンプト、ツール、モデル、プロンプトキャッシュをすべて継承し、最終結果だけを返す。システムプロンプトとツール定義が親と同一なので、最初のリクエストが親のキャッシュを再利用し、同じコンテキストを必要とするタスクでは新規 subagent より安い。起動は Claude が `subagent_type: fork` を要求するか、あなたが `/subtask <task>`(v2.1.212 以降。v2.1.161〜211 と agent view オフ時は `/fork`)を打つ。fork は fork を spawn できない。`isolation: "worktree"` は渡せる。2.1.285 で fork が親の permission mode(plan / dontAsk)を維持し plan mode を抜けられないよう修正された。

#### 非 fork subagent が起動時に受け取るもの

自身のシステムプロンプト + 環境詳細(Claude Code のシステムプロンプトは含まない)、委譲メッセージ、CLAUDE.md 階層全体(Explore/Plan/`omitClaudeMd` を除く)、git status スナップショット(Explore/Plan を除く)、プリロード skill、SendMessage を持つ場合は sibling の一覧。受け取らないものは、output style、auto memory、既に呼び出された skill、既に読んだファイル、親のコンテキストウィンドウサイズ。コンテキストウィンドウは subagent 自身のモデルで決まる。`--append-subagent-system-prompt[-file]`(v2.1.205 / v2.1.261、`-p` のみ)で fork 以外の全 subagent プロンプトに追記できる。

#### resume

SendMessage(to = agent ID または名前)で履歴付きで再開できる。SendMessage には agent teams は不要。Explore/Plan は one-shot で agent ID を返さず再開不可なので、継続が要るなら `general-purpose` かカスタム定義を使う。`maxTurns` で止まった出力は partial とマークされ再開可能(v2.1.246 以降)。トランスクリプトは `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl` にあり、メインの圧縮を生き延び、`cleanupPeriodDays`(既定30日)で削除される。`/tasks` の `x` で自分が止めた subagent は Claude のメッセージを拒否する。名前の再利用チェックは `/clear` でリセットされる。再開は同時実行上限を無視して新しいスロットを取り、元のツールセットとウォームキャッシュを保持する。SendMessage を持つ subagent は別の subagent を再開でき、その場合は再開者に報告する。2.1.299 以降、CLI 再起動 + resume 後も名前で見つかるが、最後の圧縮より前に付けた名前は agent ID が必要。

#### 入れ子と同時実行上限

既定ではメインの3階層下まで subagent が subagent を spawn できる(`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`、1 で無効)。履歴は v2.1.172〜216 が5階層無制限、v2.1.217〜218 が既定1、v2.1.219 で既定3。同時実行は既定20(`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`、v2.1.217 以降)で、超えると `Concurrent subagent limit reached` で失敗し Claude にリトライしないよう伝える。ultracode セッションは免除。セッション合計の上限はない。`-p`/SDK では spawn した subagent が入れ子の background subagent を待たないため、遅れた結果はメインに報告される。

#### 出力スキャンと API エラー

v2.1.210 以降、最終レポートはスキャンされ、`<\system-reminder>` / `Human:` / `Assistant:` を模した文字列にバックスラッシュが挿入され、bypassPermissions 等の権限設定への言及があれば `[harness: subagent output matched instruction-shaped pattern(s):` のマーカー行が先頭に付く。2.1.277 以降、レポートは「ユーザー権限を持たない」ことを示すヘッダー付きでインデントされて届く。セキュリティ境界ではなく、レポートが誘発するツール呼び出しは引き続き権限とサンドボックスを通る。API エラーでは、foreground は部分出力に切断注記を付けて返すか `Agent terminated early due to an API error` で失敗し、background は失敗マーク付きで最終出力を含める。フォールバックモデルチェーンがあれば最初に受け入れたモデルに切り替わる。

### 4.9 Agent teams

#### 有効化と副作用

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "teammateMode": "auto"
}
```

settings.json(公式の2スニペットを結合)。experimental で既定は無効。有効化すると通常の委譲も変わる。**Claude が Agent ツールの `name` パラメータで名前を付けた subagent は、fork か呼び出し自体に `isolation` を渡した場合を除いて teammate として起動する**。Claude は自発的に名前を付けることがあるので、頼んでいないのに team が形成されうる。teams は対話セッション限定で、`-p`/SDK では名前付き subagent も subagent のまま。user settings で `"0"` にするとシェルの export を上書きし、保存時に即反映される(spawn ごとに再読込)が、project/local/`--settings`/managed settings がなお有効化できる。

`teammateMode` は `in-process`(既定、任意のターミナル)、`auto`、`tmux`、`iterm2`(`it2` CLI + Python API が必要)。セッションフラグは `claude --teammate-mode auto`(`--help` に出ない)。分割ペインは VS Code 統合ターミナル、Windows Terminal、Ghostty では非対応。

#### subagents と teams の違い

subagent は結果を呼び出し元に返す(トークンコスト低)。teams は各 teammate が独立したコンテキストを持つ別 Claude インスタンスで、teammate 同士の直接メッセージ、共有タスクリストによる自己調整(Task tools があるモデルのみ)、議論や協働に向くが高コスト。Task tools(TaskCreate/Get/List/Update)は v2.1.268 以降、Opus 4.7、Sonnet 4.6、Haiku 4.5 以前でのみ既定で提供され、新しいモデルでは `CLAUDE_CODE_ENABLE_TODO_TOOLS=1`、`--allowedTools TaskCreate`、`--tools`、SDK オプションのいずれかが必要。なければ teammate はメッセージのみで調整する。background(agent view)セッションとクラウドセッションは全モデルで Task tools を持つ。in-process teammate はセッションに従い、分割ペインの teammate は自身のモデルに従う。`TodoWrite` は Task tools 優先で既定無効(`CLAUDE_CODE_ENABLE_TASKS=0` で復活)。

#### 内部構造

- lead: メインセッション、生涯固定
- teammate: 別の Claude Code インスタンス
- 共有タスクリスト: `~/.claude/tasks/{team-name}/`(セッション終了後も残り、`cleanupPeriodDays` の対象)
- メールボックス: `~/.claude/teams/{team-name}/inboxes/{agent-name}.json`(team config ディレクトリはセッション終了時に削除)
- team config: `~/.claude/teams/{team-name}/config.json`。`members` 配列(name + agent ID)を持ち、lead のエントリは常に agent type `team-lead`。teammate はこれを読んでメンバーを発見できる

team 名は `session-` + セッション ID の先頭8文字。config.json を手で編集したり事前に用意したりしてはならず、プロジェクト内の `.claude/teams/teams.json` は認識されない。タスクの claim はファイルロック、依存関係は自動 unblock。メッセージはメールボックスへの書き込みが成功したときのみ「送信済み」。メールボックスのエントリは読み取り時に検証され、壊れたものは削除される。

#### teammate のモデル、権限、定義の適用範囲

モデルの優先順位: spawn プロンプト > 定義の `model`(`inherit` は lead) > `CLAUDE_CODE_SUBAGENT_MODEL`(inherit でなければ) > lead のモデル。FORCE=1 は先頭2つをスキップ(v2.1.257 以降)。`teammateDefaultModel` は v2.1.234 で削除され、残っていても無視される(プロンプトでモデルを指定する)。effort は lead を継承(分割ペインは v2.1.186 以降)。モデルと fast mode は spawn 時に固定。

権限は lead のモードで始まる(dontAsk は継承されない)。`--dangerously-skip-permissions` は伝播する。プロンプトは lead セッションに浮上するが、**teammate が plan を終えて送る plan approval request は、lead が内容を確認せずに到着と同時に承認する**。teammate ごとの mode は spawn 時に設定できない。agent 間メッセージは別の Claude セッション由来としてマークされ、プロンプトの承認も拒否済みアクションの中継もできない。auto mode では classifier がプロトコルメッセージを含む全ての agent 間メッセージを配信前に審査する。

subagent 定義を teammate に流用したときに適用されるのは、`tools`(+SendMessage、in-process では +Task tools)、`model`、`disallowedTools`(in-process。SendMessage/Task tools は残る)、`effort` と `autoCompactWindow`(in-process のみ)、本文(in-process では既定プロンプトに追記、分割ペインでは置換)、`mcpServers`(分割ペインのみ)。`skills` はどちらでも適用されない。plugin 定義の agent が teammate として自身の prompt/tools/disallowedTools/effort を得るのは 2.1.288 以降。復活した in-process teammate がプロジェクトの `.claude/agents` 定義を再適用するのはそのフォルダが trusted のときだけで、そうでなければ定義のツールも指示も持たずに戻ってくる。

#### 操作と hooks

in-process パネル: ↑/↓ で選択、Enter で閲覧/メッセージ、Esc で中断、`x` で停止、Ctrl+T でタスクリスト切替。パネル全体がアイドルになって30秒で idle 行が隠れ、3つ超のアイドルは `N idle agents` に畳まれる。teammate を閲覧中は `/compact` `/clear` `/rewind` が確認を求め(lead に作用)、`/model` `/fast` は拒否される。

品質ゲート用の hook イベントは3つで、いずれも matcher を持たない。

- `TeammateIdle`: teammate がアイドルになる直前。exit 2 でフィードバックを送り作業を続行させる。入力は `teammate_name`、`team_name`。2.1.290 以降、teammate 自身の subagent/fork からは発火しない
- `TaskCreated`: exit 2 で作成を阻止。Task tools がなければ発火しない
- `TaskCompleted`: exit 2 で完了を阻止。teammate が in-progress タスクを残してターンを終えたときにも発火。入力は `task_id`、`task_subject`、任意の `task_description`、`teammate_name`、`team_name`

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "permission_mode": "default",
  "hook_event_name": "TeammateIdle",
  "teammate_name": "researcher",
  "team_name": "session-a1b2c3d4"
}
```

TeammateIdle hook の stdin JSON。

#### 制限とコスト

`/resume` と `/rewind` は in-process teammate を復元しない(resume 後に lead が存在しない teammate にメッセージしようとする)。タスク状態の反映は遅れることがある。シャットダウンは遅い。1セッション1 team、入れ子 team なし、in-process teammate からの background subagent は不可(`background: true` はエラー)。lead は固定、権限は spawn 時に確定。teammate は lead の会話履歴を継承せず、CLAUDE.md、MCP サーバー、skills、spawn プロンプトを読み込む。in-process teammate のキャッシュ TTL は既定5分で、`subagentPromptCacheTtl: "1h"` で延長できる。

```json
{
  "subagentPromptCacheTtl": "1h"
}
```

settings.json(v2.1.242 以降)。subagent、workflow、ヘルパーリクエスト(圧縮、タイトル生成)に適用。優先順位は `FORCE_PROMPT_CACHING_5M` > `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL` > `subagentPromptCacheTtl` > `ENABLE_PROMPT_CACHING_1H`。1h のキャッシュ書き込みは高く課金される。

コストは、teammate が plan mode で動く場合に通常セッションの約7倍(実装モードの公式数値はない)。公式ガイダンスは teammate に Sonnet、team は3〜5人、teammate あたり5〜6タスク、終わったら即シャットダウン、spawn プロンプトは焦点を絞る、並列実装の前にリサーチ/レビューから始める、同一ファイル編集を避ける、lead が自分で実装を始めたら「Wait for your teammates to complete their tasks before proceeding」と伝える。

```text
Spawn three teammates to review PR #142:
- One focused on security implications
- One checking performance impact
- One validating test coverage
Have them each review and report findings.
```

公式の spawn プロンプト例。他に "Spawn 4 teammates to refactor these modules in parallel. Use Sonnet for each teammate."、"Spawn a teammate using the security-reviewer agent type to audit the auth module."、"Ask the researcher teammate to shut down" がある。

### 4.10 Cross-session messaging

v2.1.224 以降(macOS/Linux/WSL2)、v2.1.234 以降(Windows)で既定有効。Claude が `ListAgents` と `SendMessage` を使い、あなたが直接呼ぶことはない。到達先は subagent、teammate、同一マシンのローカルセッション(セッションごとの Unix ソケット / 名前付きパイプ、Anthropic サーバーを経由しない)、他マシンのクラウド / Remote Control セッション(Anthropic サーバー経由、Remote Control と claude.ai サインインが必要、v2.1.225 以降)。API キーや Bedrock/Agent Platform/Foundry/AWS ではマシン外のセッションには届かず、それらのプロバイダや flag fetching オフでの同一マシン messaging は v2.1.248 以降。`@name`(v2.1.232 以降、空白を含む名前は `@"release notes"`)でセッションを指定できる。`/list-agents`(別名 `/peers`)で到達可能なセッションを表示し、`/status` の `Peer address` に `uds:` パスか `unavailable` が出る。メッセージはプレーンテキストのみで、ファイルや履歴は動かず、`@file` は添付されず、スラッシュコマンドはテキストとして届いて実行されない。受信メッセージは入力プロンプトと同様に usage にカウントされる。

#### 受信制御

`crossSessionInbound` = `accept` | `hold` | `refuse`(`/config` の "Messages from your other sessions"、v2.1.232 以降。`/config crossSessionInbound=value` の短縮形は拒否される)。未設定時の既定はセッションのクラスで決まる。プロンプトを出すセッション(auto / acceptEdits / dontAsk を含む)は配信し、送信元が bypass のときのみ hold。bypass するセッション(bypass が使える対話ターミナルでは plan mode も含む)は送信元も bypass でなければ全て hold。hold されたメッセージは承認ダイアログを開き、`dialogExpiry`(60s / 5m / 10m / never、既定5分、User または managed スコープ、`CLAUDE_CODE_USER_DIALOG_TIMEOUT_MS` でセッション単位上書き)で失効する。最大100件 hold、50件キュー。project/local の `crossSessionInbound` は managed / `--settings` / user より厳しいときのみ適用される。

```json
{
  "permissions": {
    "deny": ["SendMessage", "ListAgents"]
  },
  "crossSessionInbound": "refuse",
  "isolatePeerMachines": true
}
```

managed settings でのロックダウン例(公式の2スニペットを結合)。`isolatePeerMachines: true` は bypassPermissions でもマシン外への送信前に承認を強制し、どのスコープの `true` も勝つ。**`SendMessage` を deny すると subagent の再開と teammate へのメッセージも消える**(同じツールを共用しているため)。

#### notify_when_idle とソケット API

`SendMessage` の `notify_when_idle` 入力(v2.1.236 以降)は、ローカルセッションが次にアイドル/終了するときに1回だけ通知を受け取る購読で、監視対象でトークンを消費せず、12時間で失効する。購読できるのはメイン会話のみ、同一マシンのセッションのみ。`SendMessage` には任意の `summary`(5〜10語、200文字で切り詰め)があり、受信側トランスクリプトの1行プレビューになる。`TaskStop` は teammate や名前付き background agent を ID か名前で止められる。

スクリプトや hook から自セッションの inbox に投函できる。パスは `CLAUDE_CODE_MESSAGING_SOCKET`、トークンは `CLAUDE_CODE_MESSAGING_TOKEN`。接続の1行目 `{"type":"auth","token":"<token>"}` は macOS/Linux では任意、Windows では必須。完全な行が30秒来なければ接続が閉じる。フォールバックのソケットディレクトリは `/tmp/cc-socks-<uid>`。自分の子からのメッセージは検証できれば hold なしで配信される。`claude -p` セッションはソケットを bind する(bare mode はしない)。`--restricted` セッションは messaging ソケットを開かない(2.1.290)。コンテナとホスト、WSL2 とネイティブ Windows のセッションは相互に到達できない。サンドボックス化された Bash からソケットに届くには `sandbox.network.allowUnixSockets` または `sandbox.network.allowAllUnixSockets` が必要。

制限: 同一マシンのメッセージは直列化で約100万文字で拒否、短時間のバーストは送信側で拒否、受信側は送信元ごとにレート制限し同一内容の反復を破棄、最大50件キュー、したがってループは自己終了する。Remote Control なしでマシン外に送ると返信先がなく一方向になる。

### 4.11 Worktrees

#### `--worktree` と baseRef

`claude --worktree <name>` / `-w` は `.claude/worktrees/<name>/` をブランチ `worktree-<name>` で作成する。分岐元は `worktree.baseRef` で決まる。`"fresh"`(既定)はリモートの既定ブランチ(24時間以内に fetch していなければ 5 秒上限で fetch、認証待ちはしない。リモートがない、または origin/HEAD が取れないときはローカル HEAD にフォールバック)、`"head"` はローカル HEAD で、未 push のコミットや作業中ブランチの状態を引き継ぐ。`--worktree "#1234"` や PR/MR の URL は PR の head から `pr-<number>` に分岐する(GitLab は `merge-requests/<n>/head`、他ホストは両方試す、v2.1.233 以降)。名前を再利用すると worktree を再オープンし、`fresh` 下でクリーンかつ未マージなしのものは既定ブランチにリセットされる。対話モードの `--worktree` は事前のワークスペース trust が必要で、`-p` はスキップする。baseRef にブランチ名は書けない(手動で `git worktree add`)。`.claude/worktrees/` を `.gitignore` に追加する。2.1.300 以降、bare repo の worktree 内では現在のチェックアウトの HEAD がフォールバック基底になる。

```json
{
  "worktree": {
    "baseRef": "head",
    "bgIsolation": "none"
  }
}
```

settings.json(公式の2キーを結合)。`bgIsolation: "none"` は agent view / `--bg` セッションが worktree に移動するのを止める。

```json
{
  "worktree": {
    "baseRef": "head",
    "symlinkDirectories": ["node_modules", ".cache"],
    "sparsePaths": ["packages/my-app", "shared/utils"]
  }
}
```

`symlinkDirectories` はメインリポジトリから各 worktree にシンボリックリンクするリポジトリ相対ディレクトリ、`sparsePaths` は列挙ディレクトリとルート直下のファイルだけを sparse-checkout する(sparse worktree がある間 git が `extensions.worktreeConfig` を有効化する)。デスクトップ専用の `worktree.location` は `--worktree`、EnterWorktree、分離 subagent、background セッションには無視される。

`.worktreeinclude`(gitignore 構文、gitignore 済みファイルのみコピー)で `.env` などを git 作成の全 worktree(subagent のものを含む)に伝播できる。

```text
.env
.env.local
config/secrets.json
```

リポジトリルートの `.worktreeinclude`。WorktreeCreate hook を使う場合は処理されない。

#### EnterWorktree / ExitWorktree

Claude は「work in a worktree」と頼めば `EnterWorktree` で worktree を作成/入室する。`.claude/worktrees/` 外のパスに入る場合は常にプロンプトが出て(v2.1.206 以降、bypassPermissions のみスキップ)、EnterWorktree の permission rule や "don't ask again" でも抑制できない。`ExitWorktree` で戻る。`isolation: worktree` の subagent には `ExitWorktree` がなく、`EnterWorktree` はパス形式のみで `.claude/worktrees/` 配下に限られる。git 作成の worktree ではトランスクリプトが worktree に追従し(v2.1.198 以降)、`--resume` はそこで見つける。hook では `${CLAUDE_PROJECT_DIR}` がセッション開始時のプロジェクトルートに固定されたままなので、worktree のパスは hook 入力 JSON の `cwd` から読む。

#### 分離の強制範囲

セッション、再開したセッション、それが spawn する全 subagent に対し、起動元リポジトリとリンク先のメインチェックアウト(v2.1.210 以降)を対象に以下を適用する。

1. メインチェックアウトへの Edit/Write/NotebookEdit をブロック
2. cwd がメインチェックアウトに解決する Bash/PowerShell/Monitor をブロック(PowerShell はこの cwd チェックのみ)
3. git のリダイレクト(`git -C`、`--git-dir`、`GIT_DIR`、`GIT_WORK_TREE`、チェックアウトへの `cd`)をブロック
4. 形状を検証できないコマンド(計算されたコマンド名、`${!name}`、`${ command; }`)を拒否。このチェックは無効化できない。2.1.274 / 2.1.299 で特定の入れ子シェル展開と awk プログラムも拒否対象に追加

いずれもシェルコマンドがどのファイルに書くかは追跡しないため、git を介さずメインチェックアウトに書く `cp` やシェルリダイレクトは拒否されない。

#### `isolation: worktree` subagent

```markdown
---
name: refactorer
description: Applies mechanical refactors across many files
isolation: worktree
---

Apply the requested refactor across every affected file, then run the tests
and report the results.
```

`.claude/agents/refactorer.md`。各 subagent は一時 worktree を得る。変更なしで終われば自動削除、変更があれば定期スイープが安全に削除できるまで残る。基底は `baseRef` が `head` でなければ既定ブランチ。CLAUDE.md と rules はメイン会話のものを使い、`.claude/worktrees/` 配下の既定位置では worktree ルートの CLAUDE.md や `.claude/rules/` をそのブランチで内容が違っても読み込まない。実行中の agent は `git worktree lock` を保持し、スイープは死んだセッションのロックを解放する(v2.1.210 以降)がユーザー設定のロックは触らない。スイープは未 push コミット、サブモジュール変更(v2.1.274 以降)、filter driver 設定問題、background 化されていない `--worktree` セッション、`git worktree add` で作った(マーカーなし)worktree も残す。2.1.295 で、自身の worktree にいる subagent に親セッションの git ブランチ/状態が見えていた問題が修正された。

worktree はメインチェックアウトと以下を共有する。`.git` ディレクトリ(サンドボックスは書き込みを許可)、プロジェクトスコープ plugin(v2.1.200 以降)、権限承認(worktree セッションで "Yes, and don't ask again" を選ぶとメインの `.claude/settings.local.json` に保存され全 worktree に効く、v2.1.211 以降)、worktree 側に無い場合の未追跡 `.claude/skills`、`.claude/agents`、`.claude/commands` の read-through(skills は v2.1.277 以降)。デスクトップアプリの worktree セッションは settings/hooks/skills/agents/.mcp.json をメインチェックアウトルートから、CLAUDE.md と `.claude/rules` を worktree から読む。

#### 安全上の拒否

シンボリックリンクされた `.claude` / `.claude/worktrees` は拒否(v2.1.212 以降)。リポジトリローカルの filter driver(`git lfs install --local` 等)は filter driver がシェルコマンドでありリポジトリに書ける者なら誰でも仕込めるため、作成時に無効化される。結果 LFS ファイルはポインタになるので worktree 内で `git lfs pull` する(v2.1.247 以降)。git メタデータがメインチェックアウトに解決すると `Refusing to use <path> as an isolation worktree`。読めない `.git/config`、`=` や改行を含む filter driver 名、リポジトリ config の `includeIf`、`lfs.customtransfer` / `standalonetransferagent` キーの4条件は作成自体を中止する。2.1.302 で git 2.56 以降の迷子 `.git` ファイルによる作成/再開拒否が修正された。

#### 非 git VCS: WorktreeCreate / WorktreeRemove hook

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'NAME=$(jq -r .name); DIR=\"$HOME/.claude/worktrees/$NAME\"; svn checkout https://svn.example.com/repo/trunk \"$DIR\" >&2 && echo \"$DIR\"'"
          }
        ]
      }
    ]
  }
}
```

settings.json。hook は stdin の `{name}` JSON を読み、作成したディレクトリパスを出力する(ANSI を除去した最後の非空 stdout 行がパス。`systemMessage` / `continue` は破棄)。hook が作るディレクトリは git リポジトリの外になければ拒否される。発火するのは `--worktree`、EnterWorktree、`isolation: worktree`、workflow agent、background セッション分離、remote-control worktree mode で、Claude が Bash で `git worktree add` を実行したときは発火しない(その場合は PreToolUse Bash hook)。`/batch` は WorktreeCreate が worktree を提供すれば git 外でも動く(v2.1.281 以降)。plugin の WorktreeCreate/Remove hook は 2.1.300 以降 `--worktree` で動く(`--tmux` はまだ)。

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "hook_event_name": "WorktreeCreate",
  "name": "feature-auth"
}
```

WorktreeCreate hook の stdin JSON。

### 4.12 Agent view と background セッション

`claude agents`(v2.1.139 からの research preview)は supervisor に支えられたローカル background セッションの画面で、dispatch、peek(Space)、返信、attach(Enter / →)、detach(空プロンプトで ←)ができる。`claude --bg "prompt"` は `-p` と併用不可。`/bg`(= `/background`)は現在のセッションを background に移し、`/fork` はコピーする(v2.1.212 以降)。`claude agents` が subagent の一覧を印字して終了するならインストールが古いので `claude update` する。

```bash
claude agents                          # open agent view
claude agents --cwd ~/projects/my-app  # scope to one project
claude agents --json --all             # scripting interface
claude agents --permission-mode plan --model opus --effort high
claude --bg "investigate the flaky SettingsChangeDetector test"
claude --agent code-reviewer --bg "address review comments on PR 1234"
claude --resume 1f0e2c9a-6d0b-4c11-9f39-2a77c1d4e8b5 --bg "pick up where you left off and finish the migration"
claude --bg --name "flaky-test-fix" "investigate the flaky SettingsChangeDetector test"
claude --bg --exec 'pytest -x'
claude attach <id|name>
claude logs <id|name>
claude stop <id>
claude respawn <id>
claude rm <id> --discard-unpushed <commit>@<worktree-id>
claude daemon status
claude daemon stop --any --keep-workers
claude --worktree feature-auth
claude --worktree "#1234"
```

各行は公式ページに記載のある形式。`/config defaultToAgentsView=true` で素の `claude` が agent view を開く。`--add-dir` と `--mcp-config` は `agents` の後に置く。`--restricted` は v2.1.248 以降、`--effort` は ultracode も受け付け、`--agent` の既定は `agent` 設定、なければ組み込みの `claude` agent。

#### スクリプト連携

`claude agents --json [--all] [--cwd]` が外部から状態を読む公式手段で、ステータスバー、スケジューラ、別の Claude セッションから使う。各エントリは `cwd` / `kind` / `startedAt` を常に持ち、background なら `id`、`state` は working | blocked | done | failed | stopped、生存中は `pid` と `status`(busy | waiting | idle)、`waitingFor` は permission prompt | input needed | sandbox request | worker request | dialog open、設定されていれば `sessionId` / `name`。done は次のプロンプト待ち、blocked はあなたの操作待ち。`~/.claude/jobs/<id>/state.json` と `~/.claude/daemon/roster.json` は安定インターフェースではない。`$CLAUDE_JOB_DIR/tmp` は Write/Edit でプロンプトが出ないスクラッチ領域。

```bash
claude agents --json --all | jq '.[] | select(.state=="blocked") | {id,name,waitingFor}'
```

入力待ちのセッションを抽出する例。

#### dispatch されたセッションの git 挙動

dispatch / `--bg` のセッションは編集前に `.claude/worktrees/` 配下の自身の worktree へ移動し、その後は確認なしでコミットし、リモートがあればブランチを push し、タスクが求めれば draft PR を開く。禁止は `main` / `master` への push、force-push、merge。CLAUDE.md の git 指示が優先される。無効化は `worktree.bgIsolation: "none"`。スキップされるのは ← や `/background` で background 化したとき、既にリンク worktree にいるとき、WorktreeCreate hook のない非 git リポジトリ、cwd 外への書き込み。自分で分離していないチェックアウトを編集するセッションはコミットやブランチ切替の前に確認する。agent view でセッションを削除すると Claude 作成の worktree が未コミット変更ごと消える(未 push コミットがあれば `claude rm <id> --discard-unpushed` まで拒否)。`claude rm` 自体は未コミット変更のある worktree を残し、`--force-remove-worktree <worktree-id>`(v2.1.268 以降)が git / WorktreeRemove 失敗時の手段。

#### 通知、権限、background 化の引き継ぎ

agent view を開いている間、ローカル background セッションの入力要求/完了/失敗はターミナル通知チャネルで通知され、`Notification` hook が `agent_needs_input` または `agent_completed` 型で発火する(v2.1.198 以降)。タブタイトルは `2 awaiting input · claude agents`、通常セッションのフッターは `← 2 agents`。行の要約と自動命名は Haiku クラスのモデルが生成し課金される(ゲートウェイでは `ANTHROPIC_DEFAULT_HAIKU_MODEL`)。

← で開いた view からの dispatch は対象ディレクトリの `permissions.defaultMode`(プロジェクトレベルのより緩いモードは拒否)、次に元セッションからモードを取る。緩さの順は plan → Manual と dontAsk → acceptEdits と auto(互いに相手より緩いと数える) → bypassPermissions。bypassPermissions は `~/.claude/settings.json` に記録された免責事項の承諾が必要。dispatch 入力の省略形: `<agent-name> prompt` または `@agent` でカスタム subagent をメイン agent として実行、`@repo` で子リポジトリや登録済み worktree、`! cmd` でシェルジョブ(出力はメモリのみ、終了5分後に消去)、`/model` `/effort` `/fast` で dispatch 既定(後2つは v2.1.299)、フィルタ `a:` `s:` `n:` `o:` `#1234`。peek の返信は `/model` `/effort` `/rename` `/usage` が即実行、他の返信はキュー、他のスラッシュコマンドはターン終了待ち、`/stop` は即停止、`!` 接頭辞で Bash 送信、権限ダイアログには答えられない(attach する)。

background 化で引き継がれるのは実行中の background シェルコマンド、background 化した subagent、workflow、`/loop` タスク、artifact 自動返信。Monitor は移動できず停止する(確認ダイアログ付き)。実行中の workflow subagent は最初からやり直す(トークンは再消費)。`CLAUDE_DISABLE_ADOPT=1` で確認を強制、`CLAUDE_CODE_DISABLE_BG_EXIT_HANDOFF=1` でプロセス再起動時の引き継ぎを止める。引き継がれるフラグは `--mcp-config`、`--strict-mcp-config`、`--settings`、`--setting-sources`(v2.1.281 以降)、`--add-dir`、`--plugin-dir`、`--fallback-model`、`--allow-dangerously-skip-permissions`。システムプロンプトを置換したセッションや `--tools` 許可リスト付きセッションは `/fork` できない。

`/fork` のコピーはモデル、permission mode、effort、追加ディレクトリ、"don't ask again" の付与を引き継ぐが、分離の挙動は位置依存である。dispatch されたセッション → コピーは自身の worktree に移る。リンク worktree に移動したセッション → コピーは移動前の位置で始まり、あなたのブランチを基底にし、あなたの worktree に触れない(`runs in the origin tree`)。リンク worktree 内で起動したセッション → コピーはメイン作業ツリーで始まる。bare repo レイアウトや `bgIsolation: none` → `edits this checkout`。

background セッションはサブスクリプション枠を対話セッションと同じ速度で消費する(10並列なら約10倍)。ローカル実行のみ。無効化は `disableAgentView: true` または `CLAUDE_CODE_DISABLE_AGENT_VIEW`(managed settings で強制可)。セッションは supervisor の再起動とスリープを生き延びるがシャットダウンは生き延びない(48時間未満は failed、以降は stopped)。attach されていないアイドルセッションは約1時間で停止、ピン留め(Ctrl+T)で防げる。LLM ゲートウェイの変数は settings の `env` ブロックに置く。シェルでのみ export した `ANTHROPIC_BASE_URL` は supervisor が共有し、かつ自セッションの background 化、現ディレクトリへの dispatch、そこでの停止セッション起床のときだけ転送され、ディスクには書かれない。`claude --bg --agent <name>` で未知の名前を渡すと background 化は報告されるがセッションは `--agent '<name>' not found` で終了する。`claude --resume <id> --bg` は v2.1.257 以降その場で継続するか `note:` を出してコピーし、`--continue` / 素の `--resume` / `--resume <name|path>` は常にコピー、`--fork-session` は意図的にコピーする。

### 4.13 コストの実態

subagent は各自のリクエストを送り、同じ usage 上限にカウントされる。詳細な結果をメインに返せばメインのコンテキストを消費し、セッション中ずっと残る。公式の使い分けは、冗長な出力、ツール制限、自己完結した作業には subagent、反復的・対話的・レイテンシ重視の作業はメイン会話、現在のコンテキストに関する質問は `/btw`(ツールなし、履歴を変更しない)。単純な agent は `model: haiku` にする。`/usage` は Pro/Max/Team/Enterprise で subagent 別に使用量を表示する。

非 fork subagent の起動コンテキスト(システムプロンプト + CLAUDE.md + git status)の正確なトークン量は公式に記載がない。コミュニティの「約30kトークン」という数字は裏付けがない(未検証)。「subagent の価値は並列性より分離にある」という第三者の見解は公式のコストガイダンスと整合するが(未検証)、「teammate がファイルを書くなら worktree を使え」という第三者の助言は agents ページ(teams は teammate を worktree 分離しない。ファイル所有権で分割する)と矛盾する。

### 落とし穴と対策

| 落とし穴 | 対策 |
|---|---|
| 認識されない frontmatter(`maxturns`、`disallowed_tools`)が無言で無視される | camelCase を表と照合。v2.1.296 以降は `~/.claude/debug/<session-id>.txt` で "does not recognize or apply" を grep |
| `---` が1行目にない、`name` がない定義はドキュメント扱いで読み込まれない | `claude plugin validate .claude/agents` を CI に入れる |
| 対話セッションでは background が既定で、background は組み込みツールが縮小される | foreground で動作確認した定義でも background フィルタ表に照らす。AskUserQuestion は決して使えない |
| `disallowedTools: Bash(git push *)` は Bash 全体を消す | コマンド単位は `permissions.deny` の `Bash(git push *)` |
| `Agent(worker, researcher)` の型リストは subagent 定義では無視される | 型制限は `claude --agent` のメインスレッドでのみ有効と理解する |
| `permissionMode` はメインが bypassPermissions / acceptEdits / auto のとき無視され、bypass への昇格は不可 | メインのモードを前提に設計する |
| プロジェクトの frontmatter hooks とインライン mcpServers はそのフォルダの trust が必要。親フォルダ trust と `-p` は不可 | 無言でスキップされるので debug ログで確認。`-p` パイプラインでは settings.json の hooks に移す |
| Explore / Plan は CLAUDE.md と git status を読まず one-shot | 必要なルールは委譲プロンプトに再掲。継続が要るなら general-purpose |
| `memory` は auto memory 無効時に何もしない | `autoMemoryEnabled` と `CLAUDE_CODE_DISABLE_AUTO_MEMORY` を確認 |
| `autoCompactWindow: 200k` は 200 → 無視 | `200000` と書く |
| `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` で、Claude が名前を付けた subagent は全て teammate になり、`isolation: worktree` の定義でもメイン作業ディレクトリで走る | 不要なときは user settings で `"0"`。project/local/managed が上書きしうる点に注意 |
| teammate の plan approval は lead が無審査で承認する | 浮上するのはツール権限プロンプトのみと理解し、TaskCompleted hook で品質ゲートを置く |
| `/resume` `/rewind` は in-process teammate を復元しない | lead に新しい teammate を spawn させる |
| teams は worktree 分離しない | teammate ごとにファイル所有権を割り当てる |
| teammate は定義の `skills` を無視、in-process は `mcpServers` を無視、分割ペインは `autoCompactWindow` を無視 | 必要なものは spawn プロンプトか project/user settings で与える |
| plan mode の teams は約7倍のトークン。teammate は shutdown するまで消費し続ける | Sonnet、3〜5人、終了後すぐ shutdown |
| `SendMessage` の deny は subagent 再開と teammate メッセージも壊す | 送信制限は `isolatePeerMachines` や `crossSessionInbound` を優先 |
| bypassPermissions セッションは受信メッセージを既定で hold し、`-p` ワーカーではダイアログがなく5分で失効 | ワーカーの `--settings` に `crossSessionInbound: accept`、または `dialogExpiry: "never"` |
| worktree 分離は `cp` やリダイレクトによるメインチェックアウトへの書き込みを検知しない | 分離はガードレールであり境界ではない。PreToolUse hook で補強 |
| hook の `${CLAUDE_PROJECT_DIR}` は worktree に追従しない | stdin JSON の `cwd` を使う |
| `isolation: worktree` subagent は worktree ルートの CLAUDE.md を読まない | ブランチ固有の指示は委譲プロンプトに書く |
| worktree は既定でリモート既定ブランチから分岐し、現在の HEAD ではない | 作業中コードを見せるなら `worktree.baseRef: "head"` |
| `git lfs install --local` のリポジトリではポインタファイルになる | worktree 内で `git lfs pull` |
| `-p --worktree` セッションは worktree を掃除せずロックも解放しない | `git worktree unlock` + `git worktree remove` |
| agent view / `--bg` セッションは確認なしでコミット・push し draft PR を開くことがある | CLAUDE.md に "I handle git myself" を書くか `bgIsolation: "none"` |
| agent view での削除は未コミット変更ごと worktree を消す | 未 push コミットは `--discard-unpushed` まで拒否されるが、未コミット変更は守られない |
| workflow の subagent 実行中に background 化すると最初からやり直し、Monitor は停止 | workflow 完了を待ってから `/bg` |
| `--bg` と `-p` は併用不可。未 trust のディレクトリでは `Workspace not trusted` | 事前に対話セッションで trust |
| 再開は同時実行上限20を無視し、`/subtask` の fork もスロットを占有する | `/tasks` で実行中数を監視 |
| plugin subagent は hooks / mcpServers / permissionMode を無視 | `.claude/agents/` にコピーする |
| sub-agents ページと changelog で fork mode の `-p` 既定が食い違う | changelog 2.1.302 を正とし、`CLAUDE_CODE_FORK_SUBAGENT=0` で明示する |

### 中級者が次にやること

1. **探索コストを下げる**: `.claude/agents/Explore.md` に `name: Explore`、`model: haiku`、`description` を書いて組み込み Explore を上書きする。`/tasks` でモデルが haiku になっていることを確認する。
2. **定義の CI チェック**: `claude plugin validate .claude/agents` を pre-commit か CI に入れ、frontmatter の破損と `name` 重複を機械的に弾く。
3. **読み取り専用 subagent + hook の組み合わせ**: `db-reader`(`tools: Bash`、frontmatter の PreToolUse で `validate-readonly-query.sh`)を作り、hook の exit 2 でブロックされることを確認する。プロジェクトフォルダの trust を忘れない。
4. **MCP のコンテキスト削減**: `.mcp.json` に書いていた Playwright など重いサーバーを `mcpServers` インラインに移し、メイン会話の起動時トークンがどれだけ減るかを `/usage` または `/context` で比較する。
5. **worktree 分離のリファクタ**: `isolation: worktree` の `refactorer` に `worktree.baseRef: "head"` を組み合わせ、作業中ブランチに対する機械的な変更を並列実行する。`.worktreeinclude` に `.env` を列挙してテストが動くようにする。
6. **teams の試運転**: `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` を user settings に置き、PR レビューの3人構成(security / performance / tests)から始める。`TaskCompleted` hook で `exit 2` の品質ゲートを置き、`~/.claude/tasks/session-*/` の中身を観察する。終わったら即 shutdown。
7. **-p ワーカーの無人運用**: `claude -p --worktree job-1 --settings '{"crossSessionInbound":"accept"}'` で起動し、`CLAUDE_CODE_MESSAGING_SOCKET` へ `{"type":"auth","token":"..."}` + メッセージ行を投函するスクリプトを書く。終了後に `git worktree unlock` と `remove` を自動化する。
8. **agent view をスケジューラから監視**: `claude agents --json --all | jq` で `blocked` を抽出してステータスバーや通知に流す。dispatch セッションの git 挙動を CLAUDE.md で明文化する。
9. **subagent モデルの全体統制**: 組織の settings で `CLAUDE_CODE_SUBAGENT_MODEL=haiku` + `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` を試し、fork だけがメインモデルで残ることを `/tasks` で確認する。
10. **messaging のロックダウン方針**: managed settings で `isolatePeerMachines: true` を先に設定し、`SendMessage` deny は subagent 再開が壊れることを理解した上で最終手段にする。

### 出典

- https://code.claude.com/docs/en/agents
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/cross-session-messaging
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/tools-reference
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/changelog
