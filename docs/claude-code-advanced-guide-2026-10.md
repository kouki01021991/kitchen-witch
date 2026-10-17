# Claude Code 応用ガイド 2026年10月版

## 機能・スキル・AIのための仕組みの作り方(中級者以上向け)

- 基準バージョン: Claude Code v2.1.302(2026年10月16日リリース)
- 調査日: 2026年10月17日
- 対象読者: Claude Code を日常的に使っていて、CLAUDE.md、スキル、hooks、サブエージェント、MCP、Agent SDK を「仕組み」として設計・運用したい人

### このガイドの作り方と読み方

このガイドは、公式ドキュメント(code.claude.com/docs、platform.claude.com/docs、support.claude.com、anthropic.com/engineering)を一次情報として、次の手順で作りました。

1. 13 の領域に分けて、各領域の公式ページを全文読み込み、変更履歴と週次ダイジェストで直近 3 か月の変更を追跡。
2. 各領域の調査結果を、別のエージェントが一次情報に再照合して「検証済み / 要修正 / 未検証 / 古い / 誤り」に判定。誤りは削除し、修正はそのまま反映。
3. 13 領域の要約を批評エージェントに渡して取りこぼしを洗い出し、追加調査。
4. 以上をもとに章を執筆し、全体アーキテクチャとブループリント集を最後にまとめました。

表記の約束は次のとおりです。

- 公式ページで確認できた事実は、そのまま断定形で書いています。
- 公式ページで確認できず、第三者の記事や推測にとどまる事実には「(未検証)」を付けています。
- 設定ファイルやコードは、公式ページの記載をそのまま再現しています。フィールド名やフラグ名を自分で補ったものはありません。
- バージョン番号は「v2.1.xxx 以降で利用可能」の形で、機能が入った版を示します。古い版では動かない場合があります。
- 製品名と機能名は英語のまま(CLAUDE.md、hooks、subagent、MCP、SKILL.md など)。

各章は独立して読めるように書いてあります。最初に第14章(全体アーキテクチャとブループリント)を読んで、必要な章に戻る読み方を勧めます。「クレジットを確認しながら使う」ための公式情報は付録A にまとめました。

### 目次

- 第1章 CLAUDE.md・メモリ・コンテキスト管理・セッション
- 第2章 スキルとスラッシュコマンド
- 第3章 Hooks(フック)
- 第4章 サブエージェントと並列実行(Agent teams、worktrees)
- 第5章 ワークフロー・自動化(Workflow tool、goal、scheduled tasks、channels、routines)
- 第6章 MCP(Model Context Protocol)
- 第7章 プラグインと Mods、マーケットプレイス
- 第8章 Claude Agent SDK(TypeScript / Python)
- 第9章 ヘッドレス実行・CI/CD・クラウド/リモート実行・Code Review
- 第10章 権限・設定(settings.json)・サンドボックス・セキュリティ
- 第11章 モデル設定・コスト・クレジット/利用枠の管理
- 第12章 ベストプラクティスと直近の重要アップデート
- 第13章 Claude Code で「AIのための仕組み」を作る設計パターン
- 第14章 全体アーキテクチャと「AIのための仕組み」ブループリント集
- 第15章 追補: 取りこぼしがちな機能と周辺エコシステム
- 付録A 利用枠・クレジットの公式まとめ
- 付録B 2026年3月〜10月の主要アップデート年表

### 10 分で掴む全体像

#### 2026 年に起きた構造的な変化

1. **権限モデルの既定が auto mode に変わった。** 2026年8月14日以降、Pro、Max、Team の新規対話セッションは分類器が権限プロンプトを肩代わりする auto mode で始まります(v2.1.283 以降)。`claude -p` と Agent SDK は v2.1.302 で、第三者プロバイダ経由、テレメトリ無効、または新規インストール直後の場合に `default` 開始へ変更されました(それ以外は auto で始まることがあります)。「何を allow するか」より「分類器に何を渡し、何を deny と hooks で固めるか」が設計の中心になりました(第10章)。
2. **サブエージェントは既定でバックグラウンド、かつ fork が既定になった。** 対話セッションでは fork mode が既定オンで、Claude は会話全体を引き継ぐ fork サブエージェントに副作業を委譲します。v2.1.302 で `-p`、SDK、デスクトップ、VS Code にも広がりました。サブエージェントは自分のサブエージェントを生成でき(既定 3 階層、同時 20)、cross-session messaging で別セッションに結果を渡せます(第4章)。
3. **「Claude が書くスクリプトで数十〜数百のサブエージェントを編成する」dynamic workflows が入った。** `agent()`、`pipeline()`、`parallel()` の決定論的な制御で、探索→敵対的検証→統合のようなハーネスを一発で組めます。`/goal` は完了条件を満たすまで作業を続けさせる Stop hook です(第5章)。
4. **Mods が登場し、Claude Code 自体の挙動を TypeScript で書き換えられるようになった。** プロンプトの書き換え、UI の追加、ツール判定の上書きまで、プラグインとして配布できます。サンドボックス外でユーザー権限で動くため、信頼モデルの理解が必須です(第7章)。
5. **モデル世代が Claude 5 系に移った。** Opus 5 / 5.5、Sonnet 5 / 5.5、Haiku 5.5、Fable 5.1(1M コンテキスト)。effort レベル(`low` から `max`、`ultracode`)が主要なコスト制御になり、Opus 5.5 以降は thinking をオフにできません(第11章)。
6. **自動化の入口が増えた。** scheduled tasks(`/loop`、CronCreate)、cloud の Routines(スケジュール、GitHub イベント、API)、channels(外部イベントを稼働中セッションに push)、deep links、Desktop の scheduled tasks。常時稼働の仕組みはこれらの組み合わせで作ります(第5章)。
7. **レビューと安全性が製品化された。** `/code-review`、`/ultrareview` と `claude ultrareview`(CI 用)、マネージド Code Review(GitHub PR)、Claude Security プラグイン、security-guidance プラグイン(第9章)。
8. **課金の線引きが明確になった。** 2026年10月7日から Max と Team に月次 API クレジット(Max 5x $100、Max 20x $200、Team はシート合算で上限 $500)が付き、Agent SDK、`claude -p`、API、Managed Agents に使えます。ただし対話的な Claude Code には使えず、プランでサインインしたままの `-p` はプラン枠を消費します(付録A、第11章)。

#### 中級者が最初に押さえるべき 12 の機構

1. CLAUDE.md はシステムプロンプトではなく「ユーザーメッセージ」として注入されます。強制力はなく、必ず守らせたいことは `permissions.deny` と PreToolUse hook に置きます。推奨は 200 行未満、`.claude/rules/` の `paths` で読み込みを絞ります(第1章)。
2. 圧縮(compaction)で何が消えるかを知っておきます。サブディレクトリの CLAUDE.md とパス限定 rules は要約で消え、スキル本文は上限付きで再注入されます。SessionStart の `compact` マッチャーで再注入する設計が定石です(第1章)。
3. プロンプトキャッシュの 1 時間 TTL はサブスクリプション枠内のメイン会話だけで、usage credits に入った瞬間に 5 分へ落ちます。モデル切替やスキルの `model:` 指定はキャッシュを作り直します。設定変更はセッション冒頭に寄せます(第1章、第11章)。
4. `.claude/commands/` はスキルに統合されました。`disable-model-invocation: true` で説明文のコンテキストコストをゼロにし、`allowed-tools` はそのターン限りの事前承認です。`!`コマンド`` の動的注入は一つ失敗すると本文全体が届きません(第2章)。
5. hooks は 33 イベント、5 種のハンドラ(command / http / mcp_tool / prompt / agent)。exit 2 だけがブロックで、exit 1 はブロックではありません。`onFailure: "block"`(v2.1.295+)でフェイルクローズにできます(第3章)。
6. サブエージェントの定義は managed > `--agents` > `.claude/agents` > `~/.claude/agents` > plugin の順で名前解決されます。非 fork のサブエージェントは CLAUDE.md は読むが会話は見ません。`isolation: worktree` で作業ツリーを分離できます(第4章)。
7. MCP の同名サーバーは Local > Project > User > Plugin > claude.ai コネクタの順でエントリ丸ごと採用。tool search は既定オンで、使わないツールの schema はロードされません。`.mcp.json` は `-p`、SDK、クラウドでは確認なしに読み込まれます(第6章)。
8. 権限ルールは deny → ask → allow の順で最初の一致が勝ち、Bash ルールはコマンド「テキスト」にしか一致しません(`/bin/rm` や `git -C . push` は素通り)。硬い保証はサンドボックスか hook に委ねます(第10章)。
9. 設定の優先順位は Managed > `--settings` > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`。リストキーはマージされます。`defaultMode: auto` や `bypassPermissions` は project / local からは無視されます(第10章)。
10. `claude -p` は `--bare` なしだとリポジトリの hooks と `.mcp.json` を信頼ダイアログなしで実行します。CI や他人のリポジトリで動かすときは `--bare`、`--restricted`、`--permission-prompts none`、`--max-budget-usd` を組み合わせます(第9章)。
11. Agent SDK は同梱の `claude` CLI をサブプロセスで駆動するラッパーで、パッチ番号が Claude Code の版と 1:1 対応(TS 0.3.302 / Python 0.2.168)。既定のシステムプロンプトは最小限で、`claude_code` preset を明示しないと Claude Code の安全指示は入りません(第8章)。
12. コストの観測はクライアント側の定価推定(`/usage`、`total_cost_usd`、`--max-budget-usd`)であり請求の真実ではありません。チームでは OpenTelemetry と Analytics ダッシュボードで見ます(第11章、付録A)。

#### 「AIのための仕組み」を作るときの基本形

Anthropic Engineering が示す 5 つの workflow パターン(prompt chaining、routing、parallelization、orchestrator-workers、evaluator-optimizer)は、Claude Code では次の部品に写像できます。

| パターン | Claude Code での実装部品 |
| - | - |
| Prompt chaining | スキルの連鎖、`/batch`、`claude -p` のパイプ |
| Routing | description で選ばれるスキルとサブエージェント、hooks の matcher |
| Parallelization | バックグラウンドサブエージェント、agent teams、worktrees、dynamic workflows の `parallel()` |
| Orchestrator-workers | dynamic workflows の `pipeline()`、Agent SDK の `agents` オプション |
| Evaluator-optimizer | `/goal`、Stop hook の品質ゲート、敵対的検証サブエージェント、`claude plugin eval` |

第13章でパターンの出典と実装規則を、第14章で 9 本のブループリント(自律 PR 修正ボット、知識ベース生成、リサーチハーネス、定期運用、Slack 連携、SDK 内製ツール、自己改善スキル、長時間タスク、並列開発)を扱います。


---

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


---

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


---

## 第3章 Hooks(フック)

### この章で分かること

Hooks は Claude Code のライフサイクル上の決まった時点で、ユーザーが定義したコマンド、HTTP エンドポイント、MCP ツール、あるいは別の Claude 評価を「確定的に」走らせる仕組みである。CLAUDE.md が「お願い」であるのに対し、hooks はモデルの判断を経由せずに実行される強制力を持つ。本章では 33 種のイベントと 5 種のハンドラ型、7 箇所の配置場所とそのマージ規則、マッチャーと `if` の評価規則、終了コードと stdout JSON の正確なプロトコル、`onFailure: "block"` によるフェイルクローズ、そして PreToolUse / PostToolUse / Stop / SessionStart / PermissionRequest などの主要イベントごとの決定フィールドを扱う。対象バージョンは v2.1.302 (2026-10-16) 時点の公式リファレンスとチェンジログに基づく。最後に落とし穴の一覧と、すぐ組める実用レシピをまとめる。

### 3.1 全体像: イベント、ハンドラ型、配置場所

#### 33 種のイベントと 3 つのケイデンス

公式リファレンスが列挙するイベントは以下の 33 種である。

- セッション単位: `SessionStart`, `Setup`, `SessionEnd`
- ターン単位: `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `StopFailure`
- ツール呼び出し単位: `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`
- 通知・表示: `Notification`, `MessageDisplay`
- subagent / agent team: `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`
- 環境・設定変更: `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`
- コンテキスト・モデル: `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`
- MCP elicitation: `Elicitation`, `ElicitationResult`

ケイデンスは 3 段階である。セッションごとに `SessionStart` と `SessionEnd`、ターンごとに `UserPromptSubmit` / `Stop` / `StopFailure`、agentic loop 内のツール呼び出しごとに `PreToolUse` / `PostToolUse` が発火する。例外として `EndConversation` ツールの呼び出しは PreToolUse / PostToolUse の両方をスキップする。

#### 5 種類のハンドラ型

| type | 動作 |
|---|---|
| `command` | シェルコマンドまたは実行ファイル。stdin に JSON、stdout / 終了コードで結果を返す |
| `http` | 同じ JSON を URL に POST し、レスポンスボディを同じ出力スキーマとして読む |
| `mcp_tool` | 設定済み MCP サーバーのツールを呼び、テキスト出力を command の stdout と同様に扱う |
| `prompt` | 単発の Claude 評価。`{ok, reason}` を返す |
| `agent` | Read / Grep / Glob を持つ subagent を起動(最大 50 ターン、実験的) |

マッチしたハンドラはすべて並列に実行される。同一ハンドラを複数の settings ファイルに定義した場合は一度だけ実行されるが、plugin や skill が持つ同一ハンドラは別物として扱われる。

#### イベントとハンドラ型の対応

全 5 型を受け付けるのは `PermissionDenied`, `PostToolBatch`, `PostToolUse`, `PostToolUseFailure`, `PreToolUse`, `Stop`, `SubagentStop`, `TaskCompleted`, `TaskCreated`, `TeammateIdle`, `UserPromptExpansion`, `UserPromptSubmit` の 12 イベント。`PermissionRequest` は `agent` 以外の 4 型(agent はエラーでスキップ、v2.1.280 以降)。`SessionStart` と `Setup` は `command` と `mcp_tool` のみで、しかも起動時の SessionStart と Setup では MCP サーバーが未接続のため `mcp_tool` は呼ばれずにスキップされる。それ以外(`Notification`, `SessionEnd`, `PreCompact`, `PostCompact`, `ConfigChange`, `FileChanged`, `WorktreeCreate` など)は `command` / `http` / `mcp_tool` の 3 型である。

#### 配置場所 7 箇所とスコープ

| 場所 | スコープ |
|---|---|
| `~/.claude/settings.json` | 全プロジェクト(cloud session では読まれない) |
| `.claude/settings.json` | プロジェクト、コミット対象 |
| `.claude/settings.local.json` | プロジェクト、gitignore 対象 |
| managed policy settings | 組織全体 |
| plugin の `hooks/hooks.json` | plugin 有効時 |
| skill frontmatter | skill 起動時に登録され、以後セッション終了まで持続(`once: true` を除く) |
| subagent frontmatter | その subagent の実行中のみ。`Stop` は `SubagentStop` に変換される |

skill frontmatter の hooks は起動したターン以降も走り続ける点に注意。`once: true` で初回成功後に除去できるが、このフィールドは skill frontmatter でのみ有効で、settings ファイルと agent frontmatter では無視される(失敗、exit 2 でのブロック、タイムアウトでは除去されない)。

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

SKILL.md の frontmatter に書く形式。subagent の `.md` でも同じ構造が使える。

#### マージ規則と disableAllHooks

settings の各レベルの hooks は置換ではなく加算でマージされる。user / project / local は managed の hooks を取り除けない。`"disableAllHooks": true` はそのレベル以下を無効化するが、settings の優先順位に従うので project の `false` が user の `true` を上書きする。`--settings '{"disableAllHooks": true}'` は project / local に勝つ。個別の hook を設定したまま無効化する手段はない。管理者は `allowManagedHooksOnly` で user / project / local / plugin の hooks を全面的に遮断できる(強制有効化された managed plugin は除く)。

### 3.2 マッチャーと if

#### マッチャーの評価規則

`matcher` の評価は含まれる文字で分岐する。

- `"*"`、`""`、省略: すべてにマッチ
- 英数字、`_`、`-`、空白、`,`、`|` のみ: 完全一致、または `|` / `,` 区切りのリスト(`Edit|Write`、`Edit, Write`)
- それ以外の文字を含む: アンカーなしの JavaScript 正規表現(`RegExp.prototype.test`)

正規表現パスは部分一致なので `Edit.*` は `NotebookEdit` にもマッチする。全体一致には `^Edit$` と書く。マッチャーは大文字小文字を区別し、マッチャー非対応イベントに書いても黙って無視される。`FileChanged` と `StopFailure` は完全一致文字集合が狭く(英数字、`_`、`|`)、ハイフンやカンマがあると正規表現パスに落ちる。

MCP ツールは `mcp__<server>__<tool>` という名前で、`mcp__memory__.*` のように `.*` が必須。`mcp__memory` だけでは完全一致扱いになり何にもマッチしない。plugin 同梱の MCP サーバーは `mcp__plugin_<plugin>_<server>__<tool>` という名前になるため、素のサーバー名で書いたマッチャーは発火しない。

#### イベントごとのマッチ対象

| イベント | matcher が比較する値 |
|---|---|
| PreToolUse / PostToolUse / PostToolUseFailure / PermissionRequest / PermissionDenied | ツール名 |
| SessionStart | `startup` / `resume` / `clear` / `compact` / `fork` |
| Setup | `init` / `maintenance` |
| SessionEnd | `clear` / `resume` / `logout` / `prompt_input_exit` / `other`(`bypass_permissions_disabled` は v2.1.234 で廃止) |
| Notification | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_*`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_*` |
| SubagentStart / SubagentStop | agent type(`general-purpose`, `Explore`, カスタム `name`, plugin は `my-plugin:reviewer`) |
| PreCompact / PostCompact | `manual` / `auto` |
| PreModelSwitch / PostModelSwitch | 正規化されたモデル名 |
| ConfigChange | `user_settings` / `project_settings` / `local_settings` / `policy_settings` / `skills` |
| DirectoryAdded | `slash_command` / `register_repo_root` |
| FileChanged | リテラルなファイル名 |
| StopFailure | エラー種別 |
| InstructionsLoaded | load reason |
| UserPromptExpansion | コマンド名 |
| Elicitation / ElicitationResult | MCP サーバー名 |

`UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `CwdChanged`, `MessageDisplay` にマッチャーはない。plugin の subagent 型 `my-plugin:reviewer` はコロンを含むので正規表現パスに入る。`^my-plugin:reviewer$` とアンカーすること。

#### if フィールド

`if` はハンドラ単位のフィルタで、permission rule 構文をちょうど 1 つだけ受け付ける(`"Bash(git *)"`、`"Edit(*.ts)"`)。`&&` / `||` / リストは存在せず、複数条件は別ハンドラに分ける。評価されるのはツール系 5 イベント(PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied)のみで、他のイベントに `if` を付けたハンドラは一切走らない。

Bash に対する `if` はベストエフォートである。先頭の `VAR=value` は剥がされ、`&&` チェーンの各サブコマンドが検査され、`$()` やバッククォートの中も見るが、`$()`、バッククォート、`$VAR` を含むコマンドでパターンがコマンド名より長い場合は hook が走る方に倒れる。パースできないコマンドも hook が走る。v2.1.214 以降 `"Edit(src/**)"` は `<cwd>/src` 配下のみを指し、任意深度には `"Edit(**/src/**)"` と書く。厳密な allow / deny は hooks ではなく permission rules で行う。

### 3.3 command フックの実行形態

`args` の有無で実行形態が変わる。`args` があれば exec 形式で、`command` は PATH 上の実行ファイルとして解決され、シェルを介さず直接 spawn される。各要素はトークン分解もクォート処理もされず 1 引数としてそのまま渡され、`${CLAUDE_PROJECT_DIR}` / `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` は単純な文字列置換になる。引数が不要でも `"args": []` と書けば exec 形式になる。`args` がなければ shell 形式(`sh -c`、Windows では Git Bash または PowerShell)で、変数展開、パイプ、`&&`、glob が使える。どちらの形式でも上記 3 つのプレースホルダは環境変数としても渡る。

exec 形式で `"command": "node script.js"` のように空白を含む 1 文字列を書くと spawn に失敗する(警告がログに出る)。Windows の exec 形式は実体が `.exe` である必要があり、npm の `.cmd` シム は起動できないので `node` + スクリプトパスにする。shell 形式ではパスプレースホルダを必ず二重引用符で囲む(`claude plugin validate` は未クォートの `${CLAUDE_PLUGIN_ROOT}` に警告を出す)。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json` に置く。`if` で rm 系以外ではプロセスすら起動せず、`args: []` で exec 形式にしてクォート問題を避ける。対になるスクリプトは次の通り。

```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command')
if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Destructive command blocked by hook"}}'
else
  exit 0
fi
```

`.claude/hooks/block-rm.sh`(`chmod +x` が必要)。JSON は `jq -n` で組み立て、文字列連結でのエスケープ漏れを防ぐ。

### 3.4 入出力プロトコル

#### stdin の共通フィールド

全イベント共通で `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`(v2.1.257+), `permission_mode`(`default` / `plan` / `acceptEdits` / `auto` / `dontAsk` / `bypassPermissions`。Manual は `default` として届く), `effort`(`level` は low / medium / high / xhigh / max), `hook_event_name` が入る。subagent 内または `--agent` セッションでは `agent_id` / `agent_type` が加わる。settings / managed / plugin の hooks は subagent 内でも同じように発火する。MCP ツールのツール系イベントには `mcp_server: {name, source}`(v2.1.274+)が付き、信頼判定は名前の接頭辞ではなく `source` で行うべきとされている。

`cwd` は Claude の現在位置に追従するが、`${CLAUDE_PROJECT_DIR}` は worktree 内でもセッション開始時のプロジェクトルートに固定される。`$CLAUDE_MODEL` という環境変数は存在しない。`$CLAUDE_CODE_REMOTE` は cloud で `true`、`$CLAUDE_EFFORT` に effort レベルが入る。hooks は親プロセスの環境を継承するが `OTEL_*` エクスポータ変数は除かれ、制御端末を持たないので `/dev/tty` への書き込みは失敗する。

#### 終了コード

| 終了コード | 意味 |
|---|---|
| 0 | 成功。stdout が JSON として解釈される |
| 2 | ブロッキングエラー。stderr が理由として使われる |
| それ以外 | 非ブロッキングエラー。動作は続行(`onFailure: "block"` を除く) |

exit 1 は Unix の慣習に反してブロックではない。ポリシー強制は exit 2 か JSON の deny で行う。exit 0 の stderr は Claude に見せられない。非 0 かつ非 2 の終了コードで有効な JSON を出力した場合、終了コードは無視され JSON だけが効く。逆に exit 2 は JSON が allow と言っていてもブロックする。`Stop` / `SubagentStop` / `TaskCompleted` と plugin の `UserPromptSubmit` では、stdout 空かつ stderr が `No such file or directory` の exit 2 は非ブロッキングに格下げされる(スクリプトパスの typo で永久ブロックを避けるため)。

#### exit 2 がブロックできるイベント

ブロック可能: `PreToolUse`(ツール呼び出し), `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `SubagentStop`, `TeammateIdle`, `TaskCreated`(ロールバック), `TaskCompleted`, `ConfigChange`(`policy_settings` 以外), `PostToolBatch`, `PreCompact`, `PreModelSwitch`, `Elicitation`(decline 扱い), `ElicitationResult`, `WorktreeCreate` / `WorktreeRemove`(非 0 全般が失敗扱い)。

ブロック不能: `PermissionRequest`(exit 2 は無視され、`decision` オブジェクトでのみ deny できる), `PostToolUse` / `PostToolUseFailure`(stderr は Claude に見せられるだけ), `StopFailure`, `PermissionDenied`, `Notification`, `Setup`, `SubagentStart` / `SessionStart` / `SessionEnd` / `CwdChanged` / `FileChanged` / `PostCompact` / `PostModelSwitch`(stderr はユーザーに表示のみ), `DirectoryAdded`, `InstructionsLoaded`, `MessageDisplay`。

#### onFailure: "block" によるフェイルクローズ(v2.1.295+)

既定では hook の失敗はフェイルオープンで、スクリプトが存在しない、クラッシュした、タイムアウトした、不正な JSON を吐いた、といったケースでは PreToolUse のツール呼び出しはそのまま通る。`"onFailure": "block"` を `command` / `http` ハンドラに付けると、これらの失敗がそのイベントでの exit 2 と同じ効果になる(PermissionRequest では deny)。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/check-command.js"],
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json`。失敗時のエラー文は `failed; blocking because onFailure is "block"` または `timed out`。非 0 / 非 2 の終了コードは、JSON で `permissionDecision: "allow"` を出していても失敗とみなされる。`Stop` / `SubagentStop` / `TaskCompleted` / `TeammateIdle`(exit 2 が「作業を続けろ」を意味するイベント)と `async` / `asyncRewake` ハンドラには効果がない。Agent SDK のコールバック hooks は例外で、PreToolUse / UserPromptSubmit でタイムアウトすると既定でフェイルクローズする。

#### stdout の解釈規則(exit 0)

- 1 つの JSON オブジェクト(1 行でも複数行でも)で周囲が空白のみ: JSON として解釈
- `{` で始まらない、または `{` で始まるが `}` で終わらない: プレーンテキスト(JSON 配列やクォート文字列もプレーンテキスト扱い)
- 各行が独立した JSON になる複数行: どの行も出力フィールドを持たなければプレーンテキスト、持てばパース失敗
- `{` で始まり `}` で終わるが JSON として不正: パース失敗(非ブロッキングエラー、`onFailure: block` なら失敗扱い。v2.1.248 以降はプレーンテキストに落ちず hook error として報告される)

プレーンテキストがコンテキストに追加されるのは `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `PostModelSwitch` のみで、他のイベントでは捨てられる。

#### 共通出力フィールド

| フィールド | 動作 |
|---|---|
| `continue` | `false` で Claude の処理を完全停止。イベント固有の決定より優先 |
| `stopReason` | `continue: false` のときユーザーに表示され、会話に残る |
| `suppressOutput` | 受理されるが何もしない(成功時の stdout はもともと表示されない) |
| `systemMessage` | ユーザーに警告として表示 |
| `terminalSequence` | 許可リスト内の OSC 0/1/2/9/99/777 または BEL を Claude Code の端末出力経路で発行 |

`continue: false` は `TaskCreated` と `TaskUpdate` 起点の `TaskCompleted` で明示的に無視され、`Notification`, `Setup`, `SessionEnd`, `PreCompact`, `PostCompact`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `MessageDisplay`, `ConfigChange`, `InstructionsLoaded`, `Elicitation`, `WorktreeCreate` でも捨てられる。PreToolUse / PostToolUse からの `continue: false` は、ツールが失敗した場合やストリーミング中に完了した場合にも停止が適用される。

`additionalContext`, `systemMessage`, `initialUserMessage` とプレーン stdout は hook ごとに各 10,000 文字で打ち切られ、超過分はセッションディレクトリのファイルに保存されて 2,000 文字のプレビューとパスだけが渡る(Claude に読めとは指示されない)。Bash 出力上限と違いこの上限を上げる設定はない。`additionalContext` は必ず `hookSpecificOutput` の中に `hookEventName` と並べて書く。トップレベルに置くと黙って無視され、`--debug` ログの `Hook JSON output had unrecognized keys` でしか気付けない。`additionalContext` の文面は命令形のシステム指示ではなく事実の陳述として書く。「system がこう命じる」という体裁の文はプロンプトインジェクション防御に引っかかり、Claude がコンテキストとして使う代わりにユーザーに「こんな文が注入された」と報告してしまう。`<system-reminder>` タグは v2.1.292 以降エスケープされる。

#### イベント別の決定フィールド

| イベント | 決定の書き方 |
|---|---|
| UserPromptSubmit, UserPromptExpansion, PostToolUse, PostToolUseFailure, PostToolBatch, Stop, SubagentStop, ConfigChange, PreCompact | トップレベル `decision: "block"` + `reason` |
| PreToolUse | `hookSpecificOutput.permissionDecision`(allow / deny / ask / defer)+ `permissionDecisionReason` + `updatedInput` + `additionalContext`。旧 `decision: approve\|block` は非推奨だが allow / deny にマップされる |
| PreModelSwitch | `permissionDecision`(allow / deny / ask)または `decision: block`。`defer` / `updatedInput` / `additionalContext` は不可 |
| PermissionRequest | `hookSpecificOutput.decision.behavior`(allow / deny)+ `updatedInput` / `updatedPermissions` / `message` / `interrupt` |
| PermissionDenied | `hookSpecificOutput.retry: true` |
| TeammateIdle, TaskCompleted | exit 2 または `continue: false` |
| TaskCreated | exit 2 または `decision: block`(`continue: false` は無視) |
| Elicitation, ElicitationResult | `action`(accept / decline / cancel)+ `content` |
| MessageDisplay | `displayContent` |
| SessionStart | `additionalContext`, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills` |

#### タイムアウト

既定値は `command` / `http` / `mcp_tool` が 600 秒、`prompt` が 30 秒、`agent` が 60 秒。`UserPromptSubmit` / `PreModelSwitch` / `PostModelSwitch` では command 系が 30 秒、`MessageDisplay` では 10 秒に下がる。`SessionEnd` は全 hooks で 1.5 秒の予算を共有し、settings ファイル内の hook の `timeout` の最大値(plugin は数えない、上限 60 秒)または `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`(v2.1.268 以降は per-hook 既定値にもなる)で延ばせる。`async: true` の command hook にはタイムアウトが適用されないが、`asyncRewake` には適用される。タイムアウトした command / http / mcp_tool hook は出力を捨てられ、PreToolUse ではツール呼び出しが通り(`onFailure: block` を除く)、PreModelSwitch では逆に切り替えがブロックされる。

### 3.5 主要イベントの詳細

#### PreToolUse

すべての permission mode のチェックより前に発火し、`bypassPermissions` や `--dangerously-skip-permissions` でも hook の deny は効く。逆方向は成り立たず、hook の `allow` は対話プロンプトを飛ばすだけで deny / ask ルール(managed の deny リスト含む)、ネットワークパス(UNC)の読み取り、`requiresUserInteraction` な MCP ツール、組織が `ask` に設定したコネクタツールの制約は残る。plan mode では hook の allow があっても通常の plan mode プロンプト / ブロックが掛かる(v2.1.299 で修正)。hook の `ask` は auto mode でもプロンプトを強制する(v2.1.211 以降、classifier は deny できるが黙って承認はできない)。

複数の PreToolUse hook が異なる決定を返したときの優先順位は deny > defer > ask > allow。全 hook は並列に最後まで走るので、deny が出ても兄弟 hook の副作用(ログ書き込みなど)は抑止されない。`updatedInput` を複数 hook が返すと最後に終わったものが非決定的に勝つため、1 ツールにつき書き換え hook は 1 つに限る。

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

PreToolUse command hook が stdout に出す JSON。`updatedInput` は入力オブジェクト全体を置換するので変更しないフィールドも含める。permission rules と Bash の auto-background 判定は書き換え後の入力に対して再評価される。v2.1.300 以降は Claude 自身の入力と同様に検証され、未知のキーは落とされ、ツールが拒否する入力なら呼び出しは deny される。`AskUserQuestion` と `ExitPlanMode` は `allow` だけでは不十分で、`updatedInput` に回答(`answers` マップなど)を載せる必要がある。`ExitPlanMode` の `tool_input` には Claude Code が `plan` と `planFilePath` を注入してから hook に渡す。

`permissionDecisionReason` の行き先は決定ごとに異なる。`ask` ではユーザーへのプロンプトに表示され(`-p` で答える人がいない場合は Claude がツール結果で読む)、`deny` では Claude に、`allow` / `defer` ではデバッグログのみ。`ask` プロンプトには `[settings]` / `[plugin:<name>]` / `[skill]` という出所ラベルが付く。

`defer` は `-p` モード専用で、1 ターンに単一のツール呼び出しがあるときだけ機能する。プロセスは `stop_reason: "tool_deferred"` と `deferred_tool_use` {id, name, input} を返して終了し、呼び出し側は `claude -p --resume <id>` で再開する。再開時に PreToolUse が再び発火し、hook が allow + `updatedInput` を返す。複数ツール呼び出しのバッチでは警告とともに無視される。再開期限はなく、セッションは `cleanupPeriodDays`(既定 30 日)の範囲で残る。

発火しないケースにも注意する。`@file` でプロンプトに添付したファイルはプロンプト構築時に挿入されるのでツール呼び出しがなく、`Read` にマッチする hook も走らない。強制したければ Read の deny ルールか `CLAUDE_CODE_DISABLE_FILE_MENTIONS=1`(v2.1.299+、シェル / user settings / managed settings でのみ有効で project / local settings では無視)を使う。スキーマ不正や未知ツールの検証却下では PreToolUse も PostToolUseFailure も発火しない。ファイル系ツールの `tool_input.file_path` は `~` や相対パスが展開済みの絶対パスで届くので、表記ゆれで迂回されることはない。Windows では Git Bash 下でもバックスラッシュ区切りで届くため、`FILE_PATH="${FILE_PATH//\\//}"` で正規化してからマッチさせる。

```bash
#!/bin/bash
# protect-files.sh

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Normalize Windows backslash separators so the patterns below match
FILE_PATH="${FILE_PATH//\\//}"

PROTECTED_PATTERNS=(".env" "package-lock.json" ".git/")

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "Blocked: $FILE_PATH matches protected pattern '$pattern'" >&2
    exit 2
  fi
done

exit 0
```

`.claude/hooks/protect-files.sh`。登録は `{"hooks":{"PreToolUse":[{"matcher":"Edit|Write","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"}]}]}}`。exit 2 でブロックし、stderr の行が Claude へのフィードバックになる。

#### PostToolUse / PostToolBatch

PostToolUse はツール実行後に発火するため、ファイル書き込みやネットワーク送信はすでに完了している。出力で変えられるのは Claude に見える内容だけである。

| フィールド | 動作 |
|---|---|
| `updatedToolOutput` | ツールの出力形状に一致する値で Claude に見せる結果を置換。組み込みツールで形状不一致なら無視、MCP ツールは無検証で通る |
| `updatedMCPToolOutput` | MCP ツール専用の置換。`updatedToolOutput` の使用が推奨 |
| `additionalContext` | ツール結果の隣に注入 |
| `classifierContext` | auto mode の classifier への注記(v2.1.236+、1 呼び出しあたり全 hook 合計 2,000 文字、async からは無視) |
| `decision: "block"` + `reason` | 元の出力は隠さず、理由を Claude に付ける |

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Additional information for Claude",
    "updatedToolOutput": {
      "stdout": "[redacted]",
      "stderr": "",
      "interrupted": false,
      "isImage": false
    }
  }
}
```

Bash の出力形状は `{stdout, stderr, interrupted, isImage}`。telemetry は元出力をすでに記録している。

`Edit|Write` にマッチする PostToolUse は、Bash コマンドや外部プロセスがファイルを書き換えた場合には発火しない。それを拾うには `FileChanged` を使うか、`Bash|PowerShell` にマッチして `git status --porcelain` を見る。v2.1.269 以降、`bashEditDiffEnabled` を有効にすると Bash の `tool_response.bashEditDiff` に `changedFiles`(最大 200 件)、`files`(最大 5 ファイルの差分)、`moreFiles`、`skipped`、`shared` などが入る(public beta、形状変更の可能性あり、レビュー補助用でポリシー強制には使わないとされる)。入力には `duration_ms` も含まれる。

`Agent` ツールの PostToolUse には subagent の実行情報が `tool_response` に入る。`status`(`completed` / `async_launched`)、`agentId`、`content`、`resolvedModel`、`totalTokens`(最終 API リクエストのみ)、`totalDurationMs`、`totalToolUseCount`、`usage` など。親に subagent の結果を踏まえたコンテキストを注入するにはここを使う。

PostToolBatch は並列ツールバッチごとに 1 回発火し、`tool_calls` 配列を受け取る。各要素の `tool_response` は PostToolUse の構造化出力ではなく、モデルが見るシリアライズ済み `tool_result`(Read なら行番号付きテキスト)である。`decision: "block"` または `continue: false` で次のモデル呼び出し前に agentic loop を止められる。

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json`。Edit / Write 後に Prettier を掛ける最小形。成功時はトランスクリプトに何も出ない。

#### UserPromptSubmit / UserPromptExpansion

UserPromptSubmit はプロンプトを書き換えられない。できるのはブロック(`decision: "block"`、`reason` / stderr がユーザーに表示)、`additionalContext` の追加、`sessionTitle` の設定、`suppressOriginalPrompt` である。既定タイムアウトが 30 秒なのはモデル処理をブロックするためで、タイムアウトすると出力ごと捨てられてプロンプトは Claude に届く(`onFailure: block` を除く)。スケジュールタスク、バックグラウンド subagent の報告、クロスセッションメッセージでも発火する。v2.1.299 以降は skill / カスタムスラッシュコマンドの展開前に走るので、hook は `/skill args` を入力されたまま見るし、ブロックすれば skill 内の `` !`cmd` `` 注入も止まる。skill 自身の frontmatter にある UserPromptSubmit hook は、skill を起動したプロンプトの次のプロンプトから走る。ブロックされたプロンプトもディスク上のトランスクリプトには残る(`suppressOriginalPrompt` でも prompt history には残る)。

UserPromptExpansion は PreToolUse が取りこぼす経路を埋める。`Skill` ツールにマッチする PreToolUse は Claude がツールを呼んだときだけ発火し、ユーザーが `/skillname` を直接入力した場合は発火しない。UserPromptExpansion は `command_name` にマッチし、入力には `expansion_type`(`slash_command` / `mcp_prompt`)、`command_args`、`command_source`、`prompt` が入り、`decision: block` または `additionalContext` を返せる。

#### PermissionRequest / PermissionDenied

PermissionRequest は Claude Code がプロンプトを出す直前(非対話セッションで auto-deny する直前)にのみ発火する。exit 2 は無視され、`hookSpecificOutput.decision.behavior` の allow / deny だけが効く。`updatedInput` で入力を書き換え、`updatedPermissions` で `addRules` / `replaceRules` / `removeRules` / `setMode` / `addDirectories` / `removeDirectories` を `session` / `localSettings` / `projectSettings` / `userSettings` に適用できる。入力の `permission_suggestions` は同じスキーマなのでそのまま `updatedPermissions` に返せる。`setMode` で `bypassPermissions` にするのはセッションが bypass 可能で起動した場合のみ有効で、`defaultMode` には永続化されない。Cowork cloud session では `setMode` が無視され(v2.1.300)、auto mode ではシェルコマンドや subagent を承認できない(v2.1.299)。`--permission-prompt-tool` や SDK の `canUseTool` ホストがある場合は hook と並走し、先に決めた方が適用される。

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedPermissions": [
        { "type": "setMode", "mode": "acceptEdits", "destination": "session" }
      ]
    }
  }
}
```

ExitPlanMode を自動承認して `acceptEdits` に切り替える出力。登録は `{"hooks":{"PermissionRequest":[{"matcher":"ExitPlanMode","hooks":[{"type":"command","command":"echo '{\"hookSpecificOutput\": {\"hookEventName\": \"PermissionRequest\", \"decision\": {\"behavior\": \"allow\"}}}'"}]}]}}`。マッチャーは可能な限り狭く保つ。空や `.*` にするとファイル書き込みもシェルコマンドも全部自動承認される。

PermissionDenied は auto mode の classifier が deny したときだけ発火し、手動 deny、PreToolUse のブロック、deny ルール一致では発火しない。`hookSpecificOutput.retry: true` でモデルに再試行を許可できる(verdict なしの deny では無視)。exit code と stderr は無視され、prompt / agent hook は走るが出力は捨てられる。

#### Stop / SubagentStop

Stop はタスク完了時ではなく「ターンが終わるたび」に発火する。ユーザー割り込みでは発火せず、API エラーは `StopFailure` になる。入力には `stop_hook_active`(すでに Stop hook による継続中なら true)、`last_assistant_message`、`background_tasks`、`session_crons` が入る。無限ループ防止のため `stop_hook_active` を必ず確認し、最終メッセージは非同期書き込みで遅延する `transcript_path` ではなく `last_assistant_message` から取る。`background_tasks`(`shell` / `subagent` / `monitor` / `workflow` / `teammate` / `cloud session` / `MCP task`)と `session_crons` を見れば「完了」と「バックグラウンド待ち」を区別できる。

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop
fi
# ... rest of your hook logic
```

公式のループガード。この後に `if [ -n "$(git status --porcelain)" ]; then echo 'Uncommitted changes remain. Commit before finishing.' >&2; exit 2; fi` のような条件を足すと、exit 2 が「stderr を次の指示として作業を続けろ」になる(この拡張部分は公式サンプルではなく、文書化された exit 2 セマンティクスに基づく構成)。Claude Code は連続 8 回の継続で次のブロックを無視してターンを終える。カウンタは Claude がツールを呼ぶたびにリセットされ、上限は `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` で上げられる。`hookSpecificOutput.additionalContext` を Stop で返すと、エラー表示なしの「Stop hook feedback」として同じループ保護下で会話が続く。`/goal` はこれをセッション限定の prompt hook として組み込んだものである。

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

prompt 型による完了判定。`$ARGUMENTS` は hook 入力 JSON に置換される。条件が原理的に満たせない場合はモデルが `impossible: true` を返してターンを終えられる。

SubagentStop は `agent_transcript_path`、`last_assistant_message`、親セッション由来の `background_tasks` / `session_crons` を受け取り、Stop と同じ決定方式を使う。Claude Code 内部の agent(プロンプト提案、`/btw`)でも空の `agent_type` で発火するので、特定マッチャーは拾わないが空 / `*` / 空にマッチする正規表現は拾う。auto mode(v2.1.271+)で `SubagentHandback` を使う subagent の報告は `last_assistant_message` ではなくそのツールの `tool_input.message` に入る。SubagentStart は subagent への `additionalContext` 注入に使え、同じ subagent の再開時にはすでに持っていれば再注入せずプロンプトキャッシュを保つ。subagent の結果を親に注入したいなら `Agent` ツールの PostToolUse を使う。

#### SessionStart と CLAUDE_ENV_FILE

マッチャーは `startup` / `resume` / `clear` / `compact` / `fork`(fork は v2.1.214 以前は `resume` と報告)。起動時、`--continue` / `--resume`、`/clear` ではバックグラウンドで走り、Claude の最初の応答はそれを待ち、その間に入力されたプロンプトは保留される(Esc で取り戻せる)。セッション内 `/resume` は hooks を待つ。resume / fork では `seconds_since_last_response`、`context_tokens`、`prompt_cache_likely_expired`、`estimated_cache_write_usd`(v2.1.251+)も届く。`model` は `/clear` 後などで欠けることがある。

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Current branch: feat/auth-refactor\nUncommitted changes: src/auth.ts, src/login.tsx\nActive issue: #4211 Migrate to OAuth2",
    "sessionTitle": "auth-refactor"
  }
}
```

コンテキストだけ足すなら JSON を組まずプレーンテキストを print するだけでも Claude のコンテキストに入る。`sessionTitle` は startup / resume / fork でのみ適用。compaction 後に指示を再注入するには `"matcher": "compact"` のグループで `echo 'Reminder: use Bun, not npm. Run bun test before committing. Current sprint: auth refactor.'` のように出す。`initialUserMessage` は `-p` のみ。`reloadSkills: true` を返すと hooks 完了後に skill ディレクトリを再スキャンするので、hook がインストールした skill を同じセッションで使える。

```bash
#!/bin/bash

git -C ~/.claude/skills/team-skills pull --quiet 2>/dev/null || \
  git clone --quiet https://git.example.com/your-org/team-skills.git ~/.claude/skills/team-skills

echo '{"hookSpecificOutput": {"hookEventName": "SessionStart", "reloadSkills": true}}'
```

チーム共有 skill リポジトリを SessionStart で同期する公式例。

`CLAUDE_ENV_FILE` は `SessionStart`, `Setup`, `CwdChanged`, `FileChanged` の 4 イベントでのみ利用でき、`export NAME=value` 行を追記(`>>`)すると以後のすべての Bash コマンドの前に source される。CwdChanged / FileChanged で書いた変数は次の CwdChanged でクリアされる。PowerShell で実行される hook はこの変数を持たず、PowerShell ツールのコマンド側が変数を受け取るのはファイルの全行が単純代入(`$PATH` 参照、`source`、`$'...'` なし)の場合だけ(v2.1.296+)。v2.1.295 で `/resume` / `/branch` 後も変数が残るよう修正された。

```bash
#!/bin/bash

ENV_BEFORE=$(export -p | sort)

# Run your setup commands that modify the environment
source ~/.nvm/nvm.sh
nvm use 20

if [ -n "$CLAUDE_ENV_FILE" ]; then
  ENV_AFTER=$(export -p | sort)
  comm -13 <(echo "$ENV_BEFORE") <(echo "$ENV_AFTER") >> "$CLAUDE_ENV_FILE"
fi

exit 0
```

環境の差分だけを書き出す公式パターン。単純には `echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"` でよい。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "direnv export bash > \"$CLAUDE_ENV_FILE\""
          }
        ]
      }
    ],
    "CwdChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "direnv export bash > \"$CLAUDE_ENV_FILE\""
          }
        ]
      }
    ]
  }
}
```

`~/.claude/settings.json`。各 `.envrc` ディレクトリで `direnv allow` しておく。`direnv export bash` は `$'...'` を含むので PowerShell ツールには変数が渡らない。

#### Notification

副作用専用のイベントで、`systemMessage` / `continue` は捨てられ `terminalSequence` だけが効く。`permission_prompt` はプロンプト表示から約 6 秒間キー入力がないと発火し(端末ではキー入力ごとに延期、Claude Desktop / VS Code では延期なしで 6 秒後、先に答えれば発火しない)、`idle_prompt` は Claude 完了から約 60 秒後、バックグラウンド agent がないときだけ発火する(v2.1.288 で修正)。権限要求に即時反応したいなら PermissionRequest を使う。desktop 通知を `preferredNotifChannel` で切っていても hooks は発火する。

```bash
#!/bin/bash
# Notification hook: ping the desktop when Claude Code needs attention.
input=$(cat)
title="Claude Code"
body=$(jq -r '.message // "Needs your attention"' <<<"$input")
seq=$(printf '\033]777;notify;%s;%s\007' "$title" "$body")
jq -nc --arg seq "$seq" '{terminalSequence: $seq}'
```

hooks には `/dev/tty` がないため、エスケープシーケンスを返して Claude Code 側に出させる(対話セッションのみ)。OS ネイティブなら macOS `osascript -e 'display notification "Claude Code needs your attention" with title "Claude Code"'`、Linux `notify-send 'Claude Code' 'Claude Code needs your attention'`。

#### FileChanged / ConfigChange / PreModelSwitch / PreCompact

FileChanged のマッチャーは `|` で分割され、各要素が作業ディレクトリ内のリテラルファイル名として監視リストに登録されると同時に hook グループのフィルタとしても使われる。正規表現は役に立たず(`^\.env` はその名前のファイルを監視する)、`*` は `*` という名前のファイルを登録する。監視は誰かがファイル名を指定して初めて開始されるので、最低 1 ファイルを名指しした FileChanged グループか `watchPaths` を返す SessionStart hook で種を撒く。Edit / Write だけでなく Bash や外部プロセスによる変更でも発火し、hook 自身がファイルを書き換えると再発火するため自己ループに注意する。

```bash
#!/bin/bash
FILE=$(jq -r .file_path)
if grep -q $'\r$' "$FILE"; then
  perl -pi -e 's/\r$//' "$FILE"
fi
```

`"matcher": "data.csv"` の FileChanged に登録する公式例。`grep` が perl の除去対象と同じものを検査しているので、正規化後の再発火では書き換えずに終わる。緩いガードだと `perl -i` が置換なしでも書き換えるため永久ループになる。

ConfigChange は settings ファイル、managed-settings.json / managed-settings.d、`.claude/skills` の変更で発火し、`policy_settings` 以外は exit 2 または `decision: block` で変更を拒否できる。ただしブロックしてもユーザーにも Claude にもメッセージは出ず、`reason` は受理されるが表示されない。

PreModelSwitch(v2.1.251+)は `/model`、ピッカー、`/config` のモデル設定、fast mode の切り替え、SDK / Remote Control の `set_model` で発火し、自動フォールバックや resume 時の復元では発火しない。入力に `from_model`、`to_model`、`requested_model`、`source`(`command` / `picker` / `sdk`)、`context_tokens`、`prompt_cache_warm`、`cache_ttl`、`estimated_cache_write_usd` が入る。優先順位は deny > ask > allow で、タイムアウトは切り替えブロックになる。正規化名が不明(ゲートウェイ独自 ID)な場合は全 hook がマッチャー無関係に走るため、ブロックする hook は `to_model` を自分で確認する。PostModelSwitch はセッションのモデルが実際に変わった場合(自動フォールバック、`opusplan` の plan mode 出入り、resume 復元、ユーザー切り替え)に発火し、フォールバックチェーンが 1 ターンだけ代替した場合は発火しない。

```json
{
  "hooks": {
    "ConfigChange": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{timestamp: now | todate, source: .source, file: .file_path}' >> ~/claude-config-audit.log"
          }
        ]
      }
    ],
    "PreModelSwitch": [
      {
        "matcher": "claude-opus-4-6",
        "hooks": [
          {
            "type": "command",
            "command": "jq -e '.to_model | test(\"opus-4-6\")' > /dev/null && { echo 'Opus 4.6 is retired for this project. Use a newer model.' >&2; exit 2; }; exit 0"
          }
        ]
      }
    ]
  }
}
```

設定変更の監査ログと特定モデルへの切り替え拒否。

PreCompact は `trigger`(`manual` / `auto`、auto は idle compaction も含む)と `custom_instructions` を受け取り、exit 2 でブロックできる。auto をブロックした結果は 2 通りで、コンテキスト上限前の先回り compaction ならスキップして続行、API がすでに上限エラーを返した回復用 compaction ならそのエラーが表面化してリクエストが失敗する。PostCompact は `compact_summary` を受け取る。

#### WorktreeCreate / WorktreeRemove / Elicitation / MessageDisplay / agent team

WorktreeCreate は `--worktree`、`EnterWorktree`、subagent の `isolation: worktree`、workflow、background session、Remote Control の worktree mode で発火し、Claude が Bash で `git worktree add` を打った場合は発火しない。hook は git worktree の既定動作を完全に置き換えるので `.worktreeinclude` は処理されず、`.env` のコピーも hook 内で行う。command hook の stdout の最後の非空行(ANSI 除去後)が worktree パスになり、非 0 終了は作成失敗。`.`/`..` を含む絶対パスやリポジトリ内のシンボリックリンクを通るパスは拒否される。WorktreeRemove はディレクトリ削除もブランチ掃除も hook の責任で、exit 0 で削除済みとみなし、非 0 はディレクトリが残っている場合だけ失敗。subagent / workflow 用に作った worktree は保持され remove hook は呼ばれない。`ExitWorktree` は hook 作成の worktree を `discard_changes: true` なしでは除去しないため、未コミット作業の確認は hook 側で行う。

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
    ],
    "WorktreeRemove": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'jq -r .worktree_path | xargs rm -rf'"
          }
        ]
      }
    ]
  }
}
```

SVN リポジトリ向けの公式例。create 側は svn の出力を stderr に逃がし、パスだけを stdout の最終行にする。

Elicitation は MCP サーバーのフォーム(`requested_schema`)または URL 要求に対して `action: accept` + `content` で自動回答、decline、cancel できる。マッチャーは MCP サーバー名。exit 2 または `decision: block` は decline になる(v2.1.105 から v2.1.284 まで無視されていた)。ElicitationResult はユーザーの回答を書き換え / ブロックできるが、decline / cancel 時にも発火して hook の `action` がユーザーのものを置き換えるので、入力の `action` が accept であることを確認してから accept を返す。`content` はオブジェクト全体を置換する。

```bash
#!/bin/bash
input=$(cat)
fields=$(jq -c '.requested_schema.properties // {} | keys' <<<"$input")

if [ "$fields" = '["project_key"]' ]; then
  jq -n '{hookSpecificOutput: {hookEventName: "Elicitation", action: "accept", content: {project_key: "DOCS"}}}'
fi
```

`"matcher": "issue-tracker"` の Elicitation に exec 形式で登録する公式例。フォームの唯一のフィールドが `project_key` のときだけ答え、それ以外は何も出さずダイアログに任せる。

MessageDisplay はストリーミング中のアシスタントテキストを表示専用に変換する(完了行のバッチごと、`-p` / SDK ではメッセージごとに 1 回)。入力は `turn_id`、`message_id`、`index`、`final`、`delta`。トランスクリプトと Claude が見る内容は元のままで、verbose 表示では元テキストが出る。終端判定は `final` で行う。

```bash
#!/bin/bash
jq '{hookSpecificOutput: {hookEventName: "MessageDisplay", displayContent: (.delta | gsub("\\*\\*"; "") | gsub("`"; ""))}}'
```

Markdown の太字とバッククォートを表示から除く公式例。exec 形式でマッチャーなしで登録する。

agent team 系では `TaskCreated`(exit 2 または `decision: block` で作成をロールバック)、`TaskCompleted`(exit 2 で完了を拒否、teammate のターン終了起点なら `continue: false` で teammate を停止、`TaskUpdate` 起点なら `continue: false` は無視)、`TeammateIdle`(exit 2 で idle を拒否し stderr をモデルに渡す)が品質ゲートになる。入力には `task_id`、`task_subject`、`task_description`、`teammate_name`、`agent_id`(v2.1.290+)が入り、`team_name` は非推奨。`onFailure` が無効なのは `Stop` / `SubagentStop` / `TaskCompleted` / `TeammateIdle` で、`TaskCreated` には効く。TaskCreated は Task ツールのないセッションでは発火しない。

### 3.6 prompt / agent / http / mcp_tool

#### prompt と agent

prompt hook は `$ARGUMENTS` を hook 入力 JSON で置換した文面(なければ末尾に付加)を単発評価し、`{ok, reason, impossible}` を返す。`\$1.00` のようにバックスラッシュでリテラルのドル記号を書ける。既定モデルはバックグラウンド機能用モデルで `model` で上書きできる。`ok: false` の効果はイベントごとに異なる。

- `Stop` / `SubagentStop`: `reason` が次の指示として渡される。`impossible: true` ならターン終了を許可
- `PreToolUse`: deny され、既定ではターンが終わり理由が警告行に出る(v2.1.210 以前はターン継続)。`continueOnBlock: true` で理由をツールエラーとして Claude に返し継続
- `PostToolUse` / `PostToolBatch` / `UserPromptSubmit` / `UserPromptExpansion`: ターン終了(後三者は `continueOnBlock` でも変わらない)
- `PostToolUseFailure` / `TaskCreated`: ツールエラーとして継続
- `TeammateIdle`、teammate 停止起点の `TaskCompleted`: 既定で teammate を止め、`continueOnBlock: true` で続行
- `PermissionRequest` / `PermissionDenied`: 効果なし

v2.1.294 で「Block commands that...」のような命令文で書いた prompt / agent hook が本来ブロックすべきものを通していた問題が修正された。v2.1.302 以降、同一イベントで同時に走る prompt / agent hook は 12 個までで残りは待機する。

agent hook は実験的で、Read / Grep / Glob を持つ subagent を最大 50 ターン、既定 60 秒で動かす。`continueOnBlock` と `impossible` はなく、`ok: false` は常に `continueOnBlock: true` 相当で扱われる。PermissionRequest では使えない。v2.1.300 で `model` が無視される問題が修正された(エイリアス解決、利用不可モデルは呼び出し側のモデルにフォールバック)。公式は本番用途に command hook を推奨している。

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

agent 型でテスト通過を検証する公式例。

#### http

`Content-Type: application/json` で同じ JSON を POST する。2xx + JSON は解釈、2xx + 空は成功、2xx + プレーンテキスト、非 2xx、接続失敗はすべて非ブロッキングエラー(テキストはコンテキストに入らない)。`headers` の `$VAR` / `${VAR}` 展開は `allowedEnvVars` に列挙した変数だけで、それ以外は空文字になる。managed の `allowedHttpHookUrls` と `httpHookAllowedEnvVars` が全ソースを制限し、読めない場合は何も許可しない(v2.1.267)。エンドポイント停止時にブロックしたければ `onFailure: "block"` を付ける。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hooks/pre-tool-use",
            "timeout": 30,
            "headers": {
              "Authorization": "Bearer $MY_TOKEN"
            },
            "allowedEnvVars": ["MY_TOKEN"]
          }
        ]
      }
    ]
  }
}
```

ローカルのポリシーサーバーに Bash 呼び出しを問い合わせる構成。

#### mcp_tool

`input` の文字列値で `${tool_input.file_path}` のように hook 入力からのパス置換ができる。ブロッキングイベントでは接続中のサーバーを MCP_TIMEOUT まで待つが、OAuth は開始しないので `/mcp` で先に認証する。`isError: true` は非ブロッキングエラー。plugin 同梱サーバーは `"server": "plugin:<plugin>:<server>"` と書く。

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "mcp_tool",
            "server": "my_server",
            "tool": "security_scan",
            "input": { "file_path": "${tool_input.file_path}" }
          }
        ]
      }
    ]
  }
}
```

書き込み後に MCP サーバーのスキャンツールを呼ぶ構成。

### 3.7 async と asyncRewake

`async: true`(command のみ)はブロックできず、`additionalContext` / `systemMessage` は次のターンに届き、ユーザーには表示されない。JSON は stdout に単独で(v2.1.295 以降は複数行可)または `jq -c` で 1 行に出す。型の合わないフィールドは落とされる(`--debug` で確認可能)。`classifierContext` は無視される。`-p` モードでは終了時に走っている async hook は kill される(outcome `cancelled`)ので、セッションより長生きさせたい処理は完全にデタッチする。完了通知は verbose(Ctrl+O / `--verbose`)でしか見えない。`asyncRewake` は加えて exit 2 で即座に Claude を起こし、stderr(空なら stdout)を system reminder として渡す。v2.1.287 でスクリプトが存在しないときに無限に起こし続ける問題が修正された。

```bash
#!/bin/bash
# run-tests-async.sh

# Read hook input from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only run tests for source files
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then
  exit 0
fi

# Run tests and report results to Claude via additionalContext
RESULT=$(npm test 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  MSG="Tests passed after editing $FILE_PATH"
else
  MSG="Tests failed after editing $FILE_PATH: $RESULT"
fi
jq -nc --arg msg "$MSG" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $msg}}'
```

登録は `{"hooks":{"PostToolUse":[{"matcher":"Write|Edit","hooks":[{"type":"command","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/run-tests-async.sh","args":[],"async":true}]}]}}`。テストを待たずに Claude が進み、結果は次ターンに注入される。

同期 hook の中からバックグラウンドプロセスを起動する場合は、決定を先に print し、そのプロセスの stdout / stderr を必ずリダイレクトする。リダイレクトしないと Claude Code は `refusing to honor the suspect capture` でツール呼び出しをブロックする。形としては `policy-check.sh || exit $?` の後に `upload-metrics.sh >/dev/null 2>&1 &`。v2.1.285 以降、hook プロセス自身の終了後まもなく出力読み取りが打ち切られるのでデーモンがセッションをハングさせることはない。

### 3.8 セキュリティとワークスペース信頼

command hook はツールがサンドボックス化されていてもサンドボックス外で、ユーザーの全権限で実行される。公式の推奨は入力の検証、シェル変数の必ずクォート(`"$VAR"`)、`..` によるパストラバーサルの拒否、絶対パスの使用(exec 形式ならクォート不要)、`.env` / `.git/` / 鍵ファイルの回避である。

ワークスペース信頼は対話セッションでのみ settings ファイルの hooks を門番するが、`-p` / SDK セッションはダイアログを出さずフォルダを信頼済みとして扱う。つまり他人のリポジトリで `claude -p` を回すと、コミットされた `.claude/settings.json` の hooks が承認なしに走る。対策は `.claude/` を先に読む、`--bare` を使う、`--settings '{"disableAllHooks": true}'` を渡す、のいずれか。project の subagent frontmatter hooks はより厳格で、そのフォルダの信頼ダイアログを受け入れた後にしか走らない(v2.1.218+、`-p` は該当しない)。project の skill frontmatter hooks は settings ファイルと同じ規則で `-p` でも走る。`claude --bg` は v2.1.281 以降、先に信頼を尋ねる。

`updatedInput` 経由で入力を書き換えた後に一部の permission rule と安全チェックが適用されない問題(v2.1.290 で修正)、PreToolUse の allow と auto mode が UNC パス読み取りのプロンプトを迂回する問題(v2.1.292 で修正)、PreToolUse auto-allow hook がバックグラウンド agent タスクのツール制限を迂回する問題(v2.1.222 で修正)はいずれも最新版で閉じているため、ポリシー hook を信頼の基盤にするなら v2.1.300 以降を前提にするのが安全である。

### 3.9 デバッグ

`/hooks` は読み取り専用のブラウザで、各 hook の種別と出所を表示する(v2.1.286 以降はイベント別の一覧から Enter 一回で詳細)。`claude --debug` または `--debug-file <path>` で hook の stdout / stderr / 終了コードがログに残る(`--debug` は端末に出さず `~/.claude/debug/<session-id>.txt` に書く。セッション途中なら `/debug` で有効化しパスが表示される)。v2.1.296 以降、ツール系イベント、UserPromptSubmit、SessionStart、Stop などの command hook は完了時に `Hooks: <Event>:<matcher> [cmd] finished with status N (Nms)` を 1 行残し、`timed out after <N>ms` / `cancelled` / `moved to the background` / `failed to start` も区別できる。遅い hook はこの行の所要時間で見つける。`CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` でマッチャーの集計も出る。

ログで探すべき文字列は `Hook output does not start with {`(シェルプロファイルの echo が JSON を壊した)、`Hook JSON output had unrecognized keys`(フィールドの階層が違う)、`Session environment is not all plain assignments`(CLAUDE_ENV_FILE と PowerShell の非互換)。Ctrl+O のトランスクリプト表示でブロックメッセージと `<hook name> hook error` が見える。スクリプト単体のテストは `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ./my-hook.sh; echo $?` で行う。settings の編集はファイルウォッチャーで拾われるが、反映されなければ再起動する。

Windows では `"shell": "powershell"` で pwsh.exe / powershell.exe が使われ、shell 形式では `${CLAUDE_PROJECT_DIR}` が `${env:NAME}` 形式に書き換えられる(二重引用符内でのみ機能、素の `$CLAUDE_PROJECT_DIR` は `$null`)。Git Bash がない Windows では Bash ツール自体が登録されないので `Bash` だけのマッチャーは発火せず、`Bash|PowerShell` と書く。v2.1.299 以降、`shell` 未指定の shell 形式 PreToolUse / PermissionRequest hook が Git Bash 不在で失敗すると呼び出しをブロックする。

```json
{
  "type": "command",
  "if": "PowerShell(Remove-Item *)",
  "command": "powershell.exe",
  "args": [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.ps1"
  ]
}
```

PowerShell スクリプトを exec 形式で呼ぶ公式パターン。スクリプト側は `[Console]::In.ReadToEnd() | ConvertFrom-Json` で読み、`ConvertTo-Json` で出す。`if` は 1 ツールにしか効かないので Bash 用と PowerShell 用に別ハンドラを用意する。

### 落とし穴と対策

- exit 1 はブロックではない。ポリシー強制は exit 2 か JSON の deny で行い、ゲート hook には `onFailure: "block"`(v2.1.295+)を付けて、スクリプト欠落やタイムアウトでフェイルオープンしないようにする。初回実行時は `No such file or directory` の通知が出ていないか確認する。
- `PermissionRequest` は exit 2 を完全に無視する。`hookSpecificOutput.decision.behavior` だけが効く。逆に `Stop` / `SubagentStop` / `TaskCompleted` / `TeammateIdle` では exit 2 が「続行」の意味なので `onFailure` が効かない。
- `additionalContext` / `permissionDecision` をトップレベルに書くと黙って無視される。`hookSpecificOutput` の中に `hookEventName` と並べる。
- JSON の前に 1 文字でも stdout に出るとプレーンテキスト扱いになり決定が捨てられる。`~/.bashrc` の echo は `if [[ $- == *i* ]]; then ...; fi` で囲む。JSON は `jq -n --arg` で組む。
- マッチャーの正規表現はアンカーなし。`Edit.*` は `NotebookEdit` に当たり、`mcp__memory` は何にも当たらず(`.*` 必須)、plugin の MCP は `mcp__plugin_<plugin>_<server>__<tool>`、plugin の subagent 型は `^plugin:agent$` と書く。
- `if` は 1 ルールのみ、ツール系 5 イベント専用、Bash に対してはベストエフォート。厳密な allow / deny は permission rules で。`Edit(src/**)` は `<cwd>/src` 限定(v2.1.214+)。
- PreToolUse は `@file` 添付と `EndConversation` で発火しない。`Edit|Write` の PostToolUse は Bash による書き換えで発火しない。`FileChanged` か Stop での `git status --porcelain` 走査で補う。
- hooks は締めるだけで緩められない。hook の allow は deny / ask ルール、UNC 読み取り、`requiresUserInteraction` な MCP ツール、組織の ask コネクタ、plan mode の書き込みプロンプトを覆せない。hook の deny は `--dangerously-skip-permissions` でも効く。
- `updatedInput` を返す PreToolUse hook を同一ツールに複数置くと、最後に終わった方が非決定的に勝つ。
- Stop はターン終了ごとに発火する。`stop_hook_active` を必ず確認し、8 回の連続継続で強制停止される(`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`)。最終メッセージは `last_assistant_message` から取り、`transcript_path` は使わない。
- PreToolUse / PostToolUse の prompt hook は `ok: false` で既定ではターンを終える(v2.1.210 以降)。継続させたければ `continueOnBlock: true`。agent hook は常に継続扱いで `impossible` もない。
- `mcp_tool` hook は起動時の SessionStart と Setup で黙ってスキップされる。起動時の処理は command hook で。
- `CLAUDE_ENV_FILE` は SessionStart / Setup / CwdChanged / FileChanged のみ、PowerShell 実行 hook にはない。CwdChanged で書いた変数は次の CwdChanged でクリア。PowerShell ツールは全行が単純代入のときだけ受け取る(direnv の `$'...'` 出力で全滅)。
- Windows: パスはバックスラッシュで届く(正規化必須)、Git Bash なしでは `Bash` マッチャーが死ぬ(`Bash|PowerShell`)、exec 形式は `.cmd` シムを起動できない(`node` + パス)、PowerShell hook の素の `$CLAUDE_PROJECT_DIR` は `$null`。
- hooks に制御端末はない。`/dev/tty` は失敗する。通知は `terminalSequence`(対話セッションのみ)か `systemMessage`。
- 同期 hook からバックグラウンドプロセスを起動するときは決定を先に print し、`>/dev/null 2>&1 &` でリダイレクトする。さもないと `refusing to honor the suspect capture` でブロックされる。
- `additionalContext` 等は 10,000 文字で打ち切られ、超過分は Claude が読まないファイルに退避される。セッション途中に注入したコンテキストは `--resume` でそのまま再生されるため SHA やタイムスタンプが古くなる。再実行されるのは SessionStart だけ。
- `-p` / SDK は信頼ダイアログを飛ばす。他人のリポジトリで回す前に `.claude/` を読むか `--bare` / `--settings '{"disableAllHooks": true}'`。hook コマンドはサンドボックス外で全権限実行される。
- Notification の `permission_prompt` は約 6 秒遅延しキー入力で延期される。`idle_prompt` は約 60 秒待つ。即時反応は PermissionRequest で。
- FileChanged のマッチャーはリテラルファイル名。正規表現や `*` はその名前のファイルを登録するだけ。最低 1 ファイルか `watchPaths` で監視を開始し、自己書き換えループを避ける。
- WorktreeCreate は git worktree 作成を完全に置換する(`.worktreeinclude` 無視)。stdout の最終行がパス、非 0 は失敗。subagent / workflow 用の worktree は WorktreeRemove に渡らない。
- ConfigChange のブロックは無言(ユーザーにも Claude にも表示なし)、`policy_settings` はブロック不能、server-managed settings は発火しない。
- ElicitationResult は decline / cancel でも発火し、hook の `action` がユーザーの回答を置き換える。無条件に accept を返すと decline が accept になる。
- `once: true` は skill frontmatter 専用。`suppressOutput` は何もしない。ConfigChange の `reason` は表示されない。`team_name` は非推奨。
- SessionEnd は 1.5 秒の共有予算。遅い処理は per-hook `timeout`(上限 60 秒)か `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` で延ばす。
- async hook の出力は次ターンに届きユーザーには見えない。`-p` では終了時に kill される。`classifierContext` は無視される。

### 中級者が次にやること

1. **ゲート hook をフェイルクローズに揃える**: 既存の PreToolUse ポリシー hook すべてに `"onFailure": "block"` を付け、`args: []` で exec 形式にし、`echo '{...}' | ./hook.sh; echo $?` で 0 / 2 の両経路を手動検証する。`--debug-file` で `finished with status` 行の所要時間も確認する。
2. **logging と guardrail を同じイベントで分離する**: ログ用とブロック用のハンドラを別に置き、deny が出てもログが残る構造にする(deny > defer > ask > allow のマージ規則を利用)。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r .tool_input.command >> ~/.claude/bash.log"
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-rm-rf.sh"
          }
        ]
      }
    ]
  }
}
```

3. **SessionStart で環境を固定する**: `CLAUDE_ENV_FILE` に Node バージョンや PATH を書き出し、`"matcher": "compact"` のグループで compaction 後に重要な規約を再注入する。チーム共有 skill を pull して `reloadSkills: true` を返す hook を加える。
4. **Stop を品質ゲートにする**: `stop_hook_active` ガード + `git status --porcelain` / テスト実行で exit 2、原理的に不可能なら prompt 型で `impossible: true` を返す構成に切り替える。`background_tasks` が空でないときは exit 0 で通す。
5. **UserPromptExpansion で slash command を監査する**: `/deploy` のような危険コマンドを `command_name` マッチャーで捕まえ、`decision: block` または `additionalContext` で前提条件(ブランチ、環境変数)を注入する。
6. **PermissionRequest で plan mode の遷移を自動化する**: `ExitPlanMode` に限定したマッチャーで `behavior: allow` + `setMode: acceptEdits` を返し、`permission_suggestions` をそのまま `updatedPermissions` に返して `localSettings` へ学習させる。マッチャーは絶対に広げない。
7. **PostToolUse の `Agent` マッチで subagent の結果を集約する**: `tool_response.status` / `totalTokens` / `totalDurationMs` をログに落とし、`content` を要約した `additionalContext` を親に返す。
8. **Notification から外部通知へ**: `terminalSequence` または `osascript` / `notify-send` を公式経路として採用する。Slack Incoming Webhook に `jq -c '{text: ...}' | curl --data @-` で送る構成は community pattern であり (未検証)。URL は settings の `env` ブロックかシェル環境から読み、Stop 側は `async: true` にして Claude をブロックしない。`http` 型は Slack の `text` 形式に合わないので直接は使えない。
9. **plugin 化する**: 複数リポジトリで同じ hooks を使うなら `hooks/hooks.json` に `${CLAUDE_PLUGIN_ROOT}` で切り出す。exec 形式でのみ `${user_config.*}` が展開され、shell 形式では `$CLAUDE_PLUGIN_OPTION_<KEY>` を読む(v2.1.207 以降、shell 形式の `${user_config.*}` はエラーになる)。

```json
{
  "description": "Automatic code formatting",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh",
            "args": [],
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

10. **headless パイプラインで `defer` を使う**: `claude -p` から PreToolUse で `permissionDecision: "defer"` を返し、`stop_reason: "tool_deferred"` を受けて人間承認やワークフローの承認ステップを挟み、`claude -p --resume <id>` で allow + `updatedInput` を返す。単一ツール呼び出しのターンでのみ機能する点を設計に織り込む。

### 出典

- https://code.claude.com/docs/en/hooks (Hooks reference)
- https://code.claude.com/docs/en/hooks-guide (Automate actions with hooks)
- https://code.claude.com/docs/en/changelog (Claude Code changelog、v2.1.210 から v2.1.302 までの hook 関連エントリ)
- https://zenn.dev/ispec_inc/articles/claude-code-slack-notification-hooks (community、Slack 通知パターン、未検証)


---

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


---

## 第5章 ワークフロー・自動化(Workflow tool, goal, scheduled tasks, channels, routines)

### この章で分かること

この章では、Claude Code を「対話するツール」から「自律的に動き続ける仕組み」に変えるための 6 つの機構を、設定ファイル・API・制限値のレベルまで分解して扱う。具体的には、数十から数百の subagent をスクリプトで統率する dynamic workflows(Workflow tool と `ultracode`)、終了条件が満たされるまでターンを回し続ける `/goal`、セッション内の cron である `/loop` と CronCreate、外部イベントをセッションに push する channels、マシン不要でクラウド実行される routines(Schedule / API / GitHub トリガー)、Desktop ローカルの scheduled tasks、そして人間を一発で招き入れる deep links である。それぞれについて「どこに何を書くと何が起きるか」「優先順位と衝突時の勝者」「公式ドキュメントに明記された上限値」「resume や失敗時の挙動」を押さえ、最後にこれらを組み合わせた always-on 構成のレシピを示す。対象バージョンは Claude Code v2.1.302(2026-10-16)時点の公式ドキュメントと CHANGELOG に基づく。

### 5.1 全体像: 6 つの機構は「誰が計画を持つか」「何が起動するか」で分かれる

| 機構 | 起動元 | 実行場所 | 計画の保持者 | 典型用途 |
|---|---|---|---|---|
| Dynamic workflow | 人間のプロンプト(`ultracode`)または `/<name>` | ローカル(バックグラウンド) | JS スクリプト | 大規模 fan-out、監査、調査 |
| `/goal` | 人間が条件を設定 | 同一セッション | Stop hook(評価モデル) | 条件達成まで回し続ける |
| `/loop` / CronCreate | 時刻(セッション内 cron) | 同一セッション | セッションの文脈 | 短期ポーリング、PR 面倒見 |
| Channels | 外部イベント(MCP 通知) | 開いているセッション | 外部システム | CI 失敗、チャット、アラートの push |
| Routines | 時刻 / API / GitHub イベント | クラウド | 保存済みプロンプト | マシン不要の定期・反応型ジョブ |
| Desktop scheduled task | 時刻(Desktop アプリ) | ローカル(Desktop) | `SKILL.md` | ローカルファイルを触る定期ジョブ |

公式ドキュメント自身が相互にリンクしている判断基準は次の通り。「ポーリングではなくイベントで反応したい」なら channels、「間隔ではなく条件でターンを回し続けたい」なら `/goal`、「マシンを落としても確実に回したい」なら cloud routines、「ローカルファイルとツールが必要」なら Desktop tasks、「セッション中の手軽なポーリング」なら `/loop`。

### 5.2 Dynamic workflows(Workflow tool)

#### 5.2.1 何が起きているか

Dynamic workflow は、Claude が書いた JavaScript スクリプトをランタイムがバックグラウンドで実行し、スクリプトが `agent()` などで subagent を多数起動する仕組みである。ループ、分岐、中間結果はすべてスクリプト変数に留まり、Claude のコンテキストには最終結果だけが戻る。subagent や agent teams との違いは「計画を誰が持つか」で、workflow では計画をスクリプトが持つ。公式の規模感は「1 回の実行で数十から数百のエージェント」、中断に対しては「同一セッション内で再開可能」。

2026-05-28 にリリースされ、公式ブログでは現在 generally available と記載されている。全有料プラン、Anthropic API、Amazon Bedrock、Google Cloud Agent Platform、Microsoft Foundry で利用可能。Pro だけは `/config` の「Dynamic workflows」行で明示的に有効化する必要がある。

#### 5.2.2 起動方法と `ultracode` の意味論

- 単発のタスクを workflow として走らせる: プロンプトに `ultracode` を含める。「use a workflow」「run a workflow」のような自然文でも同じ扱い。キーワードのハイライトは macOS で Option+W、Windows/Linux で Alt+W、またはキーワード直後の backspace で解除。キーワードトリガー自体は `/config` の「Ultracode keyword trigger」で無効化できる。
- セッション全体で自動的に workflow を計画させる: `/effort ultracode`。`claude --effort ultracode` で起動すると最初から on になり、同時に effort が `xhigh` になる。永続化は settings の `ultracode` キー。解除は `/effort ultracode off`。
- ultracode on の副作用: `Large workflow` 警告の抑制、Agent tool 経由の subagent 同時実行上限が強制されない、auto mode での初回起動承認がスキップされる。1 つの依頼が「理解 → 変更 → 検証」のように複数の workflow を順次起動することがあり、使用量上限を早く消費する。

重要な落とし穴: v2.1.210 以降、`ultracode` キーワードは「人間が打った入力」からしか発火しない。`claude -p` のプロンプト、`origin: { kind: 'human' }` を付けていない SDK メッセージ、scheduled task のプロンプト、webhook や PR コメントのリレーからは無視される。SDK アプリは origin を明示する必要があり、origin が無いメッセージは unattributed 扱いで human-typed 判定に落ちる。

#### 5.2.3 承認と permission mode

| mode | 挙動 |
|---|---|
| Auto | 初回起動のみ確認(同意はユーザー settings に記録) |
| Manual / accept-edits | 毎回確認。「don't ask again for `<name>` in `<path>`」を選べば以後スキップ(bundled / saved / plugin の名前付き workflow のみ提示) |
| Bypass、`claude -p`、SDK | 確認なし。ただし `claude -p` / SDK では Workflow tool 呼び出しは通常の permission 評価を通る(deny rule、ask rule、`dontAsk` mode が適用される) |

`-p` / SDK で明示的に許可するには、permission rule `Workflow`(すべて)または `Workflow(<name>)`(保存済み 1 つ)、auto mode、bypass mode、PreToolUse hook で allow を返す(plan mode では不十分)、`--permission-prompt-tool` / `canUseTool` のいずれか。

```json
{
  "permissions": { "allow": ["Workflow", "Workflow(triage-issues)"] },
  "workflowSizeGuideline": "small",
  "disableWorkflows": false
}
```

settings.json(user / project / managed のいずれでも可)。`Workflow` / `Workflow(<name>)` が allow rule、`workflowSizeGuideline` は `unrestricted` / `small`(5 未満) / `medium`(10 未満) / `large`(50 未満)で Claude に送られる「助言」(デフォルト medium、Pro は v2.1.271 以降 small)。settings ファイルの値は `/config` の値より優先される(v2.1.219+)。

承認ダイアログでは `Ctrl+G` でスクリプトをエディタで開き、Tab で Yes/No にコメントを添えられる。auto mode では、スクリプトが `agent()` に渡したプロンプトは「スクリプトが計算したテキスト」として印が付くため、classifier はそれをユーザーの依頼とは見なさない。長時間走らせる前に、エージェントが使うツールを allow rule に入れておくこと。

#### 5.2.4 保存済み workflow の配置と優先順位

- プロジェクト: `.claude/workflows/<file>.js`(リポジトリで共有)
- 個人: `~/.claude/workflows/`(`CLAUDE_CONFIG_DIR` 設定時はその配下)
- `/<meta.name>` で実行。同名ならプロジェクトが勝つ。モノレポでは cwd に最も近い `.claude/workflows/` が勝つ。
- プラグイン: プラグインルートの `workflows/` ディレクトリ(または manifest の `workflows` フィールド)。`/<plugin>:<meta.name>` で名前空間化(例: `acme-tools` の `release-audit` は `/acme-tools:release-audit`)。
- `/workflows` 画面で `s` を押すと保存、Tab で保存先を切替。symlink チェック: プロジェクト側は `.claude`、`.claude/workflows`、対象ファイルのどれかが symlink なら拒否。個人側は対象ファイルが symlink の場合のみ拒否(v2.1.216+)。
- 保存済み workflow を編集したら `/reload-skills` でディレクトリを再読み込みしてから `/<name>` を実行する。
- 起動元スクリプトは「セッションが既に読める場所」に限られる。作業ディレクトリ外のスクリプトは `/add-dir` か Read の allow rule を先に追加する(v2.1.301 で Bash `cd` 後に拒否される問題が修正された)。

公式の最小例(`.claude/workflows/audit-routes.js`):

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

`meta` は最初の文であり、`name` と `description` を持つ純粋なオブジェクトリテラルでなければならない。リテラルでない内容が混ざると `/` の補完からコマンドが黙って消える。`meta.phases` を使う場合、各 title は `phase()` 呼び出しの title と完全一致させる。

```javascript
export const meta = {
  name: 'find-flaky-tests',
  description: 'Find flaky tests and propose fixes',   // one-line, shown in permission dialog
  phases: [                                            // one entry per phase() call
    { title: 'Scan', detail: 'grep test logs for retries' },
    { title: 'Fix', detail: 'one agent per flaky test' },
  ],
}
// script body starts here、use agent()/parallel()/pipeline()/phase()/log()
phase('Scan')
const flaky = await agent('grep CI logs for retry markers', {schema: FLAKY_SCHEMA})
```

bundled skill `/workflow-authoring`(v2.1.248+)の例。任意フィールドとして `whenToUse`、phase エントリの `model` がある。

#### 5.2.5 スクリプト API(bundled skill `/workflow-authoring` 準拠)

```text
agent(prompt, opts?)            → Promise<any>   1 つの subagent を起動
  opts: { label, phase, schema, model, effort, isolation: 'worktree', agentType, stallMs }
pipeline(items, stage1, stage2, ...) → Promise<any[]>  各 item を全 stage に独立に通す(バリアなし)
  stage 引数: (prevResult, originalItem, index)
parallel(thunks)                → Promise<any[]>  thunk 群を同時実行し全完了を待つ(バリア、reject しない)
phase(title)                    以後の agent を進捗グループにまとめる
log(line)                       ナレーター行を出す
workflow(nameOrRef, args?)      保存済み workflow か {scriptPath} をサブステップとして実行
budget                          { total: number|null, spent(), remaining() }
args                            起動時に渡された構造化 JSON(省略時 undefined)
```

意味論で重要な点:

- `agent()` は途中停止(`x`)または回復不能な API エラーで `null` に解決する。`pipeline()` は `null` を配列に残すため `.filter(Boolean)` が定石。
- `pipeline()` はステージ間にバリアが無い。item A が stage 3 にいる間に item B が stage 1 にいることがある。stage が throw すると、その item は null になり残りの stage はスキップ。
- `parallel()` は thunk(`() => agent(...)`)を受け取る。Promise を直接渡さない。失敗した thunk は null になり、`parallel()` 自体は reject しない。
- `schema` を渡すと subagent は StructuredOutput を強制され、検証済みオブジェクトが返る。ルートは `{type:'object', properties:{...}}` で `required ⊆ properties`。自己矛盾するスキーマ(例: `additionalProperties:false` で除外されている key を `required` に含める)は起動前に拒否される。出力が 5 回の試行後も検証に落ちると呼び出しは失敗する。試行回数は `MAX_STRUCTURED_OUTPUT_RETRIES`(デフォルト 5 = 初回 + 4 リトライ)。
- `effort` は `'low'|'medium'|'high'|'xhigh'|'max'`。`isolation:'worktree'` はエージェントあたり約 200〜500ms とディスクを消費し、変更が無ければ自動削除。`agentType` は Agent tool と同じレジストリから解決。モデルは subagent の選択順序に従い、phase の `model` はその順序で「呼び出し単位のモデル」として扱われる。何も指定が無ければセッションのモデル。`availableModels` でブロックされたモデルは subagent と同じ規則で置換される。
- `opts.phase` は `pipeline()` / `parallel()` の中でグローバルな `phase()` 状態の競合を避けるために使う: `agent(f.prompt, {phase: 'Find', schema: BUGS})`。
- `args` は構造化 JSON で渡される。文字列化したリストを渡すと `args.filter` / `args.map` が throw する。
- `Date.now()`、`Math.random()`、引数なし `new Date()` はスクリプト内で throw する(relaunch 時に同一の `agent()` 呼び出しを再生するため)。タイムスタンプは `args` で渡す。TS 注釈、`import()`、ファイルシステム / Node API は使えない。`import()` を含むスクリプトは実行前に失敗する。
- `budget`(bundled skill のみに記載。公開ページ workflows.md には無い)はユーザーの「+500k」形式のトークン指示から来る hard ceiling で、`spent()` が `total` に達すると以後の `agent()` が throw する。プールはメインループと全 workflow で共有。`total` が null のとき `remaining()` は Infinity なので、ループは必ず `budget.total` でガードしないと 1,000 エージェント上限まで走る。「+500k」という指示構文自体は公開ページで確認できない (未検証)。
- `workflow()`(同じく bundled skill のみに記載)は親の同時実行上限、エージェントカウンタ、abort signal、トークン budget を共有する。ネストは 1 段のみで、子の中で `workflow()` を呼ぶと throw。未知の名前、読めない `scriptPath`、子の構文エラーでも throw。
- subagent は CLAUDE.md を受け取り、セッションに接続された MCP ツールへ ToolSearch 経由で到達できる。ただし対話的に認証した MCP サーバ(claude.ai 等)は headless / cron 実行では存在しないことがある。subagent には「最終テキストがそのまま戻り値になる」と伝えられる。

パターン例(bundled skill より):

```javascript
const all = await parallel(DIMENSIONS.map(d => () => agent(d.prompt, {schema: FINDINGS_SCHEMA})))
const deduped = dedupeByFileAndLine(all.filter(Boolean).flatMap(r => r.findings))  // <-- genuinely needs ALL at once
const verified = await parallel(deduped.map(f => () => agent(verifyPrompt(f), {schema: VERDICT_SCHEMA})))
```

バリアが本当に必要なのは「stage N が stage N-1 の全 item を横断して使う」場合(dedup、件数ゼロでの早期終了、他の finding との比較)だけ。それ以外は `pipeline()` を既定にする。

```javascript
const bugs = []
while (budget.total && budget.remaining() > 50_000) {
  const result = await agent("Find bugs in this codebase.", {schema: BUGS_SCHEMA})
  bugs.push(...result.bugs)
  log(`${bugs.length} found, ${Math.round(budget.remaining()/1000)}k remaining`)
}
```

budget で打ち止めにするループ。静的にフリート数を決める書き方は `const FLEET = budget.total ? Math.floor(budget.total / 100_000) : 5`。

```javascript
const votes = await parallel(Array.from({length: 3}, () => () =>
  agent(`Try to refute: ${claim}. Default to refuted=true if uncertain.`, {schema: VERDICT})))
const survives = votes.filter(Boolean).filter(v => !v.refuted).length >= 2
```

敵対的検証: 3 人の反証者を独立に走らせ、過半数が反証したら落とす。

#### 5.2.6 制限値と環境変数

| 項目 | 値 |
|---|---|
| 同時実行エージェント | デフォルト最大 16(CPU が少ないと減る。bundled skill の表現では min(16, CPU - 2))。`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` で 1〜256(v2.1.269+)。超過分はキュー |
| `parallel()` / `pipeline()` 1 回あたりの item 数 | 最大 4,096。超えると切り詰めではなくエラー |
| 1 回の実行のエージェント総数 | 1,000 |
| 実行中のユーザー入力 | 不可 |
| 戻り値のネスト深さ | workflow スクリプトは 100,000 レベルで拒否(v2.1.299。v2.1.296 で約 20,000 レベルでの黙った切り詰めを修正) |

```bash
CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS=32   # 1-256, v2.1.269+。数字のみ。範囲外や別表記はデフォルトのまま。実行中エージェントのトランスクリプトはメモリに残るため値を上げるとメモリ増
CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS=5000     # 0 で cache-prefix 待ちを無効化。v2.1.229+。DISABLE_PROMPT_CACHING 設定時は待たない
CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS=600000      # デフォルト 600000 (10 分)。v2.1.286+ で workflow エージェントも対象
CLAUDE_STREAM_IDLE_TIMEOUT_MS=300000            # ストリーミング監視。明示設定時の下限は 300000
MAX_STRUCTURED_OUTPUT_RETRIES=5                 # デフォルト 5 = 初回 + 4 リトライ
CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL=...         # v2.1.296: 全 workflow エージェントを 1 モデルに固定(CHANGELOG のみに記載)
CLAUDE_CODE_DISABLE_WORKFLOWS=1
CLAUDE_CODE_GOAL_CHECKIN_MINUTES=30             # 0 で /goal のチェックインとリトライを無効化。上限 10080。v2.1.234+
CLAUDE_CODE_DISABLE_CRON=1                      # CronCreate/CronList/CronDelete と /loop を無効化
```

シェル環境または settings の `env` に置く。値はデフォルト以外は例示。

#### 5.2.7 コストとキャッシュ

- fan-out で「同じ model、effort、agent type、tools、output schema、作業ディレクトリ」の兄弟エージェントは prefix cache を共有する。Claude Code は最初の 1 つ以外を最大 `CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS`(デフォルト 5000ms)待たせて共有 prefix を読ませる。
- workflow エージェントの cache TTL は 5 分。`subagentPromptCacheTtl` を `1h` にすると 1 時間になるが、1 時間キャッシュの書き込みは高い料率で課金される。
- 25 エージェント超、または予測トークン 1.5M 超で、入力欄下のタスクパネルに `Large workflow` 警告(助言のみ)。
- claude.ai の使用量上限に当たると、対話型サブスクセッション・`autoContinueAtUsageLimit` on・24 時間以内にリセット・まだ 2 回待っていない、の 4 条件を満たせば一時停止して自動再開(v2.1.271+)。3 回目はエージェントが失敗。`-p` / SDK、バックグラウンドセッション、Remote Control、agent teams の teammate では失敗する。
- 同じスクリプト + 同じ args は 100% キャッシュヒットで再生される。

#### 5.2.8 Resume、停止、stall

- relaunch はエージェントを開始順に再生する。完了済みエージェントはプロンプトが同一である限りキャッシュから返り、最初に差異が出たエージェント以降はすべて再実行。失敗したエージェントとその後に開始したすべても再実行。`x` で 1 つを止めるのも失敗扱い。例: A, B, C, D の順で B が失敗すると、A はキャッシュ、B, C, D は再実行。
- `/workflows` のキー: ↑/↓ 選択、Enter/→ 掘り下げ、Esc/← 戻る、j/k スクロール、f 状態でフィルタ、p 一時停止/再開、x エージェントまたは実行を停止、r 再試行、s 保存。
- セッションを離れても実行が続くのは、バックグラウンド(agent view)または「Move to background and exit」を選んだときだけ。それ以外は実行が止まるが、結果は `~/.claude/projects/` に保存されるので `claude --resume` で再生できる。新しいセッションには「再開すべき以前の実行」が無いため、workflow は新規実行として最初から走る。`nothing to resume` エラーは、Claude が以前の実行を relaunch しようとして保存結果(ローカルまたはクラウド)が見つからない場合にのみ出る。
- 停止した実行のエージェントがまだ終了処理中の間は relaunch が拒否される。
- Workflow tool の `resumeFromRunId` は同一セッション内のみ。
- 空の結果を診断する前に `<transcriptDir>/journal.jsonl` を読み、各エージェントの実際の戻り値を確認する。journal が無い場合は transcript ディレクトリの `agent-<id>.jsonl` を読んで継続スクリプトを手書きする。
- stall: エージェントは同じプロンプトから最大 5 回再起動(計 6 試行)。エラーは `agent stalled on all 6 attempts`、`agent lost its reply on all 6 attempts`(ストリーム監視)、`agent abandoned after 6 attempts`。ツール呼び出しや使用量上限リセットを待っている時間は stall 窓に含まれない。`r` で要求した再試行も 5 回に数えられる(名前に `(retry 1)`、詳細に `attempt 2 (stalled)`)。`parallel()` / `pipeline()` の中なら null で続行、直接 await なら実行がエラー終了。stall した試行が変更したファイルはそのまま、トークンも課金される。延長は `agent(prompt, { stallMs: 1800000 })` または `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS`。

#### 5.2.9 Agent SDK からの Workflow tool

```typescript
type WorkflowInput = {
  script?: string;
  name?: string;
  scriptPath?: string;
  args?: unknown; // any JSON value; the published typings render this as an object map
  resumeFromRunId?: string;
  title?: string; // ignored; the script's meta block sets the title
  description?: string; // ignored; the script's meta block sets the description
};
```

Agent SDK v0.3.149+。`script` / `name` / `scriptPath` のいずれか 1 つは必須。`scriptPath` が最優先で、セッションのツールに `Read` が無いと拒否される。毎回の実行はスクリプトを `~/.claude/projects/` 配下のセッションディレクトリに書き出してパスを返すので、反復はそのファイルを編集して `{scriptPath}` で relaunch する(インラインで再送しない)。v2.1.296 で CRLF のスクリプトファイルが拒否される問題が修正された。

mod(plugin-authoring)の `agent.spawn` hook は v2.1.292 から workflow エージェントも対象(run と index を持ち、拒否できる)。v2.1.300 からは `prompt` と `model` を書き換えられる。

#### 5.2.10 無効化

settings または managed settings に `"disableWorkflows": true`、環境変数 `CLAUDE_CODE_DISABLE_WORKFLOWS=1`、または `/config` のトグル。これで `ultracode`、`/workflows`、`/workflow-authoring` も消える。ultracode だけを無効化する managed setting は存在しない(effort cap は effort を下げるが ultracode は切らない)。実行中の run は継続する。v2.1.285 以降、Code Review の PR レビューと `/ultrareview` は `disableWorkflows` が on でも動く(ただしそのマシンの管理者が MDM / managed-settings で設定している場合を除く)。

bundled の `/deep-research` は WebSearch が必要で、検証できなかった主張は「反証」ではなく「未検証」として報告する。

### 5.3 `/goal`: 条件駆動で回し続ける

#### 5.3.1 仕組み

`/goal <condition>` はセッションスコープの prompt-based Stop hook のラッパーである。Claude が 1 ターンを終えるたびに、条件と会話全体を設定済みの small fast model に送り、`Not yet met` / `Met` / `Impossible` と理由を得る。評価モデルはコマンドを実行せずファイルも読まない。Claude が transcript に表面化させた内容だけを判断する。したがって条件には「測定可能な終了状態」と「確認方法」を書く。条件は最大 4,000 文字。セッションに goal は 1 つで、新しい goal は置換。設定するとすぐにターンが始まり、`◎ /goal active` が表示される。Ctrl+O で各ターンの判定理由を見られる。

```text
/goal all tests in test/auth pass and the lint step is clean
/goal
/goal clear
claude -p "/goal CHANGELOG.md has an entry for every PR merged this week" --output-format stream-json --verbose
```

設定、状態表示(条件、経過時間、評価したターン数、トークン消費、最新の理由)、解除(別名 stop / off / reset / none / cancel)、非対話実行。`-p` では 1 回の呼び出しでループが完了まで走り、`stream-json --verbose` で進捗が見える。Ctrl+C で停止。`/clear` も goal を消す。

ターン数で上限を付けるなら条件に「or stop after 20 turns」を入れる。

#### 5.3.2 permission との関係

`/goal` は permission mode を変えない。Manual mode では未承認のツール呼び出しごとに止まる。無人運用では auto mode と組み合わせる(auto mode がツール単位の確認を消し、`/goal` がターン単位の確認を消す)。Claude が評価モデルに答えるだけでツールを使わないターンが数回続くと、Claude Code はループを止めて警告を出し、goal は設定したまま制御を返す。次のプロンプト後に評価が再開する。

#### 5.3.3 エラー、リトライ、チェックイン

- goal を消す 4 つのエラー: Claude Code 自身が資格情報を管理している場合の認証失敗(Desktop / cloud ホスト管理なら維持)、クレジット枯渇、解消されないコンテキスト溢れ、モデル利用不可。警告は `Goal cleared after an unrecoverable error` で始まり `Run /goal again to continue` で終わる。
- その他の失敗は goal を維持し、v2.1.269+ の対話セッションでは overload / 接続断で最大 3 回自動リトライ、rate limit / 使用量上限 / hook がターンを終えた場合は一時停止。3 回リトライ後も一時停止。
- subagent やバックグラウンドシェルなどのバックグラウンド作業中は評価が遅延される。30 分で最初のチェックイン、以後 2 倍ずつ 4 倍まで(1 時間、その後 2 時間ごと)。idle チェックイン(v2.1.236+)はプロンプト間で goal あたり最大 3 回(v2.1.246+)、3 回目で「次のプロンプトまで一時停止」と告げる。`-p` ではターン終了時にのみチェックインが届く。
- `CLAUDE_CODE_GOAL_CHECKIN_MINUTES` で最初の間隔を変える(後続もスケールする)。0 でリトライとチェックインを無効化。
- goal は resume のすべての経路で復元される(v2.1.239+)。ターン数、タイマー、トークン基準はリセット。
- 評価モデルは `ANTHROPIC_DEFAULT_HAIKU_MODEL` で変更できるが、small fast model を使う他の機能すべてに影響する。セッションのプロバイダ上で動く。
- `disableAllHooks: true` または `allowManagedHooksOnly` 設定下では `/goal` は使えず、hooks の workspace-trust 規則に従う。

### 5.4 `/loop` と scheduled tasks(セッション内 cron)

#### 5.4.1 `/loop` の 3 つの形

```markdown
/loop 5m check if the deployment finished and tell me what happened
/loop check whether CI passed and address any review comments
/loop 20m /review-pr 1234
/loop

<!-- .claude/loop.md -->
Check the `release/next` PR. If CI is red, pull the failing job log,
diagnose, and push a minimal fix. If new review comments have arrived,
address each one and resolve the thread. If everything is green and
quiet, say so in one line.
```

- 間隔 + プロンプト: 固定 cron。単位は s/m/h/d。秒は分に切り上げ、7m や 90m のような不揃いな間隔はきれいな cron ステップに丸められる。
- プロンプトのみ: self-paced。各イテレーション後に Claude が観察結果から 1 分〜1 時間の遅延を選ぶ(ScheduleWakeup)。
- 何も無し / 間隔のみ: 組み込みのメンテナンスプロンプト(未完了作業の継続 → ブランチの PR の面倒見(コメント、CI、コンフリクト) → クリーンアップ。新しい取り組みはしない。不可逆な操作は transcript で既に承認済みのものだけ)。`.claude/loop.md`(プロジェクト優先)または `~/.claude/loop.md` があればそれに置換。プロンプトを渡した場合は無視。編集は次のイテレーションから反映。25,000 バイト超は切り詰め。
- スキルをプロンプトにできる(`/loop 20m /review-pr 1234`)。ただし組み込みコマンド、`disable-model-invocation: true` のスキル(`/verify` を含む)、`skillOverrides` で隠されたスキル、`Skill` の deny rule に当たるスキル、MCP プロンプトは Claude に「平文」として届き実行されない。

self-paced ループの停止は Esc(保留中の wakeup を消す)、または Claude が `ScheduleWakeup` を `stop: true` で呼んだとき。イテレーションが再スケジュールも停止もしないと、約 20 分後に 1 回だけフォールバック wakeup が発火し、それも再スケジュールしなければ終了。Esc は CronCreate で直接作ったタスクには効かない(削除するまで残る)。セッションをバックグラウンド化すると `/loop` タスクはバックグラウンドセッションに引き継がれる(v2.1.295 で Ctrl+C が保留中の wakeup を消さないよう修正)。

#### 5.4.2 CronCreate / CronList / CronDelete

- 5 フィールド cron とプロンプト、recurring / once を受け取る。各タスクに 8 文字の ID、セッションあたり最大 50。スケジューラは毎秒チェックし、ターン間に低優先度で発火。ローカルタイムゾーン。見逃した発火は追いかけない(idle になったときに 1 回だけ発火し、間隔ごとに 1 回ではない)。
- 繰り返しタスクは作成から 7 日で期限切れ(最後に 1 回発火して自己削除)。resume で復元されるのは CronCreate のタスクのうち期限切れでない繰り返しと未来の一回限りのみ。self-paced `/loop` とバックグラウンド Bash / Monitor は復元されない。
- feature flag の取得が off のとき、永続化先は `.claude/scheduled_tasks.json`(symlink ならエラー)で、作成したフォルダでのみ動く。
- `CLAUDE_CODE_DISABLE_CRON=1` でスケジューラ、cron ツール、`/loop` を無効化。
- v2.1.290〜2.1.299 で compaction 後 / `/resume`・`/branch`・`/clear` 後 / rewind 後 / DST 終了時の重複時間帯での発火不良が連続して修正されている。古いバージョンで「戻ってこない」場合はまず更新する。

```text
*/5 * * * *    Every 5 minutes (no jitter; runs 15s early)
0 * * * *      Every hour on the hour
7 * * * *      Every hour at 7 minutes past
0 9 * * *      Every day at 9am local
0 9 * * 1-5    Weekdays at 9am local
30 14 15 3 *   March 15 at 2:30pm local
3 9 * * *      Off the hour: one-shots on :00/:30 run up to 90s early
```

対応構文は `*`、単一値、`*/N`、範囲、リスト。曜日は 0 と 7 が日曜。`L`、`W`、`?`、`MON` / `JAN` の別名は非対応。日と曜日を両方指定すると「どちらか一致で発火」(vixie-cron 意味論)。

#### 5.4.3 Jitter

- 繰り返しタスクは間隔の半分まで(最大 30 分)遅れて走る。等間隔スケジュールでは決定的。
- `*/5 * * * *` は特別扱いで 15 秒早く走る(前回から 4 分 45 秒後)。5 分の prompt cache の中に収めるため。
- :00 / :30 の一回限りは最大 90 秒早く走る。タイミングが重要なら `3 9 * * *` のように時・半時から外す。
- CronCreate / CronList の行に次回実行時刻が出るのは v2.1.299+。

### 5.5 Channels: イベントを走っているセッションに push する

#### 5.5.1 契約

channel とは、`capabilities.experimental['claude/channel'] = {}` を宣言し、stdio で `notifications/claude/channel` を `{content, meta}` 付きで送る MCP サーバである。Claude には `<channel source="<server name>" k="v">content</channel>` として届く。`source` はサーバ名から自動で付く(plugin のサーバは `plugin:fakechat:fakechat` のようなスコープ名)。`meta` のキーは識別子(英数字と下線)のみで、ハイフンを含むキーは黙って捨てられる。

```typescript
#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const mcp = new Server(
  { name: 'webhook', version: '0.0.1' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    instructions: 'Events from the webhook channel arrive as <channel source="webhook" ...>. They are one-way: read them and act, no reply expected.',
  },
)

await mcp.connect(new StdioServerTransport())

Bun.serve({
  port: 8788,
  hostname: '127.0.0.1',
  async fetch(req) {
    const body = await req.text()
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: body,
        meta: { path: new URL(req.url).pathname, method: req.method },
      },
    })
    return new Response('ok')
  },
})
```

最小の一方向 channel サーバ(`webhook.ts`)。`instructions` 文字列がルーティング契約で、Claude はこれを読んで返信の要否を判断する。

```json
{
  "mcpServers": {
    "webhook": { "command": "bun", "args": ["./webhook.ts"] }
  }
}
```

`.mcp.json`。その後 `claude --dangerously-load-development-channels server:webhook` で起動し、`curl -X POST localhost:8788 -d "build failed on main: https://ci.example.com/run/1234"` を送ると、Claude には `<channel source="webhook" path="/" method="POST">build failed on main: ...</channel>` が届く。端末には `← webhook: ...` の 1 行で表示され、生のタグは出ない。登録前にフルスクリーンの dev-channel 警告と初回 MCP 同意ダイアログが出る。

#### 5.5.2 配信の意味論

- fire-and-forget。`await mcp.notification()` はトランスポートへの書き込みで解決し、処理完了は保証しない。
- サーバが channel として読み込まれていない、または org policy で遮断されている場合、イベントは黙って捨てられる。
- Claude が busy の間に複数届いたイベントは次のターンでまとめて配信され、順に処理される。独立したストリームを並行処理したいなら別セッションを立てる。
- 配信確認が必要なら、Claude が呼ぶ `reply` ツールをサーバ側で公開する。返信テキストはローカルには表示されない。
- デバッグ: `/mcp` で `failed` なら import エラー。`claude --debug --dangerously-load-development-channels server:webhook` で `~/.claude/debug/<session-id>.txt` に書かれる。`connection refused` なら `lsof -i :<port>`。

#### 5.5.3 有効化とポリシー

- セッションごとに `claude --channels plugin:<name>@<marketplace>`(複数はスペース区切り)。`.mcp.json` にあるだけでは push されない。公式プラグインは `telegram`、`discord`、`imessage`、`fakechat`(`claude-plugins-official`)で、すべて Bun が必要。トークンは `~/.claude/channels/<name>/.env` か環境変数 `TELEGRAM_BOT_TOKEN` / `DISCORD_BOT_TOKEN`。
- 独自 / 未掲載の channel は `--dangerously-load-development-channels plugin:...|server:...`。これはアローリストのみをバイパスし、`channelsEnabled` はバイパスしない。`-p` / SDK では無視される。`--channels` と併用してもバイパスは `--channels` 側のエントリに広がらない。自分のマーケットプレイスのプラグインもアローリスト外なので dev flag が要る。研究プレビュー中はどちらのフラグも `claude --help` に出ない。
- Discord は Message Content Intent と 6 つの権限(View Channels、Send Messages、Send Messages in Threads、Read Message History、Attach Files、Add Reactions)。iMessage は `~/Library/Messages/chat.db` を読むため Full Disk Access と Automation の許可が必要で、無いと `authorization denied` で終了。
- Anthropic 認証(claude.ai または Console key)が必要で、Bedrock / Agent Platform / Foundry では使えない。v2 MCP クライアントランタイムでプロトコル改訂 2026-07-28 をネゴシエートする channel サーバは登録されない。
- channels が研究プレビューを抜けたか、公式アローリストが 4 プラグインから拡大したかは未確認 (未検証)。

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

managed settings。`channelsEnabled` がマスタースイッチで、Team / Enterprise は Owner が有効化するまで遮断、Console API キーの org は managed settings を配布しない限り許可、org に属さない Pro / Max はチェックをスキップ。`allowedChannelPlugins` は Anthropic のアローリストを置換し、`[]` はアローリスト上のすべてを遮断するが dev flag は通る。dev flag まで含めて止めたいなら `channelsEnabled` を未設定のままにする(その場合 MCP サーバ自体は接続しツールも動くが push だけ落ち、起動時に管理者に有効化を頼む警告が出る)。

#### 5.5.4 Permission relay

`claude/channel/permission: {}` も宣言すると、サーバは `notifications/claude/channel/permission_request`(`request_id`、`tool_name`、`description`、`input_preview`)を受け取り、`notifications/claude/channel/permission`(`request_id`、`behavior: 'allow' | 'deny'`)で答えられる。`request_id` は `l` を除く小文字 a〜z の 5 文字(スマホで `1` や `I` と読み違えないため)。端末とリモートのどちらか先に答えた方が勝つ。

```typescript
capabilities: {
  experimental: {
    'claude/channel': {},
    'claude/channel/permission': {},  // opt in to permission relay
  },
  tools: {},
},

const PermissionRequestSchema = z.object({
  method: z.literal('notifications/claude/channel/permission_request'),
  params: z.object({
    request_id: z.string(),
    tool_name: z.string(),
    description: z.string(),
    input_preview: z.string(),
  }),
})

mcp.setNotificationHandler(PermissionRequestSchema, async ({ params }) => {
  send(
    `Claude wants to run ${params.tool_name}: ${params.description}\n` +
    `${params.input_preview}\n\n` +
    `Reply "yes ${params.request_id}" or "no ${params.request_id}"`,
  )
})

const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i
// in inbound handler, after sender gating:
const m = PERMISSION_REPLY_RE.exec(message.text)
if (m) {
  await mcp.notification({
    method: 'notifications/claude/channel/permission',
    params: {
      request_id: m[2].toLowerCase(),
      behavior: m[1].toLowerCase().startsWith('y') ? 'allow' : 'deny',
    },
  })
  return
}
```

公式リレー例の抜粋。capability は送信者が認証されている場合にのみ宣言すること。

- リレーは Bash / Write / Edit 系のツール承認を対象とし、プロジェクト信頼や MCP 同意ダイアログは対象外。
- v2.1.211 以降テキストはサニタイズされ各フィールド 3,500 コードポイント上限。v2.1.234 以降、資格情報は `[REDACTED]`、シリアライズ不能な値は `(value unserializable)`、`false` はオプトアウト(以前は宣言扱いだった)。v2.1.290 以降、セッション内で繰り返された reply ID は無視される。間違った ID の判定は黙って捨てられる。
- テストは Manual mode で行う(`Shift+Tab` で `⏸ manual mode on` まで)。auto mode では classifier が `reply` 呼び出しを判定してしまう。
- 送信者ゲートは送信者 ID(`message.from.id`)で行い、チャット / ルーム ID(`message.chat.id`)で行わない。グループチャットでは両者が異なる。ゲートの無い channel はプロンプトインジェクションの入口であり、relay 対応 channel のアローリストにいる誰もがあなたのセッションでツール実行を承認できる。Telegram / Discord はペアリングコードで初期化(`/telegram:access pair <code>` → `/telegram:access policy allowlist`)、iMessage は自分のアドレスを自動許可し `/imessage:access allow +15551234567` で追加。
- `-p` で channels を動かすと、端末入力が必要なツール(選択式質問、plan mode 承認)は無効化されセッションが止まらない。無人運用で `--dangerously-skip-permissions` を使っても「どの mode も自動承認しない操作」は残る。
- イベントはセッションが開いている間しか届かない。常時稼働にはバックグラウンドプロセスか常駐端末が必要。tmux / systemd / VPS での常駐はサードパーティの手法で公式には記述がない (未検証)。

### 5.6 Routines: クラウドで回す定期・反応型ジョブ

#### 5.6.1 概要

Routines(研究プレビュー。Pro / Max / Team / Enterprise)は、プロンプト + リポジトリ + connectors + 環境を保存した設定で、Schedule / API / GitHub の 3 種のトリガーを組み合わせられる(例: 夜間に走り、デプロイスクリプトからも起動し、新しい PR にも反応する 1 つの PR レビュー routine)。作成は claude.ai/code/routines、Desktop(Routines → New routine → Cloud)、CLI の `/schedule`(別名 `/routines`)。

- permission mode の選択は無く、自律的に動く。connectors はデフォルトで含まれ、書き込みも確認なしで起きるので不要なものは外す。
- 個人アカウントに属し、あなたの GitHub / connector のアイデンティティとして振る舞う。`claude/` 接頭辞のブランチに push する。接続済み GitHub アクセスには branch protection が適用される(アクセスがバイパスできる規則は push を止めない)。
- Owner のトグルで org 全体の有効 / 無効を切り替えられる。
- Scheduled / Run now の実行は確認なしで新しい private artifact を公開することがある(v2.1.292+)。API / GitHub トリガーの実行は常に確認する。

```text
/schedule daily PR review at 9am
/schedule clean up feature flag in one week
/schedule tomorrow at 9am, summarize yesterday's merged PRs
/schedule in 2 weeks, open a cleanup PR that removes the feature flag
/schedule add a GitHub trigger to my nightly review for pull requests opened in acme/webapp
/schedule list
/schedule update
/schedule run
/schedule why did my nightly review do nothing this morning?
```

API トリガーは CLI からは作れない。GitHub トリガーは v2.1.225+ で CLI から追加可能。実行履歴への質問は v2.1.227+。`/schedule` は GitHub アクセスも確認する(v2.1.285 で「GitHub App が未インストール」と誤報する問題を修正)。

#### 5.6.2 Schedule トリガー

プリセットは hourly / daily / weekdays / weekly(ローカル時刻)。最小間隔は 1 時間で、より頻繁な cron は拒否される。カスタム cron は `/schedule update`。正時の実行は数分遅れることがあるので 9:07 のように時刻をずらす。一回限りは発火後に自動で無効化され「Ran」と表示される。一回限りもアカウントの 100/h スケジュール実行上限に数えられる。スケジュールの無い routine には次回実行が無い(v2.1.211 以前は year-1 の表示バグがあった)。

#### 5.6.3 API トリガー

```bash
curl -X POST https://api.anthropic.com/v1/claude_code/routines/$ROUTINE_ID/fire \
  -H "Authorization: Bearer $ROUTINE_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"text": "Sentry alert SEN-4521 fired in prod. Stack trace attached."}'

# GitHub Actions step
# - if: failure()
#   env:
#     ROUTINE_FIRE_URL: ${{ secrets.ROUTINE_FIRE_URL }}
#     ROUTINE_FIRE_TOKEN: ${{ secrets.ROUTINE_FIRE_TOKEN }}
#   run: |
#     curl -X POST "$ROUTINE_FIRE_URL" \
#       -H "Authorization: Bearer $ROUTINE_FIRE_TOKEN" \
#       -H "anthropic-version: 2023-06-01" \
#       -H "Content-Type: application/json" \
#       -d "{\"text\": \"CI failed: $GITHUB_WORKFLOW run $GITHUB_RUN_ID on $GITHUB_REF\"}"

# Response:
# {"type":"routine_fire","claude_code_session_id":"session_01HJKLMNOPQRSTUVWXYZ","claude_code_session_url":"https://claude.ai/code/session_01HJKLMNOPQRSTUVWXYZ"}
```

- `routine_id` はパラメータ名に反して `trig_` 接頭辞。トークンは `sk-ant-oat01-...` で web UI のみで発行、1 回だけ表示、再生成で旧トークンは失効、読み取り権限は無い。
- `anthropic-version: 2023-06-01` のみ受理。`anthropic-beta: experimental-cc-routine-2026-04-01` ヘッダは現在は任意(routines.md の警告ブロックはまだ表示しているが Platform API ドキュメントが正)。
- `text` は最大 65,536 文字。未知のフィールドは無視。セッション作成時点で返り、出力をストリームしたり完了を待ったりしない。
- idempotency key は無い。webhook のリトライは重複セッションを作る。
- エラー: 400(version ヘッダ不正 / text 超過 / routine 一時停止)、401、403、404、429(Retry-After 付き)、500、503(529 ではない)。SDK には無く、claude.ai ユーザー専用。
- fire の `text`(と Run now のテキスト)は `<routine-fire-payload>` ブロックに「untrusted」として包まれて届く。保存済みプロンプトが「Investigate the alert described in the routine-fire-payload block」のように明示的にそのブロックを参照しない限り、テキストは不活性なコンテキストとして扱われる。これが bearer トークン漏洩時の防御線である。v2.1.213 以降、保存済みプロンプト自体は「割り当てられたタスク」として扱われるが、それでも操作への同意にはならない。

#### 5.6.4 GitHub トリガー

- 対象イベントは Pull request と Release のみ(特定アクションまたは全部)。PR フィルタは author、title、body、base / head branch、labels、is draft、is merged。演算子は equals / contains / starts with / is one of / is not one of / matches regex。すべてのフィルタ条件が AND で一致したときに発火。
- `matches regex` はフィールド値「全体」に一致させる。`hotfix` を含む title は `.*hotfix.*`。
- Claude GitHub App が必要(`/web-setup` はインストールしない)。
- routine ごと、アカウントごとの時間あたり上限があり、超えたイベントは捨てられる(数値は非公開)。各イベントは独立したセッションを作り、PR のリポジトリが routine の最初のリポジトリなら PR head commit から始まる。
- 例: `pull_request.opened` に base branch `main` + head branch contains `auth-provider`、`pull_request.closed` に is merged `true`、is draft `false`、labels に `needs-backport`。

#### 5.6.5 上限

| 操作 | 上限 | 単位 | 超過時 |
|---|---|---|---|
| Scheduled 実行 | 100/h | アカウント | 実行は待機 |
| Run now + API fire + 一回限りの再アーム | 30/h | routine ごと(3 つで共有) | 失敗 |
| Run now + 再アーム | 100/h | アカウント | 失敗 |
| API fire | 100/h | アカウント(別カウント) | 429 |

これらに超過課金は無い。サブスクの使用量上限は usage credits で延長できる。サブスク一時停止中は routines も保留。GitHub 接続が切れると最大 72 時間は実行がスキップされ、その後 routine が off になる。

#### 5.6.6 環境とネットワーク

- Default 環境は Trusted network access(デフォルトのアローリストのみ)。他のホストは 403 と `x-deny-reason: host_not_allowed`。connector のトラフィックは Anthropic サーバ経由なのでアローリスト不要。
- 環境変数はその環境を使う全員に見えるので API キーは network secrets に置く。
- セットアップスクリプトの結果はキャッシュされ毎セッション再実行されない。org の self-hosted environment にルーティングすることもできる(v2.1.299 で self-hosted environment を削除するとその routines が即座に off になる)。
- 実行リストの緑のステータスは「セッションがインフラエラー無しに起動・終了した」という意味で、タスク成功ではない。transcript を読むこと。v2.1.302 で routine ページに「前回の実行が始まらなかった理由」のバナーが追加され、cloud セッションが予期せず止まった実行が Completed と出る問題、途中で失敗した実行が 1 時間以上後に最初から再実行される問題が修正された。
- ローカルの `claude mcp add` サーバは connector として出ない。claude.ai の connectors か、コミット済み `.mcp.json`(単一リポジトリの routine)を使う。

#### 5.6.7 `/schedule` が使えないケース

- Console API キー / profile 認証で feature flag が on: `/schedule is available with Claude for Enterprise — ask your admin about migrating from API-key access`
- サインアウト状態: `/schedule requires a claude.ai subscription. Run /login...`(v2.1.268+)
- cloud セッション内: その環境では利用不可と表示
- org policy で cloud セッション無効: `Cloud sessions are disabled by your organization's policy`(v2.1.268+)
- Bedrock / Agent Platform / Foundry ログイン: 素の `Unknown command: /schedule`
- シェルに `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN`、settings.json に `apiKeyHelper` があると claude.ai ログインより優先されるので先に外す。

### 5.7 Desktop scheduled tasks(ローカル定期ジョブ)

Desktop 1.1.5368 以降で Routines → New routine → Local。保存先は `~/.claude/scheduled-tasks/<task-name>/SKILL.md`(名前は小文字 kebab-case のフォルダ名になる)。YAML frontmatter に `name` と `description`、本文がプロンプト。スケジュール、フォルダ、モデル、有効状態はこのファイルには無い。編集は次回実行から反映。

```markdown
# ~/.claude/scheduled-tasks/<task-name>/SKILL.md
---
name: dependency-audit
description: Weekly dependency audit
---
Only review today's commits. If it's after 5pm, skip the review and post a summary of what was missed.
```

ドキュメントはファイル構成を説明するが中身は示していないため、この frontmatter のレイアウトは再構成した例示である (未検証)。本文の文は公式が勧める「見逃し実行用のガードレール」。

- プリセットは Manual / Hourly / Daily / Weekdays / Weekly。15 分ごと、月次、一回限りなどは Desktop の任意のセッションで自然言語で頼む。タスク自身が `update_scheduled_task` MCP ツールで再スケジュールできる。
- 発火するのはアプリが開いていてマシンが起きている間のみ(決定的な数分のスタガー付き)。スケジュールは毎分チェック。スリープからの復帰時には、7 日以内で最も新しい見逃し時刻について「正確に 1 回」だけ追いつき実行し、それより古いものは捨てる(6 日見逃した daily タスクは復帰時に 1 回)。9 時のタスクが 23 時に走りうるので、プロンプトに時刻のガードレールを書く。スキップ理由としては「スリープ中」「前回の実行がまだ進行中」「他の scheduled task が実行中」が記録される。
- permission はタスクごとの mode + `~/.claude/settings.json` の allow rule。「always allow」の承認はタスク単位で保存。`requiresUserInteraction` な MCP ツールは毎回の実行を止める。フォルダは trusted である必要があり、セッション間メッセージングは無い。
- Worktree トグルで各実行を隔離。off だと未コミットの作業ディレクトリ状態に対して走る。
- 削除時に「Also delete files on disk」を選べる。マシンを起こしておくには Settings > This computer > System。

### 5.8 Deep links: 人間をワンクリックで招く

```text
claude-cli://open
claude-cli://open?repo=acme/payments&q=Investigate%20the%20failed%20deploy%20of%20payments-api.%0ACheck%20recent%20commits%20to%20main%20and%20the%20last%20successful%20build.

# runbook markdown
2. [Open Claude Code in the gateway repo](claude-cli://open?repo=acme/web-gateway&q=5xx%20rate%20is%20elevated%20on%20web-gateway.%20Check%20recent%20deploys%2C%20error%20logs%20from%20the%20last%2030%20minutes%2C%20and%20open%20incidents%20in%20Linear.)

# shell
open "claude-cli://open?repo=acme/payments&q=review%20open%20PRs"        # macOS
xdg-open "claude-cli://open?repo=acme/payments&q=review%20open%20PRs"    # Linux
Start-Process "claude-cli://open?repo=acme/payments&q=review%20open%20PRs"  # PowerShell
start "" "claude-cli://open?repo=acme/payments&q=review%20open%20PRs"      # cmd.exe

# settings.json to block registration
{ "disableDeepLinkRegistration": "disable" }
```

- `q` は URL エンコードで最大 5,000 文字(`%0A` が改行)。プロンプトは入力欄に事前入力されるが自動送信はされず、`Prompt from an external link` 警告(1,000 文字超は文字数付き)が出る。
- `cwd`(絶対パス。ネットワーク / UNC パス、`..`、不可視・bidi 文字は拒否)と `repo`(`owner/name`)を両方渡すと `cwd` が勝ち、パスが存在しなくても `repo` は無視される。`repo` は「最後に `claude` を実行した clone / worktree」に解決され(clone と worktree は別々に追跡)、無ければホームディレクトリ。welcome ヘッダに解決されたパスが出る。
- ハンドラは「対話セッションで最初のプロンプトを送った後」に登録される。場所は macOS `~/Applications/Claude Code URL Handler.app`、Linux `$XDG_DATA_HOME/applications`(既定 `~/.local/share/applications`)配下の `claude-code-url-handler.desktop`(`xdg-open` には `xdg-utils` パッケージが必要)、Windows `HKCU\Software\Classes\claude-cli`。`disableDeepLinkRegistration: "disable"` は `claude-cli://` のみを止める。
- 端末の選択: macOS は最後に使った対話端末(iTerm2、Ghostty、kitty、Alacritty、WezTerm、Terminal.app)、Linux は `$TERMINAL` → `x-terminal-emulator` → 既知リスト、Windows は Windows Terminal → PowerShell → cmd の固定順。
- GitHub は README / issue / PR / wiki で `claude-cli://` リンクを剥がす(`[label](claude-cli://...)` がリンク無しの `label` になる)。URL はコードブロックに置く。VS Code 拡張は `vscode://anthropic.claude-code/open`、Claude Desktop は `claude://`。
- 長い runbook プロンプトはリポジトリの skill として保存し、`q` ではその名前だけを呼ぶ。

### 5.9 SDK ホストから見たターンの出自(SDKMessageOrigin)

```typescript
type SDKMessageOrigin =
  | { kind: "human" }
  | { kind: "channel"; server: string }
  | {
      kind: "peer";
      from: string;
      fromMode?: "bypass" | "prompting";
      name?: string;
      fromSession?: string;
      senderTaskId?: string;
      body?: string;
      verifiedPeerPid?: number;
    }
  | {
      kind: "task-notification";
      subkind?: "scheduled-trigger" | "peer-send-message";
      fireReason?: string;
      runId?: string;
    }
  | { kind: "coordinator" }
  | { kind: "auto-continuation" }
  | { kind: "unclassified" };
```

Agent SDK TypeScript リファレンスより。always-on ホストを自作するなら、scheduled / channel 由来のターンと人間入力を `origin` で区別する。`unclassified` は v2.1.223+ で、アプリが自分で設定してはいけない。origin は `SDKResultMessage` にも転送される。前述の通り、`ultracode` を発火させたいなら `{ kind: "human" }` を明示する。

### 5.10 落とし穴と対策

- `ultracode` が効かない: `-p`、scheduled task、channel / webhook リレー、origin 無しの SDK メッセージからは発火しない(v2.1.210+)。無人で workflow を回すなら `Workflow` / `Workflow(<name>)` の allow rule と `scriptPath` 指定の Workflow tool 呼び出しに切り替える。v2.1.299 で settings の `ultracode` が on のとき scheduled task などの headless ターンに Ultracode が告知されない問題は修正されている。
- `/<name>` が補完に出ない: `meta` が純粋なオブジェクトリテラルでない。関数呼び出しやテンプレートリテラルを `meta` から追い出す。編集後は `/reload-skills`。
- `parallel()` に Promise を渡している: thunk `() => agent(...)` を渡す。`parallel()` は reject せず null を返すので `.filter(Boolean)` を忘れない。
- `args.map is not a function`: args を JSON 文字列で渡している。実 JSON 値を渡す。
- `Date.now()` で throw: タイムスタンプや乱数は `args` 経由で注入する。
- 編集後の relaunch で全部再実行される: resume は開始順で再生するため、スクリプト内でエージェントの順序を入れ替えると最初の変更位置以降のキャッシュが無効になる。末尾に追加する形で反復する。
- `nothing to resume`: 以前の run の保存結果が見つからないときだけ出る。新しいセッションでは「再開」ではなく新規実行として最初から走るので、「続きから」を期待するなら `claude --resume` で元セッションに戻る。
- budget 無しで無限ループ: `budget.total` が null だと `remaining()` は Infinity。`while (budget.total && ...)` でガードする。
- auto mode で subagent が止まる: `agent()` のプロンプトは「スクリプトが計算したテキスト」扱いでユーザー依頼と見なされない。必要なツールを事前に allow rule へ。
- `/goal` が永遠に `Not yet met`: 評価モデルは transcript しか見ない。「`npm test` を実行し出力に `0 failing` が含まれる」のように、Claude が結果を表面化せざるを得ない確認手順を条件に書く。
- `/goal` が Manual mode で止まる: `/goal` は permission mode を変えない。auto mode と組み合わせる。`ANTHROPIC_DEFAULT_HAIKU_MODEL` の変更は評価モデル以外の small fast model 用途にも波及する。`disableAllHooks` / `allowManagedHooksOnly` 下では `/goal` 自体が無い。
- cron の時刻がずれる: 繰り返しは最大 30 分遅れ(`*/5` だけ 15 秒早い)、:00 / :30 の一回限りは最大 90 秒早い。`3 9 * * *` のように時・半時から外す。
- セッション cron が消える: 繰り返しタスクは 7 日で期限切れ、見逃し分は追いかけない。self-paced `/loop` と Monitor / バックグラウンド Bash は `--resume` で復元されない。長期運用は routines か Desktop tasks に移す。
- `/loop` のスキルが実行されず平文で届く: `disable-model-invocation: true`(`/verify` 含む)、組み込みコマンド、`skillOverrides` で隠したスキル、`Skill` deny rule、MCP プロンプトは対象外。通常の skill に包み直す。
- channel のイベントが届かない: `.mcp.json` だけでは不十分で `--channels` または dev flag に名前を挙げる必要がある。未登録や org policy 遮断ではエラーなしに捨てられる。`meta` のキーにハイフンがあると黙って落ちる。`-p` / SDK では dev flag が無視される。
- permission relay の権限: アローリストの全員が承認できる。送信者 ID でゲートし、ルーム ID でゲートしない。relay はプロジェクト信頼と MCP 同意を扱わない。
- routine の fire テキストが無視される: `<routine-fire-payload>` は untrusted として包まれるため、保存済みプロンプトでそのブロックを明示的に参照する。
- routine の重複実行: fire に idempotency key は無い。CI 側でリトライを抑止するか、routine 側で「同じ ID のセッションが既にあれば終了」と書く。routine ごとの 30/h(Run now + fire + 再アームで共有)を超えると 429 / 失敗。
- GitHub トリガーが発火しない: 対象は Pull request と Release のみ。`matches regex` は全体一致(`.*hotfix.*`)。`/web-setup` は GitHub App を入れない。時間上限超過のイベントは捨てられる。
- routine が緑なのに何も起きていない: 緑はインフラ的成功。transcript を読む。Default 環境は非アローリストのホストを 403 `host_not_allowed` で拒否する(connectors は例外)。
- `/schedule` が無い: 5.6.7 のケースを確認し、`ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `apiKeyHelper` を外す。
- Desktop task が深夜に走る: スリープ復帰時の 1 回だけの追いつき実行。プロンプトに「17 時以降ならスキップ」のようなガードを書く。`requiresUserInteraction` な MCP ツールは毎回止める。
- deep link が開かない: ハンドラは対話セッションで最初のプロンプトを送るまで登録されない。GitHub は `claude-cli://` を剥がすのでコードブロックに置く。`cwd` が存在しなくても `repo` より優先される。

### 5.11 中級者が次にやること

1. 「監査系」の保存済み workflow を 1 つ作る。`.claude/workflows/` に `meta` + `agent({schema})` で対象リストを取り、`pipeline()` で 1 対象 1 エージェント、`parallel()` は dedup のときだけ、という骨格で書く。`args` で対象ディレクトリと `now` タイムスタンプを受け取り、`.filter(Boolean)` で閉じる。`workflowSizeGuideline` を `small` にして試し、`/workflows` で `s` 保存、`/reload-skills` → `/<name>`。
2. headless 運用に備え、settings.json に `"permissions": {"allow": ["Workflow(<name>)"]}` を入れ、`claude -p` から Workflow tool を `scriptPath` で起動して `~/.claude/projects/` のスクリプトパスと `journal.jsonl` を確認する手順を 1 度通す。
3. `/goal` の条件テンプレートをチームで決める。「終了状態 + 確認コマンド + 出力に現れる文字列 + `or stop after N turns`」の 4 要素を必ず含める。無人なら auto mode と組み合わせ、`CLAUDE_CODE_GOAL_CHECKIN_MINUTES` を調整する。
4. `.claude/loop.md` をリポジトリに置き、bare `/loop` で PR の面倒を見させる。25,000 バイト以内、不可逆操作の条件を明記。短期ポーリングは `/loop 5m`、恒常監視は routines へ移す。
5. CI 失敗 → セッション push のパイプラインを最小構成で作る。5.5.1 の `webhook.ts` を `.mcp.json` に登録し、`--dangerously-load-development-channels server:webhook` で起動、CI の失敗ステップから `curl -X POST localhost:8788` で本文を送る。常時稼働が必要なら 5.5.4 末尾の制約(セッションが開いていること)を前提にバックグラウンドプロセスを用意する(常駐方法は未検証)。
6. 本番アラート → routine fire の経路を作る。claude.ai/code/routines で API トリガーを追加し、`trig_` ID と `sk-ant-oat01-` トークンを CI の secrets に置く。保存済みプロンプトには必ず「routine-fire-payload ブロックに書かれたアラートを調査せよ」と書く。30/h の routine 上限と idempotency 無しを前提に、呼び出し側で重複抑止する。
7. PR レビュー routine に GitHub トリガーを足す。`pull_request.opened` + base branch `main` + is draft `false`、必要なら `.*hotfix.*` の全体一致 regex。Claude GitHub App のインストールを確認し、connectors は最小に絞る。
8. ローカルファイルを触る定期ジョブは Desktop tasks に。`~/.claude/scheduled-tasks/<name>/SKILL.md` をバージョン管理の外に置き、時刻ガードレール入りのプロンプトと Worktree トグルで隔離。
9. runbook に deep link を仕込む。長いプロンプトは repo skill にし、`claude-cli://open?repo=<owner/name>&q=/<skill>` をコードブロックで置く。
10. 常時稼働の最終形は、channels でイベント投入 → `/goal` または `/loop` でそのセッションを働かせ続ける → マシン非依存の仕事は routines(Schedule / API / GitHub) → 単一ステップのスケールは workflow、という分担にする。各層の上限(workflow 1,000 エージェント、cron 50 タスク / 7 日、routine 100/h・30/h)を設計時に明記しておく。

### 出典

- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/goal
- https://code.claude.com/docs/en/scheduled-tasks
- https://code.claude.com/docs/en/channels
- https://code.claude.com/docs/en/channels-reference
- https://code.claude.com/docs/en/routines
- https://code.claude.com/docs/en/desktop-scheduled-tasks
- https://code.claude.com/docs/en/deep-links
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://platform.claude.com/docs/en/api/claude-code/routines-fire
- https://claude.com/blog/introducing-dynamic-workflows-in-claude-code
- https://raw.githubusercontent.com/anthropics/claude-code/main/CHANGELOG.md
- Claude Code 同梱スキル `/workflow-authoring`(v2.1.248+。`budget`、`workflow()`、`opts.phase`、`pipeline()` ステージ引数はこの同梱スキルのみに記載)


---

## 第6章 MCP(Model Context Protocol)

### この章で分かること

MCPはClaude Codeに外部ツール、リソース、プロンプトを接続する標準プロトコルで、Claude Code側はクライアント(`claude mcp serve`を使えばサーバーにもなる)として振る舞います。この章では、4種類のトランスポートと設定ファイルの正確な置き場所、3つのスコープと同名サーバーの優先順位、環境変数展開の規則と資格情報名の変数が空になる仕様、OAuthと`headersHelper`による認証、`.mcp.json`の承認モデル、permissions/hooksからMCPツールを指す際の名前規則、そしてtool search・出力上限・タイムアウト・自動バックグラウンド化といったランタイム挙動を扱います。後半では組織向けの`managed-mcp.json`と`managedMcpServers`、allow/denyリストの評価順、plugin同梱サーバー、Claude Code自身をMCPサーバーとして公開する方法を扱います。対象バージョンは2026年10月16日時点の最新であるv2.1.302までで、バージョン依存の挙動には版番号を付記しています。

### 6.1 トランスポートとエントリの形

Claude Codeが扱うトランスポートは4つです。

| type | 用途 | 備考 |
|---|---|---|
| `http` | リモート(推奨) | Streamable HTTP。JSONでは`streamable-http`も`http`の別名として受理 |
| `sse` | リモート(非推奨) | v2.1.265以降、`http`で接続を試みてサーバーが受け付けなければSSEへ自動で切り替わる |
| `stdio` | ローカルプロセス | `type`を省略したJSONエントリはstdioとして読まれる |
| `ws` | WebSocket | `.mcp.json`または`claude mcp add-json`でのみ設定可。`--transport`は`ws`を受け付けない。認証はヘッダーのみ(OAuth不可) |

`ws`エントリは`http`と同じ`url`、`headers`、`headersHelper`、`timeout`、`alwaysLoad`フィールドを受け付けます。

CLIからの追加は以下の形です。stdioの`--`区切りは必須で、`--`以降はそのままサーバーに渡されます。無いと`--port`のようなサーバー側フラグをClaude Code自身のオプションとして解釈します。

```bash
# Remote HTTP (recommended)
claude mcp add --transport http notion https://mcp.notion.com/mcp

# HTTP with Bearer token
claude mcp add --transport http secure-api https://api.example.com/mcp \
  --header "Authorization: Bearer your-token"

# SSE (deprecated; http auto-falls back to SSE on v2.1.265+)
claude mcp add --transport sse asana https://mcp.asana.com/sse

# Local stdio: everything after -- goes to the server
claude mcp add --env AIRTABLE_API_KEY=YOUR_KEY --transport stdio airtable \
  -- npx -y airtable-mcp-server

# WebSocket: only via add-json / .mcp.json (--transport does not accept ws)
claude mcp add-json events-server \
  '{"type":"ws","url":"wss://mcp.example.com/socket","headers":{"Authorization":"Bearer YOUR_TOKEN"}}'
```

`--env`は複数の`KEY=value`を取るため、直後にサーバー名を置くと名前を次のペアとして読んで拒否されます。上の例のように`--transport stdio`などのオプションを間に挟んでください。短縮形は`-s`/`--scope`、`-e`/`--env`、`-t`/`--transport`、`-H`/`--header`です。

```bash
claude mcp add -t http -s user -H "Authorization: Bearer TOKEN" my-api https://api.example.com/mcp
```

`add-json`はJSONエントリをそのまま登録します。`env`と`oauth`オブジェクトの形は次の通りです。

```bash
claude mcp add-json weather-api '{"type":"http","url":"https://api.weather.com/mcp","headers":{"Authorization":"Bearer token"}}'
claude mcp add-json local-weather '{"type":"stdio","command":"/path/to/weather-cli","args":["--api-key","abc123"],"env":{"CACHE_DIR":"/tmp"}}'
claude mcp add-json my-server '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"callbackPort":8080}}'
```

`claude mcp add`は資格情報を検証せずに保存します。`Added ...`は「書き込んだ」であって「接続できた」ではありません。必ず`claude mcp list`または`/mcp`で状態を確認してください。

#### JSONエントリの落とし穴

`url`があって`type`が無いエントリは設定エラーです。Claude Desktop/Cursorの設定をコピーすると起こりやすく、該当サーバーをスキップして次のメッセージを出します。

```text
MCP server "<name>" has a "url" but no "type"; add "type": "http" (or "sse" / "ws") to this entry
```

`"type": "sdk"`のエントリも設定ファイルでは無視されます(in-processサーバーを登録できるのはSDKホストアプリのみ、v2.1.274以降は警告付きでスキップ)。

### 6.2 スコープと設定ファイルの実体

スコープは3つで、格納先は2ファイルです。

| scope | 格納先 | 用途 |
|---|---|---|
| local(既定) | `~/.claude.json`の`projects["<path>"].mcpServers` | 自分だけ、このプロジェクトだけ |
| project | プロジェクトルートの`.mcp.json` | リポジトリにコミットしてチーム共有 |
| user | `~/.claude.json`のトップレベル`mcpServers` | 自分の全プロジェクト |

```bash
# local (default) -> ~/.claude.json under projects["<path>"]
claude mcp add --transport http stripe https://mcp.stripe.com
# project -> .mcp.json in project root (commit it)
claude mcp add --transport http shared-server --scope project https://example.com/mcp
# user -> ~/.claude.json top-level mcpServers
claude mcp add --transport http hubspot --scope user https://mcp.hubspot.com/anthropic

claude mcp list
claude mcp get notion
claude mcp remove notion            # add --scope local if name exists in several scopes
claude mcp login sentry            # OAuth from the shell; --no-browser over SSH
claude mcp logout sentry
claude mcp reset-project-choices   # reset .mcp.json approval decisions
claude mcp add-from-claude-desktop # macOS / WSL only
/mcp                               # inside a session; /mcp reconnect all (v2.1.284+)
```

localスコープのエントリが`~/.claude.json`にどう保存されるかは次の通りです。

```json
{
  "projects": {
    "/path/to/your/project": {
      "mcpServers": {
        "stripe": {
          "type": "http",
          "url": "https://mcp.stripe.com"
        }
      }
    }
  }
}
```

重要な名前の衝突があります。「MCPのlocalスコープ」は`.claude/settings.local.json`ではありません。また`~/.claude/mcp.json`、`~/.claude/.mcp.json`、`~/.claude/config/mcp.json`、`%APPDATA%\Claude\mcp.json`はいずれも読まれません。スコープを後から変更する手段は無く、removeしてから再addします。

#### 同名サーバーの優先順位

同じサーバーが複数箇所で定義されている場合、Claude Codeは最優先ソースの定義で1回だけ接続します。エントリ全体がその定義から取られ、フィールドのマージは行われません。

1. Local
2. Project
3. User
4. Plugin提供サーバー
5. claude.aiコネクタ

さらに管理設定の`managedMcpServers`はこれら全てに優先し、`managed-mcp.json`は`managedMcpServers`との名前衝突で勝ちます。local/project/userの重複は名前で、plugin/コネクタはエンドポイント(URLまたはコマンド)で照合されます。URLはスキーム/ホストの大文字小文字、既定ポート(`:443`など)、末尾スラッシュだけが異なれば同一とみなされます。なおDesktopアプリのCodeタブでは、`~/.claude.json`トップレベル(user)の同名stdioサーバーが`.mcp.json`に勝つ例外があります。

同じ名前を2スコープで別エンドポイントに向けると警告が出ます。OAuthサインインはエンドポイント単位で保存されるため、プロジェクトごとに別途認証が必要になります。

### 6.3 環境変数展開と資格情報の遮断

`.mcp.json`、`~/.claude.json`、plugin設定のエントリでは`command`、`args`、`env`、`url`、`headers`に次の展開が効きます。

* `${VAR}`: 環境変数`VAR`の値
* `${VAR:-default}`: `VAR`が設定されていればその値、無ければ`default`

```json
{
  "mcpServers": {
    "api-server": {
      "type": "http",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

未設定でデフォルトも無い変数は、設定自体は読み込まれ、`claude mcp list`で欠落警告が出て、`${VAR}`の文字列がそのまま使われます。`/mcp`や`claude mcp list/get`は参照を名前で表示し、解決後の値は見せません(`/mcp`はv2.1.268以降)。

#### 資格情報名の変数はリモートサーバーに向けて空になる

リポジトリの`.mcp.json`が自分のClaude Codeやクラウドの資格情報を任意のサーバーへ送り出すのを防ぐため、`ANTHROPIC_API_KEY`、`ANTHROPIC_AUTH_TOKEN`、`AWS_BEARER_TOKEN_BEDROCK`、`HTTPS_PROXY`、`NPM_TOKEN`などの資格情報名の変数は、リモートサーバーの`url`/`headers`で参照すると設定の有無に関わらず空として読まれ、`:-default`も無視されます。`Bearer ${ANTHROPIC_AUTH_TOKEN}`と書くとサーバーには`Bearer `だけが届き、通常は`401`で拒否されます。`${ANTHROPIC_BASE_URL}`は展開されます。

対策は、秘密を自前の名前の変数(例`MY_TOKEN`)にコピーしてそれを参照することです。切り分けには`claude --debug-file /tmp/claude-debug.log`で`never expanded toward a remote server`をgrepします。

#### CLAUDE_PROJECT_DIRとroots

stdioサーバーのプロセス環境には`CLAUDE_PROJECT_DIR`が設定されます。これはClaude Code自身の環境ではなくサーバー側の環境なので、`.mcp.json`や`~/.claude.json`から`${CLAUDE_PROJECT_DIR}`と参照するなら`${CLAUDE_PROJECT_DIR:-.}`のようにデフォルトが必要です。plugin設定ではプレースホルダとして直接置換されます。

Claude CodeはMCPの`roots/list`に対して、起動ディレクトリと`--add-dir`/`/add-dir`/`additionalDirectories`で許可した全ディレクトリを返し、集合が変わると`notifications/roots/list_changed`を送ります。ファイルシステムアクセスをスコープするサーバーは`roots/list`を実装すべきです。

### 6.4 認証: OAuth、headersHelper、コネクタ

#### OAuth

リモートサーバーが`401`/`403`を返すとClaude Codeはそのサーバーを要認証としてマークします。サインイン済みサーバーが`401`を返した場合は保存済みトークンをリフレッシュして再接続し、1回だけリトライします。`/mcp`でフラグが立つのはそのリトライも失敗したときだけです。Dynamic Client RegistrationとCIMDに対応し、シェルからは`claude mcp login <name>`(SSH越しは`--no-browser`)で駆動できます。

```bash
# Fixed callback port with dynamic client registration
claude mcp add --transport http --callback-port 8080 my-server https://mcp.example.com/mcp

# Pre-registered client credentials (--client-secret prompts with masked input)
claude mcp add --transport http \
  --client-id your-client-id --client-secret --callback-port 8080 \
  my-server https://mcp.example.com/mcp

# CI: supply the secret via env var
MCP_CLIENT_SECRET=your-secret claude mcp add --transport http \
  --client-id your-client-id --client-secret --callback-port 8080 \
  my-server https://mcp.example.com/mcp

# JSON form
claude mcp add-json my-server \
  '{"type":"http","url":"https://mcp.example.com/mcp","oauth":{"clientId":"your-client-id","callbackPort":8080}}' \
  --client-secret
```

リダイレクトURIは`http://localhost:PORT/callback`の形です(v2.1.229が一時的に`127.0.0.1`を使い完全一致サーバーを壊したが、v2.1.231で修正)。`--callback-port`の代わりに`MCP_OAUTH_CALLBACK_PORT`環境変数も使えます。クライアントシークレットはキーチェーン/資格情報ファイルに保存され、add時にしか設定できないため、変更はremoveして再addします。OAuthフラグはHTTP/SSEにのみ適用され、`claude mcp remove`は保存済みトークンとクライアント登録も削除します。

ヘッドレス実行(`-p`/SDK)はOAuthフローを起動できないので、先に対話セッションか`claude mcp login`で認証しておきます。`headers.Authorization`を設定していてそれが拒否された場合、OAuthへフォールバックせず接続失敗として報告されます。

スコープのピン留めとメタデータの上書きは`oauth`オブジェクトで行います。

```json
{
  "mcpServers": {
    "slack": {
      "type": "http",
      "url": "https://mcp.slack.com/mcp",
      "oauth": {
        "scopes": "channels:read chat:write search:read"
      }
    },
    "my-server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "oauth": {
        "authServerMetadataUrl": "https://auth.example.com/.well-known/openid-configuration"
      }
    }
  }
}
```

(公式ドキュメントの2つの例を1ファイルにまとめた合成例。)`oauth.scopes`はスペース区切りの1文字列で、`authServerMetadataUrl`と`/.well-known`で発見した`scopes_supported`の両方に優先します。広告されていれば`offline_access`が自動付与されます。`oauth.scopes`未設定時、自動発見したメタデータの`scopes_supported`全体は要求されませんが、設定した`authServerMetadataUrl`から取得したメタデータの`scopes_supported`は要求スコープとして使われます。`authServerMetadataUrl`は`https://`必須で、既定の発見チェーン(RFC 9728の`/.well-known/oauth-protected-resource`、次にRFC 8414の`/.well-known/oauth-authorization-server`)をバイパスします。ツール呼び出しが後から`403 insufficient_scope`を返した場合、エラーに不足スコープ名が入ります(v2.1.274以降)が、Claude Codeはピン留めしたスコープを要求するので、`oauth.scopes`に追加してから再認証する必要があります。

v2ランタイム(後述)では、トークンエンドポイントがlocalhost/127.0.0.1/::1以外の平文`http://`だと`Refusing to send credentials to non-https token endpoint`でサインインに失敗し、issuer不一致は`Issuer mismatch in authorization response`で失敗します(v2.1.221以降)。LAN上の開発サーバーで両チェックを回避したいときは`MCP_SDK_GENERATION=v1 claude`です。

#### headersHelper

静的な`headers`では済まない認証(短命トークン、社内のトークン発行コマンドなど)には`headersHelper`を使います。

```json
{
  "mcpServers": {
    "internal-api": {
      "type": "http",
      "url": "https://mcp.internal.example.com",
      "headersHelper": "/opt/bin/get-mcp-auth-headers.sh"
    },
    "internal-api-inline": {
      "type": "http",
      "url": "https://mcp.internal.example.com",
      "headersHelper": "echo '{\"Authorization\": \"Bearer '\"$(get-token)\"'\"}'"
    }
  }
}
```

(スクリプト形とインライン形は公式では別ブロックで同名`internal-api`として示されている合成例。)規則は次の通りです。

* コマンドはシェルで実行され、文字列のキー/値を持つJSONオブジェクトをstdoutに出力しなければならない。10秒で打ち切り
* 接続と再接続のたびに毎回実行され、キャッシュされない
* 出力は同名の静的`headers`を上書きし、`Authorization`を返せばOAuthはスキップされる
* ツール呼び出し中の`401`/`403`ではhelperを再実行し、再接続して1回リトライする
* 環境変数として`CLAUDE_CODE_MCP_SERVER_NAME`、`CLAUDE_CODE_MCP_SERVER_URL`、(pluginのみ)`CLAUDE_PLUGIN_ROOT`を受け取る
* 作業ディレクトリは定義元に依存する: pluginはpluginルート、`.mcp.json`/localスコープはプロジェクトディレクトリ、agentファイル/SDK/`--mcp-config`はプライマリcwd、userスコープ/managed/コネクタは`~/.claude`

セキュリティ上の制約として、プロジェクト`.mcp.json`とplugin由来のhelperは、名前にTOKEN/SECRET/PASSWORD/KEY/AUTHを含む変数と`ANTHROPIC_CUSTOM_HEADERS`などの固定リストの変数を環境から取り除かれて実行されます(user/local/managed/SDKのサーバーは保持)。このとき渡される`CLAUDE_CODE_MCP_SERVER_URL`のうち、取り除かれた変数の値を含む部分は`REDACTED`に置き換えられます。さらにプロジェクト/localのhelperはそのフォルダの信頼ダイアログを受諾した後にしか実行されず(親フォルダの信頼では不十分)、それまでは静的ヘッダーのみで接続します。ダイアログ無しで信頼するには`~/.claude.json`の`projects["<path>"].hasTrustDialogAccepted`を`true`にします。pluginの`headersHelper`はシェル解釈されるため`${user_config.*}`を使えません。それらは`headers`側に置きます。

#### claude.aiコネクタ

claude.aiで接続したコネクタは、アクティブな認証方式がclaude.aiサブスクリプションログインのときだけ自動で取り込まれます。`ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN`/`apiKeyHelper`、Bedrock/Vertex/Foundry、プロファイル/フェデレーション、`claude setup-token`で得た`CLAUDE_CODE_OAUTH_TOKEN`が有効なときは、過去に`/login`していても読み込まれません。`/status`で現在の認証方式を確認できます。

ツール名は`mcp__claude_ai_<server>__<tool>`です。全体を止めるには`"disableClaudeAiConnectors": true`(どこかのソースで`true`なら有効、プロジェクトの`false`でuser/policyの`true`を覆せない)または`ENABLE_CLAUDEAI_MCP_SERVERS=false`。個別に止めるには`deniedMcpServers`に`"claude.ai Slack"`のような表示名の`serverName`かURLパターンを置くか、`/mcp`でプロジェクトごとにトグルします。同じURLをローカルで追加するとコネクタ側は隠れます。Microsoft 365、Gmail、Google CalendarのようなAnthropicホストのコネクタは`claude mcp add`からのローカルOAuthを受け付けないので、claude.ai/customize/connectorsで接続します。

コネクタの届き方は面ごとに異なります。ターミナル/VS Code/JetBrains/SDKはclaude.aiから取得し(MCP設定とmanaged MCPの統制下)、クラウドセッションはクラウドホストからURLを書き換えるプロキシ経由で受け取り(コネクタ本来のURL向けに書いた`serverUrl`許可パターンはプロキシ後URLに一致しない)、Desktopアプリのlocal/SSHセッションはin-processの`type: "sdk"`サーバーとして受け取るため、どのMCP設定も`managed-mcp.json`も届きません。組織のツール単位制御は`ask`(auto/bypassでも毎回プロンプト、dontAskでは拒否、allowルール無視)と`blocked`(ツール一覧から除去、`/mcp`に`disabled by your organization`)ですが、Desktopのlocal/SSHでは`ask`は届かず通常のpermissionルールが適用され、`blocked`は配信前にDesktopアプリ側で差し止められます。

v2.1.222以降、claude.aiがClaude Codeのログイントークンを`401`で拒否した場合、コネクタ自身にはフラグが立たない「session token rejected」状態になります。コネクタを再認可しても直りません。`/login`してから`/mcp`でReconnectします。

### 6.5 プロジェクト`.mcp.json`の承認モデル

projectスコープのサーバーは、リポジトリに同梱されたものが勝手に起動すると危険なため、対話的な承認を要求します。承認結果は`.claude/settings.local.json`に次のキーで書かれます。

```json
{
  "enableAllProjectMcpServers": true,
  "enabledMcpjsonServers": ["memory", "github"],
  "disabledMcpjsonServers": ["filesystem"],
  "disableClaudeAiConnectors": true
}
```

(説明用の合成例。`enableAllProjectMcpServers: true`があれば`enabledMcpjsonServers`は冗長。)評価規則は次の通りです。

* `disabledMcpjsonServers`は両方のenable設定に常に優先する
* 信頼済みフォルダでは、上位ファイルの`enableAllProjectMcpServers: false`が下位の`true`を上書きする。未信頼フォルダでは、信頼されるファイル(user、managed、`--settings`)のどれかに`true`があれば十分
* クローンしたリポジトリは自分のサーバーを自己承認できない。`.claude/settings.json`にコミットされた`enableAllProjectMcpServers`/`enabledMcpjsonServers`は未信頼フォルダでは無視され、`claude mcp list`は`⏸ Pending approval`のまま。`claude`を起動して信頼ダイアログを受諾する
* `claude -p`、Agent SDK、クラウドセッションはプロンプトを出せないため、projectサーバーを確認なしで読み込む(bypassPermissionsと`skipDangerousModePermissionPrompt`の組み合わせでも同様)。それでも止めたい場合は`disabledMcpjsonServers`、`--setting-sources`、`--strict-mcp-config`を使う
* `claude mcp reset-project-choices`で承認をリセットする

ここで混同しやすいのが`disabledMcpServers`/`enabledMcpServers`です。これらは`~/.claude.json`にプロジェクト単位で書かれる、`/mcp`パネルのトグル結果です。`disabledMcpServers`はuserサーバー、pluginサーバー、managedサーバー、claude.aiコネクタ(表示名で格納、例`claude.ai Slack`)、既定オンの組み込みサーバーのオプトアウトリストで、`enabledMcpServers`は`computer-use`のような既定オフの組み込みのオプトインリストです。サーバーごとにどちらか一方のリストしか参照されず、通常のサーバーを`enabledMcpServers`に書いても無視されます。`.mcp.json`の承認を司る`disabledMcpjsonServers`/`enabledMcpjsonServers`とは無関係です。

agentファイル(`.claude/agents/`)にインラインで宣言したMCPサーバーも`.mcp.json`と同じ信頼規則に従い、プロジェクトか`--add-dir`ディレクトリが信頼されるまで一切読み込まれません。

### 6.6 ツール名、permissions、hooks

#### 名前規則

MCPツールは`mcp__<server>__<tool>`という名前でClaudeに提示されます。サーバー名の`A-Z a-z 0-9 _ -`以外の文字は`_`に置き換わるので、`my.server`は`mcp__my_server__*`になります。plugin同梱サーバーは`mcp__plugin_<plugin-name>_<server-name>__<tool>`の形で、`plugin:<plugin>:<server>`として登録されます。素のサーバーキー(`mcp__database-tools__.*`)で書いたhookのmatcherはplugin同梱サーバーには決して発火しません。フルネームが128文字を超えるツールはAPIがリクエストを拒否するため、Claudeに送るツール一覧から外されます(2.1.292以降はそのツール名を挙げたエラーメッセージが出る。`/mcp`でツールを選ぶと全名が見える)。

#### permissionルール

```json
{
  "permissions": {
    "allow": [
      "mcp__puppeteer",
      "mcp__puppeteer__*",
      "mcp__github__get_*",
      "mcp__puppeteer__puppeteer_navigate",
      "mcp__plugin_my-plugin_database-tools__*",
      "mcp__reports__v2__*"
    ]
  }
}
```

`mcp__server`と`mcp__server__*`はどちらもサーバー全体、`mcp__server__tool`は1ツールです。allowルールのglobはリテラルな`mcp__<server>__`プレフィックスの後にしか書けません。`"*"`、`"B*"`、`"mcp__*"`をallowに書くと警告付きでスキップされ、何も自動承認しません。一方deny/askはアンカー無しのglobを受け付け、denyの`"mcp__*"`は全MCPツールをClaudeのコンテキストから取り除きます。

```json
{
  "permissions": {
    "deny": ["mcp__*"]
  }
}
```

正規化後の名前に`__`を含むか`_`で終わるサーバー(例`reports__v2`)は`mcp__reports__v2__*`の形でしか指せません。v2.1.299以降、`mcp__reports__v2`は`reports`というサーバーのルールとして読まれ、`mcp__a`が`a__b`や`a_`に一致することもなくなりました(deny/askの同種の不具合も同時に修正)。agentの`tools:`リストも同じ扱いです。`mcp__x__y(param:value)`のようなパラメータ照合ルールは設定ファイルからは読み込まれずスキップされます。必要なら`--disallowedTools`で渡します。

#### hooksからMCPツールを指す、hooksからMCPツールを呼ぶ

hookのmatcherは正規表現です。`mcp__memory`や`mcp__brave-search`は完全一致文字しか含まないので完全一致として比較され、どのツールにも一致しません。サーバー全体なら`mcp__memory__.*`、全サーバーの書き込み系なら`mcp__.*__write.*`です。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "mcp__memory__.*",
        "hooks": [
          { "type": "command", "command": "echo 'Memory operation initiated' >> ~/mcp-operations.log" }
        ]
      },
      {
        "matcher": "mcp__.*__write.*",
        "hooks": [
          { "type": "command", "command": "/home/user/scripts/validate-mcp-write.py" }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "mcp_tool",
            "server": "my_server",
            "tool": "security_scan",
            "input": { "file_path": "${tool_input.file_path}" }
          }
        ]
      }
    ]
  }
}
```

v2.1.274以降、PreToolUse/PostToolUse/PostToolUseFailure/PermissionRequest/PermissionDeniedのhook入力には`mcp_server`オブジェクト(`name`と`source`)が入ります。`source`は`plugin`、`sdk`、`user`/`project`などで、信頼判断は名前のプレフィックスではなく`source`に基づかせるのが公式の推奨です。PostToolUseの`updatedMCPToolOutput`はMCPツール出力を置き換えます(`updatedToolOutput`推奨)。MCP出力はスキーマ検証なしで素通しされます。

`type: "mcp_tool"`のhookはhook自身がMCPツールを呼びます。pluginサーバーなら`server`は`plugin:<plugin>:<server>`のスコープ付き名で指定します。起動時の`SessionStart`(`--continue`/`--resume`含む)と全ての`Setup`はMCPサーバーがhookから使えるようになる前に発火するため、その`mcp_tool` hookは呼ばずにスキップされます。`/clear`やcompaction後に再度`SessionStart`が発火したときは実行されます。PreToolUse/Stopのようなブロッキングイベントでは接続中のサーバーをhookタイムアウト内で`MCP_TIMEOUT`まで待ち、観測系イベントでは待ちません。`cached`状態のサーバーはhookが呼んだ時点で接続します。hookがOAuthを開始することは決してありません。呼んだツールの`isError: true`は非ブロッキングエラー扱いです。既定タイムアウトは600秒(UserPromptSubmitは30秒)。

### 6.7 tool search、alwaysLoad、説明文の上限

tool searchは既定でオンです。起動時に読み込まれるのはツール名とサーバーinstructionsだけで、ツール定義は`ToolSearch`ツールで必要時に取得されます。`ENABLE_TOOL_SEARCH`の値は次の通りです。

| 値 | 挙動 |
|---|---|
| 未設定 | 全MCPツールを遅延。`ANTHROPIC_BASE_URL`がファーストパーティ以外、Opus 4/Sonnet 4より前のモデル、Agent PlatformでOpus/Sonnet/Haiku 4.5より前、AzureホストのMicrosoft Foundry(サーバー側拒否、上書き不可)では事前読み込みに戻る |
| `true` | プロキシ越しでも遅延を維持(プロキシが`tool_reference`ブロックを落とすと失敗) |
| `auto` | 閾値モード: 定義の合計がコンテキストウィンドウの10%未満なら事前読み込み、10%に達したら全て遅延 |
| `auto:N` | 閾値をN%に(0から100)。例`auto:5` |
| `false` | 全て事前読み込み |

`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`は強制オフ(v2.1.227以降は管理設定で維持可)、HIPAA構成は上書き不可の強制オフです。permissionsで`ToolSearch`をdenyしてもオフにできます。

```json
{
  "permissions": {
    "deny": ["ToolSearch"]
  }
}
```

tool searchがオフのとき、Claudeは接続中サーバーを`WaitForMcpServers`ツールで待ちます。また、tool searchがオンならどのサーバーがなぜ失敗したかがClaudeに伝えられますが、オフでは伝えられません。ターンの途中で接続完了したサーバーのツール名は、同じターン内の次のリクエストでClaudeに提示されます(v2.1.300ではcompaction後の接続時も即座に通知)。

#### alwaysLoad

```json
{
  "mcpServers": {
    "core-tools": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "alwaysLoad": true,
      "timeout": 600000
    },
    "big-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@example/mcp-server"],
      "alwaysLoad": false
    }
  }
}
```

(公式の3つのスニペットを1ファイルにした合成例。)`alwaysLoad: true`はそのサーバーを遅延の対象外にし、最初のプロンプトを組み立てる時点でツールが必要になるため、起動がそのサーバーを待つようになります(既定の接続タイムアウト5秒、`MCP_CONNECT_TIMEOUT_MS`が上限、discovery cacheから提供される場合を除く)。毎ターン必要な少数のツールにだけ使ってください。`alwaysLoad: false`(v2.1.287以降)は作者が`anthropic/alwaysLoad`を付けたツールも含めて全ツールをtool searchの背後に押し込みます。サーバー作者側は`tools/list`の各ツールに`_meta["anthropic/alwaysLoad"]`を付けられ、ツールレベルの`false`は`--mcp-config`/SDK/pluginサーバーでユーザーがサーバーレベル`true`を設定しても遅延のままです(v2.1.285以降)。

#### 説明文とinstructionsの上限

* サーバーinstructionsと、事前読み込みされるツールの説明: 4,096文字
* tool search経由で読み込まれるツールの説明: 16,384文字

v2.1.296より前は短い方の上限が2,048で、v2.1.295より前はそれが全説明に適用されていました。`CLAUDE_CODE_MAX_MCP_DESCRIPTION_LENGTH`は両方を置き換えます。`api.anthropic.com`でAnthropicがホストするサーバーの一部は対象外で全文が届きます。tool searchはClaudeの検索語を短い方の上限内の説明に対して照合するため、サーバー作者は検索キーワードを説明の先頭に置くべきです。`/context`はv2.1.283以降、MCPサーバーinstructionsを独立した行として表示します。

接続した各サーバーは、ツール名とinstructionsが毎セッション読み込まれる分だけコンテキストを消費します。公式の指針は使わないサーバーを削除することです。第三者のガイドにある「tool searchで最大95%削減」のような数値は公式には裏付けがありません(未検証)。

### 6.8 リソースとプロンプト

MCPリソースは`@server:protocol://resource/path`で参照し、`@`補完であいまい検索できます。取得内容は添付としてコンテキストに入ります。

```text
Can you analyze @github:issue://123 and suggest a fix?
Review the API documentation at @docs:file://api/authentication
Compare @postgres:schema://users with @docs:file://database/user-model
```

`ListMcpResourcesTool`と`ReadMcpResourceTool`は組み込みツールで権限プロンプトを出しません。MCP Apps UIリソース(`ui://` URIまたは`text/html;profile=mcp-app`メディアタイプ)は`@`候補と一覧ツールから隠されますが、URI指定で読めます。

MCPプロンプトは`/servername:promptname (MCP)`としてスラッシュコマンドに並び、`/mcp__servername__promptname [args]`でも実行できます。引数は空白で分割され、結果は会話に直接注入されます。後者の形ではサーバー名の`[A-Za-z0-9_-]`以外が`_`になります。`anthropic-skills`という名前のサーバーはプロンプトを一覧しません(予約名。2.1.282で`claude-ai`も一時予約されたが2.1.283で撤回)。

### 6.9 出力上限、タイムアウト、バックグラウンド化、再接続

#### 出力上限

* 10,000トークンで警告(固定)
* `MAX_MCP_OUTPUT_TOKENS`既定25,000。超過した結果は`~/.claude/projects/<session>/tool-results/`配下のファイルに保存され、パスに置き換わる
* `anthropic/maxResultSizeChars`を宣言しないツールの、画像を含まない成功結果は、トークン数に関係なく50,000文字を超えるとファイルに保存される。`MAX_MCP_OUTPUT_TOKENS`ではこの閾値は変わらない
* サーバー作者は`_meta["anthropic/maxResultSizeChars"]`で閾値を最大500,000まで引き上げられる。画像データはトークン上限の方に計上される
* `isError: true`で約11,000文字を超える結果は先頭5,000と末尾5,000に切り詰められる
* HTTP/SSEは展開後16 MiBを超えるJSONボディ/イベントでリクエスト失敗、WebSocketは16 MiB超のメッセージで接続が閉じる(v2.1.295以降)
* ツールが返した画像(PNG/JPEG/GIF/WebP)はインライン表示に加えファイル保存される(v2.1.283以降、セッション永続化が無効でなければ)

サーバー作者向けの`_meta`注釈を1つにまとめると次の形です(公式では`get_schema`、`search_tickets`、`grant_access`の3つの別例)。

```json
{
  "name": "get_schema",
  "description": "Returns the full database schema",
  "_meta": {
    "anthropic/maxResultSizeChars": 200000,
    "anthropic/alwaysLoad": true,
    "anthropic/requiresUserInteraction": true
  }
}
```

`anthropic/requiresUserInteraction: true`(JSONの真偽値`true`であること)を付けたツールは、`acceptEdits`、`auto`、`bypassPermissions`でも毎回権限プロンプトを出し、「今後確認しない」の選択肢を出さず、一致するallowルールもプロンプトを省略しません。プロンプトを出さない`dontAsk`では呼び出し自体が拒否され、`--permission-prompt-tool`でも承認できません。Remote ControlとSDK面ではワンタップ承認を出さずフルプロンプトを表示します(v2.1.214以降)。Agent SDKの`canUseTool`コールバックは承認できます。同意や権限付与のようなツールに使う前提です。

#### タイムアウト

| 変数/フィールド | 既定 | 意味 |
|---|---|---|
| `MCP_TIMEOUT` | 30000 ms | サーバー起動タイムアウト |
| `MCP_TOOL_TIMEOUT` | 100000000 ms(約28時間) | ツール実行の壁時計上限 |
| サーバーごとの`timeout`(ms) | 無し | 1000以上のみ有効(未満は無視)。そのサーバーの`MCP_TOOL_TIMEOUT`を上書きし、idle窓の下限にもなる |
| `CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT` | ネットワーク5分 / stdio 30分 | 応答もprogress通知も無い時間。`0`で無効。1000未満は1秒に切り上げ、有効な`MCP_TOOL_TIMEOUT`が上限 |
| `MCP_CONNECT_TIMEOUT_MS` | 5000 ms | 起動時に接続を待つ上限 |
| `MCP_CONNECTION_NONBLOCKING=0` | | 起動時に接続完了を待つ。`-p`で`--input-format stream-json`無しなら設定に関係なく待つ |
| `MCP_SERVER_CONNECTION_BATCH_SIZE` / `MCP_REMOTE_SERVER_CONNECTION_BATCH_SIZE` | 3 / 20 | 並列接続数(stdio / リモート) |
| `CLAUDE_CODE_MCP_STARTUP_WAIT_MS` | | ヘッドレス初回ターンの待ち上限(v2.1.274以降) |

HTTP/SSE/コネクタサーバーにはリクエストごとの初回バイトタイマーがあり、max(60秒, 適用されるツールタイムアウト, `MCP_TIMEOUT`)です。60秒未満には縮められず、stdio/wsにはありません。progress通知は壁時計上限を延ばしませんがidle窓はリセットするので、長時間動くサーバーはprogress通知を送るべきです。idleタイムアウトはIDEサーバーとSDK in-processサーバーには適用されません。

#### 自動バックグラウンド化

メイン会話のMCPツール呼び出しが2分を超えて実行中なら、セッションをブロックする代わりにバックグラウンドタスクに移ります(v2.1.212以降)。ClaudeはタスクIDを即座に受け取って作業を続け、結果はタスク通知として届き、`/tasks`に表示されます。`CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS`で閾値変更、`0`で無効、`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`でも無効です。subagentからの呼び出し、IDEサーバー、非対話実行(`CLAUDE_AUTO_BACKGROUND_TASKS=1`を除く)、elicitationダイアログで止まっている呼び出しはバックグラウンド化されません。バックグラウンドでも壁時計/idle上限は効きます。タスクを停止してもサーバー側の処理が止まる保証はありません。

#### 再接続

* セッション中に切れたリモートサーバーは1秒から倍々の指数バックオフで最大5回再試行
* 初回接続の一時的失敗(5xx、接続拒否、タイムアウト)は3回再試行。認証エラーと404は再試行しない(`headersHelper`が唯一のAuthorizationソースの場合を除く)
* stdioサーバーとWebSocketの初回接続は自動再接続しない
* `tools/list`/`prompts/list`/`resources/list`の発見リクエストは一時的エラーで3回再試行、認証/4xx/タイムアウトでは再試行しない
* `-p`/SDKではHTTP/SSEサーバーがバックグラウンドで約30分まで再試行を続ける
* `/mcp reconnect all`で全サーバーを再試行(v2.1.284以降)
* 再開したセッションでは、初回接続試行中のサーバーへのツール呼び出しを最大10秒保留し、間に合わなければ`No such tool available`(v2.1.284以降)

#### discovery cache

`/mcp`に`cached 2h ago · connects on first use · 5 tools`と出るのがdiscovery cacheです。以前使ったリモートHTTP/SSEサーバーのツール一覧をキャッシュから読み、最初のツール呼び出しで遅延接続します。既定はオフで、段階的ロールアウトで有効化されたアカウントのみオン(v2.1.238より前は既定オン)。`MCP_DISCOVERY_CACHE=1`/`0`で強制、`MCP_DISCOVERY_CACHE_TTL_S`既定900、`MCP_DISCOVERY_CACHE_MAX_STALE_S`既定14400(上限7日)、`MCP_DISCOVERY_CACHE_STRIKES`既定1。`/mcp`のDisableとClear authenticationはキャッシュエントリを破棄しますが、`cached`状態のサーバーでReconnectを選ぶと今接続してエントリは保持されます。クラウドセッションでは環境変数として`MCP_DISCOVERY_CACHE=1`を設定した場合、claude.aiコネクタのツール一覧だけがキャッシュされ、他のサーバーは起動時に接続します(2.1.285)。

### 6.10 MCPクライアントランタイム、プロトコル改訂、スキーマ処理

Claude Codeには2つのMCPクライアントランタイムがあります。v1(MCP TypeScript SDK 1.x)とv2(SDK 2.0、プロトコル改訂2026-07-28)で、v2.1.232以降(フィーチャーフラグあり)/v2.1.274以降(フラグ無し)はv2が既定です。`MCP_SDK_GENERATION=v1|v2`で固定し、新しい改訂を問い合わせるかどうかは`MCP_PROTOCOL_NEGOTIATION=auto|legacy`で決めます。v2.1.292以降はstdio接続が全インストール(Bedrock/Vertex/Foundry含む)で2026-07-28を既定で交渉し、新しいチェックを無視するstdioサーバーは1回遅い接続を経験した後7日間記憶されて旧方式で待ちなしに接続されます。

v2では、HTTP/stdio/コネクタサーバーに新改訂を問い合わせ、`list_changed`を開きっぱなしのストリームで受け取り(10秒以内に閉じたら3回まで再オープン、1時間に5回再オープンしたら約6時間待つ)、予期しないissuerでOAuthを失敗させ、OAuth資格情報をhttpsまたはlocalhostのトークンエンドポイントにしか送らず、`elicitation: {form: {}, url: {}}`ケイパビリティを宣言します。重要な副作用として、2026-07-28を交渉したサーバーはchannelメッセージを運べないため、channelサーバーとしては登録されません。stdioのchannelサーバーを使うなら`MCP_PROTOCOL_NEGOTIATION=legacy`で旧ハンドシェイクに留めます。

elicitationはform mode(サーバー定義のフォームをダイアログ表示)とURL mode(ブラウザでリンクを開くか確認)に対応し、クライアント側設定は不要です。URL modeの引数は約8,000文字(パーセントエンコードが多ければ約4,000)が上限です。`Elicitation`/`ElicitationResult` hookが`{"decision":"block"}`を返すと要求を辞退します(2.1.284で修正)。2025-11-25プロトコルのサーバーがURLプロンプト対応の追加で接続できなくなった場合は`"bareElicitationCapability": true`をエントリに付けます(2.1.287)。完了を報告できないサーバーからのURLプロンプトは「I'm done, continue」の確認を待ちます(2.1.288)。

スキーマはClaude Code側でサニタイズされます。ルートレベルの`anyOf`/`oneOf`/`allOf`は1つのオブジェクトに平坦化され、`allOf`では各分岐の`required`がそのまま効きますが、`anyOf`/`oneOf`では分岐の`required`制約は説明文の注記にしかならないため、組み合わせの妥当性はサーバー側で検証してください。プロパティ名は1から64文字のASCII英数字/`_`/`.`/`-`で、JSON Schema 2020-12を満たさないスキーマはそのツールだけが除外されます(v2.1.216以降、フィーチャーフラグ制御。エアギャップ環境ではログ出力の上で送信され400になる)。2.1.300以降、APIがスキーマを拒否した場合は毎ターン失敗する代わりにそのツールをパラメータ無しで送ります。

### 6.11 ステータス表示、シャットダウン、予約名

`claude mcp list`/`claude mcp get`のステータスは次の通りです。

| 表示 | 意味 |
|---|---|
| `✔ Connected` | 接続済み |
| `! Connected · tools fetch failed` | 接続はしたが`tools/list`に失敗 |
| `! Needs authentication` | 要サインイン |
| `✘ Failed to connect` | v2.1.219以降HTTPステータスやエラー詳細付き(資格情報はマスク) |
| `✘ Connection error` | 接続試行が例外を投げた。詳細は意図的に出さない |
| `⏸ Pending approval (run claude to approve)` | 未承認のprojectサーバー |
| `✘ Rejected (see disabledMcpjsonServers in settings)` | 拒否済み |
| `⊘ Disabled for this project` | `/mcp`でオフ |
| `not configured` | `url`が空 |
| `cached` | discovery cacheから提供 |

設定警告は、フィールド名付きの先頭/末尾空白(値はトリムされない。貼り付けたトークンの末尾改行は認証失敗の筆頭原因)、同名別エンドポイント、予約名、未設定の環境変数を対象にします。パースエラーは該当フィールドを名指しして、そのエントリだけをスキップします。`/mcp`はツール数を表示し、toolsケイパビリティを広告しながらツール数ゼロのサーバーにフラグを立てます。

stdioサーバーの終了シーケンスは、macOS/Linuxでは`SIGINT`、100ミリ秒後も生きていれば`SIGTERM`、さらに400ミリ秒後に`SIGKILL`です。Windowsではstdinを閉じ、300ミリ秒後にプロセスツリーを終了します(v2.1.296以降)。終了時に状態を保存したりロックファイルを消すサーバーはこの猶予内で処理してください。`CLAUDE_CODE_MCP_ALLOWLIST_ENV=1`を設定するとstdioサーバーはシェル環境を継承せず、安全なベースライン環境と設定した`env`だけで起動します。Linux/WSLの`CLAUDE_CODE_TOOL_MEMORY_LIMIT`のcgroupは`CLAUDE_CODE_TOOL_MEMORY_CGROUP_EXCLUDE`の指定次第で`mcp`プロセスも対象にできます。

予約名は`workspace`、`claude-in-chrome`、`computer-use`、`Claude Preview`、`Claude Browser`、クラウド/セルフホストセッションでは`widgets`(2.1.285)です。`claude mcp add`は拒否し、設定ファイルのエントリは警告付きでスキップされます。サーバー名は`[A-Za-z0-9_-]`のみで、`claude mcp add-from-claude-desktop`は他の文字を含む名前をスキップし、重複には`_1`を付けます。`constructor`/`prototype`という名前のサーバーは2.1.299まで接続できませんでした。

### 6.12 CLIフラグとヘッドレス運用

```bash
# Only the servers in ./mcp.json, skip .mcp.json approval (v2.1.246+)
claude --strict-mcp-config --mcp-config ./mcp.json -p "query"

# Remove every MCP tool (--tools never affects MCP tools)
claude --tools "Bash,Edit,Read" --disallowedTools "mcp__*" -p "query"

# Delegate permission prompts to an MCP tool
claude -p --permission-prompt-tool mcp_auth_tool "query"

# Debug only MCP + startup categories
claude --debug='mcp,startup'
claude --debug-file /tmp/claude-debug.log   # then grep 'never expanded toward a remote server'
```

* `--mcp-config <files|json...>`は追加サーバーを読み込む。`-p`では`MCP_TIMEOUT`まで接続を待つ(v2.1.221以降)。`--output-format stream-json`ではスキップされたエントリが`system/init`の`mcp_server_errors`で報告される(v2.1.219以降)
* `--strict-mcp-config`はそれらのサーバーだけを使い、`.mcp.json`の承認を飛ばす
* `--bare`と`--safe-mode`はMCPを読み込まない
* `--tools`はMCPツールに影響しない。MCPも外すなら`--disallowedTools "mcp__*"`
* `--permission-prompt-tool <mcp tool>`はヘッドレスの権限プロンプトを委譲し、そのサーバーを`MCP_TIMEOUT`まで待つ。`requiresUserInteraction`ツールは承認できない。`--permission-prompts none`(v2.1.259以降)は誰も答えられない状況で自動拒否にする(既定`host`はSDKホストまたは`--permission-prompt-tool`へ)
* `--debug`のカテゴリフィルタは`=`形式でのみ効き、`--debug='!mcp'`の否定も使える
* ヘッドレスでは`CLAUDE_CODE_MCP_STARTUP_WAIT_MS=0`でも、`--allowedTools`や`mcp_tool` hookが名指しするサーバーを2秒待つ(2.1.284)
* `--restricted`(v2.1.248以降)はコマンド実行ツールとWebFetchを外し、ファイルツールを作業ディレクトリに閉じ込め、managed設定と`--settings`だけを読む。評価ハーネスからMCPサーバーと組み合わせて`claude`を駆動する際に有用
* `--channels plugin:<name>@<marketplace>`(research preview、claude.aiまたはConsole APIキー認証が必要)で`claude/channel`ケイパビリティを宣言するサーバーからのプッシュを受け取る。開発中は`--dangerously-load-development-channels server:<name>`でローカル設定のサーバーをchannelにできる(対話のみ、`-p`では無視)

環境変数の主要なノブをまとめます。

```bash
# Use a custom 5% threshold
ENABLE_TOOL_SEARCH=auto:5 claude

# Disable tool search entirely
ENABLE_TOOL_SEARCH=false claude

# Other MCP knobs
MCP_TIMEOUT=60000 claude                 # startup timeout (default 30000)
export MAX_MCP_OUTPUT_TOKENS=50000       # default 25000; warning fixed at 10000
CLAUDE_CODE_MCP_AUTO_BACKGROUND_MS=0 claude   # disable auto-backgrounding (default 120000)
CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT=0 claude    # disable idle abort (default 5 min net / 30 min stdio)
MCP_DISCOVERY_CACHE=1 claude             # force discovery cache on
ENABLE_CLAUDEAI_MCP_SERVERS=false claude # don't fetch claude.ai connectors
MCP_SDK_GENERATION=v1 MCP_PROTOCOL_NEGOTIATION=legacy claude  # pin old MCP client runtime
```

### 6.13 plugin同梱サーバー

pluginはルートの`.mcp.json`か`plugin.json`内の`mcpServers`でサーバーを同梱できます。

```json
{
  "mcpServers": {
    "database-tools": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/db-server",
      "args": ["--config", "${CLAUDE_PLUGIN_ROOT}/config.json"],
      "env": {
        "DB_URL": "${DB_URL}"
      }
    }
  }
}
```

```json
{
  "name": "my-plugin",
  "mcpServers": {
    "plugin-api": {
      "command": "${CLAUDE_PLUGIN_ROOT}/servers/api-server",
      "args": ["--port", "8080"]
    }
  }
}
```

前者はpluginルートの`.mcp.json`、後者は`plugin.json`のインライン形です。`${CLAUDE_PLUGIN_ROOT}`はインストール先、`${CLAUDE_PLUGIN_DATA}`は永続状態ディレクトリ、`${CLAUDE_PROJECT_DIR}`は安定したプロジェクトルートに解決されます。ツール名は`mcp__plugin_my-plugin_database-tools__query`、登録名は`plugin:my-plugin:database-tools`です。サーバーは起動時に接続(または`cached`)、`/reload-plugins`では設定が変わった場合のみ再接続、`/cd`の有効/無効に追従します(v2.1.246以降)。`claude mcp get`はplugin stdioサーバーのcommand/args/envの値をマスクします(2.1.285)。`claude plugin install --config '<server>.<key>=<value>'`で同梱`.mcpb`サーバーをインストール時に設定でき(2.1.285)、`claude plugin validate`は`.mcp.json`エントリの黙ったドロップ、未宣言の`${user_config.*}`、安全でないURLを検査します(2.1.281)。

公式の`mcp-server-dev` pluginは`/plugin install mcp-server-dev@claude-plugins-official`の後`/mcp-server-dev:build-mcp-server`でサーバーの雛形を作ります。公式ドキュメントに登場する実例サーバーは、Notion(`https://mcp.notion.com/mcp`)、Sentry(`https://mcp.sentry.dev/mcp`、OAuth)、GitHub(`https://api.githubcopilot.com/mcp/`、PATヘッダー)、Stripe(`https://mcp.stripe.com`)、HubSpot(`https://mcp.hubspot.com/anthropic`)、Asana(`https://mcp.asana.com/sse`)、Airtable(`npx -y airtable-mcp-server`)、Playwright(`npx -y @playwright/mcp@latest`)、DBHub(`npx -y @bytebase/dbhub --dsn ...`)、Claude Codeドキュメント(`https://code.claude.com/docs/mcp`)です。Anthropic Directory(claude.ai/directory)のリモートサーバーはそのまま`claude mcp add`できますが、Anthropicは掲載基準を審査するだけでセキュリティ監査はしていません。Context7、Chrome DevTools MCP、filesystem、sequential-thinkingなどの第三者ランキングはベンダー寄りの意見です(未検証)。

### 6.14 組織向け管理: managed-mcp.json、managedMcpServers、allow/deny

3つの異なる仕組みがあります。

1. `managed-mcp.json`: 排他的制御。ユーザーはpluginサーバーも`--mcp-config`も含め他のサーバーを一切使えない
2. `managedMcpServers`(管理設定、v2.1.259以降): ユーザー自身のサーバーと並行して組織のリモートサーバーを配布
3. `allowedMcpServers`/`deniedMcpServers`: ユーザーが追加したサーバーのフィルタ。`allowManagedMcpServersOnly: true`で許可リストを管理ソースに固定

`managed-mcp.json`のパスはmacOS `/Library/Application Support/ClaudeCode/managed-mcp.json`、Linux/WSL `/etc/claude-code/managed-mcp.json`、Windows `C:\Program Files\ClaudeCode\managed-mcp.json`で、server-managed settingsでは配布できません。

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp/"
    },
    "sentry": {
      "type": "http",
      "url": "https://mcp.sentry.dev/mcp"
    },
    "company-internal": {
      "type": "stdio",
      "command": "/usr/local/bin/company-mcp-server",
      "args": ["--config", "/etc/company/mcp-config.json"],
      "env": {
        "COMPANY_API_URL": "https://internal.example.com"
      }
    }
  }
}
```

MCPを完全に無効にするには空の`{"mcpServers": {}}`を置きます(`managedMcpServers`などの並行許可項目は除く)。`env`に秘密を書かず、`${VAR}`、OAuth、`headersHelper`を使ってください。配備後、ワークステーションの`--mcp-config`は`You cannot dynamically configure MCP servers when an enterprise MCP config is present`で終了し(クラウドセッションではデバッグレベルのstderr警告だけで黙って落とす)、`--strict-mcp-config`はどこでも終了します。自己取得のclaude.aiコネクタは`allowAllClaudeAiMcps: true`(管理者ティアのみ)で許可しない限り抑止されます。この設定が効くのはClaude Code自身が取得するclaude.aiコネクタだけで、pluginサーバーは設定の有無に関わらず抑止されたままです。Claude in Chromeは`allowClaudeInChromeWithManagedMcp: true`(デバイスレベル管理設定のみ、v2.1.282以降)が必要です。

`managedMcpServers`は配布向けです。

```json
{
  "managedMcpServers": {
    "search": {
      "type": "http",
      "url": "https://search.example.com/mcp"
    },
    "records": {
      "type": "http",
      "url": "https://records.example.com/mcp",
      "headers": {
        "X-Records-Key": "key-issued-for-all-claude-code-users"
      }
    }
  }
}
```

エントリ制約は、`http`/`sse`のみ(`streamable-http`可)、`https://`のみ(`http://localhost`も拒否)、`command`/`args`/`env`/`headersHelper`なし、`${VAR}`参照なし、名前は`[A-Za-z0-9_-]`です。違反エントリは落とされ`/status`に通知が出ます。配布サーバーは名前でlocal/project/userに、URLでplugin/コネクタに勝ちます。ユーザーは`claude mcp remove`できません(`provided by your organization`)が、`/mcp`の「Managed MCPs」でオフにでき、自分の`deniedMcpServers`で拒否もできます。`claude mcp get`/`/mcp`はURLのホストとヘッダー名だけを表示します。対話セッションは追加/変更/削除をライブで反映し、`-p`は終了まで削除済みサーバーを保持します。同名を`--mcp-config`で渡すとその実行では置き換わり`allowedMcpServers`で検査され、`--strict-mcp-config`は配布サーバーも外します。Claude Desktopの同名設定は配列形で互換性がありません。server-managed settings経由の場合、キャッシュ済み設定の複製はサーバー確認まで保留されるため、初回起動の`-p`は配布サーバー無しで終わることがあります。

`strictPluginOnlyCustomization`に`mcp`を含めると、`~/.claude.json`と`.mcp.json`のサーバーを読み込まず、plugin/managed-mcp.json/managedMcpServersのサーバーだけを残します。

```json
{
  "strictPluginOnlyCustomization": ["mcp"]
}
```

#### allow/denyリストの評価順

```json
{
  "allowManagedMcpServersOnly": true,
  "allowedMcpServers": [
    { "serverUrl": "https://api.githubcopilot.com/*" },
    { "serverUrl": "https://mcp.sentry.dev/*" },
    { "serverCommand": ["npx", "-y", "@modelcontextprotocol/server-filesystem", "."] },
    { "serverCommand": ["python", "/usr/local/bin/approved-server.py"] },
    { "serverUrl": "https://mcp.example.com/*" },
    { "serverUrl": "https://*.internal.example.com/*" }
  ],
  "deniedMcpServers": [
    { "serverName": "dangerous-server" },
    { "serverName": "claude.ai Slack" },
    { "serverCommand": ["npx", "-y", "unapproved-package"] },
    { "serverUrl": "https://*.untrusted.example.com/*" }
  ]
}
```

(公式の例に`allowManagedMcpServersOnly`と`claude.ai Slack`の拒否を同ページの記述から足した合成例。)評価は次の順です。

1. 全スコープのリストをマージ(`allowManagedMcpServersOnly`時は許可リストは管理ソースのみ。拒否リストは常にマージ)
2. 拒否リストに一致すれば無条件でブロック
3. 許可リスト: リモート(HTTP/SSE)サーバーは`serverUrl`エントリに一致しなければならない(`serverName`が効くのは`serverUrl`エントリが1つも無いときだけ)。stdioサーバーは`serverCommand`エントリに一致しなければならない(`serverName`が効くのは`serverCommand`エントリが1つも無いときだけ)

`serverUrl`はワイルドカード`*`を取り、ホストは大文字小文字を区別せず、パスは区別します。ポート無しの完全なホスト名は既定ポートにしか一致せず、`*`を含むホスト名は全ポートに一致し、任意ポートは`https://host:*/*`です。`serverCommand`は配列の完全一致で`env`は比較されません(`env`は`node`が読み込むものを変えうるので、envを統制したければmanaged-mcp.jsonで定義する)。`serverName`は完全一致でワイルドカード無し、そしてセキュリティ制御ではありません(ユーザーは任意のサーバーを`github`と名付けられる)。許可リスト未設定は全許可、`[]`は(スキップ対象以外)全拒否です。スキップ対象は`managedMcpServers`エントリ、`${VAR}`を含まない`managed-mcp.json`エントリ、組み込み(Claude in Chrome、`ide`)、Claude TagのSlackツール(v2.1.268以降)で、`type: "sdk"`サーバーは3つのチェック全てを飛ばします。ポリシーエントリの`${VAR}`はピン留めされた環境から展開され(v2.1.219以降)、展開によりスキーム/ホスト/パスの範囲が変わる許可URLエントリは無視されます。v2.1.259以降`allowedMcpServers`は`managed-mcp.json`のサーバーを(`${VAR}`付きのものを除き)フィルタしなくなったため、許可リストに依存した除外はアップグレードで読み込まれ始めます。`allowManagedPermissionRulesOnly`はMCP許可リストを固定しません(それは`allowManagedMcpServersOnly`)。ポリシーでブロックされたユーザーにはセッション内の合図は無く、サーバーが`/mcp`と`claude mcp list`から消えるだけです。

運用監視には`OTEL_LOG_TOOL_DETAILS=1`でツールイベントとコスト/トークンカウンタにMCPサーバー名とツール名を含め、`OTEL_LOG_TOOL_CONTENT=1`(2.1.283)で`tool.output`スパンイベントにMCP出力を含めて、許可リストを締める前に実際に使われているサーバーを集計できます。

### 6.15 Claude CodeをMCPサーバーにする

`claude mcp serve`はClaude Codeをstdio MCPサーバーとして起動し、Bash、Read、Editなどのツールを任意のMCPクライアントに公開します。起動時に何も出力しません。

```json
{
  "mcpServers": {
    "claude-code": {
      "type": "stdio",
      "command": "/full/path/to/claude",
      "args": ["mcp", "serve"],
      "env": {}
    }
  }
}
```

Claude Desktopの`claude_desktop_config.json`に書く形です。`which claude`のフルパスを使わないと`spawn claude ENOENT`になります。このサーバーはツールを公開するだけなので、ツール呼び出しごとのユーザー確認はクライアント側の責任です。Bash/PowerShellの結果に`backgroundOutputPath`が含まれる場合(v2.1.295以降)、コマンドはバックグラウンドで動き続けており、完了をクライアントに通知する仕組みは無いため、`; echo DONE`のようなマーカーを付けて検出します。2.1.295でバックグラウンドBash結果が出力ファイル名を返さない問題が、2.1.288でAgentツールがserveモードでagent無しと報告する問題が修正され、2.1.302以降`claude mcp serve`はfork subagentを提供しません。公開されるツールがどのpermission modeと作業ディレクトリで動くかは公式に明記されていません(未検証)。

### 6.16 落とし穴と対策

* `url`があって`type`が無いJSONエントリはstdioとして読まれてスキップされる。Claude Desktop/Cursorからのコピーには`"type": "http"`を足す
* stdioコマンドの前の`--`を忘れると`--port`などがClaude Codeのオプションとして解釈され、`claude mcp get`に誤ったコマンドが表示される
* `--env KEY=val <name>`は名前が次のペアとして読まれて失敗する。間に`--transport stdio`を挟む
* `${ANTHROPIC_API_KEY}`、`${ANTHROPIC_AUTH_TOKEN}`、`${AWS_BEARER_TOKEN_BEDROCK}`、`${HTTPS_PROXY}`、`${NPM_TOKEN}`などはリモートサーバーの`url`/`headers`で空になる(`:-default`も無視)。別名の変数にコピーする
* `${CLAUDE_PROJECT_DIR}`はサーバー側環境にしか無い。`.mcp.json`/`~/.claude.json`では`${CLAUDE_PROJECT_DIR:-.}`
* 「localスコープ」は`~/.claude.json`のプロジェクト別エントリであり`.claude/settings.local.json`ではない。`~/.claude/mcp.json`系のパスは読まれない
* コミットした`.claude/settings.json`の`.mcp.json`承認は未信頼フォルダで無視される。`disabledMcpjsonServers`は常にenable設定に勝つ
* `claude -p`/SDK/クラウドはprojectサーバーを無確認で読み込む。`disabledMcpjsonServers`、`--setting-sources`、`--strict-mcp-config`で止める
* 貼り付けたトークンの末尾空白/改行は`Leading or trailing whitespace in: headers.Authorization`と警告されるがトリムはされない
* `claude mcp add`の`Added`は接続確認ではない
* 同名サーバーを2スコープで別エンドポイントに向けると、OAuthがエンドポイント単位で保存されるためプロジェクトごとに再認証が要る
* allowのglobはリテラルなサーバーにアンカーする。`"mcp__*"`はallowではスキップ、deny/askでは有効。hookのmatcherは正規表現で`mcp__memory`は何にも一致しない
* 正規化後に`__`を含むか`_`で終わるサーバー名は`mcp__reports__v2__*`の全形が必要(2.1.299以降)
* plugin同梱サーバーのツールは`mcp__plugin_<plugin>_<server>__<tool>`。素のサーバーキーで書いたルール/matcherは発火しない
* `mcp__x__y(param:value)`形式は設定ファイルでスキップされる。`--disallowedTools`でのみ受理
* `--tools`はMCPツールを制限しない。`--disallowedTools "mcp__*"`
* 128文字超のツール名はClaudeに送るツール一覧から落ちる(2.1.292以降はツール名を挙げたエラーが出る。全名は`/mcp`で見える)
* ルートレベル`anyOf`/`oneOf`/`allOf`は平坦化され、`anyOf`/`oneOf`の分岐の`required`は文章でしか伝わらない(`allOf`の`required`は効く)。サーバー側で検証する
* 説明は4,096(事前)/16,384(遅延)文字、instructionsは4,096文字で切られる。tool searchは短い方の窓でしか照合しないのでキーワードを先頭に
* `alwaysLoad: true`はサーバーごとに起動を最大5秒ブロックする
* tool searchは`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`、HIPAA構成、AzureのFoundry、非ファーストパーティ`ANTHROPIC_BASE_URL`(`ENABLE_TOOL_SEARCH=true`を除く)、Opus 4/Sonnet 4より前のモデルで強制オフ。オフだとClaudeは接続失敗を知らされない
* `ENABLE_TOOL_SEARCH=true`で`tool_reference`ブロックを落とすプロキシを通すとリクエストが失敗する
* `MAX_MCP_OUTPUT_TOKENS`は10,000トークンの固定警告も50,000文字のファイル保存閾値も変えない。後者はサーバー側の`_meta["anthropic/maxResultSizeChars"]`(上限500,000)のみ
* HTTP/SSEの16 MiB超応答は失敗、WebSocketの16 MiB超メッセージは切断、約11,000文字超のエラー結果は頭/尾に切り詰め
* サーバーごとの`timeout`が1000ms未満なら無視。HTTPのリクエスト単位タイマーはmax(60秒, ツールタイムアウト, `MCP_TIMEOUT`)で60秒未満にできない
* idleタイムアウト(5分/30分)は応答もprogress通知も無い呼び出しを中断する。長時間サーバーはprogress通知を送る
* メイン会話の2分超MCP呼び出しは自動でバックグラウンド化(subagent、IDEサーバー、`-p`では`CLAUDE_AUTO_BACKGROUND_TASKS=1`が無い限り対象外)。タスク停止はサーバー停止を保証しない
* stdioサーバーは切断後に自動再接続されない。5回バックオフはリモートのみ。`/mcp reconnect all`はv2.1.284以降
* ヘッドレスではOAuthを実行できない。先に`/mcp`か`claude mcp login <name>`。クライアントシークレットはadd時のみ設定可
* `headersHelper`はキャッシュされず接続のたびに走る。project `.mcp.json`/pluginでは資格情報名の環境変数が剥がされ、該当フォルダを信頼するまで実行されない。pluginの`headersHelper`は`${user_config.*}`を使えない
* claude.aiコネクタはAPIキー/`ANTHROPIC_AUTH_TOKEN`/`apiKeyHelper`/Bedrock/Vertex/Foundry/プロファイル/`claude setup-token`では読み込まれない。`/status`で認証方式を確認
* Microsoft 365、Gmail、Google CalendarのようなAnthropicホストのコネクタは`claude mcp add`からのローカルOAuthを拒否する
* クラウドセッションではプロキシがコネクタURLを書き換えるため、実URL向けの`serverUrl`許可リストは一致しない
* 予約名(`workspace`、`claude-in-chrome`、`computer-use`、`Claude Preview`、`Claude Browser`、クラウドの`widgets`)はスキップ。`anthropic-skills`はプロンプトを隠す
* 2026-07-28を交渉したchannelサーバーはv2ランタイムでchannelとして登録されない。`MCP_PROTOCOL_NEGOTIATION=legacy`
* `managed-mcp.json`下で`--mcp-config`はワークステーションでは終了、クラウドでは黙って落とす。`--strict-mcp-config`はどこでも終了。v2.1.259以降`allowedMcpServers`は`managed-mcp.json`のサーバーをフィルタしない
* `serverName`の許可/拒否はセキュリティ制御ではない。`serverUrl`/`serverCommand`を使う。`serverCommand`は`env`を比較しない
* `allowedMcpServers: []`は未設定と違い全拒否。`allowManagedPermissionRulesOnly`はMCP許可リストを固定しない
* ポリシーでブロックされたサーバーはセッション内に合図が無く`/mcp`から消えるだけ
* 起動時`SessionStart`と`Setup`の`mcp_tool` hookは常にスキップ。command hookを使う
* discovery cacheの`cached`サーバーは最初のツール呼び出しで遅延接続する。既定オフ(ロールアウト次第、v2.1.238より前は既定オン)
* `enabledMcpjsonServers`/`disabledMcpjsonServers`に配列ではなく単一文字列を書くと、2.1.299より前は設定ファイル全体が無視された

### 6.17 中級者が次にやること

1. **棚卸しと最小構成**: `claude mcp list`で全サーバーの状態と警告を確認し、使っていないサーバーをremoveする。`/context`でMCP instructionsの行を見て、instructionsが肥大したサーバーは`alwaysLoad: false`で遅延側に押し込む。毎ターン必要なサーバーだけ`alwaysLoad: true`にする(5秒の起動待ちを許容できる数に絞る)。
2. **チーム共有の`.mcp.json`を安全に書く**: 全エントリに`type`を明記し、秘密は`${MY_TOKEN}`のように自前の名前で参照、`${API_BASE_URL:-https://...}`でデフォルトを与える。`CLAUDE_PROJECT_DIR`は`:-.`付き。承認は各自の`.claude/settings.local.json`に任せ、リポジトリ側で`enableAllProjectMcpServers`をコミットしても未信頼フォルダでは効かないことを前提にREADMEへ「`claude`を起動して信頼ダイアログを受諾」を書く。
3. **短命トークンの社内サーバー**: `headersHelper`でトークン発行コマンドを呼ぶ。10秒以内にJSONを出力するスクリプトにし、`CLAUDE_CODE_MCP_SERVER_NAME`で分岐させて1スクリプトを複数サーバーで共用する。project `.mcp.json`に置くなら資格情報名の変数が剥がされる前提で、helper側が自力で取得する設計にする。
4. **permissionとhooksを名前規則どおりに書く**: allowは`mcp__<server>__get_*`のような読み取り系に限定し、書き込み系は`mcp__.*__(write|delete|update).*`のPreToolUse command hookで検証する。pluginサーバーは`mcp__plugin_<plugin>_<server>__.*`で書く。hook入力の`mcp_server.source`で`project`由来のサーバーをより厳しく扱う。
5. **ヘッドレスCIのレシピ**: `claude --strict-mcp-config --mcp-config ./ci-mcp.json -p "..." --output-format stream-json`で必要サーバーだけ読み込み、`system/init`の`mcp_server_errors`を監視する。OAuthが要るサーバーは事前に`claude mcp login`、CIでのaddは`MCP_CLIENT_SECRET`と`MCP_OAUTH_CALLBACK_PORT`。長いツール呼び出しには`CLAUDE_AUTO_BACKGROUND_TASKS=1`と`--permission-prompts none`を検討する。
6. **自作サーバーのチューニング**: `/plugin install mcp-server-dev@claude-plugins-official`で雛形を作り、`roots/list`を実装し、説明文の先頭に検索キーワードを置き、巨大な結果を返すツールには`_meta["anthropic/maxResultSizeChars"]`、同意系ツールには`_meta["anthropic/requiresUserInteraction"]: true`を付ける。長時間ツールはprogress通知を送ってidleタイムアウトを避ける。終了時処理は`SIGINT`から500ミリ秒以内に収める。
7. **hookからMCPを呼ぶ自動化**: PostToolUseの`Write|Edit`に`type: "mcp_tool"`でセキュリティスキャンや索引更新を呼ぶ。起動時`SessionStart`では動かないので、起動時に必要な処理はcommand hookで`claude -p`や直接のAPI呼び出しに切り替える。
8. **組織導入**: まず`OTEL_LOG_TOOL_DETAILS=1`で利用実態を集計し、次に`managedMcpServers`で標準サーバーを配布、`allowedMcpServers`は`serverUrl`/`serverCommand`で書く。完全統制が必要なら`managed-mcp.json`、カスタマイズをplugin経由に絞るなら`strictPluginOnlyCustomization: ["mcp"]`。
9. **ランタイム切り分け**: 挙動が怪しいときは`claude --debug='mcp,startup'`、`claude --debug-file`、`MCP_SDK_GENERATION=v1`/`MCP_PROTOCOL_NEGOTIATION=legacy`で旧ランタイムと比較する。discovery cacheの影響は`MCP_DISCOVERY_CACHE=0`で排除する。

### 出典

* https://code.claude.com/docs/en/mcp
* https://code.claude.com/docs/en/mcp-quickstart
* https://code.claude.com/docs/en/managed-mcp
* https://code.claude.com/docs/en/permissions
* https://code.claude.com/docs/en/hooks
* https://code.claude.com/docs/en/env-vars
* https://code.claude.com/docs/en/settings-reference
* https://code.claude.com/docs/en/cli-reference
* https://code.claude.com/docs/en/tools-reference
* https://code.claude.com/docs/en/changelog


---

## 第7章 プラグインとMods、マーケットプレイス

### この章で分かること

プラグインは「コンポーネントを並べたディレクトリ + 任意のマニフェスト」であり、skills、agents、hooks、MCP、LSP、monitors、bin/ などを一つの名前空間に束ねて配布する単位です。この章では、マニフェストの各キーがデフォルトフォルダを「置換」「追加」「マージ」のどれで扱うか、`${CLAUDE_PLUGIN_ROOT}` と `${CLAUDE_PLUGIN_DATA}` の使い分け、enabledPlugins のスコープ優先順位、バージョン解決と自動更新の実際の挙動を仕組みのレベルで整理します。続いてマーケットプレイス(marketplace.json)のソース種別、strict モード、依存解決、組織向けの allowlist/seed 構成を扱います。後半は v2.1.287 で正式公開された Mods(プロセス内で動く JS/TS の hooks module)について、ミドルウェアチェーンの実行順、fail-open を fail-closed にする `.catch`、`$` API の制限値、テスト・validate・eval の回し方まで踏み込みます。最後に、常時コンテキストに乗るトークンコストの計測方法と、再現可能な設定レシピをまとめます。

### 7.1 プラグインの構造とマニフェスト

#### 標準レイアウト

プラグインルートは「プラグイン自身のディレクトリ」であり、`~/.claude/` ではありません。`.claude-plugin/` に置いてよいのは `plugin.json` だけで、そこに置いたコンポーネントはロードされません。`~/.claude/.mcp.json` のような場所に置いた `.mcp.json` も読まれません。

```text
deploy-tools/
├── .claude-plugin/
│   └── plugin.json
├── skills/
│   └── deploy/
│       └── SKILL.md
├── commands/
│   └── status.md
├── agents/
│   └── reviewer.md
├── hooks/
│   └── hooks.json
├── monitors/
│   └── monitors.json
├── output-styles/
│   └── terse.md
├── themes/
│   └── dracula.json
├── workflows/
│   └── release-audit.js
├── bin/
│   └── deploy-tool
├── scripts/
│   └── format.sh
├── settings.json
├── .mcp.json
└── .lsp.json
```

全デフォルト位置を並べたレイアウトです。`scripts/` は慣習で、hooks が `${CLAUDE_PLUGIN_ROOT}/scripts/...` で参照します。`bin/` は有効中、Bash ツールの PATH の末尾に乗ります(ユーザー PATH の後ろなので `git` 等は上書きできません)。マニフェストなしで `--plugin-dir` に渡した場合はディレクトリ名がプラグイン名になります。

プラグインルートの `CLAUDE.md` はコンテキストとしてロードされず、`claude plugin validate` が警告を出します。常時適用したい指示は skill に、毎回必ず守らせたいルールは hooks に移してください。README.md は publish 前の「利用者が見るメタデータ」としてプラグインルートに置くよう推奨されますが、Claude のコンテキストにロードされるという記述は公式ドキュメントにありません。

#### plugin.json のフィールド

必須は `name` のみです。`name` は kebab-case で、空白・`@`・`:`・パス区切りを含めてはならず、すべてのコンポーネントの名前空間プレフィックスになります(`/deploy-tools:status`、`deploy-tools:reviewer`)。`claude-`、`anthropic-`、`anthropics-`、`cc-plugin-` で始まる名前や `claude`、`anthropic`、`claude-code`、`claude-mods` そのものは validate でエラーになり、`claude plugin init` と `claude plugin tag` はその名前を拒否します。ただし Claude Code 自体はエラー名のプラグインでもインストール・ロードします。

```json
{
  "name": "deploy-tools",
  "displayName": "Deploy Tools",
  "version": "1.2.0",
  "description": "Deployment commands, a review agent, and a status monitor",
  "author": {
    "name": "Example Team",
    "email": "dev@example.com",
    "url": "https://example.com"
  },
  "homepage": "https://example.com/docs/deploy-tools",
  "repository": "https://github.com/example/deploy-tools",
  "license": "MIT",
  "keywords": ["deployment", "ci"],
  "defaultEnabled": true,
  "dependencies": ["secrets-vault"],
  "metadata": { "catalogId": "cat-123" },
  "skills": ["./extra-skills/"],
  "commands": {
    "status": {
      "source": "./commands/status.md",
      "description": "Show the current deployment status"
    },
    "about": {
      "content": "Explain what the deploy-tools plugin provides.",
      "description": "Describe this plugin"
    }
  },
  "agents": ["./agents/reviewer.md"],
  "hooks": "./config/extra-hooks.json",
  "mcpServers": {
    "deploy-api": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server.js"]
    }
  },
  "lspServers": "./.lsp.json",
  "outputStyles": "./styles/",
  "experimental": {
    "themes": "./themes/",
    "monitors": "./config/monitors.json"
  },
  "userConfig": {
    "api_token": {
      "type": "string",
      "title": "API token",
      "description": "Token for the deployment API",
      "sensitive": true
    }
  }
}
```

`.claude-plugin/plugin.json` に置くほぼ全フィールドの例です。`commands` のオブジェクトマップは各キーがコマンド名になり、`source` か `content` のどちらか一方が必須(両方・両方なしは validate 失敗)で、`description`、`argumentHint`、`model`、`allowedTools` を取れます。`icon`、`documentationUrl`、`supportUrl`、`privacyPolicyUrl`、`termsOfServiceUrl` の 5 つはディレクトリ掲載用で Claude Code は無視しますが、v2.1.281 未満の validate では Unknown field 警告になるため `--strict` が落ちます。

#### 置換・追加・マージの 3 分類

マニフェストにコンポーネントキーを書くと、デフォルトフォルダの扱いが変わります。

- 置換: `commands`、`agents`、`outputStyles`、`workflows`、`experimental.themes`、`experimental.monitors`。キーを書くとデフォルトフォルダはスキャンされず、`Default <folder>/ folder is ignored because the manifest sets "<key>"` と警告が出ます。デフォルトを残すには `"commands": ["./commands/", "./extras/"]` のように明示列挙します。
- 追加: `skills` のみ。`skills/` に加えて列挙先も読みます。
- マージ: `hooks`、`mcpServers`、`lspServers`。デフォルトファイルを先に読み、後から宣言された同名サーバが先のものを置き換えます。

コンポーネントパスはすべて `./` で始まる相対パスで、プラグインルート内に存在する必要があります。`commands/foo.md` は validate 失敗、`..` を含むと `path traversal` エラー、存在しなければ `path not found` です。`skills` は `"."` も可(v2.1.221+)、`mcpServers` は `https://` のバンドル URL も可です。macOS/Linux ではバックスラッシュを含むパスも拒否されます。

#### パス変数とその到達範囲

| 変数 | 指す先 | 寿命 |
|---|---|---|
| `${CLAUDE_PLUGIN_ROOT}` | インストール済みバージョンの絶対パス(`cache/<marketplace>/<plugin>/<version>/`) | 更新ごとに変わる。状態を書かない |
| `${CLAUDE_PLUGIN_DATA}` | `~/.claude/plugins/data/<id>/` | 更新をまたいで保持。アンインストールでデフォルト削除(`--keep-data` で保持) |
| `${CLAUDE_PROJECT_DIR}` | プロジェクトルート | セッション固有 |

`<id>` はプラグイン ID の英数字・`_`・`-` 以外を `-` に置換したものです(`my-plugin@my-marketplace` → `my-plugin-my-marketplace`)。重要なのは、これらの変数は Bash ツールが実行するコマンドの環境には存在しないことです。skill・command・agent の本文に `${CLAUDE_PLUGIN_ROOT}` と書けば Claude Code がロード時にインラインで置換しますが、Claude が `echo $CLAUDE_PLUGIN_ROOT` を実行しても空になります。hooks プロセスには `CLAUDE_PLUGIN_ROOT`、`CLAUDE_PLUGIN_DATA`、`CLAUDE_PROJECT_DIR`、`CLAUDE_PLUGIN_OPTION_<KEY>` がエクスポートされます。

#### userConfig と `${user_config.*}`

`userConfig` の各オプションは `type`(string/number/boolean/directory/file)、`title`、`description` が必須の strict オブジェクトで、未知キーはロード失敗です。追加フィールドは `required`、`default`、`sensitive`(マスク入力+セキュアストレージ保存)、`multiple`(string の配列)、`min`/`max`(number)、`options`(v2.1.271+、固定選択肢)です。

```json
{
  "userConfig": {
    "tone": {
      "type": "string",
      "title": "Tone",
      "description": "Voice for generated replies",
      "options": ["neutral", "warm", "formal"],
      "default": "neutral"
    }
  }
}
```

`options` は multiple でも sensitive でもない string 専用で、`default` は options のいずれかであるか `required: true` が必要です。`options` を使うと v2.1.271 未満のユーザーはプラグインをロードできません。

`${user_config.KEY}` は MCP/LSP 設定、exec-form hook の args、skill/agent 本文(非 sensitive 値のみ、sensitive はプレースホルダ)で置換されます。一方、shell-form hook の `command`、monitor の `command`、MCP の `headersHelper` では拒否され、参照するコンポーネントは実行されずエラーになります。シェルに渡す値は再パースされるためです。shell-form hook では代わりに環境変数 `CLAUDE_PLUGIN_OPTION_<KEY>`(大文字)を読みます。monitor と headersHelper には option 値が一切届きません。

設定ダイアログは `/plugin` 経由のインストール/有効化でしか出ません。`--plugin-dir` や `claude plugin install` では `/plugin configure <plugin>`、`claude plugin install --config KEY=VALUE`、`claude plugin configure <name>@<marketplace> --values-stdin`(単一行 JSON)を使います。非 sensitive 値は settings.json の `pluginConfigs` に保存されます。

### 7.2 コンポーネント別の仕組み

#### hooks: ラッパーの有無と二重実行

`hooks/hooks.json` はトップレベル `"hooks"` キーで settings.json と同形のイベントマップをラップします。ラッパーなしのファイルはロードに失敗します。逆にマニフェストの `hooks` キーにインラインで書く場合はラッパーなしのイベントマップそのものです。マーケットプレイスエントリの `hooks` はインラインオブジェクト形式のみ有効で、ファイルパスを書くと validate は通りますが実行時に `not yet supported in a marketplace entry` になります。

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "\"${CLAUDE_PLUGIN_ROOT}/scripts/format.sh\""
          }
        ]
      }
    ]
  }
}
```

`hooks/hooks.json` の例で、編集後にバンドルスクリプトを実行します。shell-form なので `${CLAUDE_PLUGIN_ROOT}` を二重引用符で囲み、スペースを含むパスでも 1 語に保ちます。

プラグインの hooks はスキルの使用を待たず、セッションロード時に登録されて以後すべてのイベントで発火します。既存の `.claude/` セットアップをプラグイン化する際、skills と agents はプレフィックスで衝突しませんが、hooks にはプレフィックスがないため、`.claude/settings.json` と `hooks/hooks.json` の両方にある hook はイベントごとに二重実行されます。動作確認後に settings.json 側を削除してください。

Node.js 依存が必要で自動インストール(7.3 で後述)が使えない場合の公式パターンが、SessionStart で `${CLAUDE_PLUGIN_DATA}` に `npm install` する方法です。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "diff -q \"${CLAUDE_PLUGIN_ROOT}/package.json\" \"${CLAUDE_PLUGIN_DATA}/package.json\" >/dev/null 2>&1 || (cd \"${CLAUDE_PLUGIN_DATA}\" && cp \"${CLAUDE_PLUGIN_ROOT}/package.json\" . && npm install) || rm -f \"${CLAUDE_PLUGIN_DATA}/package.json\""
          }
        ]
      }
    ]
  }
}
```

`hooks/hooks.json` に置きます。更新で package.json が変わった時だけ再インストールし、失敗時はコピーを消して次回再試行させます。

#### MCP サーバ: 完全名でマッチする

プラグインの `.mcp.json` はプロジェクトの `.mcp.json` と同形で(`mcpServers` ラッパーは省略可)、`command`/`args`/`env` で `${CLAUDE_PLUGIN_ROOT}` が置換されます。`/mcp` 上の表示名は `plugin:<plugin>:<server>`、ツール名は `mcp__plugin_<plugin>_<server>__<tool>` です。permission rule と hook matcher はこの完全名で書く必要があり、サーバ名だけの matcher は発火しません。

```json
{
  "name": "my-plugin",
  "mcpServers": {
    "telegram": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/server.js"],
      "env": { "BOT_TOKEN": "${user_config.bot_token}" }
    }
  },
  "channels": [
    {
      "server": "telegram",
      "userConfig": {
        "bot_token": {
          "type": "string",
          "title": "Bot token",
          "description": "Telegram bot token",
          "sensitive": true
        }
      }
    }
  ]
}
```

`plugin.json` の例で、userConfig の値を MCP サーバの `env` に差し込みます。マニフェストの `mcpServers` は `.mcpb`/`.dxt` バンドル(パスまたは https URL)も受け付け、`.mcpb-cache/` に展開されます。バンドルの `user_config` が未設定なら起動せず、`Bundled MCP server "<name>" was not started: it needs configuration` と表示されます。

#### agents: サブフォルダは名前の一部

`agents/review/security.md` は `my-plugin:review:security` になります。frontmatter の `permissionMode`、`hooks`、`mcpServers`、`initialPrompt` は無視されるため、エージェント単位で hooks や MCP を足すことはできず、プラグインの hooks/MCP として追加します。`isolation` は `"worktree"` のみ有効です。frontmatter のパースに失敗してもエージェントはロードされ、ファイル名で名前付けされて description が `Agent from my-plugin plugin` になるので、`claude plugin validate` で検出してください。

#### LSP サーバ

`.lsp.json` はラッパーなしのサーバ名→設定マップで、`command` と `extensionToLanguage`(キーは `.` 始まり)が必須です。

```json
{
  "gopls": {
    "command": "gopls",
    "args": ["serve"],
    "extensionToLanguage": {
      ".go": "go"
    }
  }
}
```

プラグインルートの `.lsp.json` に置きます。バイナリは PATH から起動され、プラグインには同梱されません。その他のフィールドは `transport`(stdio|socket、socket を受け付けるが常に stdio で動作)、`env`、`initializationOptions`、`settings`、`workspaceFolder`、`startupTimeout`、`shutdownTimeout`(未設定なら無期限)、`requestTimeout`(デフォルト 60000ms、v2.1.288+)、`restartOnCrash`(デフォルト true)、`maxRestarts`、`diagnostics`(デフォルト true)です。`initializationOptions`/`settings` での `${user_config.*}` と `${CLAUDE_PLUGIN_ROOT}` の置換は v2.1.288 で修正されました。

stdout はプロトコル専用で、ログは stderr に出してください。ヘッダ 64KiB、ボディ 32MiB を超えるか非プロトコル出力があると切断されクラッシュ扱いになります。拡張子ごとに最初に登録されたサーバが担当し、競合は警告のみです。`claude plugin validate` は `.lsp.json` を読みませんが、マニフェストの `lspServers` キーは strict オブジェクトとして検査されます。クラウドセッションではプラグイン LSP は起動しません。

公式の code intelligence プラグインは `claude-plugins-official` に 13 言語分(clangd-lsp、csharp-lsp、gopls-lsp、jdtls-lsp、kotlin-lsp、liquid-lsp、lua-lsp、php-lsp、pyright-lsp、ruby-lsp、rust-analyzer-lsp、swift-lsp、typescript-lsp)あります。バイナリが PATH にあり未インストールなら、編集後に「LSP plugin recommendation」ダイアログが 1 セッション 1 回出て、5 回無視すると自動停止します(`~/.claude.json` の `lspRecommendationDisabled`、`lspRecommendationIgnoredCount`、`lspRecommendationNeverPlugins` で復帰)。

#### monitors、bin/、settings.json

monitors はセッション全体でバックグラウンド実行されるシェルコマンドで、出力は通知として Claude に届きます。

```json
[
  {
    "name": "error-log",
    "command": "tail -F ./logs/error.log",
    "description": "Application error log"
  }
]
```

`monitors/monitors.json` の形です。マニフェストの `experimental.monitors` では `"when": "on-skill-invoke:deploy"` で初回スキル実行時に開始できます(省略時は `always`)。対話セッション限定で `-p` では起動せず、サンドボックス外でフル権限、`${user_config.*}` 不可、途中でプラグインを無効化しても実行中の monitor は止まりません。Bedrock/Agent Platform/Foundry では実行されず、プロジェクトスコープ(リポジトリ共有)プラグインの monitor はロードされません。

`bin/` は便利ですが、claude.ai と Cowork はトップレベル `bin/` を持つプラグインをインストールしません(組織設定経由でも `Plugin contains a top-level bin/ directory` で拒否)。マルチサーフェス配布なら `scripts/` に置いて `${CLAUDE_PLUGIN_ROOT}/scripts/<name>` で参照します。

プラグインの `settings.json`(またはマニフェストの `settings` キー)で効くのは `agent` と `subagentStatusLine` の 2 キーだけで、他は捨てられます。`agent` を設定するとメインスレッドがそのプラグインのエージェントとして動き、システムプロンプト・ツール制限・モデルがセッション全体に適用されます。ファイルがマニフェストより優先、ユーザー設定がプラグインデフォルトより優先、2 プラグインが同キーを設定したら最後にロードされた方が勝ちます。

### 7.3 ロードの仕組み: スコープ、ID、バージョン、更新

#### スコープと優先順位

インストールスコープは user(`~/.claude/settings.json`)、project(`.claude/settings.json`、コミット対象)、local(`.claude/settings.local.json`)の 3 つです。`enabledPlugins` はキーごとにマージされ、各プラグイン ID について最高優先度のソースの値が適用されます。低→高で `--add-dir` < user < project < local < `--settings` < managed です。

project で有効化しても他の開発者のマシンにはダウンロードされません(相対パスソースと seed は例外)。各自 `claude plugin install <name>@<marketplace> --scope project` が必要です。外部ソースのプラグインは user/local/`--settings`/managed のいずれかで true の場合のみフェッチされます。クラウドセッション(claude.ai/code)はローカル設定のプラグインを一切ロードしません。

project スコープのプラグインはリポジトリ由来のコンテンツなので、信頼ダイアログ承認後にのみロードされます(親フォルダの信頼や `-p` では不十分)。MCP サーバはプロジェクト `.mcp.json` と同じサーバ単位の承認が必要で、`.mcpb`/`.dxt` バンドルやディレクトリ外ファイルの MCP はスキップされます。

#### プラグイン ID の出自サフィックス

| サフィックス | 出自 |
|---|---|
| `@<marketplace>` | マーケットプレイスからインストール |
| `@inline` | `--plugin-dir`、`--plugin-url`、`CLAUDE_CODE_PLUGIN_DIRS`、SDK の `plugins`。そのセッション限定 |
| `@skills-dir` | `~/.claude/skills/` または `.claude/skills/` 配下の plugin.json 付きフォルダ |
| `@synced` | claude.ai アカウントから同期 |
| `@builtin` | 組み込み |

`--plugin-dir` のプラグインを無効化するには `"enabledPlugins": {"<name>@inline": false}` と書きます。同名(マニフェスト name)プラグインの衝突は managed enabledPlugins 記載 > `--plugin-dir` 系 > マーケットプレイス > skills-dir(`~/.claude/skills/` が `.claude/skills/` より優先)> synced の順で解決されます。`--plugin-dir` がマーケットプレイス版を置換する場合は「silently」で、`claude plugin list` の行は依然 enabled 表示、`--debug` ログにだけ `Plugin "<name>" from --plugin-dir overrides installed version` が出ます。別マーケットプレイスから同名プラグインを 2 つ有効化すると両方 enabled に見えますが、hooks.json の hooks と hooks module は片方しか登録されません(v2.1.296+ で Errors タブに注記)。

#### バージョン解決と自動更新

バージョンは plugin.json の `version` > マーケットプレイスエントリの `version` > ソース種別由来(github/url/git-subdir はコミット SHA 12 文字、archive は sha256 12 文字、command は出力ハッシュ、ローカル非 git と npm は unknown)の順で決まります。更新検出は計算されたバージョンの比較で、一致すればキャッシュを置換しません。つまり plugin.json に `"version": "1.0.0"` を固定したままコミットだけ push しても、ユーザーは `already at the latest version` のまま更新を受け取りません。コミット追跡にしたければ両方から `version` を外します。ローカルパスで追加したマーケットプレイスの相対パスプラグインは in-place ロードで、version 文字列に関係なく毎回最新ファイルです。

自動更新は対話セッションで最初のメッセージ送信後、最大 10 分のランダム遅延の後に走ります。デフォルトで ON なのは公式マーケットプレイス(`knowledge-work-plugins` と `first-party-plugins` を除く)と claude.ai 由来のマーケットプレイスだけで、サードパーティ・コミュニティ・ローカルは OFF です。marketplace.json 側に ON にするフィールドはなく、`extraKnownMarketplaces` エントリの `autoUpdate` > `known_marketplaces.json` の `autoUpdate`(`/plugin` のトグル)> デフォルトの順で決まります。`DISABLE_UPDATES=1`、`DISABLE_AUTOUPDATER=1`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` で全停止、`FORCE_AUTOUPDATE_PLUGINS=1` で復活します。更新後も実行中セッションは旧バージョンのままで `Run /reload-plugins to apply` が出ます。全プラグイン一括更新コマンドはありません。

`/reload-plugins` は、プラグイン MCP サーバや LSP ツールの追加・削除がプロンプトキャッシュを無効化する場合は適用せず警告し、`/reload-plugins --force` で強制適用します(1 回分の非キャッシュリクエストコスト)。v2.1.260+ で非対話セッションでも動きますが MCP の接続/切断は反映されません。Remote Control や Slack 経由では `isn't available over a remote connection` で拒否されます。

#### ディスク上のレイアウトと依存自動インストール

`~/.claude/plugins/`(`CLAUDE_CODE_PLUGIN_CACHE_DIR` で変更可)配下に `cache/<marketplace>/<plugin>/<version>/`、`data/<plugin-id>/`、`marketplaces/<name>/`、`synced/`、`.trash/`、`installed_plugins.json`、`known_marketplaces.json`、`known_marketplaces_claudeai.json`、`flagged-plugins.json` が置かれます。更新・アンインストール時に旧バージョンディレクトリには `.orphaned_at` マーカーが書かれ、14 日後にバックグラウンドで削除されます(ロード済みセッションを壊さないため)。プロジェクトの `.claude/plugins/` はスキャンされません。

プラグインをキャッシュにコピーする際、`package.json` とロックファイル(`bun.lock`、`npm-shrinkwrap.json`、`package-lock.json` の順)があれば Node.js 依存を自動インストールします。レジストリパッケージのみ、https のみ、`--ignore-scripts`、overrides/patches 不可、60 秒タイムアウトで、無効化する設定は存在しません。`yarn.lock`、`pnpm-lock.yaml`、`bun.lockb` はスキップされ、npm ソース配布では npm が `package-lock.json` を除外するので `npm-shrinkwrap.json` を使います。失敗時はプラグインはロードされるが依存部分は動かず、`/plugin` にノートが出ます。

#### `--plugin-dir` と `claude plugin init`

`--plugin-dir` はディレクトリまたは `.zip` を 1 セッションだけロードし、設定には何も書きません。v2.1.265+ では `.claude-plugin/` もコンポーネントもトップレベルにない「プラグインのフォルダ」を渡すと各サブフォルダの plugin.json 付きプラグインを個別ロードし、v2.1.281+ では marketplace.json を同梱したフォルダでも可(marketplace.json 自体は読まれない)です。マーケットプレイスルートを渡しても `plugins/` 配下はロードされず、エラーも出ません。`CLAUDE_CODE_PLUGIN_DIRS`(v2.1.280+、`:` 区切り絶対パス)は同等で、プロジェクト/ローカル設定からは設定できません。managed の `disableSideloadFlags` でこれらは拒否され exit 1 で起動しません。

`claude plugin init <name>` は `~/.claude/skills/<name>/` にスキャフォールドし、次セッションから `<name>@skills-dir` として自動ロードされます(ルート SKILL.md は `/<name>`、`skills/` 配下は `/<name>:<skill>`)。`--with skills|agents|hooks|mcp|lsp|output-style|channel` で雛形追加、別の場所へのフラグはありません。リポジトリ共有は `<project>/.claude/skills/<name>/` に同じレイアウトを置きますが、セッションの primary working directory の `.claude/skills/` のみ読み、親ディレクトリは探索せず、サブディレクトリから起動した場合は v2.1.246+ の `/cd` でリポジトリルートへ移します。

### 7.4 マーケットプレイス

#### marketplace.json

`.claude-plugin/marketplace.json` は `name`、`owner`、`plugins` が必須です。マーケットプレイス名はディレクトリ名ではなくこのフィールドで決まり、ユーザーは `<plugin>@<name>` でインストールします。未知のトップレベルキーやエントリキーは黙って無視されるので、typo は validate の警告で拾います。

```json
{
  "name": "my-marketplace",
  "description": "Plugins for my team",
  "owner": {
    "name": "Your Name"
  },
  "plugins": [
    {
      "name": "my-first-plugin",
      "source": "./plugins/my-first-plugin",
      "description": "A greeting plugin to learn the basics"
    }
  ]
}
```

最小形です。相対パス `source` はマーケットプレイスルート(`.claude-plugin/` を含むディレクトリ)基準で `./` 必須。登録は `claude plugin marketplace add ./my-marketplace`、インストールは `claude plugin install my-first-plugin@my-marketplace` です。

エントリ名(marketplace.json の `name`)とマニフェスト名(plugin.json の `name`)は別物で、インストール ID・enabledPlugins キー・キャッシュディレクトリはエントリ名、スキルのプレフィックスと `claude plugin details` の引数はマニフェスト名です。異なるとマニフェスト名でのインストールが `Plugin "<manifest-name>" not found in marketplace "<marketplace>"` になります。両者を一致させるのが公式ガイダンスです。

予約名として、公式 14 種、community 3 種、`inline`/`builtin`/`skills-dir`/`synced`/`claude-plugin-test`、`npm`/`pip`/`uv`/`cargo`/`github`/`gh`(v2.1.275+)、`constructor` 等の JS オブジェクトメンバ名(v2.1.296+)、`claudeai-` 接頭辞、登録済み GitHub マーケットプレイスの `<owner>-<repo>` フォルダ名があります。公式/コミュニティの名前を `github.com/anthropics/` 以外のソースで使うとマーケットプレイスごとロード停止します。

#### プラグインソース 7 種

```json
{ "name": "formatter", "source": { "source": "github", "repo": "your-org/formatter", "ref": "v2.0.0", "sha": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0" } }

{ "name": "formatter", "source": { "source": "url", "url": "https://gitlab.example.com/your-group/formatter.git", "ref": "main" } }

{ "name": "formatter", "source": { "source": "git-subdir", "url": "https://github.com/your-org/monorepo.git", "path": "tools/formatter" } }

{ "name": "formatter", "source": { "source": "npm", "package": "@your-org/formatter", "version": "^2.0.0", "registry": "https://npm.example.com" } }

{ "name": "formatter", "source": { "source": "archive", "url": "https://artifacts.example.com/formatter-2.0.0.zip", "sha256": "6bfa50e3d2e00c052b46abe51fff89346ac803e45771f76dcf6df1ab74cca5e1" } }

{ "name": "formatter", "source": { "source": "command", "command": "my-tool claude-plugin-path", "timeout": 120 } }
```

相対パスを含めて 7 種です。`archive` は v2.1.224+、`command` は v2.1.229+。`ref` と `sha` の両方があれば `sha` をチェックアウトします(CodeCommit 除く)。`npm` は install スクリプトを一切実行しません。名前が同じでもマーケットプレイスソースとプラグインソースで意味が違い、`url` はマーケットプレイスでは marketplace.json 直リンク、プラグインでは git リポジトリです。`git` はマーケットプレイスソースにしか存在せず、`git-subdir`/`archive`/`command` はプラグインソースにしか存在しません。url ソースのマーケットプレイスでは相対パスプラグインは解決できません。

`command` ソースは `sh`(Windows は cmd.exe)でホームディレクトリから実行され、プラグインディレクトリの絶対パスを 1 行だけ出力して 0 で終了する必要があります。インストール/更新時に加えセッションごとに 1 回バックグラウンド再実行され、ユーザーはコマンド全文を見て受け入れます(非 TTY では `--yes` か `--accept-command <sha256>`)。`mode` は `copy`(デフォルト、256MiB/20,000 エントリ上限)か `link`(in-place、Windows 不可、node_modules 同梱必須)です。依存としては自動インストールされません。

#### strict モードとエントリ側コンポーネント

エントリの `strict` はデフォルト true です。plugin.json がある場合、true ならエントリの commands/agents/skills/outputStyles/themes を追記し、hooks はイベント単位でマニフェストの matcher を置換します。false でエントリがコンポーネントを宣言していれば `Plugin <name> has conflicting manifests: both plugin.json and marketplace entry specify components` でロード失敗です。plugin.json がなければ strict に関係なくエントリがマニフェストになります。plugin.json がある場合、エントリの `mcpServers`/`lspServers`/`userConfig`/`channels` は適用されません。`headersHelper` を持つ archive エントリは `strict: false` 必須です。

#### 配布、renames、依存

配布経路は 3 つです。マーケットプレイスなし(フォルダ/zip を `--plugin-dir`/`--plugin-url`/`~/.claude/skills/` で渡す)、自前マーケットプレイス(git リポジトリに `.claude-plugin/marketplace.json`)、Anthropic ディレクトリ(claude.ai/directory/manage から申請、有料プラン必須、Claude Code には `<name>@synced` として届く)です。公式 `claude-plugins-official` はディレクトリポータル経由の申請を受け付けません。

```json
{
  "name": "your-marketplace",
  "owner": { "name": "Your Name" },
  "plugins": [
    { "name": "deploy-helper", "source": "./" }
  ]
}
```

自プラグインのリポジトリ内で公開する形で、plugin.json と同じ `.claude-plugin/` に並べて置きます。

```json
{
  "name": "your-marketplace",
  "owner": { "name": "Your Org" },
  "allowCrossMarketplaceDependenciesOn": ["your-shared-marketplace"],
  "forceRemoveDeletedPlugins": true,
  "plugins": [
    {
      "name": "code-formatter",
      "source": "./plugins/code-formatter",
      "dependencies": [
        { "name": "audit-logger", "marketplace": "your-shared-marketplace" }
      ]
    }
  ],
  "renames": {
    "formatter": "code-formatter",
    "legacy-linter": null
  }
}
```

host-marketplace と dependencies のページの例を 1 ファイルに合成したものです。`renames` で旧名→新名(`null` で削除)を宣言すると、ユーザーの enabledPlugins/pluginConfigs の user/project/local スコープが書き換えられます。append-only の履歴として保ち、再リネーム時はチェーンを追加します(managed settings は書き換えられない)。`forceRemoveDeletedPlugins: true` で削除プラグインをユーザー側からもアンインストールします(Flagged セクションに表示)。クロスマーケットプレイス依存はデフォルトで拒否され、ルート(インストール元)マーケットプレイスの `allowCrossMarketplaceDependenciesOn` に列挙するか、ユーザーが同スコープで既にインストール・有効化している必要があります。

```json
{
  "name": "deploy-kit",
  "version": "3.1.0",
  "dependencies": [
    "audit-logger",
    { "name": "secrets-vault", "version": "~2.1.0" }
  ]
}
```

plugin.json の依存宣言です。semver 範囲は依存先リポジトリの git タグ `<plugin-name>--v<version>` に対して解決され、`claude plugin tag --push` がそのタグを作ります。pre-release は `^2.0.0-0` のように明示しないとマッチしません。複数プラグインの制約は全範囲を満たす最高バージョンに解決され、重ならなければ `has conflicting version requirements` でインストール失敗です。npm/archive/command ソースの依存はタグ解決されず plugin.json の `version` でロード時に検査され、version 未設定は全制約に不合格です。`name` と `dependencies` だけのマニフェストで「バンドル」プラグイン(チーム標準セット)が作れます。

#### 認証と組織管理

プライベートマーケットプレイスへのアクセスはユーザーマシンの git 資格情報に依存し、Claude Code はトークンを持たずプロンプトも出しません。`owner/repo` 指定は `ssh -T git@github.com` を試して SSH、失敗なら HTTPS(フォールバックはシェルの `claude plugin install` のみ)。`CLAUDE_CODE_PLUGIN_PREFER_HTTPS=1` で常に HTTPS です。`GITHUB_TOKEN` を環境に置くだけでは効かず、`gh auth login` + `gh auth setup-git` のような credential helper 経由で効きます。Git LFS コンテンツは取得されずポインタのままです。

```json
{
  "strictKnownMarketplaces": [
    { "source": "github", "repo": "anthropics/claude-plugins-official" },
    { "source": "github", "repo": "your-org/*" },
    { "source": "skills-dir" }
  ],
  "extraKnownMarketplaces": {
    "claude-plugins-official": {
      "source": { "source": "github", "repo": "anthropics/claude-plugins-official" }
    },
    "your-marketplace": {
      "source": { "source": "github", "repo": "your-org/your-marketplace" }
    }
  },
  "enabledPlugins": {
    "code-formatter@your-marketplace": true,
    "deploy-helper@your-marketplace": true
  },
  "disableSideloadFlags": true
}
```

managed settings の例で、公式+自社マーケットプレイスを allowlist し、強制インストールとサイドロード禁止を同時に行います。allowlist は登録しないので `extraKnownMarketplaces` で明示登録し、`{"source":"skills-dir"}` を外すと `~/.claude/skills/` のプラグインが止まります。allowlist は厳密一致(ref/path/URL 形式まで、`owner/*` は v2.1.223+)、`hostPattern`/`pathPattern` は正規表現です。`blockedMarketplaces` は先に評価され、github エントリは同等の git URL もブロックします。一度ブロックされた公式マーケットプレイスの自動登録は記憶され、ポリシー変更後も再試行されません。managed のプラグインキーは server-managed → MDM → managed-settings.json の「最初にキーを配ったソース」のみが有効で、`managedSourcesBehavior: "merge"` で全ソース適用です。

```shell
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin marketplace add your-org/your-marketplace
CLAUDE_CODE_PLUGIN_CACHE_DIR=/opt/claude-seed claude plugin install code-formatter@your-marketplace
# runtime:
# CLAUDE_CODE_PLUGIN_SEED_DIR=/opt/claude-seed
# CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1   (-p/CI で初回クエリ前にインストール待機)
```

コンテナ/CI 用の seed 作成です。seed は読み取り専用で autoUpdate 強制 OFF、`enabledPlugins` での有効化は別途必要です。`-p`/CI ではインストールがバックグラウンドなので、`CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` を立てないと初回ターンでプラグインが欠けることがあります。確認は `claude -p --output-format stream-json --verbose` の init イベントの `plugins` リストで行います。

Anthropic のマーケットプレイスは 3 種で、公式 `claude-plugins-official`(初回対話セッションで自動追加、`CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL=1` で抑止)、コミュニティ `claude-community`(ほぼ全エントリをコミット SHA 固定)、デモ `claude-code-plugins`(anthropics/claude-code の `plugins/`)です。公式の大半はパートナー製で、Anthropic 自身が保守するのは commit-commands、code-review、feature-dev、言語サーバ群など少数です。

### 7.5 Mods: プロセス内で動く hooks module

#### 構造と 3 つの応答パターン

Mod は `hooks/hooks.json` の `modules` キーで JS/TS ファイルを指すプラグインです。v2.1.287+(デスクトップ 2.1.286+)でデフォルト ON、ビルド不要で `.js`/`.mjs`/`.cjs`/`.jsx`/`.ts`/`.mts`/`.cts`/`.tsx` を直接ロードします。Claude Code プロセス内で `register(on, options)` が呼ばれ、`on('event', matcher?, async ($, e, next) => ...)` でミドルウェアチェーンにフックを登録します。各フックは observe(`next(e)`)、rewrite(`next({...e, ...})`)、answer(`next` を呼ばず結果を返す)の 3 択です。

```javascript
// first-mod/hooks/hooks.json
{
  "description": "The first-mod hooks module",
  "modules": ["./register.js"]
}

// first-mod/hooks/register.js
// The count, shared by the hooks below
let calls = 0

// Claude Code calls this once when the mod loads
export function register(on) {
  // Runs when the session starts, before your first prompt
  on('session.start', async ($, e, next) => {
    // Add the /tally command
    await $.command.register({
      name: 'tally',
      description: 'Show how many tool calls Claude has made',
    })
    // Let the session start as usual
    return next(e)
  })

  // Runs each time Claude is about to use a tool
  on('tool.call', async ($, e, next) => {
    calls += 1
    // Ask Claude Code to draw the interface again, so the new count shows
    $.ui.invalidate('ui.render')
    // Let the tool run as usual
    return next(e)
  })

  // Runs when you type /tally, and only then, because of the matcher
  on('command.run', { command: 'tally' }, async () => {
    // The text to print in the transcript
    return { text: 'Claude has made ' + calls + ' tool calls since this mod loaded' }
  })

  // Runs each time Claude Code draws the spinner
  on('ui.render', { component: 'Spinner' }, async ($, e, next) => {
    // Keep Claude Code's spinner, with the count added after its word
    return next({ ...e, props: { ...e.props, suffix: ' · tool calls: ' + calls + '…' } })
  })
}
```

`claude --plugin-dir ./first-mod` でロードし、ファイル保存で hot reload されます(`register` が再実行されモジュール変数はリセット)。`claude plugin validate ./first-mod` は `hooks:` と `calls:` 行を出力し、インストール前にどのイベントと `$` 呼び出しを使うか静的に確認できます。

hooks module 内には Node API も `setTimeout` 等のタイマーグローバルも直接のネットワーク/ファイルアクセスもなく、すべて `$` 経由です(だから静的に列挙できる)。`$` の呼び出しは `$.ns.method` の完全形で書く必要があり、`const ui = $.ui`、分割代入、computed index、イベント名の変数化、動的 import、`require` はすべて validate 失敗です。同じイベントを matcher なしで 2 回 `on` すると `on("session.start") is registered twice without a matcher` でロード失敗します。

#### イベントと実行順序

主要イベントは `tool.call`/`tool.check`/`tool.describe`、`prompt.submit`/`prompt.section`/`prompt.context`/`prompt.attachment`/`prompt.autocomplete`/`prompt.mention`/`prompt.fill`/`prompt.suggest`/`prompt.edit`/`prompt.compose`/`prompt.change`(v2.1.300+)、`skill.prompt`、`command.run`/`command.describe`、`config.set`/`config.describe`、`turn.start`/`turn.step`(async generator)/`turn.complete`、`session.start`/`session.end`/`session.compact`/`session.receive`/`session.send`/`session.append`/`session.measure`/`session.attach`/`session.detach`、`agent.offer`/`agent.spawn`、`ui.render`/`ui.press`/`ui.input`/`ui.select`/`ui.close`/`ui.message`/`ui.fault`/`ui.resolve`/`ui.focus`/`ui.scroll`、`plugin.register`、`engine.create`、`telemetry.log`/`telemetry.mark`、`classic.<SettingsHookEvent>`、そして全 mods API メソッド名(`fs.read` 等。後続 mod の呼び出しを横取りできる)です。`'*'` は telemetry 以外の全イベント、`'classic.*'` は設定フックイベント全部です。`session.start` は `/clear`・`/resume`・`/branch` では再発火しません。

実行順序はミドルウェアチェーンです。(1) `sec-default@builtin` ガード + managed `prependPlugins` + 組織の mod、(2) ユーザーインストール mod(依存先より前)、(3) `appendPlugins`、(4) その他の組み込み mod。managed settings の `PreToolUse` は最初の mod より前に走りブロックは最終、他の settings/plugins の `PreToolUse` は最後の mod の `next` 後に走ります。つまり mod が `next` を呼ばずに `tool.call` に答えると、通常の PreToolUse hooks は実行されません。`tool.check` は permission rule と settings hooks の後に発火し、`next(e)` がその決定(allow/ask/deny)を返します。mod は managed 外の PreToolUse ブロックや ask ルールを覆せますが、ガードがロードされる環境では deny ルールは覆せません(`allowModsToOverrideDenyRules` で許可可)。

```javascript
const RISKY = /\brm\s+-rf?\b|\bgit\s+reset\s+--hard\b|\bgit\s+push\b.*--force/

export function register(on) {
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    // Let every other command through without a question
    if (!RISKY.test(e.command)) return next(e)
    // Start from the safe answer, so a question nobody answers refuses the command
    let answer = 'Refuse'
    try {
      // The tool call waits here until the user picks one of the two labels
      answer = await $.ui.ask('Run this command? ' + e.command, ['Run it', 'Refuse'])
    } catch {
      // The user dismissed the question, or this is a claude -p run with nobody to ask
    }
    if (answer !== 'Run it') {
      // Answer without calling next, so the command doesn't run
      return { deny: 'The user declined this command. Ask before trying a different approach.' }
    }
    return next(e)
  })
}
```

危険コマンドを保留してユーザーに尋ねる `tool.call` ガードです(`hooks/register.js`)。`$.ui.ask` の待ち時間は 10 秒制限にカウントされず、`next` を呼ばず `{ deny }` を返すと許可プロンプトも出ずコマンドは走りません。

#### fail-open を fail-closed にする

フックが失敗(throw/timeout/不正な形の戻り値)すると、`.catch` ハンドラなしではスキップされて次のハンドラが走ります。つまりゲートは fail-open です。`claude plugin validate` は `gating hook without .catch: tool.call` を報告し、`--json` の `gatingHooks`(v2.1.290+)で列挙します。v2.1.301 からは `.catch` はフック自身の throw/timeout 時のみ実行されます。

```javascript
// on returns a registration, and .catch attaches a handler to that one hook
on('tool.call', { tool: 'Bash' }, guard).catch(async ($, e, next) => {
  // guard had already called next, so return what came back
  if (next.called) return next(e)
  // next.error.kind says why the handler was asked, such as 'throw' or 'timeout'
  return { deny: 'The command guard failed, so this command was not run: ' + next.error.kind }
})

on('tool.check', { tool: 'Bash' }, async ($, e, next) => {
  // What the permission rules and settings hooks decided: 'allow', 'ask', or 'deny'
  const decided = await next(e)
  if (!e.input.command.includes('git push')) return decided
  const branch = await $.process.run(['git', 'branch', '--show-current'])
  if (branch.stdout.trim() !== 'main') return decided
  return { decision: 'deny', reason: 'Push from a branch other than main' }
})
```

上段が fail-closed 化、下段が `tool.check` でのブランチ依存拒否です。`tool.check` と `plugin.register` では `next` 後の拒否も有効ですが、`tool.call` で `next` 後に deny すると結果を Claude から隠すだけで実行は取り消されません。

時間制限は、フック自身の実行が 10 秒(`prompt.edit` は 50ms)、`.catch` は 1 秒。`next` や `$` 呼び出し(`$.clock.sleep` 除く)の待ち時間は含みませんが、自前 Promise の await はカウントされます。`session.end` フック全体は SessionEnd 予算(1.5 秒)です。

```javascript
// function* makes the hook a generator, which can pass the response on piece by piece
on('turn.step', async function* ($, e, next) {
  // Send the request, forward each piece as it arrives, and keep the finished result
  const result = yield* next(e)
  // Skip a result that reports no token counts
  if (result.usage) {
    $.ui.log('cache read ' + result.usage.cache_read_input_tokens + ' · wrote ' + result.usage.cache_creation_input_tokens)
  }
  // Return the result unchanged, so the turn continues as usual
  return result
})

on('prompt.submit', async ($, e, next) => {
  // Pass on a prompt that doesn't mention a pull request as it is
  if (!/\bPR\b|pull request/i.test(e.text)) return next(e)
  const git = await $.process.run(['git', 'branch', '--show-current'])
  // Outside a git repository the command fails, so there's no branch to add
  if (git.exitCode !== 0) return next(e)
  // Keep any context an earlier hook added, and add one more line for Claude
  return next({ ...e, context: [...(e.context ?? []), 'Current branch: ' + git.stdout.trim()] })
})
```

`turn.step` は async generator で、`next({...e, model})` で別モデルに送ることもできます。`prompt.submit` の `context` は Claude だけが読み、`text` の書き換えは履歴にも反映されます。`{ drop: reason }` でプロンプトを止められます。

#### `$` API、登録、制限値

`$` の名前空間は `plugin`、`ui`、`command`、`tool`、`agent`、`model`(complete/fork/classify)、`prompt`、`turn`、`session`、`config`、`settings`、`env`、`fs`、`store`、`state`、`clock`、`http`、`process`、`mcp`、`audio`、`telemetry` です。v2.1.295 で `$.ui.notify`、v2.1.300 で `$.ui.view({ agentId })` が追加されています。

```javascript
on('session.start', async ($, e, next) => {
  await $.tool.register({
    name: 'ticket',
    description: 'Look up a ticket by its id and return its title and status',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
  })
  // Call the function every 60,000 milliseconds, starting one minute from now
  $.clock.every(60_000, async () => {
    const status = await $.process.run(['gh', 'pr', 'checks', '--json', 'state'])
    $.ui.status('checks: ' + summarize(status.stdout))
  })
  return next(e)
})

// The full tool name is mcp__, the plugin's name, and the registered name
on('tool.call', { tool: 'mcp__my-mod__ticket' }, async ($, e) => {
  const response = await $.http.fetch('https://tickets.example.com/api/' + encodeURIComponent(e.id))
  return { result: response.ok ? response.text : 'Lookup failed with status ' + response.status }
})

on('command.run', { command: 'triage' }, async ($, e) => {
  const r = await $.model.complete({
    model: 'haiku',
    prompt: [
      // Identical on every call, so it forms the cached prefix
      { text: RULES, cache: true },
      // Changes on every call, so it goes after the breakpoint
      { text: e.args },
    ],
  })
  return { text: 'Label: ' + (r.isAnswered ? r.text.trim() : 'unknown') }
})
```

api.md の 3 例を合成したものです。`$.tool.register` のツールは `mcp__<plugin>__<name>` として Claude に見え、`tool.call` を完全名でマッチして処理します(tool search で遅延される場合は `isDeferred: false`、v2.1.293+)。`$.command.register` は組み込みコマンド名と衝突すると throw し、throw したフックは丸ごとスキップされるので、`session.start` の最後に登録するか try/catch します。`$.model.complete` はセッションの資格情報で課金され、API 失敗では reject せず `r.isAnswered=false` + `r.reason` になります。ブロック配列 + `cache: true` のプロンプトキャッシュは v2.1.292+ で、ブレークポイントは API 上限 4 つ。`$.clock.every`/`after` は reload で止まります。

主な制限値は、`$.process.run` 30 秒(最大 10 分)、`$.model.complete` の maxTokens 1024(最大 64,000)、`$.fs.read`/`write` 4MiB、`$.http.fetch` リクエスト/レスポンス 4MiB・30 秒・リダイレクト 5、`$.store` 合計 4MiB JSON(`~/.claude/plugins/store/` 配下、全セッション共有)、`$.session.messages()` 最新 4,096 件、1 ツリーのテキスト 100,000 文字、`$.ui.invalidate` 10 回/秒(可視ペインは 30)、toast 4 秒、自発オープンのペインは 144 列以上(一度開けば 110)、名前は英数字・`_`・`-` で 64 文字です。

#### 描画: どこで動き、どこで描けるか

Mod はどこでも実行されますがどこでも描画されるわけではありません。ターミナル、デスクトップの Code タブ、VS Code 拡張(2.1.299+)で描画され、`claude -p`/SDK/Remote Control/クラウドセッションではフックのみ実行、デスクトップの WSL セッションではプラグイン自体が使えません。Render site は Pane、AbovePrompt、UserMessage、AssistantMessage、ToolUse/ToolResult/ToolGroup、CommandOutput、AskUserQuestion、ToolProgress、Spinner、TurnDuration、InfoNotice、SessionMode、PromptHint。要素は Box、Text、Button、Link、Code、Markdown、Input、Select、Svg(Desktop/VS Code のみ)、Client(Terminal/Desktop)、Raster、Image(Terminal のみ)です。許可プロンプト自体だけは描き換えられません。

```javascript
const PANE = 'hello-tabs'
let tab = 'one'
let count = 0

export function register(on) {
  on('session.start', async ($, e, next) => {
    await $.command.register({ name: 'hello-tabs', description: 'Open the hello-tabs pane' })
    const saved = await $.store.get('count')
    if (typeof saved === 'number') count = saved
    return next(e)
  })

  on('command.run', { command: 'hello-tabs' }, async ($) => {
    await $.ui.open({ id: PANE, title: 'Hello tabs', focus: true, closeOnEscape: true })
    return {}
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE) return next(e)
    const { Box, Text, Button } = $.ui.resolve(e)
    const redraw = () => $.ui.invalidate('ui.render')
    const tabButton = (name, label, hotkey) =>
      Button({ key: 'tab-' + name, label, hotkey, plain: true, dimColor: tab !== name, onPress: () => { tab = name; redraw() } })
    const body = tab === 'one'
      ? [Text({ children: ['This is the first tab.'] })]
      : [Box({ flexDirection: 'row', columnGap: 2, children: [
          Button({ key: 'more', label: 'Add one', hotkey: 'a', onPress: async () => { count += 1; redraw(); await $.store.set('count', count) } }),
          Text({ children: ['Count: ' + count] }),
        ] })]
    return Box({ flexDirection: 'column', children: [
      Box({ flexDirection: 'row', columnGap: 3, children: [tabButton('one', 'One', '1'), tabButton('two', 'Two', '2')] }),
      Text({ children: [' '] }),
      ...body,
    ] })
  })
}
```

interface.md の hello-tabs 例をコメント省略で圧縮したものです。`$.ui.open` の `focus`/`closeOnEscape`/`holdToasts` は true のみ受け付け、false を渡すと throw します。`$.state`(セッション中のみ、リロード耐性あり、読む ui.render サイトを自動再描画)と `$.store`(ディスク永続、全セッション共有)の使い分けに注意してください。

#### 信頼モデルと組織制御

Mod はサンドボックス外でユーザー権限で動き、ファイル・プロセス・ネットワーク・環境変数・設定(API キー含む)・全プロンプト・全ツール呼び出しにアクセスでき、ツール呼び出しを事前承認したり `$.prompt.submit` でユーザーの言葉としてプロンプトを送信したりできます。`$.fs.read` は `Read(.env)` の deny ルールの対象外です。インストール前に `claude plugin validate ./some-mod` の `hooks:`/`calls:`/`env reads:`/`env writes:` 行を読み、`$.fs.*`、`$.process.*`、`$.http.fetch`、`$.env.*`、`$.settings.read`、`$.prompt.submit`、`$.session.send`、`tool.call`/`prompt.submit`/`session.append`/`tool.check` のフックがあるかを確認してください。

組み込み mod は `cc-plugin-agents-md`、`cc-plugin-diff`、`cc-plugin-plugin-authoring`、`cc-plugin-sec-default`(無効化不可のガード)、`cc-plugin-telemetry`、`cc-plugin-you-should-know`(デフォルト OFF)の 6 種で、`disableAllHooks`/`--bare`/`--safe-mode` は組み込み mod を止めません。

```json
{
  "extraKnownMarketplaces": {
    "acme-tools": {
      "source": { "source": "directory", "path": "/opt/acme/claude-plugins" }
    }
  },
  "enabledPlugins": { "acme-guard@acme-tools": true },
  "prependPlugins": ["acme-guard@acme-tools", "sec-default@builtin"],
  "pluginConfigs": {
    "cc-plugin-sec-default@builtin": {
      "options": { "allowManagedModsOnly": true }
    }
  },
  "disableSideloadFlags": true
}
```

managed settings で組織の mod を先頭で動かし、ユーザー mod を拒否する構成です。「組織の mod」と認定されるのは、managed `enabledPlugins` で true、`directory` ソースで絶対パス指定、相対パスエントリで in-place ロードされるものだけです。GitHub/git/URL/npm ソースからキャッシュにコピーされたプラグインは managed で有効化してもユーザー mod 扱いになります(`prependPlugins`/`appendPlugins` はスキップ、`allowManagedModsOnly` で拒否)。`prependPlugins` を設定したら `sec-default@builtin` を明示列挙しないとガードがロードされません。`pluginConfigs` のキーは `cc-plugin-sec-default@builtin` のみです。

```javascript
const BLOCKED_CALLS = ['process.run', 'process.spawn']

// The same check as before, moved into a function of its own
async function checkMod($, e, next) {
  const blocked = e.uses.calls.filter((call) => BLOCKED_CALLS.includes(call))
  if (e.tier === 'user' && blocked.length > 0) {
    return { refuse: 'Acme policy: mods may not call ' + blocked.join(', ') }
  }
  return next(e)
}

export function register(on) {
  // The handler runs only when checkMod throws or exceeds its time limit
  on('plugin.register', checkMod).catch(async ($, e, next) => {
    // Let your organization's mods and built-in mods load
    if (e.tier !== 'user') return next(e)
    // Refuse the user's mod that couldn't be checked
    return { refuse: 'Acme policy check failed, so this mod was not loaded' }
  })
}
```

`plugin.register` でユーザー mod を静的情報(`e.uses.calls` は `$.` なしの `namespace.method` 形式)から拒否するポリシー mod です。`prependPlugins` に入れた組織 mod のみ他 mod の読み込みを拒否できます。

#### 開発ループ: Claude に書かせる、テスト、validate、eval

Claude に mod を書かせると `~/.claude/dev-mods/<session-id>/<mod>/` に保存され(protected path なので default/acceptEdits では各ファイルに承認が要る)、初回保存時に hot reloading を有効にするか問われます。そのセッション限定で `cleanupPeriodDays` 後にフォルダごと削除されるので、残すには外へコピーして `--plugin-dir` で読みます。`--plugin-dir` で読んだ mod は `.claude-plugin/types/` に `claude-code/index.d.ts`(全イベント・API・要素)等と `tsconfig.json` が生成されます。型定義はバージョンごとに変わり、ドキュメントより優先される一次情報です。

```typescript
import { expect, test } from 'claude-code/testing'

test('/tally reports the tool calls the mod has seen', async ($, on) => {
  // Answer each tool call in Claude Code's place, so no tool runs
  on('tool.call', () => ({ result: 'ok' }))

  // Fire two tool calls, which the mod's tool.call hook counts
  await $.tool.call({ tool: 'Bash', command: 'ls' })
  await $.tool.call({ tool: 'Read', file_path: 'README.md' })

  // Run /tally and check the text its hook returns
  const answer = await $.command.run({ command: 'tally', args: '' })
  expect(answer.text).toBe('Claude has made 2 tool calls since this mod loaded')
})
```

`first-mod/tests/first-mod.test.ts` として保存し `claude plugin test` を実行します。セッション・サインイン・ネットワーク不要で、1 テスト 5 秒制限。v2.1.299 以降は `ui.render` ツリーのルートに `part: { plugin }` が付くので exact-tree assertion はそれを含めます。

`claude plugin validate <path>` は exit 0(passed / with warnings)、1(failed、`--strict` では警告も)、2(予期しないエラー)で、ディレクトリを渡すと marketplace.json → plugin.json → コンポーネントファイルの順で判定し(v2.1.289+ では両方あれば両方検証)、v2.1.281+ で `.mcp.json` の MCP エントリも検査します。symlink は追いません。

`claude plugin eval`(v2.1.269+)は `evals/<case>/prompt.md` + `graders/*.md` を、プラグインのみロードした隔離 `claude -p` 子プロセス(空ワークスペース・一時 HOME、ユーザー設定・CLAUDE.md・他プラグインなし)で各ケース 3 回×プラグインあり/なしで実行し、`WITH`/`W/OUT`/`Δ` を出します。grader は `regex`/`tool_used`/`tool_order`/`file_exists`(無料)と `llm`/`baseline`(judge モデル)の 6 種でカスタムコードは書けません。

```markdown
<!-- evals/first-case/prompt.md -->
---
max_turns: 10
allowed_tools: [Read, Glob, Grep, Skill]
---
Write me a commit message for this change: I renamed getUser to fetchUser and updated the three call sites.

<!-- evals/first-case/graders/criteria.md -->
---
type: llm
---
PASS if <what a correct response contains>.
FAIL if <what a wrong or missing response looks like>.

<!-- evals/first-case/graders/skill-fired.md -->
---
type: tool_used
tool: Skill
input_match: '"skill"\s*:\s*"(?:[\w-]+:)?your-skill-name"'
---
```

CI では `claude plugin eval . --trust-plugin --json results.json --threshold 0.8 --model <model-id> --judge-model <model-id> --no-publish --max-cost-usd 20` の形で、exit code は 0/1/2(partial)/130/143 です。`tool_used: Skill` grader は両腕で `scored:false`(プラグインなしでは絶対通らないため)。Bash 等は `--allow-tools` で明示付与し OS サンドボックス必須(Linux は bubblewrap + socat、Windows ネイティブ不可)。全 run と judge は実際に課金されます。

### 7.6 コストと計測

有効なプラグインは使わないセッションでもコストがかかります。Claude が自動起動できる各スキル・エージェント・コマンドの name と description が毎ターンのコンテキストに乗るためです。`claude plugin details <name>` の Always-on 行がその推定トークン数で、hooks と MCP サーバは推定対象外です(MCP ツール分は `/context` の MCP tools カテゴリ)。公式マーケットプレイスのプラグインは `/plugin` の詳細に Context cost(Every turn / When invoked)が表示され、2,000 トークン以上は強調されますが、自作マーケットプレイスには表示されません。

`/plugin` の Installed タブは、14 日かつ 10 セッション未使用のマーケットプレイスプラグインを「Not used recently」にまとめます。`/skill-doctor`、`/doctor`、`/usage` でも未使用検出が可能です。組織向けには OTel イベント `claude_code.plugin_installed`/`plugin_loaded`/`skill_activated`/`hook_plugin_metrics` と Enterprise の Analytics API がありますが、OTel では公式マーケットプレイスのプラグイン名のみ実名で、自社マーケットプレイス含むその他は `third-party` に置換または省略されます(`OTEL_LOG_TOOL_DETAILS=1` で実名化、`plugin_loaded` の `plugin.scope` で出自は分かる)。

CLI/SDK 作者向けの補足として、`CLAUDECODE` または `CLAUDE_CODE_CHILD_SESSION`(v2.1.172+)が立っている時に stderr へ 1 行出力すると、Claude Code がモデルに見せる前に除去し、対話セッションで 1 回限りのインストール推奨ダイアログを出します。

```shell
if [ -n "$CLAUDECODE" ]; then
  printf '%s\n' '<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />' >&2
fi
```

公式名のマーケットプレイス掲載プラグインのみ対象で、テレメトリ ON、ローカルの attended セッションが条件です。1 セッション 1 回・1 プラグイン生涯 1 回・1 マシン 100 プラグインまで、30 秒無応答は No 扱いです。

### 落とし穴と対策

- `.claude-plugin/` に plugin.json 以外を置かない。skills/ 等はプラグインルート直下。
- `commands`/`agents`/`outputStyles`/`workflows`/`experimental.*` キーはデフォルトフォルダを置換する。残したければ明示列挙。`skills` だけが追加、`hooks`/`mcpServers`/`lspServers` はマージ。
- `hooks/hooks.json` はトップレベル `"hooks"` ラッパー必須、マニフェスト hooks キーのインラインはラッパーなし。混同するとロード失敗。
- settings.json と hooks.json に同じ hook を置くと二重実行。プラグイン化したら settings.json 側を消す。
- プラグイン MCP ツールの matcher/permission は `mcp__plugin_<plugin>_<server>__<tool>` の完全名。
- `${CLAUDE_PLUGIN_ROOT}` はバージョンごとに変わるので状態を書かない。Bash ツール環境にはこれらの変数が存在しない。
- `${user_config.*}` は shell-form hook / monitor / headersHelper で拒否される。shell-form hook は `CLAUDE_PLUGIN_OPTION_<KEY>` を読む。
- plugin.json に `version` を固定したままコミットだけ push しても更新は届かない。plugin.json とエントリの両方に version を書かない(plugin.json が黙って勝つ)。
- エントリ name と plugin.json name を一致させる。違うと `not found in marketplace`。
- マーケットプレイスを最後のスコープから remove すると、そこからインストールした全プラグインとオプション・シークレット・データが消える。更新目的なら `marketplace update`。
- `strict: false` のエントリがコンポーネントを宣言すると `conflicting manifests`。headersHelper 付き archive エントリは `strict: false` 必須。
- 同名プラグインを別マーケットプレイスから 2 つ有効化すると hooks は片方しか登録されない。`--plugin-dir` の同名プラグインはインストール版を黙って置換する。
- project スコープで有効化しても他メンバーには届かない。各自 `install --scope project`。クラウドセッションはローカル設定のプラグインを読まない。
- 自動更新はサードパーティ/コミュニティ/ローカルで OFF。ON でも実行中セッションは旧版のまま。`/reload-plugins` は MCP/LSP の増減でキャッシュが無効になるなら `--force` が要る。
- Node 依存の自動インストールは無効化不可。yarn/pnpm/bun.lockb はスキップ、npm 配布は `npm-shrinkwrap.json`。
- クロスマーケットプレイス依存は `allowCrossMarketplaceDependenciesOn` 必須。command ソースや headersHelper 付きの依存は自動インストールされない。pre-release は `^2.0.0-0` と書く。
- `strictKnownMarketplaces` を設定したら `{"source":"skills-dir"}` を入れないと `~/.claude/skills/` が止まる。一度ブロックされた公式マーケットプレイスの自動登録は記憶され再試行されない。
- `GITHUB_TOKEN` を環境に置くだけではプライベートマーケットプレイスは認証されない(credential helper 経由)。Git LFS は取得されない。
- Mod のゲートフックは `.catch` なしだと fail-open。自前 Promise の await は 10 秒制限にカウントされる。
- `$` 呼び出しは完全形で書く。同じイベントを matcher なしで 2 回 `on` すると失敗。`$.command.register` の衝突 throw でフック全体がスキップされる。
- `$.ui.open` の `focus`/`closeOnEscape`/`holdToasts` は true のみ。自発オープンのペインは 144 列未満では表示されない。
- Claude が書いた mod は `~/.claude/dev-mods/<session>/` にありセッション限定、`cleanupPeriodDays` で消える。
- GitHub/git/URL/npm ソースの mod は managed で有効化しても組織の mod にならない。`prependPlugins` を設定したら `sec-default@builtin` を列挙。
- eval の各 run は空ワークスペース・一時 HOME。Bash 付与にはサンドボックス必須で Windows ネイティブ不可。全 run と judge は課金対象。
- OTel では自社マーケットプレイスのプラグイン名も `third-party` になる。`OTEL_LOG_TOOL_DETAILS=1` で実名化。
- claude.ai 同期プラグイン(`@synced`)は API キー/トークン認証、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、`--bare`/`--safe-mode`、`--setting-sources` に user なしでは同期されない。
- `/plugin install <パス/URL 直指定>` がどのエラーになるかは公式に明記がない(未検証)。`claude plugin install <name> --marketplace <source>` を使う。

### 中級者が次にやること

1. 既存の `.claude/` 資産をプラグイン化する: `claude plugin init my-tools --with skills hooks mcp` で `~/.claude/skills/my-tools/` を作り、skills/agents/hooks を移す。hooks は settings.json 側を削除。`claude plugin validate ~/.claude/skills/my-tools` で exit 0 を確認し、`claude plugin details my-tools` の Always-on トークンを見て description を削る。
2. 自前マーケットプレイスで配る: リポジトリルートに `.claude-plugin/marketplace.json`(エントリ名 = plugin.json name)、`plugins/<name>/` に本体。`version` は両方から外してコミット追跡にするか、毎リリース `claude plugin tag --push` で `<name>--v<version>` タグを打つ。チームには `claude plugin install <name>@<marketplace> --scope project` を README に書く(validate が 2.1.295+ でその行を助言する)。
3. チーム標準セットを「バンドル」プラグインにする: `name` と `dependencies` だけの plugin.json を作り、`{ "name": "db-migrate", "version": "^3.0" }` のように範囲固定。別マーケットプレイスの依存はルート側で `allowCrossMarketplaceDependenciesOn` を宣言。
4. CI/コンテナで決定的に動かす: `CLAUDE_CODE_PLUGIN_CACHE_DIR` で seed をビルドし、実行時に `CLAUDE_CODE_PLUGIN_SEED_DIR` + `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1`。`claude -p --output-format stream-json --verbose` の init イベントで plugins を確認する。非公開リポジトリは `GH_TOKEN` + `gh auth setup-git`。
5. 最初の mod を 1 日で作る: `claude --plugin-dir ./guard-mod` で `tool.call` ガード(RISKY 正規表現 + `$.ui.ask`)を書き、`.catch` で fail-closed にし、`claude plugin validate --json` の `gatingHooks` が空になるまで直す。`tests/*.test.ts` を `claude plugin test` で回し、`.claude-plugin/types/claude-code/index.d.ts` を型の一次情報として参照する。
6. `turn.step` と `$.session.usage()` でコスト可視化 mod を作る: `cache_read_input_tokens` をステータス行に出し、`$.model.complete` を使う機能にはブロック配列 + `cache: true` でキャッシュブレークポイントを置く。`r.isAnswered` を必ず確認する。
7. 組織運用なら managed settings を一式で: `strictKnownMarketplaces`(公式 + `your-org/*` + `skills-dir`)、`extraKnownMarketplaces` での明示登録、`enabledPlugins`、`disableSideloadFlags`。mod を統制するなら directory ソース + 絶対パス + `prependPlugins`(`sec-default@builtin` 込み)+ `allowManagedModsOnly`。
8. プラグインの効果を数値で証明する: `claude plugin eval init` で 1 ケース作り、`llm` grader と `tool_used: Skill` grader を置き、`--max-cost-usd` を小さく設定して `Δ` が正になるまで SKILL.md を調整する。
9. 棚卸しを習慣化する: `/plugin` の Not used recently、`/skill-doctor`、`/context` の MCP tools カテゴリを月 1 回確認し、2,000 トークン超の常時コストを持つプラグインは必要時だけ `--plugin-dir` で読む運用に切り替える。

### 出典

- https://code.claude.com/docs/en/plugins/overview
- https://code.claude.com/docs/en/plugins/create
- https://code.claude.com/docs/en/plugins/components
- https://code.claude.com/docs/en/plugins/manifest-reference
- https://code.claude.com/docs/en/plugins/marketplace-reference
- https://code.claude.com/docs/en/plugins/create-marketplace
- https://code.claude.com/docs/en/plugins/publish
- https://code.claude.com/docs/en/plugins/dependencies
- https://code.claude.com/docs/en/plugins/install
- https://code.claude.com/docs/en/plugins/anthropic-marketplaces
- https://code.claude.com/docs/en/plugins/loading
- https://code.claude.com/docs/en/plugins/cli-reference
- https://code.claude.com/docs/en/plugins/measure
- https://code.claude.com/docs/en/plugins/cli-hints
- https://code.claude.com/docs/en/plugins/security
- https://code.claude.com/docs/en/plugins/org
- https://code.claude.com/docs/en/plugins/code-intelligence
- https://code.claude.com/docs/en/plugins/host-marketplace
- https://code.claude.com/docs/en/plugin-evals
- https://code.claude.com/docs/en/plugins/mods/overview
- https://code.claude.com/docs/en/plugins/mods/create
- https://code.claude.com/docs/en/plugins/mods/reference
- https://code.claude.com/docs/en/plugins/mods/api
- https://code.claude.com/docs/en/plugins/mods/events
- https://code.claude.com/docs/en/plugins/mods/interface
- https://code.claude.com/docs/en/plugins/mods/admin
- https://code.claude.com/docs/en/changelog


---

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


---

## 第9章 ヘッドレス実行・CI/CD・クラウド/リモート実行・Code Review

### この章で分かること

`claude -p` を「対話セッションの出力を標準出力に流すだけのもの」と捉えていると、CI で痛い目に遭う。この章では、`-p` が何を読み込み、何を読み込まないのか(`--bare` の有無で供給チェーン上のリスクが変わる)、終了コードと stdout の関係、権限モードの既定値の決まり方、ストリーム出力の各イベントの意味と CI でゲートすべきフィールドを、公式ドキュメントで確認できる範囲で整理する。続いて GitHub Actions(`claude-code-action@v1`)と GitLab CI/CD の実行モデル、Anthropic ホストのクラウドセッション(`claude --cloud`、環境設定、ネットワークシークレット、Setup スクリプトと SessionStart hooks の役割分担)、Remote Control / Projects / Claude Tag / self-hosted environments の前提条件を扱う。最後に、マネージド Code Review(`REVIEW.md`、check run の `bughunter-severity` JSON)、ローカル `/code-review`、`claude ultrareview`、Claude Security 系プラグインの違いと課金単位を押さえる。バージョン番号は公式ドキュメントに記載されたものをそのまま示し、日付は公式に記載がある場合のみ記す。

### 9.1 `claude -p` の実行モデル

#### 終了コードと stdout/stderr の取り扱い

`claude -p` は成功時に 0、失敗時に非 0 で終了する。ただし失敗の種類で出力先が異なる。無効なフラグは実行開始前に stderr へ報告されるが、実行中に起きた失敗(認証情報がない等)は「結果」として stdout に印字される。つまり stdout を JSON として無条件にパースするパイプラインは、認証失敗のテキストを食べて壊れる。終了コードを先に見ること。

```bash
out=$(claude -p "Summarize README.md" --output-format json) || { echo "claude failed: $out" >&2; exit 1; }
echo "$out" | jq -r '.result'
```

終了コードを分岐してから stdout を扱う最小形。どこに置くものでもなく、CI のステップに直接書く。

パイプで渡す stdin は 10MB が上限で、超えると明確なエラーと非 0 で終了する。大きい入力はファイルに書いてパスを渡す。stdin が読めない場合は stderr に警告を出して CLI 引数のプロンプトで続行する(Windows でのクラッシュは v2.1.211 で修正)。

CI の事前チェックには `claude auth status` が使える。JSON を印字し、ログイン済みなら 0、未ログインなら 1 で終了する。`authMethod` は `none`、`claude.ai`、`oauth_token`、`api_key`、`api_key_helper`、`third_party` のいずれか(`configDirectory` フィールドは v2.1.268 以降)。

#### `--bare` が切り捨てるもの、残すもの

公式は `--bare` をスクリプト/SDK 呼び出しの推奨モードとし、将来のリリースで `-p` の既定になると明言している(具体的なバージョンは未記載)。`--bare` は hooks、skills、commands、subagents、plugins、MCP サーバー、auto memory、CLAUDE.md をすべて読み込まない。利用できるツールは Bash、ファイル読み取り、ファイル編集のみ。コンテキストは明示的に渡す: `--append-system-prompt(-file)`、`--settings`、`--mcp-config`、`--agents`、`--plugin-dir` / `--plugin-url`。

```bash
claude --bare -p "Summarize README.md" --allowedTools "Read"
```

hooks・plugins・MCP・CLAUDE.md を一切読まず、マシン間で再現可能な一回限りの実行。`ANTHROPIC_API_KEY` が必須。

例外が一つある。`--add-dir` で追加したディレクトリの `.claude/skills/` は bare でも読み込まれるが、`.claude/commands/` と `.claude/agents/` は読み込まれない。

認証面の最大の落とし穴: bare モードは OAuth 認証情報もシステムキーチェーンも決して読まない。Anthropic API を使うなら `ANTHROPIC_API_KEY` を環境変数で渡すか、`--settings` の JSON で `apiKeyHelper` を与える。`claude setup-token` で作った OAuth トークンによるサブスクリプション認証は bare では使われない。Bedrock / Vertex / Foundry のプロバイダ認証は引き続き機能する。

v2.1.286 で bare はさらに締められた。CLI で渡した MCP サーバーのみ接続し、system reminder(ディスク上のファイル変更やスキル一覧の通知)を送らず、バックグラウンドタスクを一切走らせない(タイムアウトしたコマンドはバックグラウンド化せず停止)。これ以前のバージョンではこの制限は部分的にしか効いていなかった。

#### `--bare` なしの `-p` は信頼ダイアログを出さない

`--bare` を付けない `-p` セッションは、一度も信頼していないフォルダであっても、そのプロジェクトの `.claude/settings.json` の hooks を実行し、`.mcp.json` のサーバーに接続する。ワークスペース信頼ダイアログも、サーバーごとの承認プロンプトも出ない。任意の PR ブランチをチェックアウトする CI ランナーにとって、これは「PR 作者がリポジトリ内のファイルを書き換えるだけでランナー上で任意コードを実行できる」ことを意味する。未信頼のチェックアウトでは `--bare`、`--restricted`、または `--strict-mcp-config` を使う。

#### 権限ベースライン: 既定モードは条件で変わる

無人実行で何かを設定しないと何が起きるか。`claude -p` と Agent SDK の組み込み開始モードは、feature flag を取得するセッションでは `default`(Manual)、取得しないセッション(サードパーティプロバイダ、テレメトリ無効)では v2.1.285 以降 `auto`、それより前は `default`。組織ポリシーが `auto` 既定を差し止めている場合は `default`。つまり Anthropic API 直結の普通の `-p` 実行は Manual で始まり、Bedrock / Vertex / Foundry や feature flag 取得オフの環境でだけ `auto` で始まる。どちらであれ CI では `--permission-mode` を必ず明示する。

- `--allowedTools`: ルール構文。`Bash(git diff *)` の `*` の前のスペースが前方一致の条件で、`Bash(git diff*)` とすると `git diff-index` にもマッチする。
- `--permission-mode dontAsk`: プロンプトが出るものはすべて拒否。`AskUserQuestion`、`ask` に設定されたコネクタツール、`requiresUserInteraction` 付き MCP ツール、ネットワークパス読み取りは allow ルールがあっても拒否される。
- `--permission-mode acceptEdits`: 編集と一般的なファイルシステムコマンドを自動承認。
- `--permission-mode auto`: 分類器が各アクションを判定。auto で開始した実行では、`--allowedTools` の裸の `Bash` エントリは「広すぎる allow ルール」として落とされ、各コマンドが個別に評価される。
- `.claude/settings.json` / `.claude/settings.local.json` の `permissions.defaultMode` に `auto` や `bypassPermissions` を書いても効かない。

```bash
claude -p "Look at my staged changes and create an appropriate commit" \
  --allowedTools "Bash(git diff *),Bash(git log *),Bash(git status *),Bash(git commit *)"
```

コミット作業に必要な git サブコマンドだけをスコープ付きで許可する形。

```bash
claude -p "Update the dependency pins and run the tests" --permission-mode auto --permission-prompts none
```

`--permission-prompts none`(v2.1.259 以降)は「誰もプロンプトに答えられない」ことを Claude に伝える。プロンプトが出る操作は `PermissionRequest` hook が許可しない限り拒否され、Claude は再試行しないよう指示され、`AskUserQuestion` はツール一覧から外され、`Elicitation` hook が答えない MCP の elicitation はキャンセルされる。拒否は `permission_denied` システムメッセージと result の `permission_denials` に現れる。SDK の `canUseTool` や `--permission-prompt-tool` のような権限ホストがある場合に最も意味があるが、ない場合でも再試行抑止として効く。なお `--permission-prompt-tool` は `requiresUserInteraction` 付き MCP ツールを承認できず(v2.1.199 以降、allow は deny に変換)、そのツールのサーバーを最初のターン前に `MCP_TIMEOUT` まで待つ。

#### 出力フォーマット、構造化出力、ストリーム

`--output-format json` は `total_cost_usd` とモデル別の内訳を含む。`--continue` / `--resume` と組み合わせた場合、その数値は会話全体の累計(過去の実行分込み)であり、どちらもクライアント側の推定値で実際の請求とは異なり得る。

```bash
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
  | jq '.structured_output'
```

`--json-schema`(print モード限定、`--output-format json` と併用)で検証済みの出力が `structured_output` に入る。無効なスキーマは `Error: --json-schema is not a valid JSON Schema` と検証器の診断で終了する。`format` キーワード(`"format": "email"` 等)は受理されるが注釈扱いで強制されない。

```bash
claude -p "Write a poem" --output-format stream-json --verbose --include-partial-messages | \
  jq -rj 'select(.type == "stream_event" and .event.delta.type? == "text_delta") | .event.delta.text'
```

トークン単位のストリームには `--output-format stream-json --verbose --include-partial-messages` の三点セットが要る。最終行は `result` メッセージ。コンシューマが遅い場合、終了時にキュー済み出力のドレインを最大 30 秒待つ(v2.1.214 以前は約 2 秒で、大きな応答の末尾が切れることがあった)。

subagent や forked skill のメッセージは `parent_tool_use_id` を持ち、既定では tool_use / tool_result ブロックだけが流れる。`--forward-subagent-text`(または `CLAUDE_CODE_FORWARD_SUBAGENT_TEXT`、v2.1.211 以降)で text / thinking ブロックも、v2.1.219 以降はあらゆるネスト深さで流れる。`/<skill-name>` をプロンプトとして渡した forked skill にはツール呼び出しがないので、`forked-command-` 接頭辞の ID を持ち、スキル完了後に届く(v2.1.287 以降)。

#### `system/init` と `system/api_retry` を CI のゲートにする

ストリームの最初のイベントは通常 `system/init`(`plugin_install` や SessionStart / Setup hook イベントが先行することはある)。`plugins`、`plugin_errors`、`mcp_servers`、`mcp_server_errors`、機能検出用の `capabilities` 配列(`interrupt_receipt_v1`、`interrupt_cancel_queued_v1` 等)を持つ。

重要なのは、`--mcp-config` の不正エントリはスキップされ、実行はそのまま正常終了する点。stderr への警告は人間が端末で実行した場合だけで、stderr をリダイレクトしたり CI ランナー / SDK ホストがキャプチャしている場合は警告が出ず、`mcp_server_errors` にだけ記録される。`mcp_server_errors`(v2.1.219 以降)の型は `unknown_type`、`url_missing_type`、`invalid_config`、`reserved_name`。`--plugin-dir` 失敗の `plugin_errors[].path` は v2.1.283 以降。`--mcp-config` と `-p` の組み合わせでは、最初のターン前に保留中サーバーを `MCP_TIMEOUT`(既定 30 秒)まで待つ(v2.1.221 以降)。キャッシュ済みツール一覧を持つリモートサーバーは `pending` と表示され、最初の呼び出し時に接続する。

```bash
claude -p "$PROMPT" --output-format stream-json --verbose --mcp-config ./mcp.json \
  | tee run.jsonl \
  | jq -e 'select(.type=="system" and .subtype=="init") | (.mcp_server_errors|length)==0 and (.plugin_errors|length)==0' >/dev/null \
  || { echo "MCP/plugin failed to load" >&2; exit 1; }
```

`system/init` の二つのエラー配列が空でなければ失敗させる。CI ステップに直接書く(フィールド名は公式、組み合わせ方は筆者の構成)。

`system/api_retry` イベントは `attempt`、`max_retries`、`retry_delay_ms`、`error_status`、`no_response`(v2.1.261 以降)と `error` カテゴリを持つ。カテゴリは `authentication_failed`、`oauth_org_not_allowed`、`account_on_hold`、`billing_error`、`rate_limit`、`overloaded`、`invalid_request`、`model_not_found`、`server_error`、`max_output_tokens`、`cloud_credential_error`、`unknown`。v2.1.246 以降、`apiKeyHelper` の認証情報が 401/403 で拒否された場合は静かに 2 回再試行してからイベントが出る(静かな再試行も `attempt` にカウントされる)。

`CLAUDE_CODE_SYNC_PLUGIN_INSTALL` を設定すると `system/plugin_install` イベントが流れ、`status`(`started`、`installed`、`failed`、`completed`)、`name`、`error`、`uuid`、`session_id` を持つ。

#### ターン終了後のバックグラウンド待ちと SIGTERM

`claude -p` はターンが終わっても、バックグラウンドコマンド、subagent / workflow、Monitor の監視(既定 5 分タイムアウト)、`/loop` の起床を待って開いたままになり得る。メイン会話が開始したバックグラウンドコマンドが走っている場合を除き、連続 10 分アイドル待ちで残りを停止し部分結果を捨てる。上限は `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` で変更し、`0` で無制限。stderr が端末なら 5 秒待った時点で `Waiting for background work to finish` で始まる行を印字する(json / stream-json では stdout が端末でない場合のみ)。`--max-budget-usd` に到達すると残りのバックグラウンド作業は停止する。v2.1.295 以降、`text` 出力ではバックグラウンド作業が追加ターンを起こした場合に各ターンの結果を印字し、`json` は最後だけを印字する。

SIGTERM(`kill` やプロセススーパーバイザ)で止めると終了コード 143 で、進行中のターンは未完了・未記録のまま、`SessionEnd` hooks だけが走り、実行中の Bash コマンドのプロセスツリーは kill されセッションに killed と記録される。先に SIGINT(SDK なら `interrupt()`)を送ってターンを綺麗に終わらせる。中断されたターンを resume で続行させたい場合は `CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1`。

作業ディレクトリが途中で削除されても `-p` / SDK セッションは走り続け、stream-json に警告メッセージを出し、ディレクトリが戻るまでシェルコマンドが失敗する。

#### システムプロンプトのフラグとスナップショット

`--system-prompt(-file)` は置換(ツールガイダンス、安全指示、git status スナップショットが落ちる)、`--append-system-prompt(-file)` は追記。ファイルの内容はフラグの順序に関係なく先に来る。フラグとそのファイル形の併用は v2.1.283 以降。

```bash
claude -p --append-system-prompt-file ./style.md --append-system-prompt "Always reply in French" "Summarize README.md"
```

スタイルファイルの後にインラインのルールが追記される。

置換プロンプトに `__SYSTEM_PROMPT_DYNAMIC_BOUNDARY__` の行(v2.1.275 以降)を入れると、最初のその行で分割して行自体は削除され、上側がキャッシュされ下側だけ変化する。`--exclude-dynamic-system-prompt-sections` はユーザー固有の文脈を最初のユーザーメッセージに移してマシン間でキャッシュを再利用する(既定プロンプトのみ)。

スナップショットの罠: 既定では最初のリクエストで組み立てたシステムプロンプトが記録され、`--resume` / `--continue` をまたいで compaction まで再利用される。後の起動で別のフラグテキストを渡しても(あるいは渡さなくても)、compaction か新しい会話まで効かない。`--append-system-prompt` を `--continue` 越しに変えながら試行錯誤しても何も起きないのはこれが原因で、`--system-prompt-snapshot off`(v2.1.257 以降)で毎リクエスト再構築する。クラウドセッション以外では `--bare` / `CLAUDE_CODE_SIMPLE=1` で記録が無効(`--system-prompt-snapshot on` で有効化)。v2.1.265 以前はシステムプロンプトフラグを渡すだけで記録が無効になり、v2.1.268 以前は feature flag を取得しないセッション(Bedrock / Vertex / Foundry)が常に再構築していた。

#### セッションの継続と再開

`claude --continue`(対話)は `claude -p` / SDK で作られたセッションと最初のプロンプトが `/loop` のセッションをスキップする。`claude -p --continue` はそれらを含む。v2.1.257 以降、`--continue` は完了したバックグラウンドセッションを開く(実行中のものではない)。`--resume` は ID、名前、絶対パスの `.jsonl` トランスクリプトを受け付け、v2.1.223 以降はマシン上のすべてのプロジェクトを検索する。実行中のバックグラウンドセッションに対する `--resume` は `claude attach` 経由で接続する(v2.1.285 以降)。

```bash
session_id=$(claude -p "Start a review" --output-format json | jq -r '.session_id')
claude -p "Continue that review" --resume "$session_id"
```

JSON 出力から `session_id` を取り出し、別ディレクトリからでも再開する。

#### ツール制限の三つのフラグと `--restricted`

- `--disallowedTools` に裸のツール名を渡すとツール自体がコンテキストから消える(`"*"` で全部、`"mcp__*"` で全 MCP)。`Bash(rm *)` のようなスコープ付きルールはツールを残して該当呼び出しだけ拒否する。
- `--tools` は組み込みツールだけを制限し、MCP ツールには効かない。MCP も止めるなら `--disallowedTools "mcp__*"`。既定セットは macOS / Linux / WSL で Glob / Grep を含まない。
- `--strict-mcp-config` は `--mcp-config` 以外の MCP 設定を無視する。
- `--restricted`(v2.1.248 以降)はコマンド/コードを実行する組み込みツールと WebFetch を、`--tools` で個別に名指ししない限り(`default` プリセットでは不可)削除し、ファイルツールを作業ディレクトリに閉じ込め、managed settings と `--settings` だけを読み、`bypassPermissions` とクラウドセッション作成を拒否する。共有マシン上の評価ハーネス向け。`--bare`(速度・再現性)や `--safe-mode`(トラブルシュート、managed ポリシーは維持)とは目的が違う。

`--settings` に渡すファイルは 2 MiB 以下の通常ファイルで、同じキーはそのセッションの settings.json 群を上書きし、省略したキーはファイルの値を保つ。

#### 予算・ターン上限・モデルフォールバック

`--max-turns`(print 限定)は上限到達でエラー終了。`--input-format stream-json` でキューされたメッセージは新しいターンとして独自の上限を持つ。`--max-budget-usd`(print 限定)はクライアント側推定のキャップで、支出は超過し得る。subagent の支出はカウントされ、`--continue` / `--resume` で復元された累計はカウントされない。上限に達すると新しい subagent は `Budget limit reached` で失敗し、実行中のバックグラウンド subagent は停止する(キャップ強制の挙動は v2.1.217 以降)。余裕を持った値にする。

`--fallback-model` はカンマ区切りのチェーンを順に試し(過負荷、利用不可、引退済み)、`fallbackModel` 設定を上書きする。`--model` は `model` 設定と `ANTHROPIC_MODEL` を上書きする。

print モード限定フラグ: `--init`、`--maintenance`(Setup hook マッチャ)、`--no-session-persistence`、`--max-turns`、`--max-budget-usd`、`--json-schema`、`--replay-user-messages`、`--prompt-suggestions`、`--include-hook-events`(stream-json 必須。SessionStart / Setup hook イベントは常に含まれ、Notification / SessionEnd / PreCompact / PostCompact は `hook_started` を出さない)、`--include-partial-messages`、`--forward-subagent-text`。`--init-only` は Setup と `SessionStart` hooks を走らせて会話を始めずに終了する。`--agents` はインライン JSON か(print モード、v2.1.281 以降)JSON ファイルのパスを受け付け、v2.1.242 以降は起動時に検証される。`--append-subagent-system-prompt(-file)`(v2.1.205 / v2.1.261 以降)は `-p` でのみ効き、forked 以外の全 subagent に追記し、両者は併用不可。`--dangerously-load-development-channels` は確認プロンプトが要るため `-p` では無視される。

`claude --help` はすべてのフラグを列挙しない。`--help` にないからといって使えないとは限らない。

#### `-p` で使えるスラッシュコマンド

ユーザー定義スキルとカスタムコマンドはプロンプト文字列に `/skill-name` を含めれば展開される。`/login` のような端末専用コマンドは不可。`/model`、`/effort`、`/fast`、`/color`、`/rename` は引数を取り、`/config key=value` は設定を書き、`/output-style <style>` は v2.1.269 以降。

```json
{
  "scripts": {
    "lint:claude": "git diff main | claude -p \"you are a typo linter. for each typo in this diff, report filename:line on one line and the issue on the next. return nothing else.\""
  }
}
```

`package.json` の scripts。diff をパイプで渡すので Bash 権限が不要で、エスケープ済みの引用符は Windows でも動く。

### 9.2 GitHub Actions: `claude-code-action@v1`

#### 二つのモードと移行

`prompt` 入力がなければ interactive モード(`@claude` などのトリガーフレーズを待ち、issue / PR に投稿)、`prompt` があれば automation モード(メンションを待たず実行し、結果は既定でワークフローのログに出る。プロンプトが投稿を指示し、投稿ツールが許可されていればコメントされる)。beta からの移行は `@beta` を `@v1` に、`mode` を削除、`direct_prompt` を `prompt`、`max_turns` / `model` を `claude_args`、`custom_instructions` を `--append-system-prompt` へ。非推奨の入力: `mode`、`direct_prompt`、`override_prompt`、`custom_instructions`、`max_turns`、`model`、`fallback_model`、`allowed_tools`、`disallowed_tools`、`mcp_config`、`claude_env`。

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

`.github/workflows/claude.yml`。`id-token: write` は既定の GitHub App 認証に必須、`actions: read` で CI 結果を読める。サブスクリプション認証なら `claude_code_oauth_token` に差し替える。

#### 実行前の二つのアクターチェック

Claude が動く前に、issue / PR イベントでは書き込み権限チェック(`allowed_non_write_users` と自前の `github_token` で上書き可。プロンプトインジェクションのリスクがあるので慎重に)、すべてのイベントで人間アクターチェック(bot は `allowed_bots` に載せない限り拒否)が走る。スケジュール実行は GitHub が「最後に `cron` を変更したユーザー」に帰属させるので、それが bot なら `allowed_bots` に列挙しないと拒否される。

#### ツール権限の付与と inline comment MCP

プレーンテキストの automation プロンプトでは、`claude_args` の `--allowedTools` か `settings` の `permissions.allow` ルールで付与するまで、Claude にはシェルも GitHub API アクセスもない。スキル呼び出しはそのスキルの `allowed-tools` frontmatter を付与する。ただし inline comment 用の MCP サーバーは、`claude_args` の `--allowedTools` に `mcp__github_inline_comment__create_inline_comment` が名指しされている場合にだけ起動する。スキルの frontmatter に同名があっても `claude_args` 行は残す。

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          plugin_marketplaces: "https://github.com/anthropics/claude-code.git"
          plugins: "code-review@claude-code-plugins"
          prompt: "/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment"'
```

`.github/workflows/claude-code-review.yml`。code-review プラグインのスキルを全 PR で走らせ、`--comment` で inline に投稿する。公開リポジトリの fork PR にはシークレットが渡らないので同一リポジトリのブランチでのみ動く。

```yaml
name: Daily Report
on:
  schedule:
    - cron: "0 9 * * *"
jobs:
  report:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      issues: read
      id-token: write
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: "Generate a summary of yesterday's commits and open issues"
          claude_args: |
            --model claude-opus-5-5
            --allowedTools "mcp__github__list_commits,mcp__github__list_issues"
```

スケジュール実行の automation モード。GitHub は公開リポジトリのスケジュールワークフローを 60 日間の非活動で無効化し、スケジュールは既定ブランチからだけ実行される。

#### `GITHUB_TOKEN` でコミットすると CI が走らない

GitHub は既定の `GITHUB_TOKEN` で作られたコミットではワークフローをトリガーしない。`github_token: ${{ secrets.GITHUB_TOKEN }}` を渡しているなら削除して Claude GitHub App として認証させるか、カスタム App のトークンを渡す。

#### 認証の選択肢

- `anthropic_api_key`: 組織共有のシークレットにはこれを推奨。`claude setup-token` の OAuth トークン(`CLAUDE_CODE_OAUTH_TOKEN`、サブスクリプション必須)は実行した個人に紐づき、モデルリクエストしかできない(Remote Control セッションは張れない)。
- Claude Console の workload identity federation(キーレス): `anthropic_federation_rule_id`(`fdrl_...`)、`anthropic_organization_id`、任意で `anthropic_service_account_id`(`svac_...`)と `anthropic_workspace_id`(`wrkspc_...`)。`id-token: write` が必須で、自前の `github_token` を渡す場合も同様。
- クラウドプロバイダ: `use_bedrock` / `use_vertex` / `use_foundry: "true"`(既定 `false`)と OIDC。シークレットは `AWS_ROLE_TO_ASSUME`、`GCP_WORKLOAD_IDENTITY_PROVIDER`、`GCP_SERVICE_ACCOUNT`、`AZURE_CLIENT_ID` / `AZURE_TENANT_ID` / `AZURE_SUBSCRIPTION_ID`、カスタム App 用の `APP_ID` / `APP_PRIVATE_KEY`(Contents / Issues / PR 権限のみ)。

```yaml
name: Claude PR Action

permissions:
  contents: write
  pull-requests: write
  issues: write
  id-token: write

on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
  issues:
    types: [opened]

jobs:
  claude-pr:
    if: |
      (github.event_name == 'issue_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'pull_request_review_comment' && contains(github.event.comment.body, '@claude')) ||
      (github.event_name == 'issues' && (contains(github.event.issue.body, '@claude') || contains(github.event.issue.title, '@claude')))
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v6

      - name: Generate GitHub App token
        id: app-token
        uses: actions/create-github-app-token@v2
        with:
          app-id: ${{ secrets.APP_ID }}
          private-key: ${{ secrets.APP_PRIVATE_KEY }}

      - name: Configure AWS Credentials (OIDC)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_ROLE_TO_ASSUME }}
          aws-region: us-west-2

      - uses: anthropics/claude-code-action@v1
        with:
          github_token: ${{ steps.app-token.outputs.token }}
          use_bedrock: "true"
          claude_args: '--model us.anthropic.claude-sonnet-4-6'
```

Bedrock + OIDC + カスタム GitHub App。Vertex は `google-github-actions/auth@v2` と `use_vertex`、env に `ANTHROPIC_VERTEX_PROJECT_ID` / `CLOUD_ML_REGION`。Foundry は `azure/login@v2` と `use_foundry`、`ANTHROPIC_FOUNDRY_RESOURCE`。公開リポジトリでは、これらの認証ステップが Action の書き込み権限チェックより前に走るため、権限のないコメント投稿者でも App トークン生成とクラウドサインインが実行され、監査ログと Actions 分が消費される。認証ステップの前に書き込み権限を検証するステップを置く。カスタム App がカバーするのは Action だけで、Code Review と Web の auto-fix は公式 App を要求する。

#### その他の入力と出力(action.yml で確認済み)

`track_progress`、`include_fix_links`(既定 true)、`use_sticky_comment`、`classify_inline_comments`(既定 true)、`assignee_trigger`、`label_trigger`(既定 `claude`)、`branch_prefix`(既定 `claude/`)、`branch_name_template`、`base_branch`、`use_commit_signing`、`ssh_signing_key`、`bot_id`(既定 41898282)/ `bot_name`(既定 `claude[bot]`)、`include_comments_by_actor` / `exclude_comments_by_actor`(ワイルドカード可、除外が優先)、`additional_permissions`(例 `actions: read`)、`display_report`(既定 false)、`show_full_output`(既定 false。公開ログにシークレットが露出し得る)、`anthropic_oidc_audience`(既定は Anthropic API URL)、`path_to_claude_code_executable`、`path_to_bun_executable`。出力は `conclusion`、`execution_file`、`branch_name`、`github_token`、`structured_output`(`claude_args` に `--json-schema` を渡した場合の JSON 文字列)、`session_id`(`--resume` 用)。

```yaml
if: fromJSON(steps.analyze.outputs.structured_output).is_flaky == true
```

構造化出力を後続ステップの条件に使う形。

`/install-github-app` は github.com 専用で、gitlab.com / bitbucket.org のリモートでは通知を出して終了する。quick-setup のレビューワークフローが PR にだけ投稿するようになったのは v2.1.229 以降。

### 9.3 GitLab CI/CD

GitLab 統合はベータで、GitLab が保守している。CLI は `curl -fsSL https://claude.ai/install.sh | bash` でインストールし、バイナリは `~/.local/bin` に置かれる。`AI_FLOW_INPUT` / `AI_FLOW_CONTEXT` / `AI_FLOW_EVENT` 変数でコンテキストを渡し、`@claude` メンション駆動にするにはパイプライントリガー API を `AI_FLOW_*` 変数付きで呼ぶ Webhook リスナーが要る。GitLab API 操作は `CI_JOB_TOKEN` か `GITLAB_ACCESS_TOKEN` の PAT。

```yaml
stages:
  - ai

claude:
  stage: ai
  image: node:24-alpine3.21
  rules:
    - if: '$CI_PIPELINE_SOURCE == "web"'
    - if: '$CI_PIPELINE_SOURCE == "merge_request_event"'
  variables:
    GIT_STRATEGY: fetch
  before_script:
    - apk update
    - apk add --no-cache git curl bash
    - curl -fsSL https://claude.ai/install.sh | bash
    # The installer places claude in ~/.local/bin, which isn't on PATH in this image
    - export PATH="$HOME/.local/bin:$PATH"
  script:
    # Optional: start a GitLab MCP server if your setup provides one
    - /bin/gitlab-mcp-server || true
    # Use AI_FLOW_* variables when invoking via web/API triggers with context payloads
    - echo "$AI_FLOW_INPUT for $AI_FLOW_CONTEXT on $AI_FLOW_EVENT"
    - >
      claude
      -p "${AI_FLOW_INPUT:-'Review this MR and implement the requested changes'}"
      --permission-mode acceptEdits
      --allowedTools "Bash Read Edit Write mcp__gitlab"
      --debug
```

`.gitlab-ci.yml`。`ANTHROPIC_API_KEY` はマスクされた CI/CD 変数で渡す。Bedrock では次のように OIDC トークンを発行し、`aws sts assume-role-with-web-identity --role-arn "$AWS_ROLE_TO_ASSUME" --web-identity-token "file://$AWS_WEB_IDENTITY_TOKEN_FILE" --duration-seconds 3600` で一時認証を得て、`CLAUDE_CODE_USE_BEDROCK: "1"` と `AWS_REGION` を設定する。

```yaml
  id_tokens:
    GITLAB_OIDC_TOKEN:
      aud: https://gitlab.example.com
```

Vertex は `external_account` 形式の認証 JSON(`credential_source.file: /tmp/oidc_token` と `service_account_impersonation_url`)を書き、`GOOGLE_APPLICATION_CREDENTIALS=/tmp/cred.json`、`CLAUDE_CODE_USE_VERTEX: "1"`、`ANTHROPIC_VERTEX_PROJECT_ID`、`CLOUD_ML_REGION: us-east5` を設定する。

注意: この GitLab の例は `--bare` を付けていないので、MR ブランチの `.claude/settings.json` hooks と `.mcp.json` がランナー上で実行される。外部コントリビュータの MR を扱うなら 9.1 の供給チェーンの議論がそのまま当てはまる。

### 9.4 クラウドセッション(Anthropic ホスト)

#### 前提と制約

Pro / Max / Team、Enterprise の premium または Chat + Claude Code シートで利用でき、Anthropic の VM(Ubuntu 24.04 x86_64、約 4 vCPU / 16GB / 30GB)で動き、プラン使用量にカウントされ VM 課金はない。ZDR、HIPAA、CMEK の組織は利用不可。組織の IP allowlisting が有効だと、Anthropic ホストのクラウドセッション、Code Review、ホストされた routines がすべて認証エラーになる。権限モードのドロップダウンは Accept edits / Plan / Auto の三つだけ(Accept edits は `default` モードに相当し、クラウドセッションはモードに関係なくファイル編集を事前承認するため Manual の代わりに表示される。Auto は組織が許可しモデルが対応する場合のみ。Bypass permissions はなく、設定ファイルの `defaultMode: "bypassPermissions"` / `"dontAsk"` は黙って無視される)。

#### `claude --cloud` の転送モデル

`claude --cloud "task"` は現在のディレクトリの GitHub リモートを現在のブランチでクローンする。ローカルのチェックアウトではないので、ローカルコミットがあるなら先に push する。リモートがない、または Claude GitHub App が入っていない場合はローカルリポジトリをバンドルしてアップロードする(100MB 未満、コミット済みと未コミットの追跡済み変更を含む、macOS / Linux / WSL では認証情報らしきファイルを除外するがネイティブ Windows では除外しない)。100MB を超えると現在のブランチだけのバンドル、次に作業ツリーの単一 squash スナップショット、それでも駄目なら失敗。アップロードには git 2.31 以上と対応するチェックアウトレイアウト(submodule 起点、`--separate-git-dir` / `--shared` / `--reference`、`core.worktree`、reftable、sparse-checkout worktree は不可)が要る。`CCR_FORCE_BUNDLE=1` で強制バンドル。`--remote` は非推奨の別名。

ハンドオフは一方通行。`--teleport` はクラウドセッションを同じリポジトリのクリーンなチェックアウトに引き戻す(クリーンな git 状態、fork でない同一リポジトリ、push 済みブランチ、同一アカウントが必要)。ローカルコピーが作られるので、以後の作業は `/remote-control` を始めない限りクラウド側に同期されない。

`-p` と `--cloud` の組み合わせは、タスク記述とは併用できず(`--bg` とも併用不可、エラーで衝突を名指し)、セッション ID と併用した場合だけ「既存クラウドセッションにメッセージを 1 件キューして終了」になる。

```bash
claude -p "your message" --cloud <session-id>
# or
echo "your message" | claude -p --cloud <session-id>
# machine-readable: add --output-format json -> {ok, session_id, url}
```

返信を待たずに投稿して終了する。`session_...`、`cse_...`、claude.ai/code の URL を受け付ける。`stream-json` はこの形では非対応。claude.ai ログインと組織の `allow_remote_sessions` が必要で、Bedrock / Vertex 等のプロバイダでは使えない(ただし `ANTHROPIC_BASE_URL` だけで設定した LLM ゲートウェイはこの判定ではサードパーティ扱いにならず、`claude auth login` が必要)。`-p` なしの `claude --cloud <session-id>` は `Attaching to an existing cloud session is not enabled for your account.` で失敗し、アーカイブ済みセッションは `cloud session <id> is archived and cannot accept new messages` を返す。

環境の選択順: `/remote-env` の指定(`remote.defaultEnvironmentId` をユーザー設定に書く)、なければ Anthropic ホスト環境、なければ最初の非 bridge 環境(bridge 環境は Remote Control が自分のマシンを表すために登録するエントリ)。`--environment ccpool_...` は一回限りの上書き。self-hosted の `ccpool_` ID はユーザー設定、managed settings、`--settings` からだけ読まれ、プロジェクト/ローカル設定からは読まれない。

新規セッションの事前入力は URL クエリで可能: `prompt`(別名 `q`)、`prompt_url`(CORS 対応、`prompt` があれば無視)、`repositories`(別名 `repo`、カンマ区切り `owner/repo`)、`environment`(名前か ID)。例: `https://claude.ai/code?prompt=Fix%20the%20login%20bug&repositories=acme/webapp`。

#### GitHub アクセスはプロキシが注入する

GitHub App(ブラウザのオンボーディング。Auto-fix と Projects に必須)か `/web-setup`(`gh auth token` を Anthropic に送る。トークンが届く全リポジトリに到達。Team / Enterprise では Owner が Quick setup を有効にするまで非表示)。認証情報は VM に入らず、GitHub プロキシが注入する。`GH_TOKEN` / `GITHUB_TOKEN` は `proxy-injected` というプレースホルダになる。プロキシは GraphQL を 403 で拒否する(`gh pr` や `gh issue` が失敗するので REST の `gh api repos/{owner}/{repo}/...` を使う)、タグの push とブランチ削除を拒否し、セッションに紐づいていないリポジトリへの API 呼び出しも 403 になる。

#### ネットワークアクセスとネットワークシークレット

アクセスレベルは None / Trusted(レジストリ、GitHub、クラウド SDK の既定 allowlist)/ Full / Custom(自前リスト、既定の包含可、`*.` ワイルドカード)。GitHub プロキシ、MCP コネクタ、ネットワークシークレットのホスト、Anthropic API は allowlist を迂回する。変更は実行中セッションにも約 1 分で反映。組織レベルで全員の環境に allowlist を押し込む仕組みはなく、組織共有環境を使う。

ネットワークシークレットは、Anthropic ホスト環境に保存した API キーを、リクエストが VM を出た後にエージェントプロキシが列挙ホスト向けに付与する仕組み。キー自体はセッションから見えない。GitHub、api.anthropic.com、公開レジストリ(npm / pypi / crates / go proxy / jsr)、Setup スクリプトのリクエスト、テレメトリには付与されない。作成後に編集不可、self-hosted 環境と CMEK 組織では利用不可。既定の型は Bearer(`Authorization` ヘッダ、`Bearer` 接頭辞)で、`X-Api-Key` 用にはヘッダ名を変え接頭辞を空にする。ホストが重複するが一致しない二つのシークレットはマーカーが付かずプロキシは一方しか送らない。Enterprise では自分の環境でも組織管理者だけが追加/削除できる。対照的に環境変数はその環境を使う誰からも読める。`OTEL_*` はコマンドに渡されず、セッションが設定する `CLAUDE_AUTOCOMPACT_PCT_OVERRIDE` は自分の値を上書きする。環境変数は VM で Claude Code が起動する時(作成時、アイドル後の復元時、再利用後の再構築時)にだけ読まれ、実行中セッションは古い値を保つ。すぐ使うなら `LOG_LEVEL=trace npm test` のようにインラインで渡す。

#### Setup スクリプトと SessionStart hooks の役割分担

Setup スクリプトは root で Claude 起動前に走り、exit 0 かつ約 5 分以内で終えるとファイルシステムスナップショットとしてキャッシュされる(約 7 日で期限切れ、スクリプトか allowlist の変更で再構築)。プロセスは残らない(`docker compose up` や DB 起動は無意味)。アイドル後の復元では再実行されず、再構築時のみ。5 分を超えるとキャッシュされず毎セッション再実行、非 0 終了はセッション起動をブロックする。

SessionStart hooks(リポジトリの `.claude/settings.json`)は起動後に毎回の start / resume で、ローカルでもクラウドでも走る。Anthropic ホストの複数リポジトリセッションでは、どのリポジトリの `.claude/settings.json` からも hooks を読み込まない。`command` hook は `timeout` 未設定だと 600 秒でキャンセル、`async: true` は時間制限なし。Bash は既定 2 分、最大 10 分で、`BASH_DEFAULT_TIMEOUT_MS` / `BASH_MAX_TIMEOUT_MS` を環境の環境変数で上げる。クラウドではタイムアウトしたフォアグラウンドコマンドは(`sleep` で始まらない限り)バックグラウンドに移って最大 30 分追加で走り、`BASH_DEFAULT_TIMEOUT_MS` を 1800000 より大きくするとこの上限も延びる。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/scripts/install_pkgs.sh"
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json` にコミットする。単一リポジトリのクラウドセッションでのみ読み込まれる。

```bash
#!/bin/bash

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 1
hashes=node_modules/.install_pkgs.sha256

if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  # Delete the old hashes first, so a failed install runs again next time
  rm -f "$hashes"
  if npm install; then
    sha256sum scripts/install_pkgs.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
  fi
fi

# pip skips requirements that are already satisfied
pip install -r requirements.txt
exit 0
```

`scripts/install_pkgs.sh`。`CLAUDE_CODE_REMOTE == "true"` でクラウドに限定し、hooks はキャッシュされないのでハッシュで済んだ作業を飛ばす。

```bash
#!/bin/bash
mkdir -p ~/.claude
cat > ~/.claude/CLAUDE.md <<'EOF'
Use conventional commit messages.
EOF
```

Setup スクリプトで個人用 `~/.claude/CLAUDE.md` を書く。ユーザー側の `~/.claude/*` はクラウドに持ち込まれないのでこれが回避策。共有環境ではなく個人環境に置く。

#### 何がクラウドに持ち込まれるか

持ち込まれる: リポジトリの CLAUDE.md、`.claude/rules|skills|agents|commands`、`.claude/settings.json` の hooks / permissions と `.mcp.json`(単一リポジトリセッションのみ)、server-managed settings(Claude Tag セッションを除く)。持ち込まれない: ユーザーの `~/.claude/*`、ユーザースコープのプラグイン、リポジトリの `enabledPlugins` で宣言されたプラグインとマーケットプレイス、ローカル/ユーザースコープの MCP サーバー、`NODE_EXTRA_CA_CERTS` や mTLS のトランスポート環境変数、対話的 SSO。

各セッションは `CLAUDE_CODE_REMOTE_SESSION_ID`(`cse_` 接頭辞)を持ち、コミットには `attribution.sessionUrl` が false でない限り `Claude-Session:` トレーラーが付く。

```bash
echo "https://claude.ai/code/${CLAUDE_CODE_REMOTE_SESSION_ID/#cse_/session_}"
```

`cse_` を `session_` に置換してトランスクリプト URL を得る。

VM のプリインストール: Node 20 / 21 / 22(`/opt/node20|21|22`、22 が PATH)、Python 3.x と pip / poetry / uv / black / mypy / pytest / ruff、Ruby 3.1 から 3.3、PHP 8.3、OpenJDK 21、Go、Rust、GCC / Clang / cmake、docker と compose、PostgreSQL 16 と Redis 7.0(インストール済みだが未起動。`service postgresql start`、`service redis-server start`)。Bun はプロキシ問題あり。ベースイメージの置き換えは不可で、自前イメージは docker compose で動かす。ブラウザの `/config` は `key=value` を無視し、`/clear` は非対応、`/fast` は v2.1.271 以降、agent teams は `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` が要る。

#### Auto-fix PR

Claude GitHub App が必須。セッションの CI バー、端末の `/autofix-pr`、モバイル、PR URL の貼り付けで PR 単位に切り替える。CI の失敗とレビューコメントには反応するが、ベースブランチが進んで生じたマージコンフリクトには GitHub が Webhook を出さないので反応しない。返信はあなたの GitHub アカウントで Claude Code ラベル付きで投稿されるため、`issue_comment` で動く自動化(Atlantis、Terraform Cloud)を起こし得る。

### 9.5 Remote Control、Projects、Claude Tag、self-hosted environments

#### Remote Control

自分のマシンで動き(アウトバウンド HTTPS のみ)、claude.ai サブスクリプションログインが必要。API キー、`setup-token` の OAuth トークン、Bedrock / Vertex / Foundry、api.anthropic.com 以外の `ANTHROPIC_BASE_URL`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` / `DISABLE_GROWTHBOOK`、エンタープライズ Claude apps ゲートウェイ経由のサインインでは使えない。Team / Enterprise は Owner が有効化し、ZDR / HIPAA 組織は不可。接続中のトランスクリプトは Anthropic のサーバーに保存される。`DISABLE_TELEMETRY` / `DO_NOT_TRACK` との併用は v2.1.283 以降可能(Trusted Devices 必須設定を除く)。

三つのモード: `claude remote-control`(サーバー、`--capacity` 最大 32、`--spawn same-dir|worktree|session`、`--permission-mode`、`--continue` / `--session-id` で約 4 時間以内に再開。v2.1.200 以降。`--spawn` / `--capacity` / `--create-session-in-dir` とは併用不可)、`claude --remote-control`(対話)、`/remote-control`(既存セッション)。`--sandbox` / `--no-sandbox` は v2.1.300 で削除されエラーになるので settings で設定する。`--chrome` / `--no-chrome` は v2.1.273 以降。

```bash
claude remote-control --spawn worktree --name "My Project" --permission-mode acceptEdits
# resume after Ctrl+C (within ~4h):
claude remote-control --continue
claude remote-control --session-id <id>
```

各フラグは公式記載だが、この組み合わせ自体は筆者の構成。`remote-control` より前に置いたグローバルフラグは無害なもの(`--verbose`、`--model`)以外拒否される。

設定の優先順位: `remoteControlAtStartup: true` はユーザー設定と managed settings からのみ尊重される。プロジェクト / ローカル設定(`.claude/settings.json`、`.claude/settings.local.json`)では `false` は尊重されるが `true` は無視される。チェックインしたファイルで全員の Remote Control を有効化することはできない。`disableRemoteControl` で無効化。未信頼ディレクトリでは `Trust <directory>? [y/N]` を尋ね、stdin / stdout が TTY でなければ `Workspace not trusted` で終了する(systemd や tmux のランチャーで刺さる)。権限プロンプトと AskUserQuestion 以外の転送ダイアログは既定 5 分で期限切れ(`dialogExpiry`、v2.1.224 以降)。サーバーモードはネットワーク断が約 10 分続くと終了し、対話モードは無期限に再試行する。`CLAUDE_CLIENT_PRESENCE_FILE` が存在する間はモバイル push を抑止する。セッションタイトルの優先順位は `--name` / `--remote-control` / `/remote-control` の引数、`/rename`、最後の意味のあるメッセージ、`<hostname>-adjective-noun`(接頭辞は `--remote-control-session-name-prefix` か `CLAUDE_REMOTE_CONTROL_SESSION_NAME_PREFIX`)。SSH 越しで claude.ai コネクタを再認可するには `claude mcp login "claude.ai Slack" --no-browser` の後に `/mcp reconnect claude.ai Slack`。

Trusted Devices(ベータ)は登録デバイスと 18 時間以内のサインイン(生体認証 / パスキーのステップアップ)に縛る。Team / Enterprise は Owner が、Pro / Max は本人が有効化。これが有効な間は Projects のスレッドを自分のコンピュータで動かせない。

#### Projects

パブリックベータ、Pro / Max のみ(段階的ロールアウト、Team / Enterprise は不可)。一つのコーディネータ会話がスレッド(クラウドセッション、または v2.1.280 以降 Remote Control 経由でローカル)を起こす。スレッドは auto モードで、新規プロジェクトは全体で Opus、スレッドは high effort、コーディネータ会話は low effort。上限は 1 日 200 スレッド(プロジェクト横断)。プロジェクト指示は 16,000 文字まで、プロジェクトメモリは `MEMORY.md`。スレッドには各リポジトリに Claude GitHub App が必要で `/web-setup` のトークンでは足りない。複数リポジトリのスレッドは全リポジトリの CLAUDE.md / skills を読むが permission ルール / hooks / env はどこからも読まない。リポジトリの `enabledPlugins` は読まれず、プラグインはプロジェクト設定で追加する。スレッドは自分の PR を auto-fix で自動監視する。プロジェクトは共有できず、スレッドは一つのプロジェクトに属する。ライブラリのアップロードは一度に 100 ファイル / 2GB、1 ファイル 480MB まで。スレッドは 1 週間アイドルで自動解決し、5 時間 / 週次の利用上限に達したスレッドは再試行して自動継続する(routine 起点のものは除く)。`Reached the turn limit` は `CLAUDE_CODE_MAX_TURNS` 由来。1 時間のキャッシュ寿命より長くアイドルだったスレッドへのフォローアップは会話全体を読み直す。

#### Claude Tag と旧 Claude Code in Slack

旧 Claude Code in Slack(ユーザー単位セッション、Pro / Max のみ、チャンネルのみ、GitHub のみ、セッションあたり PR 一つ)は、Claude Tag に接続されたワークスペースでは 2026 年 10 月 5 日付で引退した(通知文は `The legacy Claude in Slack bot is retired effective October 5, 2026 and no longer responds in channels.`)。Claude Tag(Team / Enterprise、パブリックベータ。Free / Pro / Max とサードパーティデプロイでは不可)は @Claude を組織アイデンティティとして一時的なサンドボックスで動かし、Owner が設定した支出上限の下で組織の usage balance から使用量課金され、チャンネル作業にシート単位の課金はない。チャンネルセッションは組織レベル環境(共有または self-hosted)だけを使い、個人環境を選ぶと即座に失敗する。server-managed settings は届かない。1:1 の DM は送信者のシートに課金される。設定は Owner が claude.ai/admin-settings/claude-tag で行い、`@Claude connect` のペアリングコードで接続する。旧 Slack 統合はスレッド全体や直近のチャンネルメッセージを読み、他メッセージ内の指示に従い得る(プロンプトインジェクション警告)。

#### self-hosted environments

パブリックベータ、Team / Enterprise、既定でオフ。クラウドセッションを自前ランナー(`claude self-hosted-runner`、v2.1.224 以降)で動かし、環境 ID は `ccpool_...`。ランナーは一人の所有者にロックされ(フリート数は同時所有者数以上が必要)、`--capacity` で同時セッション数、`--drain-grace-sec`(既定 0、セッション終了で終了)、`--retire-at <epoch-seconds>` でシグナルなしのホスト kill に備える。ポーリングは各 10 秒で、失敗時は 1 から 2 秒から倍々で最大 20 秒まで退避し、ポーリング停止後約 60 秒でリースが切れる。ターン途中のセッションは `SELF_HOSTED_RUNNER_POST_TURN_SETTLE_MS`(v2.1.280 以降)までターン終了報告を待つ。接続はすべて api.anthropic.com へのアウトバウンド HTTPS で、Bedrock / Vertex で推論していてもトランスクリプト(プロンプト、応答、ツール結果)は Anthropic に送られる。チェックアウト、ビルド成果物、シークレット、作成されたファイルは自前マシンに残る。Code Review と Claude Security のセッションはまだルーティングされず、Claude Tag は動くが Access bundle なし。Bedrock / Vertex 上のランナーは server-managed settings を受け取らない。企業プロキシは `HTTPS_PROXY` / `NO_PROXY` で対応し、SSE をバッファしないこと。

```bash
claude -p "Run the smoke test" --environment ccpool_abc123 --ref main
```

CI から self-hosted 環境へディスパッチする。`--environment` は `ccpool_` ID のみ受け付け(`env_` は拒否)、`--ref` はローカル HEAD ではなく名前付き ref を基点にする。

#### GitHub Enterprise Server

Team / Enterprise。クラウドセッション、Code Review、Claude Security、teleport、プラグインマーケットプレイス、GitHub Actions(手動設定。`/install-github-app` は github.com 専用)に対応。非対応はコントリビューションメトリクスと GitHub MCP サーバー(`gh auth login --hostname` を使う)。ホストセッションと事前フロー(リポジトリピッカー)は self-hosted ランナーを使う場合でも GHES が Anthropic のアウトバウンド IP から到達可能である必要がある。マーケットプレイスの `owner/repo` 短縮形は常に github.com に解決されるので完全な HTTPS URL を使う。クラウドセッションはセッションのリポジトリと同じ GHES インスタンスのマーケットプレイスにしか到達できず、それでもインストールは失敗し得る。

```json
{
  "extraKnownMarketplaces": {
    "internal-tools": {
      "source": {
        "source": "git",
        "url": "https://github.example.com/platform/claude-plugins.git"
      }
    }
  }
}

{
  "strictKnownMarketplaces": [
    {
      "source": "hostPattern",
      "hostPattern": "^github\\.example\\.com$"
    }
  ]
}
```

managed settings。前者で GHES マーケットプレイスを事前登録し、後者でホストを allowlist する。

### 9.6 Code Review の四つの形態

#### マネージド Code Review(Team / Enterprise)

GitHub(GHES と ghe.com データレジデンシー含む。ZDR / HIPAA / CMEK は不可)の PR に対し、Anthropic インフラで Find、Verify、Rank、Post の 4 段を読み取り専用で走らせ、インラインコメント、サマリ、`Claude Code Review` check run(決して fail しない。結論は neutral、push でファイル変更がなければ skipped)を投稿する。レビューレベルは Quick / Standard(既定)/ Deep を組織またはリポジトリ単位で、実行タイミングは「PR 作成後に一回」「push ごと」(新規リポジトリの既定、最もコストが高い)「手動」。公式ドキュメントは現在 Code Review を research preview とは呼んでおらず三レベルを記載しているが、GA の日付や「約 3 倍高速」といった数値はサードパーティの報道にしかない(未検証)。

課金はトークン使用量に基づく usage credits で、プランの含有使用量とは別枠、PR を開いた開発者ではなく組織に請求される。開発者が Bedrock / Vertex / Foundry を使っていても同じ。固定の 1 レビュー単価はない(サードパーティが報じる平均単価や Enterprise 向けクレジットオファーは公式ページで確認できない。未検証)。支出上限は claude.ai/admin-settings/usage で、Code Review の上限、組織の上限、クレジット残高のいずれかが 1 レビューの見込みコストを下回るとレビューはスキップされる。分析は claude.ai/analytics/code-review。組織全体の適用には github.com の組織オーナーシップと支出上限が必要。

コメントコマンド: `@claude review` / `@claude review once`(単発)、`@claude review always`(push 駆動のレビューに PR を購読)。新規のトップレベル PR コメントの先頭に書き、write / maintain / admin 権限が必要で bot は起動できない。ドラフトと fork からの PR は自動では飛ばされ、コマンドでのみレビューされる(ドラフトへの `always` は ready 化で発効)。2026 年 7 月の更新より前は `@claude review` が push 購読の意味だった。同じリポジトリで `claude-code-action` を既定の `@claude` トリガーで動かしていると `@claude review` が両方を起こすので `trigger_phrase` を変える。後続の自動レビューは前回以降の変更に集中し nit を減らす。レビューへの返信はレビューを起こさず、次のレビューが返信を読んでスレッドを解決するか一回だけフォローアップする。CLAUDE.md はリポジトリルートと各変更ファイルの親ディレクトリから読まれる。

`REVIEW.md`(ルートと任意のサブディレクトリ)はマネージド Code Review だけを調整し、PR のベースブランチまたは既定ブランチから読まれ、PR 自身の変更からは決して読まれない。動作を変えるには先に `REVIEW.md` の変更をマージする。重大度を下げる、パスを除外する、nit を上限で切るといった指示は、ルートの `REVIEW.md` が保護された既定ブランチ(classic rule か ruleset。他のブランチは ruleset が必要)にある場合だけ尊重され、保護が確認できない場合は `REVIEW.md` はまったく読まれない。ローカルの `/code-review` は `REVIEW.md` を無視して `CLAUDE.md` を読む。

```markdown
# Review instructions

## What Important means here

Reserve Important for findings that would break behavior, leak data,
or block a rollback: incorrect logic, unscoped database queries, PII
in logs or error messages, and migrations that aren't backward
compatible. Style, naming, and refactoring suggestions are Nit at
most.

## Cap the nits

Report at most five Nits per review.

## Do not report

- Anything CI already enforces: lint, formatting, type errors
- Generated files under `src/gen/` and any `*.lock` file
- Test-only code that intentionally violates production rules

## Always check

- New API routes have an integration test
- Log lines don't include email addresses, user IDs, or request bodies
- Database queries are scoped to the caller's tenant
```

リポジトリルートの `REVIEW.md`。

check run は fail しないので、マージをゲートするには `output.text` の最終行にある `bughunter-severity: {...} -->` の JSON を読む。`nit`、`normal`(= Important、🔴)、`pre_existing`(🟣)のカウントで、キーはアルファベット順。カウントにはスレッドが未解決の過去レビューの findings も含まれる。この行がない場合は「判定なし」であってゼロではない。

```bash
gh api repos/OWNER/REPO/commits/<commit-sha>/check-runs --jq '.check_runs[] | {id, name}'

gh api repos/OWNER/REPO/check-runs/CHECK_RUN_ID \
  --jq '.output.text | split("bughunter-severity: ")[1] | split(" -->")[0] | fromjson'
```

例として `{"nit": 1, "normal": 2, "pre_existing": 0}` が得られる。

#### ローカル `/code-review`(全プラン)

`/code-review`(別名 `/review`)はバックグラウンドの forked subagent として走る。対象指定なし(ブランチ vs upstream + 未コミット)、`HEAD~15..HEAD`、`main...feature`、`abc^..abc`、PR 番号、パス、GitLab MR は URL か `!123`。フラグ: `--fix`(権限モードに従って編集。バックグラウンドの編集は `/rewind` のチェックポイント外で、`/rewind` は会話内で既に編集したファイルしか戻さないので他は git で戻す)、`--comment`(GitHub インライン、または `glab` 経由の GitLab 単一ノート、v2.1.257 以降)、`--max-findings <n|all|default>`(v2.1.288 以降、`-p` 以外では記憶される)、`--post`(ultra のみ)。入力した effort レベルはセッションをまたいで記憶され、`-p` 実行では更新されない。`-p` 配下では ultra を除きフォアグラウンドで走り findings が応答に含まれる(`CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` や進行中にもう一度実行した場合も同様)。findings ツールの上限は 32。`code-review` という名前のプロジェクトスキルはバンドル版を置き換えるが `/review` はバンドル版のまま。スケジュールタスクは ultra を起動しない。

```json
{
  "skillOverrides": {
    "code-review": "user-invocable-only"
  }
}
```

settings に置くと、`/code-review` は手入力できるが Claude やスケジュールタスクが自律的に起動することはなくなる。

#### Ultrareview

`/code-review ultra`(research preview)はクラウドサンドボックスでマルチエージェントの検証付きレビューを 15 から 25 分かけて走らせる。Pro / Max は一度限り 3 回無料、以後 1 レビューあたり約 5 から 25 ドル相当の usage credits(`/usage-credits` で有効化し、会話ごとに一度課金確認。`/clear` 後は再確認。走った分だけ課金)。claude.ai ログインが必要で、Bedrock / Vertex / Foundry / ZDR / HIPAA ではローカルレビューにフォールバックし、CMEK では不可。diff の上限は約 500 ファイル / 8,000 行。PR モードは github.com と `/web-setup` で接続した GitHub アカウントが必要で、GHES はブランチモードのみ。停止・失敗したレビューも無料枠を消費する。

スクリプトでは `claude -p '/code-review ultra'` を使ってはいけない。クラウドレビューを起動して findings を待たずに終了し、課金が発生する場合は起動せずに止まる。代わりに `claude ultrareview` サブコマンドを使う。

```bash
claude ultrareview
claude ultrareview 1234
claude ultrareview origin/main
# flags: --json  --timeout <minutes>  --post | --no-post
```

findings が届くまでブロックし、終了コードは 0(完了)、1(失敗 / タイムアウト)、130(Ctrl-C)、進捗は stderr。`--timeout` の既定は 45 分、`--post` / `--no-post` は v2.1.227 以降。サブコマンドが findings 前に終了してもレビューは走り続けている可能性があり、再実行すると新しいレビューが始まって無料枠か credits を消費する。リポジトリ全体をレビューする fallback は対話的な確認か人間が実行したサブコマンドが必要で、Claude が Bash から実行した場合は拒否される。

#### Claude Security プラグインと security-guidance プラグイン

Claude Security プラグイン(`/plugin install claude-security@claude-plugins-official`)はセッションのモデルでローカルにマルチエージェントの脆弱性スキャンを走らせ(python3 3.9 以上、dynamic workflows、diff スキャン用の git が必要)、`CLAUDE-SECURITY-<timestamp>/` に `.md`、`.jsonl`、SARIF 2.1.0(CWE 分類)とリビジョンスタンプを書く。このディレクトリは独自の `.gitignore` を持ち、スキャンがチェックアウトに加える唯一の変更。パッチは `patches/F<n>.patch` に置かれ自動適用されない。auto モードで最も効果的で、スキャンは非決定的。Enterprise 向けのマネージド Claude Security 製品や、ブランチを一回走査する `/security-review` とは別物。

security-guidance プラグインは hook ベース(SessionStart、UserPromptSubmit、Edit / Write / NotebookEdit と Bash の git commit / push に対する PostToolUse、Stop)。編集ごとの正規表現チェック(モデル呼び出しなし)、ターン終了時のバックグラウンド diff レビュー(30 ファイルまで、連続再プロンプト 3 回まで)、エージェント的な commit / push レビュー(ローリング 1 時間に 20 回まで。Claude が Bash ツールで行う commit / push だけが対象で、自分のシェルや `!` エスケープからのコミットはレビューされない)。既定のレビューモデルは Claude Opus 4.7 で `SECURITY_REVIEW_MODEL` / `SG_AGENTIC_MODEL` で上書き。レイヤー別無効化は `ENABLE_PATTERN_RULES=0`、`ENABLE_STOP_REVIEW=0`、`ENABLE_COMMIT_REVIEW=0`、`ENABLE_CODE_SECURITY_REVIEW=0`、全体は `SECURITY_GUIDANCE_DISABLE=1`。ログは `~/.claude/security/log.txt`。Python は 3.7 以上だがエージェント的 commit レビューとサードパーティプロバイダ上のモデルレビューは 3.10 以上が必要で、初回実行時に `~/.claude/security/` に venv を作り Claude Agent SDK をインストールする(pip とネットワークが要る)。クラウドセッションではユーザー設定からもリポジトリ設定からも読み込まれない。

拡張はユーザー(`~/.claude/claude-security-guidance.md`)、プロジェクト(`.claude/claude-security-guidance.md`)、プロジェクトローカル(`.claude/claude-security-guidance.local.md`)の三スコープを連結、合計 8KB 上限、追記のみ。パターンは同じスコープの `security-patterns.yaml|yml|json`(50 ルールまで、YAML は PyYAML が必要、JSON はどこでも動く)。

```yaml
patterns:
  - rule_name: internal_api_key
    substrings: ["sk_live_", "AKIA"]
    reminder: "Hardcoded API key prefix. Load credentials from the secret manager."
  - rule_name: tenant_unfiltered_query
    regex: "\\.objects\\.all\\(\\)"
    paths: ["**/src/tenants/**"]
    reminder: "Multi-tenant code must filter by org_id."
```

`.claude/security-patterns.yaml`。フィールドは `rule_name`、`reminder`(1KB 上限)、`regex` または `substrings`、`paths`、`exclude_paths`。警告はパターン・ファイル・セッションごとに一回。

```json
{
  "enabledPlugins": {
    "security-guidance@claude-plugins-official": true
  }
}
```

`.claude/settings.json`。チームメイトのローカルセッションで読み込まれるが、クラウドセッションはリポジトリ宣言のプラグインをインストールしない。プロジェクト有効化のプラグインをアンインストールすると `.claude/settings.local.json` に上書きが書かれる。

### 落とし穴と対策

- `--bare` なしの `-p` はリポジトリの hooks と `.mcp.json` を信頼プロンプトなしで実行する。未信頼 PR をチェックアウトする CI では PR 作者によるリモートコード実行に等しい。`--bare`、`--restricted`、`--strict-mcp-config` のいずれかを使う。
- `--bare` は OAuth / キーチェーンを読まない。`setup-token` に頼っている CI は `--bare` を付けた瞬間に認証が消える。`ANTHROPIC_API_KEY` か `--settings` の `apiKeyHelper` に切り替える。
- 実行中の失敗(認証欠落など)は stderr ではなく stdout に「結果」として出る。終了コードを見てから stdout を信用する。
- 権限モードを何も設定しない `-p` は、Anthropic API 直結なら Manual、Bedrock / Vertex / Foundry や feature flag 取得オフ(v2.1.285 以降)なら auto で始まり、auto では裸の `Bash` allow ルールが落とされる。CI では `--permission-mode` を常に明示する。
- 不正な `--mcp-config` エントリはスキップされ終了コード 0。CI では `system/init` の `mcp_server_errors` / `plugin_errors` でゲートする(stderr の警告は端末実行時だけ)。
- システムプロンプトのスナップショット: `--continue` / `--resume` 越しに `--append-system-prompt` を変えても compaction まで効かない。`--system-prompt-snapshot off` を付ける。
- `claude -p` はターン後にバックグラウンド作業を最大 10 分待つ。時間制約のあるジョブでは `CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` と `--max-budget-usd` を設定する。
- SIGTERM は 143 で終了し進行中ターンを捨てる。スーパーバイザは先に SIGINT を送る。resume で中断ターンを続けるなら `CLAUDE_CODE_RESUME_INTERRUPTED_TURN=1`。
- 対話の `claude --continue` は `-p` / SDK セッションを見ない。`claude -p --continue` だけが見る。
- `--max-budget-usd` は推定で、超過し得る。`--continue` / `--resume` で復元した累計はカウントされない。
- `--tools` は MCP ツールを制限しない。`--disallowedTools "mcp__*"` を使う。
- claude-code-action: inline comment MCP サーバーは `claude_args` の `--allowedTools` に名指しされた時だけ起動する。スキルの frontmatter だけでは足りない。
- claude-code-action: `github_token: ${{ secrets.GITHUB_TOKEN }}` を渡すと Claude のコミットが CI を起こさない。
- claude-code-action: スケジュール実行は最後に cron を編集したユーザーに帰属し、bot なら `allowed_bots` に載せない限り拒否。
- claude-code-action の公開リポジトリ: fork PR にシークレットは渡らず、クラウドプロバイダの OIDC ステップは書き込み権限チェックより前に走る。権限検証ステップを先頭に置く。
- 同じリポジトリで Code Review と claude-code-action の既定 `@claude` トリガーが共存すると `@claude review` が両方を起こす。`trigger_phrase` を変える。
- `REVIEW.md` はベース / 既定ブランチからのみ読まれ、重大度引き下げ・除外・nit 上限は保護された既定ブランチでだけ効く。ローカル `/code-review` は `REVIEW.md` を無視する。
- 2026 年 7 月以降 `@claude review` は単発。push 購読は `@claude review always`。ドラフトと fork PR は自動レビューされない。
- Code Review の check run は fail しない。マージゲートは `bughunter-severity:` の JSON を読み、行がなければ「判定なし」として扱う。
- Code Review は開発者が Bedrock / Vertex / Foundry でも組織の usage credits に課金される。新規リポジトリは「push ごと」が既定で最もコストが高く、残額が 1 レビュー分を下回るとスキップされる。
- `claude -p '/code-review ultra'` は findings を返さず、課金が要る場合は起動もしない。`claude ultrareview` を使う。停止・失敗でも無料枠は消える。
- `/code-review --fix` のバックグラウンド編集はセッションのチェックポイント外。`/rewind` では戻らないので git で戻す。
- `claude --cloud` は GitHub リモートの現在ブランチをクローンする。push してから使う。ネイティブ Windows ではバンドルに未コミットのシークレットらしきファイルがそのまま入る。
- クラウドの GitHub プロキシは GraphQL(`gh pr`、`gh issue`)、タグ push、ブランチ削除、セッション外リポジトリへの API 呼び出しを 403 にする。REST の `gh api repos/...` を使う。
- Anthropic ホストの複数リポジトリセッションと Projects のスレッドはリポジトリの `.claude/settings.json` の hooks / permissions / env を読まない。単一リポジトリセッションだけが読む。
- リポジトリの `enabledPlugins`、`~/.claude` の内容、ユーザー / ローカルスコープの MCP サーバー、`NODE_EXTRA_CA_CERTS` や mTLS はクラウドセッションに届かない。
- Setup スクリプトが約 5 分を超えるとキャッシュされず毎回走る。非 0 終了はセッション起動を阻む。起動したプロセス(DB、docker compose)はスナップショットに残らない。
- ネットワークシークレットは作成後に編集不可、GitHub / Anthropic / 公開レジストリ / Setup スクリプト / テレメトリには付かず、self-hosted 環境と CMEK では使えない。
- 組織の IP allowlisting は Anthropic ホストのクラウドセッション、Code Review、ホストされた routines を壊す。ZDR / HIPAA 組織はクラウドセッション、`/web-setup`、Remote Control、ultrareview、Code Review を使えない。
- Remote Control は API キー、`setup-token`、Bedrock / Vertex / Foundry、非 api.anthropic.com の `ANTHROPIC_BASE_URL`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` / `DISABLE_GROWTHBOOK` を拒否する。プロジェクト設定の `remoteControlAtStartup: true` は無視される(`false` のみ尊重)。`--sandbox` / `--no-sandbox` は v2.1.300 で削除。
- Projects は `/web-setup` トークンでは足りず各リポジトリに Claude GitHub App が要る。Pro / Max のみ、共有不可、1 日 200 スレッド、既定 Opus / high effort でプランを速く消費する。
- Claude Tag のチャンネルセッションは個人クラウド環境では即失敗する。組織共有か self-hosted 環境を使う。
- self-hosted 環境でも Bedrock / Vertex 推論でもトランスクリプトは api.anthropic.com に送られる。Code Review と Claude Security のセッションはまだルーティングされず、ランナーは一度に一人の所有者にしか仕えない。
- GHES: マーケットプレイスの `owner/repo` 短縮形は github.com に解決される。リポジトリピッカーなどの事前フローは self-hosted でも GHES が Anthropic から到達可能である必要があり、GitHub MCP サーバーは非対応。
- security-guidance は Claude が Bash で行う commit だけをレビューし、自分の `git commit` や `!` エスケープは対象外。commit レビューはローリング 1 時間に 20 回まで。

### 中級者が次にやること

1. CI の `claude -p` 呼び出しをすべて監査し、未信頼チェックアウトで動くものには `--bare`(認証を `ANTHROPIC_API_KEY` に切り替えた上で)か `--restricted` を付け、`--permission-mode` と `--max-budget-usd`、`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS` を明示する。実行前に `claude auth status` の終了コードで認証を検証する。
2. stream-json 出力を `tee` で保存し、`system/init` の `mcp_server_errors` / `plugin_errors` が空であること、`system/api_retry` の `error` が `authentication_failed` / `billing_error` でないことをジョブの失敗条件にする。`capabilities` 配列で機能検出し、バージョン依存の挙動を分岐させる。
3. 構造化出力が要る自動化(flaky テスト判定、変更分類など)は `--json-schema` と `jq '.structured_output'`、GitHub Actions では `claude_args: --json-schema` と `steps.<id>.outputs.structured_output` で後続ステップに渡す。`format` キーワードは強制されないので自前で検証する。
4. 長時間の自動化パイプラインでは最初の実行の `session_id` を保存し、`claude -p --resume` で続ける。システムプロンプトを途中で変えるなら最初から `--system-prompt-snapshot off` を付ける。スーパーバイザ(systemd、Kubernetes)の停止シグナルは SIGINT を先に送り、猶予後に SIGTERM にする。
5. GitHub Actions では `claude.yml`(interactive)と `claude-code-review.yml`(automation + code-review プラグイン + `--comment`)を分け、`github_token` を渡さず App 認証にし、`trigger_phrase` をマネージド Code Review の `@claude review` と衝突しない語に変える。公開リポジトリではクラウド認証ステップの前に書き込み権限チェックのステップを入れる。
6. クラウドセッションを使うリポジトリには、`CLAUDE_CODE_REMOTE == "true"` でガードした SessionStart hook とハッシュで二重作業を避けるインストールスクリプトを置き、5 分を超える初期化は Setup スクリプト(キャッシュ対象)に寄せる。個人の規約は Setup スクリプトで `~/.claude/CLAUDE.md` に書く。外部 API のキーはネットワークシークレットに置き、環境変数には入れない。
7. マネージド Code Review を使うなら、`REVIEW.md` を保護された既定ブランチにマージしてから運用し、新規リポジトリの既定「push ごと」を「PR 作成後に一回」に下げてコストを見てから戻す。マージゲートは `bughunter-severity:` JSON の `normal` カウントで行い、行がなければ待つ(ゼロ扱いしない)。
8. ローカルでは `skillOverrides` で `/code-review` の自律起動を止め、深いレビューはスクリプトから `claude ultrareview --json --timeout 45` で呼び、終了コード 1 と 130 を区別してハンドリングする。無料枠は 3 回しかないので、まず `--no-post` で結果を確認する。
9. セキュリティ系は三層で考える: チーム全員のローカルには `enabledPlugins` で security-guidance を配り(クラウドには届かない点を周知)、プロジェクト固有のパターンを `.claude/security-patterns.yaml` に 50 ルール以内で書き、リリース前は Claude Security プラグインのスキャンで SARIF を出して既存のコードスキャン基盤に取り込む。
10. Remote Control / Projects / self-hosted に進む前に、組織のプラン、ZDR / HIPAA / CMEK、IP allowlisting、認証方式(サブスクリプションログインか API キーか)を確認する。これらは機能の可否を決める前提条件で、設定でどうにかなるものではない。

### 出典

- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/github-actions-cloud-providers
- https://code.claude.com/docs/en/gitlab-ci-cd
- https://code.claude.com/docs/en/claude-code-on-the-web
- https://code.claude.com/docs/en/web-quickstart
- https://code.claude.com/docs/en/cloud-environments
- https://code.claude.com/docs/en/self-hosted-environments
- https://code.claude.com/docs/en/remote-control
- https://code.claude.com/docs/en/claude-projects
- https://code.claude.com/docs/en/slack
- https://claude.com/docs/claude-tag
- https://code.claude.com/docs/en/code-review
- https://code.claude.com/docs/en/code-review-setup
- https://code.claude.com/docs/en/code-review-customize
- https://code.claude.com/docs/en/code-review-pull-requests
- https://code.claude.com/docs/en/code-review-costs
- https://code.claude.com/docs/en/code-review-local
- https://code.claude.com/docs/en/ultrareview
- https://code.claude.com/docs/en/claude-security
- https://code.claude.com/docs/en/security-guidance
- https://code.claude.com/docs/en/github-enterprise-server
- https://github.com/anthropics/claude-code-action (action.yml, docs/usage.md)


---

## 第10章 権限・設定(settings.json)・サンドボックス・セキュリティ

### この章で分かること

Claude Code の安全性は「モデルが行儀よく振る舞う」ことではなく、Claude Code 本体が設定ファイルを読み、ツール呼び出しを評価し、OS レベルの境界を張ることで担保されます。この章では、5段階の設定ファイル優先順位とリストのマージ規則、`permissions` ルールが deny → ask → allow の順で評価される仕組みとそのテキストマッチの限界、v2.1.283 から既定になった auto mode と分類器の挙動、Bash を OS レベルで隔離するサンドボックスの境界と抜け穴、組織が強制できる managed settings の配置と「厳しい値が勝つ」例外、そして `env` ブロックと環境変数の解釈規則を扱います。各項目は 2026年10月17日時点の公式ドキュメントと GitHub CHANGELOG(v2.1.302 = 2026-10-16)で検証済みの内容に限定し、未検証の点は「(未検証)」と明記します。読み終えると、どのファイルのどのキーが実際に効くのか、効かないのかを自分で判断できるようになります。

### 10.1 設定ファイルの階層と優先順位

#### 5段階スタックと `--settings`

同じキーを複数ファイルに書いた場合、上位のファイルが勝ちます。高い順に次の通りです。

1. Managed settings(組織配布、10.5節)
2. コマンドライン `--settings <file-or-json>`
3. プロジェクトローカル `.claude/settings.local.json`
4. 共有プロジェクト `.claude/settings.json`
5. ユーザー `~/.claude/settings.json`

`--settings` はユーザー/プロジェクト/ローカルの上、managed の下に位置し、ユーザーファイルが設定できるキーなら何でも設定できますが、Managed 専用キーと Global-config キーは設定できません。環境変数はこのスタックの「段」ではなく、ペアごとに勝敗が決まります。たとえばシェルで export した `ANTHROPIC_MODEL` はどのファイルの `model` より優先されますが、`ANTHROPIC_DEFAULT_MODEL` はどのファイルも `model` を設定していないときにだけ効きます。

#### リストキーはマージ、モデル系キーは特例

`permissions.allow` のようなリストキーは「上書き」ではなく「結合」されます。各ファイルがエントリを追加でき、別ファイルのエントリを消すことはできません。これが「deny を書いたのに allow が消えない」「local に allow を足しても project の ask が勝つ」という現象の根本原因です。

例外は4つのモデル系キーです。`fallbackModel` は順序付きチェーンとして、それを定義した最上位ファイルから丸ごと取られます。`modelPicker` は行をマージせず、project/local を無視します。managed の `availableModels` はそのまま適用され、user/project/local の追加は無視されます。`modelSettings` は `effortLevel` と一緒にモデル単位で解決されます。

#### 「厳しい値が勝つ」例外表

セッションを制限する方向の値については、通常なら managed を上書きできないスコープからでも、厳しい方の値が採用されます。

| キー | 採用される条件 |
|---|---|
| `disableClaudeAiConnectors: true` | どのスコープからでも |
| `enableArtifact: false` / `disableArtifact: true` | どのスコープからでも(v2.1.242+) |
| `isolatePeerMachines: true` | どのスコープからでも |
| `permissions.blockReadsOutsideWorkingDirectories: true` | どのスコープからでも(v2.1.257+) |
| `autoMode.classifyAllShell: true` | `~/.claude/settings.json` または `--settings` から |
| `remoteControlAtStartup: false` | project/local から |
| `crossSessionInbound` | project/local から、accept < hold < refuse の梯子で厳しい方 |
| `useAutoModeDuringPlan` / `syncClaudeAiSkills` / `syncClaudeAiPlugins: false` | managed / `--settings` / user / local から(`.claude/settings.json` からは不可) |
| `maxEffortLevel` | どのスコープからでも最も低い上限(v2.1.267+) |

つまりリポジトリは「自分を縛る」ことはできても「緩める」ことはできません。

#### Scope 語彙の読み方

settings-reference の各キーには Scope 行があり、これを読むのがチェックインされたファイルで効くかどうかを判断する最速の方法です。語彙は `Any file`、`User, local, or managed`、`User or managed`、`User`、`Managed`、`Global config` の6種類です。`User or managed` のキー(`autoMode`、`autoMode.classifyAllShell`、`skipAutoPermissionPrompt`、`strictAllowlist`、`tlsTerminate`、`allowPlaintextInject`)は project/local からは決して効きません。`User, local, or managed`(`useAutoModeDuringPlan`、`skipDangerousModePermissionPrompt`)は `settings.local.json` には置けますが共有プロジェクトファイルには置けません。

#### strict JSON と `~/.claude.json` の区別

設定ファイルは厳格な JSON です。`//` コメントも末尾カンマも構文エラーで、次回起動時に「Settings Error」ダイアログ(修正/終了/続行)が出ます。個別エントリの不正は「Settings Warning」としてスキップされます。`-p` 実行ではダイアログが出ず壊れたファイルを黙ってスキップするので、後で `claude doctor` を実行してください。`$schema` 行はエディタ補完に役立ちますが、スキーマはリリースに遅れることがあります。

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": [
      "Bash(npm run lint)",
      "Bash(npm run test *)"
    ],
    "deny": [
      "Read(./.env)",
      "Read(./.env.*)"
    ]
  }
}
```

`~/.claude/settings.json` に置く最小構成。`Bash(npm run lint)` は完全一致、`Bash(npm run test *)` はプレフィックスルールで裸の `npm run test` にもマッチします。

`~/.claude.json` は別物で、サインイン状態、MCP 設定、プロジェクトごとの信頼、`/config` が書く Global-config キー(`autoConnectIde`、`autoInstallIdeExtension`、`claudeInChromeDefaultEnabled`、`copyFullResponse`、`copyOnSelect`、`defaultToAgentsView`、`diffTool`、`externalEditorContext`、`leftArrowOpensAgents`、`prStatusFooterEnabled`)を保持します。ここに `permissions`、`hooks`、`env` を書いても無視されます。壊れた場合は `~/.claude/backups/.claude.json.corrupted.<timestamp>` に退避され、書き込み前に保存される直近5つの `.claude.json.backup.<timestamp>` のいずれかが復元されます。信頼を手で設定するには `projects["<path>"].hasTrustDialogAccepted: true` を書きます。

#### ホットリロードと `settings.local.json` の位置

Claude Code は設定ファイルを監視し、`permissions`、`hooks`、`apiKeyHelper` などの編集を再起動なしに適用します。user/project/local/managed のファイル変更で `ConfigChange` hook が発火します(MDM/コンソール配信の変更では発火しません)。ただし `model`、`effortLevel`/`modelSettings`、`requiredMinimumVersion` などの管理キーはセッション開始時にしか読まれません。セッション中に作られた `.claude/` フォルダは v2.1.257 以降検出されます。

`.claude/settings.local.json` は v2.1.211 以降、git リポジトリのルート(worktree なら main checkout のルート)で読み書きされます。「Yes, and don't ask again」の承認はここに allow ルールとして書かれ、初回書き込み時に `**/.claude/settings.local.json` がグローバル git excludes に追加されます。例外(git 外、リポジトリルートがホーム、Windows、所有者不一致)では `.claude/settings.json` と同じ場所に留まります。この allow ルールが信頼ステップをスキップできるのはファイルが untracked の間だけで、tracked になった場合や `.claude` が symlink の場合はリポジトリ由来として扱われます。

#### クラウドセッションの読み込み範囲

Anthropic ホストのクラウドセッションはコミット済みの `.claude/settings.json` だけを読みます(複数リポジトリの場合は `enabledPlugins`/`extraKnownMarketplaces` のみ)。`~/.claude/settings.json` も `settings.local.json` も端末の MDM/managed ファイルも読みません。`defaultMode: bypassPermissions|dontAsk` は黙って無視され、Accept edits/Plan/Auto だけが提供されます。self-hosted 環境は runner イメージ内の managed settings ファイルを追加で読みます。

### 10.2 permissions ルールの評価メカニクス

#### deny → ask → allow、最初のマッチが勝つ

ルールは deny、ask、allow の順に評価され、最初にマッチしたものが結果を決めます。具体性は順序を変えません。allow で deny に例外を開けることはできず、より具体的な allow があっても ask が勝ちます。裸のツール名 deny(`Bash`、`Bash(*)`、`mcp__*`)はツールを Claude のコンテキストから完全に取り除き、スコープ付き deny(`Bash(rm *)`)はツールを見せたままマッチする呼び出しだけを拒否します。`EndConversation` は他のツールが残る限り deny/ask で消せない唯一のツールです。

#### Bash ルールのワイルドカード

`*` は空白を含む任意のテキストにマッチします。末尾の ` *`(空白付き)は裸のコマンドにもマッチし、`Bash(ls *)` は `ls` に、`Bash(git log *)` は `git log` にマッチします。これはその `*` がルール内の唯一のワイルドカードのときだけ成り立ち、`Bash(* --help *)` は `npm --help` にマッチしません。`Bash(ls *)` は `lsof` にマッチせず、`Bash(ls*)` はマッチします。`:*` サフィックスは末尾に限り ` *` と等価で、`Bash(git:* push)` のコロンはリテラルです。`Bash(git * main)` は `git -c core.fsmonitor=<script> diff main` にマッチするので危険で、サブコマンドより前に `*` を置く allow ルールには起動時に警告が出ます。

#### 複合コマンドの分割とラッパー除去

複合コマンドは `&&`、`||`、`;`、`|`、`|&`、`&`、改行で分割されます。allow ルールはすべてのサブコマンドにマッチしなければならず、deny/ask はいずれか1つ(サブシェル、`$(...)`、`for` の本体内を含む)がマッチすれば適用されます。`npm test &&` のように末尾が空のものはパース不能として自動承認されません。「don't ask again」で複合コマンドを承認するとサブコマンドごとに1ルール(最大5)が保存されます。

マッチ前に除去されるラッパーは `timeout`、`time`、`nice`、`nohup`、`stdbuf`、`command`、`builtin`、`noglob`、裸の `xargs`、および既知の安全な環境変数の先頭代入(allow のみ。deny/ask はどんな先頭代入も越えてマッチ)です。既知の安全な環境変数の正確な一覧は公開されていません(未検証)。`devbox run`、`npx`、`docker exec` などの環境ランナーは除去されないので、`Bash(devbox run *)` は `devbox run rm -rf .` を承認します。

#### テキストマッチであってプログラムマッチではない

Bash の deny/ask ルールは書かれたコマンドテキストにマッチし、プログラムにはマッチしません。

| ルール | 止まる | 止まらない |
|---|---|---|
| `Bash(rm *)` | `rm -rf build/` | `/bin/rm -rf build/`、`bash -c 'rm -rf build/'`、`find -delete` |
| `Bash(curl *)` | `curl https://...` | `/usr/bin/curl ...`、`sh -c 'curl ...'` |
| `Bash(git push *)` | `git push origin main` | `git -C . push`、`git -c push.default=current push` |

「Claude Code はコマンドを正規化するので `rm` の deny は `/bin/rm` にも効く」と述べるサードパーティ記事がありますが、公式ドキュメントはこれを明確に否定しています。コマンドテキストに依存しない強制が必要なら、サンドボックス(OS レベル)か PreToolUse hook を使ってください。

```json
{
  "permissions": {
    "allow": [
      "Bash(npm run *)",
      "Bash(git commit *)"
    ],
    "deny": [
      "Bash(git push *)"
    ]
  }
}
```

npm スクリプトと git commit を確認なしで実行し、`git push` で始まるコマンドを拒否します。`git -C . push` は deny にマッチしません。

`watch`、`setsid`、`ionice`、`flock` などの exec ラッパーと、`-exec`/`-delete`/`-fprint`/`-files0-from` 付きの `find` はプレフィックスルールでは自動承認できません。`*` を含まない完全一致ルール(`Bash(find build -type f -delete)`)か、allow を返す PreToolUse hook だけが効きます。コマンド自体に `*` が含まれる(`find . -name '*.tmp' -delete`)とルールはワイルドカードパターンと解釈されるので、やはりプロンプトが出ます。

#### 組み込みの読み取り専用セット

`ls`、`cat`、`echo`、`pwd`、`head`、`tail`、`grep`、`find`、`wc`、`which`、`diff`、`stat`、`du`、`cd`、および読み取り専用の `git` 形式は、どのモードでもプロンプトなしで実行され、このセットは設定で変更できません。プロンプトを強制したければ ask/deny ルールを足します。Manual モードでもプロンプトが出るケースは、書き込み/実行能力のあるコマンド(`find`、`sort`、`sed`、`git`)の引用符なしグロブ、`docker -H/--context`、`file -m/-f`、`e` オプション付き `ps`、Windows の UNC パス、`PATH`/`IFS` への書き込み、パース不能または 10,000 文字超のコマンド、別ディレクトリへの `cd` + `git`、`cd` + リダイレクトです。v2.1.290 で `pyright` は読み取り専用から外れました。

#### リダイレクトと `tee` の宛先

`>`、`>>`、`2>` の出力先は Edit ルール、`<` の入力元は Read ルール(v2.1.257+)に対して、Claude が直接ファイルを読み書きしたかのように検査されます。`tee` の宛先は v2.1.269 以降検査されます。`Bash(git commit *)` の allow はコマンドを許可しますが `> file` の宛先は許可しません。`~` で始まる宛先やグロブを含む宛先は承認が必要で、`/dev/null`、`2>&1`、here-doc は検査されません。

#### パスルールの4つのアンカー

Read/Edit のパスルールは gitignore 構文で、4種類のアンカーがあります。

- `//path`: ファイルシステム絶対パス
- `~/path`: ホームディレクトリ基準
- `/path`: 設定ソース基準(project/local ならプロジェクトディレクトリ、ユーザー設定なら `~/.claude`)
- `path` / `./path`: カレントディレクトリ基準

単一スラッシュが最大の罠です。`~/.claude/settings.json` に書いた `Read(/secrets/**)` は `~/.claude/secrets/**` をブロックし、プロジェクトには効きません。ユーザー設定では `//` か `~/` を使ってください。Windows パスは POSIX 形式に正規化されます(`//c/**/.env`)。参照されるのは `Edit(path)` と `Read(path)` だけで、`Write(...)`、`NotebookEdit(...)`、`Glob(...)`、`MultiEdit(...)` のパスルールは受理されても検査されません(v2.1.210+ で起動時警告)。

深さの意味はルール種別で異なります。単一セグメントの相対パターンは、allow では `Edit(src/**)` が `<cwd>/src` 配下だけにマッチし、deny/ask では任意の深さの `src` ディレクトリにマッチします。裸のファイル名(`Read(.env)` は `Read(**/.env)` と同じ)はどの深さにもマッチします。`Edit(/src/**)` と `Edit(src/components/**)` はどのルール種別でもアンカー位置だけ、`Edit(**/src/**)` は任意の深さです。`!` 否定パターンは同じソース内で前に書かれたルールだけを切り欠き、常に cwd 相対で、丸ごとブロックされたディレクトリ内のファイルを再開放することはできません。

#### Read deny の到達範囲と symlink

`Read(path)` の deny は同じパスへの Edit と Write もブロックし(v2.1.208/v2.1.228+)、Grep/Glob/@メンション/IDE コンテキスト/貼り付け画像パス/ディレクトリ一覧にも効きます(v2.1.290+)。しかし NotebookEdit には効かず、ファイル名を指定しない `grep -r pattern .` や、自分でファイルを開く Python/Node スクリプトにも効きません。Bash 内で届くのは Claude Code が認識するファイルコマンド(`cat`、`head`、`tail`、`sed`、`tee`)とリダイレクト先だけです。`.claudeignore` は何の効果もありません。OS レベルの強制にはサンドボックスが必要で、サンドボックスは Read deny のパスを `denyRead` に加えます。

symlink については、allow ルールは要求パスと解決先の両方がマッチしたときだけ適用され、deny ルールはどちらかがマッチすれば適用されます。symlink 経由で書いた deny(`Read(//etc/**)`)は v2.1.268 以降、実体の場所(`/private/etc`)にも適用されます。Edit/Write はパス自体が symlink の場合、書き込みを拒否します。

#### WebFetch、パラメータ、ツール名 glob

WebFetch ルールは `domain:` 形式でホスト名を大文字小文字を区別せずマッチします。`*.example.com` は任意の深さのサブドメインにマッチしますが apex にはマッチせず、先頭以外のワイルドカードはドット間だけにマッチします(`example.*` は `example.org` にマッチし `example.evil.com` にはマッチしない。v2.1.172+)。裸の `WebFetch` deny はツールを取り除き、`WebFetch(domain:*)` deny はツールを残してすべてのフェッチを拒否し、サンドボックス内コマンドのすべてのホストもブロックします。サンドボックスの allow/deny リストに流れるのは `domain:` 形式だけで、サンドボックスが解釈するのは先頭の `*.` と裸の `*`(v2.1.186+)だけです。

```json
{
  "permissions": {
    "allow": ["WebFetch"]
  }
}
```

裸の `WebFetch` allow はフェッチのプロンプトをスキップしますがサンドボックスの allowlist にホストを追加しません。`WebFetch(domain:*)` ならサンドボックス内コマンドに全ホストを開放してしまいます。

`Tool(param:value)` 形式のパラメータマッチは deny/ask ルールで任意のトップレベルスカラー入力に使えます(`Agent(model:opus)`、`Agent(isolation:worktree)`、`Bash(run_in_background:true)`)。主要コンテンツフィールド(Bash の `command`、Read の `file_path`、WebFetch の `url`)は複合コマンドで迂回できるため拒否され、起動時警告が出ます。1ルールにつき1パラメータ、値に `*` 可、省略されたパラメータはマッチせず、正規化前のリテラル入力と比較されます。`Skill(skill:<name>)` の deny だけは別名や表示名を含むどの名前でもマッチします。settings ファイル内の括弧付き `mcp__` ルールはスキップされます(`--disallowedTools` を使ってください)。

ツール名 glob は deny/ask なら `"*"` と `"mcp__*"` を受け付け(完全名マッチでツールをコンテキストから除去)、allow ではリテラルの `mcp__<server>__` プレフィックスの後にだけ glob を置けます。`"*"` や `"B*"` のような非アンカー allow は警告付きでスキップされます。MCP 命名規則としてサーバー名の `.` や空白は `_` になり(`mcp__my_server__*`)、プラグインのサーバーは `mcp__plugin_<plugin>_<server>__*`、v2.1.299 以降 `mcp__a` は `a__b` を許可しなくなったので `mcp__<server>__*` の形で書きます。組織が `ask` に設定したコネクタツールは auto/bypass でもプロンプトが出て、dontAsk では拒否されます。

```json
{
  "permissions": {
    "deny": [
      "mcp__*"
    ]
  }
}
```

すべての MCP ツールをコンテキストから取り除きます。

```json
{
  "permissions": {
    "deny": ["Agent(Explore)"]
  }
}
```

組み込みの Explore subagent を無効化します。1セッション限定なら `--disallowedTools` が等価です。

PowerShell ルールは一般的なエイリアスを正規化し(`gci`、`ls`、`dir` はすべて `PowerShell(Get-ChildItem *)` にマッチ)、大文字小文字を区別せず、`|`、`;`、PowerShell 7+ では `&&`/`||` で分割します。

```json
{
  "permissions": {
    "allow": [
      "PowerShell(Get-ChildItem *)",
      "PowerShell(git commit *)"
    ],
    "deny": [
      "PowerShell(Remove-Item *)"
    ]
  }
}
```

`Cd` ルールは gitignore 形式ではなくディレクトリパス全体にアンカーされます。`*` はちょうど1セグメント、`**` は複数セグメントにマッチし、`Cd(~/code/*)` は `~/code/app` にマッチしますが `~/code/app/src` や `~/code` にはマッチしません。Cd の allow を1つでも書くと `/cd` は allowlist モードになり、裸の `Cd` deny は `/cd` を完全に無効化します。

deny/ask で未知のツール名を書くと起動時警告が出ます。正規名(`TaskStop`。トランスクリプト表示の `Stop Task` ではない)を使ってください。hook の matcher も同様に正規名です。

#### hooks との関係

PreToolUse hook の判断は deny/ask ルールを迂回しません。Claude Code は hook の戻り値にかかわらず deny と ask を評価し、hook の終了コード 2 は allow ルールより前にブロックします。「Bash を全部許可するが一部だけ拒否する」パターンは、allow に `"Bash"` を書き、PreToolUse hook で特定コマンドを拒否する形で実現します。plan mode では読み取り専用でない呼び出しに hook の `allow` は効きません(ExitPlanMode を除く)。v2.1.300 から hook の `updatedInput` は Claude 自身の入力と同様に検証され、未知のキーは落とされ、拒否された入力は呼び出しを deny します。`/permissions` での編集は v2.1.234 以降、同じターン内の次のツール呼び出しから効きます。

#### ワークスペース信頼と `claude -p`

プロジェクトの `permissions.allow`、`additionalDirectories`、`extraKnownMarketplaces`、ほとんどの `env` 値はワークスペース信頼を待ちます。`deny`/`ask` は即座に適用されます。`claude -p` と SDK は信頼ダイアログを一切表示せず、リポジトリの allow ルールも適用しませんが、hooks、`env`、ヘルパーは実行し、`.mcp.json` のサーバーには確認なしで接続します。信頼できないリポジトリで `-p` を回す前には `--setting-sources user`、`--bare`、`--settings '{"disableAllHooks": true}'`、または `disabledMcpjsonServers` を使ってください。ユーザー設定の `disableAllHooks` だけでは、プロジェクト設定が上位なので不十分です。`--bare` でもプロジェクトの `env` ブロックと `awsAuthRefresh` のようなヘルパーは適用され、`apiKeyHelper` は `--settings` からだけ読まれます。信頼は git リポジトリルート単位で、`$HOME` で起動した場合の信頼はセッション限りです。

`additionalDirectories` を settings ファイルに書くとファイルアクセスだけが付与されます。`--add-dir`/`/add-dir` はそれに加えてその dir の skills(ライブリロード)、commands、subagents、`enabledPlugins`/`extraKnownMarketplaces` を読み込みますが、CLAUDE.md は `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1` のときだけです。hooks など他の設定キーは cwd の `.claude/` からだけ読まれます(親ディレクトリへのフォールバックなし)。`/cd <path>` は v2.1.246 以降、主要作業ディレクトリを移し、新しい dir の settings/hooks/.mcp.json/env を適用します。

### 10.3 パーミッションモード

#### モード一覧と起動モードの決定

モードは `default`(Manual、`manual` も別名として可)、`acceptEdits`、`plan`、`auto`、`dontAsk`、`bypassPermissions` の6つです。v2.1.283 以降、対話型ターミナルと VS Code セッションではすべてのプランとプロバイダで `auto` が組み込みの開始モードです。

起動モードは次の順で決まります。1) `--permission-mode` / `--dangerously-skip-permissions`、2) settings の `permissions.defaultMode`(ただし `auto` と `bypassPermissions` は `.claude/settings.json` と `.claude/settings.local.json` からは無視され、`~/.claude/settings.json` か managed に置く必要がある。project/local の `bypassPermissions` は Manual で起動する)、3) 組み込み既定。どのファイルでも `disableAutoMode: "disable"` があれば `default` に強制されます。HIPAA 設定の組織は `default` で起動します(v2.1.285+)。Shift+Tab の循環は default → acceptEdits → plan → [bypassPermissions] → [auto] で、dontAsk は循環に現れません。

`claude -p` と Agent SDK について、permission-modes.md は「feature flag を取得するセッションでは `default`、サードパーティプロバイダやテレメトリオフでは `auto`(v2.1.285+)」と書いていますが、v2.1.302 の CHANGELOG でこれが変更され、サードパーティプロバイダ、テレメトリオフ、フレッシュインストールのいずれでも `default` で開始するようになりました(`--permission-mode auto` を指定すれば auto)。ドキュメントページが CHANGELOG に追いついていない点に注意してください。インストール直後やアップグレード直後の最初のセッションは feature flag が届く前なので別のモードで始まることがあり、毎回クリーンに起動する CI コンテナやゲートウェイトークンのみの構成(`ANTHROPIC_AUTH_TOKEN` + 非 Anthropic の `ANTHROPIC_BASE_URL`)は恒久的にその状態なので、`permissions.defaultMode` か `--permission-mode` を固定してください。

```json
{
  "permissions": {
    "defaultMode": "default"
  }
}
```

`~/.claude/settings.json` に置くと、すべてのターミナルセッションが Manual で始まります。

VS Code 拡張は 1) `claudeCode.initialPermissionMode`(default/manual/acceptEdits/plan/bypassPermissions を受理、auto は不可)、2) 最後に選んだ Manual/Edit automatically/Auto、3) managed か `~/.claude/settings.json` の `permissions.defaultMode`、4) 組み込み既定の順で決め、プロジェクト設定ファイルは読みません。Bypass には「Allow dangerously skip permissions」トグルが必要です。

#### どのモードでも自動承認されないもの

`bypassPermissions` を含むどのモードでも自動承認されないのは、明示的な ask ルール、組織が `ask` にしたコネクタツール、AskUserQuestion と `requiresUserInteraction` な MCP ツール、臨界パスへの `rm`/`rmdir`、クロスセッションメッセージングの安全策、`blockReadsOutsideWorkingDirectories` 有効時の作業ディレクトリ外読み取り(v2.1.257+)、ネットワーク(UNC)パスからの読み取り(v2.1.292 のセキュリティ修正で hook 承認と auto mode でも迂回不可)です。deny ルールは bypassPermissions を含むすべてのモードでブロックし、allow ルールは bypassPermissions では意味を持ちません。bypassPermissions は Linux/macOS で root/sudo として起動を拒否し(認識されたサンドボックス内ではチェックをスキップ)、`--restricted` とも併用できません。初回の対話利用で同意ダイアログが出て `skipDangerousModePermissionPrompt: true` が `~/.claude/settings.json` に書かれますが、`.claude/settings.local.json` だけに記録された同意は `claude --bg` では無視されます。

#### 保護パスと臨界パス

保護パス(`.git`、`.config/git`、`.vscode`、`.idea`、`.husky`、`.cargo`、`.devcontainer`、`.yarn`、`.mvn`、`.claude`(例外あり)、`--plugin-dir` の dir、`~/.claude/dev-mods/`、および `.gitconfig`、シェル rc、`.npmrc`、`.pre-commit-config.yaml`、`.mcp.json`、`.claude.json`、設定ファイルの symlink 先)への書き込みは、モード別に default/acceptEdits → プロンプト、plan → 分類器(またはプロンプト)、auto → 分類器、dontAsk → 拒否、bypassPermissions → 許可となります。`permissions.allow` の `Edit(.claude/**)` は保護パス書き込みを事前承認しません。安全チェックが allow ルール評価より前に走るためです。プロンプトには「このセッション中、このプロジェクトの .claude フォルダの編集を許可」というセッション限定の選択肢があります。

臨界パス(ファイルシステムルート、トップレベル dir、`$HOME`、Windows ドライブルート、作業 dir とその親、`rm -rf "$VAR"/*`、`rm -rf "$(pwd)"` など)への `rm`/`rmdir` はサーキットブレーカーで、allow ルールも `allow` を返す PreToolUse hook も承認できません。auto と bypassPermissions ではターミナルプロンプトに2分のカウントダウンがあり(v2.1.281+)、3回未応答で拒否されます。`-p`/SDK/VS Code チャット/Desktop では即座に拒否されます。書き換え指針として `rm -rf "${DIR:?}"/*` はチェックを通過します。起動環境限定(`env` ブロックでは無視)の無効化変数は `CLAUDE_CODE_DISABLE_DANGEROUS_RM_TIMEOUT`、`CLAUDE_CODE_DISABLE_SUBSTITUTION_RM_PROMPT`、`CLAUDE_CODE_DISABLE_INLINE_SHELL_RM_PROMPT`(v2.1.288+)、`CLAUDE_CODE_DISABLE_POWERSHELL_CMD_RM_DENY`(v2.1.283+)です。PowerShell の `Remove-Item` はシステムパスやワイルドカードに対してどのモードでも拒否されます。

`permissions.blockReadsOutsideWorkingDirectories: true`(v2.1.257+)は Read/Grep/Glob/LSP に作業ディレクトリ外のパスを bypassPermissions を含む全モードで拒否させます。どのファイルの `true` でも適用されるので、リポジトリはオンにできてもオフにはできません。サンドボックス有効時はサンドボックス内コマンドにも `~`、`/Users`、`/home`、`/root`、`/Volumes`、`/mnt`、`/media`、`/run/media`、`/srv` の読み取りを拒否し、作業 dir、worktree、temp dir、`~/.claude` の一部、グローバル git 設定を再開放します。リポジトリ設定だけで追加された dir は作業 dir として数えません。auto mode での最初の外部読み取り時に4択(許可し続ける/今後ブロック(ユーザー設定に書き込み)/拒否して次回も聞く/許可して次回も聞く)が出ますが、`-p` やバックグラウンドセッションでは出ません。

#### auto mode の分類器

auto mode では別の分類器(既定は Claude Sonnet 5、`/model` とは独立)がアクションをレビューします。決定順は 1) allow/ask/deny ルールが即座に解決(例外あり)、2) 読み取り専用アクションと作業 dir 内編集は自動承認、3) それ以外は分類器へ、4) ブロック理由は `[Data Exfiltration]` のようなルール名として Claude に返される、です。分類器はセッションモデルが Sonnet 4.6 の場合や `availableModels` が Sonnet 5 を除外している場合はセッションモデルにフォールバックし、セッションが Fable モデルの場合は Opus モデル(`ANTHROPIC_DEFAULT_OPUS_MODEL` または Opus 5)を使います。v2.1.302 で `CLAUDE_CODE_AUTO_MODE_MODEL` がクライアント側分類器のモデル選択用に追加されましたが、env-vars リファレンスにはまだ載っておらず、受理値や `availableModels` との関係は未記載です(未検証)。

auto mode に入ると、任意コード実行を許す広い allow ルールが落とされます。`Bash(*)`/`PowerShell(*)`、`Bash(python*)` のようなワイルドカード付きインタプリタ、パッケージマネージャの run コマンド、`Agent` の allow、`Monitor` の allow です。`Bash(npm test)` のような狭いルールは残ります。分類器はユーザーメッセージ、読み取り専用でないツール呼び出し、CLAUDE.md を見ますが、ツールの結果は除去されます(プロンプトインジェクション対策)。結果に注釈を付けたい場合は PostToolUse の `classifierContext` を使います(v2.1.236+)。3回連続または累計20回のブロックで auto mode が一時停止します(設定不可)。subagent は生成時のタスク記述、各アクション、親が読む前の最終レポートの3点でチェックされ、frontmatter の `permissionMode` は auto mode で無視されます。他エージェントへの SendMessage も v2.1.222 以降レビューされます。コミットされていない作業を捨てるコマンド(`git reset --hard`、`rm -rf`)の前には Claude Code 自身が `git status` を走らせ、`status.showUntrackedFiles=no` でも作業の有無を分類器に示します。

拒否されたアクションは `/permissions` → Recently denied タブで `r` を押して再試行できます。インライン通知 `bash denied by auto mode · [Data Exfiltration] · /permissions` にはコマンドが含まれず、`PermissionDenied` hook が正確な `tool_input` を受け取ります。

#### auto mode の課金

Pro/Max/Team では分類器リクエストは課金されません。サーバーサイド分類器レビュー(Anthropic API 直接、v2.1.271/2.1.278/2.1.281 でサーフェスごとに展開)ではチェックがセッションのモデルリクエスト内に乗り、無料です。ゲートウェイが `safeguards`/`safeguard_results` を剥がすとクライアントが自前の分類器呼び出しにフォールバックし、Enterprise/API/Bedrock/Google Cloud Agent Platform/Foundry アカウントではトークン使用量に数えられます。その際の通知は「We're changing auto mode to no longer charge for classifier requests in Claude Code. However, this session isn't eligible.」で、Enter で続行(従来通り課金)、Esc で保留中のアクションをキャンセルします。`CLAUDE_CODE_AUTO_MODE_SERVER=0`(シェルまたは settings の `env`)はクライアント側分類を強制し、`/status` の「Auto mode server」行が Enabled/Disabled を示します。サーバーは判定なしのアクションを未レビューのまま実行せず拒否し、10回連続で判定が返らないとターンを止めます。v2.1.302 からは安全チェックに長すぎる会話は、全ツール呼び出しを拒否する代わりに圧縮されます。

#### `autoMode` ブロックと human checkpoint

`autoMode` 設定ブロック(`environment` / `allow` / `soft_deny` / `hard_deny` / `classifyAllShell`)は `~/.claude/settings.json`、managed、`--settings` からだけ読まれます。project/local は、チェックインされたリポジトリが分類器の allow ルールを注入するのを防ぐため無視されます。どの配列でも組み込みルールを残すにはリテラル `"$defaults"` を含めてください。省略するとリスト全体が置き換わります(soft_deny の既定には force push、`curl | bash`、本番デプロイが、hard_deny にはデータ流出ルールが含まれます)。分類器内の優先順位は hard_deny(無条件)> soft_deny > allow(例外)> 明示的なユーザー意図です。エントリは正規表現ではなく散文です。

```json
{
  "autoMode": {
    "environment": [
      "$defaults",
      "Source control: github.example.com/acme-corp and all repos under it"
    ],
    "allow": [
      "$defaults",
      "Deploying to the staging namespace is allowed: staging is isolated from production and resets nightly",
      "Writing to s3://acme-scratch/ is allowed: ephemeral bucket with a 7-day lifecycle policy"
    ],
    "soft_deny": [
      "$defaults",
      "Never run database migrations outside the migrations CLI, even against dev databases",
      "Never modify files under infra/terraform/prod/: production infrastructure changes go through the review workflow"
    ],
    "hard_deny": [
      "$defaults",
      "Never send repository contents to third-party code-review APIs"
    ]
  }
}
```

`~/.claude/settings.json` に置きます。開発者が足した allow は組織の soft_deny を上書きできるので、交渉の余地がないブロックには `permissions.deny` を使ってください。

```json
{
  "autoMode": {
    "classifyAllShell": true
  }
}
```

auto mode 中、すべての Bash/PowerShell allow ルールを停止します(臨界パスの除去を除く)。ユーザー設定か `--settings` の `true` は managed の `false` より優先されます。

human checkpoint としては、コンテンツスコープ付きの `permissions.ask` が分類器より前に評価され、auto mode でも必ずプロンプトを出します。

```json
{
  "permissions": {
    "ask": [
      "Bash(git push *)",
      "Bash(gh pr create *)"
    ]
  }
}
```

コマンドテキスト全体を検査する checkpoint には PreToolUse hook を使います。`permissions.deny` は分類器より前にブロックし、ユーザー意図で上書きできません。「レビューまで push しないで」のような会話上の境界はチェックごとにトランスクリプトから読み直されるため、コンテキスト圧縮で消えることがあります。auto mode で既定許可されるのは、作業リポジトリの任意ブランチ(既定ブランチ含む、v2.1.211+。production/release/gh-pages という名前のブランチは別判定)への push、PR 作成、宣言済み依存のインストール、`.env` の読み取りと対応する API への資格情報送信、読み取り専用 HTTP です。セッション中に追加または向き先変更されたリモートは信頼されません。

`claude auto-mode defaults|config|critique|reset`、`/auto-mode-setup`(Pro/Max/Team、v2.1.228+、feature flag 取得が必要)、`/permissions` → Auto mode タブ(v2.1.246+)が管理 UI です。`/auto-mode-setup` は `environment` を `"$defaults"` なし(組み込みを書き下し)で書き、追加する allow/soft_deny/hard_deny には `"$defaults"` を含め、auto mode が無視する `Bash(*)` などの `permissions.allow` の削除を提案します。

```json
{
  "skillOverrides": {
    "auto-mode-setup": "off"
  }
}
```

組み込みコマンドなので `disableBundledSkills` では消えず、`skillOverrides` で無効化します。

plan mode でのコマンド判定は、bypass が使えるターミナルなら分類器もプロンプトもなし(plan mode の編集ブロックは強制されず、v2.1.299 で一度きりの注記が出る)、auto mode が使えて `useAutoModeDuringPlan`(既定 true)なら分類器が臨界パス除去以外をレビュー、それ以外では読み取り専用でないコマンドはサンドボックス auto-allow があってもプロンプトです。

```json
{
  "useAutoModeDuringPlan": false
}
```

`User, local, or managed` スコープなので、リポジトリがあなたの代わりにオフにすることはできません。

### 10.4 サンドボックス

#### 対象範囲と既定値

サンドボックス(macOS は Seatbelt、Linux/WSL2 は bubblewrap + socat、任意で `npm install -g @anthropic-ai/sandbox-runtime` による seccomp フィルタ。ネイティブ Windows は非対応)が包むのは Bash、PowerShell、Monitor のコマンドとその子プロセスだけです。ファイルツール、MCP サーバー、hooks、LSP、statusLine、apiKeyHelper、`!` シェルモード、`excludedCommands`、unsandboxed retry はすべて外側で動きます。

既定では、書き込みは cwd + ユーザー別 temp(`$TMPDIR` をリダイレクト)+ 追加 dir、読み取りはマシンのほぼ全域(`~/.ssh` と `~/.aws/credentials` を含む。組み込みの資格情報 deny リストはない)、ネットワークは空の allowlist を持つローカルプロキシ経由、環境変数は継承です。`/sandbox`(`.claude/settings.local.json` に書く)か `sandbox.enabled: true` で有効化します。サンドボックスが起動できない(bubblewrap/socat 不在、ネイティブ Windows、WSL1)場合は `failIfUnavailable: true` がない限り黙って非サンドボックスで動きます。Ubuntu 24.04+ では bwrap の userns 用に AppArmor プロファイルが必要です。

```bash
sudo tee /etc/apparmor.d/bwrap > /dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile bwrap /usr/bin/bwrap flags=(unconfined) {
  userns,
  include if exists <local/bwrap>
}
EOF
sudo systemctl reload apparmor
```

`sysctl kernel.apparmor_restrict_unprivileged_userns` が 1 を返すときだけ必要です。依存は `sudo apt-get install bubblewrap socat`。

サンドボックス内コマンドの `$TMPDIR` はユーザー別 temp にリダイレクトされ、非サンドボックスコマンドはシェルの `$TMPDIR`(または `CLAUDE_CODE_TMPDIR`/OS temp)を継承するので、両者は別ディレクトリを指します。ファイル受け渡しは作業ディレクトリ配下で行ってください。linked worktree では main リポジトリの共有 `.git` への書き込みも許可されます(hooks/ と config を除く)。

#### auto-allow と unsandboxed retry

`autoAllowBashIfSandboxed`(既定 true)により、サンドボックス内コマンドは Manual モードでもプロンプトなしで走ります。境界がプロンプトを置き換える設計です。deny ルール、コンテンツスコープ付き ask、臨界パス rm、Monitor は引き続きゲートします。裸の `Bash` ask はサンドボックス内コマンドではスキップされます(plan mode を除く)。`FOO=bar npm test`、`make CC=clang`、`eval "ls"` は通常フローを通り、`Bash(eval *)` ではそのプロンプトは止まらず、完全一致の `Bash(eval "ls")` だけが効きます。

unsandboxed retry(`dangerouslyDisableSandbox` パラメータ)はモード別に、bypass → プロンプトなし、Manual/acceptEdits → 「Bash command (unsandboxed)」プロンプト、auto → 分類器、dontAsk → 拒否です。コマンドにマッチする allow ルールはその unsandboxed retry も承認します。retry で必ず聞かれたい場合は sandboxing.md が示す ask ルール `Bash(dangerouslyDisableSandbox:true)` を足します。

#### パス構文と Linux のワイルドカード制限

サンドボックスのパス構文は permissions ルールと逆です。`/tmp/build` は絶対、`~/.kube` はホーム基準、`./` や無プレフィックスはプロジェクト設定ではプロジェクトルート、ユーザー設定では `~/.claude` を指します。末尾の `/` と `/**` は除去されます。Linux/WSL2 では `allowWrite`/`denyWrite` の `*`、`?`、`[` を含むエントリはスキップされ(bind-mount には具体パスが要る)、読み取りリストはどこでもワイルドカードを使えます。`Edit` の allow/deny は allowWrite/denyWrite に、`Read` deny は denyRead に、`WebFetch(domain:...)` はネットワークリストに流れるので、同じ制限が Linux の Edit ルールにも当たります(`/sandbox` の Config タブが警告)。重なりは狭いパスが勝ち、広い allow の中でも deny が効きます。

```json
{
  "sandbox": {
    "enabled": true,
    "autoAllowBashIfSandboxed": true,
    "excludedCommands": ["docker *"],
    "filesystem": {
      "allowWrite": ["/tmp/build", "~/.kube"],
      "denyRead": ["~/.aws/credentials"]
    },
    "network": {
      "allowedDomains": ["github.com", "*.npmjs.org"]
    }
  }
}
```

ユーザー設定向けの統合例。`docker *` はフルアクセスで非サンドボックス実行されます。

```json
{
  "sandbox": {
    "enabled": true,
    "filesystem": {
      "denyRead": ["~/"],
      "allowRead": ["."]
    }
  }
}
```

ホーム全体を読み取り禁止にしつつプロジェクトだけ開く構成。`.claude/settings.json` に置く必要があります。ユーザー設定では `.` が `~/.claude` になりプロジェクトがブロックされたままになります。

#### ネットワークプロキシ

直接経路はなく、コマンドには HTTP_PROXY/HTTPS_PROXY/ALL_PROXY がローカルプロキシを指して渡され、プロキシがホスト名を allowedDomains/deniedDomains と照合します。プロキシ変数を無視するツール(素の ssh、多くの DB ドライバ)、UDP/QUIC/ICMP は許可ホストにも繋がりません。loopback/link-local(169.254.169.254)にしか解決しないホスト名は IP が allowlist にない限り拒否されます(v2.1.284+)。未知ホストの扱いはモード別に、bypass → 許可、Manual/acceptEdits/plan → プロンプト(Yes はセッション限り、「don't ask again」は `WebFetch(domain:...)` allow をローカル設定へ、admin-required ならユーザー設定へ保存)、auto → 分類器が承認したコマンドごとの許可ドメインがない限り拒否(v2.1.271+)、dontAsk → 拒否です。`strictAllowlist: true`(user/managed/--settings、v2.1.219+)はプロンプトの代わりに拒否します。IPv6 はドメインリストでは `"[::1]:443"` と括弧付き(v2.1.229+)、`injectHosts` では括弧なしです。既定でプロキシは TLS を終端しないため、`github.com` のような広い allowlist に対するドメインフロンティングは既知の制限です。

```json
{
  "sandbox": {
    "network": {
      "httpProxyPort": 8080,
      "socksProxyPort": 8081
    }
  }
}
```

自前プロキシを使う構成。ポートが効いた時点でそのトラフィックには Claude Code のドメインリストもプロンプトも効かなくなるので、両方のポートを設定しないとコマンドがもう一方のプロキシを使えます。どのファイルがポートを設定できるかはロックに依存します(v2.1.285+)。

`allowUnixSockets`(ソケットパス配列)は macOS 専用で、Linux/WSL2 では seccomp がパスを検査できないため `allowAllUnixSockets: true` だけが効きます(WSL の interop ソケットも再開放)。`allowLocalBinding` も macOS 専用(Linux は各コマンドに専用 loopback)。`allowMachLookup` は XPC サービス(`com.apple.coresimulator.*` など)を列挙します。`/var/run/docker.sock` の付与は実質ホストアクセスです。`docker`、`watchman`(jest)、macOS での Go CLI の TLS(gh/gcloud/terraform)、macOS での git over SSH、`pbcopy`、`open`/`osascript`(error -600。`allowAppleEvents` はコード実行隔離を外す)は文書化された非互換で、`excludedCommands` か狭い修正が推奨されます。

#### excludedCommands と資格情報保護

`sandbox.excludedCommands` は Bash ルール構文(`docker *`)で、呼び出し内のすべてのコマンドがマッチしないと呼び出し全体がサンドボックス内に留まります。`cd`、`sudo`、`eval`、`xargs`、サブシェル、`$(...)`、制御フロー、ファイルリダイレクト、変数のコマンド名、絶対/`~`/`..` パスへの `git clone` を含む呼び出しは常にサンドボックス内です。除外されたコマンドは通常の権限フローでフルアクセス実行されます。1ディレクトリ追加で済むなら `sandbox.filesystem.allowWrite` が推奨です。

```json
{
  "sandbox": {
    "excludedCommands": ["python scripts/load_orders.py *"]
  },
  "permissions": {
    "ask": ["Bash(python scripts/load_orders.py *)"]
  }
}
```

プロキシ変数を無視する DB クライアントや ssh を使うスクリプトを外で動かしつつ毎回プロンプトを出す構成。Claude はスクリプトを編集できるので内容を確認してください。

`sandbox.credentials` はファイルと環境変数を `mode: "deny"`(隠す/unset)または `mode: "mask"`(センチネル値を `injectHosts` へのエグレス時にプロキシが実値へ置換)で保護します。マスクには `network.tlsTerminate`(experimental)が必須で、user/managed/--settings からだけ有効です。macOS ではファイルのマスクは deny にフォールバックします。AWS SigV4 の再署名は AWS_ACCESS_KEY_ID と AWS_SECRET_ACCESS_KEY の両方をマスクしたとき動きます(v2.1.221+)。

```json
{
  "sandbox": {
    "enabled": true,
    "network": {
      "tlsTerminate": {},
      "allowedDomains": ["*.github.com", "registry.npmjs.org"]
    },
    "credentials": {
      "files": [
        { "path": "~/.aws/credentials", "mode": "deny" },
        { "path": "~/.ssh", "mode": "deny" }
      ],
      "envVars": [
        { "name": "GH_TOKEN", "mode": "mask", "injectHosts": ["api.github.com"] },
        { "name": "NPM_TOKEN", "mode": "mask" }
      ]
    }
  }
}
```

公式の「Protect credentials」と「Mask environment variables」の2例を合成したもの。`tlsTerminate` は `{}`(一時 CA)か `caCertPath`/`caKeyPath` を取り、managed 配信時には承認ダイアログを伴います。

```json
{
  "sandbox": {
    "credentials": {
      "envVars": [
        {
          "name": "DATABASE_URL",
          "mode": "mask",
          "extract": "://[^:]+:([^@]+)@",
          "onExtractNoMatch": "deny"
        },
        {
          "name": "SERVICE_JWT",
          "mode": "mask",
          "decode": "jwt",
          "maskClaims": ["api_key"]
        }
      ]
    }
  }
}
```

`extract`(正規表現キャプチャ)と `decode: "jwt"` は1エントリに併用できません(v2.1.224+)。`onExtractNoMatch` の既定は `warn` で、正規表現が外れたファイルはマスクされないまま読めるので、存在しうる秘密には `deny` を指定します。`credentials.files` の deny はファイルシステム層の一部なので `filesystem.disabled: true` で失われますが、envVars の deny/mask は残ります。managed の `deny` ファイルエントリは `filesystem.disabled` を managed 専用にロックします。`CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` はすべてのサブプロセスから資格情報(`ANTHROPIC_API_KEY`、`AWS_SECRET_ACCESS_KEY`、`NPM_TOKEN`/`DB_PASSWORD` のような名前、パスワード入り `DATABASE_URL`、`CLAUDE_CONFIG_DIR`)を除去し、`PIP_INDEX_URL`/`NPM_CONFIG_REGISTRY` から user:password を剥がし、`GITHUB_TOKEN`/`GH_TOKEN`/`GH_ENTERPRISE_TOKEN`、`HTTP(S)_PROXY`、`GIT_CONFIG_*` は残し、ファイルシステム隔離を強制オン、Linux では PID 名前空間も隔離し、サンドボックス auto-allow をオフにします。

#### サンドボックスの保護パス

実行中のコマンドに対して強制され、`allowWrite` や `Edit` allow で免除できないパスは、`.claude` の settings/skills/agents/commands/hooks/workflows、`.mcp.json`、シェル rc、`.gitconfig`、`.vscode`、`.idea`、`.git/hooks` と `.git/config`、cwd を bare リポジトリに変えるファイル、`~/.claude` の大半、`~/.claude.json`、`.credentials.json` です。唯一の解除方法は `filesystem.disabled` です。Linux では未作成の保護ファイルに 0 バイトの読み取り専用プレースホルダが作られ、SIGKILL されたセッションがそれを残すと「don't ask again」の保存が壊れます。`claude doctor` が「Stale sandbox mask files left by a killed session」として検出します。`git merge/checkout` が `unable to unlink old` で失敗するのもこの保護です。

#### strict / admin-required

`allowUnsandboxedCommands: false` が managed か `--settings` にあるとサンドボックスは「admin-required」になり、リポジトリファイルの緩和キー(excludedCommands、allowedDomains、allowWrite、allowUnixSockets、プロキシポート、弱い隔離フラグ、`enabled: false`)は無視されます(v2.1.285+)。ユーザー設定の `false` はプロジェクトの `true` に対して保持されますが admin-required にはなりません。`allowManagedDomainsOnly: true` でも admin-required です。リポジトリの deny エントリと `autoAllowBashIfSandboxed` は引き続き効きます。managed/--settings が enabled/autoAllowBashIfSandboxed/allowUnsandboxedCommands を設定していると `/sandbox` は「Sandbox settings are overridden by a higher-priority configuration」と出ます。

```json
{
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false
  }
}
```

managed 用の fail-closed 構成。組織承認の例外と `sandbox.credentials` は managed 側に書きます。

```bash
claude --settings '{"sandbox": {"enabled": true, "allowUnsandboxedCommands": false}}'
```

1セッション限定の strict モード。`--settings` は user/project/local の上、managed の下にあり、このセッションでは admin-required になります。

admin-required でなくても効くロック(v2.1.285+)として、managed/--settings の `deniedDomains` または WebFetch deny があるとリポジトリのプロキシポートは無視され、`strictAllowlist`(managed/--settings/user)があるとリポジトリのプロキシポート、allowedDomains、WebFetch allow が無視され、managed/--settings の `denyRead`/Read deny/credentials.files があると拒否パス配下のリポジトリの allowRead/allowWrite/Edit allow/additionalDirectories が無視されます。`--setting-sources`/SDK `settingSources` でソースを除外すると、そのソースの `sandbox.filesystem`、`Edit` ルール、`Read` deny、`credentials` もサンドボックス構築から落ちます(v2.1.246+)。`sandbox.ignoreViolations` は想定内の違反報告を黙らせるだけでブロックは解除せず、`enableWeakerNestedSandbox` は非特権コンテナ内の `bwrap: Can't mount proc` を回避します。

```json
{
  "sandbox": {
    "ignoreViolations": {
      "*": ["/etc/hosts"]
    }
  }
}
```

#### サンドボックス環境の比較

組み込み Bash サンドボックス(シェルのみ、Docker 不可)、`@anthropic-ai/sandbox-runtime`(プロセス全体を包みファイルツール/MCP/hooks も内側、beta、設定は `~/.srt-settings.json`)、dev container(default-deny iptables)、カスタムコンテナ、VM/microVM(Docker Sandboxes)、クラウドセッションの選択肢があります。`--dangerously-skip-permissions` は常にコンテナ/VM/sandbox runtime の内側で非 root として実行してください。Claude Code 自身が managed で強制できるのは組み込みサンドボックスだけで、コンテナは運用上の約束事です。

```bash
mkdir -p ~/.claude && { [ -f ~/.claude.json ] || echo '{}' > ~/.claude.json; }
npx @anthropic-ai/sandbox-runtime claude
```

Linux は既存パスにしか書き込み許可を適用しないので設定パスを先に作ります。runtime は設定ファイルなしでも起動する(ネットワーク拒否、書き込みは runtime パスに限定)ため、クリーンに起動しても設定が読まれた証拠にはならず、空または不正な設定ファイルは起動を拒否します。プロジェクト、`~/.claude`、`~/.claude.json`、temp dir(macOS は `/private/tmp`)への書き込みと `api.anthropic.com`、`claude.ai`、`platform.claude.com` へのネットワークを許可する必要があります。runtime はプロジェクトルートの `.git/hooks`、`.git/config`(`filesystem.allowGitConfig: true` がない限り)、`.mcp.json`、`.claude/commands`、`.claude/agents`、シェル起動ファイルをハードコードで拒否し、Linux/WSL2 では deny リストが起動時に一度だけ構築されるので後から `git init`/`clone` したリポジトリはカバーされません。

### 10.5 Managed settings

#### 配置とソースのランキング

ファイルパスは macOS `/Library/Application Support/ClaudeCode/managed-settings.json`、Linux/WSL `/etc/claude-code/managed-settings.json`、Windows `C:\Program Files\ClaudeCode\managed-settings.json`(旧 `C:\ProgramData\...` は読まれない)で、`managed-settings.d/*.json` のドロップインがアルファベット順にマージされます。macOS の plist ドメインは `com.anthropic.claudecode`、Windows は `HKLM\SOFTWARE\Policies\ClaudeCode` の `Settings` 値(REG_SZ JSON)、HKCU はユーザー書き込み可能なフォールバックです。

ソースの順位は 1) server-managed(claude.ai コンソール/Claude apps gateway)、2) MDM plist/HKLM、3) managed-settings.json + .d、4) HKCU です。既定の `managedSourcesBehavior: "first-wins"` はポリシーキーを持つ最上位ソースを使い他を無視します(sandbox ロック、`env` の変数単位マージ、forceRemoteSettingsRefresh、maxEffortLevel などのクロスソースキーを除く)。`"merge"`(v2.1.242+)は全管理ソースを合成し、リストは union、ロックは最も厳しい値、制限 allowlist(availableModels、allowedMcpServers、allowedProviders、strictKnownMarketplaces、allowedChannelPlugins、fallbackModel)は最上位ソースから丸ごと、ヘルパー/ログインキー(apiKeyHelper、forceLoginOrgUUID、modelPicker、policyHelper、permissions.defaultMode)は最上位ソースだけ、`env` は両モードで変数単位マージです。

```json
{
  "managedSourcesBehavior": "merge"
}
```

最上位ソースに配置します。HKCU とホストの親プロセス設定は参加しません。

ドロップインのマージ規則は、単一値は後のファイルが勝ち、リストは union、`env`/`sandbox` などのネストブロックはキー単位でマージ、`fallbackModel`、`modelPicker`、同名の `extraKnownMarketplaces`/`managedMcpServers` は後が丸ごと置換です。隠しファイルと非 .json は無視され、数字プレフィックスで順序を制御します。空の managed-settings.json は `{}` 扱いですが、いずれかの管理ドキュメントの不正 JSON は起動拒否です。`/status` の「Setting sources」には `(remote)`、`(plist)`、`(HKLM)`、`(file)`、`(drop-ins)`、`(remote + file, merged)`、`(HKCU)`、`(parent process)`、`(helper)` と「Skipped sources」行が出ます。

#### managed 専用キーと fail-closed

managed ソースからだけ読まれるキーは `allowManagedPermissionRulesOnly`、`allowManagedHooksOnly`、`allowManagedMcpServersOnly`、`sandbox.network.allowManagedDomainsOnly`、`sandbox.filesystem.allowManagedReadPathsOnly`、`strictKnownMarketplaces`、`blockedMarketplaces`、`strictPluginOnlyCustomization`、`disableSideloadFlags`、`forceRemoteSettingsRefresh`、`managedMcpServers`、`policyHelper`、`wslInheritsWindowsSettings`、`managedSourcesBehavior`、`parentSettingsBehavior`、`availableModelsMatch`、`deniedModels`、`modelPricing`、`allowedProviders`、`claudeMd` などです。

`allowManagedPermissionRulesOnly: true` は user/project/local/--settings の allow/ask/deny と `--allowedTools` を無視し、「always allow」選択肢を隠し、ルール保存を止め、v2.1.282 以降は repo/user/add-dir 由来の skills の `allowed-tools` frontmatter も無視します。`--disallowedTools` とセッション deny/ask は引き続き効き、設定リロードでも生き残ります(v2.1.257+)。

```json
{
  "permissions": {
    "deny": [
      "Read(./.env)",
      "Read(./secrets/**)"
    ],
    "disableBypassPermissionsMode": "disable"
  },
  "allowManagedPermissionRulesOnly": true
}
```

最小のロックダウンファイル。OS 別の managed パスに配置します。

Cowork(Claude Desktop)はホスト提供の allow ルールでフォルダアクセスを付与するため、このロックで書き込みが失敗します。復旧には managed ソース自体に allow を足します。

```json
{
  "allowManagedPermissionRulesOnly": true,
  "permissions": {
    "allow": [
      "Edit(~/CoworkProjects/**)"
    ]
  }
}
```

Cowork ではシェルは `mcp__workspace__bash`、フェッチは `mcp__workspace__web_fetch` を通るので、managed の裸 `Bash`/`WebFetch` deny はそれらもブロックしますが、`Bash` の allow は引き継がれません。

検証に失敗した managed キーは v2.1.282 以降「fail closed」します。不正な allowedMcpServers → 空の allowlist、不正な availableModels → Default のみ、不正な crossSessionInbound → refuse、不正な `permissions.defaultMode` → `default`、`deny`/`ask` が読めない間は `allow` と `additionalDirectories` を保留、`autoMode` の `soft_deny`/`hard_deny` が読めなければ `allow` と `environment` を保留、不正な managed `sandbox` Boolean は最も厳しい値(`failIfUnavailable` だけは破棄)、不正な `deniedDomains` は `allowedDomains` を保留です。不正な `disableAllHooks` は破棄され、`requiredMinimumVersion`/`requiredMaximumVersion` は fail open です。

`disableSideloadFlags: true`(managed、v2.1.280+)は `--plugin-dir`、`--plugin-url`、`--agents`、`--mcp-config`(全 `type: "sdk"` のものを除く)、`CLAUDE_CODE_PLUGIN_DIRS` を拒否します。`claude mcp add` と `.mcp.json` は動くので `allowedMcpServers` と組み合わせてください。

#### server-managed settings

Team/Enterprise の Owner/Primary Owner が claude.ai コンソールから配布し、起動時に取得、1時間ごとにポーリング、`~/.claude/remote-settings.json` にキャッシュされ、Anthropic ホストのクラウドセッションに届く唯一の managed ソースです。ただしクライアント側制御であり、セキュリティ境界ではありません。ユーザーはキャッシュを編集/削除でき、Bedrock/Google Cloud Agent Platform/Foundry や非既定の `ANTHROPIC_BASE_URL` のセッションは取得自体をスキップします。export された `CLAUDE_CODE_USE_*` や非既定 `ANTHROPIC_BASE_URL` を managed の `env` で元に戻すことはできず、export を外すかユーザー設定で `"CLAUDE_CODE_USE_VERTEX": ""` のように打ち消す(適格性チェックより前に適用される)しかありません。Console API キーは claude.ai Teams/Enterprise と別組織なので Console キーの CI には届かず、Cowork セッションは取得しません。グループ別ポリシーは未対応です。

シェルコマンド系設定(apiKeyHelper、statusLine、otelHeadersHelper)、hooks、sandbox のバイナリ/TLS/資格情報設定、プロキシ/base-URL の `env` は対話セッションで承認ダイアログを伴い、拒否すると終了します。承認の記憶は claude.ai ログインなら組織ごと、gateway なら gateway ごと、API キー/OAuth トークンならペイロードごと(`/logout` で消える)で、非対話実行は未承認設定をその実行限りで適用し承認を記録しません(v2.1.207+)。キャッシュされたプロキシ/TLS/ルーティング/資格情報の env 変数(HTTPS_PROXY、NODE_EXTRA_CA_CERTS、ANTHROPIC_BASE_URL、ANTHROPIC_API_KEY、CLAUDE_CONFIG_DIR、HOME など)はサーバーがペイロードを確認するまで保留されます(v2.1.198+)。初回起動時のサインインでは取得を最大5秒待ち、`managedMcpServers` は最大30秒待ちます。`claude doctor` の「Managed settings (remote)」行(v2.1.248+)と `claude --debug-file <path>` の「Remote settings」で診断できます。

```json
{
  "forceRemoteSettingsRefresh": true
}
```

取得が成功するまで起動をブロックする fail-closed 構成。`claude auth` サブコマンドは免除。`api.anthropic.com` への到達が必要です。

```json
{
  "env": {
    "DISABLE_TELEMETRY": "1"
  }
}
```

組織全体でテレメトリを切る例。truthy 値はダイアログなしで適用されますが、feature flag 取得も止まります。

#### policyHelper

`policyHelper`(managed。plist/HKLM/file のみ、server-managed からは不可)は最初のプロンプト前に実行可能ファイルを走らせ、その stdout の JSON `{"managedSettings": {...}}`(1 MiB 以下)が唯一の managed ソースになります。起動時の失敗(非ゼロ終了、タイムアウト、不正 JSON)で Claude Code は起動を拒否します。`timeoutMs` は最小 1000、既定 10000、`refreshIntervalMs` は 0 または 60000 以上です。

```json
{
  "policyHelper": {
    "path": "/usr/local/bin/claude-policy",
    "timeoutMs": 5000,
    "refreshIntervalMs": 300000
  }
}
```

障害耐性のためキャッシュから返して exit 0 させる設計が推奨です。

```json
{
  "managedSettings": {
    "permissions": { "deny": ["Read(//etc/secrets/**)"] }
  }
}
```

`managedSettings` ラッパーのない素の settings オブジェクトは何も適用されず、エラーも出ません。server-managed がポリシーを配信している間、helper は走りません。

### 10.6 `env` ブロックと環境変数

#### `env` ブロックの規則

`env` の値はシェルの export を上書きします(export を打ち消すには `""`)。しかし project/local 設定は、保存場所系(CLAUDE_CONFIG_DIR、CLAUDE_CODE_TMPDIR、HOME、TMPDIR、XDG_*)、テレメトリ出力系(CLAUDE_CODE_ENABLE_TELEMETRY、OTEL_*_EXPORTER、OTEL_EXPORTER_OTLP_*_ENDPOINT/HEADERS、OTEL_LOG_USER_PROMPTS など)、CLAUDE_CODE_PROCESS_WRAPPER、SYNC 系、ダイアログタイマー、CLAUDE_CODE_DISABLE_ATTACHMENTS/FILE_MENTIONS を設定できず、`claude --debug` で見える警告とともに落とされます。どのファイルも CLAUDE_CODE_REMOTE、CLAUDE_CODE_MESSAGING_*、CLAUDE_CODE_RESTRICTED、rm チェック無効化変数は設定できません。project/local の `env` はワークスペース信頼後(または `-p` では起動時)にだけ適用されます。値は平文ですべてのサブプロセスに届くので、ローテーションする秘密には `apiKeyHelper`/`otelHeadersHelper` を使います。Desktop アプリや self-hosted runner の起動環境はどのファイルの env よりも優先されます。

```json
{
  "env": {
    "API_TIMEOUT_MS": "1200000",
    "BASH_DEFAULT_TIMEOUT_MS": "300000"
  }
}
```

値は文字列です。シェル形式は `export API_TIMEOUT_MS="1200000"`。この例の数値は説明用で、公式ページの逐語引用ではありません(未検証)。

#### Boolean の解釈と presence-only 変数

多くの変数は 1/true/yes/on と 0/false/no/off を受け付けますが、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、`DISABLE_TELEMETRY`、`DISABLE_ERROR_REPORTING`、`CLAUDE_CODE_TMUX_TRUECOLOR`、`FALLBACK_FOR_ALL_PRIMARY_MODELS`、`IS_DEMO` は存在だけを見るので `0` でもオンになります。`FORCE_HYPERLINK` は数値を読み `0` だけが無効化(`false` は有効化)、`DO_NOT_TRACK` は標準 Boolean です。数値変数は行に「plain digits only」とない限り `2e3` や `64_000` を受け付けます。`DISABLE_TELEMETRY` / `DO_NOT_TRACK` / `DISABLE_GROWTHBOOK` / `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` は feature flag 取得も止め、`/auto-mode-setup`、Remote Control、claude.ai の skill/plugin 同期、advisor、idle compaction、artifact comments などが使えなくなります。

#### タイムアウトと上限

`API_TIMEOUT_MS`(600000)、`BASH_DEFAULT_TIMEOUT_MS`(120000)、`BASH_MAX_TIMEOUT_MS`(600000。v2.1.285 以降バックグラウンドコマンドにも適用)、`BASH_MAX_OUTPUT_LENGTH`(30000、最大 150000。`bashOutputMaxChars` 設定があれば無視され、そちらは 4000-128000 にクランプ)、`MCP_TIMEOUT`(起動 30000)、`MCP_TOOL_TIMEOUT`(100000000 ≈ 28時間。HTTP/SSE は上げない限りリクエストごと 60 秒)、`CLAUDE_CODE_MCP_TOOL_IDLE_TIMEOUT`(ネットワーク 5 分/stdio 30 分)、`MAX_MCP_OUTPUT_TOKENS`(25000)、`CLAUDE_CODE_MAX_RETRIES`(10、上限 15)、`CLAUDE_CODE_MAX_OUTPUT_TOKENS`(モデル依存。未知モデルは 32000、上限 128000。上げると auto-compaction 前の実効コンテキストが減る)、`CLAUDE_CODE_FILE_READ_MAX_OUTPUT_TOKENS`(25000)、`CLAUDE_CODE_MAX_TOOL_USE_CONCURRENCY`(10)、`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`(20)、`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`(3)。無人実行では `CLAUDE_CODE_RETRY_WATCHDOG=1` が 429/529 を無期限に再試行し、`CLAUDE_CODE_RETRY_WATCHDOG_MAX_WAIT_MS`(v2.1.295+)と `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS`(v2.1.301+)で上限を付けます。

`MAX_THINKING_TOKENS` は固定の思考予算(最大出力トークン未満、最小 1024)で、`0` は Anthropic API で思考を無効化しますが Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable では無効化できません。適応推論モデルでは `CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` がない限り正の値は無視されます。`CLAUDE_CODE_DISABLE_THINKING=1` はパラメータ自体を省略します(プロキシ互換用)。`CLAUDE_CODE_EFFORT_LEVEL`(low/medium/high/xhigh/max/auto)は `--effort`、`/effort`、`modelSettings`、`effortLevel` より優先され、`maxEffortLevel` の上限は残ります。

#### プロバイダと認証

`ANTHROPIC_API_KEY` はサブスクリプションを上書きし(対話では一度確認、`-p` では常に使用)、`ANTHROPIC_AUTH_TOKEN` は Bearer、`ANTHROPIC_BASE_URL` の非ファーストパーティホストは MCP tool search と Remote Control(v2.1.196+)を既定で無効化し server-managed の取得もスキップします。`CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY/MANTLE/ANTHROPIC_AWS`、`CLAUDE_CODE_SUBAGENT_MODEL`(+`_FORCE` v2.1.257+)、`CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token` で取得)があります。`CLAUDE_CONFIG_DIR` は設定ディレクトリ全体(設定、履歴、プラグイン)を差し替え、複数アカウントの並行利用は `alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'` の形で行います。settings ファイルに書くときは絶対パスにしてください。`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`(埋め込みホストが設定)はプロバイダ/認証/モデル変数と managed のモデル固定を無視し、v2.1.300 からは CA バンドル/ツールプロキシ/git TLS 変数も無視します。`CLAUDE_CODE_SIMPLE=1` / `--bare` は最小プロンプト、Bash/read/edit ツールのみ、hooks/skills/MCP 探索なし、keychain 認証なしです。

### 10.7 設定のデバッグ

`/context` は何が読み込まれたかを、`/status` の「Setting sources」はどのファイルと managed ソースが読まれ何がスキップされたかを示します(どのファイルがどのキーを供給したかは出ません)。`claude doctor`(ターミナル、読み取り専用)は不正/破棄エントリを列挙し、`/doctor` はセッション内で修正を提案します。`/permissions` は解決済みルールをソースファイル付きで、`/hooks`、`/mcp` も同様です。`claude --debug` / `--debug=mcp` は `~/.claude/debug/<session-id>.txt` に記録します。`claude --safe-mode` はカスタマイズを無効化しつつ managed のポリシーは維持します。

```bash
mkdir -p ~/claude-clean/empty && cd ~/claude-clean/empty
CLAUDE_CONFIG_DIR=~/claude-clean/config claude --setting-sources user
```

新しい設定ディレクトリとプロジェクトソースなしで、問題が自分の設定由来かを切り分けます。managed とコネクタは引き続き効きます。

hook の matcher を文字列ではなく配列で書くと、そのファイルの PreToolUse/PermissionRequest の他の hook も無効になります。`,` 区切りは v2.1.191 以降、ツール名は大文字小文字を区別します。単独の hooks ファイルは存在せず(plugin だけが hooks/hooks.json を持つ)、`mcpServers` を settings.json に書いても読まれません(リポジトリルートの `.mcp.json` に `mcpServers` キー)。hook のハンドラ型は `command`、`prompt`、`agent`、`http`、`mcp_tool` で、HTTP hook は `allowedHttpHookUrls`(Any file、配列はマージ、空配列はすべてブロック、ホストは大文字小文字無視で末尾ドット正規化)と `httpHookAllowedEnvVars` でゲートされ、managed 値が不正なら空の managed allowlist にフォールバックします(v2.1.267+)。managed の hooks は他のファイルから除去できません。

```json
{
  "allowedHttpHookUrls": ["https://hooks.example.com/*", "http://localhost:*"]
}
```

### 10.8 セキュリティモデルの要点

権限を強制するのは Claude Code であってモデルではありません。CLAUDE.md は意図を形作りますが境界ではありません。プロンプトインジェクション防御は、Manual モードのプロンプト、ネットワークコマンドの承認(`curl`/`wget` は自動承認されない)、別モデル呼び出しによる WebFetch の要約、ワークスペース信頼ダイアログ、コマンドインジェクション検出(`Bash(git *)` の allow があってもパース不能なコマンドはプロンプト)、fail-closed なマッチング、OS keychain/0600 の資格情報保存、そして auto mode ではツール結果を見ない分類器とツール結果へのサーバーサイド probe です。Windows では `\\*` パスを allow しないでください(WebDAV)。クラウドセッションは隔離 VM で、GitHub 資格情報は VM に入らず(サーバーサイドプロキシが付与)、プロキシはブランチ削除とタグ push を拒否します。Remote Control は実行をローカルに保ちつつ、接続中のトランスクリプトを Anthropic サーバーに保存します。推奨プラクティスはコマンドのレビュー、信頼できないコンテンツをパイプしない、外部 Web サービスには VM を使う、`/security-review`、設定編集を監査する ConfigChange hook、OpenTelemetry 監視(v2.1.301 で `tool_decision` イベントに `classifier_verdict`、`permission_mode`、`OTEL_LOG_TOOL_DETAILS=1` で `classifier_category` が追加)です。

`crossSessionInbound`(accept/hold/refuse)は managed → --settings → user の順で最初の値を採り、project/local は厳しい方向にだけ効きます。user/project/local/--settings の未知の値は受信メッセージを修正まで HOLD にし、managed では `refuse` と読まれます。

```json
{
  "crossSessionInbound": "hold"
}
```

bypassPermissions で値未設定の場合、送信側もプロンプトをバイパスしていない限り受信は保留されます。

### 落とし穴と対策

- 単一スラッシュのパスルール(`Read(/secrets/**)`)は設定ソース基準で、ユーザー設定では `~/.claude/` を指す。ユーザー設定では `//`(絶対)か `~/` を使う。
- Bash の deny/ask はコマンドテキストにマッチし、`/bin/rm`、`bash -c '...'`、`find -delete`、`git -C . push` を止めない。「正規化される」というブログは公式に否定されている。硬い保証はサンドボックスか PreToolUse hook。
- `defaultMode: "auto"`/`"bypassPermissions"`、`autoMode` ブロック、`allowAppleEvents`、`filesystem.disabled`、`strictAllowlist`、`tlsTerminate`、credential の `mask` は project/local からは黙って無視される。user/managed/--settings に置く。
- サンドボックスのパス構文は permissions ルールと逆。`/tmp/build` はサンドボックスでは絶対、`Edit(/tmp/build)` はプロジェクト相対。`.` はプロジェクト設定ではプロジェクトルート、ユーザー設定では `~/.claude`。
- Linux/WSL2 では `allowWrite`/`denyWrite`(と、それに流れる Edit ルール)の `*`、`?`、`[` を含むエントリが黙ってスキップされる。
- サンドボックスの既定読み取りポリシーは `~/.ssh` と `~/.aws/credentials` を露出する。`sandbox.credentials`、`denyRead`、`permissions.blockReadsOutsideWorkingDirectories` を足す。
- サンドボックスが起動できないと `failIfUnavailable: true` がない限り黙って非サンドボックスになる。逆にそのキーを置くとネイティブ Windows は起動しない。
- auto mode は `Bash(*)`、`Bash(python*)`、package-manager run、`Agent`、`Monitor` の allow を落とすが `Bash(npm test)` のような狭いルールは残し、それが破壊的引数を分類器の前で通す。`autoMode.classifyAllShell: true` で塞ぐ。
- `autoMode` の配列で `"$defaults"` を省くと組み込みリスト全体が置換される(force push、`curl | bash` のルールが消える)。
- 会話上の境界はコンテキスト圧縮で消える。耐久性があるのは `permissions.ask`/`deny` だけ。
- `permissions.allow` は保護パス(`.git`、`.claude`、`.vscode`、シェル rc、`.mcp.json` など)への書き込みを事前承認せず、臨界パスの `rm`/`rmdir` はどの allow も hook も承認できない。`"${DIR:?}"` ガードを使う。
- auto/bypass の臨界パス rm プロンプトはターミナルで2分、3回未応答で拒否。`-p`/SDK/VS Code チャット/Desktop では即拒否。
- presence-only 変数(`DISABLE_TELEMETRY=0` など)は `0` でもオン。unset する。`FORCE_HYPERLINK=false` はハイパーリンクを有効化する。
- project/local の `env` は CLAUDE_CONFIG_DIR、CLAUDE_CODE_TMPDIR、HOME/TMPDIR/XDG_*、テレメトリ exporter、CLAUDE_CODE_PROCESS_WRAPPER などを設定できず、`--debug` 警告付きで落ちる。
- `claude -p`/SDK は信頼ダイアログを出さず allow も適用しないが、hooks/env/helpers を実行し `.mcp.json` に無確認で接続する。信頼できないリポジトリでは `--setting-sources user`、`--bare`、`--settings '{"disableAllHooks": true}'`。
- 「don't ask again」はリポジトリルートの `settings.local.json` に保存され、project/managed の ask ルールがその local allow に勝つので、プロンプトが出続けることがある。
- `cleanupPeriodDays: 0` は検証失敗(最小 1。長期保持は 3650)。`attribution: false` は v2.1.281+ 必須で、古いバージョンは settings ファイル全体を拒否する。
- `~/.claude.json` に `permissions`/`hooks`/`env` を書いても無視。`mcpServers` を settings.json に書いても読まれない。
- server-managed settings はクライアント側制御。キャッシュの編集/削除、Bedrock/Google Cloud Agent Platform/Foundry や独自 `ANTHROPIC_BASE_URL` でのスキップ、Console キーの別組織問題、Cowork の非取得がある。MDM/HKLM/ファイル配信の方が強い。
- サンドボックスの既定プロキシは TLS を検査せず、`github.com` のような広い allowlist はドメインフロンティングを許す。`httpProxyPort`/`socksProxyPort` はフィルタリング全体を自前プロキシに渡し、そのトラフィックへの Claude Code のドメインリストを無効化する。
- macOS では資格情報ファイルの `mask` は `deny` として振る舞い、サンドボックス内の git over SSH は失敗する。リモートを HTTPS にするか `git fetch/pull/push *` を除外。
- `onExtractNoMatch` の既定 `warn` は、正規表現が外れた資格情報ファイルをマスクなしで読めるようにする。存在しうる秘密には `deny`。
- サンドボックス auto-allow は Manual モードでもファイル変更 Bash をプロンプトなしで走らせる。裸の `Bash` ask はサンドボックス内コマンドではスキップされる(plan mode を除く)。
- SIGKILL されたセッションが Linux で 0 バイトのプレースホルダを `.claude` 設定パスに残し権限保存を壊す。`claude doctor` の「Stale sandbox mask files」で検出。
- hook の matcher を配列で書くとそのファイルの他の PreToolUse/PermissionRequest hook も無効化される。

### 中級者が次にやること

1. ユーザー設定を監査する。`~/.claude/settings.json` の Read/Edit ルールで単一スラッシュ始まりのものを `//` か `~/` に書き換え、`/permissions` で解決結果とソースファイルを確認する。
2. 「テキストマッチ」に依存している deny を棚卸しする。`Bash(rm *)` や `Bash(curl *)` で守っているつもりのものを、サンドボックスの `denyRead`/`allowedDomains` か PreToolUse hook に移す。allow に `"Bash"` を置き、hook で特定コマンドを exit 2 で拒否するパターンに切り替える。
3. サンドボックスを有効化し、資格情報を閉じる。`/sandbox` で有効化した後、`sandbox.filesystem.denyRead` に `~/.ssh` と `~/.aws/credentials` を、`sandbox.credentials.files` に `mode: "deny"` を足す。Linux なら AppArmor プロファイルを先に入れ、`failIfUnavailable: true` で黙ったフォールバックを防ぐ。
4. auto mode に human checkpoint を置く。`permissions.ask` に `Bash(git push *)` と `Bash(gh pr create *)` を書き、`autoMode.classifyAllShell: true` で狭い allow の抜け道を塞ぎ、`claude auto-mode defaults` で既定ルールの文面を読んでから `"$defaults"` 付きで `soft_deny` を足す。
5. `-p` と CI の起動モードを固定する。CI コンテナでは feature flag が届かないので `--permission-mode dontAsk --allowedTools "Bash(npm test)" "Read"` のように明示し、`--dangerously-skip-permissions` はコンテナ/VM/sandbox-runtime の内側で非 root に限定する。

```bash
claude -p "run the test suite" --permission-mode dontAsk --allowedTools "Bash(npm test)" "Read"

# fully unattended, ONLY inside a container/VM/sandbox runtime as non-root:
claude -p "<prompt>" --dangerously-skip-permissions
```

6. 信頼できないリポジトリを `-p` で触る前の定型を作る。`--setting-sources user` または `--settings '{"disableAllHooks": true}'` を含むラッパースクリプトを用意し、`.mcp.json` の自動接続を `disabledMcpjsonServers` で止める。
7. `blockReadsOutsideWorkingDirectories: true` をユーザー設定に入れ、作業 dir 外の読み取りをどのモードでも拒否する。必要な dir は `--add-dir` で明示する。
8. チームへ配布する場合は managed の最小ロックダウン(deny + `disableBypassPermissionsMode` + `allowManagedPermissionRulesOnly`)から始め、`managed-settings.d/` に数字プレフィックスで分割し、`/status` の Setting sources と `claude doctor` で配信を確認する。server-managed だけに頼らず、MDM/ファイル配信を主にする。
9. `ConfigChange` hook で設定ファイルの編集をログに残し、OpenTelemetry の `tool_decision` イベントで `classifier_verdict` と `permission_mode` を集計して、auto mode のブロック傾向を可視化する。
10. `CLAUDE_CONFIG_DIR=~/claude-clean/config claude --setting-sources user` のクリーン起動を手元に用意し、挙動がおかしいときに自分の設定由来かをまず切り分ける。

### 出典

- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/settings-example
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/auto-mode-config
- https://code.claude.com/docs/en/auto-mode-classifier-billing
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/sandbox-environments
- https://code.claude.com/docs/en/managed-settings
- https://code.claude.com/docs/en/server-managed-settings
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/security
- https://code.claude.com/docs/en/debug-your-config
- https://github.com/anthropics/claude-code/blob/main/CHANGELOG.md


---

## 第11章 モデル設定・コスト・クレジット/利用枠の管理

### この章で分かること

Claude Code のコストは「どのモデルを、どの effort で、どれだけのコンテキストを、キャッシュが温かい状態で送るか」でほぼ決まる。この章では、モデル指定の解決順序 (`/model` > `--model` > `ANTHROPIC_MODEL` > `model` 設定 > `ANTHROPIC_DEFAULT_MODEL`)、effort の保存先が `modelSettings` に移った経緯と `CLAUDE_CODE_EFFORT_LEVEL` の逆転した優先度、プロンプトキャッシュを壊す操作と TTL (1h/5m) の決まり方、fast mode と advisor の課金構造を仕組みとして説明する。さらに 2026年10月時点のプラン制度 (5時間/週次の利用枠、usage credits、Max/Team の月次 API クレジット、Fable の 50% ルール) と、`/usage`、`modelPricing`、OpenTelemetry、Agent SDK の `total_cost_usd` がそれぞれ何を測り、何を測っていないかを整理する。すべて v2.1.302 (2026-10-16) までの公式ドキュメントと changelog で検証済みの内容で、未検証の数値には「(未検証)」を付けている。

### 11.1 モデルの指定と解決順序

#### エイリアスとモデル ID

`/model` や `--model` に渡せる値は、エイリアスと完全なモデル ID の二種類がある。

| 値 | 意味 |
|---|---|
| `default` | エイリアスではなく特殊値。オーバーライドを消してアカウントのランタイム既定値に戻す |
| `best` | Fable が利用可能なら `fable` の解決先、そうでなければ `opus` と同じ |
| `fable` | Fable 5.1 (`ANTHROPIC_DEFAULT_FABLE_MODEL` 未設定時)。Claude apps gateway 経由のセッションでは `fable` と `best` は Fable 5 に解決 |
| `opus` / `sonnet` / `haiku` | Anthropic API では Opus 5.5 / Sonnet 5.5 / Haiku 5.5 |
| `opus[1m]` / `sonnet[1m]` | 1M コンテキストを要求。エイリアスが既にネイティブ 1M モデル (Sonnet 5 以降、Opus 4.7 以降) に解決する場合は効果なし |
| `opusplan` | plan mode では Opus、実行時は Sonnet |

プロバイダによって解決先は異なる。Anthropic API は Opus 5.5 / Sonnet 5.5 / Haiku 5.5、Claude Platform on AWS は Opus 5.5 / Sonnet 4.6 / Haiku 4.5、Bedrock と Google Agent Platform は Opus 5.5 / Sonnet 4.5 / Haiku 4.5、Microsoft Foundry は Opus 4.6 / Sonnet 4.5 / Haiku 4.5。最小バージョンは Sonnet 5.5 が v2.1.284、Opus 5.5 が v2.1.280、Haiku 5.5 が v2.1.293、Fable 5.1 が v2.1.257。

バージョンを固定したいときは完全な ID を使う。ドキュメント上に登場する ID は `claude-fable-5-1`、`claude-fable-5`、`claude-opus-5-5`、`claude-sonnet-5-5`、`claude-sonnet-5`、`claude-haiku-5-5`、`claude-opus-4-8`、`claude-opus-4-7`、`claude-opus-4-6`、`claude-sonnet-4-6`、`claude-sonnet-4-5`、`claude-haiku-4-5`、およびそれらの `[1m]` 付き。なお user settings に `claude-fable-5` または `claude-fable-5[1m]` が書かれていると v2.1.257 以降の初回起動で `fable` / `fable[1m]` エイリアスに自動書き換えされる (起動時に `(auto-updated)` 表示)。project / local / managed の値はそのまま残る。

#### 優先順位

高い順に次のとおり。

1. セッション中の `/model <alias|name>`。選択は `~/.claude/settings.json` に既定値として保存される。ピッカーで `s` を押すとそのセッション限定
2. 起動時の `claude --model <alias|name>` (そのセッションのみ)
3. 環境変数 `ANTHROPIC_MODEL` (そのセッションのみ)
4. settings ファイルの `model` キー
5. `ANTHROPIC_DEFAULT_MODEL` (v2.1.236 以降)。他に何も指定がないときだけ使われ、`default` / `inherit` / `opusplan` / `haiku` を設定すると無視される

補足として、`--resume` したセッションはトランスクリプトに記録されたモデルを引き継ぎ、これは `model` 設定より強いが `--model` と `ANTHROPIC_MODEL` には負ける。Enterprise で claude.ai ログインの場合、`/model` はアカウント側にも選択を記録する (v2.1.280 以降)。managed / project の `model` は次回起動時に再適用される。

```json
{
    "permissions": {
        "allow": ["Bash(npm run lint)"]
    },
    "model": "opus"
}
```

`.claude/settings.json` (project) または `~/.claude/settings.json` (user) に置く。`model` は新規セッションの初期選択であって強制ではなく、`/model` で上書きできる。

#### `default` の解決先

v2.1.280 以降、`default` は Pro / Max / Team / Enterprise / Anthropic API のすべて、および Claude Platform on AWS、Bedrock、Google Agent Platform で Opus 5.5 に解決する。例外は Microsoft Foundry (Sonnet 4.5) のみ。v2.1.280 より前は Pro と Team Standard が Sonnet 5、Max / Team Premium / Enterprise / API が Opus 5 だった。Fable はどのプランでも既定にならない。Pro ユーザーにとっては「何もしなければ Opus 5.5 で 5時間枠を消費する」ことを意味する。

#### opusplan

`opusplan` は plan mode で Opus、実行フェーズで Sonnet に切り替わる。plan mode のトグルごとにモデル切替が起き、プロンプトキャッシュが毎回作り直される点に注意。`opusplan[1m]` は両フェーズで 1M を要求する (`/model` 経由は v2.1.265 以降)。`availableModels` で最新 Opus が除外されていると、許可された中で最新の Opus を使う (Anthropic API と Claude Platform on AWS のみ。プロバイダ ID を使うプラットフォームではセッションモデルのまま)。

#### フォールバックチェーン

```json
{
  "fallbackModel": ["claude-sonnet-5", "claude-haiku-4-5"]
}
```

settings ファイルに置く。`--fallback-model sonnet,haiku` で一セッションだけ上書きできる。チェーンは重複除去後に最大 3 モデル、`"default"` は既定モデルに展開される。切替が起きるのは overload / unavailable / サーバーエラー時のみで、認証、課金、レート制限、リクエストサイズ、転送エラー、組織ポリシーによる拒否では発動しない。切替はそのターン限りで、`availableModels` 外のエントリは落とされ、コンパクト中により小さいコンテキストのモデルには落ちない。`fallbackModel` は settings ファイル間でマージされず、最も優先度の高いファイルのチェーンがそのまま使われる (project が `["claude-sonnet-5"]`、user が `["claude-haiku-4-5"]` ならチェーンは前者のみ)。Bedrock / Agent Platform でアカウントが呼び出せないモデルを拒否された場合は unavailable 扱いとなりチェーンが走る。`/status` にはチェーンは表示されない。

#### コンテンツ起因の自動フォールバック

Fable / Opus 5.5 / Sonnet 5.5 / Opus 5 では安全分類器がフラグを立てたリクエストを別モデルで再実行する (v2.1.219 以降)。Fable 5.1 / Fable 5 / Opus 5.5 は生物学系なら Opus 5、サイバーセキュリティ系なら Opus 4.8。Sonnet 5.5 のサイバー系は Sonnet 5。Sonnet 5.5 / Opus 5 の生物学系は拒否。フォールバック後はセッションがそのモデルに留まり、フラグ対象リクエストの effort レベルも引き継ぐ。元に戻すには `/model`。`switchModelsOnFlag: false` で事前確認にできる。CLAUDE.md や git status の内容で初回リクエストから発動することもあり、`claude --safe-mode` で検証できる。フォールバック先が `availableModels` で除外されていると実行されない (拒否)。Bedrock / Agent Platform / Foundry では `ANTHROPIC_DEFAULT_OPUS_MODEL` (Sonnet 5.5 用には SONNET も) の設定とセッション以上のコンテキスト幅が必要。キャッシュ上はモデル切替なので新規キャッシュになる。

#### 管理設定でのガバナンス

```json
{
  "model": "claude-sonnet-4-5",
  "availableModels": ["claude-sonnet-4-5", "haiku"],
  "enforceAvailableModels": true,
  "env": {
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "claude-sonnet-4-5"
  }
}
```

managed-settings.json に置く。`availableModels` はプレフィックス一致で、特定バージョンのエントリはその家系のワイルドカードを無効化する (`["sonnet", "claude-sonnet-4-5"]` は Sonnet 4.5 系のみ許可)。managed の `availableModels` は下位スコープとマージされず置き換える (v2.1.175 以降)。`enforceAvailableModels` (v2.1.175 以降) はピッカーの Default 行にも許可リストを適用する。

```json
{
  "availableModels": ["opus", "sonnet"],
  "deniedModels": ["claude-opus-5-5"]
}
```

`deniedModels` と `availableModelsMatch: "exact"` は managed 限定で v2.1.283 以降。古いクライアントはキーを無視するので `requiredMinimumVersion` と組み合わせる。`deniedModels` の `"claude-opus-5"` は後続マイナー (5.5) も塞ぐので、Opus 5 だけ塞ぐなら `"claude-opus-5-0"` と書く。`best` / `opusplan` / `default` のエントリは無視される。

```json
{
  "availableModels": ["claude-opus-5", "claude-sonnet-5"],
  "availableModelsMatch": "exact"
}
```

`"exact"` では `claude-opus-5` が Opus 5 (日付付き ID 含む) を許可するが `claude-opus-5-5` は許可しない。家系エイリアスは引き続き家系全体を許可する。

その他、`modelPicker` (user / managed、v2.1.242 以降)、`modelOverrides`、Enterprise 管理者による組織既定モデル (v2.1.196 以降、ユーザー選択を上書き可能で `/model` は一セッション限りになる。`--model`、`ANTHROPIC_MODEL`、managed、`--settings` は依然として優先) と役割ごとの制限 (v2.1.187 以降、org スコープのサービスキーには適用されず、Haiku は無効化不可) がある。サーバー管理設定は Bedrock / Vertex / Foundry や API キーのフリートには届かないので、そこでは MDM で managed-settings.json を配る。

#### サードパーティプロバイダでのピン留め

```bash
export ANTHROPIC_DEFAULT_OPUS_MODEL='arn:aws:bedrock:us-east-1:123456789012:custom-model/abc'
export ANTHROPIC_DEFAULT_OPUS_MODEL_NAME='Opus via Bedrock'
export ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION='Opus 4.7 routed through a Bedrock custom endpoint'
export ANTHROPIC_DEFAULT_OPUS_MODEL_SUPPORTED_CAPABILITIES='effort,xhigh_effort,max_effort,thinking,adaptive_thinking,interleaved_thinking'
```

シェルの rc または managed `env` に置く。`ANTHROPIC_DEFAULT_{FABLE,OPUS,SONNET,HAIKU}_MODEL` でエイリアスの解決先をプロバイダ ID に差し替える。Bedrock の ARN やデプロイ名は組み込みの検出パターンに一致しないため、`_SUPPORTED_CAPABILITIES` を宣言しないと effort や thinking が無効のままになる。`_NAME` / `_DESCRIPTION` / `_SUPPORTED_CAPABILITIES` はサードパーティプロバイダで効き (`_NAME` / `_DESCRIPTION` は `ANTHROPIC_BASE_URL` ゲートウェイ越しでも)、直接 api.anthropic.com には効かない。`ANTHROPIC_SMALL_FAST_MODEL` は非推奨で `ANTHROPIC_DEFAULT_HAIKU_MODEL` に置き換わった。Opus 4.6 / Sonnet 4.6 を 1M で使うには変数ごとに `[1m]` を付ける。

```bash
export ANTHROPIC_CUSTOM_MODEL_OPTION="my-gateway/claude-opus-5-5"
export ANTHROPIC_CUSTOM_MODEL_OPTION_NAME="Opus via Gateway"
export ANTHROPIC_CUSTOM_MODEL_OPTION_DESCRIPTION="Custom deployment routed through the internal LLM gateway"
```

ゲートウェイ経由のモデルをピッカーに追加する。許可リストがあれば ID を `availableModels` に含める必要があり、ID に家系名が含まれるとその家系のワイルドカードを無効化する。ゲートウェイの未知 ID は 200K コンテキストと仮定されるので、`modelOverrides`、`[1m]` サフィックス、または `CLAUDE_CODE_MAX_CONTEXT_TOKENS` で修正する。`/model` ピッカーの価格表示は Anthropic API またはそれをプロキシするゲートウェイでのみ出る。

### 11.2 effort と thinking

#### effort レベルと既定値

`low` / `medium` / `high` / `xhigh` / `max` が Fable 5.1 / 5、Opus 5.5 / 5 / 4.8 / 4.7、Sonnet 5.5 / 5、Haiku 5.5 で使える。Opus 4.6 / Sonnet 4.6 には `xhigh` がない。未対応レベルを指定すると、それ以下で最も高い対応レベルに落ちる。既定値は Opus 5.5 / Sonnet 5.5 / Haiku 5.5 が `medium`、Opus 4.7 が `xhigh`、それ以外は `high`。Enterprise では組織既定モデルに対する組織既定 effort も既定値の供給源になる。

解決順序は 1) 明示指定 (`CLAUDE_CODE_EFFORT_LEVEL`、`--effort`、`/effort`) 2) settings (`modelSettings` のモデル別または `effortLevel`) 3) モデル既定値。注意すべきは `CLAUDE_CODE_EFFORT_LEVEL` が `--effort` と `/effort` に勝つこと。モデル指定とは逆方向で、シェルに古い export が残っていると effort が黙って固定される。skill / subagent の frontmatter `effort` はセッションレベルを上書きするが `CLAUDE_CODE_EFFORT_LEVEL` には勝てず、キャップは常に適用される。subagent 呼び出し時の `effort` パラメータ (v2.1.292 以降) は定義の `effort` を上書きし、resume 後も保持される。`/tasks` で各 subagent のモデルと effort を確認できる。

#### 保存場所: `modelSettings` と旧 `effortLevel`

```json
{
  "modelSettings": {
    "claude-opus-5-5": {
      "effortLevel": "high"
    }
  }
}
```

`~/.claude/settings.json`。v2.1.251 以降、`/effort <level>` やピッカーの Enter はこの形式で正規モデル ID 配下に保存し、エイリアス、日付付き ID、`[1m]`、プロバイダ ID を同じエントリに対応付ける。ピッカーの `s` はセッション限定 (v2.1.257 以降)。`/effort auto` で保存済みレベルを消す。重要な落とし穴として、Opus 5.5 以降のモデルは user settings のトップレベル `effortLevel` を無視する。これは `/effort` がモデル別保存になる前に書いていた古い形式で、Opus 5.5 は上記のいずれかがレベルを与えない限り `medium` で始まる。一方、project / local / managed / `--settings` のトップレベル `effortLevel` は全モデルに適用される。`max` は `effortLevel` にも `modelSettings.<id>.effortLevel` にも書けず (受け付けるのは low/medium/high/xhigh)、固定したければ `CLAUDE_CODE_EFFORT_LEVEL=max` のみ。ピッカーで Max を選んでも保存されない (v2.1.295 でメッセージ修正)。

#### `maxEffortLevel` によるキャップ

```json
{
  "maxEffortLevel": "medium",
  "modelSettings": {
    "claude-sonnet-4-6": {
      "maxEffortLevel": "max"
    }
  }
}
```

v2.1.267 以降。全モデルを `medium` に抑えつつ、このファイル内では Sonnet 4.6 を除外する例。`"max"` はキャップなしを意味する。複数スコープがキャップを持つ場合は最も低いものが勝ち、別スコープから引き上げられない。Enterprise の役割別キャップ (v2.1.195 以降) とも低い方が適用される。すべてのプロバイダでクライアント側に効き、`--output-format json` / `stream-json` ではクランプが無言で行われる。

#### ultracode と ultrathink

`ultracode` は effort レベルではなく Claude Code の設定 (dynamic workflows) で、`"ultracode": true` で永続化する。`--effort ultracode` と Agent SDK の `effortLevel: "ultracode"` はオンにしたうえでレベルを `xhigh` に設定するが、`/effort ultracode` と `ultracode` 設定は現在のレベルを変えない (v2.1.284 以降)。workflows がオフ、またはモデルが `xhigh` を持たない場合は使えない。`effortLevel` 設定と `CLAUDE_CODE_EFFORT_LEVEL` は `ultracode` を受け付けない。

`ultrathink` はプロンプト中のキーワードで、そのターンだけ深い推論をコンテキスト内で要求し、API の effort レベルは変えない。`think`、`think hard`、`think more` はキーワードとして認識されず通常のテキストとして渡される。

#### thinking の制御と課金

Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable では thinking をオフにできない。`MAX_THINKING_TOKENS=0` と `alwaysThinkingEnabled: false` はこれらでは無効。thinking トークンは折り畳まれていても編集されていてもすべて出力トークンとして課金されるので、コストを制御する手段は effort レベルになる。Option+T / Alt+T でセッション単位のトグル、`/config` で `alwaysThinkingEnabled` を保存。

```json
{
  "alwaysThinkingEnabled": false
}
```

settings ファイルに置くが、`MAX_THINKING_TOKENS` がセッション単位で優先する (0 でオフ、正の値ならキーが false でもオン。適応型モデルでは数値は無視)。適応型推論モデル (Fable、Sonnet 5 以降、Haiku 5.5、Opus 4.7 以降) は非ゼロの `MAX_THINKING_TOKENS` を無視し、`CLAUDE_CODE_DISABLE_ADAPTIVE_THINKING=1` は Opus 4.6 / Sonnet 4.6 のみに効く。`MAX_THINKING_TOKENS` はリクエストの最大出力トークン数より 1 少ない値で上限され、1,024 未満にはならない。サードパーティプロバイダでは thinking をオフにする代わりにパラメータを省略するため、適応型モデルは依然として考える。`showThinkingSummaries: true` は表示だけでコストは変わらない。

### 11.3 コンテキストウィンドウとコスト

#### 1M コンテキスト

Fable 5.1 / 5、Sonnet 5 以降、Haiku 5.5、Opus 4.7 以降は `[1m]` なしでネイティブ 1M。Opus 4.6 / Sonnet 4.6 は `[1m]` が必要で、プラン制限がかかる。

| プラン | Opus 4.6 [1m] | Sonnet 4.6 [1m] |
|---|---|---|
| Max / Team / Enterprise | サブスクに含まれる | usage credits が必要 |
| Pro | usage credits が必要 | usage credits が必要 |
| API / 従量課金 | フルアクセス | フルアクセス |

このチェックは直接 Anthropic API 接続時のみ行われ、`ANTHROPIC_BASE_URL` ゲートウェイ越しに claude.ai ログインがある場合は `[1m]` 行が選択可能のままでゲートウェイが判断する (v2.1.229 以降)。200K 超に対する割増料金は Haiku 5.5 を除いて存在しない。`CLAUDE_CODE_DISABLE_1M_CONTEXT=1` で全モデルを 200K に抑える。`API Error: Usage credits required for 1M context` は残り枠に関係なく出るエンタイトルメント判定で、会話が 200K を超えると自動コンパクトで 200K 未満に戻してそこに留める。v2.1.301 以降、より小さいウィンドウのモデルに切り替える際は切替前のモデルで要約してから移り、その要約に usage credits を無断で使わなくなった。

#### Haiku 5.5 の価格段差

Haiku 5.5 はプロンプト 100K トークンまで入力 $0.10 / 出力 $0.50、100K 超で入力 $0.50 / 出力 $2.50 (per MTok) と 5 倍になる。プロンプト長にはキャッシュ読み書きも含まれ、リクエスト単位で判定されるため、一部がキャッシュヒットでも 100K 超なら高い方のレートが適用される。1.1x のデータレジデンシー係数も 100K 超レートに乗る。ネイティブ 1M なので既定では約 967K まで自動コンパクトしない。安く使うなら `/autocompact 100k` (100K は最小値) で 100K 付近に留める。ただし閾値到達でコンパクトが走る近似であって保証ではない。

#### 自動コンパクトのウィンドウ

指定源は 4 つ。`/autocompact` はモデル別に `modelSettings` へ保存 (v2.1.288 以降)、`autoCompactWindow` 設定は全モデル、`--autocompact` は起動単位、`CLAUDE_CODE_AUTO_COMPACT_WINDOW` はすべてに優先する。範囲は 100K から 1M でモデルウィンドウが上限。`/autocompact` と `--autocompact` は `500k` / `1M` / 裸の `200` 形式を受け付けるが、環境変数は整数のみで `500k` は `500` と読まれて 100K に丸められる (`500000` と書く)。`--autocompact` は managed 設定に先取りされないが `/autocompact` はされる。`DISABLE_COMPACT=1` で全コンパクト無効。

subagent の frontmatter にも `autoCompactWindow` が置ける (v2.1.296 以降)。

```markdown
---
name: log-reader
description: Reads long log files and reports the errors it finds
autoCompactWindow: 200000
---
```

`.claude/agents/log-reader.md`。こちらも整数のみで `200k` は `200` と解釈されて黙って無視される。`claude --debug` で `invalid autoCompactWindow` を確認できる。`--agent` でセッション全体をこの subagent として動かす場合は効かない。

idle compaction (v2.1.290 以降、ターミナルは v2.1.299) は 200K トークン以上の会話が約 54 分アイドルだと 1h キャッシュ失効前にコンパクトする。対話ターミナル、1h TTL バケット、feature-flag 取得が必要。`idleCompaction: false` で無効、`CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS` (下限 100000) で閾値変更、`DISABLE_AUTO_COMPACT` でも止まる。

#### `/compact`、`/clear`、`/rewind` のコスト

`/compact` は会話全体を読む大きなリクエスト。キャッシュが温かい間は安いが、TTL 失効後 (古いセッションの resume) は履歴全体を非キャッシュ入力として再処理するので最も高くつく。`/clear` はコストゼロ、`/rewind` は既にキャッシュされたプレフィックスまで切り詰めるだけ。

```markdown
# Compact instructions

When you are using compact, please focus on test output and code changes
```

CLAUDE.md に置くとコンパクト時の要約指示になる。アドホックには `/compact Focus on code samples and API usage`。

#### ツール出力の上限

Bash のインライン出力は既定 30,000 文字 (`BASH_MAX_OUTPUT_LENGTH` で最大 150000、`bashOutputMaxChars` 設定は 4000 から 128000 で環境変数に優先)。MCP ツール結果は 25,000 トークン (`MAX_MCP_OUTPUT_TOKENS`)、10,000 で警告、50,000 文字超はファイル保存。`anthropic/maxResultSizeChars` を宣言する MCP ツールはその文字上限を使う。`CLAUDE_CODE_MAX_OUTPUT_TOKENS` は出力上限を上げるが自動コンパクトまでのコンテキストを減らす (未知 ID では既定 32000、上限 128000)。

### 11.4 プロンプトキャッシュの経済学

#### 料金表 (per MTok、入力 / 5m 書込 / 1h 書込 / キャッシュ読取 / 出力)

| モデル | 入力 | 5m 書込 | 1h 書込 | 読取 | 出力 |
|---|---|---|---|---|---|
| Fable 5.1 | $10 | $12.50 | $20 | $0.25 | $50 |
| Fable 5 | $10 | - | - | $1 | $50 |
| Opus 5.5 | $4 | $5 | $8 | $0.20 | $20 |
| Opus 5 / 4.8 / 4.7 / 4.6 | $5 | $6.25 | $10 | $0.50 | $25 |
| Sonnet 5.5 | $2 | $2.50 | $4 | $0.10 | $10 |
| Sonnet 5 | $2 | $2.50 | $4 | $0.20 | $10 |
| Sonnet 4.6 | $3 | $3.75 | $6 | $0.30 | $15 |
| Haiku 5.5 (100K まで) | $0.10 | $0.125 | $0.20 | $0.01 | $0.50 |
| Haiku 5.5 (100K 超) | $0.50 | $0.625 | $1 | $0.05 | $2.50 |
| Haiku 4.5 | $1 | $1.25 | $2 | $0.10 | $5 |

キャッシュヒットは Fable 5.1 が基本料金の 0.025 倍、Opus 5.5 / Sonnet 5.5 が 0.05 倍、それ以外は 0.1 倍。Sonnet 5 の $2 / $10 は導入価格から恒久価格になった (2026年9月1日の $3 / $15 への値上げは中止)。Claude 4.7 以降のトークナイザは同じテキストで約 30% 多くトークンを生成するため、Sonnet 4.6 時代のトークン数と直接比較できない。データレジデンシーは 1.1 倍。

#### TTL とその決まり方

既定 TTL は、サブスクでプラン枠内のときはメイン会話が 1h でそれ以外が 5m (サーバー制御のヘルパーを除く)、usage credits / API キー / クラウドプロバイダでは全部 5m。重要なのは、プラン枠を使い切って usage credits に移ると課金対象になるため、メイン会話の TTL が黙って 1h から 5m に落ちること。

```json
{
  "promptCacheTtl": "1h",
  "subagentPromptCacheTtl": "5m"
}
```

v2.1.242 以降、settings ファイルに置く。1h 書込は 5m 書込より高い (Opus 5.5 で $8 対 $5) ので、ターン間に長い考慮時間があるかで損益が変わる。優先順位は `FORCE_PROMPT_CACHING_5M=1` > バケット別環境変数 (`CLAUDE_CODE_PROMPT_CACHE_TTL` / `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`) > バケット別設定 > subagent frontmatter の `experimental.cacheTtl` > `ENABLE_PROMPT_CACHING_1H=1` > 既定。1h は Claude apps gateway 経由では使えず、LLM ゲートウェイは anthropic-beta ヘッダを転送する必要がある。

```markdown
---
name: long-researcher
description: Long-running research subagent
experimental:
  cacheTtl: 1h
---
```

`.claude/agents/` 配下。v2.1.248 以降で `experimental` の下にネストする必要があり、usage credits 使用中は `1h` が無視される。

検証は `claude -p "hello" --output-format json` の `usage.cache_creation.ephemeral_1h_input_tokens` / `ephemeral_5m_input_tokens` を見る。

```python
from claude_agent_sdk import ClaudeAgentOptions, query
import asyncio


async def main():
    options = ClaudeAgentOptions(
        env={
            "CLAUDE_CODE_USE_BEDROCK": "1",
            "ENABLE_PROMPT_CACHING_1H": "1",
        },
    )

    async for message in query(prompt="Summarize this project", options=options):
        print(message)


asyncio.run(main())
```

Agent SDK (Python) で Bedrock に 1h TTL を要求する例。`ENABLE_PROMPT_CACHING_1H` は両バケットに 1h を要求し、バケット別環境変数の方が優先する。

#### キャッシュを壊す操作

新規キャッシュになるもの: `/model` によるモデル切替、skill / command の frontmatter `model:` がセッションモデルと異なるターン、`opusplan` の plan mode トグル、分類器フォールバック、4.x モデルでの effort 変更。effort 変更は Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 5.1 (API キーまたはサブスク) ではキャッシュを保ち確認なしで適用されるが、Bedrock、Google Agent Platform、Claude apps gateway、`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS`、HIPAA 構成では例外が効かない (Fable 5.1 は v2.1.260 より前も無効化していた)。`/model` が確認を求めるのはキャッシュが温かく、かつ移行先が直前の応答を生成したモデルでない場合のみ。`PreModelSwitch` hooks でブロックや確認を要求できる。`/advisor` のトグルはメインキャッシュを壊さない。

キャッシュのスコープは 1 マシン + 1 ディレクトリ。同じディレクトリで並行するセッションはキャッシュを共有し、逐次セッションは起動時の git status スナップショットが一致する場合のみ共有する。システムプロンプトには auto memory のパスが埋め込まれ、会話の先頭に cwd / platform / shell / OS が入る。SDK フリートでは auto memory をシステムプロンプト外に出してマシン間で共有できる。

#### サブエージェントとキャッシュ

subagent は親のキャッシュを読まず自前のキャッシュを持ち、サブスクでも既定 5m TTL。fork はこの例外で親のキャッシュを共有する。おしゃべりな subagent 群はメインループより高くつくことがある。

#### ステータスラインでの観測

v2.1.251 以降、ステータスライン JSON に `prompt_cache` オブジェクトが入る (原因フィールドは v2.1.260 以降、メイン会話のみ)。

```bash
jq -r '.prompt_cache | "cache \(.ttl) warm=\(.warm) hit=\(.hit_ratio // 0) misses=\(.misses) cause=\(.last_miss_cause.causes[0] // "-")"'
```

`statusLine` コマンドのスクリプト内で使う。フィールドは `warm`、`caching_observed`、`ttl` (`"5m"` / `"1h"`)、`expires_at`、`requests`、`misses` (5% 超かつ 2,000 トークン以上の不足)、`expected_rebuilds`、`hit_ratio` (0 から 1)、`cache_write_tokens`、`miss_recache_tokens`、`last_miss_at`、`last_miss_cause` (`tools_changed`、`system_prompt_changed`、`ttl_expired_5m`、`likely_server_side` など)、`miss_causes`、`recache_tokens_if_cold`。他に `cost.total_cost_usd`、`context_window.used_percentage` (入力側のみ: input + cache_creation + cache_read で、モデルの全ウィンドウに対する比率なので `CLAUDE_CODE_AUTO_COMPACT_WINDOW` 設定時はコンパクト時期を示さない)、`rate_limits.five_hour.used_percentage` / `rate_limits.seven_day.used_percentage` (Pro / Max、初回応答後。Claude apps gateway の spend limit 下では `rate_limits.spend_limit.*`、各ウィンドウは独立に欠けうる)。

### 11.5 fast mode

`/fast` は同じ Opus モデルを最大 2.5 倍速く動かし、フラット割増料金になる。Opus 5.5 が $8 / $40、Opus 5 と 4.8 が $10 / $50 (per MTok)。対応は Opus 5.5 / 5 / 4.8 のみで、Opus 4.7 の fast mode は 2026年7月24日に削除。v2.1.280 から既定 fast モデルは Opus 5.5。非 Opus モデルで有効にすると Opus に切り替わる。Bedrock / Google Agent Platform / Foundry / Claude Platform on AWS では使えない。Research preview で価格と提供は変更されうる。

サブスク (Pro / Max / Team / Enterprise) では fast mode はプラン枠に一切含まれず、残り枠があっても usage credits から直接引かれる。Team / Enterprise は Owner が Organization settings > Claude Code で有効化する必要がある。`fastMode: true` はセッションをまたいで永続し、`fastModePerSessionOptIn: true` で毎セッションのオプトインにできる。

```json
{
  "fastModePerSessionOptIn": true
}
```

settings ファイルに置く。managed で設定した場合、`/fast on` は対話ターミナルのみで効き、`-p`、VS Code、クラウドでは拒否される。`-p` で使う唯一の方法は `claude -p --settings '{"fastMode": true}'` (v2.1.205 以降)。

最大の落とし穴は、会話で初めて fast mode を有効にしたとき、会話全体のコンテキストを非キャッシュ入力として fast mode 料金で読み直すこと (ヘッダがキャッシュキーの一部)。深い位置で有効化するほど高い。ヘッダはターン開始時に固定されるので、ターン途中で有効にすると次ターンの最初のリクエストでミスが起きる。この費用は会話につき 1 回で、以後のオフ/オン、レート制限フォールバック、クレジット枯渇フォールバックはキャッシュを保つ。`/clear` と `/compact` でリセットされる。

fast mode は全 Opus 共通の独自レート制限プールを持ち、上限に達すると標準速度に黙ってフォールバック (灰色の ↯) してクールダウン後に再有効化する。usage credits が尽きると対話モードでは「Fast mode disabled · usage credits exhausted」を表示してセッション残りをオフにする。`--output-format stream-json` と Agent SDK では同じテキストが `system` メッセージの subtype `notification` として枯渇中のターンごとに 1 回流れ、fast mode はオンのまま (v2.1.221 以降)。Console org で provisioned access がないと毎リクエスト 429 がレート制限として扱われる。

可用性チェックは `ANTHROPIC_BASE_URL` を無視して api.anthropic.com に直接行く (設定された HTTP プロキシは使う)。ゲートウェイ経由で直接 egress が塞がれていると推論は動くのにチェックが失敗する。対策は `CLAUDE_CODE_SKIP_FAST_MODE_NETWORK_ERRORS=1` (ゲートウェイ発行キーで接続失敗扱いになる場合も)、TLS 検査プロキシが HTTP 200 を返して「組織により無効」と読まれる場合は `CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK=1`。`CLAUDE_CODE_DISABLE_FAST_MODE=1` で完全無効、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` でもチェックが抑止される。`ANTHROPIC_AUTH_TOKEN` のみのセッションはチェックを飛ばして「組織により無効」と報告し、Console の無料 Evaluation プランでは「Fast mode unavailable during evaluation」。

支出の確認先は、Pro / Max が Settings > Usage の「Usage credits」(fast 分は内訳なし)、Team / Enterprise メンバーは `/usage`、Console org は Usage / Cost ページで「Speed (Research Preview)」でグループ化。まず `/status` の Login method と API key 行で自分がどの請求に乗っているかを見る。

### 11.6 advisor

advisor はサーバー側で動く第二のモデルで、毎ターンではなく判断ポイントで Claude が相談する。設定は `/advisor <model>` (保存)、`advisorModel` 設定、`claude --advisor <model>` (一セッション、`claude --help` には載っていない)。`/advisor off` で無効、`CLAUDE_CODE_DISABLE_ADVISOR_TOOL=1` で完全無効。

```json
{
  "advisorModel": "opus"
}
```

settings ファイルに置く。advisor はメインモデルと同格以上である必要がある。受け入れられる組み合わせ (メイン → advisor): Haiku 4.5 / Sonnet 4.6 → Fable、Opus、Sonnet、Haiku 5.5。Opus 4.6 → Fable、Opus、Sonnet 5 以降、Haiku 5.5。Sonnet 5 / Haiku 5.5 → Fable、Opus 4.7 以降、Sonnet 5 以降、Haiku 5.5。Opus 4.7 / 4.8 → Fable、Opus 4.7 以降、Sonnet 5.5 (v2.1.287 以降)。Sonnet 5.5 → Fable、Opus 5 以降、Sonnet 5.5。Opus 5 / 5.5 → Fable、Opus 5 以降。Fable 5 → Fable 5.1 / 5。Fable 5.1 → Fable 5.1。`--advisor` で下位モデルを指定しても起動はするが「cannot advise」警告が出る。subagent は advisor を継承して組み合わせを再チェックし、API に拒否された組み合わせは advisor なしで再送され、新しい選択は `/clear` か `/compact` 後に適用される。

課金は advisor モデルのレートでメインモデルに加算。サブスクではプラン枠にカウントされるが、Fable advisor は Fable が usage credits に乗るプランでは usage credits に請求される (事前に `/model fable` の同意が必要)。速いメインモデル + 強い advisor は、強いモデルを通しで使うより通常安い。`/advisor` のオン/オフはメインモデルのキャッシュを壊さない (定義がキャッシュ breakpoint の後にある) が、advisor 自身の会話読み取りはキャッシュされず、呼ばれるたびに全トランスクリプトを再処理する。呼び出し頻度はモデル任せでキャップ設定はない。

対応プロバイダは Anthropic API で、changelog v2.1.300 (2026-10-14) で Claude Platform on AWS に `/advisor` が追加された (advisor.md 自体はまだ未対応と記載しており、ドキュメントが changelog に遅れている)。feature-flag 取得が必須で、`DISABLE_TELEMETRY` などフラグ取得を止める変数があると advisor は黙ってオフのままになる。

### 11.7 Output styles とトークン

組み込みは Default、Proactive、Concise (v2.1.237 以降)、Explanatory、Learning。`outputStyle` 設定の値は大文字小文字を区別し、`explanatory` のように一致しない値は Default になる (`/output-style` コマンド自体は区別しない)。`/output-style` とメニューは `.claude/settings.local.json` に保存するので、プロジェクト横断の既定は `~/.claude/settings.json` に書く。スタイル変更は次のメッセージから適用 (v2.1.251 以降)。スタイル指示は入力トークンを増やす (初回以降はキャッシュ) うえ、Explanatory / Learning は設計上出力が長くなり、Concise は減らす。fork でない subagent には適用されない。

```markdown
---
name: Diagrams first
description: Lead every explanation with a diagram
keep-coding-instructions: true
---

When explaining code, architecture, or data flow, start with a Mermaid diagram showing the structure, then explain in prose.

## Diagram conventions

Use `flowchart TD` for control flow and `sequenceDiagram` for request paths. Keep diagrams under 15 nodes.
```

`~/.claude/output-styles/` または `.claude/output-styles/` (managed ディレクトリも可) に置く。frontmatter は `name`、`description`、`keep-coding-instructions`、`force-for-plugin`。カスタムスタイルは `keep-coding-instructions: true` がないとコーディング指示を落とす。これはフルのシステムプロンプトでしか効かないので `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0` にする。スタイルファイルは起動時に読まれるため編集後は再起動。

### 11.8 プラン・利用枠・usage credits

#### Pro / Max の枠

Pro と Max には 5 時間のセッション枠と週次枠があり、Claude (チャット) と Claude Code で共有され、IDE 利用も同じ枠にカウントされる。Max は Pro の 5x または 20x で、別枠の週次 Fable 枠を持つ。2026年5月6日に Anthropic は「Pro、Max、Team、seat-based Enterprise の Claude Code 5 時間レート制限を倍増」し、「Pro と Max の Claude Code に対するピーク時間帯の制限縮小を撤廃」した。5x / 20x の絶対的なトークン数や件数は公式ページに公開されていない。

5 時間枠に達したとき進行中のステップを終えられる wrap-up allowance がある。「小さく上限付きで、使用量は週次枠にカウント」され、Pro は週次期間に 1 回まで、Max は 5 時間枠に達するたび (週次枠内) で、メッセージは「Usage limit reached · wrapping up」。段階的に展開中。

プラン価格は claude.com/pricing の記載で Pro が年払い $17 (前払い $200) / 月払い $20、Max は「From $100 Per month」、Team Standard が年払い $20 / 月払い $25 (seat)、Team Premium が年払い $100 / 月払い $125、Enterprise は US$20/seat/month 年払い 20 シート最小。Max 20x の月額 $200 と Team Premium の「Standard の 5 倍」は取得テキストに含まれておらず (未検証)。

#### 利用制限メッセージの読み方

「session limit」「weekly limit」はサブスクのシート単位ウィンドウで全モデル共通。`/model` で切り替えても回復しない。一方「You've hit your Opus limit」「You've hit your Sonnet limit」はモデル家系別で、別家系に切り替えれば作業を続けられる (ただし家系を変えると全履歴を非キャッシュで再読するコストがかかる)。使用量はセッション枠と週次枠の両方に同時にカウントされるので、大きなワークフローのファンアウトは週次枠を先に使い切ることがある。85% で警告が先に出る。「individual spend limit」「org's monthly spend limit」「team's shared budget」は usage credits が管理者設定の上限に達したという意味。コンテキスト / 自動コンパクトの警告は利用制限ではない。

#### 利用制限での自動待機

v2.1.234 以降、claude.ai ログインでは既定で有効。制限に達すると待機してリセット後に続行し、再度ぶつかったら最大 2 回連続で再アームしてから停止する (`Automatic continue stopped after repeated usage-limit hits · /rate-limit-options to try again`)。リセットが 24 時間超先、`-p` / バックグラウンド、Remote Control / teammate セッション、別家系使用中の Opus / Sonnet 制限、API キー、クラウドプロバイダ、従量課金、claude.ai ログイン保存のない LLM ゲートウェイでは提供されない。`/rate-limit-options` で待機 / usage credits 追加 / アップグレードのメニューを開く。待機中に `/usage-credits` で追加するか `/model` を切り替えると即時再チェック。`autoContinueAtUsageLimit: false` で無効化。この設定は user、`--settings`、managed からのみ読まれ、project / local に書くと機能がオフになる。`/config autoContinueAtUsageLimit=false` は `-p` でも効くが key=value 形式では再有効化できない。無人リトライ運用では `CLAUDE_CODE_RETRY_WATCHDOG` (v2.1.199 以降) と `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS` (v2.1.301) でリセットが遠すぎる制限のときにリクエストを打ち切れる。`CLAUDE_CODE_MAX_RETRIES` は既定 10、上限 15。

#### usage credits

旧「extra usage」(commands.md に「Previously `/extra-usage`」とある)。セッション枠、週次枠、Max の Fable 週次枠を使い切ると、停止する代わりに「標準 API レート」での従量課金に切り替わり、月次 spend limit に達するか auto-reload オフで残高が尽きるまで続く。Settings > Usage で支払い方法、spend limit、前払い、auto-reload を設定。`/usage-credits` が開く (ブラウザが開けなければ URL を印字、v2.1.205 以降。API キー認証では使えない。self-serve / trial / AWS Marketplace の Enterprise は v2.1.248 以降)。Pro / Max で残高があるのに spend limit に達すると CLI から上限の引き上げ / 解除を促される。Team / Enterprise では billing admin が Organization settings > Usage で有効化し、非 billing メンバーの `/usage-credits` は管理者への申請を送る (対話のみ、保留中は重複送信しない)。「In most cases, usage credits do not expire」だが日本では 2026年9月10日以降の購入分が 6 か月で失効する。Research mode や project files も credits を消費する。

#### 月次 API クレジット (Max / Team)

2026年10月7日時点 (日付は Agent SDK サポート記事の更新注記から) で、Max 5x に $100/月、Max 20x に $200/月、Team は Standard シート $20 + Premium シート $100 をプールして月 $500 までの API クレジットが付く。対象は Agent SDK、`claude -p`、Messages API、Managed Agents で、リンクした Console org の API キーで動かす場合のみ。プランのサインインで `-p` や SDK を動かしても対象外で、それらは引き続きサブスクの 5 時間 / 週次枠を消費する。対話的な Claude Code、usage credits、Bedrock / Vertex / Foundry、GitHub Action、IDE、デスクトップアプリでは使えない。請求サイクルごとに失効し、購入クレジットより先に消費され、プラン加入 7 日後から。「プランにつき Console org は 1 つ」は取得テキストで確認できず (未検証)。2026年6月に告知された「Agent SDK credit」は FAQ で「That credit isn't available.」とされており、6月15日の「Agent SDK 使用量の変更は一時停止」のまま再開日は示されていない。Team のサポート記事は「Monthly API credits included with Team plans can't be used in Claude Code or the Claude apps, including for extra usage.」と明記している。

#### Fable の扱い

サポート記事の原文は「You can use up to 50% of your weekly usage limits on Fable models at no extra cost.」で、対象は Max / Team Premium / Enterprise Premium シート。50% は週次プールに占める Fable の上限であって上乗せではない。Pro、Team Standard、seat-based Enterprise の Standard シートでは Fable はプラン枠に含まれず最初から usage credits で動く。従量課金 Enterprise と API は標準 API レート。Fable 5 の無料プロモーションは「July 19, 2026 at 11:59:59 PM PT」に終了し Fable 5 のみが対象だった (Fable 5.1 は一度も含まれていない)。Claude Code 側の最小バージョンはドキュメントの v2.1.257 を採る。

対話セッションでは usage credits に乗る Fable 使用の前に 1 回だけ同意プロンプトが出る (ピッカーの Fable 行に「Requires usage credits」)。組織課金の Enterprise メンバーにはプロンプトなし。Remote Control / バックグラウンド / agent team セッションではプロンプトが `dialogExpiry` (既定 5 分) を待ってから送信せずにターンを終える。`-p` モードとプロンプトを出さない Agent SDK アプリでは同意を求めず、「bills it without asking」。

#### Team / Enterprise

各メンバーの使用量はシート単位の割当 (Standard / Premium) から引かれ、ローリング 5 時間ウィンドウと週次ウィンドウでリセットし、Claude チャットと Cowork と共有される。usage credits を有効にすると管理者は org / group / member 単位で spend limit を設定できる。Spend report (CSV、ユーザー別 / モデル別 / 日別) は usage credits 分だけで、シート割当内の使用はドル換算されない。Enterprise Analytics API は Primary Owner の `read:analytics` スコープ付きキーが必要で Teams プランにはない。従量課金 Enterprise シートにはシート制限がなく API レート課金。ベンチマークとして企業展開では「1 開発者あたり約 $13 / アクティブ日、月 $150 から 250、90% のユーザーがアクティブ日 $30 未満」。

#### 認証とどの請求に乗るか

認証の優先順位は、クラウドプロバイダ変数 (`CLAUDE_CODE_USE_BEDROCK` / `VERTEX` / `FOUNDRY`) > `ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_API_KEY` > `apiKeyHelper` > `CLAUDE_CODE_OAUTH_TOKEN` > Anthropic profile / federation > `/login` のサブスク OAuth。サインイン済みの Claude apps gateway はすべてに優先する。サブスクがあっても環境に `ANTHROPIC_API_KEY` があると承認後に API キーが使われ、サブスクから Console 課金へ見えない形で移る (`-p` では承認なしで常に使用)。`unset ANTHROPIC_API_KEY` で戻し、`/status` で確認する。クラウドセッションは常にサブスク資格情報。bare mode は `CLAUDE_CODE_OAUTH_TOKEN` を読まない。`claude setup-token` はモデルリクエストだけできる 1 年有効の OAuth トークンを発行する。`user_oauth` プロファイルは `ANTHROPIC_PROFILE` で名指ししたときだけ `/login` に優先。managed の `forceLoginMethod: "gateway"` / `forceLoginGatewayUrl` (v2.1.261 / v2.1.265 以降) でゲートウェイサインインに固定できる。

```bash
alias claude-work='CLAUDE_CONFIG_DIR=~/.claude-work claude'
```

`~/.bashrc` 等。`CLAUDE_CONFIG_DIR` ごとに settings、セッション履歴、`.credentials.json` が分かれ、macOS Keychain エントリもディレクトリに紐付く。Team / API と個人 Max を分ける公式の方法。ただし API キーなしの Console サインインは config dir 外に保存されるため分離されない。

Console (API) 課金では「Claude Code」ワークスペースが自動作成され、そこで spend limit と rate limit を設定する。TPM / RPM のユーザーあたり目安は 1 から 5 ユーザーで 200k から 300k TPM、500 ユーザー超で 10k から 15k TPM (200 ユーザーなら各 20k TPM、合計 4M TPM のような計算)。

### 11.9 コストの観測

#### `/usage` (`/cost`、`/stats`)

ローカルで計算した定価ベースのコスト推定、モデル別トークン内訳、`Prompt cache (main)` 行 (v2.1.251 以降)、プラン使用率バー、skill / subagent / plugin / MCP 別の帰属、使用量 10% 以上の behavior flags、loops 行、usage credits 行を表示する。`d` / `w` で 24 時間 / 7 日。`/clear` でセッション合計はリセット (v2.1.211 以降)。1.1x のデータレジデンシーは推定に反映される。帰属とプラン内訳はローカルのセッション履歴のみから計算され、他デバイスや claude.ai 分は含まない。Pro / Max にとってドル表示は請求と無関係。v2.1.299 からは max effort、workflows、常時コンテキスト、巨大なツール結果に対する警告も出る。

#### `modelPricing` (managed のみ)

```json
{
  "modelPricing": {
    "multiplier": 0.85,
    "overrides": {
      "claude-sonnet-4-6": {
        "input": 2.4,
        "output": 12,
        "cacheRead": 0.24,
        "cacheWrite": 3
      }
    }
  }
}
```

managed-settings.json、v2.1.242 以降 (1 超の markup は v2.1.271 以降)。`/usage`、ステータスライン、SDK の `total_cost_usd`、`--max-budget-usd`、OTel コストメトリクスが契約レートで報告される。user / project / local / `--settings` / Windows HKCU レジストリでは無視。`overrides` は 4 レートすべて必須 (各 0 から 10000)、`cacheWrite` は 5m と 1h の両方に適用、行はそのまま使われ fast mode 割増や 1.1x は加算されない。組み込み ID のキーは日付付き / プロバイダ表記も覆うが他のキーは完全一致のみ。サーバー管理設定では設定取得が完了するまで定価で報告される。`/model` ピッカーの価格は定価のまま。報告が変わるだけで Anthropic の請求は変わらない。

#### OpenTelemetry

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp       # otlp, prometheus, console, none
export OTEL_LOGS_EXPORTER=otlp          # otlp, console, none
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer your-token"
export OTEL_METRIC_EXPORT_INTERVAL=10000  # default: 60000 ms
export OTEL_LOGS_EXPORT_INTERVAL=5000     # default: 5000 ms
claude
```

シェルで実行。`claude_code.session.count` が届けば疎通確認完了。

```json
{
  "env": {
    "CLAUDE_CODE_ENABLE_TELEMETRY": "1",
    "OTEL_METRICS_EXPORTER": "otlp",
    "OTEL_LOGS_EXPORTER": "otlp",
    "OTEL_EXPORTER_OTLP_PROTOCOL": "grpc",
    "OTEL_EXPORTER_OTLP_ENDPOINT": "http://collector.example.com:4317",
    "OTEL_EXPORTER_OTLP_HEADERS": "Authorization=Bearer example-token"
  }
}
```

managed-settings.json。managed は OTLP の宛先をロックし、リポジトリの `.claude/settings.json` にある OTel 変数は無視される。`OTEL_*` は Bash ツール、hooks、MCP のサブプロセスには渡されない。

メトリクスは `claude_code.cost.usage` (USD) と `claude_code.token.usage` (`type`: input / output / cacheRead / cacheCreation)。属性は `model`、`query_source` (`main` / `subagent` / `auxiliary`)、`speed` (`"fast"` のときのみ)、`effort`、`agent.name`、`skill.name`、`plugin.name`、`mcp_server.name`、`mcp_tool.name`、`marketplace.name`。名前は `OTEL_LOG_TOOL_DETAILS=1` がないと `custom` に伏せられる。`input` はキャッシュトークンを含まないので、`gen_ai.usage.input_tokens` 相当には input + cacheRead + cacheCreation を足す。`claude_code.api_request` イベントは `cost_usd_micros` 整数、`speed` (`fast` / `normal`)、細粒度の `query_source` (`repl_main_thread`、`compact`、subagent 名など。メトリクスの main / subagent / auxiliary とは異なる) を持ち、v2.1.300 (2026-10-14) で `cache_creation_5m_tokens` / `cache_creation_1h_tokens` が加わった (monitoring-usage.md の一覧にはまだ未掲載)。`OTEL_METRICS_INCLUDE_REPOSITORY=true` で `vcs.*` 属性 (v2.1.269 以降)、`OTEL_RESOURCE_ATTRIBUTES="department=engineering,team.id=platform"` でチームごとの集計。コストメトリクスは近似値で、クラウドプロバイダ上でユーザー別にほぼリアルタイムで見られる唯一の手段。v2.1.301 で tool_decision イベントに `classifier_verdict` / `permission_mode` / `classifier_category` が追加された。

#### Analytics ダッシュボード

Team / Enterprise は claude.ai/analytics/claude-code (Admin / Owner。使用量、GitHub app 経由の貢献指標、リーダーボード、CSV。ZDR では不可)。API 顧客は platform.claude.com/claude-code (UsageView 権限。支出と行数、貢献指標なし)。PR 帰属はマージ 21 日前から 2 日後のセッションを対象とし、Claude Code の行を含むマージ済み PR には `claude-code-assisted` ラベルが付く。20% 超書き換えられたコードは帰属しない。Bedrock / Vertex / Foundry の使用量はどの Anthropic ダッシュボードにも出ない。

#### Agent SDK / `-p` の数値

```bash
claude -p --max-budget-usd 5.00 "query"
claude -p --max-turns 3 "query"
claude -p "hello" --output-format json   # read usage.cache_creation.ephemeral_1h_input_tokens / ephemeral_5m_input_tokens
claude -p --settings '{"fastMode": true}'   # only way /fast works in -p (v2.1.205+)
```

`total_cost_usd`、`costUSD`、`modelUsage` は同梱の価格表によるクライアント側推定で、請求の真実ではない (「Do not bill end users or trigger financial decisions from these fields」)。`--max-budget-usd` は推定値に対して判定し、subagent の支出を含み、超過することがあり、上限で subagent 生成を止める (v2.1.217 以降)。`--resume` したセッションは以前の合計を復元する (v2.1.277 以降) ので結果を合算すると二重計上になり、`--max-budget-usd` は復元分を除外する。`error_max_budget_usd` では `usage` が上限を越えた応答を省く一方 `total_cost_usd` / `modelUsage` は含む。ステップごとの assistant `output_tokens` は message_start のプレースホルダなので result から読む。クラッシュした result はコスト欄がゼロになりうる。SDK は usage が `inference_geo: "us"` を報告すると 1.1x を掛ける (TS v0.3.239 以降、Python v0.2.144 以降)。請求の真実は Usage and Cost API か Console。

#### `/insights`

`~/.claude/usage-data/report.html` に HTML レポートを書き、未分析の最大 200 セッションを扱う (短いものはスキップ)。分析は通常セッションと同じプロバイダ / アカウントで走り、トークンはプランまたは API 使用量に乗る。`cleanupPeriodDays` (30) で削除。クラウドセッションでは使えない。

### 11.10 バックグラウンドのトークン消費と auto mode 分類器

resume 時の要約やステータスコマンドなどのバックグラウンド処理は通常セッションあたり $0.04 未満。プロンプト提案は応答のたびにキャッシュ済みリクエストをセッションモデルへ送る (制限付近、コールドキャッシュ、エラー後、plan mode、teammate セッション、そして v2.1.302 以降は credits 課金された応答の後はスキップ)。フリート全体で止めるには managed `env` の `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=false` と `promptSuggestionEnabled: false` の両方が要る。scheduled tasks はアイドル中も間隔ごとに全コンテキストを送り、cross-session メッセージ (`crossSessionInbound: hold` で保留可)、goal check-in (既定 30 分、最大 10080、goal ごとアイドル 3 回まで、`CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` でオフ)、loops も同様。agent teams は plan mode で約 7 倍のトークンを使う (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`)。

auto mode の分類器はサーバー側チェックが無料で、セッションに届かない場合 (多くはゲートウェイ / プロキシ) に Claude Code 自身の分類器リクエストにフォールバックし、「on your account those requests count toward your token usage」となる。「Pro, Max, and Team plans never show the notice」。クライアント側分類器は既定で Sonnet 5 (Fable セッションではセッションモデルまたは Opus)。

```bash
export CLAUDE_CODE_AUTO_MODE_SERVER=0
```

ゲートウェイがサーバー側チェックを通せない環境で、常にクライアント側分類器を使い通知を抑止する (v2.1.281 以降、直接 API。一時的な変数で将来削除されうる)。`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` でもサーバー側チェックは止まる。`/status` の「Auto mode server」行で Enabled / Disabled を確認。v2.1.302 で `CLAUDE_CODE_AUTO_MODE_MODEL` (クライアント側分類器のモデル選択、サーバー側には影響しない。現時点では changelog のみに記載) が追加され、サーバー側安全チェックに長すぎる会話はチェック対象ツール呼び出しをすべて拒否する代わりにコンパクトするようになった。

### 11.11 subagent のモデル解決

優先順位は、呼び出し時の `model` パラメータ > 定義 frontmatter の `model` (`inherit` はメインモデル) > `CLAUDE_CODE_SUBAGENT_MODEL` > メイン会話のモデル (v2.1.251 より前は環境変数が frontmatter に優先していた)。呼び出し時 / frontmatter の家系エイリアスは、メインモデルがその家系ならメインの正確なモデル (`[1m]` 含む) に解決するが、`CLAUDE_CODE_SUBAGENT_MODEL` のエイリアスは常にエイリアスの解決先になる。

```json
{
  "env": {
    "CLAUDE_CODE_SUBAGENT_MODEL": "haiku",
    "CLAUDE_CODE_SUBAGENT_MODEL_FORCE": "1"
  }
}
```

settings ファイル。`_FORCE` (v2.1.257 以降) は frontmatter と呼び出し時のモデルより環境変数を優先させる。両方設定なら `CLAUDE_CODE_SUBAGENT_MODEL` のモデル、`_FORCE` だけならメインモデル (組み込み Explore はその既定モデル)。fork と `model: inherit` の skill はメインモデルのまま。`/tasks` で確認。組み込み Explore は `Explore` という名前のユーザー agent (`model: haiku`) で上書きできる。`/model` で Opus に切り替えると継承する subagent も Opus に移る。フォールバックチェーンは subagent にも適用 (v2.1.247 以降)。`CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL` (v2.1.296、changelog のみに記載) で workflow agent を別途固定できる。

### 11.12 ドキュメントが推奨する削減策と hook レシピ

無関係なタスク間では `/rename` してから `/clear`、カスタム `/compact` 指示、既定は Sonnet で Opus は温存、haiku の subagent、deferred な MCP ツール定義と MCP の代わりの CLI、code intelligence plugin、CLAUDE.md を 200 行未満に保ちワークフロー指示は skill へ、effort を下げる、冗長な処理は subagent に委譲、plan mode と早めの Escape / rewind。

```bash
#!/bin/bash
input=$(cat)
cmd=$(echo "$input" | jq -r '.tool_input.command')

# If running tests, filter to show only failures
if [[ "$cmd" =~ ^(npm test|pytest|go test) ]]; then
  filtered_cmd="$cmd 2>&1 | grep -A 5 -E '(FAIL|ERROR|error:)' | head -100"
  echo "$input" | jq --arg filtered "$filtered_cmd" \
    '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "allow", updatedInput: (.tool_input + {command: $filtered})}}'
else
  echo "{}"
fi
```

`~/.claude/hooks/filter-test-output.sh` に置き、settings.json に `{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"~/.claude/hooks/filter-test-output.sh"}]}]}}` で登録する。テストコマンドを失敗行だけに書き換え、数万トークンのログを数百に抑える。`/hooks` または `claude --debug-file ./claude-debug.txt` で動作確認。

### 落とし穴と対策

- fast mode はサブスク枠に一切含まれず、残り枠があっても usage credits から引かれる。初回有効化で会話全体を $8 から 10 / MTok の非キャッシュ入力として再読するので、使うならセッション開始時に `/fast on`、途中からは使わない。
- v2.1.280 以降 `default` は Pro でも Opus 5.5。Sonnet で運用したい Pro ユーザーは `"model": "sonnet"` を明示する。
- Opus 5.5 / Sonnet 5.5 以降は `~/.claude/settings.json` のトップレベル `effortLevel` を無視し `medium` で始まる。`/effort high` を一度実行して `modelSettings` に書かせるか、project / managed にトップレベルで置く。
- `CLAUDE_CODE_EFFORT_LEVEL` は `--effort` と `/effort` に勝つ。effort が変わらないときはまず `env | grep CLAUDE_CODE_EFFORT`。
- thinking は 5.5 系と Fable でオフにできず、折り畳まれていても出力課金。`MAX_THINKING_TOKENS=0` ではなく effort で制御する。
- usage credits に入った瞬間にメイン会話の TTL が 1h から 5m に落ちる。長考しながら使うなら `promptCacheTtl: "1h"` を試し、書込単価の上昇と再読コストを `prompt_cache.hit_ratio` で比較する。
- subagent は親キャッシュを共有せず 5m TTL。並列 subagent の数と頻度がコストに直結する。fork は共有する。
- 古いセッションを resume して `/compact` すると履歴全体を非キャッシュ再処理する。無関係なら `/clear`、巻き戻しなら `/rewind`。
- `CLAUDE_CODE_AUTO_COMPACT_WINDOW=500k` は 500 と読まれて 100K に丸められる。`500000` と書く。subagent frontmatter の `autoCompactWindow: 200k` も無視される。
- Haiku 5.5 はプロンプト 100K 超で 5 倍単価、既定コンパクトは約 967K。安価運用は `/autocompact 100k`。
- 環境の `ANTHROPIC_API_KEY` を承認するとサブスクから Console 課金に移る。`/status` の Login method / API key 行を習慣的に見る。`-p` では承認なしで使われる。
- 月次 API クレジット ($100 / $200 / Team プール) はリンクした Console org の API キーで動かす `-p` / SDK にしか効かない。プランサインインの `-p` / SDK は枠を消費し、クレジットは使えない。対話 Claude Code や usage credits にも使えない。
- `-p` と同意ダイアログのない SDK では Fable が無断で usage credits に課金される。Pro / Standard シートは最初のトークンから有料。
- session / weekly limit は全モデル共通で `/model` では逃げられない。Opus limit / Sonnet limit だけ家系切替で継続できる (全履歴の再読コスト付き)。
- `/usage`、ステータスライン、`total_cost_usd`、`--max-budget-usd` はすべてクライアント側推定 (または `modelPricing` の契約レート)。`--max-budget-usd` は超過しうる。
- Enterprise / API / クラウドでは、ゲートウェイでサーバー側チェックが届かないときの auto mode 分類器がトークン課金になる。
- managed `availableModels` は下位をマージせず置換し、特定バージョンのエントリが家系ワイルドカードを無効化する。`fallbackModel` もマージされない。
- advisor は feature-flag 取得が前提で、`DISABLE_TELEMETRY` 系の変数があると黙って動かない。
- キャッシュヒット単価は世代で違い (Fable 5.1 が 0.025x、5.5 系が 0.05x、他は 0.1x)、4.7 以降のトークナイザは約 30% 多くトークンを数えるので世代をまたいだ比較は補正が要る。
- `autoContinueAtUsageLimit` を project / local に書くと機能がオフになる。user / managed / `--settings` に置く。

### 中級者が次にやること

1. `/status` と `claude -p "hello" --output-format json` で、自分がサブスク課金か API 課金か、TTL が 1h か 5m かを今すぐ確定させる。想定と違えば `unset ANTHROPIC_API_KEY` か `promptCacheTtl` を直す。
2. `~/.claude/settings.json` に `modelSettings` で主要モデルの `effortLevel` を明示し、シェルから古い `CLAUDE_CODE_EFFORT_LEVEL` を消す。コスト敏感なプロジェクトは `.claude/settings.json` に `maxEffortLevel: "medium"` を置く。
3. ステータスラインに `prompt_cache.hit_ratio`、`last_miss_cause`、`rate_limits.five_hour.used_percentage`、`cost.total_cost_usd` を出し、ミス原因 (`tools_changed`、`ttl_expired_5m` など) が見えたらその操作を避ける習慣を作る。
4. subagent 運用を `CLAUDE_CODE_SUBAGENT_MODEL=haiku` + `_FORCE=1` で始め、`/tasks` と `/usage` の帰属行で subagent の比率を見てから、必要な agent だけ frontmatter `model:` を上げる。
5. 上記の PreToolUse hook をテストコマンドとビルドログに展開し、`/usage` の `Prompt cache (main)` と Bash 出力量がどう変わるか測る。
6. 無人運用 (`-p` / SDK) は `--max-budget-usd` と `--max-turns` を必ず付け、Fable を使うならクレジット消費を前提に設計し、`fastMode` と `fallbackModel` を `--settings` で明示する。Max / Team なら Console org をリンクして月次 API クレジットの範囲に収める。
7. チームなら managed-settings.json に `availableModels` + `enforceAvailableModels`、`modelPricing` (契約レートがある場合)、OTel の `env` ブロックを入れ、`OTEL_LOG_TOOL_DETAILS=1` と `OTEL_RESOURCE_ATTRIBUTES` で skill / plugin / チーム別のコスト集計を立ち上げる。
8. 1M モデルで長いセッションを回すなら `/autocompact` でモデルごとのウィンドウを決め、Haiku 5.5 は 100K、Opus 5.5 / Sonnet 5.5 は作業に応じて 300K から 500K 程度を起点に `/usage` のトークン内訳で調整する。

### 出典

- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/fast-mode
- https://code.claude.com/docs/en/advisor
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/monitoring-usage
- https://code.claude.com/docs/en/analytics
- https://code.claude.com/docs/en/output-styles
- https://code.claude.com/docs/en/auto-mode-classifier-billing
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/agent-sdk/cost-tracking
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/errors
- https://code.claude.com/docs/en/changelog
- https://platform.claude.com/docs/en/about-claude/pricing
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans
- https://support.claude.com/en/articles/12429409-manage-usage-credits-for-paid-claude-plans
- https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan
- https://support.claude.com/en/articles/11845131-use-claude-code-with-your-team-or-enterprise-plan
- https://www.anthropic.com/news/higher-limits-spacex
- https://claude.com/pricing


---

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


---

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


---

## 第14章 全体アーキテクチャと「AIのための仕組み」ブループリント集

第1章から第13章までは、Claude Code の各機構を一つずつ分解してきた。本章はそれを逆向きに組み立てる。まず「どの機構をいつ使うか」を一枚の表に圧縮し、次に「セッション起動時に何がどの順でコンテキストに入り、何が compaction で消え、何がプロンプトキャッシュを壊すか」という全体図から設計原則を導く。その上で、実際に動く 9 つのブループリントを構成ファイルつきで示し、最後に評価・観測・コスト・セキュリティの運用面と、中級者から上級者への学習ロードマップで締める。

本章の設定例は、各章の検証済み research から取った公式スニペット、またはそれらを組み合わせた例である。組み合わせた例には「複合例」と明記する。公式ドキュメントで確認できなかった事項は「(未検証)」とする。バージョン表記は 2026 年 10 月 17 日時点の Claude Code v2.1.302、Agent SDK TypeScript 0.3.302 / Python 0.2.168 を基準とする。

### 14.1 拡張メカニズムの選択表

Claude Code には「Claude に何かを教える・させる・禁じる」方法が 15 種類ある。選び間違いの典型は、禁止事項を CLAUDE.md に書く(助言にしかならない)、毎回必要な知識を skill にする(呼ばれないと読まれない)、1 回限りの処理を plugin にする(配布コストに見合わない)の三つである。表 14-1 は 5 つの軸で全機構を比較する。

| 機構 | いつ・何のために | コンテキストコスト | 決定論性 (Claude の判断が入るか) | 配布のしやすさ | 失敗したときの挙動 |
|---|---|---|---|---|---|
| CLAUDE.md / AGENTS.md | 毎セッション必ず前提にしてほしい短い規約。200 行以下が公式目標 | 全文が毎リクエスト乗る。ルート CLAUDE.md と unscoped rules は compaction 後も再注入 | 低。ユーザーメッセージとして注入される助言で、強制力なし | リポジトリにコミットするだけ。managed 設定の `claudeMd` で組織配布も可 | 肥大化すると無視される。4 MiB 超は丸ごとスキップ |
| .claude/rules/*.md | ディレクトリやファイル種別ごとの規約。`paths:` で遅延ロード | unscoped は起動時に全文、`paths:` 付きは一致ファイルを触った時だけ | 低 (助言) | コミット。`~/.claude/rules/` で個人配布 | `paths:` 付きは compaction で要約されて消える。不正 YAML は無条件ロード |
| Skills (/command) | 必要な時だけ読む手順書・知識。`disable-model-invocation` で人間専用、`context: fork` で subagent 化 | 一覧は description のみ (1,536 文字上限、合計で context の 1%)。本文は呼ばれた時だけ | 低〜中。`!`cmd`` 注入と `allowed-tools` は決定論的 | コミット、`~/.claude/skills/`、plugin、claude.ai 同期 | 注入コマンドが 1 つでも失敗すると本文全体が届かない。compaction 後は先頭 5,000 トークンに切られる |
| Hooks | 毎回必ず起きてほしい処理と、破ってはならない境界 | 0。出力を返した分だけ乗る (10,000 文字上限) | 高。command 型は完全に決定論的。prompt/agent 型は小モデルの判断 | settings.json (user/project/local/managed)、plugin、skill/agent frontmatter | 既定は fail-open (非 0/2 終了は無視)。`onFailure: "block"` (v2.1.295+) で fail-closed |
| Subagents | コンテキスト分離が欲しい調査・レビュー。verbose な出力を本線に持ち込まない | 本線には最終結果だけ。subagent 自身は独自のシステムプロンプト + CLAUDE.md 階層 + git snapshot を読む | 中。委譲判断は description 駆動 | `.claude/agents/`、`~/.claude/agents/`、`--agents` JSON、plugin | 無言でスキップされる定義ミス (name/description 欠落、1 行目 `---` なし) が多い。`claude plugin validate .claude/agents` で検査 |
| Agent teams | peer 同士が直接会話し、共有タスクリストで自律調整する並列作業 | 各 teammate が独立コンテキスト。plan mode の teammate は約 7 倍のトークン | 低。lead を含めすべて Claude の判断 | 有効化は env `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`。定義は subagent ファイル流用 | 有効化すると名前付き subagent が全部 teammate になる副作用。/resume で in-process teammate は復元されない |
| Dynamic workflows | 数十〜数百の subagent をスクリプトで統率し、中間結果を変数に閉じ込める | 本線には最終 return だけ。各 agent は 5 分 TTL のキャッシュ | 中〜高。スクリプト自体は再生可能 (Date.now 禁止)、各 agent の中身は Claude | `.claude/workflows/<name>.js` をコミット、plugin の `workflows/` | agent() は失敗時 null。resume は開始順再生。stall は 6 回で諦める |
| MCP | 外部サービスとの接続 | tool search 既定オンでは名前とサーバー instructions だけ (4,096 文字)。スキーマは必要時 | 高 (ツールは決定論的、呼ぶかは Claude) | `.mcp.json` コミット、`~/.claude.json`、plugin 同梱、managedMcpServers | 接続失敗は `/mcp` と `system/init` の `mcp_server_errors` に出るだけ。出力 25,000 トークン超はファイル退避 |
| Plugins | skills/agents/hooks/MCP/LSP/workflows/output styles を一つの ID で配布 | 有効なだけで自動起動可能な各 skill/agent/command の name+description が毎ターン乗る | 構成要素次第 | marketplace (git)、`--plugin-dir`、`~/.claude/skills/<name>/` + plugin.json、組織の managed 強制 | 自動更新は公式 marketplace のみ既定オン。version 固定で更新が届かない |
| Mods (v2.1.287+) | Claude Code 自体の UI/挙動の書き換え。ペイン、即時 /command、tool.call ゲート | 0 (プロセス内 JS) | 高。ただしユーザー権限でサンドボックス外、ask/deny を緩められる唯一の層 | plugin として配布。組織 mod は managed + directory ソース絶対パスの 3 条件 | `.catch` なしのゲートは fail-open。`claude plugin validate` が `gating hook without .catch` を報告 |
| Agent SDK | 自社プロダクト・社内ツールへの組み込み。カスタムツール、canUseTool、SessionStore | `settingSources: []` で完全分離可能。既定システムプロンプトは最小 | 高 (ホスト側で全部制御) | npm / PyPI。パッチ番号が Claude Code バージョンと 1:1 | 単発 `query()` はエラー結果の後に throw。`success` でも `structured_output` 空は失敗扱い |
| Channels | 外部イベントを実行中セッションへ push (Telegram/Discord/webhook) | イベント本文のみ | 低 (受け取った後は Claude) | plugin。`--channels plugin:<name>@<marketplace>` で毎セッション opt-in | fire-and-forget。送信者ゲートがないとプロンプトインジェクション経路 |
| Scheduled tasks (/loop, CronCreate, Desktop) | セッション内の定期実行 (1 分単位、7 日で失効) / マシン上の定期実行 | 毎回フルコンテキストを再送 | 低 | セッション限定 / `~/.claude/scheduled-tasks/<name>/SKILL.md` | セッションが閉じると消える (self-paced loop は resume でも復元されない)。Desktop は追いつき実行 1 回だけ |
| Routines | マシンもセッションも要らないクラウド定期実行。Schedule / API / GitHub トリガー | 新規クラウドセッション | 低 | claude.ai/code/routines、`/schedule` | 最小間隔 1 時間。API fire の `text` は `<routine-fire-payload>` として untrusted。/schedule は API キー認証では非表示 |
| Output styles | 役割・口調・出力形式。システムプロンプトに入るため指示追従の重みが最大 | 毎リクエスト全文 | 低 (助言) | `.claude/output-styles/`、plugin の `force-for-plugin` | 名前の大文字小文字違いで無言で Default に落ちる。fork 以外の subagent には効かない |

表 14-1 を読むときの 3 原則:

1. **「守らせたい」なら hooks か permissions。「教えたい」なら CLAUDE.md か skills。** 助言層に書いた禁止事項は compaction と文脈の肥大で消える。
2. **「毎回必要」なら CLAUDE.md か rules (unscoped)、「時々必要」なら skills か `paths:` rules。** 起動コストと忘却耐性のトレードオフ。
3. **「他人にも使わせる」なら plugin、「自分だけ」なら `~/.claude/`。** plugin は有効なだけでコンテキストを消費する (`claude plugin details <name>` の Always-on 行で確認)。

#### 強制力の梯子

機構は「どこまで本当に止められるか」で一本の梯子になる。これを一枚の図として頭に置くと、設定の置き場所を間違えなくなる。

```text
弱 ──────────────────────────────────────────────────────────────── 強
[助言]  CLAUDE.md / rules / skills / output styles / autoMode.environment の文章
            │  Claude が読んで従う。compaction・肥大で効力が落ちる
[規則]  permissions.deny / permissions.ask / PreToolUse hook の deny
            │  あらゆる permission mode の前に評価。hook deny は bypassPermissions でも効く
            │  ただし hook の allow は deny ルールと臨界パスの rm を覆せない
[分類器] auto mode classifier
            │  規則の後に走る第二のゲート。ツール結果は見ない
[OS/プロセス] sandbox (Bash/PowerShell/Monitor のみ) / worktree isolation / コンテナ / VM
            │  Claude の判断に関係なく物理的に遮断
[緩める層] mods の tool.check
            │  ask ルールを覆せる。managed / Team / Enterprise 以外では deny も覆せる
            └  だから allowManagedModsOnly / allowManagedHooksOnly が存在する
```

具体的な含意: Bash の deny ルールはコマンド文字列にしかマッチしないので `Bash(rm *)` は `/bin/rm` を止めない。本当に止めるなら sandbox の保護パスか、`tool_input.command` 全文を見る PreToolUse hook に `onFailure: "block"` を付けて fail-closed にする。臨界パス (ルート、$HOME、作業ディレクトリとその親) の `rm` だけは allow ルールでも hook でも承認できないサーキットブレーカーである。

#### プロンプトキャッシュの三層で機能を分類する

Claude Code は毎リクエストを「システムプロンプト + ツール定義」「プロジェクトコンテキスト (CLAUDE.md、auto memory、unscoped rules)」「会話」の順に並べ、前の層が変わると後ろ全部が再読される。設計判断は「どの層を触るか」で分類できる。

| キャッシュ中立 (安心して触れる) | 早い層を書き換える (コールド再読が 1 回発生) |
|---|---|
| リポジトリのファイル編集、ルート CLAUDE.md の編集 (反映もされないが壊しもしない)、permission mode 変更 (opusplan の plan 切替を除く)、output style の切替 (v2.1.251+、会話メッセージとして届く)、skill 呼び出し、`/recap`、`/rewind`、subagent 起動 (親の prefix は不変)、`/advisor` の切替 (定義がブレークポイント後にある)、`/cd` | `/model` やフォールバック、skill の `model:` frontmatter、opusplan の plan 切替、effort 変更 (Opus 5.5 / Sonnet 5.5 / Haiku 5.5 / Fable 5.1 は例外)、fast mode の初回オン、tool search 無効時の MCP 追加・削除、MCP を含む plugin の有効化・無効化 (`/reload-plugins --force`)、tool search 無効時の bare-tool deny、compaction、画像の退避、Claude Code のアップグレード |

TTL は「サブスクリプションの枠内で動くメイン会話」だけ 1 時間、それ以外 (subagent、workflow agent、teammate、compaction、usage credits、API キー、各ゲートウェイ、クラウドプロバイダ) は 5 分である。`promptCacheTtl` / `subagentPromptCacheTtl` (`"5m"` | `"1h"`、v2.1.242+) で上書きできる。

### 14.2 セッション起動時の全体図と設計原則

#### 何がどの順でロードされるか

公式の context-window シミュレーションに基づく、最初のプロンプトを打つ前にコンテキストへ入るものの順序とトークン数の目安 (数値は例示であり実際は構成次第):

| 順 | 内容 | 目安 | 備考 |
|---|---|---|---|
| 1 | システムプロンプト (コア指示 + ツール定義) | 約 4,200 | ユーザーには見えない。output style と `--append-system-prompt` はここに加わる |
| 2 | auto memory (MEMORY.md の先頭 200 行 / 25 KB) | 約 680 | プロジェクト (git リポジトリ) 単位、マシンローカル |
| 3 | 環境情報 (cwd、OS、シェル) + git ブロック (ブランチ、status、最近のコミット) | 約 280 | git ブロックは別の塊。`includeGitInstructions: false` で消える |
| 4 | MCP ツール名 (スキーマは tool search で遅延) | 約 120 | `ENABLE_TOOL_SEARCH=false` で全スキーマが前倒し |
| 5 | skill 一覧 (name + description) | 約 450 | context の 1% を超えると呼ばれない skill の description から落ちる |
| 6 | `~/.claude/CLAUDE.md` | 約 320 | managed の `claudeMd` はこれより前 |
| 7 | プロジェクト CLAUDE.md (祖先ディレクトリ分を連結) + unscoped rules | 約 1,800 | ユーザーメッセージとして注入。子ディレクトリの CLAUDE.md と `paths:` rules はファイルを触った時に遅延ロード |

`.mcp.json` のサーバーはセッション開始時に接続され、`.claude/workflows/` は起動時に `/<name>` として登録され、`keybindings.json` と `~/.claude/themes/` はホットリロードされる。`--bare` はこのうち hooks / skills / commands / subagents / plugins / MCP / auto memory / CLAUDE.md の発見をすべて飛ばす。

#### 設定ソースの優先順位と 3 つの例外

設定ファイルは **managed (file / MDM / server) > `--settings` > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`** の順で、リストキー (`permissions.allow` など) はマージされる。環境変数はこのスタックの段ではなく、変数と設定キーのペアごとに勝敗が決まる (`ANTHROPIC_MODEL` はどのファイルの `model` にも勝ち、`ANTHROPIC_DEFAULT_MODEL` はどのファイルも `model` を持たない時だけ効く)。「設定したのに無視される」の大半は次の 3 例外で説明できる。

1. **厳しい方が勝つキー** (スコープ順を無視): `disableClaudeAiConnectors: true`、`permissions.blockReadsOutsideWorkingDirectories: true` (v2.1.257+)、`enableArtifact: false`、`isolatePeerMachines: true`、`maxEffortLevel` (最も低い上限、v2.1.267+)、`autoMode.classifyAllShell: true` (user / `--settings` から)、`remoteControlAtStartup: false` (project / local から)、`crossSessionInbound` (project / local のより厳しい値)、`useAutoModeDuringPlan` / `syncClaudeAiSkills` / `syncClaudeAiPlugins` (false が勝つ。ただし `.claude/settings.json` の false は無視)。sandbox の `allowUnsandboxedCommands: false` は user の値が project の true に勝つが、managed を覆す例外ではない。
2. **managed ソースが複数あるとき**: 既定の `managedSourcesBehavior: "first-wins"` ではポリシーキーを持つ最上位ソースだけが使われ、残りは無視される (sandbox の lock 系や `env` の変数単位マージなどクロスソースキーを除く)。`"merge"` (v2.1.242+) で全ソース適用に変わるが、それでも `apiKeyHelper` などの credential helper、`forceLoginOrgUUID` などの login pin、`modelPicker`、`permissions.defaultMode` は最上位ソースからしか読まれず、`fallbackModel` チェーンや `availableModels` などの制限リストは最上位ソースの値が丸ごと採用される。
3. **user / managed / `--settings` からしか読まれないキー**: `autoMode` ブロック、`skipAutoPermissionPrompt`、OTEL exporter 系の env、`processWrapper`、`CLAUDE_CODE_ENABLE_CFC`、`vimInsertModeRemaps`、`defaultMode: auto | bypassPermissions` (project / local からは無視)。

#### 名前衝突のルール

| 種類 | 解決順 (左が勝つ) | 備考 |
|---|---|---|
| Skills | enterprise (managed) > personal (`~/.claude/skills`) > project | skill は同名の `.claude/commands` ファイルに勝つ。自作はバンドル skill を置き換えるがエイリアスは置き換えない。ネストは `/<subdir>:<name>`、plugin は `/<plugin>:<skill>` で共存 |
| Subagents | managed > `--agents` > `.claude/agents/` > `~/.claude/agents/` > plugin | Agent SDK の `agents` オプションは同名のファイル定義に勝つ |
| MCP サーバー | managedMcpServers > local (`~/.claude.json` のプロジェクト項目) > project (`.mcp.json`) > user > plugin > claude.ai connector | エントリ丸ごと採用、フィールドのマージなし。Desktop の Code タブは user の stdio が `.mcp.json` に勝つ (CLI と逆) |
| Hooks | マージ (全部発火) | `disableAllHooks` は設定順位に従い、下位から managed hooks を止められない。settings.json と plugin の hooks.json に同じ hook があると二重実行 (未検証) |
| Plugins (同名) | managed enabledPlugins > `--plugin-dir` 等 > marketplace > skills-dir > synced | enabledPlugins のスコープは `--add-dir` < user < project < local < `--settings` < managed |
| Output styles | cwd に最も近い `.claude/output-styles/` | project が global に勝つ |
| Workflows | project `.claude/workflows/` > `~/.claude/workflows/`。モノレポでは cwd に最も近いもの | plugin は `/<plugin>:<name>` |

#### compaction で何が消えるか

| 生き残る (ディスクから再注入) | 要約されて消える (設計が消える) |
|---|---|
| システムプロンプト、output style、ルート CLAUDE.md、unscoped rules、auto memory、git status (更新)、plan ファイル、呼び出し済み skill の本文 (各 5,000 / 合計 25,000 トークンまで)、直近 5 ファイルの再読、バックグラウンドの command / subagent | `paths:` rules、ネストした CLAUDE.md、hook が注入した additionalContext、「push しないで」のような会話上の境界、25,000 トークン超の skill 本文、subagent が返した詳細結果 |

idle compaction (v2.1.299、設定キーは v2.1.290+) により、1 時間 TTL の対話セッションが 200,000 トークン以上で約 54 分放置されると、誰も見ていない間に compaction が起きる。「会話で約束した制約」は設計として信用できない。

#### 導かれる設計原則

1. **ガードレールは hooks と permissions に置き、CLAUDE.md には置かない。** 会話上の「やらないで」は `permissions.ask` / `deny` に翻訳する。
2. **CLAUDE.md は 200 行以下。** 「この行を消したら Claude が間違えるか」で刈る。時々必要な知識は skill へ、ファイル種別依存は `paths:` rules へ。
3. **compaction 耐性はルートに寄せる。** 消えてはいけない規則はルート CLAUDE.md か unscoped rules に、動的な文脈は `SessionStart` の `matcher: "compact"` で再注入し、保存したい状態は `PreCompact` でファイルへ退避する。
4. **プロンプトキャッシュを壊す操作はセッション冒頭に集める。** モデル、effort、fast mode、MCP 構成はタスクの途中で変えない。
5. **subagent は「分離」のために使い、「並列」はおまけ。** verbose な結果が本線に戻ればそのセッションの残り全部に乗る。
6. **headless の権限ベースラインは明示する。** `-p` / SDK は v2.1.302 から、サードパーティプロバイダ、テレメトリ無効、新規インストールのいずれかではモード省略時に `default` で開始し、それ以外では auto になり得る (headless ドキュメントは「組み込みの開始モードで、auto の場合がある」とだけ記す)。`--permission-mode` / `--allowedTools` / `--permission-prompts none` を毎回書く。
7. **認証経路を 1 サーフェス 1 本に固定する。** 有効な資格情報 (プランではなく) が機能を決める。
8. **feature-flag 取得の有無を環境のパラメータとして扱う。** プライバシー強化した CI コンテナは開発者の端末と別物の Claude Code を実行している。
9. **設定の棚卸しを 3〜6 か月ごとに行う。** `/doctor prompt-audit` が古いモデル向けの指示を検出する。
10. **第三者のリポジトリを信用しない設計にする。** 次項の「クローンしたリポジトリができないこと」を前提に、`-p` では `--bare` を使う。

#### クローンしたリポジトリが「あなたにできないこと」と「できてしまうこと」

Claude Code はリポジトリに置かれたファイルを体系的に untrusted として扱う。

できないこと (project / local 設定からは無視される): `autoMode` ルールの注入、`CLAUDE_CODE_ENABLE_CFC` の有効化、`processWrapper`、OTEL exporter エンドポイント、`defaultMode: auto | bypassPermissions`、保存場所系・テレメトリ系の env、`vimInsertModeRemaps`、artifacts の再有効化、`remote.defaultEnvironmentId` の `ccpool_` ID。`permissions.allow`、`additionalDirectories`、`extraKnownMarketplaces`、大半の `env` はワークスペース信頼ダイアログの承認を待つ。`.claude/agents/` のインライン MCP と frontmatter hooks もそのフォルダの信頼が必要。

できてしまうこと: **`-p` / SDK セッションは信頼ダイアログを出さず、コミット済みの `.claude/settings.json` の hooks、`env`、helper、`.mcp.json` のサーバーを無確認で実行する。** 無人パイプラインで最も重要な注意点であり、信頼できないリポジトリを処理する `-p` には `--bare` (hooks / plugins / MCP / CLAUDE.md を読まない) を付ける。

#### 資格情報が機能を決める

| 有効な資格情報 | 使える | 使えない |
|---|---|---|
| claude.ai `/login` (サブスクリプション) | connectors、artifacts、voice、Chrome、computer use (Pro/Max)、Remote Control、routines、cloud sessions、1 時間キャッシュ TTL | (プランによる機能差のみ) |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_AUTH_TOKEN` / `apiKeyHelper` / profiles / `CLAUDE_CODE_OAUTH_TOKEN` / ゲートウェイトークン | モデル要求 (従量課金)、`-p` と SDK | 上記のサブスクリプション機能すべて。`-p` は exported API キーを常に優先する |
| Bedrock / Agent Platform / Foundry | モデル要求 | feature-flag 依存機能、WebSearch (Bedrock)、artifacts、channels、Remote Control |
| Claude apps gateway サインイン | 1M context (v2.1.287+)、グループ別 managed 設定、spend limits | 1 時間 TTL、WebSearch、Remote Control、feature-flag 機能 |

`--bare` は OAuth トークンを一切読まない。apps gateway セッションは `CLAUDE_CODE_USE_BEDROCK` より優先される。

### 14.3 ブループリント集

各ブループリントは「目的 / 構成要素 / ファイル構成 / 主要設定 / 失敗モードと対策 / コスト感 / 対象サーフェスとプロバイダ」の順で示す。構成要素は 14.1 の機構を結ぶグラフとして読んでほしい。skill の `context: fork` は SKILL.md をプロンプトにした background subagent になり、subagent の `skills:` は skill 本文をプリロードし (32 個まで、`disable-model-invocation` の skill は不可)、skill frontmatter の hooks はセッション中ずっと残り (`once: true` はここだけ有効)、subagent frontmatter の hooks はその subagent の間だけ生きて `Stop` は `SubagentStop` に書き換わり、settings の hooks は subagent 内でも発火する。この「接合点」を守れば、どのブループリントも組み替えられる。

#### (a) 自律 PR 修正ボット (GitHub Actions + Code Review + hooks + subagent)

**目的**: PR が開くたびにレビューコメントを付け、`@claude` で指示されたら修正コミットまで行い、重大度が高い指摘が残る間はマージを止める。

**構成要素**: `anthropics/claude-code-action@v1` (interactive モードと automation モードの 2 ワークフロー) + リポジトリにコミットした `.claude/settings.json` (deny ルールと PreToolUse hook) + 読み取り専用の reviewer subagent + Team / Enterprise ならマネージド Code Review の `bughunter-severity` JSON をマージゲートに使う。

**ファイル構成**:

```text
.github/workflows/claude.yml          # @claude メンションに応答 (interactive)
.github/workflows/code-review.yml     # PR ごとに code-review plugin skill を実行 (automation)
.claude/settings.json                 # deny ルール + hooks (コミット済み。-p では信頼ダイアログなしで動く)
.claude/hooks/block-rm.sh
.claude/agents/security-reviewer.md   # 読み取り専用 reviewer
REVIEW.md                             # マネージド Code Review の調整 (既定ブランチが保護されている時のみ有効)
```

**主要設定** (公式 YAML そのまま):

```yaml
name: Claude Code
on:
  issue_comment:
    types: [created]
  pull_request_review_comment:
    types: [created]
jobs:
  claude:
    if: contains(github.event.comment.body, '@claude')
    runs-on: ubuntu-latest
    permissions:
      contents: write
      pull-requests: write
      issues: write
      id-token: write
      actions: read
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

```yaml
name: Code Review
on:
  pull_request:
    types: [opened, synchronize, ready_for_review, reopened]
jobs:
  review:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      pull-requests: read
      issues: read
      id-token: write
    steps:
      - uses: actions/checkout@v6
        with:
          fetch-depth: 1
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          plugin_marketplaces: "https://github.com/anthropics/claude-code.git"
          plugins: "code-review@claude-code-plugins"
          prompt: "/code-review:code-review --comment ${{ github.repository }}/pull/${{ github.event.pull_request.number }}"
          claude_args: '--allowedTools "mcp__github_inline_comment__create_inline_comment"'
```

`claude_args` の `--allowedTools` 行は必須で、インラインコメント用 MCP サーバーはここで名指しされた時だけ起動する。

コミットする `.claude/settings.json` (hooks 公式例の組み合わせ、複合例):

```json
{
  "permissions": {
    "deny": ["Bash(git push --force *)", "Read(./.env)", "Read(./.env.*)"]
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "args": [],
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command')
if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Destructive command blocked by hook"}}'
else
  exit 0
fi
```

読み取り専用 reviewer (公式例):

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

マネージド Code Review (Team / Enterprise) の結果をマージゲートにする:

```bash
gh api repos/OWNER/REPO/commits/<commit-sha>/check-runs --jq '.check_runs[] | {id, name}'

gh api repos/OWNER/REPO/check-runs/CHECK_RUN_ID \
  --jq '.output.text | split("bughunter-severity: ")[1] | split(" -->")[0] | fromjson'
```

`{"nit": 1, "normal": 2, "pre_existing": 0}` のような JSON が得られ、`normal` が Important に相当する。行が無い場合は「判定なし」であって「指摘ゼロ」ではない。

**失敗モードと対策**:

- fork からの PR には secrets が渡らない: 公開リポジトリでは fork PR を自動レビュー対象から外すか、マネージド Code Review (fork PR はコマンド指示時のみ) に任せる。
- action の 2 段階アクターチェック (write 権限 + 人間) で bot コメントが拒否される: cron の最終編集者が bot なら `allowed_bots` に追加。
- 既定の `GITHUB_TOKEN` によるコミットは CI を起動しない: `github_token` を省略して Claude GitHub App として認証させるか、独自 App トークンを渡す。
- クラウドプロバイダ経由の公開リポジトリでは資格情報ステップが write 権限チェックより先に走る: 検証ステップを前段に挟む。
- `REVIEW.md` の重大度引き下げ・パス除外は、ルートの `REVIEW.md` が保護された既定ブランチにある時だけ効く。ローカルの `/code-review` は `REVIEW.md` を読まず CLAUDE.md を読む。
- 修正ループが止まらない: `--max-turns` と、PR 1 本につき 1 回の修正コミットという規律を automation プロンプトに書く。

**コスト感**: `anthropic_api_key` なら API 従量課金 (Console org)。Max / Team の月次 API クレジット ($100 / $200 / プール $500、2026 年 10 月 7 日時点) はリンクした Console org のキーで動く `-p` と SDK に効く。`claude_code_oauth_token` ならサブスクリプション枠。マネージド Code Review は Team / Enterprise の usage credits 課金。ultrareview (`claude ultrareview --json`) は Pro / Max 無料 3 回の後 usage credits で約 $5〜25 / 回。

**サーフェスとプロバイダ**: GitHub Actions (github.com、GHES は手動設定)。Bedrock / Agent Platform / Foundry は OIDC で可、Claude Platform on AWS では GitHub Actions 非対応。

#### (b) ドキュメント・知識ベース生成パイプライン (claude -p + --json-schema + Workflow)

**目的**: リポジトリの各モジュールから構造化された説明 JSON を抽出し、人手の目次と結合してドキュメントサイトやナレッジベースを再生成する。再現性があり、CI で差分検知できること。

**構成要素**: `claude -p --bare --output-format json --json-schema` (1 単位の抽出、スキーマ検証) を外側のスクリプトで並べる方式と、保存済み dynamic workflow (`pipeline()` で 1 ファイル 1 agent、`schema` で構造化出力) を `-p` から `/<name>` として起動する方式の 2 択。前者は完全にホスト側で制御でき、後者は Claude Code 側で並列度とキャッシュ共有を面倒見てくれる。

**ファイル構成**:

```text
scripts/extract.sh                    # 外側ループ (方式 1)
.claude/workflows/doc-extract.js      # 保存済み workflow (方式 2)
.claude/settings.json                 # Workflow の allow ルール (headless 用)
schemas/module.schema.json
```

**主要設定**:

方式 1 (公式コマンド形):

```bash
claude -p "Extract function names from auth.py" \
  --output-format json \
  --json-schema '{"type":"object","properties":{"functions":{"type":"array","items":{"type":"string"}}},"required":["functions"]}' \
  | jq '.structured_output'
```

CI では `--bare`、`--permission-mode dontAsk`、`--max-budget-usd` を加える。`--json-schema` は print モード専用で、不正なスキーマは `Error: --json-schema is not a valid JSON Schema` で実行前に終了し、`format` キーワードは受理されるが検証されない。

方式 2 (公式 `audit-routes.js` の形に倣った例。`meta` リテラルを先頭に置き、`agent()` の `schema` で検証済みオブジェクトを受け取る):

```javascript
export const meta = {
  name: 'doc-extract',
  description: 'Extract a structured summary of every module under src/',
}

const found = await agent('List every .ts file under src/ that exports a public API.', {
  schema: { type: 'object', required: ['files'], properties: { files: { type: 'array', items: { type: 'string' } } } },
})

const summaries = await pipeline(found.files, file =>
  agent(`Read ${file} and describe its public API, inputs, outputs and failure modes.`, {
    label: file,
    schema: {
      type: 'object',
      required: ['file', 'summary', 'exports'],
      properties: {
        file: { type: 'string' },
        summary: { type: 'string' },
        exports: { type: 'array', items: { type: 'string' } },
      },
    },
  }),
)

return summaries.filter(Boolean)
```

headless から起動するための allow ルール (公式キー):

```json
{
  "permissions": { "allow": ["Workflow", "Workflow(doc-extract)"] },
  "workflowSizeGuideline": "small",
  "disableWorkflows": false
}
```

```bash
claude -p "/doc-extract" --output-format json --permission-mode dontAsk --max-budget-usd 10
```

**失敗モードと対策**:

- `-p` はモード省略時の開始モードが環境で変わる (v2.1.302 からサードパーティプロバイダ、テレメトリ無効、新規インストールでは `default`、それ以外は auto になり得る): `default` で始まると許可が要る操作は全部拒否される。`--allowedTools` か `--permission-mode` を必ず書き、`--permission-prompts none` (v2.1.259+) で「誰も答えられない」ことを明示する。
- `success` で `structured_output` が空: 失敗として扱う (SDK も同じ)。
- `agent()` は失敗時 `null` を返し `pipeline()` は null を保持する: `.filter(Boolean)` を忘れると後段が落ちる。`parallel()` / `pipeline()` 1 回の上限は 4,096 項目、1 run の agent 総数は 1,000。
- 標準入力は 10 MB 上限: 大きい入力はファイルに書いてパスを渡す。
- SIGTERM で終了コード 143、進行中のターンは記録されない: 先に SIGINT を送る。ターン終了後もバックグラウンド作業を最大 10 分待つ (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`)。
- `Date.now()` / `Math.random()` は workflow 内で throw する: タイムスタンプは `args` で渡す。同じスクリプトと同じ `args` なら完了済み agent の結果が再利用される (resume は開始順再生)。
- `--bare` なしの `-p` はリポジトリの hooks と `.mcp.json` を無確認で実行する: 信頼できないリポジトリには `--bare`。

**コスト感**: API キーなら API 従量 (5 分 TTL)。workflow agent と subagent は常に 5 分 TTL で、兄弟 agent は model / effort / agent type / tools / schema / cwd が一致する時だけ prefix キャッシュを共有し、`CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS` (既定 5000) の間だけ後続を待たせる。均質なワーカーの方が安い。`--max-budget-usd` はクライアント側の見積もりで、subagent 分を含み、超過することがある。

**サーフェスとプロバイダ**: CI コンテナ、Bedrock / Agent Platform / Foundry でも可 (workflow は対応)。Bedrock / Agent Platform では背景タスクが Sonnet で動くことと、モデルエイリアスのピン留めが必要なことに注意。

#### (c) リサーチハーネス (Workflow: 探索 → 敵対的検証 → 統合)

**目的**: 問いを複数の観点に分解して並列に調べ、各主張を独立した「反証者」に攻撃させ、生き残った主張だけを統合する。本ガイド自体がこの構造で書かれている。

**構成要素**: dynamic workflow の `parallel()` (探索フェーズ、バリア) → 重複排除 → `parallel()` (反証フェーズ、3 票の多数決) → 1 つの統合 agent。WebSearch / WebFetch が必要なら対象プロバイダに注意 (WebSearch は Bedrock 非対応、1 セッション 200 回で約 100 回/時に回復)。バンドルの `/deep-research` も同じ型で、確認できない主張を「反駁された」ではなく「未検証」と印付ける。

**ファイル構成**:

```text
.claude/workflows/research.js
.claude/settings.json      # Workflow allow、workflowSizeGuideline
```

**主要設定** (公式 `/workflow-authoring` skill のパターンを組み合わせた複合例。`DIMENSIONS`、`FINDINGS_SCHEMA`、`VERDICT` などの定数はスクリプト内で定義する):

```javascript
export const meta = {
  name: 'research',
  description: 'Explore a question from several angles, refute each claim, synthesize survivors',
  phases: [
    { title: 'Explore', detail: 'one agent per dimension' },
    { title: 'Refute', detail: 'three independent skeptics per claim' },
    { title: 'Synthesize', detail: 'one writer' },
  ],
}

phase('Explore')
const all = await parallel(DIMENSIONS.map(d => () => agent(d.prompt, {schema: FINDINGS_SCHEMA})))
const deduped = dedupeByFileAndLine(all.filter(Boolean).flatMap(r => r.findings))

phase('Refute')
const verified = []
for (const claim of deduped) {
  const votes = await parallel(Array.from({length: 3}, () => () =>
    agent(`Try to refute: ${claim}. Default to refuted=true if uncertain.`, {schema: VERDICT})))
  const survives = votes.filter(Boolean).filter(v => !v.refuted).length >= 2
  if (survives) verified.push(claim)
}

phase('Synthesize')
return await agent(`Write the report from these verified claims only: ${JSON.stringify(verified)}`)
```

`meta.phases` の title は `phase()` の呼び出しと完全一致させる。`parallel()` は thunk の配列を取り、reject せず失敗を null にする。

**失敗モードと対策**:

- 反証者が「不確かなら refuted=true」に倒れすぎて全滅する: 主張をより細かく分割し、反証プロンプトに出典の要求を入れる。
- 探索 agent が同じソースを何度も読む: 探索結果をファイルに書かせ、後段にはパスを渡す (multi-agent research の公式知見)。
- stall: agent は 6 回試行で諦める (`agent stalled on all 6 attempts`)。`stallMs` か `CLAUDE_ASYNC_AGENT_STALL_TIMEOUT_MS` (既定 600000) を伸ばす。
- `Large workflow` 警告 (25 agent 超または 1.5M トークン見込み) は助言のみ。`workflowSizeGuideline` も助言であり上限ではない。
- 1 run 1,000 agent、同時 16 (`CLAUDE_CODE_WORKFLOW_MAX_CONCURRENT_AGENTS` 1〜256)。
- ultracode キーワードは人間が打った入力からしか発火しない: `-p` や scheduled task からは保存済み `/research` を名前で呼ぶ。

**コスト感**: 探索 D 本 + 反証 3 × 主張数 + 統合 1 本。反証は短い agent なので Haiku 系 (`agent(prompt, {model: 'haiku'})`) で十分なことが多いが、Haiku 5.5 は 100K トークン超のプロンプトで単価が 5 倍になる。全 agent が 5 分 TTL。

**サーフェスとプロバイダ**: 対話セッション、`-p`、クラウドセッション (保存結果を保持)。Bedrock では WebSearch が使えないため、ローカルファイルや MCP で代替する。

#### (d) 定期運用ルーチン (scheduled tasks / routines / channels)

**目的**: 依存の脆弱性監査、CI 失敗の一次対応、週次レポートなど、人が居なくても回る運用。

**構成要素の選択**:

| 手段 | 動く場所 | 最小間隔 | セッション | ローカルファイル | 権限プロンプト | 向く用途 |
|---|---|---|---|---|---|---|
| Routines | Anthropic クラウド | 1 時間 | 不要 | 不可 (リポジトリは clone) | 出ない | 夜間監査、CI 失敗 → 自動調査、PR/Release トリガー |
| Desktop scheduled tasks | 自分のマシン (Desktop 起動中) | 1 分 | 不要 | 可 | タスクごとの permission mode | ローカル環境依存の定期作業 |
| `/loop` / CronCreate | 開いているセッション | 1 分 | 必要 | 可 | セッション継承 | デプロイ監視、PR のレビュー対応 |
| GitHub Actions cron | GitHub | 5 分 (GitHub 側の制約) | 不要 | リポジトリのみ | なし (allowedTools で付与) | リポジトリ中心のレポート |
| Channels | 自分のマシン (セッション起動中) | イベント駆動 | 必要 | 可 | relay で遠隔承認可 | チャットからの指示、webhook |

**主要設定**:

CI 失敗を routine に投げる (公式 curl と Actions ステップ):

```bash
curl -X POST https://api.anthropic.com/v1/claude_code/routines/$ROUTINE_ID/fire \
  -H "Authorization: Bearer $ROUTINE_TOKEN" \
  -H "anthropic-version: 2023-06-01" \
  -H "Content-Type: application/json" \
  -d '{"text": "Sentry alert SEN-4521 fired in prod. Stack trace attached."}'

# GitHub Actions step
# - if: failure()
#   env:
#     ROUTINE_FIRE_URL: ${{ secrets.ROUTINE_FIRE_URL }}
#     ROUTINE_FIRE_TOKEN: ${{ secrets.ROUTINE_FIRE_TOKEN }}
#   run: |
#     curl -X POST "$ROUTINE_FIRE_URL" \
#       -H "Authorization: Bearer $ROUTINE_FIRE_TOKEN" \
#       -H "anthropic-version: 2023-06-01" \
#       -H "Content-Type: application/json" \
#       -d "{\"text\": \"CI failed: $GITHUB_WORKFLOW run $GITHUB_RUN_ID on $GITHUB_REF\"}"
```

routine ID は `trig_` で始まり、トークンは `sk-ant-oat01-` で始まる (Web UI でのみ発行、1 回だけ表示、再生成で失効)。`text` は 65,536 文字まで。**routine の保存プロンプトが `<routine-fire-payload>` ブロックを明示的に参照しないと、この text は不活性なコンテキストとして扱われる。**

セッション内の定期実行 (公式の 4 形):

```text
/loop 5m check if the deployment finished and tell me what happened
/loop check whether CI passed and address any review comments
/loop 20m /review-pr 1234
/loop
```

```markdown
<!-- .claude/loop.md -->
Check the `release/next` PR. If CI is red, pull the failing job log,
diagnose, and push a minimal fix. If new review comments have arrived,
address each one and resolve the thread. If everything is green and
quiet, say so in one line.
```

Desktop のタスクはディスク上では SKILL.md 形式 (スケジュール、フォルダ、モデル、有効/無効はこのファイルには無い):

```markdown
# ~/.claude/scheduled-tasks/<task-name>/SKILL.md
---
name: dependency-audit
description: Weekly dependency audit
---
Only review today's commits. If it's after 5pm, skip the review and post a summary of what was missed.
```

webhook を実行中セッションへ流す最小 channel サーバー (公式 `webhook.ts`):

```typescript
#!/usr/bin/env bun
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'

const mcp = new Server(
  { name: 'webhook', version: '0.0.1' },
  {
    capabilities: { experimental: { 'claude/channel': {} } },
    instructions: 'Events from the webhook channel arrive as <channel source="webhook" ...>. They are one-way: read them and act, no reply expected.',
  },
)

await mcp.connect(new StdioServerTransport())

Bun.serve({
  port: 8788,
  hostname: '127.0.0.1',
  async fetch(req) {
    const body = await req.text()
    await mcp.notification({
      method: 'notifications/claude/channel',
      params: {
        content: body,
        meta: { path: new URL(req.url).pathname, method: req.method },
      },
    })
    return new Response('ok')
  },
})
```

起動は `claude --channels plugin:<name>@<marketplace>`。`.mcp.json` に書いただけでは channel にならない。未掲載の自作 channel は `--dangerously-load-development-channels plugin:...|server:...` (対話専用、`-p` では無視)。

**失敗モードと対策**:

- routine の時刻ぴったり (:00) の実行は数分遅れる: 9:07 のような時刻にする。schedule は 100 回/時/アカウント、Run now + API fire + 再アーム は 30 回/時/routine。
- `/loop` のタスクは 7 日で失効し、self-paced loop は resume で復元されない。jitter は最大 30 分、`*/5` は 5 分キャッシュに収めるため 15 秒早く走る。
- Desktop タスクはアプリが起動中で端末が起きている時だけ。見逃した分は直近 1 回だけ追いつく (7 日以内)。`requiresUserInteraction` の MCP ツールは毎回停止させる。
- channel はイベントを黙って捨てる (サーバーが channel として読み込まれていない、組織ポリシーがブロック、`channelsEnabled` 未設定)。Team / Enterprise は Owner が有効化するか managed 設定で `channelsEnabled: true`。
- channel の送信者ゲートは部屋ではなく送信者 ID で行う。permission relay を宣言する場合、許可リストの全員があなたのセッションのツール実行を承認できる。
- `/schedule` は API キー、profiles、Bedrock / Agent Platform / Foundry、クラウドセッション内では `Unknown command`。
- Desktop から SSH 先で動かす夜間タスクは、Claude アカウントのサインインが切断後数分で切れることがある: 一晩のタスクはクラウドセッションか routine へ。

**コスト感**: routine はサブスクリプション枠 (超過は usage credits)。`/loop` とゴールのチェックインは毎回フルコンテキストを再送するため、長いセッションで短い間隔は高くつく。Desktop タスクは通常のローカルセッションと同じ。

**サーフェスとプロバイダ**: routine と channel は claude.ai ログイン (channel は Console API キーでも可) 必須で、Bedrock / Agent Platform / Foundry / apps gateway では channels が使えない。

#### (e) Slack や Claude Tag から呼べる社内エージェント

**目的**: エンジニア以外も含むチームがチャットから「このリポジトリのこのバグを調べて PR を出して」と頼める入口を作る。

**構成要素の選択** (2026 年 10 月時点):

| 入口 | 対象プラン | 動く場所 | 身元と課金 | 備考 |
|---|---|---|---|---|
| Claude Tag (public beta) | Team / Enterprise | 組織の一時サンドボックス | 組織 ID として動作、組織の usage balance から従量課金 (Owner が spend limit を設定)、チャネル作業にシート課金なし | Tag 接続済みワークスペースでは旧 Slack 統合が 2026 年 10 月 5 日に引退 |
| Claude Code in Slack (旧) | Pro / Max | Anthropic クラウド | ユーザーごとのセッション、プラン枠 | チャネルのみ、GitHub のみ、1 セッション 1 PR。スレッド全体を読むためプロンプトインジェクションに注意 |
| Channels plugin (自前) | Pro / Max、Owner 有効化の Team / Enterprise | 自分のマシンの起動中セッション | 自分の資格情報 | Telegram / Discord / iMessage / fakechat が公式、Slack は自作 (未検証: 公式の Slack channel plugin は確認できなかった) |
| Agent SDK ボット | 任意 (API キー) | 自社サーバー | API 従量 | (f) を参照。チャットの ID 管理を自前で実装 |

**ファイル構成** (クラウド側で動かす場合、リポジトリに持ち込めるもの):

```text
CLAUDE.md
.claude/rules/
.claude/skills/
.claude/agents/
.claude/settings.json      # hooks と permissions (単一リポジトリのクラウドセッションのみ)
.mcp.json                  # 単一リポジトリのクラウドセッションのみ
scripts/install_pkgs.sh    # CLAUDE_CODE_REMOTE ガード付き
```

user スコープ (`~/.claude/*`)、user の plugin、リポジトリの `enabledPlugins` に書いた plugin、local / user の MCP サーバー、`NODE_EXTRA_CA_CERTS` などの通信系 env、対話型 SSO は持ち込まれない。

**主要設定** (公式):

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "bash \"$CLAUDE_PROJECT_DIR\"/scripts/install_pkgs.sh"
          }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash

if [ "$CLAUDE_CODE_REMOTE" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR" || exit 1
hashes=node_modules/.install_pkgs.sha256

if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  # Delete the old hashes first, so a failed install runs again next time
  rm -f "$hashes"
  if npm install; then
    sha256sum scripts/install_pkgs.sh package.json package-lock.json > "$hashes" || rm -f "$hashes"
  fi
fi

# pip skips requirements that are already satisfied
pip install -r requirements.txt
exit 0
```

自前 channel で遠隔承認まで行う場合は、公式 relay 例の capability 宣言と返信パターンを使う (`request_id` は `l` を除く小文字 5 文字):

```typescript
capabilities: {
  experimental: {
    'claude/channel': {},
    'claude/channel/permission': {},  // opt in to permission relay
  },
  tools: {},
},
```

```typescript
const PERMISSION_REPLY_RE = /^\s*(y|yes|n|no)\s+([a-km-z]{5})\s*$/i
// in inbound handler, after sender gating:
const m = PERMISSION_REPLY_RE.exec(message.text)
if (m) {
  await mcp.notification({
    method: 'notifications/claude/channel/permission',
    params: {
      request_id: m[2].toLowerCase(),
      behavior: m[1].toLowerCase().startsWith('y') ? 'allow' : 'deny',
    },
  })
  return
}
```

**失敗モードと対策**:

- クラウド環境のネットワークは既定 Trusted (許可リスト外は 403 `x-deny-reason: host_not_allowed`)。社内 API は Custom allowlist か network secrets で。network secrets は GitHub / api.anthropic.com / 公開レジストリには付与されない。
- クラウドセッションは `dontAsk` / `bypassPermissions` を無言で無視し、Accept edits / Plan / Auto のみ。
- 組織の IP allowlist は Anthropic ホストのセッション、Code Review、routines を壊す。
- 旧 Slack 統合は他のメッセージの指示にも従い得る: 重要な操作は `permissions.ask` で人間のチェックポイントを置く。
- Claude Tag のセッションには server-managed 設定が届かない。
- チャットから来た文章は常に untrusted として扱う設計にする (routine の payload、channel の本文、subagent の返却はいずれも Claude Code 側で「ユーザー権限を持たない」ことが明示される)。

**コスト感**: Tag は組織 balance の従量課金、Slack (Pro/Max) はプラン枠、クラウドセッションは VM 料金なしでプラン枠、channel はローカルセッションと同じ。

**サーフェスとプロバイダ**: いずれも claude.ai 側の機能で、Bedrock / Agent Platform / Foundry には存在しない。ZDR / HIPAA 組織ではクラウドセッション、Tag、Remote Control が無効。

#### (f) Agent SDK で作る社内ツール (カスタムツール + canUseTool + セッション永続化 + 構造化出力)

**目的**: 社内の Web アプリやバッチから Claude Code のエージェントループを呼び、社内 API をツールとして与え、ユーザーごとに承認フローを挟み、セッションを自社 DB に保存し、結果を型付きで受け取る。

**構成要素**: `createSdkMcpServer` + `tool` (in-process MCP、`mcp__<server>__<tool>` で許可)、`canUseTool` (6 段階評価の最後: hooks → deny → ask → mode → allow → canUseTool、自動承認済みの呼び出しには来ない)、`sessionStore` (append/load 必須、ローカルに先に書き、ストアから resume した run は終了時にローカルを削除)、`outputFormat: json_schema` (draft-07)、`maxBudgetUsd` / `maxTurns`、`settingSources: []` で完全分離、PreToolUse hook で `.env` 書き込み拒否。

**ファイル構成**:

```text
src/agent.ts
src/tools/   # 社内 API を包むツール
Dockerfile   # 非 root、--network none + proxy socket
```

**主要設定** (公式スニペットの組み合わせ、複合例):

```typescript
import { z } from "zod";
import { query, tool, createSdkMcpServer, InMemorySessionStore } from "@anthropic-ai/claude-agent-sdk";

const lookupTicket = tool(
  "lookup_ticket",
  "Look up an internal support ticket by id",
  { id: z.string().describe("Ticket id") },
  async (args) => {
    const r = await fetch(`https://support.internal/api/tickets/${args.id}`);
    return { content: [{ type: "text", text: await r.text() }] };
  }
);
const support = createSdkMcpServer({ name: "support", version: "1.0.0", tools: [lookupTicket] });

const Triage = z.object({
  ticket_id: z.string(),
  severity: z.enum(["low", "medium", "high"]),
  summary: z.string(),
  next_actions: z.array(z.string()),
});
const schema = z.toJSONSchema(Triage, { target: "draft-7" });

const store = new InMemorySessionStore(); // 本番では append/load を実装した自社ストア

try {
  for await (const message of query({
    prompt: "Triage ticket T-1234 and propose next actions",
    options: {
      settingSources: [],            // リポジトリや ~/.claude の設定を読まない
      mcpServers: { support },
      allowedTools: ["mcp__support__lookup_ticket", "Read", "Grep", "Glob"],
      outputFormat: { type: "json_schema", schema },
      sessionStore: store,
      maxTurns: 30,
      maxBudgetUsd: 5,
      env: { ...process.env, CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: "1" }, // TS の env は置換なので spread する
      hooks: {
        PreToolUse: [{ matcher: "Write|Edit", hooks: [async (input) => {
          const p = (input as any).tool_input?.file_path ?? "";
          return p.endsWith(".env")
            ? { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "no .env writes" } }
            : {};
        }] }],
      },
      canUseTool: async (toolName, input, { suggestions = [] }) => {
        const choice = await askUser(`Allow ${toolName}?`, ["once", "always", "no"]);
        if (choice === "always") {
          return { behavior: "allow", updatedInput: input,
                   updatedPermissions: suggestions.filter((s) => s.destination === "localSettings") };
        }
        if (choice === "once") return { behavior: "allow", updatedInput: input };
        return { behavior: "deny", message: "User declined" };
      },
    },
  })) {
    if (message.type === "result") {
      if (message.subtype === "success" && message.structured_output) {
        const parsed = Triage.safeParse(message.structured_output);
        if (parsed.success) console.log(parsed.data);
      } else {
        console.log(`Stopped: ${message.subtype}`);   // error_max_turns / error_max_budget_usd / error_max_structured_output_retries
      }
      console.log(`Cost: $${message.total_cost_usd.toFixed(4)}`);
    }
  }
} catch (error) {
  console.error(`Session ended with an error: ${error}`); // 単発 query() はエラー結果の後に throw する
}
```

Python では `env` はマージ、`output_format={"type": "json_schema", "schema": Model.model_json_schema()}`、`session_store=store`、`ClaudeSDKClient` で複数ターン。Python の `can_use_tool` をストリーミング入力と組み合わせる公式例は、ストリームを開いたままにするためのダミー `PreToolUse` hook (`{"continue_": True}` を返す) を「必須の回避策」として登録している。

**失敗モードと対策**:

- `canUseTool` が呼ばれない: allowedTools や mode で自動承認された呼び出しには来ない。毎回検査するなら PreToolUse hook。
- `canUseTool` が返らない: 許可プロンプトはタイムアウトしないので、`null` を返してよいのは自前チャネルで `control_response` を送った場合だけ (v2.1.199+)。長時間待つ場合は `Notification` hook の `permission_prompt` (約 6 秒待ちで発火) で通知する。
- `permissionMode` 省略時の開始モードが版で変わった (0.3.286 で auto 開始になり、0.3.302 でサードパーティプロバイダ / テレメトリ無効 / 新規インストールは default に戻った): 必ず明示する。
- `tools: []` は組み込みを全部消し MCP だけ残す。`allowedTools` は許可、`disallowedTools` の裸の名前は可用性を変える。この 3 つは別のレイヤーである。
- `AskUserQuestion` を `tools` で外すと Claude が質問できない。
- SDK の既定システムプロンプトは最小で `claude_code` preset の安全指示を含まない: 必要なら `systemPrompt: { type: 'preset', preset: 'claude_code', append: ... }`。
- resume 時の `total_cost_usd` は過去合計を含む: 合算すると二重計上。
- OTel の `console` exporter は stdout がメッセージチャネルなので使えない。
- 第三者製品で claude.ai ログインを提供することは禁止: API キー (または Bedrock / Agent Platform / Foundry / Claude Platform on AWS) で認証する。SDK は `.env` を読まない。

**コスト感**: API 従量、5 分 TTL (`CLAUDE_CODE_PROMPT_CACHE_TTL=1h` などで延長)。Max 5x / 20x と Team の月次 API クレジットはリンクした Console org のキーで動く SDK に効き、対話 Claude Code には効かない。セッション = サブプロセスで 1 GiB RAM / 5 GiB ディスク / 1 CPU が目安。

**サーフェスとプロバイダ**: 自社サーバー。Bedrock / Agent Platform / Foundry では `CLAUDE_CODE_USE_*` で切替。サンドボックスは `sandbox-runtime`、Docker (`--cap-drop ALL --read-only --network none` + proxy socket)、gVisor、Firecracker のいずれかで、資格情報はプロキシ側に置く。

#### (g) 自己改善スキル (skill-creator + claude plugin eval + /skill-doctor のループ)

**目的**: skill を「書いて終わり」にせず、呼ばれているか・効いているか・コンテキストを浪費していないかを計測し、改善と廃棄を回す。

**構成要素**: skill-creator plugin (対話的な evals/evals.json、ブラインド A/B、description チューニング) → `claude plugin eval` (隔離 `-p` 子プロセスで plugin あり/なしの 2 腕 ablation、CI 用 JSON と終了コード) → `/skill-doctor` (各 skill のコンテキストコストと呼び出し回数、未使用 skill の検出、v2.1.252+、feature-flag 取得が必要) → `/doctor prompt-audit` (古いモデル向け指示や矛盾の検出、v2.1.283+) → `claude plugin validate` (frontmatter の静的検査) → `skillOverrides` で可視性を絞る。

**ファイル構成**:

```text
.claude/skills/<name>/SKILL.md
evals/<case>/prompt.md
evals/<case>/graders/criteria.md
evals/<case>/graders/skill-fired.md
evals/<case>/case.yaml          # 任意
evals/mocks/<server>/<tool>.md  # MCP モック (任意)
```

**主要設定** (公式):

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

```yaml
schema_version: "1.1"
name: changelog-from-diff
tags: [smoke]
context:
  scaffold_script: fixture.sh
  add_dirs: [resources]
```

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

終了コードは 0 合格、1 しきい値未満 / ロードエラー / API エラー、2 部分実行 (コスト上限、認証)、130 中断、143 終了。skill-creator は `/plugin install skill-creator@claude-plugins-official` で入れ、`evaluate my summarize-changes skill with skill-creator` のように頼む。

**ループの回し方**:

1. skill なしで 3 シナリオを走らせ、失敗を記録する (ベースライン)。
2. 最小限の SKILL.md を書く (500 行以下、参照ファイルは 1 階層、決定論的処理はスクリプトに)。description は三人称で「何を・いつ」、`when_to_use` と合わせて 1,536 文字以内。
3. `claude plugin eval` で WITH / W/OUT / Δ を見る。`tool_used: Skill` grader は 2 腕では採点外 (`scored: false`) で、発火したかの指標にだけ使う。
4. `/skill-doctor` で呼ばれていない skill を見つけ (`/plugin` は 14 日かつ 10 セッション未使用の marketplace plugin を「Not used recently」にまとめる)、`skillOverrides` で `"name-only"` か `"off"` にする。
5. `/doctor prompt-audit` でモデル更新後に古くなった指示を刈る。

```json
{
  "skillOverrides": {
    "legacy-deploy": "name-only",
    "scratch-notes": "off"
  }
}
```

**失敗モードと対策**:

- eval は完全隔離 (一時 HOME、CLAUDE.md なし、他 plugin なし): 本番で CLAUDE.md に依存している skill は eval で動かない。依存を SKILL.md に内包する。
- Bash / Write / Edit / WebFetch は `--allow-tools` が必要で、Bash は OS サンドボックス内。
- LLM grader と baseline grader は 3 票中 2 票で判定し、各票がモデル呼び出し。`--max-cost-usd` を必ず付ける。
- skill-creator の `evals/evals.json` と `claude plugin eval` の `evals/<case>/` は互換性がない。
- frontmatter の YAML が壊れていると本文だけ読み込まれて `/name` は動くが自動発火しない: `claude plugin validate .claude/skills`。
- compaction 後は呼び出し済み skill 本文が先頭 5,000 トークンに切られる: 長い skill は手順の要点を冒頭に置く。
- skill 一覧の予算は context の 1%: 多すぎると呼ばれない skill の description から消える。`skillListingBudgetFraction` で上げるより、skill を減らす。

**コスト感**: eval 1 ケース = 3 回 × 2 腕 + grader 呼び出し。`--judge-model claude-haiku-4-5` で judge を安くする。`/skill-doctor` 自体はコストほぼゼロ。

**サーフェスとプロバイダ**: `claude plugin eval` は git 2.31+ がある環境。`/skill-doctor` は feature-flag 取得が必要なので Bedrock / Agent Platform / Foundry、`DISABLE_TELEMETRY` 環境、Remote Control 経由では使えない。

#### (h) 長時間タスク用ハーネス (/goal + 進捗ファイル + git をメモリにする + Stop hook)

**目的**: 数時間〜数日かかる実装・移行・実験を、compaction と中断と usage limit をまたいで完走させる。Anthropic の long-running harness (initializer / coding agent、`claude-progress.txt`、feature JSON) と scientific computing run (CLAUDE.md を編集可能な計画書に、CHANGELOG.md を lab notes に、git を記憶に) の知見を Claude Code の機構で再現する。

**構成要素**: `/goal` (prompt 型 Stop hook のラッパー、条件 4,000 文字まで、小型モデルが transcript だけ見て判定) + command 型 Stop hook (`stop_hook_active` ガード、未コミット変更があれば exit 2) + `SessionStart` の `matcher: "compact"` で進捗ファイルを再注入 + `PreCompact` で状態を退避 + `permissions.ask` による人間チェックポイント + auto mode + `autoContinueAtUsageLimit` + git コミットを記憶として使う CLAUDE.md 規約。

**ファイル構成**:

```text
CLAUDE.md                        # ASSUME INTERRUPTION 規約 (短く)
claude-progress.txt              # 何をやったか、次に何をするか
features.json                    # {id, description, passes} の一覧
.claude/settings.json            # hooks と ask ルール
.claude/hooks/stop-gate.sh
.claude/hooks/precompact-archive.sh
```

**主要設定**:

CLAUDE.md (例示。memory tool の公式プロトコルの考え方を転用):

```markdown
# Working protocol

ASSUME INTERRUPTION: context can reset at any moment. Before starting:
1. Read claude-progress.txt and features.json.
2. Run `git log --oneline -10` and the smoke test.
3. Pick ONE feature with passes: false, implement it, run its tests.
4. Commit with a message that states the feature id, then update claude-progress.txt.
Never mark a feature passes: true without test output in the transcript.

# Compact Instructions
When compacting, keep: the current feature id, the last failing test name, and any decision that changed the plan.
```

hooks と ask ルール (hooks-guide の Stop ガードと SessionStart compact 例、auto-mode-config の ask 例を組み合わせた複合例):

```json
{
  "permissions": {
    "ask": ["Bash(git push *)", "Bash(gh pr create *)"]
  },
  "hooks": {
    "Stop": [
      {
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-gate.sh", "args": [] }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          { "type": "command", "command": "cat \"$CLAUDE_PROJECT_DIR\"/claude-progress.txt; git log --oneline -5" }
        ]
      }
    ],
    "PreCompact": [
      {
        "hooks": [
          { "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/precompact-archive.sh", "args": [] }
        ]
      }
    ]
  }
}
```

```bash
#!/bin/bash
# .claude/hooks/stop-gate.sh
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop
fi
if [ -n "$(git status --porcelain)" ]; then
  echo 'Uncommitted changes remain. Commit before finishing.' >&2
  exit 2
fi
exit 0
```

`precompact-archive.sh` は stdin の JSON (`trigger` が `manual` / `auto`、`custom_instructions`) を読み、`transcript_path` と `claude-progress.txt` のコピーを日付付きで保存するだけの短いスクリプトにする (出力の `systemMessage` / `continue` は PreCompact では捨てられる。exit 2 で compaction を止められるが、回復 compaction を止めるとリクエストが失敗する)。

起動:

```text
/goal every entry in features.json has passes: true and `npm test` exits 0 (show the test output)
```

```bash
claude -p "/goal CHANGELOG.md has an entry for every PR merged this week" --output-format stream-json --verbose
```

無人で動かすときは auto mode (`--permission-mode auto`、対話では v2.1.283+ の既定) と組み合わせ、`autoContinueAtUsageLimit` (v2.1.234+、既定オン、最大 2 回連続で再アーム。`-p` とバックグラウンドセッションでは提供されない) に任せる。バックグラウンドで走らせるなら `claude --bg "..."` (agent view) か `claude --cloud "..."`。

**失敗モードと対策**:

- Stop hook は 8 回連続の継続で上書きされる (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`、ツール呼び出しでリセット): 「コミットしろ」のような 1 ターンで解消できる条件にする。
- `/goal` の評価モデルは transcript しか見ない: 条件に「確認方法」(テスト出力を表示する、など) を書く。ツールを数ターン使わないとゴールを保持したままループが止まる。
- 4 つの致命エラー (認証失敗、クレジット枯渇、解消できないコンテキスト溢れ、モデル不在) でゴールが解除される。他は 3 回リトライか一時停止。
- `paths:` rules とネスト CLAUDE.md、hook が入れた文脈は compaction で消える: 規約はルート CLAUDE.md に、動的状態は `SessionStart compact` で再注入。
- idle compaction が放置中に走る: 進捗ファイルが真実であり transcript は信用しない設計にしておけば問題ない。
- チェックイン (30 分 → 2 倍 → 4 倍、idle 時は 1 ゴール 3 回まで) とプロンプト提案は毎回フルコンテキストを再送する: `CLAUDE_CODE_GOAL_CHECKIN_MINUTES=0` と `promptSuggestionEnabled: false` で抑えられる。
- Haiku 5.5 で長く走らせると 100K トークン超で単価 5 倍: `/autocompact 100k`。
- 会話上の「push しないで」は消える: `permissions.ask` で固定する (上記)。

**コスト感**: サブスクリプションの枠内なら本線は 1 時間 TTL。1 時間以上の中断の後の compaction は履歴全体を非キャッシュで再読するので、離席前に `/compact` するか idle compaction に任せる。usage credits に入った瞬間 TTL が 5 分に落ちる (`promptCacheTtl: "1h"` で固定可)。

**サーフェスとプロバイダ**: ターミナル、agent view、クラウドセッション (`/goal` は resume の全経路で復元)、Desktop、Remote Control。Bedrock / Agent Platform では TTL が常に 5 分。

#### (i) 並列開発 (agent teams / worktrees / cross-session messaging)

**目的**: 複数の独立した変更を同時に進め、同じファイルを触らず、最後に統合する。

**構成要素の選択**。すべての並列化は「誰が計画を持ち、中間結果がどこに置かれるか」で決まる:

| 面 | 計画の持ち主 | 中間結果の置き場 | 分離 | 向く作業 |
|---|---|---|---|---|
| subagents / `context: fork` skills | Claude (本線のコンテキスト) | 本線に返る要約 | `isolation: worktree` で任意 | 調査、レビュー、1 ファイル規模の変更 |
| fork subagent (`/subtask`) | Claude (親のキャッシュを共有) | 本線に返る最終結果 | なし | 本線の文脈が要る小さな分岐 |
| agent teams | lead (共有タスクリストとメールボックス) | 各 teammate のコンテキスト | なし (teammate は worktree 分離されない) | 議論・分担が要る設計作業 |
| dynamic workflows | 再生可能なスクリプト | 変数 | `isolation: 'worktree'` オプション | 均質な大量作業 (16 同時、4,096 項目、1,000 agent、resume 可) |
| Projects (クラウド) | クラウドのコーディネータ (独自 MEMORY.md) | 各 thread | クラウド VM | 1 日 200 thread までの長期プロジェクト |
| agent view / `/batch` | あなた | 各セッション | worktree 分離を強制 | 独立したバグ修正や移行を 5〜30 本 |

**ファイル構成**:

```text
~/.claude/settings.json       # agent teams の有効化、teammateMode、cross-session の制御
.claude/agents/refactorer.md  # worktree 分離 subagent
.claude/settings.json         # worktree.baseRef、TeammateIdle / TaskCompleted のゲート hook
```

**主要設定** (公式):

```json
{
  "env": {
    "CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "1"
  },
  "teammateMode": "auto"
}
```

```markdown
---
name: refactorer
description: Applies mechanical refactors across many files
isolation: worktree
---

Apply the requested refactor across every affected file, then run the tests
and report the results.
```

team の品質ゲート (イベント名は公式。command の中身は例示):

```json
{
  "hooks": {
    "TaskCompleted": [
      { "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/require-tests.sh" } ] }
    ],
    "TeammateIdle": [
      { "hooks": [ { "type": "command", "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/idle-check.sh" } ] }
    ]
  }
}
```

exit 2 は TaskCompleted で完了をブロックし (stderr がモデルへ)、TeammateIdle でフィードバックを返して作業を続けさせる。

他セッションからのメッセージを制限する (managed 設定の公式例):

```json
{
  "permissions": {
    "deny": ["SendMessage", "ListAgents"]
  },
  "crossSessionInbound": "refuse",
  "isolatePeerMachines": true
}
```

`SendMessage` を deny すると subagent の resume と teammate 間メッセージも壊れる点に注意。通常は `crossSessionInbound: "hold"` (承認ダイアログ、`dialogExpiry` 既定 5 分) で十分。

agent view / worktree の CLI (公式の各形):

```bash
claude agents                          # open agent view
claude agents --json --all             # scripting interface
claude --bg "investigate the flaky SettingsChangeDetector test"
claude --agent code-reviewer --bg "address review comments on PR 1234"
claude --worktree feature-auth
claude --worktree "#1234"
claude attach <id|name>
claude stop <id>
```

**失敗モードと対策**:

- agent teams を有効にすると、Claude が名前を付けた subagent がすべて teammate になる: 不要な時は user 設定で `"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS": "0"`。
- teammate は worktree 分離されない: ファイルを書く teammate には worktree を使わせる (spawn プロンプトで指示) か、代わりに `isolation: worktree` の subagent か `/batch` を使う。
- worktree 分離は Edit / Write、コマンドの cwd、git のリダイレクト (`git -C`、`GIT_DIR` 等)、検証できないコマンド形状を止めるが、`cp` やシェルのリダイレクトでメインチェックアウトへ書くことは止めない。
- `isolation: worktree` の subagent は worktree ルートの CLAUDE.md を読まず、hook の `${CLAUDE_PROJECT_DIR}` も追従しない。
- plan 承認: teammate の plan approval は lead が無審査で承認する。承認が要る操作は hook か `permissions.ask` で。
- キャッシュ共有は model / effort / agent type / tools / schema / cwd が一致する兄弟だけ。teammate とワーカーは均質にし、Sonnet にする。
- in-process teammate は `/resume` や `/rewind` で復元されない。1 セッション 1 チーム、ネスト不可、lead 固定。
- dispatch された background セッションは確認なしでコミット・push・draft PR を行い、削除時に worktree ごと消える (`worktree.bgIsolation: "none"` で分離を無効化可)。

**コスト感**: plan mode の teammate は通常セッションの約 7 倍。3〜5 teammate、1 teammate 5〜6 タスク、終わったら shutdown。background セッションは対話と同じ速度で枠を消費する (10 並列は 10 倍)。workflow と teammate は 5 分 TTL (`subagentPromptCacheTtl: "1h"` で延長、書き込み単価は上がる)。

**サーフェスとプロバイダ**: agent teams は CLI のみ (SDK 非対応)。cross-session messaging は API キーやクラウドプロバイダでは同一マシン内のみ (v2.1.248+)、他マシンへは Remote Control と claude.ai サインインが必要。

### 14.4 評価と運用

#### テストの 4 層パイプライン

AI の仕組みは「プロンプトを書いたら終わり」ではなく、通常のソフトウェアと同じ検証パイプラインに乗せる。

| 層 | 道具 | 何を検証するか | 実行場所 |
|---|---|---|---|
| 静的 | `claude plugin validate <path> [--strict] [--json]` (v2.1.233+ でマニフェストなしディレクトリも)、`claude doctor` (端末、読み取り専用)、`/doctor prompt-audit` (v2.1.283+) | frontmatter、設定の無効エントリ、古いモデル向け指示、矛盾 | pre-commit、CI |
| 単体 | `claude plugin test` (mods、`*.test.ts`、5 秒/テスト、セッション不要) | mod のイベント処理、`.catch` の有無 (`gatingHooks` を `validate --json` で) | CI |
| 振る舞い (ablation) | `claude plugin eval` (v2.1.269+、隔離 HOME、plugin あり/なし 3 回ずつ、MCP モック) | skill が発火するか、効いているか、退行していないか | CI (夜間)、`--max-cost-usd` 必須 |
| ポリシー | `claude auto-mode defaults [--label ...]` / `config` / `critique`、`/skill-doctor`、`/context`、`/permissions` | 分類器ルールの効き、コンテキスト予算、実際に解決された権限 | 対話、棚卸し |

再現可能な単体ハーネスは `claude -p --bare --output-format json --json-schema` で、`system/init` の `plugin_errors` と `mcp_server_errors` (v2.1.219+、空なら省略) が非空なら CI を落とす。評価指標は pass@k (k 回中 1 回成功) と pass^k (k 回全部成功、1 試行 75% なら pass^3 ≈ 42%) を区別し、20〜50 タスク、インフラのノイズだけで 6 ポイント動く (Terminal-Bench 2.0 の公式知見) ことを前提に、3 ポイント未満の差を信用しない。

#### 観測: ID を配線すれば end-to-end で追える

| ID / 属性 | 出所 | 用途 |
|---|---|---|
| `session_id`、`prompt_id` | status line の stdin JSON、hook の入力、`-p --output-format json` | 1 プロンプトのコストを突合 (`prompt_id` は OTel の `prompt.id` と同じ) |
| `prompt_cache.last_miss_cause.causes[]` (`tools_changed`、`system_prompt_changed`、`ttl_expired_5m`、`likely_server_side`、v2.1.260+) | status line、`/usage` の `Prompt cache (main)` 行 | キャッシュミスの原因特定、回帰検知 |
| `claude_code.token.usage` / `claude_code.cost.usage` の `query_source` (main / subagent / auxiliary)、`speed`、`effort`、`skill.name` / `agent.name` / `plugin.name` / `mcp_server.name` | OTel メトリクス (`CLAUDE_CODE_ENABLE_TELEMETRY=1`、名前の伏せ字解除は `OTEL_LOG_TOOL_DETAILS=1`) | skill / subagent / plugin / MCP 単位の原価 |
| `workflow.run_id` (`wf_` 接頭辞)、`workflow.name` | OTel トレースのスパン属性 | workflow フェーズ単位の原価 |
| `TRACEPARENT` | Bash サブプロセスに継承。`-p` は呼び出し元の `TRACEPARENT` を読む | 外側のトレースにセッションを子として接続 |
| `x-claude-code-request-class` (main / subagent / workflow / compaction / auxiliary)、`x-claude-code-agent-type`、`x-claude-code-prompt-id` (v2.1.283+) | ゲートウェイのヒントヘッダ (v2.1.273+。直接接続では既定オン、カスタム base URL では `CLAUDE_CODE_GATEWAY_HINT_HEADERS=1`) | ゲートウェイ側でのルーティングと原価配賦 |
| `x-claude-code-agent-id`、`x-claude-code-parent-agent-id` | subagent の全 API 呼び出し | subagent ツリーの再構成 |

OTel のクイックスタート (公式):

```bash
export CLAUDE_CODE_ENABLE_TELEMETRY=1
export OTEL_METRICS_EXPORTER=otlp       # otlp, prometheus, console, none
export OTEL_LOGS_EXPORTER=otlp          # otlp, console, none
export OTEL_EXPORTER_OTLP_PROTOCOL=grpc
export OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
export OTEL_EXPORTER_OTLP_HEADERS="Authorization=Bearer your-token"
export OTEL_METRIC_EXPORT_INTERVAL=10000  # default: 60000 ms
export OTEL_LOGS_EXPORT_INTERVAL=5000     # default: 5000 ms
claude
```

OTEL exporter 系の env はリポジトリの `.claude/settings.json` からは無視され、managed 設定で配ると開発者側のエンドポイント指定を上書きする (v2.1.217+)。プロンプト本文、ツール入力、assistant 応答は既定で伏せられる (`OTEL_LOG_USER_PROMPTS` 等でオプトイン)。

#### コスト監視のチェックリスト (リクエストごとに「どのバケット・どのブレークポイントか」)

1. **誰の財布か**: サブスクリプション枠 (claude.ai ログイン) / usage credits / Console API キー / 月次 API クレジット (SDK と `-p` のみ) / クラウドプロバイダ。`/status` の Login method 行で確認。
2. **TTL**: 本線 1 時間 (サブスク枠内のみ) / それ以外 5 分。`promptCacheTtl`、`subagentPromptCacheTtl`。
3. **ブレークポイントを壊す操作**を冒頭に寄せたか (14.1 の表)。
4. **effort**: `maxEffortLevel` (スコープ横断で最も低い上限が勝つ)、`modelSettings.<model>.effortLevel` (v2.1.251+)。`CLAUDE_CODE_EFFORT_LEVEL` は `--effort` と `/effort` に勝つ。
5. **fast mode**: 枠に含まれず usage credits 直接課金、初回オン時に全コンテキストを非キャッシュで再読。使うならセッション開始時に `/fast on`。
6. **Haiku 5.5 の 100K 崖**: `/autocompact 100k`。
7. **subagent の結果**は本線に乗る: 要約を返させる、`model: haiku`。
8. **再送系**: プロンプト提案、ゴールのチェックイン、`/loop`、cross-session のメッセージはフルコンテキストを再送する。
9. **上限**: `--max-budget-usd` (推定、超過あり、subagent 込み、resume の過去分は含まない)、`--max-turns`、`maxBudgetUsd` (SDK、0 は拒否)。
10. **請求の真実ではない数字**: `/usage`、status line の `cost.total_cost_usd`、SDK の `total_cost_usd` はクライアント側の定価推定。契約レートは managed の `modelPricing` (v2.1.242+)。真実は Console / 管理画面と OTel。

#### セキュリティ: prompt injection、sandbox、最小権限

**prompt injection への多層防御**: Claude Code が既に行っていること (subagent の返却を v2.1.210+ でスキャンし、2.1.277 からヘッダ付きで「ユーザー権限なし」と明示; routine の `text` を `<routine-fire-payload>` で untrusted 化; WebFetch を別モデル呼び出しで要約; auto mode の分類器はツール結果を見ないがサーバー側の probe がツール結果を検査; cross-session メッセージは peer データ扱い) に、設計側で足すこと:

- チャット / webhook / channel の本文で直接ツールを動かさない。送信者 ID でゲートし、relay を宣言するのは認証済み送信者だけ。
- 「読む対象」と「書ける対象」を分ける: `Read(./.env)` などの deny は Edit / Write も止め (v2.1.208+)、Grep / Glob / @ 参照にも効く (v2.1.290+)。
- 破壊的操作は `permissions.ask` に固定し、会話上の約束に頼らない。
- 信頼できないリポジトリの `-p` は `--bare`。

**sandbox の二層**: ファイルシステム分離だけでも、ネットワーク分離だけでも、インジェクトされたエージェントは脱出か持ち出しができる (How we contain Claude)。Claude Code の組み込み sandbox は Bash / PowerShell / Monitor だけを包み、ファイルツール、MCP サーバー、hooks、LSP、`!` シェルモードは外で動く。管理者が固定するには managed 設定で:

```json
{
  "sandbox": {
    "enabled": true,
    "failIfUnavailable": true,
    "allowUnsandboxedCommands": false
  }
}
```

`failIfUnavailable` が無いと、起動できない環境では黙って非サンドボックスになる。`allowUnsandboxedCommands: false` を managed / `--settings` に置くと admin-required になり、リポジトリ側の `excludedCommands` / `allowedDomains` / `allowWrite` は無視される (v2.1.285+)。プロセス全体を包むなら `@anthropic-ai/sandbox-runtime`、dev container、VM。`--dangerously-skip-permissions` は必ずコンテナ / VM / sandbox runtime の中で非 root で。

**最小権限の道具箱**:

| 道具 | 効果 |
|---|---|
| `--restricted` / `CLAUDE_CODE_RESTRICTED=1` (v2.1.248+) | コマンド実行系ツールと WebFetch を外し、ファイルツールを作業ディレクトリに閉じ、managed と `--settings` だけ読み、bypass を拒否。評価ハーネス向け |
| `--tools` / `--disallowedTools "mcp__*"` | 組み込みツールの可用性 / MCP ツールの除去 (`--tools` は MCP に効かない) |
| `--allowedTools "Bash(npm test)" "Read"` + `--permission-mode dontAsk` | 完全な allowlist 運用 |
| `--permission-prompts none` (v2.1.259+) | 誰も答えられないことを明示し、プロンプトは拒否、`AskUserQuestion` を除去 |
| `permissions.blockReadsOutsideWorkingDirectories: true` (v2.1.257+) | bypass でも作業ディレクトリ外の読み取りを拒否。どのファイルからでもオンにでき、オフにはできない |
| `CLAUDE_CODE_SUBPROCESS_ENV_SCRUB=1` | 子プロセスから `ANTHROPIC_API_KEY`、`AWS_SECRET_ACCESS_KEY`、資格情報らしき名前と値を除去 (`GITHUB_TOKEN` は残す) |
| `sandbox.credentials` の `deny` / `mask` | 資格情報ファイルと env を隠す、または proxy の egress で差し替え |
| `allowManagedPermissionRulesOnly` / `allowManagedHooksOnly` / `allowManagedModsOnly` | リポジトリやユーザー側の緩和を無効化 |
| `claude.ai` 以外の認証では connectors / artifacts が無い | 意図せず claude.ai に接続させたくない CI では API キーで固定 |

**feature-flag と非必須トラフィックは別の軸**: `DISABLE_TELEMETRY`、`DO_NOT_TRACK`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、`DISABLE_GROWTHBOOK`、非 Anthropic の `ANTHROPIC_BASE_URL`、Bedrock / Agent Platform / Foundry、apps gateway は feature-flag 取得を止め、advisor、idle compaction、`/import`、`/skill-doctor`、artifact のコメント、全画面既定、貼り付けテキストの標識、無効スキーマ MCP ツールの除外、Remote Control などを無言で落とす。インストール直後の最初のセッション (= 毎回クリーンな CI コンテナ) も同じ状態である。プライバシー強化した環境では `permissions.defaultMode` か `--permission-mode` を固定する。

#### 名称変更・廃止の対応表

| 旧 | 新 / 状態 |
|---|---|
| `claude project purge` | `claude purge` (v2.1.288) |
| `TaskOutput` ツール | 削除 (2.1.277)。deny ルールに書いても警告の対象外 |
| TypeScript SDK の `unstable_v2_*` セッション API | 削除 (0.3.142)。`query()` + ストリーミング入力か `resume` |
| `includeCoAuthoredBy` | `attribution` (`{commit, pr, sessionUrl}` または `false`、v2.1.281+)。旧版は `false` を拒否して設定ファイルごとスキップするので共有ファイルでは `""` を使う |
| `teammateDefaultModel` | 削除 (2.1.234)。spawn プロンプト / 定義 / `CLAUDE_CODE_SUBAGENT_MODEL` |
| SessionEnd の `bypass_permissions_disabled` matcher | 削除 (2.1.234) |
| `confirm:toggleExplanation` キーバインド | 削除 (2.1.257) |
| `disableArtifact: true` | 非推奨。`enableArtifact: false` |
| `additionalMarketplaces` / `allowedMarketplaces` | `extraKnownMarketplaces` / `strictKnownMarketplaces` のエイリアス |
| MCP `sse` トランスポート | 非推奨。`http` (v2.1.265+ で自動フォールバック) |
| `context-1m-2025-08-07` beta | 引退。1M がネイティブなモデルか `[1m]` 接尾辞 |
| `ANTHROPIC_SMALL_FAST_MODEL` | 非推奨。`ANTHROPIC_DEFAULT_HAIKU_MODEL` |
| 「Vertex AI」 | 「Google Cloud's Agent Platform」。env は `VERTEX` 綴りのまま |
| `/review` (単発 PR レビュー) | `/code-review` のエイリアス (v2.1.223+) |

### 14.5 中級者から上級者へのロードマップ

各段階は「身につけること」と「作って残す成果物」の対で定義する。次の段階に進む条件は、前段の成果物が 1 か月以上使われ続けていることである。

| 段階 | 身につけること | 作る成果物 | 判定 |
|---|---|---|---|
| 1. 文脈の管理者 | CLAUDE.md を 200 行以下に刈る、`/clear` と `/compact <指示>` と `/btw` の使い分け、`/context` で何が乗っているか読む、`paths:` rules、auto memory の仕組み | 200 行以下のルート CLAUDE.md、3 本以内の rules、`/doctor prompt-audit` をクリアした状態 | `/usage` のキャッシュヒット率が安定している |
| 2. 境界の設計者 | permissions の deny → ask → allow、Bash ルールが文字列マッチであること、PreToolUse hook と `onFailure: "block"`、sandbox の守備範囲、`-p` の権限ベースライン | 人間チェックポイント (`permissions.ask`) と fail-closed の guardrail hook、CI 用の `--bare` + allowlist スクリプト | 会話で「やらないで」と言う回数がゼロになる |
| 3. 委譲の設計者 | subagent の description 駆動、`context: fork`、読み取り専用 reviewer、検証の梯子 (prompt → `/goal` → Stop hook → 敵対的 review)、Stop hook の 8 回上限 | security-reviewer subagent、Stop ゲート、`/goal` テンプレート、進捗ファイル規約 (ブループリント h) | 長時間タスクを人が見ずに完走させられる |
| 4. 配布者 | plugin の構造 (置換 / 追加 / マージ)、marketplace、`claude plugin validate` / `eval`、`/skill-doctor`、organization の managed 設定 | チームの plugin 1 本 (skills + hooks + agent)、eval スイート、CI の eval ジョブ (ブループリント g) | eval の Δ が正で、未使用 skill が 0 |
| 5. ハーネスの設計者 | dynamic workflows の API と resume 意味論、Agent SDK のホスティング (SessionStore、canUseTool、sandbox)、agent teams の限界、OTel で ID を配線する、feature-flag と資格情報の軸 | リサーチ / ドキュメント生成 workflow (b, c)、社内 SDK ツール (f)、並列開発の運用ルール (i)、OTel ダッシュボード | skill / subagent / workflow 単位の原価が言える |

段階を飛ばさないことが重要である。段階 2 を飛ばして段階 5 に進むと、prompt injection と権限の設計が「会話上の約束」に依存した仕組みができあがる。逆に段階 3 までで十分な現場も多い。plugin や SDK は「他人にも使わせる」「別のプロセスから呼ぶ」必要が出てから着手すればよい。

最後に、本ガイド全体を貫く一文を再掲する。Claude Code における設計とは、コンテキストウィンドウという唯一の予算を、何をいつ乗せ、何を hooks と permissions に移し、何を subagent や workflow の外側に追い出すかで配分することである。本章の表とブループリントは、その配分を毎回ゼロから考えずに済ませるための雛形である。

### 出典

- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/claude-directory
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/managed-settings
- https://code.claude.com/docs/en/permissions
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/auto-mode-config
- https://code.claude.com/docs/en/sandboxing
- https://code.claude.com/docs/en/sandbox-environments
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/hooks-guide
- https://code.claude.com/docs/en/skills
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/agent-teams
- https://code.claude.com/docs/en/worktrees
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/cross-session-messaging
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/goal
- https://code.claude.com/docs/en/scheduled-tasks
- https://code.claude.com/docs/en/routines
- https://platform.claude.com/docs/en/api/claude-code/routines-fire
- https://code.claude.com/docs/en/channels
- https://code.claude.com/docs/en/channels-reference
- https://code.claude.com/docs/en/desktop-scheduled-tasks
- https://code.claude.com/docs/en/mcp
- https://code.claude.com/docs/en/plugins
- https://code.claude.com/docs/en/plugins/mods/overview
- https://code.claude.com/docs/en/plugin-evals
- https://code.claude.com/docs/en/output-styles
- https://code.claude.com/docs/en/headless
- https://code.claude.com/docs/en/cli-reference
- https://code.claude.com/docs/en/github-actions
- https://code.claude.com/docs/en/code-review-pull-requests
- https://code.claude.com/docs/en/code-review-customize
- https://code.claude.com/docs/en/ultrareview
- https://code.claude.com/docs/en/cloud-environments
- https://code.claude.com/docs/en/claude-code-on-the-web
- https://code.claude.com/docs/en/agent-sdk/overview
- https://code.claude.com/docs/en/agent-sdk/agent-loop
- https://code.claude.com/docs/en/agent-sdk/custom-tools
- https://code.claude.com/docs/en/agent-sdk/user-input
- https://code.claude.com/docs/en/agent-sdk/structured-outputs
- https://code.claude.com/docs/en/agent-sdk/session-storage
- https://code.claude.com/docs/en/agent-sdk/subagents
- https://code.claude.com/docs/en/agent-sdk/hosting
- https://code.claude.com/docs/en/agent-sdk/secure-deployment
- https://code.claude.com/docs/en/monitoring-usage
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/llm-gateway-protocol
- https://code.claude.com/docs/en/costs
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/env-vars
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/feature-availability
- https://code.claude.com/docs/en/best-practices
- https://code.claude.com/docs/en/changelog
- https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/engineering/multi-agent-research-system
- https://www.anthropic.com/engineering/how-we-contain-claude


---

## 第15章 追補: 取りこぼしがちな機能と周辺エコシステム

本章は、第1章から第13章の本編で扱いきれなかった機能と周辺エコシステムをトピック別にまとめる追補である。各トピックは「何か」「中級者以上がいつ使うか」「正確なコマンド・設定」「制限と落とし穴」「公式 URL」の順に記す。本編で詳述済みの事項(設定ファイルの5段階優先順位、compaction で生き残るもの、プロンプトキャッシュの TTL、`--bare` の基本、`claude plugin eval` の採点など)は繰り返さず、必要な箇所で章番号を参照するにとどめる。バージョン表記は公式ドキュメントの記載をそのまま引用し、第三者情報にのみ依拠する箇所は (未検証) と明示する。

### 15.1 CLI からの Claude in Chrome(`claude-in-chrome` MCP サーバー)

ブラウザ操作は組み込み MCP サーバー `claude-in-chrome` として提供され、独自の権限モデルを持つ。フォーム入力や console ログの読み取り、ログイン済みサイトでの E2E 確認に使う。

- 有効化: セッション単位は `claude --chrome` / `--no-chrome`。`/chrome` で状態確認・権限管理・再接続・ブラウザ選択ができ、「Enabled by default」を選ぶと `~/.claude.json` に `claudeInChromeDefaultEnabled: true` が書かれる(settings.json では無視)。この設定は VS Code と共有で、v2.1.287+ では VS Code セッションも起動時に接続する。
- 優先順位: `--chrome`/`--no-chrome` > `CLAUDE_CODE_ENABLE_CFC`(`1`/`0`)> `claudeInChromeDefaultEnabled`。`CLAUDE_CODE_ENABLE_CFC=1` は project/local settings では無視され、警告 `Claude Code ignored CLAUDE_CODE_ENABLE_CFC in this project's settings: a project can't turn on Claude in Chrome. To turn it on yourself, run /chrome or start with --chrome.` が出る。リポジトリ側からブラウザを有効化することはできない。
- 認証要件: `/login` の claude.ai 認証が必須。API キーや `claude setup-token` のセッションでは v2.1.216 以降 `--chrome` を渡しても黙って無効のまま(それ以前は接続のたびに 403)。Bedrock / Agent Platform / Foundry では利用不可。拡張機能は Claude Code と同じ claude.ai 組織にサインインしていなければ `Browser extension is not connected` になる(`/status` の Organization で確認)。
- 組織ポリシー: `deniedMcpServers` に `{ "serverName": "claude-in-chrome" }` を置くか、`managed-mcp.json` を配布して `allowClaudeInChromeWithManagedMcp: true` を付けないと、インストールプロンプトが抑止され `claude --chrome` は起動時に終了する。この許可キー(v2.1.282+)はデバイス側の managed ソース(MDM plist / HKLM / システムの managed-settings.json)からしか読まれず、server-managed settings では配れない。deny エントリは許可キーより常に優先。
- 権限の挙動: auto mode では分類器が承認したブラウザ呼び出しについて拡張機能のサイト別チェックをスキップする(permission rules でサイトを deny している場合を除く)。plan mode では GIF 録画・新規タブ・ショートカット実行の前に確認が出て、`createIfEmpty` 付きの `tabs_context_mcp` と、それらを含む `browser_batch` も確認対象になる。
- アップロード(v2.1.211+): 1回あたり合計 10 MB、複数ハードリンクを持つファイル(`node_modules` 内に多い)は拒否、v2.1.293+ では `.env`・`.pem`・`.key`・`.ssh` 配下など資格情報名のファイルも拒否。Read 権限の deny はアップロードも止める。
- コンテキストコスト: 既定有効にするとブラウザツールと説明が毎セッション読み込まれる。埋め込みホスト向けに `CLAUDE_CODE_DISABLE_CFC_PROMPT=1`(v2.1.257+)でシステムプロンプト節と `/claude-in-chrome` バンドルスキルだけを外せる。
- `/claude-in-chrome [task]` はブラウザ作業を依頼するバンドルスキル。
- ネイティブメッセージングホスト: 初回有効化時に設定ファイルを書き、Chrome は起動時にしか読まないため初回は Chrome 再起動が必要。パスは macOS `~/Library/Application Support/Google/Chrome/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json`、Linux `~/.config/google-chrome/NativeMessagingHosts/...`、Windows `HKCU\Software\Google\Chrome\NativeMessagingHosts\`(Edge / Brave は各ブラウザのディレクトリ)。
- ネットワーク: 拡張機能の WebSocket ブリッジは `bridge.claudeusercontent.com`。組織の IP 許可リストを使う場合、`claude.ai` / `api.anthropic.com` と同じプロキシ egress に載せないと、他は動くのにブラウザだけ接続できない。
- タブグループ: `/clear` でセッションのグループを閉じる(生き残る作業がある場合を除く)。`/resume` や終了時は空の新規タブしかなければ閉じる。

公式: https://code.claude.com/docs/en/chrome 、https://code.claude.com/docs/en/managed-mcp 、https://code.claude.com/docs/en/network-config

### 15.2 CLI の Computer use と Desktop の iOS Simulator ペイン

Computer use は macOS 向け research preview で、Claude がスクリーンショットを撮りデスクトップアプリを操作する。MCP も Bash もブラウザも使えない GUI 作業にだけ使う。Claude の選択順は MCP サーバー > Bash > Claude in Chrome > computer use で、Desktop では simulator 作業に iOS Simulator ペインが computer use より前に入る。

- 可用性: macOS のみ、Pro/Max のみ(Team/Enterprise 不可)、対話セッションのみ(`-p` 不可)、claude.ai 認証のみ。`/mcp` > `computer-use` > Enable でプロジェクト単位に有効化(条件を満たさないと `/mcp` に現れない)。Accessibility と Screen Recording の許可が必要で、後者は付与後に Claude Code の再起動が要ることがある。
- 承認: アプリごと・セッションごとに承認し、ターミナル/IDE は「シェルアクセス相当」、Finder は「任意ファイルの読み書き」、System Settings は「システム設定変更」として警告される。階層は固定で、ブラウザと取引プラットフォームは閲覧のみ、ターミナル/IDE はクリックのみ、それ以外はフル操作。Dispatch 起動セッションでは承認が 30 分で失効する。
- ロックと表示: 1 セッションがロックを持ち、セッション終了まで解放されない(別セッションは `Computer use is in use by another Claude session`)。他アプリは隠され、ターミナルはスクリーンショットから除外。スクリーンショットは常に縮小され(3456x2234 は約 1372x887)、変更する設定はない。`Esc` はどこからでも中断し、キー入力は消費されるためプロンプトインジェクションでダイアログを閉じることに使えない。
- iOS Simulator ペイン(public beta、macOS、Desktop v1.24012.0+、Xcode 必須、ローカルセッションのみ): computer use を使わずにシミュレータを操作する。同意はデバイスごとに一度、1 セッション最大 4 ペイン、終了・アーカイブ・デタッチ後 10 分で自動シャットダウン(外部で起動したデバイスは対象外)。URL を開く操作と `xcodebuild` は同意ではなくセッションの permission mode に従う。スクリーンショットは通常の保持ポリシーで Anthropic に送られる。組織制御は managed の `disableMobileSimulatorTools: true`(JSON boolean のみ、ペインは手動操作可)と Claude Desktop 側ポリシーの `requireCoworkFullVmSandbox`(ペインごと無効)。

公式: https://code.claude.com/docs/en/computer-use 、https://code.claude.com/docs/en/desktop-ios-simulator 、https://code.claude.com/docs/en/feature-availability

### 15.3 Claude Code Desktop というサーフェス

Desktop は CLI と同じ設定ファイルを読むが、挙動が分かれる点が多い。ローカル / クラウド / SSH / WSL の 4 種のセッション、アプリ内ブラウザ、`.claude/launch.json` によるプレビュー、Dispatch、scheduled tasks を提供する。

- permission mode: `dontAsk` は CLI 専用。セレクタで選んだモードはフォルダごとに記憶され `permissions.defaultMode` に勝つ(Plan だけは当該セッション限り)。クラウドセッションは Accept edits / Plan / Auto のみで Accept edits の実体は `default`、Bypass はセルフホスト環境を含むクラウドで使えない。
- セッション種別の欠落: `@` メンションはクラウドと WSL で不可、プラグインもクラウドと WSL で不可。WSL はさらに統合ターミナル・コネクタ・フォーク・ファイルペインを欠く。`/resume` で CLI セッションを再開できるのはローカルのみ。
- 環境変数: macOS で Dock/Finder から起動すると、シェルプロファイルからは `PATH` と Claude Code の固定変数しか取り込まない。Windows は PowerShell プロファイルを読まない。
- SSH セッション: `~/.claude/skills/` はリモートホストのものを読む。プロキシや CA はリモートの `~/.claude/settings.json` の `env` に置き、CA は `NODE_EXTRA_CA_CERTS` を使う(`SSL_CERT_FILE` は信頼されない)。SSH の転送はすべて強制オフ、ヘルパーは `~/.claude/remote/` 配下(`noexec` 不可)。Desktop v2.31226.0+ では切断後もタスクは続くが、Claude アカウントのサインインは接続中しか更新されないため、夜通しのタスクは数分で止まり得る。クラウドセッションを使う。
- アプリ内 Browser ペイン: クリーンプロファイルで、サイトごと(サブドメインも別)に Allow once / Always allow / Deny。外部ページへの書き込み操作(クリック・入力)は全モードで安全分類器が審査し、フラグが立てば mode に関係なく確認が出る。Auto/Bypass 以外ではさらにドメイン許可リスト確認がある。ログイン済み ID が必要なら Chrome 拡張を使う。
- Desktop 専用 managed キー(CLI は無視): `disableBrowserExternalNavigation`(`true`)、`browserExternalPageTools: "disabled"`、`disableDesktopLocalSessions`(`true`、Desktop v1.37937.0+)、`sshHostAllowlist`(パターン配列、`[]` で SSH 無効、`*.example.com` は apex にも一致)、`disableMobileSimulatorTools`、`disableSshSavedPasswords`、`sshConfigs`。boolean キーは JSON の `true` のみ受け付け、`"true"` や `1` は警告付きで無視。`worktree.location` はリモート側 `~/.claude/settings.json` の user キー(Desktop v1.44121.0+)。
- 落とし穴: サードパーティ配備の Desktop 端末に初めて admin ソースのキーを配ると、Desktop 由来の親ポリシー(egress 許可リストやサンドボックス)が `parentSettingsBehavior: "merge"` なしには適用されなくなる。ローカルセッションでは `claude_desktop_config.json` の MCP 定義が同名の `~/.claude.json`/`.mcp.json` に勝ち、user スコープの stdio サーバーが `.mcp.json` に勝つ(CLI の順位と逆)。
- `.claude/launch.json`(コメント付き JSON 可):

```json
{
  "version": "0.0.1",
  "configurations": [
    {
      "name": "my-app",
      "runtimeExecutable": "npm",
      "runtimeArgs": ["run", "dev"],
      "port": 3000
    }
  ]
}
```

  各エントリは `name` / `runtimeExecutable` / `runtimeArgs` / `port`(既定 3000)/ `cwd`(`${workspaceFolder}`)/ `env` / `autoPort` / `program` / `args` / `url`。`env` はコミットされるため秘密を置かず、Desktop のローカル環境エディタを使う。トップレベル `"autoVerify": false` で自動検証を止める。
- Dispatch は Pro/Max のみ。Desktop scheduled tasks はアプリが起動中かつ覚醒時のみ動き(最小 1 分)、見逃した枠は直近 1 回だけ 7 日以内に追いつき実行、プロンプトは `~/.claude/scheduled-tasks/<task-name>/SKILL.md`、`requiresUserInteraction` ツールは毎回停止する(第5章参照)。
- `/desktop` と `claude --desktop [--continue|--resume <id>]`(v2.1.285+)で CLI から Desktop に引き継げる。Desktop では `/permissions` のようなダイアログ系コマンドが使えず、`/config` は引数を無視する。

公式: https://code.claude.com/docs/en/desktop 、https://code.claude.com/docs/en/desktop-wsl 、https://code.claude.com/docs/en/desktop-scheduled-tasks 、https://code.claude.com/docs/en/settings-reference

### 15.4 出力サーフェスとしての Artifacts

Artifacts は Claude Code が claude.ai 上に公開する単一ページで、レポート・ダッシュボード・コネクタ連携ページ・コメント経由の往復に使う。本編では `enableArtifact` と scratchpad のみ触れたので、ここで可用性と制約をまとめる。

- 可用性(すべて必要): Pro/Max/Team/Enterprise、`/login`(API キー・ゲートウェイトークン・クラウド資格情報では公開不可)、Anthropic API 直結、CMEK/HIPAA/ZDR でないこと、CLI か Desktop ≥1.13576.0、Claude Tag、または自分で始めた `claude remote-control` セッション(v2.1.281+)。Agent SDK・GitHub Action・MCP サーバー文脈・自分の端末からの `-p`・`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 下では既定オフ。
- 無効化: `/config`、`"enableArtifact": false`(非推奨の `"disableArtifact": true` も可)、`CLAUDE_CODE_DISABLE_ARTIFACT=1`、`permissions.deny` の `Artifact`。どのファイルからでもオフにできるが、オンに戻せるファイルはない(project の `true` は再有効化しない。project/local の `false` は v2.1.242 から有効)。
- 公開前に確認が出る場面: plan mode(アーティファクトごと初回)、runtime capabilities 宣言時、公開リンク(会話ごと一度)、scheduled task のターン、Claude が承認なしに読めないファイル(`Artifact` の allow rule があっても省略されない)、Manual/acceptEdits でのインラインファイル編集。
- `/artifacts`(v2.1.208+): `Enter` で添付または開く(添付は v2.1.216 から)、`o` で開く、`c` でリンクコピー。`Ctrl+]` で最新を再表示、`CLAUDE_CODE_ARTIFACT_AUTO_OPEN=0` で自動オープン停止。Remote Control からの操作ではセッション側マシンにタブは開かない。
- コネクタ連携ページ(v2.1.209+): ページは閲覧者自身のコネクタで動き、閲覧者ごとに許可を求める。ローカル `.mcp.json` のサーバーはページから呼べない。組織トグルは Organization settings > Capabilities の「Enable artifact connectors」。v2.1.265+ では宣言ツール名が一つも一致しない公開を拒否する。
- コメント: 読み取り v2.1.221、自動 watch と返信 v2.1.228(feature-flag 取得が必要)。1 アーティファクトあたり 1 時間に 60 件を処理すると自動返信を一時停止。`/tasks` の System tasks 行で停止でき resume 後も維持、`Ctrl+X Ctrl+K` を 3 秒以内に 2 回でセッションの自動返信をすべて不可逆に止める。`CLAUDE_CODE_ARTIFACT_COMMENTS=0`、`CLAUDE_CODE_ARTIFACT_COMMENTS_AUTOREACT=0`。
- ページ制約: 厳格 CSP の単一ページ。スクリプトは cdnjs / unpkg / Tailwind CDN / jQuery CDN / jsDelivr の `/npm/` 系のみ、フォントは Google Fonts のみ、外部画像不可、fetch/XHR/WebSocket は自オリジンと Google Fonts のみ、バックエンドなし、自発ダウンロード不可、相対リンク不解決。ファイルは `.html`/`.htm`/`.md` の UTF-8(BOM 付き UTF-16LE 可)で U+FFFD 不可、ネットワーク共有パス不可、描画後 16 MiB 以下。閲覧者は `*.claudeusercontent.com` から読み、CLI は `*.frame.claudeusercontent.com` からアーティファクトを読む。
- デザインの優先順位: プロンプト > プロジェクトのデザインシステム(CLAUDE.md のトークンやテーマファイル) > Claude 自身のパレット。
- `/slides [brief]` と `/design [brief]`(v2.1.265+)は Claude Slides / Design アーティファクトを作る。テンプレートは beta で Pro/Max/Team は既定オン、Enterprise は Owner が Organization settings > Artifacts で切替。Claude Docs は `/mcp` に `claude.ai Claude Docs` コネクタとして現れる。`/artifact-capabilities` と `/artifact-diagramming`(v2.1.221+)もバンドルスキル。
- 他者のアーティファクト読み取り: WebFetch 風の要約で、クラウドセッションのネットワーク無し・他組織の公開物(auto でも確認、bypassPermissions では不可、feature flag 必須)・plan mode の同組織物で確認が出る。
- 組織制御: Artifacts トグル(Enterprise はロール別)、External sharing トグル(既定オフ、オフにすると既存の公開リンクも止まる)、private/shared 別の保持期間、監査イベント `claude_artifact_*`、Compliance API(Enterprise)`GET /v1/compliance/code/artifacts`、`GET /v1/compliance/code/artifacts/{artifact_id}/versions/{version_id}`、`DELETE /v1/compliance/code/artifacts/{artifact_id}`。

公式: https://code.claude.com/docs/en/artifacts 、https://code.claude.com/docs/en/commands 、https://code.claude.com/docs/en/network-config 、https://code.claude.com/docs/en/zero-data-retention

### 15.5 ステータスライン: stdin スキーマ、更新契機、`subagentStatusLine`、`footerLinksRegexes`

本編ではキャッシュと rate limit のフィールドにしか触れなかった。ここが完全リファレンスである。

- 設定: `statusLine { "type": "command", "command": "...", "padding": 0, "refreshInterval": N(秒、最小 1), "hideVimModeIndicator": bool }`。終了コード 0 のときだけ出力が表示される。`/statusline <説明>` が `~/.claude/` にスクリプトを生成し、引数なしならシェルプロンプトから自動構成。Windows は Git Bash があればそれ、なければ PowerShell(パスはスラッシュ区切り)。
- stdin JSON の主要フィールド: `cwd`、`session_id`、`session_name`、`prompt_id`(OTel の `prompt.id` と一致)、`transcript_path`、`model.{id,display_name}`、`workspace.{current_dir,project_dir,added_dirs,git_worktree,repo.{host,owner,name}}`、`version`、`output_style.name`、`cost.{total_cost_usd,total_duration_ms,total_api_duration_ms,total_lines_added,total_lines_removed}`、`context_window.{total_input_tokens,total_output_tokens,context_window_size,used_percentage,remaining_percentage,current_usage}`、`exceeds_200k_tokens`、`prompt_cache`、`fast_mode`、`effort.level`、`thinking.enabled`、`rate_limits.{five_hour,seven_day,spend_limit}`、`vim.mode`、`agent.name`、`pr.{number,url,review_state,kind}`、`worktree.{name,path,branch,original_cwd,original_branch}`。`used_percentage` は入力トークン(input + cache_creation + cache_read)だけで出力を含まず、`current_usage` は初回呼び出し前と `/compact` 直後は null。`cost.total_cost_usd` は v2.1.211+ で `/clear` にリセットされ managed の `modelPricing` に従う。`rate_limits` は Pro/Max かゲートウェイ spend limit がある場合だけで `resets_at` 経過後に消える。`spend_limit` の `used_usd`/`limit_usd`/`period` は v2.1.284+ の両側対応が必要で、約 5 分遅れ、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` 下では存在しない。
- `prompt_cache`(v2.1.251+、メイン会話のみ): `warm`、`caching_observed`、`ttl`、`expires_at`、`requests`、`misses`、`expected_rebuilds`、`hit_ratio`、`cache_write_tokens`、`miss_recache_tokens`、`last_miss_at`、`last_miss_cause.{causes[],tools_added,tools_removed,system_char_delta}`(v2.1.260+)、`miss_causes`、`recache_tokens_if_cold`。`causes` の値は `tools_changed`、`system_prompt_changed`、`ttl_expired_5m`、`likely_server_side` など。
- 再実行の契機: セッション開始/再開、アシスタントメッセージ、`/compact`、mode 変更、vim 切替、`command` の変更(デバウンスなし)、`refreshInterval`、rate limit の `resets_at`、キャッシュの `expires_at`。300 ms デバウンスで、実行中に次の更新が来るとキャンセルされる。端末幅は `COLUMNS`/`LINES`(`tput cols` は失敗する)。カスタムステータスラインはフッターのヒントを隠す。サブプロセス環境には `CLAUDECODE=1` と `CLAUDE_CODE_CHILD_SESSION=1`。
- ゲート: managed の `disableAllHooks` か未信頼フォルダでオフ。`allowManagedHooksOnly`、非 managed の `disableAllHooks`、`--safe-mode` では managed 値だけが動き、自分の値は警告なしにスキップされる。
- `subagentStatusLine`: 更新ティックごとに `columns` と `tasks[]` を含む 1 つの JSON を受け取り、上書きしたい行ごとに `{"id": "<task id>", "content": "<row body>"}` を 1 行ずつ出す。`id` を省けば既定描画、`content` が空なら非表示。task フィールドは `id`、`name`、`type`(`local_agent`)、`agentType`(v2.1.293+)、`status`、`description`、`label`、`startTime`、`model`、`effort`(設定値)、`contextWindowSize`、`tokenCount`、`tokenSamples`(直近 16)、`cwd`。ゲートは `statusLine` と同じで、プラグイン提供の値は `allowManagedHooksOnly` 下では動かない。
- `footerLinksRegexes`(user または managed): `{ "type": "regex", "pattern": "\\b(?<key>PROJ-\\d+)\\b", "url": "https://issues.example.com/browse/{key}", "label": "{key}" }` の配列。URL はテンプレートと同一オリジン、2048 文字以下、https/http か登録済みエディタの deep-link スキーム。ラベル 28 桁、最大 5 バッジ、`/clear` で消える。正規表現はメインスレッドで動くので `(a+)+$` のような入れ子量指定子はセッションを固める。

公式: https://code.claude.com/docs/en/statusline 、https://code.claude.com/docs/en/settings-reference 、https://code.claude.com/docs/en/prompt-caching

### 15.6 キーバインドファイル(`~/.claude/keybindings.json`)

`/keybindings` で作成・編集でき、ホットリロードされる。グローバル専用でプロジェクト単位のキーバインドはない。

```json
{
  "$schema": "https://www.schemastore.org/claude-code-keybindings.json",
  "bindings": [
    {
      "context": "Chat",
      "bindings": {
        "ctrl+e": "chat:externalEditor",
        "ctrl+s": null
      }
    }
  ]
}
```

- コンテキストは 27 種: Global、Chat、Autocomplete、Settings、Confirmation、Tabs、Help、Transcript、HistorySearch、Task、ThemePicker、Attachments、Footer、MessageSelector、DiffDialog、DiffPanel、ModelPicker、EffortSlider、Select、Plugin、AbovePrompt、AbovePromptInput、AbovePromptSelect、Pane、PaneField、Agents、Scroll(Scroll は fullscreen のみ)。`Doctor` と `doctor:fix` は v2.1.205 より前にのみ存在。
- 中級者向けの主要アクションと既定: `chat:killAgents` Ctrl+X Ctrl+K(3 秒以内に 2 回。背景 subagent をすべて止め、アーティファクト自動返信も止める)、`chat:queueSubmit` Ctrl+X Enter(v2.1.247+)、`chat:sendNow` Ctrl+Enter / Ctrl+X Ctrl+S(v2.1.275+。拡張キー非対応端末では Ctrl+Enter が Enter になるので後者を使う)、`chat:cycleMode` Shift+Tab、`chat:fastMode` Meta+O、`chat:thinkingToggle` Meta+T、`chat:stash` Ctrl+S、`task:background` Ctrl+B、`app:cycleDiffBase` Ctrl+X B、`effortSlider:toggleUltracode` Tab、`voice:pushToTalk` Space、`agents:switchView/togglePin/find/rename` Ctrl+S/T/F/R、`abovePrompt:toggle` Ctrl+X Ctrl+A、`pane:grow/shrink/close` Ctrl+X 矢印 / Ctrl+X X。agent view では Agents コンテキストが同じキーの Chat/Global を無視し、chord は発火しない。
- Chord: 空白区切りの連続キーで 3 秒タイムアウト。prefix はそれを定義する全コンテキストで予約されるため、`ctrl+x` を単独キーに戻すには Chat(ctrl+x ctrl+k / ctrl+e / enter / ctrl+a / ctrl+s / tab)、Task(ctrl+x ctrl+b)、DiffPanel(ctrl+x b)、Pane(ctrl+x left/right/up/down/x)、PaneField(ctrl+x x)の全 chord を `null` で解除する必要がある。一部だけ解除すると chord 待ちが残る。
- 予約キー(再割当不可): Ctrl+C、Ctrl+D、Ctrl+M(Enter)、Ctrl+[(Escape、Kitty プロトコルでは v2.1.242+)、Ctrl+I(Tab)、Ctrl+H、Caps Lock。`cmd`/`super` 修飾は Kitty キーボードプロトコルか xterm `modifyOtherKeys` の端末でしか検出されない。`meta`/`alt`/`opt` は同一。
- vim キーは keybindings.json で変えられず、`vimInsertModeRemaps: { "jj": "<Esc>" }`(v2.1.208+、2 文字限定、1 秒以内、user/`--settings`/managed のみ)を使う。
- 検証は `claude --debug` のログにしか出ない。`ctl+k` のような綴り違いは認識できない部分を捨てて `k` にバインドし、未知のアクション名は黙ってスキップされる。
- v2.1.280 で Confirmation の `y`/`n` 既定が削除された。それ以前に `/keybindings` で生成したファイルには残っており、削除するまで有効で、文字を表示しないダイアログにも作用する。

公式: https://code.claude.com/docs/en/keybindings 、https://code.claude.com/docs/en/interactive-mode 、https://code.claude.com/docs/en/voice-dictation

### 15.7 Output styles の仕組み

本編は組み込みスタイルの一覧とキャッシュ規則のみ扱った。配置とフロントマターの機構を補う。

- 配置: `~/.claude/output-styles`、`.claude/output-styles`(cwd からリポジトリルートまでの各 `.claude/output-styles/` をすべて読み、同名なら cwd に近い方が勝つ)、managed settings ディレクトリ内の `.claude/output-styles`、プラグインの `output-styles/`。ファイルは起動時に読まれ、編集反映には再起動が要る。
- フロントマター: `name`、`description`、`keep-coding-instructions`(既定 false)、`force-for-plugin`(プラグイン限定。有効化と同時に自動適用され、ユーザーの `outputStyle` を上書き。複数あれば最初に読まれたプラグインが勝つ)。綴り違いは黙って無視、YAML が壊れていればファイル名で読み込まれる。
- `keep-coding-instructions` はフルのシステムプロンプトでしか意味を持たない。新しいモデルが既定で使う短縮プロンプトには coding 節がなく効果がないため、`CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT=0` でフルプロンプトを強制する(unset は Haiku 4.5 / Sonnet 5 / Opus 4.7 以前がフル、`1` で常に短縮。どちらもツール・hooks・MCP・CLAUDE.md は維持)。
- 適用範囲: メイン会話とフォークのみ。他の subagent は独自のシステムプロンプトを持つため影響しない。
- `outputStyle` の値は大文字小文字を区別し、`explanatory` は黙って Default になる(`/output-style` コマンドは区別しない)。コマンドと `/config`・VS Code メニューは `.claude/settings.local.json` に書く。`/output-style` は v2.1.269+ で `-p`・Agent SDK・Remote Control(組み込みのみ)でも動く。Proactive スタイルは permission mode を変えない。
- Anthropic の steering 記事は、output styles がシステムプロンプトに置かれるため「最も高い指示追従の重み」を持つと述べている。

公式: https://code.claude.com/docs/en/output-styles 、https://code.claude.com/docs/en/env-vars 、https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more

### 15.8 IDE 統合: VS Code 拡張の設定、隠れた `ide` / `claude-vscode` MCP、JetBrains の安全モデル

- `claudeCode.*` 設定: `useTerminal`(false)、`initialPermissionMode`(未設定。default/manual/plan/acceptEdits/bypassPermissions、`auto` はなし。v2.1.225+ では USER 設定のみ読み workspace 値は無視)、`preferredLocation`(panel)、`lockEditorGroups`(v2.1.274+)、`autosave`、`attachOpenFile`(v2.1.271+)、`useCtrlEnterToSend`、`archiveInactiveSessions`(既定 14 日、0 で無効、v2.1.265+)、`continueAfterReload`(v2.1.274+)、`focusView`(v2.1.221+、Ctrl+Option+F / Ctrl+Alt+F でツール呼び出しを畳む)、`respectGitIgnore`、`environmentVariables`(`CLAUDE_CONFIG_DIR` は絶対パスのみ)、`disableLoginPrompt`、`allowDangerouslySkipPermissions`、`claudeProcessWrapper`。開始モードの優先順位は `initialPermissionMode` > 直前の選択(Manual/Edit automatically/Auto のみ)> managed か `~/.claude/settings.json` の `permissions.defaultMode` > 組み込み既定で、project の `.claude/settings*.json` は読まない。
- 拡張機能は private な CLI を同梱し `claude` を PATH に置かない。履歴は共有され `claude --resume` で拡張の会話を続けられる。
- 組み込み `ide` MCP サーバーは `/mcp` に出ず、`127.0.0.1` のランダムポート 10000〜65535 で非暗号の `ws://` を張り、トークンは `~/.claude/ide/<port>.lock`(0600)に書かれ `X-Claude-Code-Ide-Authorization` ヘッダで提示される。モデルに見えるツールは `mcp__ide__getDiagnostics` と `mcp__ide__executeCode`(Jupyter。PreToolUse や allow list と無関係に必ずネイティブ Quick Pick で確認)。チャットパネル(v2.1.285+)は別サーバーの `mcp__claude-vscode__getDiagnostics` を使うので、deny rule は両方を名指しする(`Read` の deny はどちらも覆わない):

```json
{
  "permissions": {
    "deny": [
      "mcp__ide__getDiagnostics",
      "mcp__claude-vscode__getDiagnostics"
    ]
  }
}
```

- JetBrains: Cmd+Esc で起動、Cmd+Option+K で `@file#L1-99` 参照、外部ターミナルからは `/ide` で接続。`diffTool`(`~/.claude.json` の global config、`auto`|`terminal`)は接続中にしか `/config` に現れない。「Accept connections from all network interfaces」を有効にするとトークンと通信が LAN 上を平文で流れる。`acceptEdits` や auto mode では IDE が自動実行する設定ファイルを Claude が書き換えられ、Bash の確認を迂回し得るため Manual を推奨。WSL2 では `.wslconfig` に `[wsl2] networkingMode=mirrored`(Windows 11 22H2+)か WSL2 サブネット向けのファイアウォール規則で IDE 検出を通す。

公式: https://code.claude.com/docs/en/vs-code 、https://code.claude.com/docs/en/jetbrains 、https://code.claude.com/docs/en/permission-modes

### 15.9 Dev container とリファレンスコンテナ

第10章ではサンドボックスの選択肢として触れただけだった。再現可能なスニペットを示す。

```json
{
  "image": "mcr.microsoft.com/devcontainers/base:ubuntu",
  "features": {
    "ghcr.io/anthropics/devcontainer-features/claude-code:1.0": {}
  }
}
```

- `:1.0` はインストールスクリプトを固定するのであって CLI のバージョンではない。feature は最新を入れ、コンテナ内で自動更新する。固定するなら Dockerfile で `npm install -g @anthropic-ai/claude-code@X.Y.Z` と `DISABLE_AUTOUPDATER=1`。
- 認証の永続化: `~/.claude.json`(OAuth、個人 MCP、フォルダ信頼)は `~/.claude` の外にあるため、ボリュームを `~/.claude` にマウントするだけではサインインが消える。`"mounts": ["source=claude-code-config,target=/home/node/.claude,type=volume"]` と `"containerEnv": { "CLAUDE_CONFIG_DIR": "/home/node/.claude" }` を組み合わせ、プロジェクト別には `${devcontainerId}` をボリューム名に入れる。Codespaces では `CLAUDE_CODE_OAUTH_TOKEN`(`claude setup-token`)か `ANTHROPIC_API_KEY` をシークレットに置く。
- ポリシー: `COPY managed-settings.json /etc/claude-code/managed-settings.json` は最上位の優先度で効くが、Dockerfile はリポジトリ内にあるため書き込み権限者が外せる。本気の強制は server-managed settings か MDM で行う。ただし server-managed は api.anthropic.com 直結が必要でゲートウェイ経由セッションには届かない。
- `containerEnv` の `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1` は feature-flag 取得も止める(`0`/`false` でも無効化される)。
- リファレンスコンテナ(anthropics/claude-code の `.devcontainer`)は `remoteUser: "node"`、`runArgs` に `--cap-add=NET_ADMIN` と `--cap-add=NET_RAW`(`init-firewall.sh` 用で NOPASSWD の sudoers を Dockerfile が作る)、`postStartCommand: "sudo /usr/local/bin/init-firewall.sh"`。CLI は root/sudo で `--dangerously-skip-permissions` を拒否する(認識済みサンドボックス内を除く)ため `remoteUser` は非 root 必須。禁止するなら managed に `"permissions": { "disableBypassPermissionsMode": "disable" }`(v2.1.223+ では subagent の `permissionMode: bypassPermissions` も無視される)。
- 比較: 組み込み Bash サンドボックスは Bash/PowerShell/Monitor だけを包み、MCP サーバー・hooks・plugin monitor は包まない。dev container は「慣習」であり強制境界ではない。sandbox runtime は `npx @anthropic-ai/sandbox-runtime claude` で起動し、`~/.srt-settings.json` で設定、既定でネットワーク拒否、`.git/hooks`・`.git/config`(`filesystem.allowGitConfig: true` で解除可)・`.mcp.json`・`.claude/commands`・`.claude/agents`・シェル起動ファイルは常に書き込み拒否。

公式: https://code.claude.com/docs/en/devcontainer 、https://code.claude.com/docs/en/sandbox-environments 、https://code.claude.com/docs/en/claude-directory

### 15.10 LLM ゲートウェイ互換プロトコル

Claude Code の前段に自前ゲートウェイを置く「AI システム」のための規約である。本編は `cache_control` と tool search オフにしか触れていない。

- 3 つの API 形式と選択変数: Anthropic Messages(`ANTHROPIC_BASE_URL`、`anthropic-beta`/`anthropic-version` ヘッダをそのまま転送)、Bedrock InvokeModel(`ANTHROPIC_BEDROCK_BASE_URL` + `CLAUDE_CODE_USE_BEDROCK=1`、本文の `anthropic_beta`/`anthropic_version`)、Agent Platform rawPredict(`ANTHROPIC_VERTEX_BASE_URL` + `CLAUDE_CODE_USE_VERTEX=1`)。推論は `/v1/messages?beta=true` に来る。Messages 形式では上流が Bedrock/Vertex でも全機能セットを送る。
- `anthropic-beta` は値を allowlist せず verbatim で転送する。claude.ai ログインがゲートウェイ資格情報なしに `ANTHROPIC_BASE_URL` 経由で通る場合、このヘッダに OAuth capability が載り、剥がすと 401 になる。毎リクエストに `x-claude-code-session-id`、subagent には `x-claude-code-agent-id`、入れ子には `x-claude-code-parent-agent-id`。
- 機能はヘッダ + 本文の対で送られ、片方だけ落とすと 400、両方落とせば静かにオフ。adaptive thinking(`thinking: {type: adaptive}`、beta なし)、`context_management`、ツールスキーマの `strict`/`defer_loading`、`output_config`(effort / 構造化出力 / task budget)、`cache_control`(beta なし。落とすと黙って非キャッシュ課金)、`count_tokens`(任意)。`CLAUDE_CODE_DISABLE_EXPERIMENTAL_BETAS=1` は context_management・strict/defer_loading・`output_config.format`(v2.1.287+)・task_budget・MCP tool search(managed で維持しない限り、v2.1.227+)を外し、effort や adaptive thinking や OAuth beta は残す。
- 自動リトライ規則(エラー文言で判定するため本文は改変せず転送する): thinking フィールドやセッション中システムメッセージの拒否は再試行後に会話中は無効化、thinking signature の `bound to a different conversation`(400)は過去の thinking を剥いで再試行、advisor ツールの `Input tag 'advisor_20260301'`(400/422、v2.1.280+)は一度だけ外して再試行し終了まで `/advisor` 不可、`output_config.effort` 拒否はそのモデルで effort なし。context_management とツールスキーマの拒否は再試行しない。エンベロープで包む場合は `capability_rejected:` トークンを含める。
- レスポンスヘッダ: `retry-after` は整数秒(60 超は `CLAUDE_CODE_RETRY_WATCHDOG` セッション以外でリトライ停止)、`x-should-retry` はそのまま、`anthropic-ratelimit-unified-*` は利用枠表示に使われる。
- システムプロンプトの attribution ブロックは最初の system エントリとして無改変で届いたときだけ api.anthropic.com が位置的に剥がす。並べ替え・結合・文字列化するとプロンプトとキャッシュキーに漏れる。`CLAUDE_CODE_ATTRIBUTION_HEADER=0` でクライアント側省略(v2.1.181 からカスタム base URL では会話中固定、v2.1.229 から直結の分類器リクエストには `0` でも付く)。
- ゲートウェイ向けヒントヘッダ(v2.1.273+): `x-claude-code-request-class`(main|subagent|workflow|compaction|auxiliary)、`x-claude-code-agent-type`、`x-claude-code-compaction`、`x-claude-code-context-compacted`、`x-claude-code-prev-tool-durations`(`Bash=742;Read=9`、32 項目 / 4 KB まで)、`x-claude-code-prompt-id`(v2.1.283+)。直結では既定オン、カスタム base URL では `CLAUDE_CODE_GATEWAY_HINT_HEADERS=1` で有効、`0` で全停止。
- モデル探索: `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` で起動時に `GET /v1/models?limit=1000`(3 秒、`CLAUDE_CODE_GATEWAY_MODEL_DISCOVERY_TIMEOUT_MS` v2.1.269+、リダイレクトは失敗扱い)。id に `claude` か `anthropic` を含むものだけ採用し `availableModels` で絞り、`~/.claude/cache/gateway-models.json` にキャッシュ。Messages 形式限定。
- 課金: ゲートウェイ資格情報(`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_API_KEY`、`apiKeyHelper`)があるとサブスク枠は適用されず従量課金で、Remote Control と voice が使えなくなる。`ANTHROPIC_BASE_URL` だけなら claude.ai ログインが有効なまま。
- 固定: managed の `"allowedProviders": ["customEndpoint"]`(v2.1.285+)は、managed の `env` ブロックに固定した `ANTHROPIC_BASE_URL` の値だけを許し、他所(Anthropic 直結を含む)は拒否する。managed の `ANTHROPIC_BASE_URL` はシェルの export で上書きできない。
- 落とし穴: fast mode の可用性チェックと WebFetch のドメイン安全チェックは `ANTHROPIC_BASE_URL` を無視して api.anthropic.com に直接行く(`CLAUDE_CODE_SKIP_FAST_MODE_ORG_CHECK=1`、`skipWebFetchPreflight: true`)。小さなコンテキストを強制して too-long エラーを書き換えるゲートウェイでは自動圧縮が発火せず、`CLAUDE_CODE_AUTO_COMPACT_WINDOW` は 100,000 未満にできない。VS Code 拡張では `claudeCode.environmentVariables` に置かないとログインチェックに届かない。TS SDK の `options.env` は環境を置換する(`process.env` を spread する)。

公式: https://code.claude.com/docs/en/llm-gateway-protocol 、https://code.claude.com/docs/en/llm-gateway 、https://code.claude.com/docs/en/llm-gateway-connect 、https://code.claude.com/docs/en/llm-gateway-rollout

### 15.11 Claude apps gateway(`claude gateway --config gateway.yaml`)

Anthropic 自身が `claude` バイナリに同梱するセルフホストゲートウェイ。SSO サインイン、IdP グループ別の managed settings、支出上限を一体で提供する。

- 要件: サーバーと全開発端末が v2.1.195+、PostgreSQL 11+(11〜13 は gateway v2.1.290+)、OIDC IdP(SAML/LDAP 不可、issuer は 1 つ)、HTTPS、プライベートネットワークアドレス、Linux サーバー。`gateway.yaml` の必須 5 セクションは `listen`(`public_url`)、`oidc`(`issuer`/`client_id`/`client_secret`/`allowed_email_domains`)、`session`(`jwt_secret`/`ttl_hours`)、`store`(`postgres_url`)、`upstreams`。
- `/login` は公開 IP に解決するホスト名を拒否する。自社保有のパブリックブロックは managed 専用の `gatewayInternalNetworks`(v2.1.268+、最大 4 ブロック、/8〜/32、重複不可)で宣言する。不正値はそのマシンの新規ゲートウェイサインインをすべて拒否する。
- クライアント側 managed キー: `"forceLoginMethod": "gateway"`、`"forceLoginGatewayUrl": "https://..."`、`"parentSettingsBehavior": "merge"`。デバイス側 managed ソースに置く必要があり、ゲートウェイのペイロードや server-managed では配れない。v2.1.295+ では managed ソースのない端末に限り `~/.claude/settings.json` でも可。迂回防止に `"allowedProviders": ["gateway"]`(v2.1.285+)。
- サインイン済みゲートウェイセッションは通常の資格情報優先順位の外にあり、`CLAUDE_CODE_USE_BEDROCK` 等を含むすべてに勝つ。逆にゲートウェイ強制端末に残った API キー・auth token・`apiKeyHelper`・保存済み Console キーは起動を止める。
- `managed.policies` は順に評価して最初の一致を `match: {}` ベースにマージ: allow-list(`availableModels`、`permissions.allow`)は置換、deny-list と hook 配列は和集合、record 型(`env`、`modelOverrides`、`skillOverrides`)は shallow-merge。設定は `code`(推奨、gateway v2.1.296+)か旧 `cli` の下に置き、混在は起動失敗。`availableModels` が既定 Opus を含まないとセッションが `/model` まで 400 を返すので `enforceAvailableModels: true` と必要なら `model:` を付ける。
- 支出上限は `gateway.yaml` ではなく Admin API `/v1/organizations/spend_limits`(`admin:` ブロックで有効化)で設定。スコープは user(OIDC `sub`)/ rbac_group / organization、期間は daily/weekly/monthly(UTC)、解決順は user override > 最も厳しい group cap(`group_limit_mode: max` で緩い方)> org default > unlimited。金額は USD セントの文字列。超過時は 429 の `billing_error` と `retry-after`。Claude Code 側は 75%/95% 警告、`/usage` の Spend limit バー、ステータスラインの `rate_limits.spend_limit`。
- 可用性: 1M コンテキスト既定(client v2.1.287+)、グループ別 managed settings、支出上限、auto mode、Desktop の `desktop` オプトイン、OTLP/HTTP の fan-out は可。WebSearch(上流が見えないため無効)、Remote Control、`/design-sync`/`/design-login`、feature-flag 機能(`/import` など)、1 時間キャッシュ TTL、first-party 最適化、OTLP gRPC、Windows サーバー、Helm chart、管理 UI は不可。Bedrock 上流には beta 値を本文の `anthropic_beta` に移す。
- 運用: JWT はローカル検証のためセッション単位の失効はなく、`jwt_secret` の配列ローテーションか IdP 除籍(`ttl_hours` 内)でしか追い出せない。Postgres 障害時は既存セッションと推論は継続するが新規サインインは止まり、`store.readiness_grace_seconds`(v2.1.282+)がないと `/readyz` が即失敗する。サインインのレート制限はクライアント IP ごと 600 秒に 30 開始 / 10 コード送信で、`listen.trusted_proxies` を先に設定する。`timeouts.upstream_ttfb_ms` は `provider: anthropic` にしか効かない。サービストークンのフローはなく CI はサインインできない。
- テレメトリ: `telemetry.forward_to` と `listen.public_url` を設定するとゲートウェイが OTEL 変数 6 個を managed tier で配り、サインイン済み CLI はローカル設定の OTLP エンドポイントを無視する(policy の env で collector を名指しした場合を除く、client v2.1.265+)。

公式: https://code.claude.com/docs/en/claude-apps-gateway 、https://code.claude.com/docs/en/claude-apps-gateway-config 、https://code.claude.com/docs/en/claude-apps-gateway-spend-limits 、https://code.claude.com/docs/en/claude-apps-gateway-deploy 、https://code.claude.com/docs/en/authentication

### 15.12 Bedrock / Google Cloud Agent Platform / Microsoft Foundry の運用規則

本編はプロバイダを「機能 X が使えない場所」として扱った。ここでは実際に運用するための規則を補う。

- ウィザード: `/setup-bedrock`(`CLAUDE_CODE_USE_BEDROCK=1` まで menu に出ない。フルで入力)と `/setup-vertex` が `~/.claude/settings.json` の `env` ブロックを書く。Foundry にはウィザードも起動時モデルチェックもなく、`ANTHROPIC_FOUNDRY_RESOURCE`(裸のリソース名のみ)か `ANTHROPIC_FOUNDRY_BASE_URL` を環境変数で設定する。`/logout` は三者とも使えない。
- 既定モデル: primary は Bedrock(`us.anthropic.claude-opus-5-5`)と Agent Platform(`claude-opus-5-5`)で Opus 5.5、Foundry は `opus` = Opus 4.6。small/fast モデルは Bedrock/Vertex で Sonnet 4.5(`us.anthropic.claude-sonnet-4-5-20250929-v1:0` / `claude-sonnet-4-5@20250929`)なので、セッションタイトル生成などが Sonnet 課金になる。`--model`/`ANTHROPIC_MODEL`/`model`/`ANTHROPIC_DEFAULT_MODEL` で primary を選ぶ(`ANTHROPIC_DEFAULT_OPUS_MODEL` だけ設定した場合も含む)と背景タスクもそこに移る。Haiku にしたければ `ANTHROPIC_DEFAULT_HAIKU_MODEL`。
- 固定: `ANTHROPIC_DEFAULT_{FABLE,OPUS,SONNET,HAIKU}_MODEL`。固定 ID は既知モデルに一致(ID が Anthropic ID を含むか `modelOverrides` で対応)した場合だけ 1M ウィンドウになり、それ以外は `[1m]` を付けないと 200K。`[1m]` は変数ごとに読まれる。`modelOverrides` は Anthropic ID から inference-profile ARN / Vertex バージョン名 / Foundry デプロイ名への写像で、`--model` や `ANTHROPIC_DEFAULT_*` にも適用され(v2.1.200+)、Foundry がデプロイのモデルと 1M を知る唯一の手段。`availableModels` の照合はプロバイダ接頭辞を剥がさず `[1m]` は剥がす。
- Bedrock: リージョン解決は `AWS_REGION` > `AWS_DEFAULT_REGION` > プロファイルの `region` > `us-east-1`。`ANTHROPIC_BEDROCK_REGION_PREFIX`(v2.1.224+、us/eu/apac/jp/au/global)で最初に試す推論プロファイル接頭辞を指定。起動時モデルチェックは拒否を最大 1 日記憶し(`CLAUDE_CODE_SKIP_MODEL_ACCESS_MEMORY=1`、v2.1.285+)、既定モデルは 10 分後に再確認、セッション中の喪失は固定されていない階層を切り替える(`CLAUDE_CODE_DISABLE_MODEL_ACCESS_FALLBACK=1` で失敗に変更)。`enforceAvailableModels` は v2.1.287 からチェックにも適用。AWS 資格情報は期限 5 分前か 1 時間までキャッシュ(`CLAUDE_CODE_SKIP_AWS_CRED_CACHE=1`)、チェーン解決は 60 秒(`CLAUDE_CODE_AWS_CHAIN_RESOLVE_TIMEOUT_MS`)。`awsAuthRefresh` は STS GetCallerIdentity で期限切れを確認してから走り、`awsCredentialExport` は `{"Credentials": {AccessKeyId, SecretAccessKey, SessionToken, Expiration}}` を出力する。IAM は `bedrock:InvokeModel`、`InvokeModelWithResponseStream`、`ListInferenceProfiles`、`GetInferenceProfile`(ないと新モデルごとに 1 回余分にリトライ)。`ANTHROPIC_BEDROCK_SERVICE_TIER=default|flex|priority`。Guardrails は `ANTHROPIC_CUSTOM_HEADERS` に `X-Amzn-Bedrock-GuardrailIdentifier` と `X-Amzn-Bedrock-GuardrailVersion`。
- Mantle: `CLAUDE_CODE_USE_MANTLE=1` で Anthropic ネイティブ API 形の Bedrock エンドポイントを使う。ID は `anthropic.claude-sonnet-5` のようにバージョン接尾辞なし。`CLAUDE_CODE_USE_BEDROCK` と併用すると Mantle 形式の ID だけ Mantle に、それ以外は Invoke API に流れる。IAM は `bedrock-mantle:CreateInference` と `bedrock-mantle:CountTokens`。`CLAUDE_CODE_SKIP_MANTLE_AUTH=1` で未署名送信。
- Bedrock ストリーミング guard: `Content-Type: application/vnd.amazon.eventstream` を要求し、書き換えられていると `Bedrock streaming response has content-type ...` で失敗(`CLAUDE_CODE_DISABLE_BEDROCK_CONTENT_TYPE_GUARD=1`、v2.1.208+)。ヘッダが落ちていればバイナリと仮定するので、SSE に変換するゲートウェイでは `CLAUDE_CODE_DISABLE_BEDROCK_CONTENT_TYPE_DEFAULT=1`(v2.1.239+)にしないと毎ターン非ストリーミングに黙って落ちる。
- Agent Platform: `CLOUD_ML_REGION=global`(eu/us のマルチリージョンや単一リージョンも可)に `VERTEX_REGION_CLAUDE_*` の個別上書き、フォールバックは `us-east5`。リクエストは `ANTHROPIC_VERTEX_PROJECT_ID` に行く(他の変数が別プロジェクトを指していても)。`gcpAuthRefresh` は 5 秒のトークン確認で期限切れが分かってからだけ走り(v2.1.261+)、3 分でタイムアウト、project settings では hooks の信頼規則に従う。tool search は 4.5 以降のモデルのみ。
- Foundry: 認証は `ANTHROPIC_FOUNDRY_AUTH_TOKEN` > `ANTHROPIC_FOUNDRY_API_KEY` > Azure 既定資格情報チェーン(Entra ID)。Hosted on Azure なら prompt/completion は Azure 内にとどまり、Hosted on Anthropic は Anthropic 基盤へ。GitLab CI/CD は不可。
- Claude Platform on AWS: `CLAUDE_CODE_USE_ANTHROPIC_AWS=1` と必須の `ANTHROPIC_AWS_WORKSPACE_ID`、`ANTHROPIC_AWS_API_KEY` は SigV4 より優先。Bedrock/Foundry の `CLAUDE_CODE_USE_*` が勝つので unset する。Marketplace 契約は別 Anthropic org を作るため他 org の Console キーは使えない。
- `CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`(埋め込みホストが設定)は settings 内のプロバイダ選択・エンドポイント・認証変数と managed のモデル固定を無視し、サードパーティでのテレメトリ自動オプトアウトをやめ、feature-flag 取得を再有効化する。

公式: https://code.claude.com/docs/en/amazon-bedrock 、https://code.claude.com/docs/en/google-vertex-ai 、https://code.claude.com/docs/en/microsoft-foundry 、https://code.claude.com/docs/en/claude-platform-on-aws 、https://code.claude.com/docs/en/model-config

### 15.13 OpenTelemetry モニタリングリファレンス

第11章はコストとトークンのカウンタのみ扱った。観測パイプラインが必要とするスキーマを補う。

- メトリクス(meter `com.anthropic.claude_code`): `claude_code.session.count`(`start_type` = fresh|resume|continue|agents_view)、`lines_of_code.count`、`pull_request.count`、`commit.count`、`cost.usage`、`token.usage`(`type` = input|output|cacheRead|cacheCreation、`query_source` = main|subagent|auxiliary)、`code_edit_tool.decision`、`active_time.total`(`type` = user|cli)。既定の temporality は delta、間隔は metrics 60,000 ms / logs 5,000 / traces 5,000。Prometheus 単独エクスポートは v2.1.216 から `# UNIT` 行を出さない。
- イベント: `user_prompt`(v2.1.287+ は `prompt` と `prompt_text` の両方を持つ)、`assistant_response`、`tool_result`、`api_request`、`api_error`、`api_retries_exhausted`、`api_refusal`、`api_request_body`/`api_response_body`(`OTEL_LOG_RAW_API_BODIES=1` か `file:<dir>`。thinking は常に伏字、project/local では無視)、`tool_decision`、`permission_mode_changed`、`auth`、`mcp_server_connection`、`internal_error`(Bedrock/Vertex/Foundry では出ない)、`plugin_installed`、`plugin_loaded`、`skill_activated`、`hook_*`、`compaction`、`subagent_completed`、`feedback_survey`、`retention_sweep`(v2.1.227+)、`managed_settings_resolved`(v2.1.274+、`OTEL_LOG_MANAGED_SETTINGS=1` で伏字化した設定と `resolved_sha256` を追加)。
- 属性: `session.id`(クラウドは `ccr.session.id`)、`app.version`、`app.entrypoint`(cli|sdk-cli|sdk-ts|sdk-py|claude-vscode|claude-in-slack)、`organization.id`、`user.account_uuid`、`user.id`(`~/.claude.json` の匿名 ID。ゲートウェイセッションでは IdP の sub)、`user.email`、`terminal.type`、`vcs.*`(`OTEL_METRICS_INCLUDE_REPOSITORY`、v2.1.269+)。カーディナリティ制御は `OTEL_METRICS_INCLUDE_{SESSION_ID(true),VERSION(false),ACCOUNT_UUID(true),ENTRYPOINT(false),RESOURCE_ATTRIBUTES(true),REPOSITORY(false)}`。イベント限定の相関属性は `prompt.id`(ステータスラインの `prompt_id` と一致)、`event.sequence`(プロセス単位)、`workflow.run_id`、`workflow.name`。API キーやクラウドプロバイダでは `user.id` と `session.id` しか入らないので `OTEL_RESOURCE_ATTRIBUTES="enduser.id=..."` で ID を付ける。
- 伏字の既定: `OTEL_LOG_USER_PROMPTS`、`OTEL_LOG_ASSISTANT_RESPONSES`(未設定なら prompts の値にフォールバックするので、応答だけ伏せるには `0` を明示)、`OTEL_LOG_TOOL_DETAILS`(なしではツール入力と agent/skill/plugin/MCP の実名が伏せられ MCP ツール名は `mcp_tool`)、`OTEL_LOG_TOOL_CONTENT`(tracing 必須)はすべてオフ。内容属性は `CLAUDE_CODE_OTEL_CONTENT_MAX_LENGTH`(既定 61440、約 60 KB、v2.1.214+)で切られる。
- トレース(beta): `CLAUDE_CODE_ENABLE_TELEMETRY=1` + `CLAUDE_CODE_ENHANCED_TELEMETRY_BETA=1` + `OTEL_TRACES_EXPORTER`。span 木は `claude_code.interaction` → `llm_request` / `hook`(detailed beta のみ)/ `tool` → `tool.blocked_on_user` + `tool.execution`(subagent の span は親 tool の下)。Bash/PowerShell サブプロセスは `TRACEPARENT` を継承。モデルと HTTP MCP への `traceparent` は Anthropic 直結のときだけで、プロキシ経由は `CLAUDE_CODE_PROPAGATE_TRACEPARENT=1`(v2.1.152+)。`-p`/SDK は入力 `TRACEPARENT` を読み、対話セッションは無視する。
- managed のロック(v2.1.217+): managed の `OTEL_EXPORTER_OTLP_ENDPOINT` は開発者のシグナル別エンドポイントを、`OTEL_EXPORTER_OTLP_PROTOCOL` はシグナル別プロトコルを、`OTEL_EXPORTER_OTLP_HEADERS`/`_CLIENT_KEY`/`_CLIENT_CERTIFICATE` はシグナル別版とすべてのエンドポイント変数を取り除く。エクスポータ選択子(`OTEL_METRICS_EXPORTER`、`OTEL_LOGS_EXPORTER`、`OTEL_TRACES_EXPORTER`)はロックされないので必要なら managed にも書く。リポジトリ settings は無視。`otelHeadersHelper` は JSON のヘッダ辞書を出力するスクリプトで http/protobuf と http/json 限定、起動時と 29 分ごと、失敗するとエクスポートされない。

公式: https://code.claude.com/docs/en/monitoring-usage 、https://code.claude.com/docs/en/analytics 、https://code.claude.com/docs/en/statusline

### 15.14 データフロー・プライバシー・コンプライアンスのスイッチ

- 学習と保持: コンシューマは設定オンのときだけ学習(保持 5 年、オフなら 30 日)。商用(Team/Enterprise/API/サードパーティ)は Developer Partner Program でオプトインしない限り学習せず保持 30 日、適格 Enterprise は ZDR。`/feedback`・`/bug`・`/share` のトランスクリプトは 5 年保持。セッション品質調査は評価だけを送り、任意のトランスクリプト送信は最長 6 か月(Bedrock/Vertex/Foundry/ゲートウェイでは `~/.claude/feedback-bundles/` にローカル保存)。`CLAUDE_CODE_DISABLE_FEEDBACK_SURVEY=1`、`feedbackSurveyRate`(0〜1)、`CLAUDE_CODE_ENABLE_FEEDBACK_SURVEY_FOR_OTEL=1`(自前 collector にだけ評価を送る)。
- プロバイダ別テレメトリ既定: Claude API では metrics・error report(Pro/Max v2.1.198+)・`/feedback` がオン、Agent Platform / Bedrock / Foundry / Claude Platform on AWS では三つともオフ。調査と WebFetch ドメインチェックはどこでもオン。`DISABLE_TELEMETRY`、`DISABLE_ERROR_REPORTING`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` は `0`/`false` でもオプトアウト扱い(`DO_NOT_TRACK` と `DISABLE_GROWTHBOOK` は通常の boolean)。
- `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC` が止めるもの: 自動更新、テレメトリ、エラー報告、`/feedback`、リリースノート、PR/MR バッジ、fast mode チェック、feature-flag 取得(Remote Control などが消える)。止めないもの: WebFetch のホスト名チェック(`skipWebFetchPreflight: true`)、公式マーケットプレイスの初回登録(`CLAUDE_CODE_DISABLE_OFFICIAL_MARKETPLACE_AUTOINSTALL`)、ゲートウェイモデル探索。
- WebFetch はプロバイダを問わずホスト名(パスや内容ではない)を api.anthropic.com に送り、通過したホストを 5 分キャッシュする。api.anthropic.com を遮断すると WebFetch は失敗し、`skipWebFetchPreflight: true` にするとブロックリストが消えるので WebFetch のドメイン permission rule と組み合わせる。
- ZDR: Enterprise 限定でアカウントチームが組織ごとに有効化(管理画面からは不可、新 org に継承されない)。Anthropic 直結の推論だけを対象とし、バックエンド側でクラウドセッション・Chat+Cowork 統合・Claude Tag・Artifacts・feedback・Remote Control を無効化する。claude.ai Chat、Cowork、分析メタデータ、サードパーティ MCP は対象外。Fable 5.1 / 5 は Covered Models で ZDR org では不在になり得て、`best` は Opus に解決する。
- HIPAA 構成(v2.1.285+、Desktop v2.19675.0+): Claude Enterprise アカウントで Claude API に直接サインインした場合だけ適用され、ゲートウェイ・クラウドプロバイダ・Console キー・federation は対象外。WebFetch、クラウド/`/teleport`/Remote Control、`/feedback`・`/bug`、アーティファクト公開、MCP tool search(再有効化不可)を止め、hooks・MCP・コマンドの環境から `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` を剥ぐ。フッターに `HIPAA configured`。推奨 managed キーは `forceLoginMethod: "claudeai"`、`forceLoginOrgUUID`、`allowedProviders: ["anthropic"]`、`cleanupPeriodDays`、`requiredMinimumVersion: "2.1.285"`(それ以前は `allowedProviders` を無視するため)。ローカルデータの消去は `claude purge --all --yes`(v2.1.288+。v2.1.126〜287 は `claude project purge --all --yes`)。
- 法務: 製品に組み込む場合はバイナリ無改変かつ全認証手段を残し、各エンドユーザーが自分の資格情報で認証する。OAuth はサブスク購入者専用で、製品を作る開発者は API キーかクラウドプロバイダを使う。

公式: https://code.claude.com/docs/en/data-usage 、https://code.claude.com/docs/en/zero-data-retention 、https://code.claude.com/docs/en/hipaa-setup 、https://code.claude.com/docs/en/legal-and-compliance 、https://code.claude.com/docs/en/security

### 15.15 機能可用性マトリクス(認証方式・プラン・feature-flag)

可用性は設定より前に効く最初の設計制約である。各章に散らばった「Bedrock では不可」をここに集約する。

| 軸 | 内容 |
|---|---|
| claude.ai サブスク必須 | クラウドセッション/モバイル、Slack(Pro/Max)、Desktop、Routines、Ultrareview、Code Review(Team/Enterprise)、Remote Control、Chrome、Computer use(Pro/Max)、Artifacts、Voice |
| プラン別 | Computer use と Dispatch は Pro/Max のみ。Code Review は Team/Enterprise。Projects は Pro/Max beta。Analytics dashboard は Team/Enterprise。SCIM / Compliance API / ZDR / Enterprise Analytics API は Enterprise |
| プロバイダで変わる | WebSearch は Bedrock 不可(Vertex は Opus 4 / Sonnet 4 / Haiku 4.5 以降)。fast mode はサブスクと provisioned Console のみ。auto mode は Bedrock/Vertex/Foundry では Sonnet 5+ / Opus 4.7+ / Haiku 5.5 / Fable のみ。Advisor はサブスク/Console のみ。Channels は 4 クラウドプロバイダで不可。GitHub Actions は Claude Platform on AWS 不可、GitLab CI/CD は Foundry 不可。cross-session messaging は API キーでは同一マシン限定、4 クラウドプロバイダでも同一マシン限定(v2.1.248+ が必要)。Analytics と server-managed settings はクラウドプロバイダに届かない。`/import`・`/design-sync`・`/voice` は Bedrock/Vertex/Foundry/Claude Platform on AWS/apps gateway で不可 |
| Explore subagent | メインが Fable のとき、サブスク/Console/`ANTHROPIC_BASE_URL` ゲートウェイでは Opus で動き、他プロバイダでは Fable のまま |
| feature-flag 取得が止まる条件 | `DISABLE_GROWTHBOOK`、`DISABLE_TELEMETRY`、`DO_NOT_TRACK`、`CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`、サードパーティプロバイダ(`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST` を除く)、apps gateway セッション、`ANTHROPIC_AUTH_TOKEN` のみで非 Anthropic の `ANTHROPIC_BASE_URL`(取得用の資格情報がない) |
| flag なしで失うもの | `/auto-mode-setup`、Remote Control、マシン越えメッセージング、`claude import`/`/import`、`/skill-doctor`、claude.ai スキル/プラグイン同期、You should know mod、VS Code パネルの mod 描画、advisor、アーティファクトのコメントと他組織読み取り、Windows の PowerShell 既定、Claude 下書き feedback、貼り付けテキストのマーク、不正スキーマ MCP ツール除外、idle compaction |

インストールや更新直後の「最初のセッション」は flag 取得前なので flag 依存機能が欠け、開始 permission mode も変わり得る。取得後はマシンに保存される。クリーンな CI コンテナは毎回が最初のセッションである。

公式: https://code.claude.com/docs/en/feature-availability 、https://code.claude.com/docs/en/env-vars 、https://code.claude.com/docs/en/platforms 、https://code.claude.com/docs/en/third-party-integrations

### 15.16 セッション起動の順序とソース横断の優先順位(統合モデル)

各章が個別に述べた優先順位を、セッションが実際に立ち上がる順に並べる。設定ファイルの 5 段階と env のペア単位規則は第10章、名前衝突の規則(skills: managed > user > project、subagents: managed > CLI > project > user > plugin、MCP: local > project > user、CLAUDE.md は加算、hooks はマージ)は第12章を参照。

1. 資格情報の決定と server-managed settings の取得(サインイン起動時は最大 5 秒待つ。シェルに `CLAUDE_CODE_USE_*` や非既定 `ANTHROPIC_BASE_URL` があると取得自体が省かれる)。managed tier 内は最初にポリシーキーを届けたソース 1 つを使い(server-managed → endpoint-managed)、`env` はキー単位マージ(v2.1.223+)、`allowedProviders` は積集合、ゲートウェイサインインキーは server-managed から読まない。
2. feature-flag 取得(15.15 の条件下では省略)。
3. システムプロンプト → auto memory(MEMORY.md 先頭 200 行 / 25 KB)→ 環境情報(git ブランチ・状態)→ MCP ツール名(スキーマは遅延)→ スキル説明 → `~/.claude/CLAUDE.md` → プロジェクト CLAUDE.md。context-window ページの例示値では起動ブロック合計が約 7〜8K トークン(例示であり実値は構成次第)。output style と `--append-system-prompt` はここに加わる。
4. MCP 接続は既定で非ブロッキング(`MCP_CONNECTION_NONBLOCKING=0` で待機)。`alwaysLoad: true` のサーバーは discovery cache からでない限り起動を待たせ(`MCP_CONNECT_TIMEOUT_MS=5000`)、`-p`(stream-json 以外)は初ターン前に必ず待つ。キャッシュ済み `managedMcpServers` は取得確認まで保留され最大 30 秒待つ(v2.1.259+)。
5. SessionStart hooks は背景で走り最初のプロンプトを保留する。plugin の自動更新は最初のメッセージ後最大 10 分。org ポリシーは毎時再取得。
6. ホットリロード: 4 つの settings ファイルと managed は監視され permissions / hooks / `apiKeyHelper` は即反映。`model`、`effortLevel`/`modelSettings`、`requiredMinimumVersion` などの admin キー、OTel エクスポータ、`env` からの変数削除は起動時のみ。`keybindings.json` と `~/.claude/themes/` はホットリロード、output styles は再起動。

証明の手段: `/context` はバンドルスキル(`/skills` は省く)と各カスタム subagent のソースを含む全カテゴリを示す。`/status` の `Setting sources` 行は読んだファイルと managed の到達経路を示すが、どのキーをどのファイルが供給したかは示さない。`claude doctor` はセッションを起動せず拒否された不正エントリを列挙する。クラウドセッションはリポジトリの `.claude/settings.json` と server-managed(セルフホストの managed ファイル)しか読まない。

二分法: `claude --safe-mode` は CLAUDE.md・skills・plugins・hooks・MCP・カスタムコマンド/agents・output styles・keybindings を切るが managed の hooks とポリシーは残す(managed の plugins/skills/CLAUDE.md/MCP は切る)。次の段は空ディレクトリで `CLAUDE_CONFIG_DIR=~/claude-clean/config claude --setting-sources user`(初回セットアップ画面が出れば有効。managed settings と claude.ai コネクタは残る)。

症状→原因の代表例: hook の `matcher` が配列だと invalid setting になり、PreToolUse / PermissionRequest 配下ならそのファイルの他の hook も読まれない。`~/.claude.json` はアプリ状態であり permissions / hooks / env を置く場所ではない。`settings.json` に `mcpServers` キーはなく、`.mcp.json` はリポジトリルートで `mcpServers`(`servers` ではない)配下、相対パスは起動ディレクトリ基準。`Bash(rm *)` の deny は `/bin/rm` や `find -delete` に一致しない。`.claude/skills/name.md` は `name/SKILL.md` でないと現れない。組み込み Explore / Plan は起動時 CLAUDE.md を読まない。

公式: https://code.claude.com/docs/en/debug-your-config 、https://code.claude.com/docs/en/how-claude-code-works 、https://code.claude.com/docs/en/context-window 、https://code.claude.com/docs/en/claude-directory 、https://code.claude.com/docs/en/settings 、https://code.claude.com/docs/en/server-managed-settings 、https://code.claude.com/docs/en/features-overview

### 15.17 企業ネットワーク構成とコーポレートランチャー

- プロキシ: `https_proxy` → `HTTPS_PROXY` → `http_proxy` → `HTTP_PROXY` の順で最初に設定されたものを使う。SOCKS 非対応。loopback(localhost、::1、127.0.0.0/8)への WebSocket はプロキシを通らない。プロキシ URL は起動時に検証される唯一のネットワーク設定で、スキーム欠落は起動中断。
- CA: `CLAUDE_CODE_CERT_STORE=bundled,system` が既定。OS ストアの読み取りはネイティブインストーラでは常に可、npm インストールは Node 22.15 以上が必要(古い Node は bundled と `NODE_EXTRA_CA_CERTS` のみ)。TLS 検査プロキシが gzip を壊すなら `CLAUDE_CODE_GZIP_REQUEST_BODIES=0`。
- mTLS: `CLAUDE_CODE_CLIENT_CERT` / `_KEY` / `_KEY_PASSPHRASE`。ファイルは起動時と設定適用時に読まれ、v2.1.232+ では接続レベルの失敗(reset / TLS handshake)後に再読込して再試行するが、HTTP エラー後は再読込しない(`CLAUDE_CODE_DISABLE_MTLS_RELOAD_ON_STALE_CONNECTION=1` で停止)。OTLP エクスポータは再起動まで最初の証明書を保持。クラウドセッションは settings `env` の TLS/プロキシ変数を無視し、Desktop 管理セッションは managed と user settings からのみ読む(v2.1.217+)。
- ストリーミングの 4 タイマー: first-byte 期限(直結 180 秒 / その他 300 秒、本文 32 KB ごとに +1 秒。ゲートウェイでは不使用、Bedrock はオプトイン)、イベント watchdog(300 秒、全プロバイダ)、バイト watchdog(直結 180 秒 / AWS 300 秒。Bedrock はオプトイン、Vertex/Foundry では不使用)、body idle(5 分、直結・Claude Platform on AWS・バイト watchdog 付き Bedrock 以外)。変数は `CLAUDE_STREAM_IDLE_TIMEOUT_MS`(両 watchdog、5 分未満は 5 分に切り上げ)、`CLAUDE_BYTE_STREAM_IDLE_TIMEOUT_MS`(v2.1.210+、10 秒〜30 分)、`CLAUDE_STREAM_FIRST_BYTE_TIMEOUT_MS`(v2.1.242+)、`CLAUDE_ENABLE_BYTE_WATCHDOG_BEDROCK=1`、`API_FORCE_IDLE_TIMEOUT=0|1`、`API_TIMEOUT_MS`。
- ドメイン許可リスト(CLI): api.anthropic.com、claude.ai、claude.com、platform.claude.com(claude.ai アカウントの OAuth トークン交換もここ)、mcp-proxy.anthropic.com、downloads.claude.ai、storage.googleapis.com、registry.npmjs.org、bridge.claudeusercontent.com、*.frame.claudeusercontent.com、github.com、raw.githubusercontent.com(changelog の背景取得)、*-review.googlesource.com、http-intake.logs.us5.datadoghq.com、browser-intake-us5-datadoghq.com、formulae.brew.sh、code.claude.com。Desktop/claude.ai はさらに assets-proxy.anthropic.com、他の *.claudeusercontent.com、*.claudemcpcontent.com(MCP App ウィジェット)。これらを塞いで claude.ai だけ許すと空白ページになる。
- 背景エージェント: `claude agents`、`--bg`、`/background` はユーザー単位の supervisor の下で動き、最初にコールドスタートしたシェルの環境を継承して `claude daemon stop --any` まで保持する。プロキシ/CA/mTLS/ランチャーの変数はシェル export でなく `~/.claude/settings.json` か managed の `env` に置く。
- コーポレートランチャー: `CLAUDE_CODE_PROCESS_WRAPPER`(v2.1.208+)/ `processWrapper`(v2.1.210+、環境変数が優先)。契約は `exec "$@"` で終わる、引数を並べ替えない、継承環境をすべて通す、約 3 秒以内に exec に到達する(コールドディスパッチは 2 回直列に走る)、入れ子に耐える、exec 前に出力しない、開始ディレクトリから exec する。値は絶対パス + 引数(`[` で始まれば JSON 配列、シェル構文は拒否)。user か managed スコープのみ(project/local は無視)。対象は supervisor、agent view の各行、再起動、更新のための自己再起動、Remote Control セッションプロセス、agent team の tmux/iTerm2 ペイン。対象外は自分のターミナルセッション(PATH 前方の `claude` スクリプトで包む。managed symlink は置換しない)、deep link の最初のプロセス、`--worktree --tmux` の再起動、Chrome ネイティブホスト。Windows では無視。配備後は `claude daemon stop --any`。`CLAUDE_CODE_SHELL_PREFIX` は別契約で、Bash ツール・hooks・ステータスライン・stdio MCP 起動のシェルコマンドを `$1` に 1 つの引用済み文字列として渡す(`exec bash -c "$1"` で再評価)。

```sh
#!/bin/sh
# Your organization's setup: enter the sandbox, apply
# network controls, or inject credentials.
exec "$@"
```

公式: https://code.claude.com/docs/en/network-config 、https://code.claude.com/docs/en/corporate-launcher 、https://code.claude.com/docs/en/agent-view 、https://code.claude.com/docs/en/env-vars

### 15.18 認証のエッジケース

第11章の優先順位リストを前提に、運用上の罠を補う。

- 資格情報の順位: 1) クラウドプロバイダ(`CLAUDE_CODE_USE_BEDROCK/VERTEX/FOUNDRY`)、2) `ANTHROPIC_AUTH_TOKEN`、3) `ANTHROPIC_API_KEY`、4) `apiKeyHelper`、5) `CLAUDE_CODE_OAUTH_TOKEN`、6) Anthropic profile / federation(`ANTHROPIC_PROFILE` で名指しか federation 変数)、7) `/login` の OAuth。active な `user_oauth` profile は動いている `/login` より下、`oidc_federation` profile は上。サインイン済み apps gateway はこの外で最上位。
- キーなし Console サインイン(v2.1.242+): 「Sign in with your Console account」は API キーを作らず `user_oauth` profile を `~/.config/anthropic`(Windows は `%APPDATA%\Anthropic`)に保存し、マシン上の claude.ai ログインをサインアウトする。クラウドプロバイダ選択時、`forceLoginOrgUUID`/`forceLoginMethod` が claudeai/console のとき、managed ソースが読めないときは拒否され API キー作成に置き換わる。profile は config dir の外にあるため `CLAUDE_CONFIG_DIR` を分けても 2 つのキーなしサインインは共存できない。profile / federation は `--bare`、Desktop、クラウドでは読まれない。
- claude.ai 限定機能(コネクタ、`/schedule`、voice、artifacts、Remote Control)は profile・API キー・auth token・`apiKeyHelper`・クラウドプロバイダが有効な間は消え、`/voice` は `Unknown command` を返す。
- macOS Keychain が書き込みを拒否する(SSH でロック中など)と `~/.claude/.credentials.json`(0600)にフォールバックするが、API キーを作る Console ログインは Keychain が書けるまで失敗する。`CLAUDE_CONFIG_DIR` は `.credentials.json` の場所を変え Keychain エントリのキーにもなる。
- `claude setup-token` は 1 年有効の OAuth トークン(Pro/Max/Team/Enterprise)でモデルリクエストしかできず(Remote Control とコネクタ不可)、`--bare` では読まれない(`--bare` は `ANTHROPIC_API_KEY`、`--settings` の `apiKeyHelper`、クラウド資格情報のみ)。`CLAUDE_CODE_OAUTH_TOKEN` 設定中の `/login` は当該セッションだけを切り替える。
- `forceLoginMethod` は v2.1.212 から VS Code・SDK・setup-token・`/install-github-app` の全経路で強制されるが、ターミナルの対話ログイン画面だけは事前選択にとどまる。`claude setup-token` と `/install-github-app` は `forceLoginOrgUUID` を見ないため他 org のトークンを発行できる。`forceLoginOrgUUID` は managed ソースでのみ強制され、どこかに置くだけでキーなし Console サインインが無効になる。managed ソースはこれらのキーをマージしないので MDM と server-managed の両方に書く。
- `allowedProviders`(managed、v2.1.285+): anthropic、bedrock、vertex、foundry、anthropicAws、mantle、customEndpoint、gateway。未掲載のプロバイダは起動時・ログイン時・セッション中切替後の次リクエストで拒否。空配列や全部未認識なら Claude Code 自体が起動しない。server-managed のリストはマシン側リストを狭めるだけ。
- 期限: `/login` 資格情報が 3 日以内に切れると起動時に `Your login expires in 3 days · run /login to renew` が出る(情報のみ)。切れると毎リクエスト `Login expired · Please run /login`。`/status` の `Login` 行(v2.1.210+)は保存済み claude.ai ログインが有効な資格情報のときだけ現れる。無人の agent view や Remote Control は期限切れで止まる。クラウドセッションは `ANTHROPIC_API_KEY` を無視する。
- SDK/`ant` CLI 側の profile 解決(コンストラクタ引数 > `ANTHROPIC_API_KEY`/`ANTHROPIC_AUTH_TOKEN` > `ANTHROPIC_PROFILE` > federation 変数 > active profile)は platform.claude.com の記述で、残った `ANTHROPIC_API_KEY` が federation を黙って覆う。

公式: https://code.claude.com/docs/en/authentication 、https://code.claude.com/docs/en/settings-reference 、https://code.claude.com/docs/en/headless 、https://platform.claude.com/docs/en/manage-claude/workload-identity-federation

### 15.19 ターミナル UX 層: fullscreen、テーマ、tmux、貼り付け、音声、アクセシビリティ

- レンダラ決定(最初に一致した行が勝つ): `CLAUDE_CODE_DISABLE_ALTERNATE_SCREEN=1` か `CLAUDE_CODE_NO_FLICKER=0` → classic。`NO_FLICKER=1` → fullscreen。失敗起動の記憶 → classic。iTerm2 の `tmux -CC` か Windows への SSH → classic。保存済み `tui` 設定 → その値。feature flag なしで起動ダイアログ消化済み → classic。flag なしで v2.1.239+ の初回起動 → fullscreen。flag ありで 2026 年 5 月 6 日以降に初使用 → fullscreen。それ以外 classic。アタッチした背景セッションは常に fullscreen、スクリーンリーダーモードは常に classic。失敗起動は 1 回で警告と再試行、2 回で更新か `/tui fullscreen` まで classic に固定(バージョンごと集計)。
- `/tui fullscreen|default` は `tui` を保存して再起動し、会話・permission mode・effort・`/model`・`--allowed-tools`/`--disallowed-tools`・`--agent`/`--agents`/`--append-system-prompt` を引き継ぐ。`--system-prompt` 置換、`--tools`、`--setting-sources`、hook/SDK のセッション限定 deny/ask があると `Cannot switch renderers in this session` で拒否。
- fullscreen のトランスクリプトモード(Ctrl+O): `/` 検索、n/N、j/k、g/G、`{`/`}` でプロンプト間移動。`[` は全会話をネイティブスクロールバックに書き出し(モードを抜けるまで)、`v` は `$VISUAL`/`$EDITOR` で開く。`/focus` は最後のプロンプト + ツール要約 1 行 + 最終応答だけの表示を永続化する(`viewMode` が優先)。
- マウス: `CLAUDE_CODE_DISABLE_MOUSE=1`(全キャプチャ停止)、`CLAUDE_CODE_DISABLE_MOUSE_CLICKS=1`(v2.1.195+、ホイールのみ)、`CLAUDE_CODE_SCROLL_SPEED`(20 まで、小数可、JetBrains ターミナルでは無視)、`/scroll-speed`(`~/.claude/settings.json` に保存、ダイアログ上限 10)、`wheelScrollAccelerationEnabled: false`(v2.1.174+)、`CLAUDE_CODE_ALT_SCREEN_FULL_REPAINT=1`(ConPTY の描画残り)。
- `/terminal-setup`: VS Code / Cursor / Devin / Alacritty <0.16 / Zed に Shift+Enter を書き、VS Code 系では `terminal.integrated.gpuAcceleration` を `"off"` にし `terminal.integrated.mouseWheelScrollSensitivity` を設定、Apple Terminal では Option-as-Meta と可聴ベル無効、iTerm2 ではクリップボードアクセス許可。tmux の外で実行する。`~/.tmux.conf` は `set -g allow-passthrough on`、`set -s extended-keys on`、`set -as terminal-features 'xterm*:extkeys'`(ホイールには `set -g mouse on`)。
- 通知と状態: `preferredNotifChannel` は auto(iTerm2/Ghostty/Kitty でデスクトップ通知、Terminal.app は可聴ベルがオフのときだけベル)、terminal_bell、iterm2、iterm2_with_bell、kitty、ghostty、notifications_disabled。Notification hook は置換でなく併走。OSC 7501 のセッション状態は v2.1.295 から自動だが tmux 内(allow-passthrough でも不可)、背景セッション、`CLAUDE_CODE_DISABLE_TERMINAL_TITLE=1` では報告されない。OSC 133 のターン境界マーカーで iTerm2 / VS Code / Windows Terminal がターン間ジャンプできる。
- カスタムテーマ: `~/.claude/themes/<slug>.json` に `name`、`base`(dark|light|dark-daltonized|light-daltonized|dark-ansi|light-ansi)、`overrides`(トークン → 色。`#rrggbb`、`rgb()`、`ansi256(n)`、`ansi:<name>`)。選択すると `theme` に `custom:<slug>`。フォルダは監視されるが起動時に存在しなければ一度再起動。トークンには text/accent(`claude`、`text`、`permission` など)、status、input/mode(`planMode`、`autoAccept`、`fastMode`、`effortUltra`)、diff(`diffAdded`、`diffRemovedWord` など)、fullscreen(`userMessageBackground` など)、usage、shimmer 対、subagent 色 `<red|blue|green|yellow|purple|orange|pink|cyan>_FOR_SUBAGENTS_ONLY`、`rainbow_<色>[_shimmer]`。`maxProseWidth`(整数 ≥40、v2.1.282+)。
- 貼り付け: 800 文字超か 3 行超で `[Pasted text #N +L lines]` に畳まれ、内容は `~/.claude/paste-cache/` に保存されて履歴再呼び出しでも送られる(保持 sweep まで)。貼り付けと明示されるのは feature flag を取得するセッションのみ。不可視 Unicode は Enter で除去され再 Enter を求める。掃除済みの貼り付けを含む履歴は、通常プロンプトならプレースホルダを落として送り、`!`・`/`・空プロンプトでは送信を取り消す。
- 音声: `/voice [hold|tap|off]`、settings の `voice: { enabled, mode, autoSubmit }`。claude.ai サインイン必須、ローカルマイク必須(クラウド/SSH/VS Code Remote 不可)、音声は Anthropic に送られトークンも枠も消費しない。言語は応答言語と共有の `language`(20 言語)。tap モードは空プロンプトで開始し 3 語以上で自動送信、15 秒無音か 2 分で停止。キーは `voice:pushToTalk`(Chat コンテキスト、既定 Space、1 キーのみ。hold モードではキーリピートの warmup で裸文字が入力されるので `meta+k` のような修飾付きを推奨)。
- アクセシビリティ: `--ax-screen-reader` > `CLAUDE_AX_SCREEN_READER`(v2.1.181+、`0` で設定より優先して無効)> `axScreenReader`。スクリーンリーダーモードは classic 固定、メニューに番号、y/n の入力式確認、ベル、確認行後 3 秒待機(`CLAUDE_AX_STARTUP_QUIET_MS`、v2.1.217+)、`you:`/`claude:`/`tool:` などの行ラベル。`CLAUDE_CODE_ACCESSIBILITY=1` は拡大鏡向けにカーソルを残す。`prefersReducedMotion`、daltonized テーマ。

公式: https://code.claude.com/docs/en/fullscreen 、https://code.claude.com/docs/en/terminal-config 、https://code.claude.com/docs/en/voice-dictation 、https://code.claude.com/docs/en/accessibility 、https://code.claude.com/docs/en/interactive-mode

### 15.20 組み込みコマンド一覧の訂正と追加

- 訂正: `/ultraplan <prompt>` は削除済みで、commands.md は「Removed. Use plan mode instead.」と過去形で説明する(以前は plan タスクをクラウドセッションに送っていた)。付録の Week 15(2026 年 4 月 6〜10 日、v2.1.92〜v2.1.101)の記述には削除注記を付けるべきである。
- 追加コマンド: `/import [codex|gemini|cursor] [--dry-run] [--yes]`(v2.1.213+、Cursor は v2.1.265+。instruction ファイル・MCP・コマンド・subagent・スキルを取り込む。`-p` では一覧と確認コマンドの表示のみ。Bedrock/Vertex/Foundry/Claude Platform on AWS/apps gateway と flag 取得オフでは不可。`claude import` のサブコマンド形あり)、`/debug [description]`(バンドルスキル。`--debug` なしで始めたセッションのデバッグログを途中から有効化)、`/insights`(`~/.claude/usage-data/` に HTML レポート、クラウド不可)、`/team-onboarding`(30 日分析と共有リンク)、`/powerup`(対話レッスン)、`/heapdump`(非表示。`.heapsnapshot` と `-diagnostics.json` を `~/Desktop` かホームに書く。snapshot は会話と資格情報を含むので共有しない)、`/mobile`(別名 `/ios`、`/android`)、`/autofix-pr [prompt]`(`gh` とクラウドセッションが必要)、`/statusline`(引数なしでシェルプロンプトから自動構成)、`/design-sync [hint]` + `/design-login`(初回同期は数時間かかり得る、claude.ai 必須)、`/setup-bedrock` / `/setup-vertex`(プロバイダ変数設定まで非表示)、`/chrome`、`/ide`、`/keybindings`、`/tui`、`/voice`、`/scroll-speed`(fullscreen のみ、JetBrains 不可)、`/focus`(fullscreen のみ)、`/release-notes`(対話ピッカー、raw.githubusercontent.com から取得、Claude のコンテキストには入らない)、`/doctor [prompt-audit [path]]`(別名 `/checkup`、prompt-audit は v2.1.283+)。
- メニューの一致規則(v2.1.236+): 入力文字が名前かエイリアスの先頭、または名前内の単語の先頭に一致したときだけ先頭候補がハイライトされ、`:`・`_`・`-` は無視される(`/adddir` → `/add-dir`、`/new` → `/clear`)。誤字の後はハイライトされず Enter でそのまま送信されて `Unknown command`。利用不能なコマンドはメニューから消え `No commands match "/name"`。`/heapdump` のような隠しコマンドは部分一致しないため、フルで入力したときだけ現れる。コマンドはメッセージ先頭でのみ認識され、スキルは最大 6 個まで連鎖できる(第2章参照)。

公式: https://code.claude.com/docs/en/commands 、https://code.claude.com/docs/en/whats-new/2026-w15 、https://code.claude.com/docs/en/feature-availability 、https://code.claude.com/docs/en/interactive-mode

### 15.21 「端末から離れた」階層: モバイル、Remote Control の添付、Projects の制限

- Claude Code に独立したモバイルアプリはない。クラウドセッションと Remote Control は Claude アプリ(iOS/Android)の Code タブにあり、Dispatch はそこでメッセージするタスクである。`/mobile` が claude.ai/mobile の QR コードを出す。接続先は 4 つ: クラウドセッション、Project、Remote Control(自分の PC のセッション)、Dispatch(Desktop アプリ、Pro/Max のみ)。
- アプリから選べる permission mode: クラウドは Accept edits / Plan / Auto、Remote Control はそれに Manual を加えた 4 つ。Bypass はどちらからも選べない。`/plugin` や `/resume` のような端末専用コマンドは動かない。
- 添付: 写真は Claude が直接見るとともに `~/.claude/uploads/` に保存され、パスが Claude に伝えられる(自分の生成物にコピーできる)。それ以外のファイルはマシンにダウンロードされ `@` 参照として渡される。
- プッシュ通知: `/config` の「Push when Claude decides」と「Push when actions required」の 2 トグルだけで、イベント別の設定はない。Claude は `PushNotification` ツールで送る。配信は Anthropic ホストの基盤を通るため Bedrock / Claude Platform on AWS / Agent Platform / Foundry からは使えない。接続端末で入力中は送られない。
- Remote Control に転送された permission prompt と AskUserQuestion 以外のダイアログ(拒否後のモデル選択など)は `dialogExpiry`(既定 "5m"、v2.1.224+)で閉じられ無操作既定で続行する。`askUserQuestionTimeout` は Remote Control 接続中は進まない。
- Projects(本編は Pro/Max・200 スレッド/日・Opus/high を扱った): スレッドはモデルが対応すれば auto mode で走り、承認はスレッド内で答える(プロジェクト会話での「go ahead」は届かない)。プロジェクト指示は 16,000 文字まで。プロジェクトメモリは `MEMORY.md` 索引付きのファイル群で、ローカルの auto memory ともリポジトリの CLAUDE.md とも別物(ローカルスレッドは指示は受けるがメモリは読まない)。「開始前にスレッドを提案」「同時 2 本まで」のような好みはメモリに保存されるが強制されない(唯一の強制は 200 スレッド/日)。クラウドスレッドは途中でリポジトリを自分に追加できるが、そのリポジトリの CLAUDE.md とスキルは開始時に存在せず、次のスレッドには引き継がれない。自分の PC でスレッドを走らせるには v2.1.280+ と「Keep this computer awake for Remote Control」が要り、「Require trusted devices」中は不可。アップロードは Library タブで 100 ファイル / 2 GB(単体 480 MB)、New project ダイアログは 30 MB 超を飛ばし、フォルダは最初の 100 ファイル・200 MB まで(30 MB 超・隠しファイル・`node_modules` 除外)、フォルダは最大 10。利用枠に当たったスレッドはリセットで自動継続するが、routine が始めたスレッドは limit エラーで止まる。

公式: https://code.claude.com/docs/en/mobile 、https://code.claude.com/docs/en/claude-projects 、https://code.claude.com/docs/en/remote-control 、https://code.claude.com/docs/en/platforms

### 15.22 プラグインの relevance シグナルと CLI ヒント

組織のプラグインが「自分を薦める」ための 2 つの小さな仕組み。

```json
{
  "name": "terraform-helpers",
  "source": "./plugins/terraform-helpers",
  "relevance": {
    "topic": "Terraform",
    "signals": {
      "cli": ["terraform"],
      "filesRead": ["**/*.tf"]
    }
  }
}
```

- シグナルと上限: `cwd` 10 パターン × 256 文字、`cli` 10 × 64(完全一致)、`hosts` 20 × 128、`filesRead` 10 × 256、`manifestDeps` 10 エントリ(各値 256 文字、512 KB 超のマニフェストはスキップ。例: `{"file": "[/\\\\]package\\.json$", "pattern": "\"your-sdk\"\\s*:"}`)、`topic` 64 文字。上限超えはプラグインエントリ全体を無効化しインストール不能にする。`cli` は複合コマンドの先頭トークンだけを記録する(`cd infra && terraform plan` は `cd`)。照合はローカルで通信しない。
- 提示頻度: spinner tip とセッション開始行を合わせて 3 セッションに 1 回まで、2 回表示したらセッション開始行は止まる、インストール後は繰り返さない、Discover タブのピン留めは最初に開いたときだけ(`~/.claude.json` に記録)。`spinnerTipsEnabled: false` は tip と開始行を止めるがピン留めは止めない。
- 前提: managed の `pluginSuggestionMarketplaces` にマーケットプレイス名を入れ、公式以外は同じポリシーの `extraKnownMarketplaces` か `strictKnownMarketplaces` でソースも宣言する。`claude plugin validate` が relevance ブロックを検査する(`'relevance' must be an object containing topic and signals; got <type>. It will be ignored at load time.`)。
- CLI ヒント: サードパーティ CLI が `CLAUDECODE`(全バージョン)か `CLAUDE_CODE_CHILD_SESSION`(v2.1.172+、サブプロセス限定)が設定されているときだけ、stderr の独立行に `<claude-code-hint v="1" type="plugin" value="example-cli@claude-plugins-official" />` を出す。Claude Code はモデルに見せる前にその行を剥がし(`v` や `type` が未知でも)、一度きりのインストールダイアログを出す。ダイアログは対話ターミナルのみ(`-p`、subagent、hook 出力、`--cloud`、Remote Control、agent team では不可)、公式マーケットプレイスのローカルコピーにあるプラグインのみ、analytics オンのみ、セッション 1 回・プラグインごと 1 回・マシン 100 プラグインまで、30 秒無応答は No。`CLAUDECODE` だけで判定すると IDE 拡張の統合ターミナルで人間が実行した場合にも出る。

公式: https://code.claude.com/docs/en/plugins/relevance 、https://code.claude.com/docs/en/plugins/cli-hints 、https://code.claude.com/docs/en/plugins/marketplace-reference 、https://code.claude.com/docs/en/plugins/org

### 15.23 Agent SDK のユーザー入力とループ機構

第8章の options と権限評価を前提に、承認と質問がホストに届く経路を補う。

- `canUseTool` はツール承認と `AskUserQuestion` の両方で呼ばれる。`tools` を絞るなら `AskUserQuestion` を含めないと Claude は質問できない。コールバックは無期限に保留でき、長時間の待機には `PreToolUse` hook で `defer` を返してプロセスを終了・再開させる。`defer` は `-p` のみ、ターンに 1 つのツール呼び出しがあるときのみ有効で、`stop_reason: "tool_deferred"` と `deferred_tool_use {id,name,input}` を返し、`claude -p --resume <session-id>` で同じ hook が再び発火して `allow` + `updatedInput` で答える。resume 時に permission mode は復元されない。
- 質問スキーマ: `questions[]`(1〜4)は `question`、`header`(12 文字以内)、`options`(2〜4 個の `{label, description, preview?}`)、`multiSelect`。答えは `updatedInput: { questions, answers: { "<question>": <label | [labels] | "a, b"> }, response? }`。自由入力は「Other」でなく本文を値にする。subagent では使えない。TS の `toolConfig.askUserQuestion.previewFormat: "markdown" | "html"`(html は `<script>`・`<style>`・`<!DOCTYPE>` を SDK が拒否)でプレビューを付けられる。TS の `canUseTool` options には `suggestions`、`suppressAlwaysAllowRule` と `defaultToNo`(SDK v0.3.268+)、`mcpServer`(v0.3.274+)、`toolUseID`、`agentID`、`requestId` が入り、`null` を返してよいのは自分で `control_response` を送った場合だけ(そうでなければ永久ブロック)。
- Python でストリーミングプロンプトと `can_use_tool` を併用するときは、ストリームを開いたままにするダミー `PreToolUse` hook が必須:

```python
# Required workaround: dummy hook keeps the stream open for can_use_tool
async def dummy_hook(input_data, tool_use_id, context):
    return {"continue_": True}
```

  `ClaudeAgentOptions(can_use_tool=..., hooks={"PreToolUse": [HookMatcher(matcher=None, hooks=[dummy_hook])]})` と組み合わせる。
- 並列実行: 読み取り専用の組み込み(Read/Glob/Grep)と `readOnlyHint` 付き MCP ツールは並列、変更系(Edit/Write/Bash)は直列、カスタムツールは既定直列で annotations の `readOnlyHint` でオプトイン。
- 上限: `maxTurns` はツール使用ターンだけを数え、ストリーミング入力ではキューされた各メッセージで数え直す。`maxBudgetUsd` は `/clear` まで累積し subagent も含む(v2.1.217+ では超過時に `Budget limit reached` で spawn 失敗)。チェックは応答到着後なので 1 応答分 + 実行中 subagent 分は超過し得る。単発 `query()` はエラー結果を yield した後に例外を投げる。
- `SystemMessage` の subtype: `init`(TS の `capabilities?: string[]`、v2.1.205+。値は `interrupt_receipt_v1`、`interrupt_cancel_queued_v1`、`sdk_mcp_manifests`、`sdk_mcp_tools_list_changed`)、`compact_boundary`、`informational`、`worker_shutting_down`。hooks はホストプロセスで走りコンテキストを消費しない。
- 権限評価順は hooks → deny → ask → mode → allow → `canUseTool`。`AskUserQuestion` と `requiresUserInteraction` の MCP ツールは allow があっても必ずコールバックに落ち、`dontAsk` では拒否される。`permissionPrompts: 'none'`(v2.1.259+)はコールバックを飛ばして拒否する(PermissionRequest hook が allow した場合を除く)。

公式: https://code.claude.com/docs/en/agent-sdk/user-input 、https://code.claude.com/docs/en/agent-sdk/agent-loop 、https://code.claude.com/docs/en/agent-sdk/hooks 、https://code.claude.com/docs/en/agent-sdk/permissions 、https://code.claude.com/docs/en/agent-sdk/typescript

### 15.24 参照ページ末尾の確認事項とエラー辞典

本編の執筆時に 100,000 文字で切られていた settings-reference / env-vars / errors の末尾から確認できた事項。

- settings-reference: `idleCompaction`(Any file、Boolean、既定 true、v2.1.290+。1 時間 TTL・flag 取得・200,000 トークン以上・約 54 分アイドルの全条件。閾値は `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`、最小 100000)、`skillOverrides`(on|name-only|user-invocable-only|off、プラグインスキル対象外)、`disableBundledSkills`(`/init` なども隠す。`CLAUDE_CODE_DISABLE_BUNDLED_SKILLS=1`)、`permissions.blockReadsOutsideWorkingDirectories`(v2.1.257+、どのファイルの `true` も効き他で解除不可)、`tui`、`voice`、`spinnerVerbs`(`{verbs, mode: append|replace}`)、`maxProseWidth`、`diffTool`、`processWrapper`、`enableArtifact`、`allowedProviders`、`autoMemoryEnabled`/`autoMemoryDirectory`、`feedbackSurveyRate`(サードパーティの組み込み値 0.005)、`dialogExpiry`、`askUserQuestionTimeout`(never|60s|5m|10m)。`~/.claude.json` 限定のキー: `diffTool`、`defaultToAgentsView`(既定 false)、`leftArrowOpensAgents`(既定 true)、`autoConnectIde`、`copyOnSelect`、`claudeInChromeDefaultEnabled`。
- env-vars: `CLAUDE_CODE_SIMPLE_SYSTEM_PROMPT`(15.7 参照)、`CLAUDE_CODE_PROVIDER_MANAGED_BY_HOST`(15.12 参照)、「Features that need feature-flag fetching」と「First session after an install or upgrade」(15.15 参照)。`CLAUDE_CODE_AUTO_MODE_MODEL` は env-vars.md のどこにもなく、文書化されているのは `CLAUDE_CODE_AUTO_MODE_SERVER` だけなので引用しない。
- errors(抜粋): `Prompt is too long` 系には `Context limit reached · /compact or /clear to continue`、`... · auto-compact is off · /config to turn it on`、`Prompt is too long · automatic compaction failed: <error>`、および単一交換で圧縮できない 3 変種(`/compact` は `Not enough messages to compact.` になる。添付・ツール・メモリを減らすか `/clear`)がある。`/context` は `Context exceeds the 200k-token limit by 94k tokens` のように超過量を示す。`Request too large (max 32MB...)` は画像・添付の累積。`Artifacts need a claude.ai login. Run /login and select "Claude account with subscription"...`。`Credit balance is too low`(迷子の `ANTHROPIC_API_KEY` を外すか `/login` か残高追加)。`Concurrent subagent limit reached`(同時 20、`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`、ultracode は対象外、v2.1.217+)。hook の `Stop hook needs quotes around a path with a space (check.py)`、`Managed settings contain invalid entries, including PreToolUse/PermissionRequest hooks that are NOT loaded`。ランチャーの `CLAUDE_CODE_PROCESS_WRAPPER: launcher ... is not an executable regular file` / `must exec, not daemonize`。`Agent descriptions are over the 15.0k-token limit`、`Memory index is over its read limit`(140 行未満に書き直す)、`Agent 'x' would be spawned with zero tools`(ツールゼロの subagent 生成を拒否)、`Permission deny rule ... Write(docs/**) is not matched by file permission checks`、`Bash(git -C * status *) has a wildcard before the rest of the command`、`Denying Bash also turns off the PowerShell tool`。auto mode の無判定エラー(`Auto mode could not evaluate this action and is blocking it for safety`、`Auto mode classifier transcript exceeded context window`、サーバー側で 10 連続無判定後の停止)は `/permissions` > Recently denied に記録されないので、`PermissionDenied` hook で捕捉する。`CLAUDE_CODE_AUTO_MODE_SERVER=0` でクライアント側分類器を強制。
- workflows.md の確認: `budget` グローバル、`+500k` 指示、トークン目標の節はページ上に存在しない。その API はバンドルの `/workflow-authoring` スキル(v2.1.248+)の中にだけあるので、第5章の該当記述は「スキル由来」と注記する。ページが確認しているのは全有料プラン・Bedrock・Agent Platform・Foundry での可用性(Pro は `/config` で有効化)、16 / 4,096 / 1,000 の上限、`/workflows` のキーマップ、`export const meta` の規則(最初の文、`name` と `description` を持つプレーンなオブジェクトリテラル、`Date.now()`・`Math.random()`・引数なし `new Date()`・`import()` の禁止)、25 agent 超か 150 万トークン超での `Large workflow` 警告、`workflowSizeGuideline`、`CLAUDE_CODE_WORKFLOW_PREFIX_STAGGER_MS`(5000)、stall 時最大 5 回再起動である。

公式: https://code.claude.com/docs/en/settings-reference 、https://code.claude.com/docs/en/env-vars 、https://code.claude.com/docs/en/errors 、https://code.claude.com/docs/en/workflows 、https://code.claude.com/docs/en/sub-agents

### 15.25 評価・テストのブループリント(agents / skills / hooks / mods / auto-mode rules)

第2章・第7章の `claude plugin eval` と `claude plugin test`、第13章の評価語彙を、1 本のパイプラインとして組み立てる。各層の詳細はそれぞれの章を参照し、ここでは接続点だけを示す。

1. 再現可能な単発実行: `claude --bare -p "<prompt>" --allowedTools "Read" --output-format json --json-schema '<schema>' | jq '.structured_output'`。`--bare` は hooks・skills・CLAUDE.md・MCP・auto memory を読まず、system reminder も背景タスクもなく(v2.1.286+)、OAuth/keychain を読まないので `ANTHROPIC_API_KEY` か `--settings` の `apiKeyHelper` が必要。将来 `-p` の既定になる。
2. `system/init` による CI ゲート: `plugin_errors[]`(v2.1.283+ で `path`)と `mcp_server_errors[]`(`unknown_type`|`url_missing_type`|`invalid_config`|`reserved_name`、v2.1.219+)は空なら省略されるので「非空で失敗」にできる。`capabilities[]` でバージョン比較の代わりに機能検出する。stderr の警告は手動実行時にしか出ないため JSON を読む。
3. `claude plugin eval`(v2.1.269+): 隔離 HOME で `claude -p` 子プロセスを各アームで 3 回走らせ WITH / W/OUT / Δ を出す。grader は regex / tool_used / tool_order / file_exists(無料)と llm / baseline(判定モデルの 2/3 多数決)。MCP モックは `evals/mocks/<server>/<tool>.md` に `{{input.<field>}}` と `expect:` ガード(違反はスコア 0 で中断)。CI では `--trust-plugin --json results.json --threshold 0.8 --no-publish --max-cost-usd 20` と終了コード 0/1/2/130/143(Δ は終了コードを変えない)。シェル許可はサンドボックスバックエンドが必要。
4. `claude plugin test`: `*.test.ts` を `claude-code/testing` の `test`/`expect`/`mock`/`tier` で書き、`$` の初回呼び出し前に全スタブを `on(name, fn)` で登録する。失敗で終了コード 1。
5. 静的検査: `claude plugin validate <path> [--strict] [--json]`。`--json`(v2.1.259+)の `gatingHooks`(v2.1.290+)で拒否可能な mod hook に `.catch` があるかを機械的に確認する。relevance ブロックとフロントマターも検査するが、symlink は辿らず、パスや配列で書かれた `hooks` エントリは通してしまう。
6. auto-mode ルール: `claude auto-mode defaults [--label '<prefix>']`(組み込み規則の表示、v2.1.208+)、`claude auto-mode config`(有効なマージ結果)、`claude auto-mode critique`(曖昧・冗長・誤検知しやすい自作ルールをモデルが指摘)、`claude auto-mode reset [--yes]`(v2.1.212+)。`autoMode` は project settings から読まれない。人間のチェックポイントは分類器より前に評価される `permissions.ask`(例: `"Bash(git push *)"`)で作る。
7. セッション内テレメトリ: `/skill-doctor`(v2.1.252+、flag 必須。各スキルのコンテキストコストと呼び出し回数、未使用スキルの指摘)、`/doctor prompt-audit [path]`(v2.1.283+)、`/context`、`/usage`(skill / subagent / plugin / MCP 別の帰属)、`claude plugin details <name>`(常時 / 呼び出し時のトークン見積もり)。回帰監視はステータスラインの `prompt_cache.hit_ratio` / `warm` / `misses` と、OTel イベントの `prompt.id` に一致する `prompt_id` で行う(OTel にキャッシュヒット率メトリクスは定義されていない)。
8. 語彙と設計: pass@k(k 回で少なくとも 1 回成功)は 1 回当たれば良いツールに、pass^k(k 回すべて成功)は一貫性が必要な処理に使う。実際の失敗から 20〜50 タスクを作り、起動すべき/すべきでない両方のケースを置き、経路でなく成果を採点し、トランスクリプトを読む。Terminal-Bench 2.0 の計測では、保証割当とキル上限を等しくするとインフラエラーが 5.8% に跳ね上がり、1x〜3x のスコア差はノイズ内(p=0.40)、最多と最少リソースの差は 6 ポイントだった。評価コンテナには保証割当とそれより高いキル上限を別々に指定し、3 ポイント未満の順位差は疑う。
9. 可搬スキル評価: skill-creator の `evals/evals.json`(`{skill_name, evals[{id, prompt, expected_output, files?, expectations[]}]}`)は `claude plugin eval` とは別形式で、互いのファイルを読まない。スキーマは anthropics/skills リポジトリから取得した。agentskills.io の評価ページはこの検証環境から到達できなかったため、その記述は (未検証)。
10. オフラインで検証できないもの: 分類器の判定そのもの(モデル呼び出しで、ユーザーメッセージ・非読み取りツール呼び出し・CLAUDE.md しか見ない)、サーバー側の compaction、サーバー側分類器レビュー。観測点は `/permissions` > Recently denied と `PermissionDenied` hook(`tool_input` を受け取る)。

公式: https://code.claude.com/docs/en/plugin-evals 、https://code.claude.com/docs/en/plugins/mods/test 、https://code.claude.com/docs/en/plugins/cli-reference 、https://code.claude.com/docs/en/auto-mode-config 、https://code.claude.com/docs/en/headless 、https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents 、https://www.anthropic.com/engineering/infrastructure-noise

### 出典

- https://code.claude.com/docs/en/chrome
- https://code.claude.com/docs/en/managed-mcp
- https://code.claude.com/docs/en/network-config
- https://code.claude.com/docs/en/computer-use
- https://code.claude.com/docs/en/desktop-ios-simulator
- https://code.claude.com/docs/en/desktop
- https://code.claude.com/docs/en/desktop-wsl
- https://code.claude.com/docs/en/desktop-scheduled-tasks
- https://code.claude.com/docs/en/feature-availability
- https://code.claude.com/docs/en/artifacts
- https://code.claude.com/docs/en/commands
- https://code.claude.com/docs/en/settings-reference
- https://code.claude.com/docs/en/zero-data-retention
- https://code.claude.com/docs/en/statusline
- https://code.claude.com/docs/en/prompt-caching
- https://code.claude.com/docs/en/keybindings
- https://code.claude.com/docs/en/interactive-mode
- https://code.claude.com/docs/en/voice-dictation
- https://code.claude.com/docs/en/output-styles
- https://code.claude.com/docs/en/env-vars
- https://claude.com/blog/steering-claude-code-skills-hooks-rules-subagents-and-more
- https://code.claude.com/docs/en/vs-code
- https://code.claude.com/docs/en/jetbrains
- https://code.claude.com/docs/en/permission-modes
- https://code.claude.com/docs/en/devcontainer
- https://code.claude.com/docs/en/sandbox-environments
- https://code.claude.com/docs/en/claude-directory
- https://raw.githubusercontent.com/anthropics/claude-code/main/.devcontainer/devcontainer.json
- https://code.claude.com/docs/en/llm-gateway-protocol
- https://code.claude.com/docs/en/llm-gateway
- https://code.claude.com/docs/en/llm-gateway-connect
- https://code.claude.com/docs/en/llm-gateway-rollout
- https://code.claude.com/docs/en/claude-apps-gateway
- https://code.claude.com/docs/en/claude-apps-gateway-config
- https://code.claude.com/docs/en/claude-apps-gateway-spend-limits
- https://code.claude.com/docs/en/claude-apps-gateway-deploy
- https://code.claude.com/docs/en/authentication
- https://code.claude.com/docs/en/amazon-bedrock
- https://code.claude.com/docs/en/google-vertex-ai
- https://code.claude.com/docs/en/microsoft-foundry
- https://code.claude.com/docs/en/claude-platform-on-aws
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/monitoring-usage
- https://code.claude.com/docs/en/analytics
- https://code.claude.com/docs/en/data-usage
- https://code.claude.com/docs/en/hipaa-setup
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/security
- https://code.claude.com/docs/en/platforms
- https://code.claude.com/docs/en/third-party-integrations
- https://code.claude.com/docs/en/debug-your-config
- https://code.claude.com/docs/en/how-claude-code-works
- https://code.claude.com/docs/en/context-window
- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/server-managed-settings
- https://code.claude.com/docs/en/features-overview
- https://code.claude.com/docs/en/corporate-launcher
- https://code.claude.com/docs/en/agent-view
- https://code.claude.com/docs/en/headless
- https://platform.claude.com/docs/en/manage-claude/workload-identity-federation
- https://code.claude.com/docs/en/fullscreen
- https://code.claude.com/docs/en/terminal-config
- https://code.claude.com/docs/en/accessibility
- https://code.claude.com/docs/en/whats-new/2026-w15
- https://code.claude.com/docs/en/mobile
- https://code.claude.com/docs/en/claude-projects
- https://code.claude.com/docs/en/remote-control
- https://code.claude.com/docs/en/plugins/relevance
- https://code.claude.com/docs/en/plugins/cli-hints
- https://code.claude.com/docs/en/plugins/marketplace-reference
- https://code.claude.com/docs/en/plugins/org
- https://code.claude.com/docs/en/agent-sdk/user-input
- https://code.claude.com/docs/en/agent-sdk/agent-loop
- https://code.claude.com/docs/en/agent-sdk/hooks
- https://code.claude.com/docs/en/agent-sdk/permissions
- https://code.claude.com/docs/en/agent-sdk/typescript
- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/errors
- https://code.claude.com/docs/en/workflows
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/plugin-evals
- https://code.claude.com/docs/en/plugins/mods/test
- https://code.claude.com/docs/en/plugins/cli-reference
- https://code.claude.com/docs/en/auto-mode-config
- https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- https://www.anthropic.com/engineering/infrastructure-noise
- https://raw.githubusercontent.com/anthropics/skills/main/skills/skill-creator/references/schemas.md


---

## 付録A 利用枠・クレジットの公式まとめ(2026-10-17 時点)

「クレジットを確認しながら使う」ために、2026年10月17日時点で公式ページから確認できた事実だけをまとめます。数字はすべて Anthropic のサポート記事または公式ドキュメントの記載です。プランや価格は変更されうるので、実行前に `/usage` と `/status` で自分のアカウントの実値を確認してください。

### A.1 用語の整理

| 用語 | 何を指すか | どこで消費されるか |
| - | - | - |
| プラン利用枠(usage limits) | Pro / Max の 5 時間ウィンドウ枠と週次枠。Max には Fable 専用の週次枠が別にある | claude.ai、デスクトップ、モバイル、Claude Code(ターミナル、IDE、デスクトップ、Web)で共有 |
| 利用クレジット(usage credits、旧称 extra usage) | プラン枠を使い切った後に、標準 API 料金で従量課金に切り替えて使い続ける仕組み | Claude と Claude Code の両方。事前チャージ(Add funds)と月次上限、自動リロードを設定できる |
| 月次 API クレジット(monthly API credits) | Max と Team に付く、Claude Platform(API)向けの月次クレジット | API、Console の Playground、Managed Agents、Agent SDK、リンクした Console 組織の API キーで動かす `claude -p` と Agent SDK |

### A.2 プラン利用枠の挙動

- Pro と Max はどちらも 5 時間のセッション枠と週次枠を持ち、Max は Fable 用の週次枠を別に持ちます。
- Web、デスクトップ、モバイルの Claude と、Claude Code(VS Code、Cursor などのフォーク、JetBrains を含む)は同じ枠を共有します。
- 5 時間枠に途中で達した場合、進行中の応答に限り「Usage limit reached · wrapping up」と表示して短く続行する wrap-up allowance があります。小さく上限があり、週次枠にカウントされます。Pro は週に 1 回まで、Max は週次枠の範囲で 5 時間枠ごとに適用されます。段階的に展開中のため、まだ有効でないアカウントもあります。
- 2026年9月14日以降、Claude Code の週次枠は、5月から9月の期間限定プロモーション前と比べて 25% 高い水準に設定されています(Pro、Max、Team、シート制 Enterprise)。
- `ANTHROPIC_API_KEY` 環境変数が設定されていると、サブスクリプション認証より優先され、プラン枠ではなく API 課金になります。意図せず API 課金になっていないか、`/status` で認証方法を確認してください。

### A.3 利用クレジット(usage credits)

- 対象: Pro、Max 5x、Max 20x。
- 有効化: claude.ai の Settings > Usage > Usage credits で Enable、支払い方法を設定、月次上限(Adjust limit)または無制限を選択、Add funds で前払い。残高が閾値を下回ったら自動購入する auto-reload も設定可能。
- 課金基準: 標準 API 料金。
- Claude Code のターミナル利用にも適用され、Claude の会話と合算してカウントされます。
- Max の 5 時間枠、一般の週次枠、Fable 用週次枠のいずれにも使えます。
- モバイルアプリ経由で契約した場合、有効化は Web 版の claude.ai からのみ行えます。
- プラン内に収めたい場合は、クレジットの案内を断り、枠のリセットを待ち、`/status` で残量を確認します。クレジットの案内自体を止めるには `claude logout` の後、Pro または Max の資格情報だけで `claude login` し直します。
- 2.1.302 の修正として、クレジットでしか使えないモデルで返答した直後は、プロンプト提案(prompt suggestions)がクレジットを消費しないようスキップされるようになりました。

### A.4 月次 API クレジット(Max と Team)

2026年10月7日付の更新で、Max と Team プランに月次 API クレジットが付くようになりました。6月に告知されていた「Agent SDK クレジット」は提供されておらず、今回の API クレジットは別のオファーです。

| プラン | 月次クレジット |
| - | - |
| Max 5x | $100 |
| Max 20x | $200 |
| Team Standard シート | $20 / シート |
| Team Premium シート | $100 / シート |
| Team の合算 | 全シート分を一つの残高にプール、上限 $500 / 月 |

- 対象外: Free、Pro、Enterprise。
- 受け取り条件: 対象プランに 7 日以上在籍。claude.ai の Web 版からのみ請求でき、Claude Platform 側に支払い方法は不要。
- 受け取り方: claude.ai の Settings > Billing(Max)または Organization settings > Billing(Team Owner)の API credits で Console 組織をリンク。リンクできる組織は 1 つだけで、変更はサポート経由。Console には claude.ai と同じメールでサインインします。
- 使える用途: Messages API と Message Batches API、Console の Playground、Claude Managed Agents、Claude Agent SDK、リンクした Console 組織の API キーで自分が実行する `claude -p` と Agent SDK。
- 使えない用途: ターミナル、IDE、デスクトップ、Web での対話的な Claude Code。GitHub Action、IDE 拡張、デスクトップアプリから起動した実行(`-p` でも対象外)。Claude、Claude Code、Cowork の利用クレジット(extra usage)。Bedrock、Vertex AI、Foundry 上の Claude。
- 重要: Claude プランでサインインしたまま `claude -p` や Agent SDK を動かすと、API クレジットではなくプラン枠を消費します。API クレジットで動かしたいなら、リンクした Console 組織の API キーを使います。
- 更新: 各請求サイクルの決済後に補充。年払いでも月ごとに付与。未使用分は繰り越されず失効。月次クレジットは購入済みクレジットより先に消費されます。組織内で API キーを持つ全員が同じ残高を使います。
- 使い切った場合: 組織に購入済みクレジットや auto-reload があればそれを使い、なければ次回補充まで API リクエストが止まります。Claude プランに課金されることはありません。

### A.5 Agent SDK と `claude -p` の扱い

Agent SDK のサポート記事には 2 つの日付付き注記があります。

- 2026年6月15日: Agent SDK 利用に関して予告されていた変更は一時停止。Agent SDK、`claude -p`、サードパーティアプリの利用は引き続きサブスクリプション枠を消費する。
- 2026年10月7日: Max と Team に月次 API クレジットが付き、Agent SDK、`claude -p`、Claude API、Managed Agents をカバーする。サブスクリプション枠での利用も引き続き可能。

Claude Code のドキュメント(Legal and compliance)では、Agent SDK を含む製品やサービスを構築する開発者は、Claude Console または対応クラウドプロバイダ経由の API キー認証を使うべきとされています。個人の実験はプラン枠で、配布するプロダクトは API キーで、という線引きが実務上の目安になります。

### A.6 「クレジットを確認しながら」運用するためのコマンドと設定

- `/usage`: プラン枠の残量と、何(スキル、サブエージェント、プラグイン、MCP サーバー)が枠を消費しているかの内訳(2026年5月の Week 21 で追加)。
- `/status`: 認証方法(サブスクリプションか API キーか)と残りの割り当て。
- `/cost`: API キー利用時のセッション累計コスト。サブスクリプション利用時は `/usage` が主。
- `/context`: 現在のコンテキストの内訳。`/context all` で MCP ツールごとのトークン数も見える。
- `/skill-doctor`: 各スキルがコンテキストをどれだけ消費し、どれだけ使われているか(Week 36 で追加)。
- `/stats`: セッションの統計。
- デスクトップアプリの「Auto-continue when limits reset」: 5 時間枠に達したターンを、枠のリセット後に自動再開(Week 33 で追加)。
- `CLAUDE_CODE_RETRY_WATCHDOG` と `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS`(2.1.301 で追加): 無人の再試行モードで、リセットが遠すぎる利用上限に当たったら待たずに終了させる。
- OpenTelemetry の `api_request` イベントに `cache_creation_5m_tokens` と `cache_creation_1h_tokens` が追加され(2.1.300)、キャッシュ書き込みを寿命別に監視できる。

### 出典

- https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- https://support.claude.com/en/articles/12429409-extra-usage-
- https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- https://support.claude.com/en/articles/15910845-claude-code-may-august-2026-weekly-limits-promotion
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/changelog
- https://code.claude.com/docs/en/whats-new


---

## 付録B 2026年3月〜10月の主要アップデート年表

公式の「What's new」週次ダイジェストと changelog から、中級者以上の使い方を変えた項目だけを抜き出しました。バージョンは各週の範囲です。詳細は本文の該当章と https://code.claude.com/docs/en/whats-new を参照してください。

| 週 / 版 | 主要な変更 |
| - | - |
| Week 13 (3/23-27, v2.1.83-85) | auto mode が research preview で登場(分類器が権限プロンプトを肩代わり)。デスクトップで computer use。条件付き `if` hooks。Windows 向けネイティブ PowerShell ツール |
| Week 14 (3/30-4/3, v2.1.86-91) | CLI からの computer use(research preview)。`/powerup` 対話レッスン。MCP 結果サイズのツール別上書き(最大 500K)。プラグインの実行ファイルが Bash の PATH に載る |
| Week 15 (4/6-10, v2.1.92-101) | Ultraplan 早期プレビュー(クラウドで計画→Web で編集→ローカルかリモートで実行。その後 `/ultraplan` コマンドは削除され、現在の commands 一覧にはありません。第15章 15.20 参照)。Monitor ツール(バックグラウンドイベントを会話にストリーム)。`/loop` の自動ペース。`/team-onboarding`。`/autofix-pr` |
| Week 16 (4/13-17, v2.1.105-113) | Claude Opus 4.7 が Max と Team Premium の既定に。`xhigh` effort と `/effort` スライダー。Routines(Web 上で予定、GitHub イベント、API から雲上エージェントを起動)。モバイル push 通知。CLI がネイティブバイナリに |
| Week 17 (4/20-24, v2.1.114-119) | `/ultrareview` 公開 research preview(クラウドでバグ探索エージェント群)。セッション recap。カスタムテーマ |
| Week 18 (4/27-5/1, v2.1.120-126) | Git Bash 不要の Windows。`claude ultrareview` で CI からレビュー。`claude project purge`。`/resume` に PR URL |
| Week 19 (5/4-8, v2.1.128-136) | プラグインを `.zip` と URL から読み込み(`--plugin-dir`, `--plugin-url`)。`worktree.baseRef`。auto mode の hard deny ルール。hooks が `effort.level` と `$CLAUDE_EFFORT` を参照可能 |
| Week 20 (5/11-15, v2.1.139-142) | Agent view(`claude agents`)。`/goal`(完了条件を満たすまで作業継続)。fast mode が Opus 4.7 で既定。Rewind メニューの「Summarize up to here」 |
| Week 21 (5/18-22, v2.1.143-149) | Pro で auto mode。`/usage` がスキル、サブエージェント、プラグイン、MCP サーバー別に枠の消費を分解。`/code-review` コマンド。バックグラウンドセッションが `/resume` に出てピン留め可能 |
| Week 22 (5/25-29, v2.1.150-157) | Claude Opus 4.8 が Max、Team Premium、Enterprise 従量、API の既定に(`/effort xhigh`)。Dynamic workflows(Claude が書くスクリプトで数十〜数百のサブエージェントを編成)。security-guidance プラグイン。fast mode が Opus 4.8 で $10/$50 per MTok |
| Week 23 (6/1-5, v2.1.158-165) | Bedrock、Vertex AI(Agent Platform)、Foundry で auto mode。acceptEdits でコード実行可能ファイルの書き込み前に確認。`/plugin list`。管理設定で Claude Code の版範囲を要求可能 |
| Week 24 (6/8-12, v2.1.166-176) | `/cd`(プロンプトキャッシュを壊さずに作業ディレクトリ移動)。サブエージェントが自分のサブエージェントを生成(バックグラウンド連鎖は 5 段まで)。`--safe-mode`。`fallbackModel` で最大 3 段のフォールバック |
| Week 25 (6/15-19, v2.1.178-183) | Artifacts(セッション出力をライブ共有ページに。Team と Enterprise でベータ)。deny と ask ルールがツールのパラメータに一致(`Tool(param:value)`、例 `Agent(model:opus)`)。`/config key=value`。auto mode が破壊的 git コマンドを遮断 |
| Week 26 (6/22-26, v2.1.185-193) | `claude mcp login` / `logout`。シェルモードがコマンド出力に応答。`/rewind` が `/clear` 前に戻れる。バックグラウンドサブエージェントの権限プロンプトをメインセッションに表示 |
| Week 27 (6/29-7/3, v2.1.195-201) | Claude Sonnet 5 が Pro、Team Standard、Enterprise シートの既定に(ネイティブ 1M コンテキスト、adaptive thinking 既定オン)。Claude in Chrome GA。サブエージェントが既定でバックグラウンド実行。Linux デスクトップベータ |
| Week 28 (7/6-10, v2.1.202-206) | デスクトップの内蔵ブラウザ。`/doctor` が修正まで行うフル診断(`/checkup`)。auto mode がトランスクリプト改変を遮断し、未解決変数の `rm -rf` を確認。agent view の行に状態語と見出し |
| Week 29 (7/13-17, v2.1.207-212) | Artifacts が閲覧者の MCP コネクタを呼ぶ。公開共有リンク、Team/Enterprise の編集者ロール。スクリーンリーダーモード。`/fork`(会話を新しいバックグラウンドセッションに複製)。`/subtask` が v2.1.212 で登場 |
| Week 30 (7/20-24, v2.1.214-219) | Claude Opus 5 が Claude Code の既定 Opus に(1M コンテキスト、fast mode $10/$50 per MTok)。デスクトップに iOS Simulator ペイン(ベータ)。Claude Security プラグイン(多エージェント脆弱性スキャン)。`/code-review` がバックグラウンドサブエージェントに |
| Week 32 (8/3-7, v2.1.220-224) | Cross-session messaging(macOS/Linux)。Self-hosted environments(Team/Enterprise、公開ベータ)。8/14 から Pro、Max、Team の新規セッションは auto mode が既定。VS Code 拡張に Focus view |
| Week 33 (8/10-14, v2.1.225-233) | デスクトップで「Auto-continue when limits reset」。fork mode が対話セッションで既定オン。GitLab MR URL を `--worktree` と `claude agents` で利用可。`@` で他セッションに言及 |
| Week 34 (8/17-21, v2.1.234-239) | `/design`(Claude Design のアートボードを CLI とデスクトップへ、research preview)。組み込みの Concise 出力スタイル。`claude remote-control` のデバイスカード。`ANTHROPIC_DEFAULT_MODEL` |
| Week 35 (8/24-28, v2.1.240-250) | デスクトップで `/resume` から CLI セッションを再開。Claude が書くフィードバック報告。`--restricted`(評価ハーネス向け)。`modelPicker` 設定 |
| Week 36 (8/31-9/4, v2.1.251-261) | Claude Fable 5.1 が 1M コンテキストで利用可能。Pro/Max のデスクトップで computer use がバックグラウンド動作(macOS)。フルスクリーンで `/diff` ライブパネル。`/skill-doctor`(スキルのコンテキストコストと使用頻度) |
| Week 37 (9/7-11, v2.1.263-269) | `claude plugin eval`(テストケース群で採点、プラグイン無しのベースラインと比較。`init` で下書き生成)。デスクトップのペインをポップアウト。`maxEffortLevel` 設定。WebFetch の 5 分タイムアウト |
| 10/1 (v2.1.287) | Mods(プロンプトの書き換え、UI 追加、組み込み機能の置換を行う小さな TypeScript 関数。プラグインで配布、セッション内でホットリロード) |
| 10/7-10/9 (v2.1.293-296) | サブエージェントの `autoCompactWindow`。`CLAUDE_CODE_WORKFLOW_SUBAGENT_MODEL`。hooks の `onFailure`(v2.1.295+) |
| 10/14 (v2.1.299-300) | Idle compaction(200K 超の会話を約 54 分の放置後、1 時間キャッシュ失効前に圧縮)。mods の `virtualText`、`$.ui.view({agentId})`、`prompt.change` フック、workflow agent の `prompt`/`model` 書き換え。OTel の GenAI 属性と `cache_creation_5m/1h_tokens`。AWS 上の Claude Platform で `/advisor` |
| 10/15 (v2.1.301) | `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS`。OTel `tool_decision` に `classifier_verdict`、`permission_mode`、`classifier_category`。vim の `%`。mods の複数行 `Input` |
| 10/16 (v2.1.302) | `CLAUDE_CODE_AUTO_MODE_MODEL`(クライアント側 auto mode 分類器のモデル)。`/config` に Idle compaction 行。`claude -p` と Agent SDK が第三者プロバイダ等では `default` モードで開始。fork サブエージェントが `-p`、SDK、デスクトップ、VS Code でも既定オン(`CLAUDE_CODE_FORK_SUBAGENT=0` で無効)。prompt/agent hooks は同一イベント最大 12 並列。サーバー側 auto mode で長すぎる会話は拒否ではなく圧縮 |

### 出典

- https://code.claude.com/docs/en/whats-new
- https://code.claude.com/docs/en/changelog
