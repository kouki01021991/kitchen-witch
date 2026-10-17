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
