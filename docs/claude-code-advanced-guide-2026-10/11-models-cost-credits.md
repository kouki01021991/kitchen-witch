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
