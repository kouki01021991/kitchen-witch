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
