## 第2章 スキルとスラッシュコマンド

### この章で分かること

スキル (`SKILL.md`) とスラッシュコマンドは、2026年10月時点の Claude Code では同じ仕組みの上にある。この章では、スキルがどこから読み込まれ、名前が衝突したときにどれが勝ち、frontmatter の各フィールドが「いつ・誰が・どの権限で」実行するかをどう制御するのかを、公式ドキュメントで検証済みの事実だけで整理する。特に、`!` による動的コンテキスト注入が失敗したときの挙動、`context: fork` が会話のフォークではないこと、`allowed-tools` がワークスペース信頼に縛られないこと、コンパクション後に何が残るかといった、日常利用で踏みやすい仕様を優先する。最後に、`claude plugin eval` と skill-creator による評価駆動の改善ループと、設定ファイルとしてそのまま再利用できるレシピを示す。

### 2.1 カスタムコマンドはスキルに統合された

`.claude/commands/deploy.md` と `.claude/skills/deploy/SKILL.md` はどちらも `/deploy` を作り、同じように動く。既存の `.claude/commands/` はそのまま動作し、frontmatter も `name` と `paths` を除いて同じものを受け付ける。違いは、スキルがディレクトリを持つこと (補助ファイルやスクリプトを同梱できる)、呼び出し制御の frontmatter を持つこと、そして Claude が説明文を見て自動で呼び出せることにある。同じ名前のスキルとコマンドファイルがあればスキルが勝つ。

コマンド名の導出規則は次の通り。

| ファイル | 名前 |
|---|---|
| `.claude/skills/<dir>/SKILL.md` | ディレクトリ名、または frontmatter `name` |
| `.claude/commands/frontend/component.md` | サブディレクトリの `/` を `:` に置換して `/frontend:component` |
| プラグインの `skills/review/SKILL.md` に `name: fancy` | `/my-plugin:fancy` (空いていれば素の `/fancy` も有効) |
| プラグインルート直下の `SKILL.md` | `name` かプラグインのディレクトリ名 |

2.1.216 から 2.1.245 までは `name` がプラグイン接頭辞を既に含む場合に接頭辞が二重になる不具合があり、2.1.246 で修正された。非対話 (`-p`/SDK) セッションでは `help` と `feedback` は予約されないため、その名前のプラグインスキルは素のコマンドを保つが、`login` など他の端末専用ビルトイン名は予約されたままになる。

### 2.2 読み込み場所と優先順位

| 種別 | パス | 有効範囲 |
|---|---|---|
| Enterprise | 管理設定ディレクトリ配下 | 組織全体 |
| Personal | `~/.claude/skills/<name>/SKILL.md` | このマシンの全プロジェクト。Cowork やクラウドセッションでは読み込まれない |
| Project | `.claude/skills/<name>/SKILL.md` | そのリポジトリ |
| Nested | `<subdir>/.claude/skills/<name>/SKILL.md` | `<subdir>` 以下で起動したセッション。上位で起動した場合は Claude がそこのファイルに触れた時点、または `/add-dir` (v2.1.257+) で読み込まれる |
| `--add-dir` | 追加ディレクトリの `.claude/skills` | そのセッション |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | 常に `/plugin:skill` で名前空間化 |
| claude.ai 同期 | `~/.claude/skills/synced/` | 2.10 節参照 |

`permissions.additionalDirectories` を settings.json に書いてもスキルは読み込まれない。あれはファイルアクセスの付与だけで、スキルを読むのは `--add-dir` / `/add-dir` (SDK の `additionalDirectories` / `add_dirs` も内部で `--add-dir` を渡す) だけである。v2.1.246+ では `/cd` が移動先の project スキルを追加する。

名前が衝突したときの規則は次の通り。

| 衝突の組み合わせ | 結果 |
|---|---|
| enterprise / personal / project のうち二つ | enterprise > personal > project。`deploy` が `~/.claude/skills/` と `.claude/skills/` の両方にあれば `/deploy` は personal を実行 |
| 上記いずれかとバンドルスキル/ビルトインコマンド | ローカル端末セッションでは自作が置き換えるが、エイリアスは置き換えない。project の `code-review` は `/code-review` を置き換えるが `/review` はバンドル版を実行する |
| スキルと `.claude/commands` ファイル | スキルが勝つ |
| ルートとネストで同名 | 両方残る。`/deploy` はルート、`/apps/web:deploy` はネスト側。Claude にはディレクトリ修飾付きの一覧と「編集中のファイルを持つディレクトリのものを使え」という指示が渡る |
| プラグインスキルと他 | `/plugin:name` で共存 |
| 同期スキルとローカルコマンド | 同期スキルが短い名前を失う |

worktree では、`--worktree` セッションの親ディレクトリ探索は worktree ルートで止まる。v2.1.277+ では worktree に `.claude/skills` がない場合、メインチェックアウトの project スキルにフォールバックする。

ライブ変更検知は `~/.claude/skills`、project の `.claude/skills`、`--add-dir` の `.claude/skills` で有効 (bare モードを除く)。ただしセッション開始時に存在しなかった最上位スキルディレクトリは監視されないので、作成後は変更のたびに `/reload-skills` が要る。`--add-dir` の `.claude/commands` と `.claude/agents` は監視対象外で、変更には再起動が必要。プラグインの hooks / `.mcp.json` / agents / output-styles は `/reload-plugins` で反映する。

### 2.3 frontmatter リファレンス

frontmatter は `---` がファイルの1行目にあるときだけ解析される。フィールド名はハイフン区切り小文字 (例外は `when_to_use`) で、未知のフィールドはエラーなしに無視される。`user-invokable` や `allowed_tools` のような綴りミスは黙って捨てられるので、`claude plugin validate .claude/skills` (v2.1.233+) で検証する習慣をつける。真偽値は v2.1.218+ で `yes/no/on/off/1/0` も受け付ける。YAML が壊れていると本文だけが空メタデータで読み込まれ、`/name` は動くが説明文による自動呼び出しが止まる (`--debug` で解析エラーを確認)。

```yaml
---
name: my-skill
description: What this skill does
disable-model-invocation: true
allowed-tools: Read Grep
---

Your skill instructions here...
```

これは `.claude/skills/my-skill/SKILL.md` に置く最小構成で、全フィールドは任意、`description` のみ推奨。

全20フィールド: `name`, `description`, `when_to_use`, `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`, `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context`, `agent`, `background`, `hooks`, `paths`, `shell`, `metadata`, `license`, `compatibility`。

#### 説明文と一覧の予算

`description` と `when_to_use` は結合され、スキル一覧では 1,536 文字で切り詰められる (`skillListingMaxDescChars` で変更可)。主要なユースケースを先頭に書く。`description` を省略すると本文の最初の空でない行が使われる。`metadata` は YAML マップでなければ捨てられ、`paths` などのフィールド名をキーに再利用してはいけない。`compatibility` は500文字までの文字列で、`license` と共に Claude Code は受理するが動作には使わない。

#### 呼び出し制御

| 設定 | ユーザー | Claude | コンテキスト |
|---|---|---|---|
| (既定) | 可 | 可 | 説明文は常駐、本文は呼び出し時 |
| `disable-model-invocation: true` | 可 | 単独では不可 | 説明文も非常駐 |
| `user-invocable: false` | 不可 (`/` メニュー非表示) | 可 | 説明文は常駐 |

`disable-model-invocation: true` は subagent の `skills:` によるプリロードと、スケジュールタスクのプロンプトとしての実行も塞ぐ。Claude が無効化されたスキルを呼ぼうとすると Claude Code はブロックし、手順を別の方法で再現しないよう指示する。メッセージ途中に `go ahead and /deploy to staging` のように書いた `/skill` は実行されず、そのターンで Claude が実行してよいという許可として扱われる。スキルについて書きたいだけならスラッシュを外す。

#### 権限とモデルの一時上書き

- `allowed-tools`: 呼び出したターンだけの許可付与。次のメッセージで消える。他のツールを制限はしない。ワークスペース信頼に縛られず、信頼していないフォルダでの `-p` 実行でも project スキルの `allowed-tools` が適用される。組織側は `allowManagedPermissionRulesOnly` (v2.1.282+) で無効化でき、無視されたスキルは `/status` に出る。
- `disallowed-tools`: スキルが有効な間だけツールをプールから外す (次のメッセージで解除)。他のツールが残る限り `EndConversation` は外せない。バックグラウンドループで `AskUserQuestion` を外す用途。導入バージョン (未検証)。
- `model` / `effort`: 現在のターンの残りだけ有効で、次のプロンプトでセッション設定に戻る。`context: fork` では subagent のモデルを決める。`availableModels` で除外されたモデルや auto モードで未対応のモデルは無視される。`effort` は `low/medium/high/xhigh/max`、`model` は `inherit` も可。
- `paths`: カンマ区切り文字列か YAML リストのグロブ。一致するファイルを扱うときだけ自動発動する。パス限定メモリルールと同じ書式。`.claude/commands` では使えない。

```yaml
---
name: commit
description: Stage and commit the current changes
disable-model-invocation: true
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)
---
```

`.claude/skills/commit/SKILL.md`。手動専用のコミットスキルで、git 系コマンドの許可はこのターン限りで消える。`allowed-tools` は空白区切り、カンマ区切り、YAML リストのいずれでもよい。

### 2.4 引数と変数置換

| プレースホルダ | 意味 |
|---|---|
| `$ARGUMENTS` | 引数文字列全体 |
| `$ARGUMENTS[N]` / `$N` | 0始まりの位置引数。シェル風の引用規則で、`/my-skill "hello world" second` なら `$0` は `hello world`、`$1` は `second` |
| `$name` | frontmatter `arguments:` で宣言した名前付き引数 |

未充足の `$N` はリテラルのまま残り、未充足の `$name` は空文字になる。どのプレースホルダも入力を受け取らなかった場合、`ARGUMENTS: <値>` がスキル末尾に追記される。引数値に含まれる `$1` や `$ARGUMENTS` は再展開されない。数字・`ARGUMENTS`・引数名の前のリテラル `$` はバックスラッシュ一つでエスケープする (`\$1.00`)。

```yaml
---
name: migrate-component
description: Migrate a component from one language to another
---

Migrate the $0 component from $1 to $2.
Preserve all existing behavior and tests.
```

`/migrate-component SearchBar JavaScript TypeScript` で `$0..$2` が埋まる。

環境変数風の置換は `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}`, `${CLAUDE_PROJECT_DIR}` と、プラグインスキル限定の `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`。引数挿入の後に置換され、バックスラッシュでエスケープできない。`${CLAUDE_SKILL_DIR}` と `${CLAUDE_PROJECT_DIR}` は本文と `allowed-tools` の Bash ルールの両方で置換されるので、同梱スクリプトを権限プロンプトなしで走らせられる。

```yaml
---
name: render-chart
description: Render a chart from a CSV file
allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)
---

Run `${CLAUDE_SKILL_DIR}/scripts/render.sh <csv-file>` to render the chart.
```

`.claude/skills/render-chart/SKILL.md`。本文が指示するコマンドと許可ルールが同じ変数で一致する。

```yaml
---
name: session-logger
description: Log activity for this session
---

Log the following to logs/${CLAUDE_SESSION_ID}.log:

$ARGUMENTS
```

セッションごとのログファイルに引数を書く例。

### 2.5 動的コンテキスト注入 (`!` コマンド)

`` !`cmd` `` は Claude が本文を見る前に実行され、出力に置き換わる。複数行は ```` ```! ```` で開くフェンスを使う。インライン形は `!` が行頭か空白直後にあるときだけ認識され、`` KEY=!`cmd` `` のように他の文字に続く場合はリテラルのまま残る。出力はプレースホルダの再走査を受けない。コマンドはセッションシェルのカレントディレクトリ (`cd` で移動する) で走り、bash では stderr が stdout に合流し、大きな出力はファイルパスとプレビューとして渡される。

```yaml
---
description: Summarizes uncommitted changes and flags anything risky. Use when the user asks what changed, wants a commit message, or asks to review their diff.
---

## Current changes

!`git diff HEAD`

## Instructions

Summarize the changes above in two or three bullet points, then list any risks you notice such as missing error handling, hardcoded values, or tests that need updating. If the diff is empty, say there are no uncommitted changes.
```

`~/.claude/skills/summarize-changes/SKILL.md`。公式スターターの最小例。

````markdown
## Environment
```!
node --version
git status --short
```
````

複数行フェンス形式。

#### 失敗・タイムアウト・権限の挙動

- 一つでもコマンドが失敗すると呼び出し全体が中断され、Claude はその回のスキル本文を一切見ない。エラーは `Shell command failed for pattern "..."` と `[stderr]` で表示される。
- 非ゼロ終了は失敗。ただし grep や `git diff` など検索・比較系コマンドの終了コード 1 は正常扱い。終了コード 2 以上はそれらでも失敗。許容したいチェックには `|| true` を付ける。
- どれか一つの `!` コマンドに生の制御文字が含まれると全ての `!` コマンドが無効化される (`No shell command in <name> was run`、v2.1.290+)。
- 各コマンドは Bash ツールの既定 2 分タイムアウトで走る。Bash ツールがバックグラウンドへ移す種類のコマンドなら、タイムアウトしてもスキルは中断されず、注入テキストに移動した旨とタスク名・出力ファイルが記される。Bash ツールが自動バックグラウンドしないコマンドだけがタイムアウトで kill され、呼び出しを中断する。
- 注入コマンドは権限プロンプトを出さない。auto モード以外では、権限判定が allow 以外 (通常なら ask になるルールを含む) なら同じエラーで中断する。`allowed-tools` で事前許可する。deny と ask ルールは `allowed-tools` より優先される。
- auto モードでは未判定のコマンドが「先に実行せよ」という Claude への指示に変わる (2.1.271 で既定モードの権限ルール準拠に変更)。ただし `agent` を設定したフォークスキル内と、注入コマンドを走らせるシェルツールを Claude が持たないセッションでは、auto モードでも中断する。

`"disableSkillShellExecution": true` を設定すると、user / project / plugin / add-dir スキルの各 `!` コマンドは `[shell command execution disabled by policy]` に置換される。バンドルと managed スキルは対象外。管理設定での利用を想定した機能で、リポジトリにコミットされたスキルの `!` コマンドはモデルの確認なしに走るため、クローンしたリポジトリの `.claude/skills` を監査する根拠になる。

#### `shell` フィールド

既定は Bash が使えれば Bash、なければ PowerShell。`shell: bash` は Git Bash のない Windows で ``Skill <name> requires bash (`shell: bash` in frontmatter) but Git Bash was not found`` を出して実行前に失敗する。`shell: powershell` は PowerShell ツールが有効なときだけ経路を切り替える。PowerShell ツールは Git Bash のない Windows では既定で有効、Git Bash ありの claude.ai / Console アカウントでも既定で有効、Bedrock / Google Cloud Agent Platform / Microsoft Foundry / macOS / Linux / WSL では `CLAUDE_CODE_USE_POWERSHELL_TOOL=1` が必要 (`0` で無効)。PowerShell 側の終了コード 1 許容リストには grep と `git diff` が含まれるが `find` と `diff` は含まれない。

### 2.6 `context: fork` と subagent との連携

`context: fork` は、`agent` で指定した種別 (既定 `general-purpose`、`Explore`、`Plan`、または `.claude/agents/` のカスタム) の新しい subagent を起こし、レンダリング済み SKILL.md をプロンプトとして渡す。会話履歴は渡らない。名前に反して会話のフォークではないので、これまでの議論に依存する作業には会話フォーク側を使う。`Explore` / `Plan` は CLAUDE.md や git status なしで始まる。

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

`gh` の注入が先に走り、その結果を含む本文が Explore subagent のプロンプトになる。

```yaml
---
name: deep-research
description: Research a topic thoroughly
context: fork
agent: Explore
---

Research $ARGUMENTS thoroughly:

1. Find relevant files using Glob and Grep
2. Read and analyze the code
3. Summarize findings with specific file references
```

v2.1.218+ ではフォークスキルは既定でバックグラウンド実行。`background: false` で待機する。バックグラウンドのフォークは狭いバックグラウンド用ツールセットを使い、チェックポイントの外で動くため `/rewind` で編集を戻せない。次の条件では常にブロッキング実行になる: `-p` / SDK、`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`、同じスキルが既に実行中、スケジュールタスクからの発火。動的ワークフロー内のエージェントがフォークスキルを呼んだ場合、v2.1.295+ ではそのエージェントが結果を待って受け取る (それ以前はメイン会話に届いていた)。

逆方向の合成が subagent の `skills:` フィールドで、起動時にスキル本文全体 (説明文だけではない) を注入する。先頭 32 個の相異なる名前まで。

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

`.claude/agents/api-developer.md`。`tools` に `Skill` を書いてもプリロードはされない。存在しない、またはポリシーで無効のスキルはデバッグログに警告を残してスキップされる。`disable-model-invocation: true` のスキル (バンドルの `/verify` を含む) はプリロードできない。ビルトインの Explore / Plan / general-purpose はスキルをプリロードしない。subagent にスキルを呼ばせたくなければ `tools` から `Skill` を外すか `disallowedTools` に入れる。

### 2.7 スキル frontmatter の hooks

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

書式は settings の hooks と同じ。スキルの呼び出し時に登録され、そのセッションの残り全ターンで動き続ける。初回成功後に外したければ hook に `once: true` を付ける。`once` はスキル frontmatter でのみ有効で、settings やエージェント frontmatter では無視される。失敗、終了コード 2 でのブロック、タイムアウトした実行では hook は残り、成功した実行だけが外す。subagent frontmatter の hooks は subagent 終了時に外れ、そこでの `Stop` は `SubagentStop` に変換される。project スキルの hooks は settings ファイルの信頼規則に従い、信頼していないフォルダの `-p` 実行でも登録される。2.1.299 以降、`UserPromptSubmit` hooks はスキル展開の前に走り (ブロックすれば `!` コマンドも止まる)、スキル自身の `UserPromptSubmit` hook は呼び出した次のプロンプトから効く。

### 2.8 コンテキストの寿命と予算

レンダリング済み本文は一度会話に入ると残り続け、ファイルは後続ターンで再読込されない。同一内容で再呼び出しすると「既に読み込み済み」の短い注記だけが追加され、引数や `!` 出力が変われば全文が再追記される。したがって本文は「編集のたびに」のような恒常的指示として書き、一度きりの手順として書かない。

自動コンパクション後は、各スキルの最新の呼び出しが先頭 5,000 トークンまで保持され、合計 25,000 トークンの予算を新しい順に埋める。古いスキルは丸ごと落ちることがある。重要な規則は SKILL.md の冒頭に置き、必ず守らせたい規則は hooks に移すか、コンパクション後に再呼び出しする。`/reload-skills` はスキル一覧全体を再送する (2.1.299)。

スキル一覧 (名前と説明文) の予算はモデルのコンテキストウィンドウの 1% で、溢れると呼び出し回数の少ないスキルから説明文が落ちる (名前は残る)。`skillListingBudgetFraction` (例 `0.02`) か `SLASH_COMMAND_TOOL_CHAR_BUDGET` で広げられる。`/context` の Skills 行は予算適用後のサイズ (v2.1.196+)、`/doctor` は一覧コストを推定し、`--debug` は溢れ警告を出す。

```json
{
  "skillOverrides": {
    "legacy-context": "name-only",
    "deploy": "off"
  }
}
```

settings.json。値は `"on"` (既定) / `"name-only"` / `"user-invocable-only"` / `"off"`。`off` は Remote Control や SDK のコマンド一覧からも隠す。プラグインスキルには効かず、そちらは `/plugin` で管理する。`/skills` メニューはこの設定を書き出す (フィルタは名前・説明・ソース、`t` でトークン数ソート、Space/Enter で可視性を循環、Esc で `.claude/settings.local.json` に保存)。メニューでは `user-invocable-only` が `user-only` と表示される。プラグインスキル、`disable-model-invocation: true` のスキル、managed / `--settings` で上書きされたスキルは循環できない。エイリアス名のエントリは managed 設定か `--settings` でのみ有効 (v2.1.260+) で制限方向にしか働かず、同じスキルに本名のエントリもあれば本名が優先される。user / project / local 設定ではスキル名のみ照合され、`review` のエントリは `/code-review` に届かない。

`/skill-doctor` (ドキュメント上は v2.1.252+、changelog では 2.1.261 に記載、フィーチャーフラグ取得が必要) は各スキルのコンテキストコストと呼び出し回数を出し、一度も呼ばれていないスキルと最近使っていないプラグインを挙げる。対話セッションでは `/plugin` マネージャの Stats タブ、`-p` ではテキスト。バンドルと enterprise スキルは対象外で、Remote Control 経由では使えない。

### 2.9 権限ルール `Skill(...)`

```text
# Add to deny rules:
Skill

# Allow only specific skills
Skill(commit)
Skill(review-pr *)

# Deny specific skills
Skill(deploy *)
```

`/permissions` で設定する。`Skill` だけの deny は全スキルを無効化、`Skill(name)` は完全一致、`Skill(name *)` は任意引数付きの前方一致。deny の照合範囲は広く、allow は狭い。

| deny ルール | 追加で塞ぐもの |
|---|---|
| `Skill(review)` | エイリアス経由でバンドルの `/code-review` |
| `Skill(deploy)` | ネストの `apps/web:deploy` (v2.1.260+) |
| `Skill(anthropic-skills:deploy)` | Claude Desktop がプラグインとして配信する同期スキル |
| `Skill(deploy:deploy)` (同期スキルのプラグイン形) | 同期スキル本体 |
| `Skill(skill:deploy)` | Claude が使うどの名前でも (エイリアス、表示名を含む) |

allow ルールはスキル本名と Claude の呼び出しに使われた名前だけに一致する。同期スキルは名前空間内で許可する: `Skill(anthropic-skills:pdf)` または `Skill(anthropic-skills *)`。`Skill(anthropic *)` は名前空間の外側からの前方一致なので届かない。v2.1.282 以降 `Skill(anthropic-skills:*)` の allow は同期スキルだけを対象にする。`/init` と `/security-review` は Skill ツール経由で呼べるが `/compact` は呼べない。

### 2.10 claude.ai 同期スキルと可搬性

claude.ai アカウントで有効なスキルは `~/.claude/skills/synced/` に降りてくる (端末では v2.1.273+)。更新確認はアクティブ時約 10 分、アイドル時約 40 分ごとで、ローカル編集はアップロードされず次の同期で上書きされる。`/<name>` または `/anthropic-skills:<name>` で呼べるが、短い名前はローカルのコマンドファイル、スキル、プラグインスキル、MCP プロンプト、さらにセッションで利用不可のビルトインやバンドルスキル (`disableBundledSkills` 後も含む) に奪われる。名前比較は大文字小文字、空白、不可視文字、全角を無視する。v2.1.269 から v2.1.280 までは一覧が全ての同期スキルをフルネームで表示していた (2.1.281 で変更)。

同期は API キー認証、Bedrock、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、bare モード、`--safe-mode`、`user` を含まない `--setting-sources` では行われない。`syncClaudeAiSkills: false` で無効化すると、既に同期済みのスキルは次回起動時に `~/.claude/skills/.trash/` に移る。`CLAUDE_CODE_SYNC_SKILLS=1` で `-p` 実行がダウンロードを待つ。

同期スキル本文の扱いはセッション種別で異なる。クラウドセッションではローカルと同じ完全挙動、Cowork デスクトップでは `!` 行が `disableSkillShellExecution` のプレースホルダに置換され、それ以外のローカル端末では `!` コマンド、`@` 参照、`${CLAUDE_PROJECT_DIR}` / `${CLAUDE_SESSION_ID}` がリテラル文字列として Claude に届く。frontmatter は制御文字除去と山括弧エスケープでサニタイズされ、`allowed-tools` は通常の権限フローを通る。

可搬性の制約として、claude.ai アップロード、Skills API、`package_skill.py` が許すのは `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` の 6 フィールドだけ。他のフィールドがあると次のようなハードエラーになる。

```text
Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: allowed-tools, compatibility, description, license, metadata, name
```

プラットフォーム仕様では `name` は 64 文字以内、小文字・数字・ハイフンのみ、XML タグ不可、予約語 `anthropic` / `claude` 不可。`description` は空でなく 1,024 文字以内、XML タグ不可、三人称で書く。Claude Code 自体はこれより緩いが、アップロードするものはこの規則に合わせる。

予約名と拒否される文字: プラグイン外で `synced` という名前のフォルダ、`anthropic-skills` および `anthropic-skills:` で始まる名前は読み込まれない (2.1.283 で `claude-ai` の予約は撤回)。ゼロ幅文字、制御文字、双方向制御文字、非標準の空白、私用領域や未割り当ての文字 (アイコンフォントのグリフ)、先頭末尾の空白、`<` `>` を含む名前は拒否され、起動時の通知とデバッグログの `[names]` で確認できる。プラグインの `skills/` フォルダ名にだけ含まれる場合はコマンド名でハイフンに置換され、frontmatter `name` にだけ含まれる場合はその `name` が無視されてフォルダ名で読み込まれる。`anthropic-skills` という名前の MCP サーバーは接続するがプロンプトがコマンドとして列挙されない。

### 2.11 バンドルスキルと `verify` / `simplify` の自動実行

バンドルスキルはプロンプトベースで、ビルトインコマンドの固定ロジックとは違い Claude がツールで作業を組み立てる。公式ページが名指しするのは `/doctor` (エイリアス `/checkup`)、`/code-review` (`/review`)、`/batch`、`/debug`、`/loop` (`/proactive`)、`/claude-api`、`/verify`、`/run`、`/run-skill-generator`、`/simplify`、`/workflow-authoring`。コマンド表の Skill マークから `/dataviz`、`/design`、`/slides`、`/fewer-permission-prompts`、`/update-config`、`/artifact-*` も同類と読めるが網羅的には確認していない (未検証)。`disableBundledSkills` で無効化できるが `/doctor` は `DISABLE_DOCTOR_COMMAND` か `skillOverrides` の `doctor: off` がない限り入力可能なまま残る。`/verify` は v2.1.215 以降ユーザー専用。

`/doctor` はインストール健全性、拡張 (未使用スキル / MCP / プラグインのコンテキストコスト、遅い hooks)、CLAUDE.md の重複 (常時読み込みの指示をスキルやネスト CLAUDE.md へ移す提案)、権限 (auto モードの既定化、頻繁に拒否される読み取り専用コマンドの事前許可) を扱う。シェルの `claude doctor` は読み取り専用版。`/doctor prompt-audit [path]` (v2.1.283+) は CLAUDE.md、スキル、エージェント、コマンドを古いプロンプト慣習について監査する。

`/claude-api` はサブコマンドで workflow を起動する: `migrate`、`upgrade` (2.1.236+、Python anthropic 0.x→1.x)、`managed-agents-onboard [<url>|<quickstart-name>]` (引数付きは 2.1.290+)、`prompt-audit` (2.1.221+)、`cost-optimize` (2.1.247+)、`build-eval` と `hillclimb` (2.1.259+)、`preserved-thinking-migration` (2.1.282+)。コードが `anthropic` や `@anthropic-ai/sdk` を import していると自動発動する。

v2.1.286+ で、セッション開始時に `verify` または `simplify` という名前の project / personal スキル (モデル呼び出し可で、プラグイン・同期・バンドル由来でないもの) があると、コミット指示が各コミット直前にそれを実行させる (ドキュメントやテストのみの変更を除く、`includeGitInstructions` が必要)。changelog の 2.1.286 項は `verify` のみに触れ、`simplify` はドキュメントページが出典。レシピなしでアプリをビルドして動かした `/verify` は `.claude/skills/verify/SKILL.md` をリポジトリルート (monorepo では触ったパッケージのディレクトリ) に書き、ルートに置かれたものはバンドルの `/verify` を置き換える。Claude は走らせ方を誤ったときだけこのファイルを編集するので、セッションごとの差分なしでコミットできる。`/run-skill-generator` は `.claude/skills/run-<name>/` を書く。

### 2.12 スラッシュコマンドの実行モデル

コマンドはメッセージの先頭でだけ認識され、続くテキストが引数になる。Claude が応答中に送ったコマンドはキューに入り、ターン終了後に実行される。`/status`、`/tasks`、`/usage` は割り込まずに即時実行。`/model`、`/effort`、`/fast` も即時に走るが、現在のターンに効くのは `/model` と `/effort` だけ (キャッシュ警告の確認後、そのターン内の次のリクエストから)。`/fast` はターン開始時の設定を保つので、速度変更は次のターンから (モデルも切り替える場合を除く)。フルスクリーン描画では `/theme` や `/help` などのダイアログ系がターン中でも即座に開く (v2.1.234+)。キュー済みのコマンドとシェルコマンドはターン終了まで保留され、キュー済みの通常メッセージだけが実行中のツール呼び出し完了後に Claude へ渡る。Ctrl+Enter / Ctrl+X Ctrl+S (`chat:sendNow`、v2.1.275+) はキュー済みメッセージを即送信し、入力1行目で Up を押すとキューから戻せる。

`/` メニューのハイライト (v2.1.236+) は、入力した文字が名前かエイリアスの先頭、または名前内の単語の先頭に一致したときだけ起きる (`:` `_` `-` は無視)。`/adddir` は `/add-dir` を、`/new` はエイリアス経由で `/clear` をハイライトする。タイプミスは何もハイライトせず Enter で `Unknown command` になる。利用不可のコマンドは `No commands match "/name"` で除外され、`/heapdump` のような隠しコマンドはフルネームを打ったときだけ出る。プロンプト途中の補完 (空白の後の `/` と文字) は名前が入力文字で始まるものだけを対象にし、フルスクリーン以外ではゴーストテキスト、フルスクリーンではリストで出る。素の `/` で Tab を押すと全コマンドが並ぶ。プラグインスキルは素の名前で一致してフル名 `/plugin:name` を挿入する。

スタッキング: 端末プロンプトで `/skill-a /skill-b do XYZ` と打つと、先頭のスキルに加えて最大 5 個 (合計 6 個) が展開され、末尾テキストが各スキルの `$ARGUMENTS` になる (2.1.199)。展開はインラインでユーザー呼び出し可能なスキル以外のトークンで止まり、フォーク実行の `/code-review` や引数がコマンドで始まりうる `/loop` で終わる。`-p` / SDK では最初のスキルしか読み込まれない。

シェルモード (`!` 接頭辞) は出力をコンテキストに追加し、Claude が自動で応答する (通常プロンプトと同じコスト)。応答なしで出力だけ入れるなら `respondToBashCommands: false`。コマンドは strict サンドボックスモードのセッションを除きサンドボックス外で走る。Ctrl+B でバックグラウンド化、Tab でプロジェクト内の過去 `!` コマンド補完、`/` でパス補完、`!` で始まるテキストの貼り付けで自動的にシェルモードに入る。2.1.286 以降 Ctrl+Enter はスキル自身のシェルコマンドを終了させず背景化する。

`/btw` はコンテキストだけから答える副質問で、ツールは使わず履歴にも残らない。作業中にも聞け、最新 20 件の副質問を再表示し、`f` でフルツール付きのバックグラウンド subagent にフォークできる。引数なしの `/btw` は直前の副質問を再び開く (v2.1.212+)。

MCP サーバーのプロンプトもスラッシュコマンドとして現れる。

### 2.13 評価駆動の改善: `claude plugin eval` と skill-creator

Anthropic の推奨は「文書を書く前に評価を作る」こと。スキルなしでのギャップを見つけ、3 つのシナリオを書き、ベースラインを取り、最小限の指示を書いて反復する。著者役の Claude A と、文脈を持たない試験役の Claude B を分ける。チェックリストには評価 3 件以上と Haiku / Sonnet / Opus での試験が含まれる。書き方の指針: SKILL.md は 500 行未満、参照ファイルは SKILL.md から一段だけ (深い参照は部分的にしか読まれない)、100 行超の参照ファイルには目次、スクリプトは「実行する」のか「読む」のかを明示、決定的な処理はスクリプトに、時間依存の記述は「古いパターン」節へ、MCP ツールは `ServerName:tool_name` で完全修飾、パス区切りはスラッシュ。

```yaml
description: Extract text and tables from PDF files, fill forms, merge documents. Use when working with PDF files or when the user mentions PDFs, forms, or document extraction.

# Avoid:
description: Helps with documents
```

```text
my-skill/
├── SKILL.md (required - overview and navigation)
├── reference.md (detailed API docs - loaded when needed)
├── examples.md (usage examples - loaded when needed)
└── scripts/
    └── helper.py (utility script - executed, not loaded)
```

評価ツールは二つあり、形式に互換性はない。会話内で一つのスキルを反復するなら skill-creator プラグイン (`evals/evals.json`、ケースごとに subagent、`benchmark.json`、ブラインド A/B、説明文チューニング)。プラグイン単位で CI に載せるなら `claude plugin eval` (v2.1.269+、git があれば 2.31 以上)。

```text
/plugin install skill-creator@claude-plugins-official
```

マーケットプレイスがなければ `/plugin marketplace add anthropics/claude-plugins-official`、`Plugin "<name>" not found in marketplace` なら `/plugin marketplace update claude-plugins-official`。リロード時に会話の再読込を警告されたら `/reload-plugins --force`。プラグインでないスキルのベースラインは `skillOverrides` で `off` にして取る。

#### `claude plugin eval` の仕組み

各ケースをプラグインあり 3 回、なし 3 回走らせ (1 ケース 6 回)、スコアは通過した grader の重み付き割合、`--threshold` (既定 1.0) 以上でケース合格。終了コードは 0 合格、1 閾値未満 (ケース読込失敗、ケースなし、起動失敗、API エラー終了 (v2.1.299+)、`--trust-plugin` なしの未信頼ディレクトリ、不正オプション、`--json` 書込不可も含む)、2 部分完了 (コスト上限 / 認証)、130 割り込み、143 強制終了 (CI タイムアウトなど)。Δ は終了コードを変えない。コストは「ケース数 × 実行回数」のエージェント実行がアームごとに発生し、llm / baseline grader 一つにつき実行ごと 3 回の judge 呼び出しが加わる。`--ablation none` で半減。

```markdown
# evals/first-case/prompt.md
---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---

Write me a commit message for this change: I renamed getUser to fetchUser and updated the three call sites.

# evals/first-case/graders/criteria.md
---
type: llm
---

PASS if <what a correct response contains>.
FAIL if <what a wrong or missing response looks like>.

# evals/first-case/graders/skill-fired.md
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?your-skill-name"'
---
```

`claude plugin eval init --bare first-case` で雛形を作れる。prompt.md の `@path` は展開されず本文がそのまま渡るので、ファイルを読ませるなら `allowed_tools` に Read を入れる。未知の frontmatter キーはエラー。自動検出がプラグインを見つけない (W/OUT 列がない、`ablation requested but no plugin resolved`) ときはケースディレクトリ相対で `plugins: ["../.."]` を足す。

grader は `regex` (JavaScript 構文、`i` フラグ、`match: not_contains` や `"count:N"`)、`tool_used` (`min` 既定 1、`max`)、`tool_order` (`before` / `after` は名前か `{ tool, input_match }`)、`file_exists` (実行中に作られたファイルのみ) が無料、`llm` と `baseline` (`baseline_file` の .jsonl と比較) は judge 3 票中 2 票で合格。カスタムコード grader はない。対象は `last_message` (既定)、`trace` (JSON 行なので引用符は `\"`、llm judge は先頭 12 と末尾 12 メッセージしか見ない)、`files`、`{ source: file, path }` (PNG / JPEG / GIF / WebP は画像として judge に渡り、.pptx や PDF は拒否されるので先にテキスト化する)、`mock_calls`。

2 アーム実行では `tool_used: Skill` grader、プラグインが宣言するサーバーの `mock_calls` grader、`arm: with-only` の grader はスコアから除外される (`scored: false`、表示は「発火した」指標として残る)。`arm: both` で強制的に採点でき、`min: 0 max: 0` と組めば「発火してはいけない」を検証できる。全 grader が除外対象なら通常採点になる。初回の典型的な発見は Δ≈0 で Skill grader が失敗しているケースで、説明文が自然な言い回しで発火していないことを意味する。`context.history_file` で記録を再開するケースは既定で with アームだけ (`single-arm (no Δ)`) になり、`--ablation with-without` で比較できる。

隔離: エージェントは一時 HOME の `claude -p` 子プロセスとして走り、ユーザー設定、CLAUDE.md、MCP、他プラグインは見えず、eval ディレクトリ自体も隠される (自分の grader を読めない)。Artifact ツールは無効、managed 設定は適用される。`allowed_tools` から付与されるのは読み取り専用ツール (Read, Glob, Grep, NotebookRead, Skill, AskUserQuestion, Agent, TodoWrite, TaskCreate / TaskGet / TaskList / TaskUpdate / TaskStop) のみで、Bash / Write / Edit / WebFetch / WebSearch は `--allow-tools` が要り、Bash は OS サンドボックス下で走る。サンドボックスバックエンドがない (ネイティブ Windows) 環境では実行が拒否される。環境変数は allowlist と `EVAL_*` だけが届く。既定は `max_turns` 10 (上限 200)、`timeout_seconds` 300 (上限 3600)、`runs` 3 (1〜50)。scaffold スクリプトは `--scaffold` 指定時のみサンドボックス外で本人として走り、PATH / HOME / TMPDIR / TERM=dumb と 120 秒制限、git hooks と credential helper は `GIT_CONFIG_COUNT` で切られる (git 2.31 以上を要求する理由、v2.1.283+)。git リポジトリ内のプラグインディレクトリを信頼するとリポジトリ全体を信頼することになる。

```yaml
schema_version: "1.1"
name: changelog-from-diff
tags: [smoke]
context:
  scaffold_script: fixture.sh
  add_dirs: [resources]
```

case.yaml には `schema_version: "1.1"` と `name` が必須。`description`, `tags`, `plugins`, `runs`, `expected_outcome` はトップレベル、`model`, `max_turns`, `timeout_seconds`, `allowed_tools`, `append_system_prompt`, `env` は `execution:` 配下。prompt.md と両方ある場合、prompt.md の frontmatter が同名フィールドを上書きし、本文がプロンプトになり、`graders/*.md` は case.yaml の grader の後に追加される。prompt.md がなければ `execution.prompt` がプロンプト。

```markdown
---
expect:
  title: string
  priority: [low, medium, high]
---

Created issue #4821: {{input.title}}
```

`evals/mocks/tracker/create_issue.md`。`expect:` 違反の呼び出しは実行を中断しスコア 0。`{{input.field}}` と `{{file:fixtures/..}}` が使える。`expect:` の `/regex/` 方言は意図的に小さく、リテラル、`.`、`\d` 等のエスケープ、文字クラス、単一トークン量指定子 `* + ? {m,n}`、任意の `^` `$`、フラグ `i` `s` のみ。グループ、選択、後方参照、先読みは読み込み失敗 (スコア 0) になるので、選択はリテラルのリストで表す。値は最大長までしか検査しないので `^` で固定する。`_server.md` は `tools:` に列挙した複数ツールを一つの `type: agent` モックで答え (`<tool>.md` が優先)、`_tools.json` は保存した tools/list 応答で実スキーマを持たせる。`error: true` (固定応答のみ) は本文をツールエラーとして返し、`abort_when` (agent のみ) は中断してよい条件を限定する。agent モックは `max_turns` の 4 倍の呼び出し予算、`.replay/` に記録。実サーバーは `--allow-real-servers` か `--mocks off` に加えて `--allow-tools "mcp__plugin_<plugin>_<server>__*"` の付与が必要。

```bash
claude plugin eval . \
  --trust-plugin \
  --json results.json \
  --threshold 0.8 \
  --model claude-sonnet-5 \
  --judge-model claude-haiku-4-5 \
  --no-publish \
  --max-cost-usd 20
```

CI 用。ターゲット (`.`) は `--tag` / `--allow-tools` / `--json` より前に置く。他に `-j, --concurrency <n>` (1〜8、アカウントのレート制限を共有)、`--judge-model` (既定はバックグラウンドタスク用モデル。小さい judge が書式を誤採点するなら `sonnet` 推奨)、`--output-dir`、`--publish-report`、`--keep-temp`、`--eval-dir quality/evals` (plugin.json の `"experimental": { "evals": "quality/evals" }` よりフラグ優先、相対パスのみ)。2.1.299 の `--disallow-tools` / `disallowed_tools` は changelog にあるがドキュメント未掲載 (未検証)。JSON の CI 判定に使うフィールド: `partial` / `partialReason` (`cost_ceiling` | `interrupted` | `auth_failed`)、`aggregates.overallScore`、`aggregates.casesPassed` / `casesTotal`、`aggregates.meanDelta`、`cases[].aggregates.score` / `delta`、`cases[].arms.with[].error` (API エラー以外は非 null でも 0 点とは限らない)、`cases[].arms.with[].aborted`、`cases[].arms.with[].skippedPaidGraders`、`costUsd`、`durationSeconds`、`claudeVersion`。レート制限などの API エラーで終わった実行は 0 点でスイートを失敗させるが `partial` にはしない (v2.1.299+)。

```bash
claude plugin eval . --case <case-name> --runs 1 --ablation none
```

一ケース単アームの高速反復。WITH / W/OUT / Δ の代わりに SCORE と PASS% が出る。`--ablation none` では何も除外されないので絶対スコアはモードで変わりうる。変更を信じる前に既定の 3 回で確認する。

### 落とし穴と対策

- `context: fork` は会話履歴を渡さない。履歴依存の作業は `/subtask` や会話フォーク型 subagent で行う。バックグラウンドフォーク (v2.1.218+ 既定) の編集は `/rewind` で戻らないので、フルツールが要る手順は `background: false`。
- `!` コマンドが一つ失敗すると本文全体が届かない。終了コード 1 を返しうるチェックには `|| true`。auto モード以外では「ask になるだけ」のコマンドも中断要因なので `allowed-tools` で事前許可する (deny / ask ルールが優先)。制御文字の混入で全 `!` が止まる。
- `allowed-tools` は未信頼フォルダと `-p` でも効く。クローン直後のリポジトリの `.claude/skills` は `allowed-tools` と `!` 行を読んでから起動する。組織では `allowManagedPermissionRulesOnly` と `disableSkillShellExecution` を managed 設定に置く。
- `allowed-tools` / `disallowed-tools` はターン限り。本文は残るが権限は消えるので再呼び出しが要る。
- 未知の frontmatter キーは無視、`---` が 1 行目でなければ frontmatter 全体が無視、YAML 破損は説明文だけ失う。`claude plugin validate .claude/skills` を CI に入れる。
- 自作スキルがバンドルを置き換えてもエイリアスは置き換わらない (`/review` はバンドル `/code-review` のまま)。`skillOverrides` のエイリアスエントリは managed 以外では届かない。
- `disable-model-invocation: true` は説明文を完全に外し、`skills:` プリロードとスケジュールタスク発火も塞ぐ。「ユーザー専用だが subagent には読ませたい」は成立しない。
- 一覧予算 1% を超えると呼び出し頻度の低いスキルから説明文が消え、そのスキルは自動発動しなくなる。`/context`、`/doctor`、`/skill-doctor` で確認し、`name-only` / `off` で整理する。
- コンパクション後に残るのは各スキル先頭 5,000 トークン、合計 25,000 トークン。必須規則は冒頭か hooks へ。
- personal スキルは Cowork / クラウドセッション / ルーチンで読み込まれない。共有したいものは `.claude/skills` にコミットするか claude.ai で有効化する。同期スキルはローカル端末では `!`、`@`、`${CLAUDE_PROJECT_DIR}` がリテラルになる。
- アップロード用スキルに Claude Code 専用フィールド (`argument-hint`、`context`、`hooks` など) を残すとハードエラー。可搬版と Claude Code 版を分けるなら `metadata` 以外に差分を持たせない設計にする。
- `synced` や `anthropic-skills:` 名前空間のフォルダ名、不可視文字や `<` `>` を含む名前は読み込まれない。
- ネストスキルは Claude がそのディレクトリのファイルに触れるまで `/` メニューに出ない。セッション中に作った最上位スキルディレクトリは毎回 `/reload-skills`。
- `skillOverrides` はプラグインスキルに効かない (仕様。GitHub issue の報告は本セッションで未確認のため出典は docs)。
- スタッキングは最大 6 個、`/code-review` や `/loop` で止まり、`-p` では先頭だけ。
- メッセージ途中の `/name` は実行ではなく許可。言及だけならスラッシュを外す。
- plugin eval の既定 `--threshold 1.0` は一つでも不完全なケースがあれば CI を落とす。現実的な閾値と `--max-cost-usd` を設定し、2 アームでは `tool_used: Skill` が採点外であることを前提に Δ を読む。regex は JS 構文、既定対象は `last_message`、`trace` は JSON エスケープ。
- Windows では `shell: bash` が Git Bash なしで即失敗し、`shell: powershell` は PowerShell ツール有効時しか効かない。CRLF の複数行 `!` ブロックは 2.1.290 で修正済み。

### 中級者が次にやること

1. **リポジトリの監査スクリプトを置く。** `claude plugin validate .claude/skills` を pre-commit か CI に入れ、frontmatter の綴りミスと YAML 破損を検出する。あわせて `` grep -rn '^allowed-tools\|^!`' .claude/skills `` で権限付与と注入コマンドの一覧を PR レビューの項目にする。
2. **`commit` と `verify` を分けて持つ。** 2.3 節の `commit` スキル (手動専用、git 系の許可だけ) と、`/verify` に記録させた `.claude/skills/verify/SKILL.md` をリポジトリにコミットする。v2.1.286+ なら各コミット前に `verify` が自動で走る。
3. **`${CLAUDE_SKILL_DIR}` パターンで同梱スクリプトを無プロンプト化する。** 決定的な処理はスクリプトに落とし、本文の指示と `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/<name> *)` を同じ変数で揃える。
4. **フォークスキルは「履歴不要」のものに限定する。** `pr-summary` のように `!` で必要な文脈を全部注入できる作業を `context: fork` + `agent: Explore` にし、編集を伴うものは `background: false` にする。
5. **一覧予算を測る。** `/context` の Skills 行と `/skill-doctor` を見て、呼ばれていないスキルを `skillOverrides` で `name-only` か `off` にし、必要なら `skillListingBudgetFraction: 0.02` を project settings に入れる。
6. **守らせたい規則は hooks に移す。** `once: true` 付きの `PreToolUse` を frontmatter に書き、コンパクションで本文が落ちても機構として残るようにする。
7. **評価を先に書く。** 新しいスキルは `claude plugin eval init --bare <case>` で 3 ケース作り、`--runs 1 --ablation none` で回してから既定 3 回の 2 アーム比較に進む。Δ≈0 で Skill grader が落ちていれば説明文の言い回しを直す。
8. **可搬版を分ける。** claude.ai にも上げるスキルは 6 フィールドだけで書き、Claude Code 専用機能 (`!`、`context: fork`、`hooks`) は別スキルにして `skills:` で subagent に束ねる。
9. **managed 設定に防御線を置く。** 組織運用なら `disableSkillShellExecution: true`、`allowManagedPermissionRulesOnly`、`Skill(...)` の deny ルールを managed settings に集約し、`/status` で無視された付与を確認する。

### 出典

- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/plugin-evals
- https://code.claude.com/docs/en/changelog
- https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices
