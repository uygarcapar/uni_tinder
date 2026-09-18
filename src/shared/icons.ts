// Lucide ikonlarının TEK giriş noktası. Doğrudan "lucide-react-native"
// import ETME: paketin barrel'ı tek modül gövdesinde binlerce top-level
// require() içeriyor, yani ilk import anında hepsi eager evaluate ediliyor
// (dev bundle'ın %33'ü, ~3 MB). Buradaki deep import'lar yalnız kullanılan
// ikonu çeker; yeni bir ikon lazım olduğunda listeye bir satır ekle.
//
// Bu dosya elle tutulur — ESLint kuralı yok, lucide'dan doğrudan import eden
// yeni bir dosya eklersen kazanç sessizce geri gider.
//
// Yol biçimi lucide 1.x ile DEĞİŞTİ: `dist/esm/icons/<ad>` (0.x'te dosya
// düzenine elle dalıyorduk) → `icons/<ad>`, artık paketin `exports` map'inde
// resmî `./icons/*` subpath'i var. Yani deep import bir hile değil desteklenen
// API; tipler de `dist/types/icons/*.d.ts`ten geliyor.
//
// 1.x'te bazı ikonlar yeniden adlandırıldı. Buradaki dışa aktarılan adlar
// (Smile, Trash2) çağrı yerlerini kırmamak için KASITLI olarak eski kaldı,
// yalnız kaynak yolları yeni adlarına taşındı.

export type { LucideIcon } from "lucide-react-native";

export { default as AlertCircle } from "lucide-react-native/icons/circle-alert";
export { default as AlertTriangle } from "lucide-react-native/icons/triangle-alert";
export { default as ArrowDown } from "lucide-react-native/icons/arrow-down";
export { default as ArrowDownCircle } from "lucide-react-native/icons/circle-arrow-down";
export { default as ArrowLeft } from "lucide-react-native/icons/arrow-left";
export { default as ArrowRight } from "lucide-react-native/icons/arrow-right";
export { default as ArrowUp } from "lucide-react-native/icons/arrow-up";
export { default as BadgeCheck } from "lucide-react-native/icons/badge-check";
export { default as Ban } from "lucide-react-native/icons/ban";
export { default as Bell } from "lucide-react-native/icons/bell";
export { default as BellOff } from "lucide-react-native/icons/bell-off";
export { default as Bird } from "lucide-react-native/icons/bird";
export { default as BookOpen } from "lucide-react-native/icons/book-open";
export { default as Briefcase } from "lucide-react-native/icons/briefcase";
export { default as Camera } from "lucide-react-native/icons/camera";
export { default as Car } from "lucide-react-native/icons/car";
export { default as Cat } from "lucide-react-native/icons/cat";
export { default as Check } from "lucide-react-native/icons/check";
export { default as CheckCheck } from "lucide-react-native/icons/check-check";
export { default as ChevronDown } from "lucide-react-native/icons/chevron-down";
export { default as ChevronLeft } from "lucide-react-native/icons/chevron-left";
export { default as ChevronRight } from "lucide-react-native/icons/chevron-right";
export { default as ChevronUp } from "lucide-react-native/icons/chevron-up";
export { default as Cigarette } from "lucide-react-native/icons/cigarette";
export { default as Circle } from "lucide-react-native/icons/circle";
export { default as CircleUser } from "lucide-react-native/icons/circle-user";
export { default as ClipboardPaste } from "lucide-react-native/icons/clipboard-paste";
export { default as Clock } from "lucide-react-native/icons/clock";
export { default as Code } from "lucide-react-native/icons/code";
export { default as Copy } from "lucide-react-native/icons/copy";
export { default as Delete } from "lucide-react-native/icons/delete";
export { default as Dog } from "lucide-react-native/icons/dog";
export { default as Download } from "lucide-react-native/icons/download";
export { default as Droplets } from "lucide-react-native/icons/droplets";
export { default as Dumbbell } from "lucide-react-native/icons/dumbbell";
export { default as Eye } from "lucide-react-native/icons/eye";
export { default as EyeOff } from "lucide-react-native/icons/eye-off";
export { default as FileText } from "lucide-react-native/icons/file-text";
export { default as Film } from "lucide-react-native/icons/film";
export { default as Fish } from "lucide-react-native/icons/fish";
export { default as Flag } from "lucide-react-native/icons/flag";
export { default as Flame } from "lucide-react-native/icons/flame";
export { default as Gamepad2 } from "lucide-react-native/icons/gamepad-2";
export { default as Gift } from "lucide-react-native/icons/gift";
export { default as Globe } from "lucide-react-native/icons/globe";
export { default as GraduationCap } from "lucide-react-native/icons/graduation-cap";
export { default as HandHeart } from "lucide-react-native/icons/hand-heart";
export { default as Hash } from "lucide-react-native/icons/hash";
export { default as Heart } from "lucide-react-native/icons/heart";
export { default as HeartCrack } from "lucide-react-native/icons/heart-crack";
export { default as HeartHandshake } from "lucide-react-native/icons/heart-handshake";
export { default as HelpCircle } from "lucide-react-native/icons/circle-question-mark";
export { default as IdCardLanyard } from "lucide-react-native/icons/id-card-lanyard";
export { default as Images } from "lucide-react-native/icons/images";
export { default as Infinity } from "lucide-react-native/icons/infinity";
export { default as Info } from "lucide-react-native/icons/info";
export { default as InfoIcon } from "lucide-react-native/icons/info";
export { default as KeyRound } from "lucide-react-native/icons/key-round";
export { default as Keyboard } from "lucide-react-native/icons/keyboard";
export { default as Languages } from "lucide-react-native/icons/languages";
export { default as Leaf } from "lucide-react-native/icons/leaf";
export { default as Lightbulb } from "lucide-react-native/icons/lightbulb";
export { default as Lock } from "lucide-react-native/icons/lock";
export { default as LockOpen } from "lucide-react-native/icons/lock-open";
export { default as LogOut } from "lucide-react-native/icons/log-out";
export { default as Mail } from "lucide-react-native/icons/mail";
export { default as MapPin } from "lucide-react-native/icons/map-pin";
export { default as MessageCircle } from "lucide-react-native/icons/message-circle";
export { default as MessageSquare } from "lucide-react-native/icons/message-square";
export { default as MessageSquareReply } from "lucide-react-native/icons/message-square-reply";
export { default as MessageSquareText } from "lucide-react-native/icons/message-square-text";
export { default as Mic } from "lucide-react-native/icons/mic";
export { default as Moon } from "lucide-react-native/icons/moon";
export { default as MoreVertical } from "lucide-react-native/icons/ellipsis-vertical";
export { default as Mountain } from "lucide-react-native/icons/mountain";
export { default as Music } from "lucide-react-native/icons/music";
export { default as Navigation } from "lucide-react-native/icons/navigation";
export { default as Palette } from "lucide-react-native/icons/palette";
export { default as PartyPopper } from "lucide-react-native/icons/party-popper";
export { default as Pause } from "lucide-react-native/icons/pause";
export { default as PauseCircle } from "lucide-react-native/icons/circle-pause";
export { default as PawPrint } from "lucide-react-native/icons/paw-print";
export { default as Pen } from "lucide-react-native/icons/pen";
export { default as Pencil } from "lucide-react-native/icons/pencil";
export { default as Plane } from "lucide-react-native/icons/plane";
export { default as PlayingCardsFan } from "lucide-react-native/icons/playing-cards-fan";
export { default as Play } from "lucide-react-native/icons/play";
export { default as Plus } from "lucide-react-native/icons/plus";
export { default as Rabbit } from "lucide-react-native/icons/rabbit";
export { default as Rat } from "lucide-react-native/icons/rat";
export { default as RefreshCw } from "lucide-react-native/icons/refresh-cw";
export { default as Reply } from "lucide-react-native/icons/reply";
export { default as RotateCcw } from "lucide-react-native/icons/rotate-ccw";
export { default as Ruler } from "lucide-react-native/icons/ruler";
export { default as Scale } from "lucide-react-native/icons/scale";
export { default as Search } from "lucide-react-native/icons/search";
export { default as SearchX } from "lucide-react-native/icons/search-x";
export { default as Settings } from "lucide-react-native/icons/settings";
export { default as Share2 } from "lucide-react-native/icons/share-2";
export { default as ShieldAlert } from "lucide-react-native/icons/shield-alert";
export { default as ShieldCheck } from "lucide-react-native/icons/shield-check";
export { default as ShoppingBag } from "lucide-react-native/icons/shopping-bag";
export { default as SlidersHorizontal } from "lucide-react-native/icons/sliders-horizontal";
export { default as Smile } from "lucide-react-native/icons/face-slightly-smiling";
export { default as Sparkles } from "lucide-react-native/icons/sparkles";
export { default as Star } from "lucide-react-native/icons/star";
export { default as Sun } from "lucide-react-native/icons/sun";
export { default as SunMoon } from "lucide-react-native/icons/sun-moon";
export { default as Theater } from "lucide-react-native/icons/theater";
export { default as Trash2 } from "lucide-react-native/icons/trash";
export { default as Trees } from "lucide-react-native/icons/trees";
export { default as TriangleAlert } from "lucide-react-native/icons/triangle-alert";
export { default as Turtle } from "lucide-react-native/icons/turtle";
export { default as User } from "lucide-react-native/icons/user";
export { default as UserMinus } from "lucide-react-native/icons/user-minus";
export { default as UserRound } from "lucide-react-native/icons/user-round";
export { default as UserX } from "lucide-react-native/icons/user-x";
export { default as Users } from "lucide-react-native/icons/users";
export { default as Utensils } from "lucide-react-native/icons/utensils";
export { default as Video } from "lucide-react-native/icons/video";
export { default as WifiOff } from "lucide-react-native/icons/wifi-off";
export { default as Wind } from "lucide-react-native/icons/wind";
export { default as Wine } from "lucide-react-native/icons/wine";
export { default as Wrench } from "lucide-react-native/icons/wrench";
export { default as X } from "lucide-react-native/icons/x";
export { default as Zap } from "lucide-react-native/icons/zap";
