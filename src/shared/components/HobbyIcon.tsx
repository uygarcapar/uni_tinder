import { Text } from "react-native";

// Tüm hobi ikonlarının tek kaynağı (SwipeCard / RegisterStep13 / EditProfileForm /
// FilterModal). Hobiler platform bağımsız direkt emoji olarak render edilir.
// Anahtarlar GET /api/common/hobbies içindeki `enumName` ile birebir aynıdır;
// listedeki 73 hobinin tamamı burada karşılığını bulur, fallback'e düşen yoktur.
const HOBBY_EMOJIS: Record<string, string> = {
  // Fitness & Spor
  Gym: "🏋️",
  Yoga: "🧘",
  Running: "🏃",
  Swimming: "🏊",
  Cycling: "🚴",
  Hiking: "🥾",
  RockClimbing: "🧗",
  Boxing: "🥊",
  MartialArts: "🥋",
  Dancing: "💃",
  Pilates: "🤸",
  // Yemek & İçecek
  Cooking: "🍳",
  Baking: "🧁",
  WineTasting: "🍷",
  CoffeeLover: "☕",
  Foodie: "🍜",
  VeganCooking: "🥗",
  Mixology: "🍸",
  // Sanat & Yaratıcılık
  Photography: "📸",
  Painting: "🎨",
  Drawing: "✏️",
  Writing: "✍️",
  Poetry: "📜",
  Crafts: "🧶",
  DIY: "🔨",
  Fashion: "👗",
  // Müzik & Eğlence
  Music: "🎵",
  Concerts: "🎫",
  PlayingGuitar: "🎸",
  PlayingPiano: "🎹",
  Singing: "🎤",
  DJing: "🎧",
  Festivals: "🎪",
  // Doğa & Macera
  Traveling: "✈️",
  Camping: "⛺",
  Fishing: "🎣",
  Surfing: "🏄",
  Skiing: "⛷️",
  Snowboarding: "🏂",
  Gardening: "🌱",
  BeachLife: "🏖️",
  // Kültür & Öğrenme
  Reading: "📚",
  Museums: "🏛️",
  ArtGalleries: "🖼️",
  Theater: "🎭",
  Movies: "🎬",
  Documentary: "📽️",
  Learning: "🎓",
  Languages: "🗣️",
  // Oyun & Teknoloji
  VideoGames: "🎮",
  BoardGames: "🎲",
  Chess: "♟️",
  Coding: "💻",
  Gaming: "🕹️",
  VR: "🥽",
  Podcasts: "🎙️",
  // Sosyal & Yaşam Tarzı
  Volunteering: "🤝",
  Pets: "🐾",
  Dogs: "🐶",
  Cats: "🐱",
  Meditation: "🪷",
  Astrology: "🔮",
  Shopping: "🛍️",
  Nightlife: "🪩",
  Brunch: "🥞",
  SocialDrinking: "🍻",
  Networking: "💼",
  // Entelektüel
  Politics: "🗳️",
  Philosophy: "🤔",
  Science: "🔬",
  History: "🏺",
  Investing: "📈",
  Entrepreneurship: "🚀",
};

// Canonical olmayan girdiler → enumName.
// 1) Eski enumName'ler (backend yeniden adlandırdı, cihazda kayıtlı eski veri
//    ve MMKV cache'i hâlâ bunları taşıyabiliyor)
// 2) Display isimleri (call-site enumName bulamayınca `name` gönderiyor)
// Arama normalize edilerek yapıldığı için EN display isimlerinin çoğu
// ("Rock Climbing" → RockClimbing) alias'sız zaten eşleşir; burada yalnızca
// harf harf farklı olanlar listelenir.
const HOBBY_ALIASES: Record<string, string> = {
  // Eski enumName'ler
  Climbing: "RockClimbing",
  Coffee: "CoffeeLover",
  VeganCuisine: "VeganCooking",
  Guitar: "PlayingGuitar",
  Piano: "PlayingPiano",
  Travel: "Traveling",
  Cinema: "Movies",
  Documentaries: "Documentary",
  // Fitness & Spor
  "Fitness & Spor": "Gym",
  "Fitness & Sport": "Gym",
  Koşu: "Running",
  Yüzme: "Swimming",
  Bisiklet: "Cycling",
  "Doğa Yürüyüşü": "Hiking",
  "Kaya Tırmanışı": "RockClimbing",
  Boks: "Boxing",
  "Dövüş Sanatları": "MartialArts",
  Dans: "Dancing",
  // Yemek & İçecek
  "Yemek Pişirme": "Cooking",
  Fırıncılık: "Baking",
  "Şarap Tadımı": "WineTasting",
  "Kahve Tutkusu": "CoffeeLover",
  Gurme: "Foodie",
  "Vegan Mutfak": "VeganCooking",
  Miksologluk: "Mixology",
  // Sanat & Yaratıcılık
  Fotoğrafçılık: "Photography",
  Resim: "Painting",
  Çizim: "Drawing",
  Yazarlık: "Writing",
  Şiir: "Poetry",
  "El Sanatları": "Crafts",
  "Kendin Yap (DIY)": "DIY",
  Moda: "Fashion",
  // Müzik & Eğlence
  Müzik: "Music",
  Konserler: "Concerts",
  "Gitar Çalmak": "PlayingGuitar",
  "Piyano Çalmak": "PlayingPiano",
  "Şarkı Söylemek": "Singing",
  "DJ'lik": "DJing",
  Festivaller: "Festivals",
  // Doğa & Macera
  Seyahat: "Traveling",
  Kamp: "Camping",
  "Balık Tutma": "Fishing",
  Sörf: "Surfing",
  Kayak: "Skiing",
  Snowboard: "Snowboarding",
  Bahçıvanlık: "Gardening",
  "Plaj Hayatı": "BeachLife",
  // Kültür & Öğrenme
  Okumak: "Reading",
  Müzeler: "Museums",
  "Sanat Galerileri": "ArtGalleries",
  Tiyatro: "Theater",
  Sinema: "Movies",
  Belgesel: "Documentary",
  Öğrenme: "Learning",
  Diller: "Languages",
  // Oyun & Teknoloji
  "Video Oyunları": "VideoGames",
  "Masa Oyunları": "BoardGames",
  Satranç: "Chess",
  Yazılım: "Coding",
  Oyun: "Gaming",
  "Podcast'ler": "Podcasts",
  // Sosyal & Yaşam Tarzı
  Gönüllülük: "Volunteering",
  "Evcil Hayvanlar": "Pets",
  Köpekler: "Dogs",
  Kediler: "Cats",
  Meditasyon: "Meditation",
  Astroloji: "Astrology",
  Alışveriş: "Shopping",
  "Gece Hayatı": "Nightlife",
  "Sosyal İçici": "SocialDrinking",
  Network: "Networking",
  // Entelektüel
  Siyaset: "Politics",
  Felsefe: "Philosophy",
  Bilim: "Science",
  Tarih: "History",
  Yatırım: "Investing",
  Girişimcilik: "Entrepreneurship",
};

// Nötr fallback: backend yeni bir hobi eklerse kırmızı kalp yerine bu görünür.
const FALLBACK_EMOJI = "✨";

// Boşluk/noktalama/büyük-küçük harf farkını yok sayar; iki taraf da aynı
// fonksiyondan geçtiği için TR karakter dönüşümleri (İ→i̇ gibi) sorun çıkarmaz.
function normalizeKey(value: string): string {
  return value.normalize("NFC").replace(/[^\p{L}\p{N}]/gu, "").toLowerCase();
}

const NORMALIZED_INDEX: Record<string, string> = (() => {
  const index: Record<string, string> = {};
  for (const key of Object.keys(HOBBY_EMOJIS)) {
    index[normalizeKey(key)] = HOBBY_EMOJIS[key];
  }
  for (const [alias, canonical] of Object.entries(HOBBY_ALIASES)) {
    const emoji = HOBBY_EMOJIS[canonical];
    if (emoji) index[normalizeKey(alias)] = emoji;
  }
  return index;
})();

const warnedHobbies = new Set<string>();

export function getHobbyEmoji(hobbyName?: string): string {
  if (!hobbyName) return FALLBACK_EMOJI;
  const emoji = NORMALIZED_INDEX[normalizeKey(hobbyName)];
  if (emoji) return emoji;
  if (__DEV__ && !warnedHobbies.has(hobbyName)) {
    warnedHobbies.add(hobbyName);
    console.warn(`[HobbyIcon] emoji eşleşmedi: "${hobbyName}"`);
  }
  return FALLBACK_EMOJI;
}

type HobbyIconProps = {
  hobby?: string; // enumName (tercihen) veya display adı
  size?: number;
  color?: string; // emoji renk almaz; call-site uyumluluğu için tutuluyor
  strokeWidth?: number; // emoji için anlamsız; call-site uyumluluğu için tutuluyor
};

export default function HobbyIcon({ hobby, size = 18 }: HobbyIconProps) {
  // Emojinin satır kutusu fontSize'dan yüksek. Yüksekliği açıkça veriyoruz:
  // sabit yükseklikli bir kapta (bkz. SwipeCard hobi pili) Yoga Text'i AT_MOST
  // ile ölçüp çerçeveyi kaba kısaltıyor, glif de alttan kırpılıyordu. Açık
  // height ölçüm sonucuyla aynı olduğu için diğer call-site'larda layout
  // değişmez; kap küçükse emoji kırpılmadan taşar.
  const lineHeight = Math.round(size * 1.25);
  return (
    <Text
      style={{
        fontSize: size,
        lineHeight,
        height: lineHeight,
        textAlignVertical: "center",
      }}
      allowFontScaling={false}
    >
      {getHobbyEmoji(hobby)}
    </Text>
  );
}
