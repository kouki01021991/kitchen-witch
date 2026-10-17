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
