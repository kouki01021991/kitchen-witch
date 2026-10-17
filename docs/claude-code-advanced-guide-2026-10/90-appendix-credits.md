## 付録A 利用枠・クレジットの公式まとめ(2026-10-17 時点)

「クレジットを確認しながら使う」ために、2026年10月17日時点で公式ページから確認できた事実だけをまとめます。数字はすべて Anthropic のサポート記事または公式ドキュメントの記載です。プランや価格は変更されうるので、実行前に `/usage` と `/status` で自分のアカウントの実値を確認してください。

### A.1 用語の整理

| 用語 | 何を指すか | どこで消費されるか |
| - | - | - |
| プラン利用枠(usage limits) | Pro / Max の 5 時間ウィンドウ枠と週次枠。Max には Fable 専用の週次枠が別にある | claude.ai、デスクトップ、モバイル、Claude Code(ターミナル、IDE、デスクトップ、Web)で共有 |
| 利用クレジット(usage credits、旧称 extra usage) | プラン枠を使い切った後に、標準 API 料金で従量課金に切り替えて使い続ける仕組み | Claude と Claude Code の両方。事前チャージ(Add funds)と月次上限、自動リロードを設定できる |
| 月次 API クレジット(monthly API credits) | Max と Team に付く、Claude Platform(API)向けの月次クレジット | API、Console の Playground、Managed Agents、Agent SDK、リンクした Console 組織の API キーで動かす `claude -p` と Agent SDK |

### A.2 プラン利用枠の挙動

- Pro と Max はどちらも 5 時間のセッション枠と週次枠を持ち、Max は Fable 用の週次枠を別に持ちます。
- Web、デスクトップ、モバイルの Claude と、Claude Code(VS Code、Cursor などのフォーク、JetBrains を含む)は同じ枠を共有します。
- 5 時間枠に途中で達した場合、進行中の応答に限り「Usage limit reached · wrapping up」と表示して短く続行する wrap-up allowance があります。小さく上限があり、週次枠にカウントされます。Pro は週に 1 回まで、Max は週次枠の範囲で 5 時間枠ごとに適用されます。段階的に展開中のため、まだ有効でないアカウントもあります。
- 2026年9月14日以降、Claude Code の週次枠は、5月から9月の期間限定プロモーション前と比べて 25% 高い水準に設定されています(Pro、Max、Team、シート制 Enterprise)。
- `ANTHROPIC_API_KEY` 環境変数が設定されていると、サブスクリプション認証より優先され、プラン枠ではなく API 課金になります。意図せず API 課金になっていないか、`/status` で認証方法を確認してください。

### A.3 利用クレジット(usage credits)

- 対象: Pro、Max 5x、Max 20x。
- 有効化: claude.ai の Settings > Usage > Usage credits で Enable、支払い方法を設定、月次上限(Adjust limit)または無制限を選択、Add funds で前払い。残高が閾値を下回ったら自動購入する auto-reload も設定可能。
- 課金基準: 標準 API 料金。
- Claude Code のターミナル利用にも適用され、Claude の会話と合算してカウントされます。
- Max の 5 時間枠、一般の週次枠、Fable 用週次枠のいずれにも使えます。
- モバイルアプリ経由で契約した場合、有効化は Web 版の claude.ai からのみ行えます。
- プラン内に収めたい場合は、クレジットの案内を断り、枠のリセットを待ち、`/status` で残量を確認します。クレジットの案内自体を止めるには `claude logout` の後、Pro または Max の資格情報だけで `claude login` し直します。
- 2.1.302 の修正として、クレジットでしか使えないモデルで返答した直後は、プロンプト提案(prompt suggestions)がクレジットを消費しないようスキップされるようになりました。

### A.4 月次 API クレジット(Max と Team)

2026年10月7日付の更新で、Max と Team プランに月次 API クレジットが付くようになりました。6月に告知されていた「Agent SDK クレジット」は提供されておらず、今回の API クレジットは別のオファーです。

| プラン | 月次クレジット |
| - | - |
| Max 5x | $100 |
| Max 20x | $200 |
| Team Standard シート | $20 / シート |
| Team Premium シート | $100 / シート |
| Team の合算 | 全シート分を一つの残高にプール、上限 $500 / 月 |

- 対象外: Free、Pro、Enterprise。
- 受け取り条件: 対象プランに 7 日以上在籍。claude.ai の Web 版からのみ請求でき、Claude Platform 側に支払い方法は不要。
- 受け取り方: claude.ai の Settings > Billing(Max)または Organization settings > Billing(Team Owner)の API credits で Console 組織をリンク。リンクできる組織は 1 つだけで、変更はサポート経由。Console には claude.ai と同じメールでサインインします。
- 使える用途: Messages API と Message Batches API、Console の Playground、Claude Managed Agents、Claude Agent SDK、リンクした Console 組織の API キーで自分が実行する `claude -p` と Agent SDK。
- 使えない用途: ターミナル、IDE、デスクトップ、Web での対話的な Claude Code。GitHub Action、IDE 拡張、デスクトップアプリから起動した実行(`-p` でも対象外)。Claude、Claude Code、Cowork の利用クレジット(extra usage)。Bedrock、Vertex AI、Foundry 上の Claude。
- 重要: Claude プランでサインインしたまま `claude -p` や Agent SDK を動かすと、API クレジットではなくプラン枠を消費します。API クレジットで動かしたいなら、リンクした Console 組織の API キーを使います。
- 更新: 各請求サイクルの決済後に補充。年払いでも月ごとに付与。未使用分は繰り越されず失効。月次クレジットは購入済みクレジットより先に消費されます。組織内で API キーを持つ全員が同じ残高を使います。
- 使い切った場合: 組織に購入済みクレジットや auto-reload があればそれを使い、なければ次回補充まで API リクエストが止まります。Claude プランに課金されることはありません。

### A.5 Agent SDK と `claude -p` の扱い

Agent SDK のサポート記事には 2 つの日付付き注記があります。

- 2026年6月15日: Agent SDK 利用に関して予告されていた変更は一時停止。Agent SDK、`claude -p`、サードパーティアプリの利用は引き続きサブスクリプション枠を消費する。
- 2026年10月7日: Max と Team に月次 API クレジットが付き、Agent SDK、`claude -p`、Claude API、Managed Agents をカバーする。サブスクリプション枠での利用も引き続き可能。

Claude Code のドキュメント(Legal and compliance)では、Agent SDK を含む製品やサービスを構築する開発者は、Claude Console または対応クラウドプロバイダ経由の API キー認証を使うべきとされています。個人の実験はプラン枠で、配布するプロダクトは API キーで、という線引きが実務上の目安になります。

### A.6 「クレジットを確認しながら」運用するためのコマンドと設定

- `/usage`: プラン枠の残量と、何(スキル、サブエージェント、プラグイン、MCP サーバー)が枠を消費しているかの内訳(2026年5月の Week 21 で追加)。
- `/status`: 認証方法(サブスクリプションか API キーか)と残りの割り当て。
- `/cost`: API キー利用時のセッション累計コスト。サブスクリプション利用時は `/usage` が主。
- `/context`: 現在のコンテキストの内訳。`/context all` で MCP ツールごとのトークン数も見える。
- `/skill-doctor`: 各スキルがコンテキストをどれだけ消費し、どれだけ使われているか(Week 36 で追加)。
- `/stats`: セッションの統計。
- デスクトップアプリの「Auto-continue when limits reset」: 5 時間枠に達したターンを、枠のリセット後に自動再開(Week 33 で追加)。
- `CLAUDE_CODE_RETRY_WATCHDOG` と `CLAUDE_CODE_RETRY_WATCHDOG_MAX_USAGE_LIMIT_WAIT_MS`(2.1.301 で追加): 無人の再試行モードで、リセットが遠すぎる利用上限に当たったら待たずに終了させる。
- OpenTelemetry の `api_request` イベントに `cache_creation_5m_tokens` と `cache_creation_1h_tokens` が追加され(2.1.300)、キャッシュ書き込みを寿命別に監視できる。

### 出典

- https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan
- https://support.claude.com/en/articles/12429409-extra-usage-
- https://support.claude.com/en/articles/17154008-monthly-api-credits-for-max-and-team-plans
- https://support.claude.com/en/articles/15036540-use-the-claude-agent-sdk-with-your-claude-plan
- https://support.claude.com/en/articles/15910845-claude-code-may-august-2026-weekly-limits-promotion
- https://code.claude.com/docs/en/legal-and-compliance
- https://code.claude.com/docs/en/changelog
- https://code.claude.com/docs/en/whats-new
