// İlişki niyeti (RelationshipIntent) — enumName → ikon eşlemesi.
// Alan dört ayrı ekranda görünüyor (register step 14, profil düzenleme, keşif
// filtresi, swipe kartı); ikon haritası tek yerde dursun ki yeni enum değeri
// eklendiğinde tek dosya güncellensin.
//
// Anahtar DAİMA enumName (PascalCase). `name`/`display` backend'de
// Accept-Language'e göre değişiyor — onunla anahtarlamak eşleşmeyi dile bağlar.
import type { SFSymbol } from "@/shared/components/SFIcon";
import {
  Infinity as InfinityIcon,
  Sparkles,
  Heart,
  HeartHandshake,
  HelpCircle,
  type LucideIcon,
} from "lucide-react-native";

export type RelationshipIntentIcon = { sf: SFSymbol; lucide: LucideIcon };

const DEFAULT_ICON: RelationshipIntentIcon = { sf: "heart.fill", lucide: Heart };

const RELATIONSHIP_INTENT_ICON_MAP: Record<string, RelationshipIntentIcon> = {
  LongTerm: { sf: "infinity", lucide: InfinityIcon },
  ShortTerm: { sf: "sparkles", lucide: Sparkles },
  LongTermOpenToShort: { sf: "heart.fill", lucide: Heart },
  ShortTermOpenToLong: { sf: "bolt.heart.fill", lucide: HeartHandshake },
  StillFiguringOut: { sf: "questionmark.circle", lucide: HelpCircle },
};

export const getRelationshipIntentIcon = (
  enumName: string | null | undefined,
): RelationshipIntentIcon =>
  (enumName && RELATIONSHIP_INTENT_ICON_MAP[enumName]) || DEFAULT_ICON;
