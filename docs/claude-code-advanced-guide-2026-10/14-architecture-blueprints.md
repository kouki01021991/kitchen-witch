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
