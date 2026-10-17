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
