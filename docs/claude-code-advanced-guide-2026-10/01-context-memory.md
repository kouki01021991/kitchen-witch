## 第1章 CLAUDE.md・メモリ・コンテキスト管理・セッション

### この章で分かること

CLAUDE.md がどの順番で、どのタイミングで、コンテキストのどこに入るのか。そして「編集したのに効かない」「圧縮したら消えた」が起きる構造上の理由を、公式ドキュメントで検証済みの機構に沿って説明します。`.claude/rules/` のパススコープ、`@import`、`claudeMdExcludes`、AGENTS.md の読み込み条件、自動メモリの 200 行/25KB 制限といった、ファイルごとの正確なルールを設定スニペット付きで示します。後半では compaction の二段階動作と「何が生き残るか」、auto-compact 閾値の優先順位、idle compaction、プロンプトキャッシュの三層構造と TTL、セッションの resume/branch/fork、トランスクリプトの保持とパージ、checkpoint の限界を扱います。各節の設定は v2.1.302 (2026-10-16) 時点の公式ドキュメントと changelog に照合済みで、照合できなかった細部は「(未検証)」と明記しています。

### 1.1 CLAUDE.md のロード機構

#### 四つのスコープと固定されたロード順

CLAUDE.md には四つのスコープがあり、広い方から順に読み込まれます。後から読まれたファイルほどコンテキストの後方に置かれるため、プロジェクトの指示はユーザーの指示より後に現れます。

| スコープ | 場所 | 備考 |
|---|---|---|
| 管理ポリシー | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`、Linux/WSL `/etc/claude-code/CLAUDE.md`、Windows `C:\Program Files\ClaudeCode\CLAUDE.md` | `claudeMdExcludes` で除外不可 |
| ユーザー | `~/.claude/CLAUDE.md` | 全プロジェクト共通 |
| プロジェクト | `./CLAUDE.md` または `./.claude/CLAUDE.md` | リポジトリにコミット |
| ローカル | `./CLAUDE.local.md` | gitignore 推奨 |

重要なのは「上書き」ではなく「連結」だという点です。ファイル同士が矛盾した場合、どちらが勝つかは定義されておらず、公式には「Claude はどちらかを恣意的に選ぶことがある」と書かれています。優先順位を設計したいなら、矛盾する指示を複数ファイルに置かないことが唯一の対策です。

#### 祖先ディレクトリは起動時、子ディレクトリは遅延ロード

`claude` を起動したディレクトリから上に向かって、すべての祖先ディレクトリの CLAUDE.md が起動時に読まれます。`foo/bar/` で起動すると `foo/CLAUDE.md` の後に `foo/bar/CLAUDE.md` が入り、各ディレクトリ内では `CLAUDE.md` の後に `CLAUDE.local.md` が追記されます。

一方、起動ディレクトリより下のサブディレクトリにある CLAUDE.md は起動時には読まれません。Claude がそのサブディレクトリ内のファイルを Read、Write、Edit したとき、あるいは Bash で `cat` や `head` のように単一ファイルを閲覧するコマンドを実行したときに初めてロードされます。公式の表現は "Reading includes viewing the file with a Bash command that counts as a read, such as `cat` or `head` on a single file." です。changelog 上では v2.1.288 で Write/Edit がトリガーに加わり、v2.1.293 のエントリの末尾に「単一ファイルの `cat`、`head`、`tail`、`sed -n`、`grep` を Bash で実行したときにパススコープルールとネストした CLAUDE.md がロードされない問題を修正」とあります。

遅延ロードされたファイルは「メッセージ履歴」に入ります。これが後述する「圧縮で消える」問題の原因です。

#### CLAUDE.md は設定ではなくユーザーメッセージ

公式ドキュメントは明示的に "CLAUDE.md content is delivered as a user message after the system prompt, not as part of the system prompt itself." と述べています。つまり CLAUDE.md は強制力を持つ設定ではなく、Claude が「読んで従おうとする」コンテキストです。曖昧な指示や矛盾した指示、長すぎるファイルで遵守率が下がるのはこのためです。

ここから導かれる設計原則は二つです。

- 「絶対に守らせたい」ことは CLAUDE.md ではなく `permissions.deny` や PreToolUse hook で機械的に強制する。
- システムプロンプトのレベルに指示を置きたければ `--append-system-prompt` を使う (後述 1.14)。

#### サイズ制限と HTML コメント

- 推奨は 1 ファイル 200 行未満。短いほど遵守率が上がります。
- 1 ファイル 4 MiB までは全文ロード、それを超えるファイルはスキップされます。
- 1 ファイルが長すぎる場合、または複数ファイルの合計がある上限を超える場合、起動時と `/status` に警告が出ます。各 CLAUDE.md、rules ファイル、`@import` 先がそれぞれ別個に数えられます。合計上限の数値は公式に公開されていません。
- 200 行/25KB の切り捨ては自動メモリの MEMORY.md にのみ適用され、CLAUDE.md には適用されません。

ブロックレベルの HTML コメントは注入前に除去されます。コードブロック内のコメントは除去されません。

```markdown
<!-- maintainer notes: このセクションは 2026-10 のリファクタ後に見直す -->
```

人間向けのメンテナンス注記をトークンコストゼロで残せます。ただし Claude が Read ツールでファイルを開いた場合には見えます。

#### @import の規則

```markdown
See @README for project overview and @package.json for available npm commands for this project.

# Additional Instructions
- git workflow @docs/git-instructions.md
```

`./CLAUDE.md` に書くと、起動時に README、package.json、docs/git-instructions.md の内容が展開されます。規則は次のとおりです。

- 相対パスは作業ディレクトリではなく、import を書いたファイルからの相対で解決される。
- 再帰 import は最大 4 ホップ。
- 空白を含むパスはバックスラッシュでエスケープする。引用符で囲んだパスは import されない。
- コードスパンやコードフェンス内の `@path` は import されない。パスに言及だけしたいときはバッククォートで囲む。
- import はコンテキストを節約しない。起動時に全部展開され、サイズ警告でも別々に数えられる。

```markdown
- API conventions @Design\ Docs/api-conventions.md
```

空白を含むフォルダからの import。エスケープしないとパスは最初の空白で終わります。

```markdown
# Individual Preferences
- @~/.claude/my-project-instructions.md
```

worktree ごとに gitignore された CLAUDE.local.md が分かれてしまう問題を回避するための、ホームディレクトリからの import。プロジェクトレベルのファイルに置くと「外部 import」扱いになります。

#### 外部 import と承認ダイアログ

プロジェクトレベルのファイル内の import が作業ディレクトリ外に解決される場合、プロジェクトごとに一度だけ承認ダイアログが出ます。拒否すると恒久的に無効化され、ダイアログは二度と出ません。ユーザースコープ (`~/.claude/CLAUDE.md`、`~/.claude/rules/`) の import はダイアログなしでロードされます (Cowork デスクトップセッションを除く)。

`.claude/rules/` に作業ディレクトリ外を指すシンボリックリンクを置いた場合も同じ扱いで、承認後にロードされるのは `paths:` を持たないルールだけです。UNC パス (`\\server\share`)、`/net`、`/Network` などのネットワークパスは決して追跡されません (`\\wsl$` はネットワークパスに数えません)。Cowork デスクトップセッションでは、`~/.claude/CLAUDE.md` 自体がシンボリックリンクやハードリンクの場合、および `~/.claude/rules/` 配下で作業ディレクトリ外を指すリンクもスキップされます。

```bash
ln -s ~/shared-claude-rules .claude/rules/shared
ln -s ~/company-standards/security.md .claude/rules/security.md
```

共有ルールをプロジェクトにリンクする例。承認を避けたいなら `~/.claude/rules/` に置く方が簡単です。

### 1.2 .claude/rules/ とパススコープ

`.claude/rules/` 配下の `.md` は再帰的に探索されます。`paths` フロントマターを持たないルールは起動時に `.claude/CLAUDE.md` と同じ優先度でロードされ、`paths` を持つルールは Claude がマッチするファイルを Read/Write/Edit (または Bash 単一ファイル閲覧) したときにロードされます。

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

`.claude/rules/api.md` として置く例。`src/api/` 配下の `.ts` に触れたときだけ入ります。

```markdown
---
paths:
  - "src/**/*.{ts,tsx}"
  - "lib/**/*.ts"
  - "tests/**/*.test.ts"
---
```

複数パターンとブレース展開。

細かい仕様は次のとおりです。

- `paths` は Claude Code が読む唯一のフロントマターフィールド。他のフィールドはエラーなしで無視される。
- `paths` は YAML リストでもカンマ区切り文字列でも可。
- YAML がパースできない場合、フロントマターは無視されルールは無条件にロードされる。`claude --debug` でエラーが見える。
- フロントマターは注入前に除去される。
- ブレース展開は 1 ルールの `paths` 全体で 1,000 パターン / 4 MiB の予算を共有する。予算超過のパターンは展開されずに使われ、リテラルの `{}` は何にもマッチしない。ブレースを含まないパターンは予算に数えない。v2.1.217 以前は多数のブレースグループで起動が停止する問題があった。
- 有効なブラケット式でない `[` を含むパターンは何にもマッチしない。リテラルの `[` は `\[` とエスケープする。
- シンボリックリンク経由のチェックアウトパスでもマッチする。
- `--setting-sources` から `project` を除外するとプロジェクトルールはスキップされる (v2.1.211 で完全対応)。

`~/.claude/rules/` のユーザールールは全プロジェクトに適用され、プロジェクトルールより前にロードされます。どちらも他方を上書きしません。

パススコープルールは遅延ロードであり、メッセージ履歴に入ります。「圧縮後に消えて困る」ルールは `paths:` を外すか、ルート CLAUDE.md に移してください (1.9 参照)。

### 1.3 claudeMdExcludes、管理ポリシーの claudeMd、AGENTS.md

#### claudeMdExcludes

```json
{
  "claudeMdExcludes": [
    "**/monorepo/CLAUDE.md",
    "/home/user/monorepo/other-team/.claude/rules/**"
  ]
}
```

`.claude/settings.local.json` などに置き、特定の CLAUDE.md や rules をロードから外します。パターンは絶対パスに対してグロブでマッチするので、相対っぽく書くなら `**/` で始めます。user/project/local/managed のどの層にも書け、配列は層をまたいでマージされます。管理ポリシーの CLAUDE.md は除外できません。シンボリックリンクされたルールはリンクパスとターゲットパスのどちらにマッチしても除外されます (v2.1.239+)。除外リストは静的なので、タスクごとに読み込みを絞りたい場合は該当パッケージのディレクトリから起動する方が適切です。

#### 管理ポリシーの claudeMd キー

```json
{
  "claudeMd": "# Engineering rules\n\n- Always run make lint before committing.\n- Never push directly to main."
}
```

`managed-settings.json` に置くと、管理ポリシー CLAUDE.md ファイルと同じ優先度 (ユーザー、プロジェクトより前) でロードされます。管理/ポリシー設定でのみ有効で、user/project/local に書いても効果はありません。v2.1.260 でサーバー管理の `claudeMd` がセキュリティ承認ダイアログを出さなくなりました (hooks、シェルコマンド、sandbox、安全でない `env` 設定は引き続き承認が必要)。技術的な強制は `permissions.deny`、`sandbox.enabled`、`env` で、行動指針は managed CLAUDE.md で、という使い分けが公式の推奨です。

#### AGENTS.md

v2.1.277 以降、作業ディレクトリとその上位に `CLAUDE.md`、`.claude/CLAUDE.md`、`CLAUDE.local.md` のいずれも存在しない場合に限り、`AGENTS.md` と `.claude/AGENTS.md` が直接読まれます。起動時には `no CLAUDE.md found; AGENTS.md loaded: /home/you/repo/AGENTS.md` と表示されます。サブディレクトリの AGENTS.md は、Claude がそこにあるファイルを Read ツールで開き、かつそのサブディレクトリに三種の CLAUDE.md がないときだけロードされます。

最大の落とし穴は、`CLAUDE.local.md` もカウントされる点です。AGENTS.md に依存するリポジトリで、自分用の未コミット指示として CLAUDE.local.md を追加すると、AGENTS.md が黙って読まれなくなります。回避策は `/config` の Project instructions を `claude-md-and-agents-md` にするか、CLAUDE.md から import することです。

```json
{
  "pluginConfigs": {
    "cc-plugin-agents-md@builtin": {
      "options": { "instructionFiles": "claude-md-and-agents-md" }
    }
  }
}
```

`~/.claude/settings.json`、`--settings`、管理設定から読まれ、project/local では無視されます。値は `claude-md-or-agents-md` (既定)、`claude-md-and-agents-md`、`claude-md`、`managed-only`。v2.1.285 より前の ID は `agents-md@builtin` でした。`managed-only` でも、サブディレクトリの CLAUDE.md、`.claude/rules/`、パススコープルールはオンデマンドでロードされます。

```markdown
@AGENTS.md

## Claude Code

Use plan mode for changes under `src/billing/`.
```

他ツールと AGENTS.md を共有しつつ Claude Code 固有の指示を足す CLAUDE.md。CLAUDE.md が存在するために AGENTS.md の直接読み込みが抑制される場合、Project instructions が `claude-md` の場合、AGENTS.md をロードできないセッションの場合に必要です。二重に読まれることはありません。`ln -s AGENTS.md CLAUDE.md` も動作しますが、Edit/Write がシンボリックリンク越しの書き込みを拒否して AGENTS.md にリダイレクトする点、`core.symlinks` のない Windows クローンでは 1 行のテキストファイルになる点から、`@AGENTS.md` import の方が安全です。

CLAUDE.md との差異として、直接読まれた AGENTS.md では InstructionsLoaded hook が発火せず (import 経由なら `include` で発火)、`--add-dir` のディレクトリの AGENTS.md はロードされず、外部 import はすでに承認済みの場合のみプロンプトなしでロードされます。`AGENTS.local.md`、`AGENTS.override.md`、`.agents/` は読まれません。v2.1.281 で Bedrock、Vertex、Foundry、LLM ゲートウェイ、テレメトリ無効セッションにも対応しました。v2.1.280 より前は `/memory` と `/context` が直接読まれた AGENTS.md を一覧に出しませんでした。

### 1.4 --add-dir、additionalDirectories、モノレポでの起動位置

起動ディレクトリが三つのことを決めます。ファイルアクセス範囲、起動時にロードされる CLAUDE.md (ルートだけか、そのディレクトリと全祖先か)、そしてどの `.claude/settings.json` が適用されるかです。`.claude/settings.json` は CLAUDE.md と違って親ディレクトリから継承されません。worktree 内では worktree ルートの設定だけがロードされます。

| 手段 | ファイルアクセス | CLAUDE.md / rules | skills |
|---|---|---|---|
| `permissions.additionalDirectories` 設定 | 付与 | ロードしない | ロードしない |
| `--add-dir` / `/add-dir` | 付与 | 環境変数があるときのみ | ロードする |

```bash
CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1 claude --add-dir ../shared
```

追加ディレクトリの `CLAUDE.md`、`.claude/CLAUDE.md`、`.claude/rules/*.md`、`CLAUDE.local.md` をロードします (`--setting-sources` から `local` を除外すると CLAUDE.local.md はスキップ)。この環境変数は `additionalDirectories` 設定には効きません。

```json
{
  "permissions": {
    "additionalDirectories": [
      "../shared",
      "../web"
    ]
  }
}
```

`packages/api/.claude/settings.json` に置き、起動ディレクトリからの相対で兄弟パッケージへのアクセスを付与します。

公式が推奨する二層構成は、ルート CLAUDE.md にリポジトリ全体のルール、パッケージごとの CLAUDE.md にスタック固有の規約です。`/context` の Memory files 欄で何がロードされたか確認できます。ディレクトリ別 CLAUDE.md とパススコープルールの違いは、置き場所 (コードの隣か中央か) とトリガー (起動時/ディレクトリ内アクセスか、グロブマッチか) です。

```json
{
  "worktree": {
    "sparsePaths": [
      ".claude",
      "packages/api",
      "packages/shared"
    ],
    "symlinkDirectories": [
      "node_modules"
    ]
  }
}
```

コミットする `.claude/settings.json`。`--worktree` や subagent の worktree をスパースチェックアウトにします。ディレクトリのみ指定でき、ルート直下のファイル (package.json、lock ファイルなど) は常に含まれますが、ルート直下のディレクトリは含まれないので `.claude` を明示します。起動ディレクトリの設定が worktree 作成前に読まれ、リストはスコープ間でマージされます (local は追加できるが削除できない)。Git の `extensions.worktreeConfig` が必要で、Claude Code が追加した場合だけ Claude Code が削除します。

Read deny ルールで読む範囲を絞る方法も公式に示されています。

```json
{
  "permissions": {
    "deny": [
      "Read(./**/dist/**/*)",
      "Read(./**/build/**/*)",
      "Read(./**/*.generated.*)",
      "Read(./**/vendor/**/*)"
    ]
  }
}
```

末尾を `/**` ではなく `/**/*` にすると、ディレクトリ自体は一覧でき、中身だけ読めなくなります。組み込みファイルツールと、Bash の認識済みファイルコマンド (`cat`、`head`、`grep`、`find`、リダイレクト) をカバーしますが、サブプロセスは対象外で、`grep -r` や `find` をディレクトリに対して走らせると拒否対象のファイルも含まれます。相対 `Read(./...)` はセッションの cwd を起点にするため、サブディレクトリから起動する運用ではリポジトリルートの `.claude/settings.local.json` に `Read(//abs/path/**/vendor/**/*)` 形式の絶対パスで書きます (v2.1.211 以降、ルートの settings.local.json はどのセッションでもロードされます)。v2.1.273 では「v2.1.268 で導入した、パーミッションチェッカーが解析できない Bash 行 (eval、env -C) に Read/Edit deny ルールを適用する変更」が revert されています。

skills のスコープも起動位置で決まります。サブディレクトリから起動するとそのディレクトリ、全祖先、ユーザー、エンタープライズの skills がロードされ、ルートから起動するとルートの skills に加えて Claude が触れた全サブディレクトリの skills が蓄積され、数百に達することがあります。`--add-dir` の兄弟ディレクトリの skills もロードされます。数が多いと一部の skill は description を失い、自動起動のキーワードが消えます。共有 skill はルートの `.claude/skills/` か plugin (`plugin:skill` 名前空間) に置き、`paths` フロントマターでスコープを絞ることもできます。OTel の `skill_activated` イベントと `OTEL_LOG_TOOL_DETAILS=1` で未使用 skill を特定できます。v2.1.295 で subagent が `skills` フィールドから事前ロードする数が最大 32 になったとされています (未検証)。

### 1.5 /init、/import、/doctor prompt-audit、/memory

`/init` は CLAUDE.md の雛形を生成し、既存なら改善を提案し、Cursor (`.cursor/rules`、`.cursorrules`) と Copilot (`.github/copilot-instructions.md`) のルールを移行します。`CLAUDE_CODE_NEW_INIT=1` を設定すると多段階の対話フローになり、CLAUDE.md、skills、hooks のどれを用意するか尋ね、subagent でコードベースを探索し、質問で穴を埋め、レビュー可能な提案を提示してから書き込みます。このフローは AGENTS.md、`.devin/rules/`、`.windsurf/rules/`、`.clinerules` も読みます。

`/import` (v2.1.213+) は他エージェントの設定 (指示ファイルを CLAUDE.md に追記、MCP サーバー、コマンド、subagent、skills) を取り込みます。シェルからは `claude import codex --dry-run` のように実行できます。

`/doctor prompt-audit` (v2.1.283+、別名 `/checkup prompt-audit`) は CLAUDE.md、CLAUDE.local.md、AGENTS.md、rules、skills、commands、subagents、output styles を対象に、古いパスやコマンド、矛盾、旧モデル向けの書き方を検出し、適用せずに編集案を出します。`/doctor prompt-audit .claude/skills/deploy` のようにパスを渡せば単一対象に絞れます。同梱の `/claude-api` skill 経由で動くため、`skillOverrides` や `disableBundledSkills` でその skill を無効にしていると使えません。`/doctor` 単体でも、コミット済み CLAUDE.md から導出可能な内容のトリムを提案します。

`/memory` はユーザー/プロジェクトスコープの CLAUDE.md、CLAUDE.local.md、その他メモリファイルの場所を一覧し、まだ存在しないファイルのエントリも表示します。選択すると作成してから開きます。GUI エディタはセッションをブロックしなくなりました (v2.1.216+)。新しいネスト CLAUDE.md の動作確認は、シェルで作成してから Claude にそのサブディレクトリ内のファイルを読ませ、`Loaded` 行を探すのが確実です。

### 1.6 自動メモリ

自動メモリは Claude がセッションをまたいで覚えておく価値があると判断したことを保存する仕組みです。四種類のノートが `type` フロントマターとして記録されます: `user`、`feedback`、`project`、`reference`。コードベースから導出できる内容や、すでに CLAUDE.md にある内容は保存しません。

```text
~/.claude/projects/<project>/memory/
├── MEMORY.md           # Index, one line per memory, loaded into every session
├── user_role.md        # One memory
├── feedback_testing.md # One memory
└── ...                 # Any other topic files Claude creates
```

`<project>` は git リポジトリから導出されるので、同一リポジトリの全 worktree とサブディレクトリが一つのメモリディレクトリを共有します。マシンローカルです。

```markdown
---
name: Debugging patterns
description: Auth token rotation and database connection troubleshooting for this project
type: reference
---

## Auth Token Issues
- Refresh token rotation: old token invalidated immediately
- If 401 after refresh: check clock skew between client and server
```

トピックファイルの例。フロントマターがあるファイルには書き込み時に `modified` (ISO-8601) フィールドが付きます (v2.1.214+)。

制限と挙動:

- セッション開始時にロードされるのは MEMORY.md の先頭 200 行または 25KB のうち先に達した方まで。トピックファイルは必要時に通常のファイルツールで読まれます。
- 書き込みのたびにサイズを測り、上限に近いと短縮を促し、上限を超えると書き込みは成功するものの「インデックスを書き直せ」というエラーを Claude に返します。超過分は次回ロードで黙って落ちます。
- v2.1.284 で、MEMORY.md と呼び出されたノート内の不可視文字やマークアップに似せたタグが Claude に届く前に無害化されるようになりました。
- メモリファイルは `cleanupPeriodDays` の保持スイープから除外されます (ディレクトリは期間中ずっと空だった場合のみ削除)。v2.1.228 より前はスイープが配下のファイルを消すことがありました。

```json
{
  "autoMemoryEnabled": false
}

{
  "autoMemoryDirectory": "~/my-custom-memory-dir"
}
```

プロジェクト単位の無効化と、保存先の移動。`autoMemoryDirectory` は絶対パスか `~/` 始まりで、project/local 設定からはワークスペース信頼ルールの下で尊重されます。`permissions.blockReadsOutsideWorkingDirectories` が有効だと、リポジトリが指定したメモリディレクトリはロードも書き込みもされません (v2.1.273)。

トグルの優先順位: `/memory` のトグルはユーザー設定の `autoMemoryEnabled` に書き込みます。`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1` はどちらの方向でも設定に勝ちます。バックグラウンドセッションや、別の Claude Code セッションが起動したセッションからはオンにできず、トグルは `off · can't be turned on here; use a session started outside Claude Code` と表示されます (v2.1.285)。セルフホスト環境では既定でオフ、`--bare` と `--safe-mode` でも無効です。

### 1.7 subagent とメモリ、CLAUDE.md の関係

メインの自動メモリは subagent には渡りません。例外は fork で、親の会話とシステムプロンプトを継承します。subagent 自身のメモリは `memory` フロントマターで有効化し、`user` → `~/.claude/agent-memory/<name>/`、`project` → `.claude/agent-memory/<name>/`、`local` → `.claude/agent-memory-local/<name>/` に保存されます。その MEMORY.md の先頭 200 行/25KB が subagent のシステムプロンプトに入り、Read/Write/Edit が自動で許可されます。

```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices
memory: user
---
```

`.claude/agents/code-reviewer.md` の例。注意点として、自動メモリがオフ (`autoMemoryEnabled: false` または `CLAUDE_CODE_DISABLE_AUTO_MEMORY`) のとき `memory` フィールドは無効になり、subagent はメモリ指示もメモリツールアクセスもなしで起動します。

CLAUDE.md については、subagent は既定で完全な階層 (`~/.claude/CLAUDE.md`、rules、CLAUDE.local.md、管理ファイル、プロジェクト指示としてロードされた AGENTS.md) と git status スナップショットを受け取ります。組み込みの Explore と Plan は両方をスキップします。`omitClaudeMd` (v2.1.271+) をフロントマターや `--agents` JSON に書くと、カスタム subagent も user/project/local の CLAUDE.md なしで動きます (managed はロード)。ただし `--agent` や `agent` 設定でメインセッションのエージェントとして動かす場合は無視され、管理設定で定義された subagent に `omitClaudeMd` を付けると CLAUDE.md を一切ロードしません。Explore、Plan、`omitClaudeMd` 付き subagent でも、サブディレクトリの CLAUDE.md とマッチするパススコープルールは、そこで作業するときにオンデマンドでロードされます。

```markdown
---
name: log-reader
description: Reads long log files and reports the errors it finds
autoCompactWindow: 200000
---
```

subagent ごとの auto-compact ウィンドウ (v2.1.296+)。値は必ず整数で書いてください。フロントマターの `200k` は 200 と読まれて範囲外になり、フィールドがないものとして動作します (`claude --debug` に `invalid autoCompactWindow` が出ます)。`CLAUDE_CODE_AUTO_COMPACT_WINDOW` が正の整数で設定されていればそちらが優先され、このフィールドは無効です。

### 1.8 起動時にコンテキストへ入るもの

公式の context-window シミュレーションは、最初のプロンプトを打つ前にロードされるものを「例示的な」トークン数で示しています: システムプロンプト約 4.2K、自動メモリ約 680、環境情報約 280 (git ブロックは別)、MCP ツール名 (deferred) 約 120、skill description 約 450、`~/.claude/CLAUDE.md` 約 320、プロジェクト CLAUDE.md 約 1.8K。その後の使用量はファイル読み込みが支配的です (例: 1 回の読み込みで 2,400 トークン)。

関連する機構:

- MCP ツールのスキーマは既定で遅延され (tool search)、ツール名とサーバー指示だけがコンテキストを消費します。`ENABLE_TOOL_SEARCH=auto` はスキーマがウィンドウの 10% に収まる場合に事前ロードし、`ENABLE_TOOL_SEARCH=false` は全部ロードします。v2.1.283 で `/context` が MCP サーバー指示を独立した行として数えるようになったとされています (未検証)。
- skill description は起動時にロードされますが、`/compact` 後に再注入されません。`disable-model-invocation: true` の skill は起動時のインデックスに載らず、`/name` で呼ぶまでゼロコストです。他人の skill にも `skillOverrides` で同じことができます。v2.1.301 で `/rewind` 後に skill がモデルに提示されなくなる問題が修正されました。
- hook の stdout は exit 0 ではコンテキストに入りません (デバッグログのみ)。入るのは `hookSpecificOutput.additionalContext` の JSON と SessionStart の stdout です。10,000 文字を超える hook 出力はファイルに退避され、プレビューだけが入ります。`!cmd` の出力はメッセージの一部としてコンテキストに入ります。

### 1.9 圧縮 (compaction)

#### 二段階の動作と要約の内容

コンテキストが上限に近づくと、Claude Code はまず古いツール出力をクリアし、必要なら会話を要約します。要約には、依頼と意図、主要な技術的概念、調査・変更したファイルと重要なコードスニペット、エラーとその修正、未完了タスク、現在の作業が含まれます。端末には `Conversation compacted`、再読込ファイルごとの `Read <file>` 行、`Skills restored (<name>)` が表示されます。

単一のファイルやツール出力が大きすぎて圧縮直後にコンテキストが再び埋まる場合、無限ループせず数回の試行後に thrashing エラーで停止します。v2.1.284 では圧縮後のリクエストがなお長すぎる場合に、直近の会話をより少なく残してもう一度圧縮するようになり、v2.1.286 では thrashing エラーがモデルフォールバックで 1M から 200K にウィンドウが落ちたことを明示するようになりました。v2.1.301 では、小さいウィンドウのモデルに切り替える際に、先に旧モデルで長すぎる会話を要約するようになりました。

#### 何が生き残るか

| 項目 | 圧縮後 |
|---|---|
| システムプロンプトと output style | そのまま有効 |
| プロジェクトルート CLAUDE.md とパススコープなし rules | ディスクから再注入 |
| 自動メモリ | 再注入 |
| git status スナップショット | 更新して再注入 (v2.1.269 以降は現在の状態) |
| plan mode のプランファイル | 再注入 |
| `paths:` rules とネスト CLAUDE.md | 要約に吸収され、再度マッチしたときだけ再ロード |
| 直近に変更した最大 5 ファイル | 再読込 (5,000 トークン超は `Referenced file` としてパス参照のみ) |
| 呼び出し済み skill 本文 | 再注入、skill あたり 5,000 トークン、合計 25,000 トークン、古いものから落とす |
| バックグラウンドのコマンドと subagent | 動き続ける |
| hook が追加したコンテキスト | 要約される |
| `compact` マッチャーの SessionStart hook | 実行される |

skill の切り詰めは SKILL.md の先頭を残すので、重要な指示は冒頭に置きます。v2.1.198 以降、要約リクエストはセッションの extended thinking 設定を引き継ぎます。「圧縮後に指示が消えた」場合の原因は、会話内だけの指示だったか、まだ再ロードされていないネスト CLAUDE.md だったか、圧縮後にマッチしていないパススコープルールだったかのいずれかです。

#### auto-compact の閾値

既定では、モデルのコンテキスト上限で圧縮されます (クラウドセッションは上限に近づいた時点)。Sonnet 4.6/Opus 4.6 で `[1m]` なしなら 200K。ネイティブ 1M のモデル (Fable 系、Sonnet 5 以降、Haiku 5.5、Opus 4.7 以降) は既定で約 967K。ゲートウェイのエイリアスなど認識できないモデル ID は 200K とみなされます。`CLAUDE_CODE_DISABLE_1M_CONTEXT=1` で 200K 動作に固定し、`[1m]` のピッカー項目を消せます。ゲートウェイの ID には `modelOverrides` や `modelPicker` の `behavesAs`、`[1m]` の付与、`CLAUDE_CODE_MAX_CONTEXT_TOKENS` (`claude-` で始まらず `[1m]` を含まない未認識 ID にはそのまま適用。`[1m]` 付きの未認識 ID は 1M とみなされるため `CLAUDE_CODE_DISABLE_1M_CONTEXT=1` の併用が必要。認識済みモデルに解決される ID や裸の `claude-` 名には、全圧縮を無効にする `DISABLE_COMPACT` を併用したときだけ効く) で対処します。`CLAUDE_CODE_DISABLE_UNKNOWN_MODEL_WINDOW_ENFORCEMENT=1` は API の too-long エラー後にだけ圧縮します。v2.1.273 で advisor ツールのターンが約 2 倍に数えられ、auto-compact がウィンドウの半分で発火していた問題が修正されました。

ウィンドウの設定手段と優先順位:

```json
{
  "autoCompactWindow": 500000
}

{
  "autoCompactEnabled": false
}
```

settings.json。範囲は 100000 から 1000000 で、モデルのウィンドウで上限が切られます。`autoCompactEnabled: false` と `DISABLE_AUTO_COMPACT` は auto-compact を止め、手動 `/compact` は使え、idle compaction も止まります。

```bash
claude --autocompact 500k
claude --autocompact auto
CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000 claude
```

`--autocompact` (v2.1.221+) は起動単位。`/autocompact <value>` はセッション中に変更し、v2.1.288 以降は現在のモデルの `modelSettings` に保存されます。`/autocompact auto` でチューニング済み既定に戻ります。受け付ける形式は `200000`、`500k`、`1M`、または `100` から `1000` の裸の数値 (千単位)。環境変数 `CLAUDE_CODE_AUTO_COMPACT_WINDOW` は裸のトークン数のみを受け付け、設定されている間はコマンド、フラグ、設定のすべてに優先し、`/autocompact` は上書きを報告するだけになります。管理設定は `/autocompact` に優先でき、その場合コマンドは保存はするがセッションには管理値が使われると報告します。

```json
{
  "modelSettings": {
    "claude-opus-5-5": {
      "effortLevel": "high"
    }
  }
}
```

`modelSettings` の形式 (ドキュメントの effortLevel 例)。`/autocompact` は同じ正規モデルキーの下に `autoCompactWindow` を書き込みます。エイリアス、日付付き ID、`[1m]`、プロバイダー ID はすべて同じキーにマッチします。

#### idle compaction

v2.1.299 で追加 (`idleCompaction` キーと `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` は v2.1.290+ が必要)。条件がすべて揃うと、放置中のセッションをキャッシュ期限切れの直前に圧縮し、次のメッセージがコールドな全文再処理ではなく要約から始まるようにします。

- 対話的な端末セッションであること
- 1 時間のキャッシュ TTL であること (サブスクリプションでプラン使用量内)
- Anthropic からの feature flag 取得が可能なこと
- コンテキストが 200,000 トークン以上であること
- 最後のリクエストから約 54 分経過し、その時点でコンピュータがスリープしていないこと

トランスクリプトには `Compacted while idle, before the prompt cache expired` と記録されます。v2.1.302 で `/config` に Idle compaction の行が追加されました。200K ウィンドウのモデルでは既定閾値だと auto-compact が先に発火するためほぼ条件を満たさず、ドキュメントの例は閾値を 150000 に下げています。

```json
{
  "idleCompaction": false
}

{
  "env": {
    "CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS": "150000"
  }
}
```

無効化と閾値変更。100000 未満の値は 100000 に引き上げられます。

#### 圧縮を誘導する

- `/compact focus on the API changes` のように焦点を渡す。
- CLAUDE.md に「Compact Instructions」セクションを置く。公式例は `"When compacting, always preserve the full list of modified files and any test commands"`。
- `/rewind` から「Summarize from here」「Summarize up to here」を選び、任意で指示を入力する。数字キーで選ぶと指示入力をスキップします。ディスク上のファイルは変わらず、元の履歴はトランスクリプトに残ります。同一セッション内で動く「的を絞った /compact」であり、元を残したいなら先に `/branch` します。
- 無関係なタスクの間は `/clear`。
- 履歴に残したくない脇の質問は `/btw`。

#### 圧縮関連の hooks

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "echo 'Reminder: use Bun, not npm. Run bun test before committing. Current sprint: auth refactor.'"
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json` に置き、手動/自動/idle のすべての圧縮後に stdout をコンテキストへ再注入します。`echo` を `git log --oneline -5` などに置き換えると動的になります。毎セッション必要な情報は CLAUDE.md に書く方が適切です。SessionStart の `source` は `startup`、`resume`、`clear`、`compact`、`fork` (v2.1.214 より前は fork も `resume` と報告)。

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "hook_event_name": "PreCompact",
  "trigger": "manual",
  "custom_instructions": null
}
```

PreCompact の入力。マッチャーは `manual` (`/compact`) と `auto` (auto-compact と idle compaction を含む)。`custom_instructions` は `/compact` の引数か null。exit code 2 または `{"decision":"block"}` で圧縮をブロックできますが、効果はタイミングで異なります。上限前の先行的な自動圧縮をブロックすると圧縮がスキップされて会話はそのまま続き、API がすでに context-limit エラーを返した後の回復圧縮をブロックするとエラーが表面化してリクエストが失敗します。`systemMessage` と `continue` は破棄されます。

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../00893aaf-19fa-41d2-8238-13269b9b3ca0.jsonl",
  "cwd": "/Users/...",
  "hook_event_name": "PostCompact",
  "trigger": "manual",
  "compact_summary": "Summary of the compacted conversation..."
}
```

PostCompact の入力。決定制御はなく、要約のログや外部状態の更新に使います。`--include-hook-events` は PreCompact/PostCompact に対して `hook_started` を出しません。

```json
{
  "session_id": "abc123",
  "transcript_path": "/Users/.../.claude/projects/.../transcript.jsonl",
  "cwd": "/Users/my-project",
  "hook_event_name": "InstructionsLoaded",
  "file_path": "/Users/my-project/CLAUDE.md",
  "memory_type": "Project",
  "load_reason": "session_start"
}
```

InstructionsLoaded の入力。CLAUDE.md や rules が起動時でも遅延でもロードされるたびに発火し、`memory_type` は User/Project/Local/Managed、`load_reason` は `session_start`、`nested_traversal`、`path_glob_match`、`include`、`compact`。遅延ロードでは `globs`、`trigger_file_path`、`parent_file_path` が加わり、v2.1.288 からは subagent が起こしたロードに `agent_id`/`agent_type` が付き、ファイルアクセスでロードされた rules/ネスト CLAUDE.md は effort も報告します。マッチャーは `load_reason` に対して動くので `"matcher": "path_glob_match|nested_traversal"` で遅延ロードだけ拾えます。非同期で exit code は無視され、決定制御はありません。「なぜルールがロードされないのか」を調べる最良の手段です。

### 1.10 プロンプトキャッシュ

#### 三層構造とキャッシュキー

各リクエストは三層の順に並びます。

| 層 | 内容 | 変わるタイミング |
|---|---|---|
| システムプロンプト | コア指示とツール定義 | ロード済みツールセットが変わるとき |
| プロジェクトコンテキスト | CLAUDE.md、自動メモリ、パススコープなし rules | セッション開始、`/clear`、`/compact` |
| 会話 | 毎ターン | 毎ターン |

前の層が変わると後ろはすべて無効になります。モデルと effort もキャッシュキーの一部で、モデルごとに別キャッシュ、ほとんどのモデルでは effort レベルごとにも別です。例外として Opus 5.5、Sonnet 5.5、Haiku 5.5、Fable 5.1 では API キーまたはサブスクリプション利用時に effort 変更がキャッシュを保ちます (Fable は v2.1.260+)。Bedrock、Vertex、Claude apps ゲートウェイ、HIPAA、`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` では保ちません。plan mode と skill のロードはメッセージとして追記されるので prefix は保たれます。

#### 無効化する操作と保つ操作

無効化する: モデル切替 (`/model`、opusplan の plan mode トグル、自動フォールバック、別 `model` を持つ skill/command)、effort 変更 (ほとんどのモデル)、fast mode のオン (会話につき一度)、ツールを事前ロードしている場合の MCP サーバー接続/削除、MCP サーバーを提供する plugin の有効化/無効化、tool search 無効時の裸のツール名 deny ルール、圧縮、画像バッチの退避、Claude Code のアップグレード (再起動後の最初のセッション)。

保つ: リポジトリファイルの編集 (system-reminder で通知され、以前の読み込みは書き換えられない)、CLAUDE.md の編集、permission mode の変更 (opusplan の plan トグルを除く)、output style の変更 (v2.1.251+、次メッセージから適用)、skill/command の呼び出し、`/recap`、`/rewind`、subagent の起動 (親の prefix は不変)、`/advisor` のトグル (定義がキャッシュ境界の後にあるため)。`/fork` のコピーは分離指示を末尾メッセージとして受け取るので元のキャッシュは無傷です。MCP 設定ファイルの編集はそれ自体ではキャッシュを変えず、再起動後に反映されます。

tool search が有効 (既定) なら、会話の最初のリクエストのツールリストが会話全体で維持されるため、MCP サーバーの途中接続/切断も裸の deny ルールもキャッシュを保ちます。tool search が無効なときの MCP の挙動は次のとおりです。

| 事象 | キャッシュ |
|---|---|
| サーバー接続や動的ツール更新でツールが増える | 無効化 |
| サーバーが自然に落ちる (stdio プロセス終了) | 保持。定義は不変、呼び出しはエラー |
| リモートサーバーの自動再接続 | 保持。ただし再接続中のリクエストが `WaitForMcpServers` ツールを追加すると一度だけ無効化され、以後は載ったまま |
| deny ルールや `/mcp` での意図的な削除 | 無効化 |

ツールリストを変えるのは裸のツール名の deny ルール (`Bash`、`Bash(*)`、`"*"`、`"mcp__*"`) だけで、`Bash(rm *)` のようなスコープ付きルールと allow/ask ルールは prefix を変えません。

plugin の skills、commands、agents、hooks、monitors、themes は追記されるので無効化しません。MCP サーバーを提供する plugin は MCP のルールに従います。リロードが全再読込を引き起こす場合、Claude Code は警告を出して適用せず、`/reload-plugins --force` で強制します。以前に有効化した plugin を無効化するとリクエスト形状が元に戻るため、TTL 内なら古いキャッシュが再利用されます。`/reload-plugins` は対話端末のないセッション (デスクトップアプリ、Agent SDK、`-p`) でも、セッションに直接入力すれば動きます (v2.1.260+)。

`/model` はキャッシュが温かい間だけ確認を求め (v2.1.238+)、`PreModelSwitch` hook で強制/スキップできます。

#### CLAUDE.md 編集が効かない理由

プロジェクトルートとユーザーの CLAUDE.md はセッション開始時に一度読まれてメモリに保持されます。セッション中に編集してもキャッシュは無効化されず、同時に編集も適用されません。次の `/clear`、`/compact`、再起動で反映されます。まだロードされていないネスト CLAUDE.md と `paths:` rules は編集を拾いますが、一度ロードされると履歴の一部になるので、その後の編集は遡って変わりません。

#### /compact と /rewind のコスト

`/compact` の要約リクエストは会話のキャッシュ済み prefix (同じシステムプロンプト、ツール、履歴に要約指示を足したもの) を再利用するので、温かいキャッシュでの圧縮は安価です。TTL より長い休憩の後は読むべきキャッシュがなく、全履歴を非キャッシュ入力として再処理します。これが「古いセッションを resume して圧縮するのが最も高くつく」理由です。圧縮はプロジェクトコンテキストをディスクから再ロードし、CLAUDE.md とメモリが不変ならキャッシュヒットします。resume した会話が古いシステムプロンプトを保持していた場合、最初の圧縮で現行プロンプトに切り替わり、その層が一度再構築されます。

道を間違えて丸ごと捨てたいときは `/rewind` の方が安価です。公式の言い方では "Rewinding truncates back to a prefix that is already cached, rather than building a new one as compaction does." です。コミュニティでは「TTL より長く離れる前に `/compact` を打つ」というパターンが知られ、温かいキャッシュなら入力価格の約 10% という数字が挙げられていますが、この数値は公式ページにはありません (未検証、サードパーティ)。idle compaction がこの運用を自動化します。

#### TTL と優先順位

| バケット | サブスクリプション (プラン使用量内) | 使用量クレジット / API キー / クラウドプロバイダ |
|---|---|---|
| メイン会話 (対話、`-p`、SDK ターンとインラインヘルパー) | 1 時間 | 5 分 |
| それ以外 (subagent、workflow、teammate、fork、圧縮、セッションタイトル) | 5 分 (サーバー制御ヘルパーは 1 時間) | 5 分 |

```json
{
  "promptCacheTtl": "1h",
  "subagentPromptCacheTtl": "5m"
}
```

値は `5m` か `1h` (v2.1.242+)。環境変数は `CLAUDE_CODE_PROMPT_CACHE_TTL` と `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`。優先順位は 1) `FORCE_PROMPT_CACHING_5M=1`、2) バケットの環境変数、3) バケットの設定、4) subagent の `experimental.cacheTtl` フロントマター (v2.1.248+、使用量クレジット中は `1h` 無視)、5) `ENABLE_PROMPT_CACHING_1H=1`、6) バケットの既定。プラン使用量を超えるとメイン会話は自動で 5 分に落ちます。Claude apps ゲートウェイでは 1 時間 TTL は使えず、`ANTHROPIC_BASE_URL` のゲートウェイ経由では `anthropic-beta` ヘッダーの転送が必要です。

```bash
claude -p "hello" --output-format json
```

`usage.cache_creation` の `ephemeral_1h_input_tokens` と `ephemeral_5m_input_tokens` でどちらの TTL で書かれたか確認できます。

ゲートウェイが `cache_control` をどう扱うかで、そもそもキャッシュされるかが決まります。マーカーをそのまま転送すれば通常どおり。`cache_control` を名指しした 400 を返す場合、Claude Code は会話途中のシステムブロックからマーカーを最後のメッセージに移し、以後ブロックは非キャッシュ課金、会話はキャッシュされます。マーカーを削除して成功を返す場合 (またはブロック形式のシステム内容を文字列に変換する場合) は、会話履歴全体が毎ターン非キャッシュ入力として課金されます。`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS` を設定すると、追加システムブロックはどのプロバイダでも非キャッシュで送られます。

#### スコープと観測

キャッシュは実質的に 1 マシン + 1 ディレクトリです。システムプロンプトに自動メモリのパスが埋め込まれ、会話の先頭で作業ディレクトリ、プラットフォーム、シェル、OS バージョンと git status スナップショットが宣言されるからです。同じディレクトリの並列セッションはキャッシュを共有し、逐次セッションは git スナップショットが一致するときだけ共有します。SDK フリートでは `--exclude-dynamic-system-prompt-sections` (SDK では `excludeDynamicSections` (未検証)) でユーザー固有部分を最初のユーザーメッセージに移し、システムプロンプトのキャッシュをユーザーやマシンをまたいで共有できます。これは既定のシステムプロンプトにのみ適用され、`--system-prompt`/`--system-prompt-file` では無視されます。`--system-prompt` 内の `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` 行 (v2.1.275+) で静的部分と動的部分を分けられます。同じ prefix を持つ agent を workflow からファンアウトするとき、最初の agent がキャッシュした prefix を他が読めるよう、既定で最大 5 秒待機します。resume された subagent は元の実行で温めたキャッシュを再利用します。

観測手段: `/usage` の `Prompt cache (main)` 行 (ヒット率、ミス回数、warm/cold、v2.1.251+; changelog では `/cost` と記載) と、直近ミスの推定原因 (`likely cause: tool definitions changed` など、v2.1.260+)。ステータスラインスクリプトには `current_usage.cache_creation_input_tokens`/`cache_read_input_tokens` と `prompt_cache` オブジェクト。OTel の `api_request` イベントは `cache_creation_5m_tokens`/`cache_creation_1h_tokens` に分かれます (v2.1.300)。creation がターンごとに高いままなら prefix で何かが変わっています。

```text
DISABLE_PROMPT_CACHING=1          # all models
DISABLE_PROMPT_CACHING_HAIKU=1    # model the `haiku` alias resolves to (incl. main convo, v2.1.283+)
DISABLE_PROMPT_CACHING_SONNET=1   # model the `sonnet` alias resolves to
DISABLE_PROMPT_CACHING_OPUS=1     # model the `opus` alias resolves to
DISABLE_PROMPT_CACHING_FABLE=1    # Fable only
```

デバッグ用の無効化。エイリアス版はそのエイリアスが解決するモデルだけを対象にし、同系統の別固定 ID は対象外です。

### 1.11 セッション: resume、naming、branch、fork

#### resume の入口

- `claude --continue`: cwd で最新のセッション。`-p`/SDK セッションと最初のプロンプトが `/loop` だったセッションは除外 (`claude -p --continue` は含む)。v2.1.257 以降は終了済みバックグラウンドセッションも開きます。
- `claude --resume`: ピッカー。`--resume <name|id|transcript-path>` で直接指定。
- `claude --from-pr <number|URL>`: PR を作ったセッション。
- `/resume [name]`: セッション内から。

ID による resume は現在のプロジェクトと worktree を探し、次にマシン上の他のすべてのプロジェクトを探します (v2.1.223+)。他プロジェクトでの解決は、ちょうど一つのプロジェクトだけがそのトランスクリプトを持つ場合に限られ、手でコピーした重複があると not-found になります。名前が曖昧なら `claude --resume <name>` はピッカーを前入力で開き、`/resume <name>` はエラーになります。

実行中のバックグラウンドセッションを resume するとアタッチになります (v2.1.285+)。CLI で渡したプロンプトは次のターンとして送られますが、`--permission-mode`、`--model`、`--settings`、`--output-format`、`--max-turns` などの設定フラグがあると exit 1 で終了します。コピーがほしければ `--fork-session` を付けます。端末で `claude -p --resume <session> "prompt"` と打った場合もアタッチになります。`/` や `!` で始まるプロンプト、およびセッションが質問待ちの間のプロンプトは送られず、`Your prompt was not sent to it` と表示されます。

ピッカーのショートカット: Ctrl+W 全 worktree、Ctrl+A 全プロジェクト、Ctrl+B 現在のブランチ、Ctrl+R 名前変更、Space (または Ctrl+V) プレビュー、`1` から `9` で位置指定、PR URL の貼り付けでそのセッションを検索。別 worktree のセッションを選ぶとその場で resume (worktree が消えていれば cwd で)、無関係なプロジェクトのセッションを選ぶと `cd` + resume コマンドがクリップボードにコピーされます。`/cd` はセッションを新ディレクトリのプロジェクトストレージに移します。`claude rm <id>` はトランスクリプトをディスクに残し、resume 可能なままです。

#### 復元されるものとされないもの

復元: 全履歴 (中断されたツール呼び出しは cut off とマークされ、再実行前の確認が指示される。`CLAUDE_CODE_RESUME_INTERRUPTED_TURN` で変更可)、モデル、agent、permission mode (端末経由のみ、例外あり)、アクティブな `/goal` (ターン数、タイマー、トークン基準はリセット)、期限内のスケジュールタスク。agent はまずセッションの元ディレクトリ (信頼済みなら)、次に resume したディレクトリで探され、見つからなければ既定ツールと警告で再開します。前プロセスとともに終了したバックグラウンドの subagent/Bash/workflow は「didn't finish」ノートとして次のプロンプトで Claude に読まれます。

復元されない: `--mcp-config`、`--settings`、`--plugin-dir`、`--fallback-model`、`--add-dir` と `/add-dir` のディレクトリ、バックグラウンドの Bash/monitor タスク。

permission mode: `bypassPermissions` は決して復元されず起動時に再指定が必要。`plan` は端末では復元 (`--fork-session` では不可、deny ルールで ExitPlanMode が消えていれば不可)。`auto` はアカウントがまだ対象なら復元。`-p --resume` では `--permission-prompt-tool` あり、`--permission-mode` なし、`--fork-session` なし、channels 経由でない、という条件下でのみ plan mode が復元されます (v2.1.246+)。セッション内の `/resume` は plan 以外では現在のモードを引き継ぎます。v2.1.290 と v2.1.292 で `--continue`/`--resume`/ピッカー/`/resume` 経由の plan mode 復元が修正されました。

#### 命名

`claude -n <name>` で起動時、`/rename <name>` でセッション中 (プロンプトバーに表示)、ピッカーの Ctrl+R、plan 承認時の自動タイトル、claude.ai/Remote Control からの変更 (v2.1.221+)。無名セッションには `<dir>-<2 文字>` 形式の既定表示名 (例 `my-app-3f`、v2.1.196+) が付きますが、これは resume ハンドルではありません。`--resume` や `/resume` に渡しても見つかりません。一方、最初のプロンプトから Haiku クラスのモデルが生成するタイトルは `--resume` で使えます。シェルから起動した `claude -p` には生成タイトルが付きません。`/clear` は `--name`/`/rename` の名前は保持し AI 生成タイトルは保持しません。`/clear <name>` は離れるセッションに名前を付け、新セッションは無名で始まります。v2.1.299 で終了時の resume ヒントが名前ではなく ID を使うようになりました。

#### branch と fork

```bash
/branch try-streaming-approach

claude --continue --fork-session
claude --resume abc123 --fork-session
```

`/branch [name]` はトランスクリプトをコピーして実行中プロセスをコピー側に切り替えます。「このセッションでは許可」の付与、進行中のバックグラウンド subagent/Bash、Remote Control 接続を保持し、両方のセッション ID を表示し、元はピッカーに残ります。`--fork-session` は新プロセスで fork し、付与は引き継ぎません。同じセッションを二つの端末で fork せずに resume すると、両方のメッセージが一つのトランスクリプトに交互に混ざります。`--session-id <uuid>` で新しい会話の ID を固定できます (有効な UUID 必須)。fork と branch はピッカーで別行として表示され、グループ化されることがあります (→ で展開)。

### 1.12 トランスクリプト、保持、purge、scratchpad

トランスクリプトは `~/.claude/projects/<project>/<session-id>.jsonl` に JSONL で保存されます。`<project>` は cwd の英数字以外を `-` に置き換えたもので、200 文字を超えるとハッシュ付きで切り詰められます。エントリ形式は内部仕様でバージョン間で変わるため、直接パースするスクリプトはどのリリースでも壊れうると公式が警告しています。コミュニティの「continue-claude-work」のような、前セッションの圧縮要約と TODO だけをトランスクリプトから抜き出す skill はこの理由で脆いと考えてください (未検証、サードパーティ)。サポートされる入口は `/export`、hook の `transcript_path`、そして次の形式です。

```bash
claude -p --resume <session-id> --output-format json "summarize what we changed" | jq -r '.result'
```

v2.1.300 以降、各 API リクエストのシステムプロンプト、ツール、パラメータもトランスクリプトに記録されます。`projects/<project>/` 配下には他に、`<session>.orphaned-<timestamp>-<suffix>.jsonl` と `<session>.jsonl.superseded-<timestamp>` (退避された旧トランスクリプト、ピッカーには出ない)、`<session>/subagents/` (subagent のトランスクリプト)、`<session>/tool-results/` (ファイルに退避された大きなツール出力とフルサイズの MCP 画像) があります。

```bash
CLAUDE_CONFIG_DIR=/srv/tenant-a CLAUDE_CODE_PROJECT_DIR_NAME=work claude
```

マルチテナントホストでトランスクリプトと自動メモリを cwd と無関係な固定ディレクトリ (`/srv/tenant-a/projects/work/` とその `memory/`) に固定します。v2.1.234+、名前は 1 から 64 文字の `[A-Za-z0-9_-]`、起動シェルの環境変数として設定が必要で (settings の `env` では不可)、`CLAUDE_CONFIG_DIR` なしでは無視されます。

```json
{
  "cleanupPeriodDays": 20
}

{
  "desktopSessionCleanupPeriodDays": 90
}
```

`cleanupPeriodDays` は既定 30、最小 1 (0 は検証エラー、長期保持なら 3650 など)。`desktopSessionCleanupPeriodDays` (v2.1.248+) は 0 以上の整数、既定 0 (年齢上限なし)、スコープは user か managed と `--settings` で、project/local では無視されます。Desktop/Cowork のトランスクリプトはこの値と `cleanupPeriodDays` の両方より古くなったときだけ削除されます。`history.jsonl` は HIPAA 下を除いて年齢で掃除されません。同じ `cleanupPeriodDays` の閾値が孤立 worktree の自動削除も決めます。その他、`CLAUDE_CODE_TRANSCRIPT_LOCAL_GC`、`CLAUDE_CODE_SKIP_PROMPT_HISTORY`、`-p` 専用の `--no-session-persistence` があります。スイープは `--bare` ではスキップされ、保持期間を決定できない場合は一時停止します。`file-history/` は 100 チェックポイント分を保持し、`sessions/` は年齢で掃除されません。

`~/.claude` 配下はすべて平文です。ツールを通ったもの (`.env` の内容、コマンド出力、貼り付け) はトランスクリプトに書かれ、OS のファイル権限だけが保護です。対策は `cleanupPeriodDays` の短縮、`desktopSessionCleanupPeriodDays` の設定、`CLAUDE_CODE_SKIP_PROMPT_HISTORY`、認証情報ファイルへの Read deny ルール、そして `claude purge` です。

```bash
claude purge ~/work/my-repo --dry-run
claude purge ~/work/my-repo
claude purge ~/work/my-repo --yes
claude purge --all
```

v2.1.288 で `claude project purge` から改名。トランスクリプトと自動メモリ、セッションごとの tasks/debug/file-history、`history.jsonl` の該当行、`~/.claude.json` のプロジェクトエントリを削除します。`-i` で項目ごとに確認。一時ディレクトリ下の scratchpad と画像、`shell-snapshots/`、`backups/`、`/heapdump` ファイルには触れません。

scratchpad は Claude が許可プロンプトなしで使う一時ディレクトリで、Linux は `/tmp/claude-<uid>/<project>/<session-id>/scratchpad/`、macOS は `/private/tmp/...`、Windows は `%TEMP%\claude\...` です。claude.ai アカウントでサインインし、Anthropic API を使い (Bedrock/Agent Platform/Foundry ではない)、`enableArtifact` が `false` でない場合にのみ存在します。トランスクリプトと同じ寿命で、OS か保持スイープで消え、`claude purge` では消えません。hook には `scratchpad_dir` として渡され、`CLAUDE_CODE_TMPDIR` で移動できます。貼り付け/添付画像も v2.1.275 以降は一時ディレクトリ下にあります。

### 1.13 checkpoint と /rewind

ターンを開始するプロンプトごとに checkpoint が取られ、セッションあたり直近 100 checkpoint 分のファイルスナップショットが保持されます。古い checkpoint を破棄すると、残る checkpoint が参照しないスナップショットが消えますが、各ファイルの最初のスナップショットは VS Code の diff 基準として常に残ります。会話と一緒に保存されるので resume 後も `/rewind` が効きますが、スナップショットは保持スイープ (約 30 日) で消え、その後の復元は `No files were restored` で失敗します。

`/rewind` または空プロンプトでの Esc Esc でメニューが開きます (入力中のテキストがあると Esc Esc はそれをクリアするだけで、Up で呼び戻せます)。選択肢は Restore code and conversation、Restore conversation、Restore code、Summarize from here、Summarize up to here、Never mind の六つで、コード復元の項目はその時点以降に追跡済みの編集がある場合だけ出ます。Restore conversation か Summarize from here を選ぶと選んだプロンプトが入力欄に戻り編集して再送でき、Summarize up to here は末尾に留まり入力欄は空で、`Summarized conversation` マーカーが入ります。同じプロセス内で `/clear` した後は、メニューに `/resume <session-id> (previous session)` の項目が出ます。v2.1.275 で fork/バックグラウンドセッションの `/rewind` が、file-history のバックアップを完全にコピーできなかった場合にゼロ埋めや切り詰められたファイルを復元する問題が修正されました。

限界:

- Bash で行った変更 (`rm`、`mv`、`cp`) は追跡されない。
- subagent の編集は復元されない。例外はフォアグラウンドの `context: fork` skill (`background: false`)。バックグラウンドの `/code-review --fix` の編集も復元されない。
- 外部や並行セッションの編集は追跡されない。
- ターン中にキューされたメッセージには checkpoint がなく、メニューで `No code restore` と表示される。ターンを開始したプロンプトから復元する。
- シンボリックリンクとハードリンクのファイルはスキップされ、`Restored the code, but skipped N files` と警告される (dotfile マネージャのリンク、pnpm のハードリンクなど)。復元前に `/debug` を実行すると、スキップしたパスが `~/.claude/debug/<session-id>.txt` に記録される。

git の代替ではありません。

### 1.14 システムプロンプト、システムリマインダー、--bare と --safe-mode

#### システムプロンプトは一度だけ構築される

既定では、システムプロンプトは会話の最初のリクエストで一度構築され (システムプロンプトフラグのテキストを適用済み)、セッションに記録されます。圧縮されるまで、`--resume`/`--continue` を含む後続のすべてのリクエストがその記録済みプロンプトを使います。したがって resume 時に別の `--append-system-prompt` を渡しても、圧縮後か新しい会話でしか効きません。反復中は `--system-prompt-snapshot off` (v2.1.257+) でリクエストごとに再構築させます。`--bare`/`CLAUDE_CODE_SIMPLE=1` では `--system-prompt-snapshot on` を付けない限り記録はオフです。v2.1.265 より前は何らかのシステムプロンプトフラグを渡すと記録がオフになっていました。v2.1.268 より前は、feature flag を取得しないセッション (Bedrock、Agent Platform、Foundry) がリクエストごとにプロンプトを再構築し、このフラグは無効でした。v2.1.283 以降、`--append-system-prompt` と `--append-system-prompt-file` は併用でき、ファイル内容が先に来ます。v2.1.267 で subagent と `--system-prompt` セッションもプロンプトとツール定義を一度だけ記録するようになったとされています (未検証)。

#### システムリマインダー

Claude Code はユーザーの指示と並べて独自のコンテキストを注入します: CLAUDE.md、output style の指示、ファイル変更通知、コミット/PR の attribution 行、組み込みの git ワークフロー指示と git status スナップショット (現在のブランチ、メインブランチ、`git status` 出力、最近のコミット)。「書いた覚えのないルールに Claude が従う」 (例: `Co-Authored-By` トレーラーを足す) 場合、出所はここです。

```json
{
  "includeGitInstructions": false
}
```

CLAUDE.md や skills で独自のコミット/PR ワークフローを定義しているときに、組み込みの git 指示とスナップショットを外します。環境変数は `CLAUDE_CODE_DISABLE_GIT_INSTRUCTIONS`。クラウドセッションはスナップショットを決して含みません。`-p` で `--system-prompt`/`--system-prompt-file` を渡す場合や `--agent`/`agent` 設定でカスタム agent を動かす場合はプロンプトが置き換わり、キーが true でもスナップショットは落ちます。残したいなら `--append-system-prompt` を使います。

```json
{
  "attribution": {
    "commit": "Generated with AI\n\nCo-Authored-By: AI <ai@example.com>",
    "pr": "",
    "sessionUrl": false
  }
}
```

attribution のカスタマイズ。既定のコミットトレーラーは使用中のモデル名を含みます (例 `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`)。`"attribution": false` で全部隠せます (v2.1.281+。それ以前は値を拒否して settings ファイル全体をスキップします)。Claude Code は Claude に対して、CLAUDE.md やメモリにある attribution についての指示がこれらの行より優先すると伝えますが、管理設定由来の行は例外です。v2.1.269 で attribution リマインダーが CLAUDE.md/メモリの反対ルールを上書きしていた問題が修正されました。

#### --bare と --safe-mode

`--bare` は hooks、skills、custom commands、subagents、インストール済み plugin、MCP サーバー、自動メモリ、CLAUDE.md の自動検出をスキップし (`CLAUDE_CODE_SIMPLE` を設定)、スクリプト呼び出しを高速化します。`--add-dir` のディレクトリにある skills はロードされます。保持スイープもスキップされます。`--safe-mode` はすべてのカスタマイズ (CLAUDE.md と自動メモリを含む) を無効にしつつ、認証、パーミッション、管理ポリシーは保ちます。管理 plugin/skills/管理 CLAUDE.md/ポリシー MCP サーバーは落とし、ポリシー hooks と statusline は残します。どちらも「どの指示ファイルが悪さをしているか」の切り分けに使えます。

#### 拡張コンテキスト

Fable 5.1/5、Sonnet 5 以降、Haiku 5.5、Opus 4.7 以降は既定で 1M ウィンドウで動き、`[1m]` サフィックスは不要です (Bedrock/Vertex/Foundry/apps ゲートウェイを含む)。Opus 4.6 と Sonnet 4.6 は `[1m]` バリアントが必要で、Opus 4.6 の 1M は Max/Team/Enterprise に含まれ、Sonnet 4.6 の 1M は全サブスクリプションで使用量クレジットが必要、Pro は両方にクレジットが必要です。200K を超えても API 価格のプレミアムはなく、例外は Haiku 5.5 (100K 超のプロンプトは高い)。ゲートウェイが 200K 超を拒否するなら `CLAUDE_CODE_AUTO_COMPACT_WINDOW=200000` を設定します。v2.1.285 でカスタム `ANTHROPIC_BASE_URL` 経由でも 1M ウィンドウを使うようになった点、v2.1.271 で `--resume` が `[1m]` を落とす問題が修正された点は changelog の該当領域を再確認できていません (未検証)。

### 落とし穴と対策

| 症状 | 原因 | 対策 |
|---|---|---|
| CLAUDE.md を編集したのに効かない | ルート/ユーザー CLAUDE.md は起動時に一度だけ読まれる | `/clear`、`/compact`、再起動。ネスト/パススコープはロード前なら拾う |
| ルールが守られない | CLAUDE.md はユーザーメッセージで強制力がない。長すぎると埋もれる | 200 行未満に削る。強制は `permissions.deny` と hooks。一行だけ `IMPORTANT` を付ける |
| 圧縮後に指示が消えた | `paths:` rules とネスト CLAUDE.md は履歴に入り要約される | `paths:` を外すかルート CLAUDE.md へ。再注入は `SessionStart` の `compact` マッチャー |
| 圧縮後に skill が起動しなくなった | skill description は再注入されない。本文は 5,000/25,000 トークンで切られる | 必要なら `/name` で明示起動。重要指示を SKILL.md の先頭に |
| AGENTS.md が読まれなくなった | CLAUDE.local.md を含む三種の CLAUDE.md がどこかにある | Project instructions を `claude-md-and-agents-md` に、または `@AGENTS.md` import |
| `@import` でコンテキストが減らない | import は起動時に全展開され別々にカウント | 起動時不要なものは `paths:` rules か skills へ |
| 外部 import が二度と聞かれない | 一度拒否すると恒久無効 | `~/.claude/rules/` か `~/.claude/CLAUDE.md` に移す |
| 1 行だけの rule が常にロードされる | フロントマターの YAML が不正だと無条件ロード | `claude --debug` で確認。InstructionsLoaded hook で監視 |
| `paths` が何にもマッチしない | ブレース 1,000 パターン超過、または不正な `[` | パターンを分割。`\[` でエスケープ |
| `--add-dir` の CLAUDE.md が入らない | 既定ではロードしない。`additionalDirectories` 設定は常にロードしない | `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` |
| サブディレクトリで settings.json が効かない | `.claude/settings.json` は親から継承されない | 各ディレクトリで自己完結させるか、ルートから起動 |
| MEMORY.md の後半が消える | 200 行/25KB で切り捨て | インデックスは一行一件で短く。詳細はトピックファイル |
| 自動メモリをオンにできない | バックグラウンド/Claude 起動のセッション、セルフホスト、`--bare`、`--safe-mode`、env var | 外部から起動したセッションで `/memory`。`CLAUDE_CODE_DISABLE_AUTO_MEMORY` を確認 |
| subagent の `memory` が効かない | 自動メモリ自体がオフ | `autoMemoryEnabled` と env var を確認 |
| subagent の `autoCompactWindow: 200k` が無視される | `200k` は 200 と読まれ範囲外 | 整数 `200000` で書く |
| 毎ターン cache creation が高い | モデル/effort 切替、fast mode、tool search 無効時の MCP 変更、裸の deny ルール | `/usage` の likely cause を見る。モデルと effort はセッション冒頭で決める |
| 休憩後の `/compact` が高い | TTL 切れでコールド再処理 | 離れる前に `/compact`。idle compaction の条件を満たす |
| idle compaction が発火しない | 200K 未満、5 分 TTL、非対話、PC スリープ | `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` を下げる (下限 100000) |
| `--append-system-prompt` が resume で無視される | システムプロンプトは最初のリクエストで記録され圧縮まで固定 | `--system-prompt-snapshot off` |
| resume したら MCP やディレクトリが消えた | `--mcp-config`、`--settings`、`--plugin-dir`、`--add-dir` は復元されない | resume 時に再指定 |
| 二つの端末で履歴が混ざる | 同一セッションを fork なしで resume | `--fork-session` か `/branch` |
| `my-app-3f` で resume できない | 既定表示名はハンドルではない | `/rename` か生成タイトルか ID |
| `/rewind` で一部ファイルが戻らない | Bash 変更、subagent 編集、シンボリックリンク/ハードリンク、30 日超 | git を正とする。`/debug` でスキップ一覧 |
| Read deny が効かない | 相対パターンは cwd 起点。`grep -r` はサブプロセス扱い | ルートの settings.local.json に `//` 絶対パス |
| 書いていないコミットルールに従う | システムリマインダーの git 指示と attribution | `includeGitInstructions: false`、`attribution` 設定 |
| ゲートウェイで 200K で圧縮される | 未認識モデル ID は 200K 扱い | `[1m]` 付与、`modelOverrides`、`CLAUDE_CODE_MAX_CONTEXT_TOKENS` |

### 中級者が次にやること

1. **ロード状況の棚卸し**: `/context` の Memory files と `/memory` で何がロードされているか確認し、`/doctor prompt-audit` を一度走らせて古いパスと矛盾を潰す。各行に「消したら Claude が間違えるか」を問い、導出可能な内容を削る。
2. **常駐と遅延の分離**: 起動時に必要な短いルールはルート CLAUDE.md と `paths:` なし rules へ。スタック固有のルールは `.claude/rules/<topic>.md` に `paths:` 付きで置き、ブレース展開は 1,000 パターン以内に収める。圧縮を生き延びる必要があるものだけ常駐に残す。
3. **InstructionsLoaded hook で可視化**: `"matcher": "path_glob_match|nested_traversal"` の hook で遅延ロードをログに落とし、意図したタイミングでルールが入っているか確認する。
4. **圧縮後の再注入を設計**: CLAUDE.md に Compact Instructions セクションを置き、動的情報 (現在のブランチ、直近コミット、スプリント目標) は `SessionStart` の `compact` マッチャーで `git log --oneline -5` などから再注入する。PostCompact で `compact_summary` を外部ログへ流すと要約品質を追える。
5. **キャッシュ規律**: セッション冒頭でモデルと effort を決め、途中で変えない。`/usage` の Prompt cache 行を習慣的に見る。tool search が使えないゲートウェイでは MCP の途中接続を避ける。離席前に `/compact`、やり直しは `/rewind`。サブスクリプションなら `idleCompaction` を有効のまま、200K ウィンドウのモデルでは `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS=150000` を検討する。
6. **auto-compact の明示設定**: チームで共有する `.claude/settings.json` に `autoCompactWindow` を書くか、各自 `/autocompact` でモデル別に保存する。CI やクラウドでは `CLAUDE_CODE_AUTO_COMPACT_WINDOW` で固定する。長いログを読む subagent には整数の `autoCompactWindow` を付ける。
7. **セッション運用**: ブランチと同様に `-n`/`/rename` で名前を付け、分岐検証は `/branch`、別プロセスでの並行は `--fork-session`。resume 時は `--mcp-config` や `--add-dir` の再指定をシェルエイリアスにまとめる。
8. **データ衛生**: `cleanupPeriodDays` と `desktopSessionCleanupPeriodDays` を環境に合わせ、認証情報ファイルに Read deny を張り、`claude purge <path> --dry-run` を定期的に確認する。トランスクリプトをスクリプトで使うなら JSONL を直接パースせず `claude -p --resume <id> --output-format json` を使う。
9. **AGENTS.md 併用リポジトリ**: `CLAUDE.md` に `@AGENTS.md` を書き、Claude Code 固有の指示だけを下に足す。`CLAUDE.local.md` を作る前に Project instructions の値を確認する。
10. **モノレポ**: ルート CLAUDE.md とパッケージ CLAUDE.md の二層にし、`.claude/settings.json` は継承されない前提で各パッケージに置く。生成物は `Read(./**/dist/**/*)` 形式の deny で除外し、worktree を使うなら `worktree.sparsePaths` に `.claude` を含める。

### 出典

- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/claude-directory
- https://code.claude.com/docs/en/sessions
- https://code.claude.com/docs/en/checkpointing
- https://code.claude.com/docs/en/large-codebases
- https://code.claude.com/docs/en/how-claude-code-works
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/changelog
