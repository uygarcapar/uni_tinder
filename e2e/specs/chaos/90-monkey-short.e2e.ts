/**
 * 90 — KISA MAYMUN KOŞUSU (150 eylem).
 *
 * Bu spec'in iddiası "şu buton çalışıyor" değil: **uygulama 150 gerçekçi
 * eylem boyunca ayakta kalıyor, bilinen bir yüzeyde duruyor, kilitlenmiyor
 * ve ölümcül log üretmiyor.** Scripted spec'lerin göremediği şey budur —
 * sıraya bağlı bozulmalar, kapanmayan modallar, sızan durum.
 *
 * ⚠️ ÖN KOŞUL: oturum açık olmalı. Maymun kayıt YAPMIYOR (kayıt akışı sıraya
 * duyarlı ve rastgele dolaşmanın konusu değil; onun kendi spec'i var).
 */
import { ACTION_COUNT_SHORT } from './monkeyConfig';
import { runMonkey } from '../../human/engine';
import { writeMonkeyReport } from '../../human/report';
import { feedExpectedInSession } from '../../support/env';

describe('90 · maymun (kısa)', () => {
  it(`${ACTION_COUNT_SHORT} eylem boyunca değişmez koşullar bozulmuyor`, async () => {
    const result = await runMonkey({
      actions: ACTION_COUNT_SHORT,
      feedEnabled: feedExpectedInSession(),
    });

    const reportPath = writeMonkeyReport(result);
    process.stdout.write(`[maymun] rapor: ${reportPath}\n`);

    // Motor bir ihlalde zaten fırlatıyor; buradaki iddia KAPSAMA hakkında:
    // bütün eylemler `noop` döndüyse maymun aslında hiçbir şey yapmamıştır
    // (seçiciler kaymış ya da oturum yok) ve "yeşil" yanıltıcı olur.
    const acted = result.steps.filter((s) => s.outcome !== 'noop').length;
    expect(acted).toBeGreaterThan(result.steps.length * 0.4);

    // En az üç farklı yüzeye girilmiş olmalı — tek ekranda dönen bir maymun
    // sıraya bağlı hiçbir bozulmayı bulamaz.
    const visited = new Set(result.steps.map((s) => s.surface));
    visited.delete('unknown');
    expect(visited.size).toBeGreaterThanOrEqual(3);
  });
});
