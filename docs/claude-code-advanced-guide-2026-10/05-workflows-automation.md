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
