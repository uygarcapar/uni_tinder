/**
 * Akış post gövdesinde link tespiti — saf, React yok.
 *
 * ⚠️ POLİTİKA (brainstorming kararı): link sayılan şey YALNIZ `http://`,
 * `https://` ve `www.` ile başlayanlar. Çıplak alan adı (`ornek.com`) BİLEREK
 * dışarıda — Türkçe metinde o regex "saat 3.30da", "bkz.Vikipedi" gibi şeyleri
 * yakalıyor ve en çok yanlış pozitif üreten şey phishing'i en çok
 * doğallaştıran şeydir: kullanıcı mavi altı çizili yazıyı "uygulamanın
 * onayladığı bir adres" sanmaya başlar.
 *
 * ⚠️ TELEFON ve E-POSTA linklenmiyor. Numara paylaşımı 2026-09-30'da kasıtlı
 * olarak serbest bırakıldı (bkz. FeedComposerSheet'in başındaki not), ama yanlış
 * bir dokunuşla arama başlatmak geri alınamaz bir hata — düz metin kalıyorlar.
 *
 * ⚠️ `@mention` ve gövdedeki `#etiket` de parse edilmiyor: uygulamada
 * @kullanıcı-adı diye bir kimlik yüzeyi yok (profile yazar adından gidiliyor),
 * konular ise kapalı bir enum (feedTypes.ts `FeedTopic`). Linklenecek hedef yok.
 *
 * ⚠️ RN'in yerleşik `dataDetectorType`ı KULLANILMIYOR: dokunuşu doğrudan
 * sisteme veriyor, yani alan adını gösteren onay diyaloğunu ATLIYOR — ve
 * telefon/e-posta'yı da linkliyor.
 *
 * ⚠️ BİLİNEN SINIR: IDN homograf (`оrnek.com`, Kiril "о") olduğu gibi geçiyor
 * ve diyalogda da öyle görünüyor. Punycode tespiti bu turun kapsamı değil.
 */

/** Kısaltılmış link metninin tavanı — code point. */
export const FEED_LINK_DISPLAY_MAX = 40;

export type FeedTextSegment =
  | { type: "text"; text: string }
  | {
      type: "link";
      /** Gövdede geçtiği hâli (noktalama kırpılmış) — tanı/test için. */
      text: string;
      /** Açılacak hedef. GÖSTERİLEN metin bu DEĞİL (bkz. feedLinkDisplay). */
      url: string;
      /** Onay diyaloğunda gösterilecek alan adı; `www.` atılmış, küçük harf. */
      host: string;
    };

const LINK_RE = /(?:https?:\/\/|www\.)[^\s]+/gi;

/**
 * Adresin sonuna yapışan ve ona AİT OLMAYAN noktalama.
 *
 * "bak https://ornek.com." cümlesinde nokta linkin parçası değil; dahil
 * edilirse hem gösterilen adres yanlış olur hem de 404'e dokunulur.
 * Parantez bu listede YOK — dengeli olup olmadığına göre karar veriliyor.
 */
const TRAILING_PUNCT = new Set([
  ".",
  ",",
  ";",
  ":",
  "!",
  "?",
  "…",
  '"',
  "'",
  "»",
  "”",
  "’",
]);

/**
 * Geçerli bir alan adı: en az iki etiket ve sonu harfle biten bir uzantı.
 *
 * ⚠️ NOKTA ŞARTI tek başına çok iş yapıyor: `http://localhost:3000` ve iç ağ
 * adresleri bu kapıdan geçemiyor. Son etiketin HARF olması şartı da `1.2.3.4`
 * gibi çıplak IP'leri dışarıda tutuyor — gerçek bir kullanıcı metninde yeri
 * olmayan, buna karşılık kötüye kullanımda sık görülen biçimler.
 */
const HOST_RE = /^[a-z0-9¡-￿-]+(?:\.[a-z0-9¡-￿-]+)*\.[a-z¡-￿]{2,}$/i;

const count = (text: string, char: string): number => {
  let n = 0;
  for (const c of text) if (c === char) n += 1;
  return n;
};

/**
 * Eşleşmenin sonundan ona ait olmayan noktalamayı kırp.
 *
 * Kapanan parantez yalnız AÇILANLA DENGELİYSE içeride kalıyor: Vikipedi
 * bağlantıları (`.../Ay_(uydu)`) adresin parçası olarak parantez taşıyor, ama
 * "(https://ornek.com)" yazan birinin kapanışı adrese ait değil.
 */
const trimTrailing = (match: string): string => {
  let end = match.length;
  while (end > 0) {
    const ch = match[end - 1];
    if (TRAILING_PUNCT.has(ch)) {
      end -= 1;
      continue;
    }
    if (ch === ")") {
      const inner = match.slice(0, end);
      if (count(inner, ")") > count(inner, "(")) {
        end -= 1;
        continue;
      }
    }
    break;
  }
  return match.slice(0, end);
};

/** Şema + host'u küçük harfe indir, YOLA DOKUNMA (yol harfe duyarlı). */
const normalizeUrl = (
  withScheme: string,
): { url: string; host: string } | null => {
  const schemeMatch = /^(https?:\/\/)/i.exec(withScheme);
  if (!schemeMatch) return null;

  const scheme = schemeMatch[1].toLowerCase();
  const rest = withScheme.slice(schemeMatch[1].length);

  // Host, ilk `/ ? #` ya da port iki noktasına kadar.
  const hostEnd = rest.search(/[/?#]/);
  const authority = hostEnd === -1 ? rest : rest.slice(0, hostEnd);
  const hostWithPort = authority;
  const hostRaw = hostWithPort.split(":")[0];
  if (!HOST_RE.test(hostRaw)) return null;

  const path = hostEnd === -1 ? "" : rest.slice(hostEnd);
  const port = hostWithPort.slice(hostRaw.length);

  return {
    url: `${scheme}${hostRaw.toLowerCase()}${port}${path}`,
    // Diyalogda gösterilen alan adı. `www.` bir bilgi taşımıyor; ama ALT ALAN
    // ADI korunuyor — "giris.ornek.com" ile "ornek.com" farklı yerler ve
    // birini diğeriymiş gibi göstermek tam olarak gizlemek istediğimiz şey.
    host: hostRaw.toLowerCase().replace(/^www\./, ""),
  };
};

/**
 * Gövdeyi metin ve link parçalarına böl.
 *
 * Link sayılmayan bir eşleşme (noktasız host, yalnız noktalamadan oluşan
 * adres…) komşu metinle BİRLEŞİR — kullanıcıya tek parça yazı olarak görünür,
 * görünmez bir segment sınırı bırakmaz.
 */
export function parseFeedLinks(body: string): FeedTextSegment[] {
  if (!body) return [];

  const segments: FeedTextSegment[] = [];
  let buffer = "";
  let cursor = 0;

  const flush = () => {
    if (buffer) {
      segments.push({ type: "text", text: buffer });
      buffer = "";
    }
  };

  LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(body)) !== null) {
    const raw = match[0];
    buffer += body.slice(cursor, match.index);
    cursor = match.index + raw.length;

    const trimmed = trimTrailing(raw);
    const tail = raw.slice(trimmed.length);
    const withScheme = /^www\./i.test(trimmed)
      ? `https://${trimmed}`
      : trimmed;
    const normalized = trimmed ? normalizeUrl(withScheme) : null;

    if (!normalized) {
      // Link değil: eşleşmenin TAMAMI düz metne döner.
      buffer += raw;
      continue;
    }

    flush();
    segments.push({
      type: "link",
      text: trimmed,
      url: normalized.url,
      host: normalized.host,
    });
    buffer += tail;
  }

  buffer += body.slice(cursor);
  flush();
  return segments;
}

/**
 * Kartta GÖSTERİLECEK link metni — açılacak hedef DEĞİL.
 *
 * İki işi birden yapıyor:
 *  1. Taşma kapısı. RN kırılmasız uzun bir token'ı satır sonunda kırmıyor;
 *     40 kodnoktalık bir tavan kartın içinde kalmasını garanti ediyor.
 *  2. Alan adını BAŞA çekiyor. Uzun bir adres okunduğunda ilk görülen şeyin
 *     nereye gidildiği olması, onay diyaloğuyla aynı tarafı tutuyor.
 *
 * Kısaltma code point üzerinden: `.slice` UTF-16 birimi keser ve astral bir
 * karakteri ortadan bölüp bozuk glif bırakır (clampFeedText'teki aynı gerekçe).
 */
export function feedLinkDisplay(url: string): string {
  const bare = url
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    // Yalnız sondaki TEK eğik çizgi: "ornek.com/" ile "ornek.com" aynı yer.
    .replace(/\/$/, "");

  const points = [...bare];
  if (points.length <= FEED_LINK_DISPLAY_MAX) return bare;
  return `${points.slice(0, FEED_LINK_DISPLAY_MAX - 1).join("")}…`;
}
