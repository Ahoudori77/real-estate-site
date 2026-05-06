export type AdminNavItem = {
  label: string;
  href: string;
  description?: string;
};

export const adminNavItems: AdminNavItem[] = [
  {
    label: "ダッシュボード",
    href: "/admin",
    description: "管理画面トップ",
  },
  {
    label: "物件管理",
    href: "/admin/properties",
    description: "物件一覧・登録・編集",
  },
  {
    label: "特徴管理",
    href: "/admin/features",
    description: "検索用こだわり条件管理",
  },
  {
    label: "問い合わせ管理",
    href: "/admin/inquiries",
    description: "公開サイトからの問い合わせ確認",
  },
];