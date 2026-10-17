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
