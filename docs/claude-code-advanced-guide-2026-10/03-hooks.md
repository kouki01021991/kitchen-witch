## 第3章 Hooks(フック)

### この章で分かること

Hooks は Claude Code のライフサイクル上の決まった時点で、ユーザーが定義したコマンド、HTTP エンドポイント、MCP ツール、あるいは別の Claude 評価を「確定的に」走らせる仕組みである。CLAUDE.md が「お願い」であるのに対し、hooks はモデルの判断を経由せずに実行される強制力を持つ。本章では 33 種のイベントと 5 種のハンドラ型、7 箇所の配置場所とそのマージ規則、マッチャーと `if` の評価規則、終了コードと stdout JSON の正確なプロトコル、`onFailure: "block"` によるフェイルクローズ、そして PreToolUse / PostToolUse / Stop / SessionStart / PermissionRequest などの主要イベントごとの決定フィールドを扱う。対象バージョンは v2.1.302 (2026-10-16) 時点の公式リファレンスとチェンジログに基づく。最後に落とし穴の一覧と、すぐ組める実用レシピをまとめる。

### 3.1 全体像: イベント、ハンドラ型、配置場所

#### 33 種のイベントと 3 つのケイデンス

公式リファレンスが列挙するイベントは以下の 33 種である。

- セッション単位: `SessionStart`, `Setup`, `SessionEnd`
- ターン単位: `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `StopFailure`
- ツール呼び出し単位: `PreToolUse`, `PermissionRequest`, `PermissionDenied`, `PostToolUse`, `PostToolUseFailure`, `PostToolBatch`
- 通知・表示: `Notification`, `MessageDisplay`
- subagent / agent team: `SubagentStart`, `SubagentStop`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`
- 環境・設定変更: `InstructionsLoaded`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`
- コンテキスト・モデル: `PreCompact`, `PostCompact`, `PreModelSwitch`, `PostModelSwitch`
- MCP elicitation: `Elicitation`, `ElicitationResult`

ケイデンスは 3 段階である。セッションごとに `SessionStart` と `SessionEnd`、ターンごとに `UserPromptSubmit` / `Stop` / `StopFailure`、agentic loop 内のツール呼び出しごとに `PreToolUse` / `PostToolUse` が発火する。例外として `EndConversation` ツールの呼び出しは PreToolUse / PostToolUse の両方をスキップする。

#### 5 種類のハンドラ型

| type | 動作 |
|---|---|
| `command` | シェルコマンドまたは実行ファイル。stdin に JSON、stdout / 終了コードで結果を返す |
| `http` | 同じ JSON を URL に POST し、レスポンスボディを同じ出力スキーマとして読む |
| `mcp_tool` | 設定済み MCP サーバーのツールを呼び、テキスト出力を command の stdout と同様に扱う |
| `prompt` | 単発の Claude 評価。`{ok, reason}` を返す |
| `agent` | Read / Grep / Glob を持つ subagent を起動(最大 50 ターン、実験的) |

マッチしたハンドラはすべて並列に実行される。同一ハンドラを複数の settings ファイルに定義した場合は一度だけ実行されるが、plugin や skill が持つ同一ハンドラは別物として扱われる。

#### イベントとハンドラ型の対応

全 5 型を受け付けるのは `PermissionDenied`, `PostToolBatch`, `PostToolUse`, `PostToolUseFailure`, `PreToolUse`, `Stop`, `SubagentStop`, `TaskCompleted`, `TaskCreated`, `TeammateIdle`, `UserPromptExpansion`, `UserPromptSubmit` の 12 イベント。`PermissionRequest` は `agent` 以外の 4 型(agent はエラーでスキップ、v2.1.280 以降)。`SessionStart` と `Setup` は `command` と `mcp_tool` のみで、しかも起動時の SessionStart と Setup では MCP サーバーが未接続のため `mcp_tool` は呼ばれずにスキップされる。それ以外(`Notification`, `SessionEnd`, `PreCompact`, `PostCompact`, `ConfigChange`, `FileChanged`, `WorktreeCreate` など)は `command` / `http` / `mcp_tool` の 3 型である。

#### 配置場所 7 箇所とスコープ

| 場所 | スコープ |
|---|---|
| `~/.claude/settings.json` | 全プロジェクト(cloud session では読まれない) |
| `.claude/settings.json` | プロジェクト、コミット対象 |
| `.claude/settings.local.json` | プロジェクト、gitignore 対象 |
| managed policy settings | 組織全体 |
| plugin の `hooks/hooks.json` | plugin 有効時 |
| skill frontmatter | skill 起動時に登録され、以後セッション終了まで持続(`once: true` を除く) |
| subagent frontmatter | その subagent の実行中のみ。`Stop` は `SubagentStop` に変換される |

skill frontmatter の hooks は起動したターン以降も走り続ける点に注意。`once: true` で初回成功後に除去できるが、このフィールドは skill frontmatter でのみ有効で、settings ファイルと agent frontmatter では無視される(失敗、exit 2 でのブロック、タイムアウトでは除去されない)。

```yaml
---
name: secure-operations
description: Perform operations with security checks
hooks:
  PreToolUse:
    - matcher: "Bash"
      hooks:
        - type: command
          command: "./scripts/security-check.sh"
---
```

SKILL.md の frontmatter に書く形式。subagent の `.md` でも同じ構造が使える。

#### マージ規則と disableAllHooks

settings の各レベルの hooks は置換ではなく加算でマージされる。user / project / local は managed の hooks を取り除けない。`"disableAllHooks": true` はそのレベル以下を無効化するが、settings の優先順位に従うので project の `false` が user の `true` を上書きする。`--settings '{"disableAllHooks": true}'` は project / local に勝つ。個別の hook を設定したまま無効化する手段はない。管理者は `allowManagedHooksOnly` で user / project / local / plugin の hooks を全面的に遮断できる(強制有効化された managed plugin は除く)。

### 3.2 マッチャーと if

#### マッチャーの評価規則

`matcher` の評価は含まれる文字で分岐する。

- `"*"`、`""`、省略: すべてにマッチ
- 英数字、`_`、`-`、空白、`,`、`|` のみ: 完全一致、または `|` / `,` 区切りのリスト(`Edit|Write`、`Edit, Write`)
- それ以外の文字を含む: アンカーなしの JavaScript 正規表現(`RegExp.prototype.test`)

正規表現パスは部分一致なので `Edit.*` は `NotebookEdit` にもマッチする。全体一致には `^Edit$` と書く。マッチャーは大文字小文字を区別し、マッチャー非対応イベントに書いても黙って無視される。`FileChanged` と `StopFailure` は完全一致文字集合が狭く(英数字、`_`、`|`)、ハイフンやカンマがあると正規表現パスに落ちる。

MCP ツールは `mcp__<server>__<tool>` という名前で、`mcp__memory__.*` のように `.*` が必須。`mcp__memory` だけでは完全一致扱いになり何にもマッチしない。plugin 同梱の MCP サーバーは `mcp__plugin_<plugin>_<server>__<tool>` という名前になるため、素のサーバー名で書いたマッチャーは発火しない。

#### イベントごとのマッチ対象

| イベント | matcher が比較する値 |
|---|---|
| PreToolUse / PostToolUse / PostToolUseFailure / PermissionRequest / PermissionDenied | ツール名 |
| SessionStart | `startup` / `resume` / `clear` / `compact` / `fork` |
| Setup | `init` / `maintenance` |
| SessionEnd | `clear` / `resume` / `logout` / `prompt_input_exit` / `other`(`bypass_permissions_disabled` は v2.1.234 で廃止) |
| Notification | `permission_prompt`, `idle_prompt`, `auth_success`, `elicitation_*`, `agent_needs_input`, `agent_completed`, `quota_auto_resume_*` |
| SubagentStart / SubagentStop | agent type(`general-purpose`, `Explore`, カスタム `name`, plugin は `my-plugin:reviewer`) |
| PreCompact / PostCompact | `manual` / `auto` |
| PreModelSwitch / PostModelSwitch | 正規化されたモデル名 |
| ConfigChange | `user_settings` / `project_settings` / `local_settings` / `policy_settings` / `skills` |
| DirectoryAdded | `slash_command` / `register_repo_root` |
| FileChanged | リテラルなファイル名 |
| StopFailure | エラー種別 |
| InstructionsLoaded | load reason |
| UserPromptExpansion | コマンド名 |
| Elicitation / ElicitationResult | MCP サーバー名 |

`UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `CwdChanged`, `MessageDisplay` にマッチャーはない。plugin の subagent 型 `my-plugin:reviewer` はコロンを含むので正規表現パスに入る。`^my-plugin:reviewer$` とアンカーすること。

#### if フィールド

`if` はハンドラ単位のフィルタで、permission rule 構文をちょうど 1 つだけ受け付ける(`"Bash(git *)"`、`"Edit(*.ts)"`)。`&&` / `||` / リストは存在せず、複数条件は別ハンドラに分ける。評価されるのはツール系 5 イベント(PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, PermissionDenied)のみで、他のイベントに `if` を付けたハンドラは一切走らない。

Bash に対する `if` はベストエフォートである。先頭の `VAR=value` は剥がされ、`&&` チェーンの各サブコマンドが検査され、`$()` やバッククォートの中も見るが、`$()`、バッククォート、`$VAR` を含むコマンドでパターンがコマンド名より長い場合は hook が走る方に倒れる。パースできないコマンドも hook が走る。v2.1.214 以降 `"Edit(src/**)"` は `<cwd>/src` 配下のみを指し、任意深度には `"Edit(**/src/**)"` と書く。厳密な allow / deny は hooks ではなく permission rules で行う。

### 3.3 command フックの実行形態

`args` の有無で実行形態が変わる。`args` があれば exec 形式で、`command` は PATH 上の実行ファイルとして解決され、シェルを介さず直接 spawn される。各要素はトークン分解もクォート処理もされず 1 引数としてそのまま渡され、`${CLAUDE_PROJECT_DIR}` / `${CLAUDE_PLUGIN_ROOT}` / `${CLAUDE_PLUGIN_DATA}` は単純な文字列置換になる。引数が不要でも `"args": []` と書けば exec 形式になる。`args` がなければ shell 形式(`sh -c`、Windows では Git Bash または PowerShell)で、変数展開、パイプ、`&&`、glob が使える。どちらの形式でも上記 3 つのプレースホルダは環境変数としても渡る。

exec 形式で `"command": "node script.js"` のように空白を含む 1 文字列を書くと spawn に失敗する(警告がログに出る)。Windows の exec 形式は実体が `.exe` である必要があり、npm の `.cmd` シム は起動できないので `node` + スクリプトパスにする。shell 形式ではパスプレースホルダを必ず二重引用符で囲む(`claude plugin validate` は未クォートの `${CLAUDE_PLUGIN_ROOT}` に警告を出す)。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "if": "Bash(rm *)",
            "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh",
            "args": []
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json` に置く。`if` で rm 系以外ではプロセスすら起動せず、`args: []` で exec 形式にしてクォート問題を避ける。対になるスクリプトは次の通り。

```bash
#!/bin/bash
COMMAND=$(jq -r '.tool_input.command')
if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{hookSpecificOutput: {hookEventName: "PreToolUse", permissionDecision: "deny", permissionDecisionReason: "Destructive command blocked by hook"}}'
else
  exit 0
fi
```

`.claude/hooks/block-rm.sh`(`chmod +x` が必要)。JSON は `jq -n` で組み立て、文字列連結でのエスケープ漏れを防ぐ。

### 3.4 入出力プロトコル

#### stdin の共通フィールド

全イベント共通で `session_id`, `prompt_id`, `transcript_path`, `cwd`, `scratchpad_dir`(v2.1.257+), `permission_mode`(`default` / `plan` / `acceptEdits` / `auto` / `dontAsk` / `bypassPermissions`。Manual は `default` として届く), `effort`(`level` は low / medium / high / xhigh / max), `hook_event_name` が入る。subagent 内または `--agent` セッションでは `agent_id` / `agent_type` が加わる。settings / managed / plugin の hooks は subagent 内でも同じように発火する。MCP ツールのツール系イベントには `mcp_server: {name, source}`(v2.1.274+)が付き、信頼判定は名前の接頭辞ではなく `source` で行うべきとされている。

`cwd` は Claude の現在位置に追従するが、`${CLAUDE_PROJECT_DIR}` は worktree 内でもセッション開始時のプロジェクトルートに固定される。`$CLAUDE_MODEL` という環境変数は存在しない。`$CLAUDE_CODE_REMOTE` は cloud で `true`、`$CLAUDE_EFFORT` に effort レベルが入る。hooks は親プロセスの環境を継承するが `OTEL_*` エクスポータ変数は除かれ、制御端末を持たないので `/dev/tty` への書き込みは失敗する。

#### 終了コード

| 終了コード | 意味 |
|---|---|
| 0 | 成功。stdout が JSON として解釈される |
| 2 | ブロッキングエラー。stderr が理由として使われる |
| それ以外 | 非ブロッキングエラー。動作は続行(`onFailure: "block"` を除く) |

exit 1 は Unix の慣習に反してブロックではない。ポリシー強制は exit 2 か JSON の deny で行う。exit 0 の stderr は Claude に見せられない。非 0 かつ非 2 の終了コードで有効な JSON を出力した場合、終了コードは無視され JSON だけが効く。逆に exit 2 は JSON が allow と言っていてもブロックする。`Stop` / `SubagentStop` / `TaskCompleted` と plugin の `UserPromptSubmit` では、stdout 空かつ stderr が `No such file or directory` の exit 2 は非ブロッキングに格下げされる(スクリプトパスの typo で永久ブロックを避けるため)。

#### exit 2 がブロックできるイベント

ブロック可能: `PreToolUse`(ツール呼び出し), `UserPromptSubmit`, `UserPromptExpansion`, `Stop`, `SubagentStop`, `TeammateIdle`, `TaskCreated`(ロールバック), `TaskCompleted`, `ConfigChange`(`policy_settings` 以外), `PostToolBatch`, `PreCompact`, `PreModelSwitch`, `Elicitation`(decline 扱い), `ElicitationResult`, `WorktreeCreate` / `WorktreeRemove`(非 0 全般が失敗扱い)。

ブロック不能: `PermissionRequest`(exit 2 は無視され、`decision` オブジェクトでのみ deny できる), `PostToolUse` / `PostToolUseFailure`(stderr は Claude に見せられるだけ), `StopFailure`, `PermissionDenied`, `Notification`, `Setup`, `SubagentStart` / `SessionStart` / `SessionEnd` / `CwdChanged` / `FileChanged` / `PostCompact` / `PostModelSwitch`(stderr はユーザーに表示のみ), `DirectoryAdded`, `InstructionsLoaded`, `MessageDisplay`。

#### onFailure: "block" によるフェイルクローズ(v2.1.295+)

既定では hook の失敗はフェイルオープンで、スクリプトが存在しない、クラッシュした、タイムアウトした、不正な JSON を吐いた、といったケースでは PreToolUse のツール呼び出しはそのまま通る。`"onFailure": "block"` を `command` / `http` ハンドラに付けると、これらの失敗がそのイベントでの exit 2 と同じ効果になる(PermissionRequest では deny)。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "node",
            "args": ["${CLAUDE_PROJECT_DIR}/.claude/hooks/check-command.js"],
            "onFailure": "block"
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json`。失敗時のエラー文は `failed; blocking because onFailure is "block"` または `timed out`。非 0 / 非 2 の終了コードは、JSON で `permissionDecision: "allow"` を出していても失敗とみなされる。`Stop` / `SubagentStop` / `TaskCompleted` / `TeammateIdle`(exit 2 が「作業を続けろ」を意味するイベント)と `async` / `asyncRewake` ハンドラには効果がない。Agent SDK のコールバック hooks は例外で、PreToolUse / UserPromptSubmit でタイムアウトすると既定でフェイルクローズする。

#### stdout の解釈規則(exit 0)

- 1 つの JSON オブジェクト(1 行でも複数行でも)で周囲が空白のみ: JSON として解釈
- `{` で始まらない、または `{` で始まるが `}` で終わらない: プレーンテキスト(JSON 配列やクォート文字列もプレーンテキスト扱い)
- 各行が独立した JSON になる複数行: どの行も出力フィールドを持たなければプレーンテキスト、持てばパース失敗
- `{` で始まり `}` で終わるが JSON として不正: パース失敗(非ブロッキングエラー、`onFailure: block` なら失敗扱い。v2.1.248 以降はプレーンテキストに落ちず hook error として報告される)

プレーンテキストがコンテキストに追加されるのは `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `PostModelSwitch` のみで、他のイベントでは捨てられる。

#### 共通出力フィールド

| フィールド | 動作 |
|---|---|
| `continue` | `false` で Claude の処理を完全停止。イベント固有の決定より優先 |
| `stopReason` | `continue: false` のときユーザーに表示され、会話に残る |
| `suppressOutput` | 受理されるが何もしない(成功時の stdout はもともと表示されない) |
| `systemMessage` | ユーザーに警告として表示 |
| `terminalSequence` | 許可リスト内の OSC 0/1/2/9/99/777 または BEL を Claude Code の端末出力経路で発行 |

`continue: false` は `TaskCreated` と `TaskUpdate` 起点の `TaskCompleted` で明示的に無視され、`Notification`, `Setup`, `SessionEnd`, `PreCompact`, `PostCompact`, `CwdChanged`, `FileChanged`, `DirectoryAdded`, `MessageDisplay`, `ConfigChange`, `InstructionsLoaded`, `Elicitation`, `WorktreeCreate` でも捨てられる。PreToolUse / PostToolUse からの `continue: false` は、ツールが失敗した場合やストリーミング中に完了した場合にも停止が適用される。

`additionalContext`, `systemMessage`, `initialUserMessage` とプレーン stdout は hook ごとに各 10,000 文字で打ち切られ、超過分はセッションディレクトリのファイルに保存されて 2,000 文字のプレビューとパスだけが渡る(Claude に読めとは指示されない)。Bash 出力上限と違いこの上限を上げる設定はない。`additionalContext` は必ず `hookSpecificOutput` の中に `hookEventName` と並べて書く。トップレベルに置くと黙って無視され、`--debug` ログの `Hook JSON output had unrecognized keys` でしか気付けない。`additionalContext` の文面は命令形のシステム指示ではなく事実の陳述として書く。「system がこう命じる」という体裁の文はプロンプトインジェクション防御に引っかかり、Claude がコンテキストとして使う代わりにユーザーに「こんな文が注入された」と報告してしまう。`<system-reminder>` タグは v2.1.292 以降エスケープされる。

#### イベント別の決定フィールド

| イベント | 決定の書き方 |
|---|---|
| UserPromptSubmit, UserPromptExpansion, PostToolUse, PostToolUseFailure, PostToolBatch, Stop, SubagentStop, ConfigChange, PreCompact | トップレベル `decision: "block"` + `reason` |
| PreToolUse | `hookSpecificOutput.permissionDecision`(allow / deny / ask / defer)+ `permissionDecisionReason` + `updatedInput` + `additionalContext`。旧 `decision: approve\|block` は非推奨だが allow / deny にマップされる |
| PreModelSwitch | `permissionDecision`(allow / deny / ask)または `decision: block`。`defer` / `updatedInput` / `additionalContext` は不可 |
| PermissionRequest | `hookSpecificOutput.decision.behavior`(allow / deny)+ `updatedInput` / `updatedPermissions` / `message` / `interrupt` |
| PermissionDenied | `hookSpecificOutput.retry: true` |
| TeammateIdle, TaskCompleted | exit 2 または `continue: false` |
| TaskCreated | exit 2 または `decision: block`(`continue: false` は無視) |
| Elicitation, ElicitationResult | `action`(accept / decline / cancel)+ `content` |
| MessageDisplay | `displayContent` |
| SessionStart | `additionalContext`, `initialUserMessage`, `sessionTitle`, `watchPaths`, `reloadSkills` |

#### タイムアウト

既定値は `command` / `http` / `mcp_tool` が 600 秒、`prompt` が 30 秒、`agent` が 60 秒。`UserPromptSubmit` / `PreModelSwitch` / `PostModelSwitch` では command 系が 30 秒、`MessageDisplay` では 10 秒に下がる。`SessionEnd` は全 hooks で 1.5 秒の予算を共有し、settings ファイル内の hook の `timeout` の最大値(plugin は数えない、上限 60 秒)または `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`(v2.1.268 以降は per-hook 既定値にもなる)で延ばせる。`async: true` の command hook にはタイムアウトが適用されないが、`asyncRewake` には適用される。タイムアウトした command / http / mcp_tool hook は出力を捨てられ、PreToolUse ではツール呼び出しが通り(`onFailure: block` を除く)、PreModelSwitch では逆に切り替えがブロックされる。

### 3.5 主要イベントの詳細

#### PreToolUse

すべての permission mode のチェックより前に発火し、`bypassPermissions` や `--dangerously-skip-permissions` でも hook の deny は効く。逆方向は成り立たず、hook の `allow` は対話プロンプトを飛ばすだけで deny / ask ルール(managed の deny リスト含む)、ネットワークパス(UNC)の読み取り、`requiresUserInteraction` な MCP ツール、組織が `ask` に設定したコネクタツールの制約は残る。plan mode では hook の allow があっても通常の plan mode プロンプト / ブロックが掛かる(v2.1.299 で修正)。hook の `ask` は auto mode でもプロンプトを強制する(v2.1.211 以降、classifier は deny できるが黙って承認はできない)。

複数の PreToolUse hook が異なる決定を返したときの優先順位は deny > defer > ask > allow。全 hook は並列に最後まで走るので、deny が出ても兄弟 hook の副作用(ログ書き込みなど)は抑止されない。`updatedInput` を複数 hook が返すと最後に終わったものが非決定的に勝つため、1 ツールにつき書き換え hook は 1 つに限る。

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PreToolUse",
    "permissionDecision": "allow",
    "permissionDecisionReason": "My reason here",
    "updatedInput": {
      "field_to_modify": "new value"
    },
    "additionalContext": "Current environment: production. Proceed with caution."
  }
}
```

PreToolUse command hook が stdout に出す JSON。`updatedInput` は入力オブジェクト全体を置換するので変更しないフィールドも含める。permission rules と Bash の auto-background 判定は書き換え後の入力に対して再評価される。v2.1.300 以降は Claude 自身の入力と同様に検証され、未知のキーは落とされ、ツールが拒否する入力なら呼び出しは deny される。`AskUserQuestion` と `ExitPlanMode` は `allow` だけでは不十分で、`updatedInput` に回答(`answers` マップなど)を載せる必要がある。`ExitPlanMode` の `tool_input` には Claude Code が `plan` と `planFilePath` を注入してから hook に渡す。

`permissionDecisionReason` の行き先は決定ごとに異なる。`ask` ではユーザーへのプロンプトに表示され(`-p` で答える人がいない場合は Claude がツール結果で読む)、`deny` では Claude に、`allow` / `defer` ではデバッグログのみ。`ask` プロンプトには `[settings]` / `[plugin:<name>]` / `[skill]` という出所ラベルが付く。

`defer` は `-p` モード専用で、1 ターンに単一のツール呼び出しがあるときだけ機能する。プロセスは `stop_reason: "tool_deferred"` と `deferred_tool_use` {id, name, input} を返して終了し、呼び出し側は `claude -p --resume <id>` で再開する。再開時に PreToolUse が再び発火し、hook が allow + `updatedInput` を返す。複数ツール呼び出しのバッチでは警告とともに無視される。再開期限はなく、セッションは `cleanupPeriodDays`(既定 30 日)の範囲で残る。

発火しないケースにも注意する。`@file` でプロンプトに添付したファイルはプロンプト構築時に挿入されるのでツール呼び出しがなく、`Read` にマッチする hook も走らない。強制したければ Read の deny ルールか `CLAUDE_CODE_DISABLE_FILE_MENTIONS=1`(v2.1.299+、シェル / user settings / managed settings でのみ有効で project / local settings では無視)を使う。スキーマ不正や未知ツールの検証却下では PreToolUse も PostToolUseFailure も発火しない。ファイル系ツールの `tool_input.file_path` は `~` や相対パスが展開済みの絶対パスで届くので、表記ゆれで迂回されることはない。Windows では Git Bash 下でもバックスラッシュ区切りで届くため、`FILE_PATH="${FILE_PATH//\\//}"` で正規化してからマッチさせる。

```bash
#!/bin/bash
# protect-files.sh

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Normalize Windows backslash separators so the patterns below match
FILE_PATH="${FILE_PATH//\\//}"

PROTECTED_PATTERNS=(".env" "package-lock.json" ".git/")

for pattern in "${PROTECTED_PATTERNS[@]}"; do
  if [[ "$FILE_PATH" == *"$pattern"* ]]; then
    echo "Blocked: $FILE_PATH matches protected pattern '$pattern'" >&2
    exit 2
  fi
done

exit 0
```

`.claude/hooks/protect-files.sh`。登録は `{"hooks":{"PreToolUse":[{"matcher":"Edit|Write","hooks":[{"type":"command","command":"\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/protect-files.sh"}]}]}}`。exit 2 でブロックし、stderr の行が Claude へのフィードバックになる。

#### PostToolUse / PostToolBatch

PostToolUse はツール実行後に発火するため、ファイル書き込みやネットワーク送信はすでに完了している。出力で変えられるのは Claude に見える内容だけである。

| フィールド | 動作 |
|---|---|
| `updatedToolOutput` | ツールの出力形状に一致する値で Claude に見せる結果を置換。組み込みツールで形状不一致なら無視、MCP ツールは無検証で通る |
| `updatedMCPToolOutput` | MCP ツール専用の置換。`updatedToolOutput` の使用が推奨 |
| `additionalContext` | ツール結果の隣に注入 |
| `classifierContext` | auto mode の classifier への注記(v2.1.236+、1 呼び出しあたり全 hook 合計 2,000 文字、async からは無視) |
| `decision: "block"` + `reason` | 元の出力は隠さず、理由を Claude に付ける |

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PostToolUse",
    "additionalContext": "Additional information for Claude",
    "updatedToolOutput": {
      "stdout": "[redacted]",
      "stderr": "",
      "interrupted": false,
      "isImage": false
    }
  }
}
```

Bash の出力形状は `{stdout, stderr, interrupted, isImage}`。telemetry は元出力をすでに記録している。

`Edit|Write` にマッチする PostToolUse は、Bash コマンドや外部プロセスがファイルを書き換えた場合には発火しない。それを拾うには `FileChanged` を使うか、`Bash|PowerShell` にマッチして `git status --porcelain` を見る。v2.1.269 以降、`bashEditDiffEnabled` を有効にすると Bash の `tool_response.bashEditDiff` に `changedFiles`(最大 200 件)、`files`(最大 5 ファイルの差分)、`moreFiles`、`skipped`、`shared` などが入る(public beta、形状変更の可能性あり、レビュー補助用でポリシー強制には使わないとされる)。入力には `duration_ms` も含まれる。

`Agent` ツールの PostToolUse には subagent の実行情報が `tool_response` に入る。`status`(`completed` / `async_launched`)、`agentId`、`content`、`resolvedModel`、`totalTokens`(最終 API リクエストのみ)、`totalDurationMs`、`totalToolUseCount`、`usage` など。親に subagent の結果を踏まえたコンテキストを注入するにはここを使う。

PostToolBatch は並列ツールバッチごとに 1 回発火し、`tool_calls` 配列を受け取る。各要素の `tool_response` は PostToolUse の構造化出力ではなく、モデルが見るシリアライズ済み `tool_result`(Read なら行番号付きテキスト)である。`decision: "block"` または `continue: false` で次のモデル呼び出し前に agentic loop を止められる。

```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npx prettier --write"
          }
        ]
      }
    ]
  }
}
```

`.claude/settings.json`。Edit / Write 後に Prettier を掛ける最小形。成功時はトランスクリプトに何も出ない。

#### UserPromptSubmit / UserPromptExpansion

UserPromptSubmit はプロンプトを書き換えられない。できるのはブロック(`decision: "block"`、`reason` / stderr がユーザーに表示)、`additionalContext` の追加、`sessionTitle` の設定、`suppressOriginalPrompt` である。既定タイムアウトが 30 秒なのはモデル処理をブロックするためで、タイムアウトすると出力ごと捨てられてプロンプトは Claude に届く(`onFailure: block` を除く)。スケジュールタスク、バックグラウンド subagent の報告、クロスセッションメッセージでも発火する。v2.1.299 以降は skill / カスタムスラッシュコマンドの展開前に走るので、hook は `/skill args` を入力されたまま見るし、ブロックすれば skill 内の `` !`cmd` `` 注入も止まる。skill 自身の frontmatter にある UserPromptSubmit hook は、skill を起動したプロンプトの次のプロンプトから走る。ブロックされたプロンプトもディスク上のトランスクリプトには残る(`suppressOriginalPrompt` でも prompt history には残る)。

UserPromptExpansion は PreToolUse が取りこぼす経路を埋める。`Skill` ツールにマッチする PreToolUse は Claude がツールを呼んだときだけ発火し、ユーザーが `/skillname` を直接入力した場合は発火しない。UserPromptExpansion は `command_name` にマッチし、入力には `expansion_type`(`slash_command` / `mcp_prompt`)、`command_args`、`command_source`、`prompt` が入り、`decision: block` または `additionalContext` を返せる。

#### PermissionRequest / PermissionDenied

PermissionRequest は Claude Code がプロンプトを出す直前(非対話セッションで auto-deny する直前)にのみ発火する。exit 2 は無視され、`hookSpecificOutput.decision.behavior` の allow / deny だけが効く。`updatedInput` で入力を書き換え、`updatedPermissions` で `addRules` / `replaceRules` / `removeRules` / `setMode` / `addDirectories` / `removeDirectories` を `session` / `localSettings` / `projectSettings` / `userSettings` に適用できる。入力の `permission_suggestions` は同じスキーマなのでそのまま `updatedPermissions` に返せる。`setMode` で `bypassPermissions` にするのはセッションが bypass 可能で起動した場合のみ有効で、`defaultMode` には永続化されない。Cowork cloud session では `setMode` が無視され(v2.1.300)、auto mode ではシェルコマンドや subagent を承認できない(v2.1.299)。`--permission-prompt-tool` や SDK の `canUseTool` ホストがある場合は hook と並走し、先に決めた方が適用される。

```json
{
  "hookSpecificOutput": {
    "hookEventName": "PermissionRequest",
    "decision": {
      "behavior": "allow",
      "updatedPermissions": [
        { "type": "setMode", "mode": "acceptEdits", "destination": "session" }
      ]
    }
  }
}
```

ExitPlanMode を自動承認して `acceptEdits` に切り替える出力。登録は `{"hooks":{"PermissionRequest":[{"matcher":"ExitPlanMode","hooks":[{"type":"command","command":"echo '{\"hookSpecificOutput\": {\"hookEventName\": \"PermissionRequest\", \"decision\": {\"behavior\": \"allow\"}}}'"}]}]}}`。マッチャーは可能な限り狭く保つ。空や `.*` にするとファイル書き込みもシェルコマンドも全部自動承認される。

PermissionDenied は auto mode の classifier が deny したときだけ発火し、手動 deny、PreToolUse のブロック、deny ルール一致では発火しない。`hookSpecificOutput.retry: true` でモデルに再試行を許可できる(verdict なしの deny では無視)。exit code と stderr は無視され、prompt / agent hook は走るが出力は捨てられる。

#### Stop / SubagentStop

Stop はタスク完了時ではなく「ターンが終わるたび」に発火する。ユーザー割り込みでは発火せず、API エラーは `StopFailure` になる。入力には `stop_hook_active`(すでに Stop hook による継続中なら true)、`last_assistant_message`、`background_tasks`、`session_crons` が入る。無限ループ防止のため `stop_hook_active` を必ず確認し、最終メッセージは非同期書き込みで遅延する `transcript_path` ではなく `last_assistant_message` から取る。`background_tasks`(`shell` / `subagent` / `monitor` / `workflow` / `teammate` / `cloud session` / `MCP task`)と `session_crons` を見れば「完了」と「バックグラウンド待ち」を区別できる。

```bash
#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0  # Allow Claude to stop
fi
# ... rest of your hook logic
```

公式のループガード。この後に `if [ -n "$(git status --porcelain)" ]; then echo 'Uncommitted changes remain. Commit before finishing.' >&2; exit 2; fi` のような条件を足すと、exit 2 が「stderr を次の指示として作業を続けろ」になる(この拡張部分は公式サンプルではなく、文書化された exit 2 セマンティクスに基づく構成)。Claude Code は連続 8 回の継続で次のブロックを無視してターンを終える。カウンタは Claude がツールを呼ぶたびにリセットされ、上限は `CLAUDE_CODE_STOP_HOOK_BLOCK_CAP` で上げられる。`hookSpecificOutput.additionalContext` を Stop で返すと、エラー表示なしの「Stop hook feedback」として同じループ保護下で会話が続く。`/goal` はこれをセッション限定の prompt hook として組み込んだものである。

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "prompt",
            "prompt": "You are evaluating whether Claude should stop working. Context: $ARGUMENTS\n\nAnalyze the conversation and determine if:\n1. All user-requested tasks are complete\n2. Any errors need to be addressed\n3. Follow-up work is needed\n\nRespond with JSON: {\"ok\": true} to allow stopping, or {\"ok\": false, \"reason\": \"your explanation\"} to continue working.",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

prompt 型による完了判定。`$ARGUMENTS` は hook 入力 JSON に置換される。条件が原理的に満たせない場合はモデルが `impossible: true` を返してターンを終えられる。

SubagentStop は `agent_transcript_path`、`last_assistant_message`、親セッション由来の `background_tasks` / `session_crons` を受け取り、Stop と同じ決定方式を使う。Claude Code 内部の agent(プロンプト提案、`/btw`)でも空の `agent_type` で発火するので、特定マッチャーは拾わないが空 / `*` / 空にマッチする正規表現は拾う。auto mode(v2.1.271+)で `SubagentHandback` を使う subagent の報告は `last_assistant_message` ではなくそのツールの `tool_input.message` に入る。SubagentStart は subagent への `additionalContext` 注入に使え、同じ subagent の再開時にはすでに持っていれば再注入せずプロンプトキャッシュを保つ。subagent の結果を親に注入したいなら `Agent` ツールの PostToolUse を使う。

#### SessionStart と CLAUDE_ENV_FILE

マッチャーは `startup` / `resume` / `clear` / `compact` / `fork`(fork は v2.1.214 以前は `resume` と報告)。起動時、`--continue` / `--resume`、`/clear` ではバックグラウンドで走り、Claude の最初の応答はそれを待ち、その間に入力されたプロンプトは保留される(Esc で取り戻せる)。セッション内 `/resume` は hooks を待つ。resume / fork では `seconds_since_last_response`、`context_tokens`、`prompt_cache_likely_expired`、`estimated_cache_write_usd`(v2.1.251+)も届く。`model` は `/clear` 後などで欠けることがある。

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Current branch: feat/auth-refactor\nUncommitted changes: src/auth.ts, src/login.tsx\nActive issue: #4211 Migrate to OAuth2",
    "sessionTitle": "auth-refactor"
  }
}
```

コンテキストだけ足すなら JSON を組まずプレーンテキストを print するだけでも Claude のコンテキストに入る。`sessionTitle` は startup / resume / fork でのみ適用。compaction 後に指示を再注入するには `"matcher": "compact"` のグループで `echo 'Reminder: use Bun, not npm. Run bun test before committing. Current sprint: auth refactor.'` のように出す。`initialUserMessage` は `-p` のみ。`reloadSkills: true` を返すと hooks 完了後に skill ディレクトリを再スキャンするので、hook がインストールした skill を同じセッションで使える。

```bash
#!/bin/bash

git -C ~/.claude/skills/team-skills pull --quiet 2>/dev/null || \
  git clone --quiet https://git.example.com/your-org/team-skills.git ~/.claude/skills/team-skills

echo '{"hookSpecificOutput": {"hookEventName": "SessionStart", "reloadSkills": true}}'
```

チーム共有 skill リポジトリを SessionStart で同期する公式例。

`CLAUDE_ENV_FILE` は `SessionStart`, `Setup`, `CwdChanged`, `FileChanged` の 4 イベントでのみ利用でき、`export NAME=value` 行を追記(`>>`)すると以後のすべての Bash コマンドの前に source される。CwdChanged / FileChanged で書いた変数は次の CwdChanged でクリアされる。PowerShell で実行される hook はこの変数を持たず、PowerShell ツールのコマンド側が変数を受け取るのはファイルの全行が単純代入(`$PATH` 参照、`source`、`$'...'` なし)の場合だけ(v2.1.296+)。v2.1.295 で `/resume` / `/branch` 後も変数が残るよう修正された。

```bash
#!/bin/bash

ENV_BEFORE=$(export -p | sort)

# Run your setup commands that modify the environment
source ~/.nvm/nvm.sh
nvm use 20

if [ -n "$CLAUDE_ENV_FILE" ]; then
  ENV_AFTER=$(export -p | sort)
  comm -13 <(echo "$ENV_BEFORE") <(echo "$ENV_AFTER") >> "$CLAUDE_ENV_FILE"
fi

exit 0
```

環境の差分だけを書き出す公式パターン。単純には `echo 'export NODE_ENV=production' >> "$CLAUDE_ENV_FILE"` でよい。

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "direnv export bash > \"$CLAUDE_ENV_FILE\""
          }
        ]
      }
    ],
    "CwdChanged": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "direnv export bash > \"$CLAUDE_ENV_FILE\""
          }
        ]
      }
    ]
  }
}
```

`~/.claude/settings.json`。各 `.envrc` ディレクトリで `direnv allow` しておく。`direnv export bash` は `$'...'` を含むので PowerShell ツールには変数が渡らない。

#### Notification

副作用専用のイベントで、`systemMessage` / `continue` は捨てられ `terminalSequence` だけが効く。`permission_prompt` はプロンプト表示から約 6 秒間キー入力がないと発火し(端末ではキー入力ごとに延期、Claude Desktop / VS Code では延期なしで 6 秒後、先に答えれば発火しない)、`idle_prompt` は Claude 完了から約 60 秒後、バックグラウンド agent がないときだけ発火する(v2.1.288 で修正)。権限要求に即時反応したいなら PermissionRequest を使う。desktop 通知を `preferredNotifChannel` で切っていても hooks は発火する。

```bash
#!/bin/bash
# Notification hook: ping the desktop when Claude Code needs attention.
input=$(cat)
title="Claude Code"
body=$(jq -r '.message // "Needs your attention"' <<<"$input")
seq=$(printf '\033]777;notify;%s;%s\007' "$title" "$body")
jq -nc --arg seq "$seq" '{terminalSequence: $seq}'
```

hooks には `/dev/tty` がないため、エスケープシーケンスを返して Claude Code 側に出させる(対話セッションのみ)。OS ネイティブなら macOS `osascript -e 'display notification "Claude Code needs your attention" with title "Claude Code"'`、Linux `notify-send 'Claude Code' 'Claude Code needs your attention'`。

#### FileChanged / ConfigChange / PreModelSwitch / PreCompact

FileChanged のマッチャーは `|` で分割され、各要素が作業ディレクトリ内のリテラルファイル名として監視リストに登録されると同時に hook グループのフィルタとしても使われる。正規表現は役に立たず(`^\.env` はその名前のファイルを監視する)、`*` は `*` という名前のファイルを登録する。監視は誰かがファイル名を指定して初めて開始されるので、最低 1 ファイルを名指しした FileChanged グループか `watchPaths` を返す SessionStart hook で種を撒く。Edit / Write だけでなく Bash や外部プロセスによる変更でも発火し、hook 自身がファイルを書き換えると再発火するため自己ループに注意する。

```bash
#!/bin/bash
FILE=$(jq -r .file_path)
if grep -q $'\r$' "$FILE"; then
  perl -pi -e 's/\r$//' "$FILE"
fi
```

`"matcher": "data.csv"` の FileChanged に登録する公式例。`grep` が perl の除去対象と同じものを検査しているので、正規化後の再発火では書き換えずに終わる。緩いガードだと `perl -i` が置換なしでも書き換えるため永久ループになる。

ConfigChange は settings ファイル、managed-settings.json / managed-settings.d、`.claude/skills` の変更で発火し、`policy_settings` 以外は exit 2 または `decision: block` で変更を拒否できる。ただしブロックしてもユーザーにも Claude にもメッセージは出ず、`reason` は受理されるが表示されない。

PreModelSwitch(v2.1.251+)は `/model`、ピッカー、`/config` のモデル設定、fast mode の切り替え、SDK / Remote Control の `set_model` で発火し、自動フォールバックや resume 時の復元では発火しない。入力に `from_model`、`to_model`、`requested_model`、`source`(`command` / `picker` / `sdk`)、`context_tokens`、`prompt_cache_warm`、`cache_ttl`、`estimated_cache_write_usd` が入る。優先順位は deny > ask > allow で、タイムアウトは切り替えブロックになる。正規化名が不明(ゲートウェイ独自 ID)な場合は全 hook がマッチャー無関係に走るため、ブロックする hook は `to_model` を自分で確認する。PostModelSwitch はセッションのモデルが実際に変わった場合(自動フォールバック、`opusplan` の plan mode 出入り、resume 復元、ユーザー切り替え)に発火し、フォールバックチェーンが 1 ターンだけ代替した場合は発火しない。

```json
{
  "hooks": {
    "ConfigChange": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "jq -c '{timestamp: now | todate, source: .source, file: .file_path}' >> ~/claude-config-audit.log"
          }
        ]
      }
    ],
    "PreModelSwitch": [
      {
        "matcher": "claude-opus-4-6",
        "hooks": [
          {
            "type": "command",
            "command": "jq -e '.to_model | test(\"opus-4-6\")' > /dev/null && { echo 'Opus 4.6 is retired for this project. Use a newer model.' >&2; exit 2; }; exit 0"
          }
        ]
      }
    ]
  }
}
```

設定変更の監査ログと特定モデルへの切り替え拒否。

PreCompact は `trigger`(`manual` / `auto`、auto は idle compaction も含む)と `custom_instructions` を受け取り、exit 2 でブロックできる。auto をブロックした結果は 2 通りで、コンテキスト上限前の先回り compaction ならスキップして続行、API がすでに上限エラーを返した回復用 compaction ならそのエラーが表面化してリクエストが失敗する。PostCompact は `compact_summary` を受け取る。

#### WorktreeCreate / WorktreeRemove / Elicitation / MessageDisplay / agent team

WorktreeCreate は `--worktree`、`EnterWorktree`、subagent の `isolation: worktree`、workflow、background session、Remote Control の worktree mode で発火し、Claude が Bash で `git worktree add` を打った場合は発火しない。hook は git worktree の既定動作を完全に置き換えるので `.worktreeinclude` は処理されず、`.env` のコピーも hook 内で行う。command hook の stdout の最後の非空行(ANSI 除去後)が worktree パスになり、非 0 終了は作成失敗。`.`/`..` を含む絶対パスやリポジトリ内のシンボリックリンクを通るパスは拒否される。WorktreeRemove はディレクトリ削除もブランチ掃除も hook の責任で、exit 0 で削除済みとみなし、非 0 はディレクトリが残っている場合だけ失敗。subagent / workflow 用に作った worktree は保持され remove hook は呼ばれない。`ExitWorktree` は hook 作成の worktree を `discard_changes: true` なしでは除去しないため、未コミット作業の確認は hook 側で行う。

```json
{
  "hooks": {
    "WorktreeCreate": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'NAME=$(jq -r .name); DIR=\"$HOME/.claude/worktrees/$NAME\"; svn checkout https://svn.example.com/repo/trunk \"$DIR\" >&2 && echo \"$DIR\"'"
          }
        ]
      }
    ],
    "WorktreeRemove": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "bash -c 'jq -r .worktree_path | xargs rm -rf'"
          }
        ]
      }
    ]
  }
}
```

SVN リポジトリ向けの公式例。create 側は svn の出力を stderr に逃がし、パスだけを stdout の最終行にする。

Elicitation は MCP サーバーのフォーム(`requested_schema`)または URL 要求に対して `action: accept` + `content` で自動回答、decline、cancel できる。マッチャーは MCP サーバー名。exit 2 または `decision: block` は decline になる(v2.1.105 から v2.1.284 まで無視されていた)。ElicitationResult はユーザーの回答を書き換え / ブロックできるが、decline / cancel 時にも発火して hook の `action` がユーザーのものを置き換えるので、入力の `action` が accept であることを確認してから accept を返す。`content` はオブジェクト全体を置換する。

```bash
#!/bin/bash
input=$(cat)
fields=$(jq -c '.requested_schema.properties // {} | keys' <<<"$input")

if [ "$fields" = '["project_key"]' ]; then
  jq -n '{hookSpecificOutput: {hookEventName: "Elicitation", action: "accept", content: {project_key: "DOCS"}}}'
fi
```

`"matcher": "issue-tracker"` の Elicitation に exec 形式で登録する公式例。フォームの唯一のフィールドが `project_key` のときだけ答え、それ以外は何も出さずダイアログに任せる。

MessageDisplay はストリーミング中のアシスタントテキストを表示専用に変換する(完了行のバッチごと、`-p` / SDK ではメッセージごとに 1 回)。入力は `turn_id`、`message_id`、`index`、`final`、`delta`。トランスクリプトと Claude が見る内容は元のままで、verbose 表示では元テキストが出る。終端判定は `final` で行う。

```bash
#!/bin/bash
jq '{hookSpecificOutput: {hookEventName: "MessageDisplay", displayContent: (.delta | gsub("\\*\\*"; "") | gsub("`"; ""))}}'
```

Markdown の太字とバッククォートを表示から除く公式例。exec 形式でマッチャーなしで登録する。

agent team 系では `TaskCreated`(exit 2 または `decision: block` で作成をロールバック)、`TaskCompleted`(exit 2 で完了を拒否、teammate のターン終了起点なら `continue: false` で teammate を停止、`TaskUpdate` 起点なら `continue: false` は無視)、`TeammateIdle`(exit 2 で idle を拒否し stderr をモデルに渡す)が品質ゲートになる。入力には `task_id`、`task_subject`、`task_description`、`teammate_name`、`agent_id`(v2.1.290+)が入り、`team_name` は非推奨。`onFailure` が無効なのは `Stop` / `SubagentStop` / `TaskCompleted` / `TeammateIdle` で、`TaskCreated` には効く。TaskCreated は Task ツールのないセッションでは発火しない。

### 3.6 prompt / agent / http / mcp_tool

#### prompt と agent

prompt hook は `$ARGUMENTS` を hook 入力 JSON で置換した文面(なければ末尾に付加)を単発評価し、`{ok, reason, impossible}` を返す。`\$1.00` のようにバックスラッシュでリテラルのドル記号を書ける。既定モデルはバックグラウンド機能用モデルで `model` で上書きできる。`ok: false` の効果はイベントごとに異なる。

- `Stop` / `SubagentStop`: `reason` が次の指示として渡される。`impossible: true` ならターン終了を許可
- `PreToolUse`: deny され、既定ではターンが終わり理由が警告行に出る(v2.1.210 以前はターン継続)。`continueOnBlock: true` で理由をツールエラーとして Claude に返し継続
- `PostToolUse` / `PostToolBatch` / `UserPromptSubmit` / `UserPromptExpansion`: ターン終了(後三者は `continueOnBlock` でも変わらない)
- `PostToolUseFailure` / `TaskCreated`: ツールエラーとして継続
- `TeammateIdle`、teammate 停止起点の `TaskCompleted`: 既定で teammate を止め、`continueOnBlock: true` で続行
- `PermissionRequest` / `PermissionDenied`: 効果なし

v2.1.294 で「Block commands that...」のような命令文で書いた prompt / agent hook が本来ブロックすべきものを通していた問題が修正された。v2.1.302 以降、同一イベントで同時に走る prompt / agent hook は 12 個までで残りは待機する。

agent hook は実験的で、Read / Grep / Glob を持つ subagent を最大 50 ターン、既定 60 秒で動かす。`continueOnBlock` と `impossible` はなく、`ok: false` は常に `continueOnBlock: true` 相当で扱われる。PermissionRequest では使えない。v2.1.300 で `model` が無視される問題が修正された(エイリアス解決、利用不可モデルは呼び出し側のモデルにフォールバック)。公式は本番用途に command hook を推奨している。

```json
{
  "hooks": {
    "Stop": [
      {
        "hooks": [
          {
            "type": "agent",
            "prompt": "Verify that all unit tests pass. Run the test suite and check the results. $ARGUMENTS",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

agent 型でテスト通過を検証する公式例。

#### http

`Content-Type: application/json` で同じ JSON を POST する。2xx + JSON は解釈、2xx + 空は成功、2xx + プレーンテキスト、非 2xx、接続失敗はすべて非ブロッキングエラー(テキストはコンテキストに入らない)。`headers` の `$VAR` / `${VAR}` 展開は `allowedEnvVars` に列挙した変数だけで、それ以外は空文字になる。managed の `allowedHttpHookUrls` と `httpHookAllowedEnvVars` が全ソースを制限し、読めない場合は何も許可しない(v2.1.267)。エンドポイント停止時にブロックしたければ `onFailure: "block"` を付ける。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "http",
            "url": "http://localhost:8080/hooks/pre-tool-use",
            "timeout": 30,
            "headers": {
              "Authorization": "Bearer $MY_TOKEN"
            },
            "allowedEnvVars": ["MY_TOKEN"]
          }
        ]
      }
    ]
  }
}
```

ローカルのポリシーサーバーに Bash 呼び出しを問い合わせる構成。

#### mcp_tool

`input` の文字列値で `${tool_input.file_path}` のように hook 入力からのパス置換ができる。ブロッキングイベントでは接続中のサーバーを MCP_TIMEOUT まで待つが、OAuth は開始しないので `/mcp` で先に認証する。`isError: true` は非ブロッキングエラー。plugin 同梱サーバーは `"server": "plugin:<plugin>:<server>"` と書く。

```json
{
  "hooks": {
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

書き込み後に MCP サーバーのスキャンツールを呼ぶ構成。

### 3.7 async と asyncRewake

`async: true`(command のみ)はブロックできず、`additionalContext` / `systemMessage` は次のターンに届き、ユーザーには表示されない。JSON は stdout に単独で(v2.1.295 以降は複数行可)または `jq -c` で 1 行に出す。型の合わないフィールドは落とされる(`--debug` で確認可能)。`classifierContext` は無視される。`-p` モードでは終了時に走っている async hook は kill される(outcome `cancelled`)ので、セッションより長生きさせたい処理は完全にデタッチする。完了通知は verbose(Ctrl+O / `--verbose`)でしか見えない。`asyncRewake` は加えて exit 2 で即座に Claude を起こし、stderr(空なら stdout)を system reminder として渡す。v2.1.287 でスクリプトが存在しないときに無限に起こし続ける問題が修正された。

```bash
#!/bin/bash
# run-tests-async.sh

# Read hook input from stdin
INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty')

# Only run tests for source files
if [[ "$FILE_PATH" != *.ts && "$FILE_PATH" != *.js ]]; then
  exit 0
fi

# Run tests and report results to Claude via additionalContext
RESULT=$(npm test 2>&1)
EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  MSG="Tests passed after editing $FILE_PATH"
else
  MSG="Tests failed after editing $FILE_PATH: $RESULT"
fi
jq -nc --arg msg "$MSG" '{hookSpecificOutput: {hookEventName: "PostToolUse", additionalContext: $msg}}'
```

登録は `{"hooks":{"PostToolUse":[{"matcher":"Write|Edit","hooks":[{"type":"command","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/run-tests-async.sh","args":[],"async":true}]}]}}`。テストを待たずに Claude が進み、結果は次ターンに注入される。

同期 hook の中からバックグラウンドプロセスを起動する場合は、決定を先に print し、そのプロセスの stdout / stderr を必ずリダイレクトする。リダイレクトしないと Claude Code は `refusing to honor the suspect capture` でツール呼び出しをブロックする。形としては `policy-check.sh || exit $?` の後に `upload-metrics.sh >/dev/null 2>&1 &`。v2.1.285 以降、hook プロセス自身の終了後まもなく出力読み取りが打ち切られるのでデーモンがセッションをハングさせることはない。

### 3.8 セキュリティとワークスペース信頼

command hook はツールがサンドボックス化されていてもサンドボックス外で、ユーザーの全権限で実行される。公式の推奨は入力の検証、シェル変数の必ずクォート(`"$VAR"`)、`..` によるパストラバーサルの拒否、絶対パスの使用(exec 形式ならクォート不要)、`.env` / `.git/` / 鍵ファイルの回避である。

ワークスペース信頼は対話セッションでのみ settings ファイルの hooks を門番するが、`-p` / SDK セッションはダイアログを出さずフォルダを信頼済みとして扱う。つまり他人のリポジトリで `claude -p` を回すと、コミットされた `.claude/settings.json` の hooks が承認なしに走る。対策は `.claude/` を先に読む、`--bare` を使う、`--settings '{"disableAllHooks": true}'` を渡す、のいずれか。project の subagent frontmatter hooks はより厳格で、そのフォルダの信頼ダイアログを受け入れた後にしか走らない(v2.1.218+、`-p` は該当しない)。project の skill frontmatter hooks は settings ファイルと同じ規則で `-p` でも走る。`claude --bg` は v2.1.281 以降、先に信頼を尋ねる。

`updatedInput` 経由で入力を書き換えた後に一部の permission rule と安全チェックが適用されない問題(v2.1.290 で修正)、PreToolUse の allow と auto mode が UNC パス読み取りのプロンプトを迂回する問題(v2.1.292 で修正)、PreToolUse auto-allow hook がバックグラウンド agent タスクのツール制限を迂回する問題(v2.1.222 で修正)はいずれも最新版で閉じているため、ポリシー hook を信頼の基盤にするなら v2.1.300 以降を前提にするのが安全である。

### 3.9 デバッグ

`/hooks` は読み取り専用のブラウザで、各 hook の種別と出所を表示する(v2.1.286 以降はイベント別の一覧から Enter 一回で詳細)。`claude --debug` または `--debug-file <path>` で hook の stdout / stderr / 終了コードがログに残る(`--debug` は端末に出さず `~/.claude/debug/<session-id>.txt` に書く。セッション途中なら `/debug` で有効化しパスが表示される)。v2.1.296 以降、ツール系イベント、UserPromptSubmit、SessionStart、Stop などの command hook は完了時に `Hooks: <Event>:<matcher> [cmd] finished with status N (Nms)` を 1 行残し、`timed out after <N>ms` / `cancelled` / `moved to the background` / `failed to start` も区別できる。遅い hook はこの行の所要時間で見つける。`CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` でマッチャーの集計も出る。

ログで探すべき文字列は `Hook output does not start with {`(シェルプロファイルの echo が JSON を壊した)、`Hook JSON output had unrecognized keys`(フィールドの階層が違う)、`Session environment is not all plain assignments`(CLAUDE_ENV_FILE と PowerShell の非互換)。Ctrl+O のトランスクリプト表示でブロックメッセージと `<hook name> hook error` が見える。スクリプト単体のテストは `echo '{"tool_name":"Bash","tool_input":{"command":"ls"}}' | ./my-hook.sh; echo $?` で行う。settings の編集はファイルウォッチャーで拾われるが、反映されなければ再起動する。

Windows では `"shell": "powershell"` で pwsh.exe / powershell.exe が使われ、shell 形式では `${CLAUDE_PROJECT_DIR}` が `${env:NAME}` 形式に書き換えられる(二重引用符内でのみ機能、素の `$CLAUDE_PROJECT_DIR` は `$null`)。Git Bash がない Windows では Bash ツール自体が登録されないので `Bash` だけのマッチャーは発火せず、`Bash|PowerShell` と書く。v2.1.299 以降、`shell` 未指定の shell 形式 PreToolUse / PermissionRequest hook が Git Bash 不在で失敗すると呼び出しをブロックする。

```json
{
  "type": "command",
  "if": "PowerShell(Remove-Item *)",
  "command": "powershell.exe",
  "args": [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    "${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.ps1"
  ]
}
```

PowerShell スクリプトを exec 形式で呼ぶ公式パターン。スクリプト側は `[Console]::In.ReadToEnd() | ConvertFrom-Json` で読み、`ConvertTo-Json` で出す。`if` は 1 ツールにしか効かないので Bash 用と PowerShell 用に別ハンドラを用意する。

### 落とし穴と対策

- exit 1 はブロックではない。ポリシー強制は exit 2 か JSON の deny で行い、ゲート hook には `onFailure: "block"`(v2.1.295+)を付けて、スクリプト欠落やタイムアウトでフェイルオープンしないようにする。初回実行時は `No such file or directory` の通知が出ていないか確認する。
- `PermissionRequest` は exit 2 を完全に無視する。`hookSpecificOutput.decision.behavior` だけが効く。逆に `Stop` / `SubagentStop` / `TaskCompleted` / `TeammateIdle` では exit 2 が「続行」の意味なので `onFailure` が効かない。
- `additionalContext` / `permissionDecision` をトップレベルに書くと黙って無視される。`hookSpecificOutput` の中に `hookEventName` と並べる。
- JSON の前に 1 文字でも stdout に出るとプレーンテキスト扱いになり決定が捨てられる。`~/.bashrc` の echo は `if [[ $- == *i* ]]; then ...; fi` で囲む。JSON は `jq -n --arg` で組む。
- マッチャーの正規表現はアンカーなし。`Edit.*` は `NotebookEdit` に当たり、`mcp__memory` は何にも当たらず(`.*` 必須)、plugin の MCP は `mcp__plugin_<plugin>_<server>__<tool>`、plugin の subagent 型は `^plugin:agent$` と書く。
- `if` は 1 ルールのみ、ツール系 5 イベント専用、Bash に対してはベストエフォート。厳密な allow / deny は permission rules で。`Edit(src/**)` は `<cwd>/src` 限定(v2.1.214+)。
- PreToolUse は `@file` 添付と `EndConversation` で発火しない。`Edit|Write` の PostToolUse は Bash による書き換えで発火しない。`FileChanged` か Stop での `git status --porcelain` 走査で補う。
- hooks は締めるだけで緩められない。hook の allow は deny / ask ルール、UNC 読み取り、`requiresUserInteraction` な MCP ツール、組織の ask コネクタ、plan mode の書き込みプロンプトを覆せない。hook の deny は `--dangerously-skip-permissions` でも効く。
- `updatedInput` を返す PreToolUse hook を同一ツールに複数置くと、最後に終わった方が非決定的に勝つ。
- Stop はターン終了ごとに発火する。`stop_hook_active` を必ず確認し、8 回の連続継続で強制停止される(`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`)。最終メッセージは `last_assistant_message` から取り、`transcript_path` は使わない。
- PreToolUse / PostToolUse の prompt hook は `ok: false` で既定ではターンを終える(v2.1.210 以降)。継続させたければ `continueOnBlock: true`。agent hook は常に継続扱いで `impossible` もない。
- `mcp_tool` hook は起動時の SessionStart と Setup で黙ってスキップされる。起動時の処理は command hook で。
- `CLAUDE_ENV_FILE` は SessionStart / Setup / CwdChanged / FileChanged のみ、PowerShell 実行 hook にはない。CwdChanged で書いた変数は次の CwdChanged でクリア。PowerShell ツールは全行が単純代入のときだけ受け取る(direnv の `$'...'` 出力で全滅)。
- Windows: パスはバックスラッシュで届く(正規化必須)、Git Bash なしでは `Bash` マッチャーが死ぬ(`Bash|PowerShell`)、exec 形式は `.cmd` シムを起動できない(`node` + パス)、PowerShell hook の素の `$CLAUDE_PROJECT_DIR` は `$null`。
- hooks に制御端末はない。`/dev/tty` は失敗する。通知は `terminalSequence`(対話セッションのみ)か `systemMessage`。
- 同期 hook からバックグラウンドプロセスを起動するときは決定を先に print し、`>/dev/null 2>&1 &` でリダイレクトする。さもないと `refusing to honor the suspect capture` でブロックされる。
- `additionalContext` 等は 10,000 文字で打ち切られ、超過分は Claude が読まないファイルに退避される。セッション途中に注入したコンテキストは `--resume` でそのまま再生されるため SHA やタイムスタンプが古くなる。再実行されるのは SessionStart だけ。
- `-p` / SDK は信頼ダイアログを飛ばす。他人のリポジトリで回す前に `.claude/` を読むか `--bare` / `--settings '{"disableAllHooks": true}'`。hook コマンドはサンドボックス外で全権限実行される。
- Notification の `permission_prompt` は約 6 秒遅延しキー入力で延期される。`idle_prompt` は約 60 秒待つ。即時反応は PermissionRequest で。
- FileChanged のマッチャーはリテラルファイル名。正規表現や `*` はその名前のファイルを登録するだけ。最低 1 ファイルか `watchPaths` で監視を開始し、自己書き換えループを避ける。
- WorktreeCreate は git worktree 作成を完全に置換する(`.worktreeinclude` 無視)。stdout の最終行がパス、非 0 は失敗。subagent / workflow 用の worktree は WorktreeRemove に渡らない。
- ConfigChange のブロックは無言(ユーザーにも Claude にも表示なし)、`policy_settings` はブロック不能、server-managed settings は発火しない。
- ElicitationResult は decline / cancel でも発火し、hook の `action` がユーザーの回答を置き換える。無条件に accept を返すと decline が accept になる。
- `once: true` は skill frontmatter 専用。`suppressOutput` は何もしない。ConfigChange の `reason` は表示されない。`team_name` は非推奨。
- SessionEnd は 1.5 秒の共有予算。遅い処理は per-hook `timeout`(上限 60 秒)か `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS` で延ばす。
- async hook の出力は次ターンに届きユーザーには見えない。`-p` では終了時に kill される。`classifierContext` は無視される。

### 中級者が次にやること

1. **ゲート hook をフェイルクローズに揃える**: 既存の PreToolUse ポリシー hook すべてに `"onFailure": "block"` を付け、`args: []` で exec 形式にし、`echo '{...}' | ./hook.sh; echo $?` で 0 / 2 の両経路を手動検証する。`--debug-file` で `finished with status` 行の所要時間も確認する。
2. **logging と guardrail を同じイベントで分離する**: ログ用とブロック用のハンドラを別に置き、deny が出てもログが残る構造にする(deny > defer > ask > allow のマージ規則を利用)。

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r .tool_input.command >> ~/.claude/bash.log"
          },
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/block-rm-rf.sh"
          }
        ]
      }
    ]
  }
}
```

3. **SessionStart で環境を固定する**: `CLAUDE_ENV_FILE` に Node バージョンや PATH を書き出し、`"matcher": "compact"` のグループで compaction 後に重要な規約を再注入する。チーム共有 skill を pull して `reloadSkills: true` を返す hook を加える。
4. **Stop を品質ゲートにする**: `stop_hook_active` ガード + `git status --porcelain` / テスト実行で exit 2、原理的に不可能なら prompt 型で `impossible: true` を返す構成に切り替える。`background_tasks` が空でないときは exit 0 で通す。
5. **UserPromptExpansion で slash command を監査する**: `/deploy` のような危険コマンドを `command_name` マッチャーで捕まえ、`decision: block` または `additionalContext` で前提条件(ブランチ、環境変数)を注入する。
6. **PermissionRequest で plan mode の遷移を自動化する**: `ExitPlanMode` に限定したマッチャーで `behavior: allow` + `setMode: acceptEdits` を返し、`permission_suggestions` をそのまま `updatedPermissions` に返して `localSettings` へ学習させる。マッチャーは絶対に広げない。
7. **PostToolUse の `Agent` マッチで subagent の結果を集約する**: `tool_response.status` / `totalTokens` / `totalDurationMs` をログに落とし、`content` を要約した `additionalContext` を親に返す。
8. **Notification から外部通知へ**: `terminalSequence` または `osascript` / `notify-send` を公式経路として採用する。Slack Incoming Webhook に `jq -c '{text: ...}' | curl --data @-` で送る構成は community pattern であり (未検証)。URL は settings の `env` ブロックかシェル環境から読み、Stop 側は `async: true` にして Claude をブロックしない。`http` 型は Slack の `text` 形式に合わないので直接は使えない。
9. **plugin 化する**: 複数リポジトリで同じ hooks を使うなら `hooks/hooks.json` に `${CLAUDE_PLUGIN_ROOT}` で切り出す。exec 形式でのみ `${user_config.*}` が展開され、shell 形式では `$CLAUDE_PLUGIN_OPTION_<KEY>` を読む(v2.1.207 以降、shell 形式の `${user_config.*}` はエラーになる)。

```json
{
  "description": "Automatic code formatting",
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "${CLAUDE_PLUGIN_ROOT}/scripts/format.sh",
            "args": [],
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

10. **headless パイプラインで `defer` を使う**: `claude -p` から PreToolUse で `permissionDecision: "defer"` を返し、`stop_reason: "tool_deferred"` を受けて人間承認やワークフローの承認ステップを挟み、`claude -p --resume <id>` で allow + `updatedInput` を返す。単一ツール呼び出しのターンでのみ機能する点を設計に織り込む。

### 出典

- https://code.claude.com/docs/en/hooks (Hooks reference)
- https://code.claude.com/docs/en/hooks-guide (Automate actions with hooks)
- https://code.claude.com/docs/en/changelog (Claude Code changelog、v2.1.210 から v2.1.302 までの hook 関連エントリ)
- https://zenn.dev/ispec_inc/articles/claude-code-slack-notification-hooks (community、Slack 通知パターン、未検証)
