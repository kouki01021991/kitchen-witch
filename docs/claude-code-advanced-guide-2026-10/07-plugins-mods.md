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
