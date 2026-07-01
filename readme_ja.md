<p align="center">
  <img src="assets/Listency.png" alt="Listency" width="520" />
</p>

<h1 align="center">Listency</h1>

<p align="center">
小規模ビジネス向けに AI 電話アシスタントを動かす、ローカルファーストのデスクトップアプリです。
</p>

<p align="center">
  <a href="README.md">English</a> · <a href="readme_cn.md">简体中文</a> · <a href="readme_ja.md">日本語</a>
</p>

<p align="center">
  <img alt="Tests" src="https://img.shields.io/badge/tests-unittest%20passing-brightgreen" />
  <a href="https://github.com/Talen-520/Listency/actions/workflows/windows-packaged-smoke.yml">
    <img alt="Windows packaged smoke" src="https://github.com/Talen-520/Listency/actions/workflows/windows-packaged-smoke.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/macos-packaged-smoke.yml">
    <img alt="macOS packaged smoke" src="https://github.com/Talen-520/Listency/actions/workflows/macos-packaged-smoke.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/release-draft.yml">
    <img alt="Release draft" src="https://github.com/Talen-520/Listency/actions/workflows/release-draft.yml/badge.svg" />
  </a>
  <a href="https://github.com/Talen-520/Listency/releases">
    <img alt="Releases" src="https://img.shields.io/github/v/release/Talen-520/Listency?include_prereleases&label=release" />
  </a>
  <a href="https://github.com/Talen-520/Listency/actions/workflows/coverage.yml">
    <img alt="Coverage" src="https://github.com/Talen-520/Listency/actions/workflows/coverage.yml/badge.svg" />
  </a>
  <img alt="Python" src="https://img.shields.io/badge/python-%3E%3D3.11-blue" />
  <img alt="Last commit" src="https://img.shields.io/github/last-commit/Talen-520/Listency?label=last%20commit" />
</p>

## インターフェースプレビュー

<details open>
  <summary><strong>ダークテーマ</strong></summary>
  <br />
  <a href="assets/dark.png">
    <img src="assets/dark.png" alt="Listency ダークテーマのダッシュボード" width="100%" />
  </a>
</details>

<details>
  <summary><strong>ライトテーマ</strong></summary>
  <br />
  <a href="assets/light.png">
    <img src="assets/light.png" alt="Listency ライトテーマのダッシュボード" width="100%" />
  </a>
</details>

## Listency とは？

Listency は、小規模ビジネスがローカルのデスクトップアプリから AI 電話アシスタントを運用できるようにするアプリです。

店舗、ホテル、レストラン、サロン、クリニック、サービス業などが電話番号を AI 音声エージェントにつなげることで、顧客からの電話に応答し、営業時間やサービス内容を説明し、予約に必要な情報を集め、よくある問い合わせに対応し、必要に応じて人へ転送し、会話記録を後から確認できます。

Listency は非技術者の事業者向けに作られています。カスタム backend、クラウドダッシュボード、コールセンター基盤を用意しなくても、シンプルなローカル操作画面から使えます。

Listency は macOS と Windows でローカル実行できます。API key、事業情報、transcripts、tool calls、logs はユーザーの PC に保存されます。電話機能を有効にすると、Listency は一時的な安全な tunnel を作成し、Twilio からの着信をローカルアプリへ転送できるようにします。

## 主な機能

- 着信対応用の AI 電話アシスタント
- 自分の PC 上で音声エージェントを実行でき、外部ホスティング不要でいつでも停止可能
- 実際の電話番号を接続する前に使えるマイクテストモード
- 選択した AI provider とモデルに応じた多言語音声会話
- 営業時間、サービス、価格、ポリシー、FAQ、予約ルールを保存できるローカル事業ナレッジベース
- 候補枠の空き確認、不足情報チェック、スタッフ最終確認の境界を含む予約情報収集
- 人の対応が必要な会話の call transfer
- 会話完了時に AI 側から通話終了
- オーナー対応が必要なタスク用の follow-up Inbox と任意のデスクトップ通知
- Conversation transcripts、tool call 履歴、phone call 履歴、runtime logs
- 通話結果、フォローアップ依頼、ツール利用、オーナー確認事項を確認できるローカル分析
- 実際の通話テスト前に主要なエージェントフローを確認できるローカル評価センター
- provider、電話接続、runtime 問題の切り分けに使える diagnostics export
- API key、事業データ、logs、transcripts のローカルファースト保存
- macOS と Windows 向けデスクトップアプリ体験
- 自動の安全な tunnel による Twilio 電話番号接続

## クイックスタート

一般ユーザー:

1. [GitHub Releases](https://github.com/Talen-520/Listency/releases) から Listency の packaged build をダウンロードします。
2. デスクトップアプリを開きます。
3. Settings で OpenAI と/or Gemini API key を入力し、保存します。
4. provider、model、voice を選択します。
5. Business Info を入力し、Agent prompt を選択または編集します。複数の agent を保存して、通話フローごとに切り替えられます。
6. 右上の `Start` をクリックして Runtime を起動します。ボタンは `Stop` に切り替わります。
7. 実際の着信には phone provider の接続が必要です。最初の公開版では [Twilio](https://www.twilio.com) を推奨します。Settings に Twilio Account SID、Auth Token、電話番号を入力し、`Connect Phone` をクリックしてから、設定した番号へ電話してください。

Telnyx は現在 experimental であり、最初の公開版での production 利用は推奨していません。

### 未署名リリースの信頼プロンプト

現在の公開 build は意図的に unsigned です。以下のコマンドは、この repository からダウンロードした build にのみ使用してください。

macOS で `"Listency" is damaged and can't be opened` と表示される場合は、解凍またはインストール後に quarantine flag を削除します。

```bash
xattr -dr com.apple.quarantine /path/to/Listency.app
```

Windows がダウンロードした installer または portable app をブロックする場合は、展開した release フォルダで PowerShell を開き、Mark-of-the-Web flag を削除します。

```powershell
Unblock-File .\Listency_0.1.0_x64-setup.exe
Get-ChildItem .\portable -Recurse | Unblock-File
```

これらの警告は unsigned build では想定される動作です。

開発者:

```bash
corepack enable
pnpm run dev:web
```

初回実行時に backend virtual environment を作成し、Python と desktop dependencies をインストールしてから、FastAPI backend と Vite frontend を起動します。ローカル UI 開発では `http://127.0.0.1:5173/` を開いてください。

完全なローカル開発手順は [Development](docs/DEVELOPMENT.md) を参照してください。

## 現在の状態

Listency は最初の public unsigned release 段階です。推奨される電話接続は Twilio です。Telnyx は experimental のままで、今後の release で削除または再設計される可能性があります。

## 仕組み

<p align="center">
  <a href="assets/how-it-works.svg">
    <img src="assets/how-it-works.svg" alt="Listency アーキテクチャフロー図" width="100%" />
  </a>
</p>

backend は意図的に薄く保っています。session 管理、ローカル config の読み込み、tool callbacks、phone webhook 処理、log 永続化を担当します。provider API は、Test Call または実際の着信が AI session を開始したときだけ呼び出されます。

## ローカルデータとプライバシー

- API key と phone provider credentials はローカルの `.env` に保存されます。
- Sessions、transcripts、tool calls、phone records はローカル SQLite に保存されます。
- packaged build はローカルデータを OS の app data directory に保存します。
- Business profile text と prompts は、active session 中に選択した provider へ送信されるまではローカルに残ります。
- 自動 phone setup では public tunnel 経由で `/phone/*` webhook routes のみを公開します。通常のローカル app API は tunnel host からアクセスできません。

active session 中は、provider API が audio、text、prompts、tool results を受け取る可能性があります。実際の顧客データを使う前に、各 provider のデータポリシーを確認してください。

## ドキュメント

- [GitHub Releases](https://github.com/Talen-520/Listency/releases)
- [Unsigned Build Testing](docs/ALPHA_TESTING.md)
- [Phone Setup](docs/PHONE_SETUP.md)
- [Release And Signing](docs/RELEASE.md)
- [Development](docs/DEVELOPMENT.md)

agent 向けの architecture、design、development notes は、git ignored のローカル `.agent/` ディレクトリに保存します。

## コントリビュート

この repository はまだ初期段階です。焦点の絞られた issue と小さな PR が最も review しやすいです。local-first の設計を保ち、secrets や顧客データを commit しないでください。挙動が変わる場合は `README.md` または `docs/` を更新してください。

## License

Apache License 2.0. See `LICENSE`.
