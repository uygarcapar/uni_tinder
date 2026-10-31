import { selectEvictions, totalBytes } from '@/features/chat/mediaCachePolicy';

interface Row {
  message_id: string;
  media_cached_at_ms: number;
  size_bytes: number;
}

const e = (id: number, sizeBytes: number, cachedAtMs?: number): Row => ({
  message_id: `m${id}`,
  media_cached_at_ms: cachedAtMs ?? id,
  size_bytes: sizeBytes,
});

describe('totalBytes', () => {
  it('toplam bayt — boş girdide 0', () => {
    expect(totalBytes([])).toBe(0);
  });

  it('toplam bayt — girdilerin size_bytes toplamı', () => {
    expect(totalBytes([{ size_bytes: 10 }, { size_bytes: 20 }, { size_bytes: 5 }])).toBe(35);
  });
});

describe('selectEvictions', () => {
  it('tavanın altındayken HİÇBİR ŞEY silmiyor', () => {
    expect(selectEvictions([e(1, 10), e(2, 10)], 100)).toEqual([]);
  });

  it('tavanı aşınca EN ESKİ erişimden başlayarak yeterince siliyor, fazlasını DEĞİL', () => {
    // toplam 120, tavan 100 → yalnız en eskisi (20) gitmeli
    expect(selectEvictions([e(1, 20), e(2, 50), e(3, 50)], 100)).toEqual(['m1']);
  });

  it('tek dosya tavandan büyükse onu siliyor (dokunulmaz istisna yok)', () => {
    expect(selectEvictions([e(1, 500)], 100)).toEqual(['m1']);
  });

  it('boş girdide boş dönüyor', () => {
    expect(selectEvictions([], 100)).toEqual([]);
  });

  it('eşit damgalarda deterministik sıra (message_id) — tahliye kararsız olmasın', () => {
    // m2 ve m3 aynı damgayı (50) taşıyor, m1 daha yeni (100). Toplam 120,
    // tavan 100 → 20 bayt kurtarılmalı: tek başına m2 (10) yetmiyor, m3 (10)
    // de gitmeli. GİRDİ SIRASI KASITLI OLARAK ters: m3 dizide m2'den ÖNCE
    // geliyor, ama beklenen sonuç yine ['m2', 'm3'] — yani test, Array.sort'un
    // stabilitesine (giriş sırasını koruma) değil, message_id karşılaştırmasına
    // dayanıyor. Girdi beklenen sırayla verilseydi tiebreak satırı silinip
    // stabil sort'a bırakılsa bile aynı sonuç çıkar ve test hiçbir şeyi
    // PİNLEMEZDİ (bu hata review'de yakalandı — bkz. rapordaki düzeltme notu).
    const entries = [e(1, 100, 100), e(3, 10, 50), e(2, 10, 50)];
    expect(selectEvictions(entries, 100)).toEqual(['m2', 'm3']);
  });

  it('toplam tavana TAM eşitse hiçbir şey silmiyor (sınır, fazla silme yok)', () => {
    expect(selectEvictions([e(1, 60), e(2, 40)], 100)).toEqual([]);
  });
});
