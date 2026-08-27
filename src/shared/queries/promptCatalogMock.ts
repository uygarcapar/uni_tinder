import type { PromptGroupOption } from "./commonQueries";

/**
 * GEÇİCİ — `GET /api/common/prompts` uç canlıya çıkana kadar ekranı
 * geliştirebilmek için kullanılan sahte katalog.
 *
 * Yalnızca `__DEV__` içinde ve yalnızca uç BOŞ liste döndüğünde devreye giriyor
 * (bkz. `usePrompts`). Release build'de asla çalışmaz — sahada katalog boşsa
 * ekran boş görünür, sahte veri servis edilmez.
 *
 * İçerik backend'in duyurduğu başlangıç havuzunu (4 kategori / 17 prompt)
 * yansıtıyor; kategori `enumName`'leri gerçek, PROMPT `enumName`'leri TAHMİNİ
 * (backend yalnız TR metinleri paylaştı). Uç canlıya çıkınca bu dosya ve
 * `usePrompts`'taki fallback dalı SİLİNECEK — o yüzden prompt anahtarlarına
 * kod içinde bağımlılık kurma.
 */
const p = (
  id: number,
  enumName: string,
  tr: string,
  en: string,
) => ({ id, enumName, name: tr, display: { tr, en }, maxLength: 150, isActive: true });

export const PROMPT_CATALOG_MOCK: PromptGroupOption[] = [
  {
    category: "Hakkımda",
    categoryEnumName: "AboutMe",
    categoryDisplay: { tr: "Hakkımda", en: "About me" },
    prompts: [
      p(1, "MostEnjoyInLife", "Hayatta en çok şundan zevk alırım", "What I enjoy most in life"),
      p(2, "MyIdealSunday", "İdeal pazar günüm", "My ideal Sunday"),
      p(3, "WhatDescribesMeBest", "Beni en iyi anlatan şey", "What describes me best"),
      p(4, "NobodyKnowsButIm", "Kimse bilmez ama", "Nobody knows this, but"),
      p(5, "WhatGivesMeEnergy", "Bana enerji veren şey", "What gives me energy"),
    ],
  },
  {
    category: "Bu aralar",
    categoryEnumName: "TheseDays",
    categoryDisplay: { tr: "Bu aralar", en: "These days" },
    prompts: [
      p(6, "CurrentObsession", "Bu aralar takıntım", "My current obsession"),
      p(7, "RecentlyLearned", "Son zamanlarda öğrendiğim şey", "Something I learned recently"),
      p(8, "OnRepeatRightNow", "Şu sıralar dinlediğim", "On repeat right now"),
      p(9, "WantToTryThisYear", "Bu yıl denemek istediğim şey", "What I want to try this year"),
    ],
  },
  {
    category: "Birlikte",
    categoryEnumName: "Together",
    categoryDisplay: { tr: "Birlikte", en: "Together" },
    prompts: [
      p(10, "WeShouldDoThis", "Beraber yapsak süper olur", "We'd have a great time doing this"),
      p(11, "FirstDateSpot", "İlk buluşmada gidelim istediğim yer", "Where I'd want to go on a first date"),
      p(12, "MessageMeIf", "Bana mesaj at eğer", "Message me if"),
      p(13, "WhatImLookingFor", "Aradığım şey", "What I'm looking for"),
    ],
  },
  {
    category: "Şaka bir yana",
    categoryEnumName: "JokesAside",
    categoryDisplay: { tr: "Şaka bir yana", en: "Jokes aside" },
    prompts: [
      p(14, "GuiltyPleasure", "Utanç verici ama seviyorum", "My guilty pleasure"),
      p(15, "TooConfidentAbout", "Bu konuda fazla iddialıyım", "I'm way too confident about this"),
      p(16, "EasilyConvinceMeWith", "Beni kolayca ikna edebilirsin", "You can easily convince me with"),
      p(17, "FavoriteUselessFact", "En sevdiğim gereksiz bilgi", "My favorite useless fact"),
    ],
  },
];
