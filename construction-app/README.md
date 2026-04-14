# 建設現場管理アプリ

React Native (Expo) + Supabase で構築した建設現場向け統合管理アプリです。
Web・iOS・Android に対応しています。

---

## 機能

- **3種類の権限ロール**: 会社管理者 / 社員 / 協力会社
- **招待リンク生成**: トークンベースの招待（メール送信不要）
- **案件管理**: 作成・編集・削除・ステータス管理
- **チームメンバー管理**: 案件ごとにメンバー追加・削除
- **ユーザー管理**: 会社全メンバーの一覧・招待・削除（管理者専用）

---

## セットアップ手順

### 1. Supabase プロジェクトを作成

1. [supabase.com](https://supabase.com) でプロジェクトを作成
2. `supabase/schema.sql` の内容を Supabase の **SQL Editor** で実行

### 2. 環境変数を設定

プロジェクトルートに `.env` ファイルを作成:

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
```

Supabase ダッシュボードの **Settings → API** から取得できます。

### 3. 依存パッケージをインストール

```bash
npm install
```

### 4. アプリを起動

```bash
# Web ブラウザで確認
npm run web

# iOS シミュレータ
npm run ios

# Android エミュレータ
npm run android

# Expo Go で実機確認
npm start
```

---

## 初期データの作成方法

1. Supabase の **Authentication → Users** でアカウントを手動作成
2. SQL Editor で会社と管理者プロフィールを作成:

```sql
-- 会社を作成
INSERT INTO public.companies (name) VALUES ('○○建設株式会社');

-- profiles を作成（作成したユーザーの UUID と company の UUID に置き換え）
INSERT INTO public.profiles (id, email, full_name, role, company_id)
VALUES (
  'auth-user-uuid-here',
  'admin@example.com',
  '管理者 太郎',
  'admin',
  'company-uuid-here'
);
```

---

## ファイル構成

```
construction-app/
├── App.tsx                         # エントリーポイント
├── supabase/
│   └── schema.sql                  # DB スキーマ・RLS ポリシー
└── src/
    ├── types/index.ts              # 型定義
    ├── lib/supabase.ts             # Supabase クライアント
    ├── context/AuthContext.tsx     # 認証コンテキスト
    ├── navigation/                 # ナビゲーション
    ├── components/                 # 共通コンポーネント
    └── screens/                    # 各画面
        ├── auth/                   # ログイン・招待受け入れ
        ├── projects/               # 案件一覧・詳細・作成編集
        ├── team/                   # チームメンバー管理
        └── admin/                  # ユーザー管理（管理者専用）
```

---

## 将来の拡張予定

- カレンダー機能（`projects.metadata` JSONB を活用）
- チェックリスト機能
- PDF 出力（`project_documents` テーブル追加）
- 写真アップロード（Supabase Storage）
