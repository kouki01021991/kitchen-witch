## 第12章 ベストプラクティスと直近の重要アップデート

### この章で分かること

公式 best-practices ページの推奨事項はほぼすべて「コンテキストウィンドウは急速に埋まり、埋まるほど性能が落ちる」という単一の制約から導かれている。この章ではその制約を軸に、検証の梯子 (prompt → /goal → Stop hook → 検証 subagent)、Explore/Plan/Implement/Commit の 4 段階、CLAUDE.md の読み込み機構と衛生管理、拡張機構 (CLAUDE.md / rules / skills / subagent / hooks / MCP / mods) の優先順位とコンテキストコスト、マルチセッションとヘッドレス運用の設計を、再現可能な設定とともに整理する。後半では 2026 年 8 月から 10 月 (v2.1.220 から v2.1.302) にかけての重要アップデート、すなわち auto mode の既定化とサーバー側 classifier、prompt caching の TTL バケットと idle compaction、dynamic workflows、agent teams、agent view、mods、ultrareview、channels、fullscreen rendering を、バージョン番号と設定キーのレベルで扱う。最後に落とし穴と、明日から組み込める具体的なレシピを示す。

### 12.1 設計原理: コンテキストウィンドウが唯一の予算

公式ページは冒頭で次のように宣言している。

> Most best practices are based on one constraint: Claude's context window fills up fast, and performance degrades as it fills.

中級者が予算として管理すべきはトークン課金でも時間でもなく、コンテキストの残量である。監視手段は `/context` (起動時にロードされた Memory ファイル一覧も出る)、カスタム status line、`/cost` と `/usage` の 3 つ。v2.1.299 からは `/usage` が max effort、workflows、常時ロードされるコンテキスト、巨大なツール結果について警告を出す。

この原理から派生する道具を一覧にする。

| 目的 | 手段 | 仕組み |
|---|---|---|
| 無関係なタスク間でリセット | `/clear` | 会話履歴を破棄。CLAUDE.md は再読込される |
| 残したい情報を指定して圧縮 | `/compact <instructions>` | 指示付き要約。root CLAUDE.md はディスクから再読込 |
| 部分圧縮 | Esc+Esc または `/rewind` のメニューから "Summarize from here" / "Summarize up to here" | チェックポイント単位で要約範囲を選ぶ |
| 自動圧縮で残す内容を固定 | CLAUDE.md に "When compacting, always preserve the full list of modified files and any test commands" のような行 | auto-compact 時の要約に反映される |
| 履歴に残さない質問 | `/btw` | 回答は会話履歴に入らない。非対話セッションでは 11 分でタイムアウト (2.1.299) |
| 調査を別コンテキストで | subagent | ファイル読み込みは subagent 側で消費され、要約だけが戻る |

`/rewind` は既にキャッシュ済みのプレフィックスまで切り戻すため、方針転換の際は `/compact` より安い。逆に `/compact` は TTL 切れ後に resume したコールドなセッションで実行すると最も高くつく。

### 12.2 検証の梯子: Claude に合否判定を渡す

公式ページで最上位に置かれる実践は「Claude 自身が実行できるチェックを渡す」ことである。

> Give Claude a check it can run: tests, a build, a screenshot to compare. It's the difference between a session you watch and one you walk away from.

チェックが完了をどの程度強くゲートするかで 4 段階ある。

1. 同じプロンプト内でチェックを要求する ("write a failing test that reproduces the issue, then fix it")。
2. `/goal` の条件にする。ターンごとに評価される。
3. Stop hook にする。決定論的なゲート。
4. 検証 subagent または dynamic workflow で、新しいコンテキストのモデルに判定させる。

段が上がるほどセットアップは増え、人間の注意は減る。いずれの段でも「主張ではなく証拠」(テスト出力、コマンドと結果、スクリーンショット) を要求する。

#### /goal の仕組み

`/goal` はセッションスコープの prompt-based Stop hook のラッパーである。ターン終了ごとに条件と会話を small fast model (`ANTHROPIC_DEFAULT_HAIKU_MODEL` で変更可、`haiku` エイリアスにも影響) に送り、Not yet met / Met / Impossible の判定を得る。条件は最大 4,000 文字。評価器はコマンドを実行せずファイルも読まないので、「`npm test` が exit 0 で終わる」のように Claude の transcript 自身が証明できる条件を書く。

```bash
claude -p "/goal CHANGELOG.md has an entry for every PR merged this week"
```

非対話モードでも使え、`--output-format stream-json --verbose` を足すとターンごとの進捗が見える。背景作業中は評価が延期され、30 分待った時点で最初の check-in が入り、以降は間隔を倍々にして最初の間隔の 4 倍まで広げる (既定では最初の check-in の 1 時間後、その後は 2 時間ごと。`CLAUDE_CODE_GOAL_CHECKIN_MINUTES`、1 から 10080 の整数分、0 で無効、v2.1.234+)。goal を設定したまま Claude がツールを数ターン呼ばないとループは止まる。認証失敗 (Claude Code が資格情報を管理している場合)、クレジット枯渇、圧縮不能なオーバーフロー、モデル利用不可の 4 つは回復不能エラーとして goal を消す。`disableAllHooks` や `allowManagedHooksOnly` 下では使えない。Manual mode では許可されていないツール呼び出しで通常どおりプロンプトが出るので、無人運用では auto mode と組み合わせる。

#### Stop hook の連続ブロック上限

Stop / SubagentStop hook には公式に 8 回連続継続の上限がある (hooks リファレンス)。hook が 8 回連続でターンを継続させた後、Claude Code は次のブロックを上書きしてターンを終える。カウントは Claude がツールを呼ぶたびにリセットされる。`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` で上限を変更でき、0 で無効化。hook 入力の `stop_hook_active` を見て、解決不能な条件で無限にブロックしないようにする。

#### TDD ループと Writer/Reviewer

prompt library (52 本、SDLC フェーズとロール別にタグ付け) の `drive-implementation-from-tests` は「先にテストを書き、通るまで実装」を定型化している。これを 2 セッションに分けたのが Writer/Reviewer パターンで、Session A が実装、Session B が `@src/middleware/rateLimiter.ts` をレビューし、A がフィードバックに対応する。新しいコンテキストのレビュアーは自分が書いたコードへのバイアスを持たない。

bundled の `/code-review` (別名 `/review`、`--max-findings <n>|all`) は現在の diff をバックグラウンド subagent で精査する。計画適合性のレビューは自前のプロンプトで、対象、計画ファイル、何を finding とみなすかを明示する。

```text
Use a subagent to review the rate limiter diff against PLAN.md. Check that
every requirement is implemented, the listed edge cases have tests, and
nothing outside the task's scope changed. Report gaps, not style preferences.
```

「ギャップを探せ」とだけ言われたレビュアーは健全なコードにも何か見つけてくる。正しさと要件の欠落だけを報告させるのが過剰設計を防ぐコツである。

### 12.3 ワークフロー: Explore → Plan → Implement → Commit

plan mode は Shift+Tab を `⏸ plan mode on` まで押すか `claude --permission-mode plan` で入る。Ctrl+G で計画をエディタで編集できる。スキップ基準は明文化されている。

> If you could describe the diff in one sentence, skip the plan.

不確実なアプローチ、複数ファイル、未知のコードでは使い、1 文で diff を言えるなら使わない。

Shift+Tab のサイクルは、auto から始まる場合 auto → default、以降 default → acceptEdits → plan、その後に有効化済みの任意モード (bypassPermissions が先、auto が最後)。dontAsk はサイクルに入らない。

#### 具体的に書く

| 曖昧 | 具体的 |
|---|---|
| ログイン周りを直して | users report that login fails after session timeout. check the auth flow in src/auth/, especially token refresh. write a failing test that reproduces the issue, then fix it |

prompt library が抽出した 6 つのメタパターンは、手順でなく結果を書く、同じプロンプトでチェックを渡す、参照ファイルやパターンを指す、測定可能な目標を言う、成果物 (@file、スクリーンショット、ログ) を渡す、回答の形式と読者を指定する、である。曖昧なプロンプトは探索的作業にだけ使う。

リッチな入力経路として、`@file` (そのファイルのディレクトリ連鎖の CLAUDE.md も読み込まれる。ディレクトリ参照はファイル一覧のみ)、画像の貼り付け、URL (`/permissions` でドメインを allowlist)、パイプ (`cat error.log | claude -p ...`)、Bash/MCP 経由の取得がある。`@file` が本文を含めるのは Read ツールの 25,000 トークン上限まで、256KB 超のテキストは含まれない。`CLAUDE_CODE_DISABLE_FILE_MENTIONS=1` (v2.1.299+、シェルまたはユーザー設定のみ) にするとパスだけ渡して Claude に読ませる。Read の `allow_large` (2.1.296) は余裕があるときに一度で上限超えを読む。

#### 早期の軌道修正

Esc で中断、Esc+Esc または `/rewind` で会話・コード・両方の復元、または要約範囲の選択。チェックポイントはターンを開始する各プロンプトで作られ、ターミナルを閉じて resume しても残るが、Claude のファイルツール経由の変更しか追跡しない。Bash や外部プロセスの変更は戻らない。git の代替ではない。

> If you've corrected Claude more than twice on the same issue in one session, the context is cluttered with failed approaches. Run `/clear` and start fresh with a more specific prompt that incorporates what you learned.

#### Interview-to-spec

```text
I want to build [brief description]. Interview me in detail using the AskUserQuestion tool.

Ask about technical implementation, UI/UX, edge cases, concerns, and tradeoffs. Don't ask obvious questions, dig into the hard parts I might not have considered.

Keep interviewing until we've covered everything, then write a complete spec to SPEC.md.
```

SPEC.md が完成したら新しいセッションで実装する。良い spec はファイルとインターフェースを名指しし、スコープ外を明記し、end-to-end の検証手順で終わる。

### 12.4 CLAUDE.md の衛生管理と読み込み機構

#### 内容の基準

> Bloated CLAUDE.md files cause Claude to ignore your actual instructions!

含めるもの: Claude が推測できない Bash コマンド、デフォルトと異なるスタイル規則、テストランナー、リポジトリの作法、アーキテクチャ上の決定、環境の癖、落とし穴。除外するもの: コードから導けるもの、標準的な慣習、API ドキュメント (リンクする)、頻繁に変わる情報、チュートリアル、ファイル単位の説明。判定基準は「この行を消したら Claude は間違えるか」。強調 (IMPORTANT) は 1 行だけ。`/doctor` が削減案を出し、git にチェックインし、`/context` で読み込みを確認する。

```markdown
# Code style
- Use ES modules (import/export) syntax, not CommonJS (require)
- Destructure imports when possible (eg. import { foo } from 'bar')

# Workflow
- Be sure to typecheck when you're done making a series of code changes
- Prefer running single tests, and not the whole test suite, for performance
```

公式が示す最小形。プロジェクトルートの `CLAUDE.md` に置く。

> If Claude already does something correctly without the instruction, delete it or convert it to a hook.

#### サイズと読み込みの仕組み

- 目標は 1 ファイル 200 行未満。長いほどコンテキストを消費し遵守率が下がる。
- 4 MiB 超のファイルは丸ごとスキップされる。
- `@import` は整理のための機能で、コンテキスト削減にはならない。import 先も起動時にロードされ、200 行警告と合計サイズ警告に個別にカウントされる。
- 起動時と `/status` が、1 ファイルの超過と合計の超過をそれぞれ警告する。
- ルートおよびユーザーの CLAUDE.md はセッション開始時に一度だけ読まれ、system prompt の後に user message として渡される。セッション中に編集しても `/clear`、`/compact`、再起動まで反映されない。まだロードされていないネストした CLAUDE.md と path-scoped rules は編集後の内容で読まれる。
- ネストした CLAUDE.md は、Claude がそのサブディレクトリのファイルに触れた時点で遅延ロードされる (`Loaded <path>` 行が出る)。`/context` には起動時ロード分しか載らない。InstructionsLoaded hook で何がなぜ読まれたかを記録できる。

#### .claude/rules/ と paths frontmatter

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

`.claude/rules/api.md` に置く。`paths` のあるルールは Claude が一致するファイルを read/write/edit (または `cat`/`head`) したときだけロードされる。`paths` のないルールは起動時に `.claude/CLAUDE.md` と同じ優先度でロードされる。読まれる frontmatter キーは `paths` のみ。無効な YAML は無視されて無条件ロードになる (`claude --debug` で確認)。ルール群は展開後 1,000 パターンと 4 MiB の予算を共有する。`--setting-sources` で `project` を外すと project rules は読まれない。常時ロードを本当に減らす公式の手段はこの path-scoped rules である。

#### AGENTS.md

v2.1.277+ で、cwd 以上に `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md` のいずれも存在しない場合にだけ `AGENTS.md` がプロジェクト指示として読まれる。実装は組み込み mod `cc-plugin-agents-md` で、"Project instructions" 設定 (`claude-md-or-agents-md` 既定、`claude-md-and-agents-md`、`claude-md`、`managed-only`) で挙動を変える。

```json
{
  "pluginConfigs": {
    "cc-plugin-agents-md@builtin": {
      "options": { "instructionFiles": "claude-md-and-agents-md" }
    }
  }
}
```

`~/.claude/settings.json`、`--settings`、managed settings からのみ読まれる。v2.1.285 より前のプラグイン ID は `agents-md@builtin` (v2.1.285+ はどちらも読む)。v2.1.281 より前は Bedrock/Vertex/Foundry/gateway/telemetry off のセッションで AGENTS.md は読めなかった。`AGENTS.local.md` と `.agents/` は読まれない。AGENTS.md に対しては InstructionsLoaded hook が発火しない。

#### /doctor prompt-audit

`/doctor prompt-audit` (別名 `/checkup prompt-audit`、v2.1.283+) は CLAUDE.md、CLAUDE.local.md、AGENTS.md、rules、skills、commands、subagents、output styles を走査し、古いモデル向けに書かれたパターン、死んだ参照、矛盾を報告する。パス引数でスコープを絞れる。bundled の `/claude-api` skill 経由で動くので、`skillOverrides` や `disableBundledSkills` で無効化していると使えない。提案を適用するよう頼むまで何も変更されない。公式ブログ (large codebases、2026 年 5 月 14 日) の "Teams should expect to do a meaningful configuration review every three to six months" と "instructions written for your current model can work against a future one" を機械化したものと考えてよい。

### 12.5 拡張機構の選び方、優先順位、コンテキストコスト

#### 症状から選ぶ

features-overview の決定表は「何が起きたら何を足すか」で書かれている。

| 症状 | 追加するもの |
|---|---|
| 同じ慣習やコマンドを 2 回間違える | CLAUDE.md |
| 短く、この形式で、と繰り返し頼む | output style |
| 同じプロンプトを繰り返し打つ | user-invocable skill (`/command`) |
| 同じ手順書を 3 回貼った | skill |
| ブラウザからコピペしている | MCP |
| シンボル探索で大量にファイルを読む | code intelligence (LSP) plugin |
| 副作業がコンテキストを埋める | subagent |
| 毎回必ず起きてほしい | hook |
| 2 つ目のリポジトリで同じセットアップ | plugin |

> Put guardrails in hooks. An instruction like "never edit `.env`" in CLAUDE.md or a skill is a request, not a guarantee. A `PreToolUse` hook that blocks the edit is enforcement.

公式ブログ "Steering Claude Code" も同じ線を引く: "The model choosing to run a formatter is different from the formatter running automatically." 同記事によれば output style は "never get compacted, load at the start of every session, and are cached after the first request within a session" で、"carry the highest instruction-following weight of any method"、既定のコーディング指示は `keep-coding-instructions: true` を frontmatter に書かない限り落ちる。`--append-system-prompt` は "only additive to the original system prompt" で、その起動にだけ効く。

#### 優先順位 (layering)

- CLAUDE.md: 加算的。すべてのレベルがロードされる。
- skills: 名前で上書き。managed > user > project。plugin の skill は `/my-plugin:review` のように名前空間付き。
- subagents: 名前で上書き。managed > CLI flag > project > user > plugin。
- MCP servers: 名前で上書き。local > project > user。
- hooks: マージ。全部発火する。

#### コンテキストコスト

| 機構 | コスト |
|---|---|
| CLAUDE.md、output style | 毎リクエスト全文 |
| skill | description が毎リクエスト、本文は使用時。`disable-model-invocation: true` または `skillOverrides` でゼロ |
| MCP | ツール名のみ。schema は tool search で遅延 |
| hook | 出力を返さない限りゼロ |
| subagent | 隔離 |

subagent の `skills:` に列挙した skill は起動時に全文プリロードされる (2.1.295 から上限 32)。列挙していない skill も Skill ツール経由で呼べる。組み込みの Explore と Plan agent は CLAUDE.md と git status なしで起動する。カスタム subagent は `omitClaudeMd` frontmatter (2.1.271) で user/project/local CLAUDE.md を外せる。`/skill-doctor` (v2.1.252+、feature-flag fetching が必要) は各 skill のコンテキストコストと使用頻度を出す。

```markdown
---
name: api-conventions
description: REST API design conventions for our services
---
# API Conventions
- Use kebab-case for URL paths
- Use camelCase for JSON properties
- Always include pagination for list endpoints
- Version APIs in the URL path (/v1/, /v2/)
```

`.claude/skills/api-conventions/SKILL.md`。参照型 skill。description だけが常駐し、本文はオンデマンド。CLAUDE.md を痩せさせる定石。

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

`.claude/skills/fix-issue/SKILL.md`。`/fix-issue 1234` で起動。副作用のある action 型は `disable-model-invocation: true` で description を常駐させず、Claude の自発起動も防ぐ。

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

`.claude/agents/security-reviewer.md`。独立コンテキストと制限されたツールで動く。

#### hooks の最近の変更

- `PreModelSwitch` / `PostModelSwitch` (2.1.251)。
- command/HTTP hook の `onFailure: "block"` (2.1.295): 起動失敗、タイムアウト、想定外の終了コードでアクションを通さずブロックする。
- PreToolUse / PermissionRequest の `updatedInput` は Claude 自身の入力と同様に検証される (2.1.300)。
- agent 型 hook は PermissionRequest で動かない (2.1.280)。
- 指示文として書かれた prompt/agent hook ("Carry on if the build is broken") が、ブロックすべきものを許していたバグの修正 (2.1.294)。
- prompt/agent hook はイベントごとに同時 12 本まで (2.1.302)。
- UserPromptSubmit hook は skill/command 展開前に走る (2.1.299)。
- hook は `effort.level` / `$CLAUDE_EFFORT` で現在の effort を参照できる。

#### Mods

mods (v2.1.287+、desktop 2.1.286+) は JS/TS ハンドラが Claude Code 内部で動く plugin で、ペインの描画、ツール呼び出しやプロンプトの書き換え、即時の `/command`、ツール呼び出しの承認ができる。あなたの権限で、サンドボックスなしで動く。

> A mod that approves tool calls can approve one that an `ask` rule would prompt for, or that one of your own `PreToolUse` hooks blocked.

インストール前に `claude plugin validate ./mod` で `hooks:` と `calls:` を確認する。停止手段は `/plugin` での無効化、`--safe-mode` (1 セッション)、`"disableAllHooks": true` (settings hooks と status line も止まる)。いずれも組み込み mod (cc-plugin-agents-md、cc-plugin-diff、cc-plugin-plugin-authoring、cc-plugin-sec-default、cc-plugin-telemetry、cc-plugin-you-should-know) は止めない。`cc-plugin-you-should-know` は既定オフで `/plugin enable cc-plugin-you-should-know@builtin` で有効化、first-party セッションと telemetry on が必要。`CLAUDE_CODE_ENABLE_FUNCTION_HOOKS` は 2.1.287 から無視される。

```javascript
// The count, shared by the two hooks below
let calls = 0

// Claude Code calls this once when the mod loads
export function register(on) {
  // Runs each time Claude is about to use a tool
  on('tool.call', async ($, e, next) => {
    calls += 1
    // Ask Claude Code to draw the interface again, so the new count shows
    $.ui.invalidate('ui.render')
    // Let the tool run as usual
    return next(e)
  })

  // Runs each time Claude Code draws the spinner
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // Keep Claude Code's spinner, with the count added after its word
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
```

`first-mod/hooks/register.js`。`.claude-plugin/plugin.json` と `hooks/hooks.json` と組み合わせる最小 mod。

### 12.6 マルチセッションと subagent の設計

コーディネーションを自分でどれだけ行うかで並べると、worktrees、cross-session messaging、desktop app、cloud、agent view (research preview、`claude agents`)、agent teams (experimental、既定オフ) の順になる。

#### subagent の既定と上限

- 対話セッションでは subagent は既定でバックグラウンド実行。2.1.302 で desktop/VS Code はメイン会話の subagent を常にバックグラウンドにし、subagent 自身の Agent 呼び出しはフォアグラウンド。
- Fork mode は既定オン。Claude は `subagent_type: "fork"` を要求でき、会話全体と prompt cache を引き継ぐ。`/subtask <task>` で手動起動。`CLAUDE_CODE_FORK_SUBAGENT=0` で無効。2.1.302 で `claude -p`、SDK、desktop、VS Code でも既定になった (sub-agents.md と env-vars.md はまだ -p/SDK でオフと記載しており、changelog の方が新しい)。
- 深さは既定でメインの 3 層下まで (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`、1 でネスト禁止)。同時実行は 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`、v2.1.217+)。セッションあたりの総数上限 (旧 200) は撤廃。ultracode セッションは免除。`/subtask` はスロットを使うがブロックされない。
- `maxTurns` に達した subagent は部分出力を返し、SendMessage で続けるヒントを添える。
- subagent の結果は 2.1.277 から「subagent 出力」ヘッダ付きでインデントされて届くため、結果中のテキストがセッションの指示として通らない。workflow の `agent()` プロンプトも script 由来として safety classifier に提示される。
- Agent ツールに `effort` パラメータ (2.1.292)。subagent frontmatter に `autoCompactWindow` (2.1.296)。

```json
{
  "env": {
    "CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH": "2"
  }
}
```

settings.json の `env` でネスト深さを絞る例。

#### Cross-session messaging

v2.1.224+ (macOS/Linux)、native Windows v2.1.234+、Bedrock/Vertex/Foundry v2.1.248+。セッションは ListAgents で互いを発見し SendMessage で送る。`@` で別セッションをメンション (v2.1.232+)。`notify_when_idle` で相手が次に idle になったとき 1 回通知を受ける (v2.1.236+)。セッション名はマシンごとに一意化される。

> A message is text Claude writes for the other session, never your conversation history or files.

受信側はピアからのデータとして扱い、ユーザー権限とはみなさない。配送は permission class で保留される: bypass 中の受信側は送信側も bypass でない限り保留、プロンプトする受信側は送信側が bypass でない限り配送。`crossSessionInbound: "refuse"` で受信拒否、`isolatePeerMachines: true` (どのスコープで true でも勝つ) でマシン外への送信に承認を要求。

```json
{
  "permissions": {
    "deny": ["SendMessage", "ListAgents"]
  }
}
```

ツール自体を外す (subagent/teammate のメッセージングも消える)。`/list-agents` の別名は `/peers`。`-p` セッションは `dialogExpiry` (5 分) だけメッセージを保持する。コンテナとホスト、WSL2 とネイティブ Windows は互いに届かない。

#### Agent view と background sessions

`claude agents` が background session の一覧画面。`claude --bg "prompt"` (`-p` とは併用不可)、`claude --bg --exec 'cmd'` でコマンド行を作る、`claude --agent <name> --bg`、`claude attach <name>` (2.1.290 から部分一致)、`claude logs`、`claude stop/respawn/rm`、`/background` (`/bg`)、`/fork`。Ctrl+F で名前検索 (2.1.288)。`/effort` と `/fast` が dispatch される session の既定を設定 (2.1.299)。

> Before editing files, Claude moves the session into an isolated git worktree under `.claude/worktrees/`, so parallel sessions can read the same checkout but each writes to its own.

```json
{
  "worktree": {
    "bgIsolation": "none"
  }
}
```

プロジェクトの `.claude/settings.json`。`claude --bg` の worktree 移動を止める。

```bash
claude agents --permission-mode plan --model opus --effort high
claude --bg --exec 'pytest -x'
claude --agent code-reviewer --bg "address review comments on PR 1234"
```

`/config defaultToAgentsView=true` で既定画面にし、`disableAgentView` または `CLAUDE_CODE_DISABLE_AGENT_VIEW` で無効化。background session は終了前に commit と push を行い CLAUDE.md の git 指示に従う。

#### Worktree isolation は強制

Week 32 以降、worktree isolation はファイル編集だけでなく Bash コマンドと git リダイレクト (`git -C`、`--git-dir`、`GIT_DIR`/`GIT_WORK_TREE`、`cd`) がメインチェックアウトに届くのを、すべてのセッション種別と subagent でブロックする。ただし `cp` やシェルリダイレクトでメインチェックアウトへ書く操作はチェックされず、通常のパーミッションだけが掛かる。並列セッションの安全境界として使うならこの隙間を知っておく。`claude --worktree <name>` は最低 1 コミット必要で、GitHub PR / GitLab MR の URL を受け付ける (2.1.233+)。`worktree.baseRef` でリモート既定ブランチかローカル HEAD かを選ぶ。終了時に表示される resume コマンドは注入防止のため名前でなくセッション ID を使う (2.1.299)。

#### Agent teams (experimental)

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  }
}
```

既定オフ。有効にすると通常の委譲が変わる。

> Claude may name a subagent on its own, and while agent teams are enabled, a subagent that Claude names launches as a teammate, so teams can form even when you didn't ask for one.

teammate はリーダーの会話を継承せず、CLAUDE.md、MCP、skills と spawn prompt だけを受け取る。リーダーの permission mode (dontAsk を除く) と effort を引き継ぐ。表示は `teammateMode` (in-process 既定、auto、tmux、iterm2)。モデル選択順は spawn prompt > subagent 定義の `model` > `CLAUDE_CODE_SUBAGENT_MODEL` > リーダーのモデル (`CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` で上書き、v2.1.257+)。hooks は TeammateIdle、TaskCreated、TaskCompleted (exit 2 でブロック)。制約: in-process teammate は resume 不可、1 セッション 1 チーム、ネスト不可、teammate からの background subagent 不可、分割ペインは tmux/iTerm2 が必要。in-process teammate はサブスクリプションでも 5 分 TTL (`subagentPromptCacheTtl` で変更)。Task tools (TaskCreate 等) は Opus 4.8 / Sonnet 5 / Fable 5 / Mythos 5 以降では `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` がないと使えず、その場合チームはメッセージだけで協調する。

#### Dynamic workflows

Claude が JS script を書いて subagent をオーケストレーションする。`agent()`、`pipeline()`、`parallel()`、`phase()`、`log()`、`args` が使える。

> A workflow script holds the loop, the branching, and the intermediate results itself, so Claude's context holds only the final answer.

起動は `ultracode` キーワードか "use a workflow"。`ultracode` は人間が打ったプロンプト (対話、IDE、Remote Control、人間入力としてスタンプされた SDK 入力) でのみ発火し、`-p`、scheduled task、webhook では何もしない。`/effort ultracode` で実質的なタスクをすべて workflow にする。`/deep-research` は bundled workflow。`.claude/workflows/` または `~/.claude/workflows/` に保存すると `/<name>` になる。

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

`.claude/workflows/audit-routes.js` のような保存形 (公式ページはファイル名を指定していない)。`agent()` は停止や回復不能エラーで null になるので `.filter(Boolean)` する。

制約: 既定 16 並列 (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` 1 から 256、v2.1.269+、CPU 制限コンテナではさらに少ない)、`parallel()`/`pipeline()` あたり 4,096 要素、1 run 1,000 agent、`import()` 不可、実行中のユーザー入力不可、再生可能性のため `Date.now()`、`Math.random()`、引数なし `new Date()` は throw。stall したエージェントは最大 6 回試行し、`parallel()`/`pipeline()` 内なら null で続行、トップレベルで await していれば run が終了する。`agent(prompt, { stallMs: 1800000 })` または `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` で調整。model/effort/type/tools/schema/cwd が同一の agent はキャッシュプレフィックスを共有する。

`workflowSizeGuideline` (small <5 / medium <10 / large <50 / unrestricted、既定 medium、Pro は small、v2.1.271+) は Claude への助言であって強制上限ではない。25 agent 超または 1.5M トークン超の見込みで "Large workflow" 警告。`disableWorkflows: true` または `CLAUDE_CODE_DISABLE_WORKFLOWS=1` で無効化。`CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` (2.1.296) で workflow agent のモデルを固定。`-p`/SDK では `Workflow` または `Workflow(<name>)` の allow rule で承認。`"ultracode": true` を設定に置くと毎セッション ultracode on で始まる (effort は変えない。`claude --effort ultracode` は依然 xhigh にする)。

### 12.7 ヘッドレス運用とスケジューリング

```bash
# One-off queries
claude -p "Explain what this project does"

# Structured output for scripts
claude -p "List all API endpoints" --output-format json

# Streaming for real-time processing
claude -p "Analyze this log file" --output-format stream-json --verbose

claude --permission-mode auto -p "fix all lint errors"
```

`json` は `result` フィールドを持つ 1 オブジェクト、`stream-json` は init イベントから始まる 1 行 1 JSON。`--output-format json --json-schema` で `structured_output`、`--include-partial-messages` でトークンストリーミング。`system/init` に `plugin_errors` が載る。`--mcp-config` 付きの `-p` は `MCP_TIMEOUT` (30 秒) まで待つ。`claude -p` は `--no-session-persistence` を付けない限り resume 可能なセッションを作る。2.1.295 から 5 秒後に stderr へ "Waiting for background work to finish" が出る。

```bash
for file in $(cat files.txt); do
  claude -p "Migrate $file from Python 2 to Python 3. Return OK or FAIL." \
    --allowedTools "Edit,Bash(git commit *)" \
    --permission-mode dontAsk
done
```

`dontAsk` はプロンプトが出る操作をすべて自動拒否するので、ループが止まらない。2 から 3 ファイルで試してから全件に回す。対話的には `/batch <instruction>` が 5 から 30 の subagent に分割し、各 subagent が自分の worktree で実装、テスト、公開する。`/batch` は既定で git リポジトリを要求し、v2.1.281 から WorktreeCreate hook で非 git でも動く。model/effort オプションは未記載。

```bash
claude -p "Update the dependency pins and run the tests" --permission-mode auto --permission-prompts none
```

`--permission-prompts none` (2.1.259) はプロンプトが出る操作を自動拒否しつつ、アクティブモードが判断を続ける。AskUserQuestion などの端末入力ツールも外れる。stream-json では `permission_denied` system message と result の `permission_denials` に現れる。

```bash
claude --restricted -p "review src/ for SQL injection risks"
```

`--restricted` / `CLAUDE_CODE_RESTRICTED=1` (v2.1.248、settings の env ブロックでは無視) はコマンド実行ツールと WebFetch を外し、ファイルツールを作業ディレクトリに限定し、managed settings と `--settings` だけを読み、bypassPermissions を拒否する。`--tools "Bash,Read,Edit"` で戻せるが `default` プリセットは外したツールを復元しない。`--bare` (2.1.286) はコマンドラインで名指しした MCP サーバーだけ接続し、system reminder を送らず、background task を起動しない。`claude --bare -p ... --allowedTools "Read"` が最小形。

無人運用のリトライ制御: `CLAUDE_CODE_RETRY_WATCHDOG` と `CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS` (2.1.295)、`CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS` (2.1.301)、モデル呼び出しごとに最大 14 リクエストのリトライ予算 (2.1.286)、`CLAUDE_CODE_OVERLOADED_RETRY_BASE_DELAY_MS` (2.1.292) と `_MAX_DELAY_MS` (2.1.296)。背景 Bash/PowerShell は無人セッション (-p、SDK、CI、cloud) ではタイムアウト (既定 30 分、最大 2 時間) で止まり、端末/desktop/VS Code では無制限。WebFetch は 5 分で失敗 (`CLAUDE_CODE_WEBFETCH_DEADLINE_MS`、0 で解除)、WebSearch は対話セッションで毎時 100 回の補充予算 (`CLAUDE_CODE_WEB_SEARCH_REFILLS_PER_HOUR`、0 で無効)。

スケジューリングの選択肢は Routines (cloud、claude.ai/code/routines、スケジュール/API/GitHub トリガー)、Desktop の scheduled task、GitHub Actions、`/loop` (現在の CLI セッション、間隔省略で自己ペース、`--resume`/`--continue` で復元)。

> When writing prompts for scheduled tasks, be explicit about what success looks like and what to do with results. The task runs autonomously, so it can't ask clarifying questions.

新しい routine は 2.1.283 から既定で毎時数分過ぎに設定される (正時は開始が遅れやすい)。

### 12.8 パーミッション: auto mode の現在地

#### 既定化の経緯

- Week 32: 8 月 14 日から Pro/Max/Team で auto mode が既定、classifier 呼び出しは利用制限にカウントされない。
- 2.1.284: 対話端末と VS Code で、モードが未設定ならすべてのプランとプロバイダで auto から始まる。
- 2.1.285: `-p` / Python SDK も third-party や telemetry off で auto。
- 2.1.302: `-p` / SDK はモード未指定で third-party プロバイダ、telemetry off、新規インストールのとき `default` に戻された (`--permission-mode auto` を付ければ auto)。

classifier モデルがアクションを審査し、スコープ拡大、未知のインフラ、敵対的コンテンツに駆動されたアクション、2.1.257 からは Containment Escape (cloud metadata の資格情報取得、egress 回避、cross-tenant 到達) をブロックする。allowlist と sandbox は auto mode でもプロンプト削減と制約に効く。読み取りと protected path 以外の作業ディレクトリ内編集は classifier を通らない。`/permissions` の Auto mode タブでルール編集 (Week 35)、ブロック理由は `[Data Exfiltration]` のように一致ルール名を含む (Week 37)。

```json
{
  "permissions": {
    "defaultMode": "auto"
  }
}
```

`~/.claude/settings.json` または managed settings に置く。`auto` と `bypassPermissions` はプロジェクトの `.claude/settings.json` と `.claude/settings.local.json` では無視される (bypass の無視は 2.1.257)。VS Code 拡張は開始モードにプロジェクト設定を一切読まない。managed の `disableAutoMode: "disable"` は auto を除去し、`--permission-mode auto` でも Manual で始まる。

#### フォールバック閾値

> if the classifier blocks an action 3 times in a row or 20 times total, auto mode pauses and Claude Code resumes prompting.

閾値は設定不可。`-p` で `--permission-prompt-tool` がなければアクションは実行されず Claude は作業を続ける。ブロックされたアクションは `/permissions` の "Recently denied" に出て `r` で手動承認で再試行。サーバー側審査では、サーバーが判定を返さないアクションを拒否し、判定なしの応答が 10 回続くとターンを終える (2.1.302 からは会話が長すぎてサーバー審査できない場合、全拒否でなく圧縮する)。

#### サーバー側 classifier

```bash
export CLAUDE_CODE_AUTO_MODE_SERVER=0
```

2.1.278 から Claude API / Enterprise および Bedrock/Vertex/Foundry/gateway で、classifier オーバーヘッドを課金しないサーバー側審査が既定。`=0` でローカル (課金あり) classifier を強制、`=1` でオプトイン。一時的な設定と明記されている。バージョン要件は対話端末 v2.1.271+ (Pro/Max/Team)、v2.1.278+ (Enterprise/API)、`-p`/SDK/VS Code/desktop v2.1.281+、gateway/cloud provider v2.1.278+、サインイン済み Claude apps gateway v2.1.280+。v2.1.282 から feature-flag fetching off のセッションも既定でサーバー側を使う。ヘッダやボディ (`safeguards`) を剥がす、`safeguard_results` を落とす gateway ではローカルへのフォールバックと課金通知が出る (Pro/Max/Team には通知が出ない)。`/status` の "Auto mode server" 行で確認。ローカル classifier は既定で Claude Sonnet 5 (サーバー設定が優先、2.1.288 から `ANTHROPIC_DEFAULT_SONNET_MODEL` に Sonnet 5.5 / Opus 5.5 を指定しても無視)、2.1.302 の `CLAUDE_CODE_AUTO_MODE_MODEL` でクライアント側モデルを選べる。

#### 作業ディレクトリ外の読み取り

2.1.257 から auto mode は作業ディレクトリ外の最初のファイル読み取り前に 1 回だけ尋ね、`permissions.blockReadsOutsideWorkingDirectories` で恒久ブロックできる (bypassPermissions を含む全モードで有効、Read/Grep/Glob/LSP を拒否)。2.1.284 で "Yes, but ask again next time" が追加。

会話中の境界 ("push しないで") は毎回 transcript から読み直されるため圧縮で失われうる。確実な保証は deny rule で行う。ブランチ名なしの "force-push していい" は何も解除しない。bypass/auto mode での危険な `rm` プロンプトは 2 分で自動拒否 (`CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT=1`、2.1.281)。classifier の誤検知は `/feedback` が公式経路で、`SendFeedback` ツール (digest では v2.1.238+、changelog では 2.1.247、feature-flag fetching が必要) が下書きを作り、`feedbackDrafts` 設定で無効化できる。

### 12.9 プロンプトキャッシュとコスト設計

#### TTL バケット

Claude サブスクリプションでプラン利用枠内なら、メイン会話は 1 時間、それ以外 (subagent、workflow、teammate、fork、compaction) は 5 分。usage credits、API キー、cloud provider ではすべて 5 分で、`promptCacheTtl` / `subagentPromptCacheTtl` (`5m` | `1h`、ページは v2.1.242 と記すが changelog では 2.1.243) で変更する。1 時間の書き込みは高い。Claude apps gateway では 1h 不可、`ANTHROPIC_BASE_URL` の gateway は `anthropic-beta` を転送する必要がある。

> If you sign in with an API key or use a cloud provider, set `promptCacheTtl` to `1h` to give the main conversation a one-hour cache.

優先順位: `FORCE_PROMPT_CACHING_5M=1` > バケット env (`CLAUDE_CODE_PROMPT_CACHE_TTL` / `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`) > バケット設定 > agent frontmatter `experimental.cacheTtl` (v2.1.248+) > `ENABLE_PROMPT_CACHING_1H=1` > 既定。確認は `claude -p "hello" --output-format json` の `usage.cache_creation.ephemeral_1h_input_tokens`。

#### キャッシュを壊す操作と壊さない操作

> Pick your model and effort level at the top of a session, then save `/compact` for natural breaks between tasks. The fewer changes you make mid-task, the higher your cache hit rate.

壊す: モデル切替 (opusplan の plan mode トグル、skill/command の `model:` frontmatter、safety classifier のモデルフォールバックも含む)、effort 変更 (Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 5.1 を API キーまたはサブスクリプションで使う場合は例外。Bedrock/Vertex/Claude apps gateway、`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`、HIPAA では例外なし。v2.1.260 より前は Fable 5.1 も無効化)、fast mode の遅い有効化 (次ターンで fast-mode 料金の再読込 1 回)、tool search 未使用時の MCP サーバー追加/削除、MCP サーバーを含む plugin の有効化、tool search なしの bare tool deny rule、compaction、画像の蓄積、アップグレード。

壊さない: ファイル編集、CLAUDE.md 編集、permission mode、output style (v2.1.251+)、skills、`/recap`、`/rewind`、subagent、`/advisor` トグル、`/cd`。`/cost` と `/usage` の "Prompt cache (main)" 行がヒット率と直近ミスの推定原因を示す (v2.1.251+ / 2.1.260+)。

#### Idle compaction

2.1.299 で端末に追加 (設定は 2.1.290+、`/config` 行は 2.1.302)。条件はすべて満たす必要がある: 対話端末セッション、1h TTL、feature-flag fetching、コンテキストが閾値以上 (既定 200,000、下限 100,000)、約 54 分アイドルでマシンが起きている。`"idleCompaction": false`、`DISABLE_AUTO_COMPACT`、`autoCompactEnabled: false` のいずれでも止まる。API キー / cloud provider セッションは `promptCacheTtl: "1h"` と flag fetching があれば対象、Bedrock/Vertex/Foundry や telemetry off では動かない。transcript には "Compacted while idle, before the prompt cache expired" と出る。

```json
{
  "env": {
    "CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS": "150000"
  }
}
```

#### モデルと価格 (直近 2 か月)

| モデル | ID | 追加 | 価格 (入力/出力 per MTok) | cache read |
|---|---|---|---|---|
| Opus 5.5 | `claude-opus-5-5` | 2.1.280、既定 Opus、1M | $4 / $20 | $0.20 |
| Sonnet 5.5 | `claude-sonnet-5-5` | 2.1.284、既定 Sonnet | $2 / $10 | 発売時 $0.20、2.1.296 で $0.10 |
| Haiku 5.5 | `claude-haiku-5-5` | 2.1.293、既定 Haiku、1M | $0.10 / $0.50 (100K 超は $0.50 / $2.50) | |
| Fable 5.1 | `claude-fable-5-1` | 2.1.257、既定 Fable、1M | $10 / $50 | $0.25 |

Pro と Team Standard の既定は 2.1.280 で Sonnet から Opus に変更。Opus 4.7+ と Fable は Bedrock/Vertex/Foundry/gateway で `[1m]` サフィックスなしに 1M を使う (2.1.287、`CLAUDE_CODE_DISABLE_1M_CONTEXT=1` で 200K)。カスタム `ANTHROPIC_BASE_URL` でも 1M。gateway が 200K で止まるなら `/autocompact 200k` (2.1.285)。`ANTHROPIC_DEFAULT_MODEL` は新規セッションの開始モデル、`/model` の選択はそれを上書きして永続する。`/effort` はモデルごとに保存され (`s` で現セッションのみ)、新モデルには引き継がれない。`maxEffortLevel` (トップレベルまたは `modelSettings` 配下、2.1.267) は全プロバイダで effort を上限制限する。

#### Advisor

`/advisor <model>`、`advisorModel` 設定、`--advisor` フラグ (experimental、Anthropic API のみ、feature-flag fetching 必要、`claude --help` には出ない) で、判断点で上位モデルに相談させる。advisor はメインモデル以上のランクが必要 (Sonnet 5.5 main は Fable、Opus 5+、Sonnet 5.5 を受け付け、Opus 5/5.5 main は Fable または Opus 5+、Fable 5.1 は Fable 5.1 のみ。Sonnet 5.5 が Opus 4.7/4.8 を advise するには v2.1.287+、Haiku 5.5 は v2.1.293+)。呼び出しごとに全 transcript を advisor モデル料金で非キャッシュ課金。`CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` で無効。2.1.300 で Claude Platform on AWS に追加されたが advisor.md はまだ未対応と記載 (docs 側の遅れ)。

```json
{
  "advisorModel": "opus"
}
```

### 12.10 その他の重要アップデート (2026 年 8 月から 10 月)

#### コードレビューの 3 層

1. `/code-review` (別名 `/review`): ローカル、全プラン、どの effort でもバックグラウンド subagent。`--max-findings` は findings ツール経由で 32 が上限、`-p` での値は記憶されない。level 未指定なら前回の level を再利用。`--fix` の編集はチェックポイント外 (`/rewind` で戻らない。git を使う)。`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` でフォアグラウンド。project skill に `code-review` を置くと bundled を置き換えるが `/review` は bundled のまま。
2. `/code-review ultra` = `/ultrareview`: cloud fleet、research preview、Pro と Max に各 3 回の無料枠 (1 回限り)、以降 $5 から $25 の usage credits、15 から 25 分、claude.ai ログイン必要。ブランチ上限は既定 500 ファイル / 8,000 行、PR モードはアップロードなし、`--post` で自分のアカウントから 1 件のコメント投稿 (v2.1.227+)。Bedrock/Vertex/Foundry と ZDR/HIPAA 組織はローカルレビューに置き換わり、CMEK 組織は実行できない。途中停止しても無料枠を消費する。

```bash
claude ultrareview
claude ultrareview 1234
claude ultrareview origin/main
claude ultrareview 1234 --json --timeout 45 --post
```

`--timeout` 既定 45 分、exit 0 完了 / 1 失敗・タイムアウト / 130 Ctrl-C。4 行目はフラグ表から構成した例。

> `claude -p '/code-review ultra'` doesn't get you the findings, so use `claude ultrareview` in scripts.

3. Code Review for GitHub PRs: Team/Enterprise、Owner が有効化、inline コメントと check run、`REVIEW.md` でカスタマイズ、`@claude review` コメントで起動。ページに preview ラベルはないが GA と明記もされていない (未検証)。

#### Channels (research preview)

```bash
claude --channels plugin:telegram@claude-plugins-official
```

MCP server plugin から実行中セッションへイベントを push する。公式 plugin は telegram、discord、imessage、fakechat。Bun が必要。Organization では Owner が Organization settings > Claude Code > Channels で有効化するか、managed settings の `channelsEnabled: true` で有効化 (Console org が managed settings を配布する場合も必要)。Pro/Max で org なしならこの有効化チェック自体がスキップされ、`--channels` で指定するだけで使える。claude.ai または Console API キー認証が必要。Bedrock/Vertex/Foundry では使えない。

```json
{
  "channelsEnabled": true,
  "allowedChannelPlugins": [
    { "marketplace": "claude-plugins-official", "plugin": "telegram" },
    { "marketplace": "claude-plugins-official", "plugin": "discord" },
    { "marketplace": "acme-corp-plugins", "plugin": "internal-alerts" }
  ]
}
```

managed settings。`allowedChannelPlugins` は `channelsEnabled: true` が前提。

> Being in `.mcp.json` isn't enough to push messages: a server also has to be named in `--channels`.

メッセージは `<channel source="plugin:<name>:<server>">` イベントとして届く。sender allowlist が注入と permission relay の承認を制御するので信頼できる送信者だけを登録する。`-p` では AskUserQuestion や plan 承認などの端末入力ツールが無効化され、セッションが止まらない。Telegram は `/telegram:configure <token>` (`~/.claude/channels/<name>/.env` に保存)、`/telegram:access pair <code>`、`/telegram:access policy allowlist`。`--dangerously-load-development-channels` は未掲載 channel を読む。

#### Fullscreen rendering (research preview)

```bash
CLAUDE_CODE_NO_FLICKER=1 claude
CLAUDE_CODE_NO_FLICKER=1 CLAUDE_CODE_DISABLE_MOUSE=1 claude
export CLAUDE_CODE_SCROLL_SPEED=3
```

または `/tui fullscreen` / `/tui default` で `tui` 設定を永続化。alternate screen でマウス対応、メモリ一定。feature flag を取得し 2026 年 5 月 6 日以降に初使用したセッション、および flag fetching off で v2.1.239+ を初回起動したインストールで既定。`/diff` が live side panel になる (v2.1.260、110 列以上、git repo)。Ctrl+O で transcript mode (`/` 検索、`[` で native scrollback に書き出し、`v` で `$EDITOR`)。`/focus` で静かな表示。`CLAUDE_CODE_DISABLE_MOUSE_CLICKS=1`、`CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` または `NO_FLICKER=0` で classic 強制。iTerm2 の `tmux -CC` とは非互換。2 回起動に失敗すると `/tui fullscreen` か更新まで classic に戻る。

#### Plugin ツール

- `claude plugin eval` (v2.1.269): テストスイートで plugin あり/なしを採点。`claude plugin eval init` がケースと grader を下書き。各 run と LLM 判定は実際のモデル呼び出し。git 2.31+ (2.1.283)。`--disallow-tools` で Agent などを eval から除外 (2.1.299)。レポートは `evals/results/report.html`。
- `claude plugin validate --json`: 落とされる `.mcp.json` エントリ、未宣言の `${user_config.*}`、insecure URL、mod のゲート hook を報告。
- `claude plugin configure <plugin>` と `--config <server>.<key>=<value>` (2.1.285)。
- `claude plugin install --marketplace <source>` (2.1.292)。npm plugin は `npm pack --ignore-scripts` で取得。claude.ai の skills/plugins は端末へ同期 (`syncClaudeAiSkills` / `syncClaudeAiPlugins: false` でオプトアウト、`anthropic-skills:<name>`)。

#### 出力スタイルと表示

```json
{
  "outputStyle": "Concise"
}
```

組み込みの Concise (v2.1.237) は結果から書く。v2.1.251 からセッション中の切替は即時反映でキャッシュを維持。`maxProseWidth` (2.1.282)、`timeFormat` / `timeZone` (2.1.257)、`spellcheck` (Week 34)。

```json
{
  "attribution": false
}
```

2.1.281 で commit / PR attribution を非表示。ただし旧バージョンはこの値を拒否して settings ファイル全体をスキップするので、共有ファイルでは `attribution.commit` / `attribution.pr` を `""`、`sessionUrl` を `false` にする方が安全。

#### 注入対策の強化

2.1.277 の subagent 結果ヘッダに加え、skills は生の制御文字を含む `!` シェルコマンドを拒否 (2.1.290)、hidden/bidi 文字を含む skill/command ファイルは提示されない (2.1.299)、`!` bash-mode コマンドは strict でも sandbox 外で実行 (2.1.260)、skill の `!` コマンドは auto mode でも default-mode ルールに従う (2.1.271)。

### 落とし穴と対策

- **auto / bypass をプロジェクト設定に書いても効かない**: `permissions.defaultMode` の `auto` と `bypassPermissions` はプロジェクトの `.claude/settings.json` / `settings.local.json` で無視され Manual で始まる。`~/.claude/settings.json`、managed settings、または `--permission-mode` を使う。
- **CLAUDE.md をセッション中に直しても効かない**: root / user の CLAUDE.md は起動時 1 回読み。`/clear`、`/compact`、再起動で反映。
- **@import で痩せたつもりが痩せていない**: import 先も起動時ロード。常時コンテキストを減らすのは path-scoped `.claude/rules/`。4 MiB 超はスキップ。
- **CLAUDE.local.md を足したら AGENTS.md が読まれなくなった**: cwd 以上に CLAUDE.* があると AGENTS.md は読まれない。`claude-md-and-agents-md` に切り替える。
- **agent teams を有効にすると名指しした subagent が teammate になる**: 会話を継承せず、in-process teammate は `/resume` や `/rewind` で戻せない。不要なら `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "0"` をユーザー設定に (project/local/managed が上書き可能)。
- **新モデルで Task tools が消える**: Opus 4.8 / Sonnet 5 / Fable 5 / Mythos 5 以降は `CLAUDE_CODE_ENABLE_TODO_TOOLS=1` が必要。
- **セッション途中のモデル/effort/fast mode 切替でキャッシュ全損**: 冒頭で決める。fast mode は長いセッションの途中で入れると全量を fast-mode 料金で再読込。
- **subagent / workflow / fork / teammate は 5 分 TTL**: サブスクリプションでも同じ。長い fan-out には `subagentPromptCacheTtl: "1h"` (書き込み料金が上がる)。
- **会話中の禁止事項は圧縮で消える**: deny rule で固定する。
- **auto mode は 3 連続 / 累計 20 ブロックで停止**: 設定不可。`-p` で `--permission-prompt-tool` がなければアクションは飛ばされ run は続く。
- **gateway が `safeguards` / `safeguard_results` を落とす**: 課金ありローカル classifier へのフォールバック (通知付き) か、判定なしの拒否。10 回連続判定なしでターン終了。`/status` の Auto mode server 行で確認。
- **mod は ask rule と自前 PreToolUse hook を上書きできる**: インストール前に `claude plugin validate` で `hooks:` / `calls:` を確認。`disableAllHooks` / `--bare` / `--safe-mode` は組み込み mod を止めず、`disableAllHooks` は settings hooks と status line も殺す。
- **`claude -p '/code-review ultra'` は findings を返さない**: スクリプトでは `claude ultrareview`。途中停止でも無料枠消費。ブランチレビューは未コミットの tracked 変更もアップロード。
- **channels は `--channels` に名指ししないと登録されない**: `.mcp.json` にあるだけでは不十分。allowlist の送信者は permission relay を承認できるので慎重に。
- **/goal の評価器はコマンドを実行しない**: transcript で証明できる条件を書く。認証、クレジット、圧縮不能、モデル不可で goal は消える。
- **`ultracode` は `-p` / scheduled task / webhook で無反応**: 人間入力のみ。script 内で `import()`、`Date.now()`、`Math.random()`、`new Date()` は不可。
- **workflow の上限**: 既定 16 並列 (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS`)、4,096 要素、1,000 agent。トップレベルで await した `agent()` が 6 回 stall すると run がエラー終了。
- **worktree isolation の隙間**: `cp` とシェルリダイレクトはブロックされない。
- **fullscreen では Cmd+F や tmux 検索が会話を見ない**: Ctrl+O の `/` か `[`。iTerm2 `tmux -CC` 非互換。2 回クラッシュで classic に無言で戻る。
- **feature-flag fetching 依存機能**: `/skill-doctor`、advisor、VS Code での mod 描画、fullscreen 既定、idle compaction、`SendFeedback`、claude.ai skill 同期、Remote Control の一部、マシン外メッセージングなどは Bedrock/Vertex/Foundry、Claude apps gateway、`DISABLE_TELEMETRY` / `DISABLE_GROWTHBOOK` / `DO_NOT_TRACK` / `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` で消える。同一マシン内メッセージングは残る。
- **MCP allow rule が 2.1.299 で無言で壊れる**: `mcp__a` は `a__b` に一致しなくなった。`mcp__<server>__*` と書く。
- **`TaskOutput` は 2.1.277 で削除**: `taskOutputMaxChars` と `TASK_MAX_OUTPUT_LENGTH` は無効。Claude は background task の出力ファイルを Read で読む。
- **Ultraplan は Week 32 で削除**: plan mode か Claude Code on the web を使う。
- **project settings の `env` で設定できない変数**: `CLAUDE_CONFIG_DIR`、`CLAUDE_CODE_TMPDIR`、TMPDIR/TMP/TEMP、telemetry/OTel export 変数、`CLAUDE_CODE_DISABLE_ATTACHMENTS`、Claude in Chrome / Remote Control の自動接続。シェル、ユーザー、managed から与える。
- **`/effort` と `/autocompact` はモデルごとに保存**: 新モデルは既定値から始まる。
- **サードパーティの数値**: CLAUDE.md の「約 80% 遵守」のような数字は公式に根拠がない (未検証)。Stop hook の 8 回上限は公式。

### 中級者が次にやること

1. **検証の梯子を 1 段上げる**: 今プロンプトで書いているチェックを `/goal` 条件に移し、毎回必須のものは Stop hook (`onFailure: "block"`、`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` を把握) へ。レビューは `/code-review` または PLAN.md 対照の subagent プロンプトを定型化する。
2. **CLAUDE.md を 200 行以下に刈る**: `/doctor prompt-audit` を実行し、「消したら間違えるか」で各行を判定。毎回起きるべき行は hook に、言語/ディレクトリ固有の行は `.claude/rules/*.md` の `paths` に、手順書は `disable-model-invocation: true` の skill に移す。`/context` と `/skill-doctor` で常駐コストを再確認。
3. **permission mode をユーザー設定で固定する**: `~/.claude/settings.json` に `permissions.defaultMode: "auto"`、無人ループには `--permission-mode dontAsk` または `--permission-prompts none`、評価ハーネスには `--restricted`。禁止事項は deny rule に。
4. **キャッシュ設計をセッション冒頭に寄せる**: モデルと effort を最初に決め、`/compact` はタスク境界だけ。API キー運用なら `promptCacheTtl: "1h"`、長い fan-out なら `subagentPromptCacheTtl: "1h"`。`/cost` の Prompt cache 行でヒット率を見る。
5. **反復タスクを `claude -p` ループか workflow にする**: 2 から 3 件で試し、`--allowedTools` を最小に。繰り返し使う workflow は `.claude/workflows/<name>.js` に保存して `/<name>` 化。
6. **並列化はまず worktree + agent view**: `claude --bg` と `claude agents` で複数 session を回し、Writer/Reviewer を 2 セッションで運用。agent teams は必要になるまで既定オフのまま。
7. **設定の棚卸しを 3 から 6 か月ごとに**: 公式ブログの推奨どおり、`/doctor prompt-audit` と `/usage` の警告をトリガーに、旧モデル向け指示を削る。

### 出典

- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/common-workflows
- https://code.claude.com/docs/en/prompt-library
- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/auto-mode-classifier-billing
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/goal
- https://code.claude.com/docs/en/advisor
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/cross-session-messaging
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/ultrareview
- https://code.claude.com/docs/en/code-review
- https://code.claude.com/docs/en/code-review-local
- https://code.claude.com/docs/en/channels
- https://code.claude.com/docs/en/fullscreen
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/plugins/mods/overview
- https://code.claude.com/docs/en/changelog
- https://code.claude.com/docs/en/whats-new
- https://code.claude.com/docs/en/whats-new/2026-w37
- https://code.claude.com/docs/en/whats-new/2026-w36
- https://code.claude.com/docs/en/whats-new/2026-w35
- https://code.claude.com/docs/en/whats-new/2026-w34
- https://code.claude.com/docs/en/whats-new/2026-w33
- https://code.claude.com/docs/en/whats-new/2026-w32
- https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start
