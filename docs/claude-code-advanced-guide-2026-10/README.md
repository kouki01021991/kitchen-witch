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

各章は個別ファイルです。全章を1ファイルにまとめた版は [../claude-code-advanced-guide-2026-10.md](../claude-code-advanced-guide-2026-10.md) にあります(約1MB、GitHub 上では表示されない場合があります)。

- [第1章 CLAUDE.md・メモリ・コンテキスト管理・セッション](01-context-memory.md)
- [第2章 スキルとスラッシュコマンド](02-skills-commands.md)
- [第3章 Hooks(フック)](03-hooks.md)
- [第4章 サブエージェントと並列実行(Agent teams、worktrees)](04-subagents-parallel.md)
- [第5章 ワークフロー・自動化(Workflow tool、goal、scheduled tasks、channels、routines)](05-workflows-automation.md)
- [第6章 MCP(Model Context Protocol)](06-mcp.md)
- [第7章 プラグインと Mods、マーケットプレイス](07-plugins-mods.md)
- [第8章 Claude Agent SDK(TypeScript / Python)](08-agent-sdk.md)
- [第9章 ヘッドレス実行・CI/CD・クラウド/リモート実行・Code Review](09-headless-ci-cloud.md)
- [第10章 権限・設定(settings.json)・サンドボックス・セキュリティ](10-permissions-settings-sandbox.md)
- [第11章 モデル設定・コスト・クレジット/利用枠の管理](11-models-cost-credits.md)
- [第12章 ベストプラクティスと直近の重要アップデート](12-best-practices-whatsnew.md)
- [第13章 Claude Code で「AIのための仕組み」を作る設計パターン](13-ai-system-patterns.md)
- 第14章 全体アーキテクチャと「AIのための仕組み」ブループリント集
- 第15章 追補: 取りこぼしがちな機能と周辺エコシステム
- [付録A 利用枠・クレジットの公式まとめ](90-appendix-credits.md)
- [付録B 2026年3月〜10月の主要アップデート年表](91-appendix-timeline.md)

### 10 分で掴む全体像

#### 2026 年に起きた構造的な変化

1. **権限モデルの既定が auto mode に変わった。** 2026年8月14日以降、Pro、Max、Team の新規対話セッションは分類器が権限プロンプトを肩代わりする auto mode で始まります(v2.1.283 以降)。`claude -p` と Agent SDK は v2.1.302 で `default` 開始に変更されました。「何を allow するか」より「分類器に何を渡し、何を deny と hooks で固めるか」が設計の中心になりました(第10章)。
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

