export interface AreaOption {
  prefecture: string;
  cities: string[];
}

export const areaOptions: AreaOption[] = [
  {
    prefecture: "京都府",
    cities: [
      "京丹後市",
      "伊根町",
      "与謝野町",
      "宮津市",
      "舞鶴市",
      "綾部市",
      "福知山市",
    ],
  },
  {
    prefecture: "兵庫県",
    cities: [
      "丹波市",
      "朝来市",
      "養父市",
      "豊岡市",
    ],
  },
];

/**
 * 初回リリースでは検索フォーム用の固定リストとして使用。
 * M4以降で管理画面のfeature管理 / GET /api/public/features と連携予定。
 */
export const featureOptions = [
  "駐車場あり",
  "南向き",
  "角地",
  "整形地",
  "2階建て",
  "平屋",
  "更地",
  "古家付き土地",
  "海が近い",
  "山が見える",
  "駅近",
  "庭付き",
] as const;