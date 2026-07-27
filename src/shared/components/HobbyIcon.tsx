import { Text } from "react-native";

// Tüm hobi ikonlarının tek kaynağı (SwipeCard / RegisterStep13 / EditProfileForm).
// Hobiler platform bağımsız direkt emoji olarak render edilir.
// Backend enumName (PascalCase) canonical key'dir; legacy TR display isimleri
// HOBBY_TR_ALIASES üzerinden canonical'a çözülür.
const HOBBY_EMOJIS: Record<string, string> = {
  Gym: "🏋️",
  Yoga: "🧘",
  Running: "🏃",
  Swimming: "🏊",
  Cycling: "🚴",
  Hiking: "🥾",
  Climbing: "🧗",
  Boxing: "🥊",
  MartialArts: "🥋",
  Dancing: "💃",
  Pilates: "🤸",
  Cooking: "🍳",
  Baking: "🧁",
  WineTasting: "🍷",
  Coffee: "☕",
  Foodie: "🍜",
  VeganCuisine: "🥗",
  Mixology: "🍸",
  Photography: "📸",
  Painting: "🎨",
  Drawing: "✏️",
  Writing: "✍️",
  Poetry: "📜",
  Crafts: "🧶",
  DIY: "🔨",
  Fashion: "👗",
  Music: "🎵",
  Concerts: "🎫",
  Guitar: "🎸",
  Piano: "🎹",
  Singing: "🎤",
  DJing: "🎧",
  Festivals: "🎪",
  Travel: "✈️",
  Camping: "⛺",
  Fishing: "🎣",
  Surfing: "🏄",
  Skiing: "⛷️",
  Snowboarding: "🏂",
  Gardening: "🌱",
  BeachLife: "🏖️",
  Reading: "📚",
  Museums: "🏛️",
  ArtGalleries: "🖼️",
  Theater: "🎭",
  Cinema: "🎬",
  Documentaries: "📽️",
  Learning: "💡",
  Languages: "🌍",
  VideoGames: "🎮",
  BoardGames: "🎲",
  Chess: "♟️",
  Coding: "💻",
  Gaming: "🕹️",
  VR: "🥽",
  Podcasts: "🎙️",
  Volunteering: "🤝",
  Pets: "🐾",
  Dogs: "🐶",
  Cats: "🐱",
  Meditation: "🧘‍♂️",
  Astrology: "🔮",
  Shopping: "🛍️",
  Nightlife: "🪩",
  Brunch: "🥞",
  SocialDrinking: "🍻",
  Networking: "💼",
  Politics: "🗳️",
  Philosophy: "🤔",
  Science: "🔬",
  History: "🏺",
  Investing: "📈",
  Entrepreneurship: "🚀",
};

// Legacy TR display isimleri → canonical enumName
const HOBBY_TR_ALIASES: Record<string, string> = {
  "Fitness & Spor": "Gym",
  Koşu: "Running",
  Yüzme: "Swimming",
  Bisiklet: "Cycling",
  "Doğa Yürüyüşü": "Hiking",
  "Kaya Tırmanışı": "Climbing",
  Boks: "Boxing",
  "Dövüş Sanatları": "MartialArts",
  Dans: "Dancing",
  "Yemek Pişirme": "Cooking",
  Fırıncılık: "Baking",
  "Şarap Tadımı": "WineTasting",
  "Kahve Tutkusu": "Coffee",
  Gurme: "Foodie",
  "Vegan Mutfak": "VeganCuisine",
  Miksologluk: "Mixology",
  Fotoğrafçılık: "Photography",
  Resim: "Painting",
  Çizim: "Drawing",
  Yazarlık: "Writing",
  Şiir: "Poetry",
  "El Sanatları": "Crafts",
  "Kendin Yap (DIY)": "DIY",
  Moda: "Fashion",
  Müzik: "Music",
  Konserler: "Concerts",
  "Gitar Çalmak": "Guitar",
  "Piyano Çalmak": "Piano",
  "Şarkı Söylemek": "Singing",
  "DJ'lik": "DJing",
  Festivaller: "Festivals",
  Seyahat: "Travel",
  Kamp: "Camping",
  "Balık Tutma": "Fishing",
  Sörf: "Surfing",
  Kayak: "Skiing",
  Snowboard: "Snowboarding",
  Bahçıvanlık: "Gardening",
  "Plaj Hayatı": "BeachLife",
  Okumak: "Reading",
  Müzeler: "Museums",
  "Sanat Galerileri": "ArtGalleries",
  Tiyatro: "Theater",
  Sinema: "Cinema",
  Belgesel: "Documentaries",
  Öğrenme: "Learning",
  Diller: "Languages",
  "Video Oyunları": "VideoGames",
  "Masa Oyunları": "BoardGames",
  Satranç: "Chess",
  Yazılım: "Coding",
  Oyun: "Gaming",
  "Podcast'ler": "Podcasts",
  Gönüllülük: "Volunteering",
  "Evcil Hayvanlar": "Pets",
  Köpekler: "Dogs",
  Kediler: "Cats",
  Meditasyon: "Meditation",
  Astroloji: "Astrology",
  Alışveriş: "Shopping",
  "Gece Hayatı": "Nightlife",
  "Sosyal İçici": "SocialDrinking",
  Siyaset: "Politics",
  Felsefe: "Philosophy",
  Bilim: "Science",
  Tarih: "History",
  Yatırım: "Investing",
  Girişimcilik: "Entrepreneurship",
};

const FALLBACK_EMOJI = "❤️";

export function getHobbyEmoji(hobbyName?: string): string {
  if (!hobbyName) return FALLBACK_EMOJI;
  return (
    HOBBY_EMOJIS[hobbyName] ??
    HOBBY_EMOJIS[HOBBY_TR_ALIASES[hobbyName]] ??
    FALLBACK_EMOJI
  );
}

type HobbyIconProps = {
  hobby?: string; // enumName (tercihen) veya display adı
  size?: number;
  color?: string; // emoji renk almaz; call-site uyumluluğu için tutuluyor
  strokeWidth?: number; // emoji için anlamsız; call-site uyumluluğu için tutuluyor
};

export default function HobbyIcon({ hobby, size = 18 }: HobbyIconProps) {
  return (
    <Text
      style={{ fontSize: size, lineHeight: Math.round(size * 1.25) }}
      allowFontScaling={false}
    >
      {getHobbyEmoji(hobby)}
    </Text>
  );
}
