/**
 * GİRİŞ SONRASI KAPILAR.
 *
 * Bunlar navigator'ın DIŞINDA yaşıyor (AppNavigator.tsx:2234-2314) ve sırayla
 * gelebiliyorlar. Her akış "Keşif açıldı mı" diye beklemeden ÖNCE buradan
 * geçmek zorunda — aksi halde zaman aşımı hatası, aslında bir kapının
 * arkasında beklediğimizi gizler.
 *
 * ⚠️ `gate-*` önekli kapılar maymunun "kapanmayan modal" dedektöründen MUAF:
 * bazılarının kapanmaması ürünün iddiası (LocationAccessGate izin verilene
 * kadar kapatılamıyor, KVKK onaysız geçilemiyor).
 */
import { Alerts } from '../support/alerts';
import { idOf } from '../support/selectors';

interface GateSpec {
  readonly id: string;
  readonly label: string;
  readonly pass: () => Promise<void>;
  /** Kapatılabilir mi — değilse ve geçilemezse akış DURMALI. */
  readonly passable: boolean;
}

const GATES: readonly GateSpec[] = [
  {
    id: 'gate-blocked',
    label: 'Hesap engellendi/askıda',
    passable: false,
    pass: async () => {
      throw new Error(
        'AccountBlockedScreen açık — bu hesapla devam edilemez. ' +
          'Tohumlanan hesap moderasyona takılmış olabilir.'
      );
    },
  },
  {
    id: 'gate-update',
    label: 'Zorunlu güncelleme',
    passable: false,
    pass: async () => {
      throw new Error(
        'UpdateGateSheet açık — backend bu istemci sürümünü force-update eşiğinin ' +
          'altında görüyor. app.json `version` ile sunucudaki eşiği karşılaştır.'
      );
    },
  },
  {
    id: 'gate-kvkk',
    label: 'KVKK onayı',
    passable: true,
    pass: async () => {
      // Checkbox işaretlenmeden "Kabul Et" PASİF — kapının iddiası bu.
      await idOf('gate-kvkk-checkbox').click();
      await idOf('gate-kvkk-accept').click();
    },
  },
  {
    id: 'gate-location',
    label: 'Konum kapısı',
    passable: true,
    pass: async () => {
      await idOf('sheet-location-allow').click();
      // İzin profili `virgin` ise iOS diyaloğu çıkıyor; `granted` ise hiç çıkmaz.
      await Alerts.permissionIfPresent('allow-while-using');
    },
  },
  {
    id: 'gate-profile-hidden',
    label: 'Profil gizli (fotoğraf yetersiz/incelemede)',
    passable: true,
    pass: async () => {
      // Bilgilendirme — aşağı çekilerek kapanıyor; backdrop'a dokunmak yeter.
      const { width, height } = await browser.getWindowSize();
      await browser.performActions([
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: Math.round(width / 2), y: Math.round(height * 0.06) },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 50 },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ]);
      await browser.releaseActions();
    },
  },
];

export const gates = {
  /**
   * Açık kapıları sırayla geçer.
   *
   * Tek turda bitmiyor: KVKK kapanınca konum kapısı açılabiliyor. Üst sınır
   * var ki kapanmayan bir kapı sonsuz döngü değil NET BİR HATA üretsin.
   */
  async settleAfterLogin({ maxRounds = 5, settleMs = 1_500 } = {}): Promise<string[]> {
    const passed: string[] = [];

    for (let round = 0; round < maxRounds; round += 1) {
      let actedThisRound = false;

      for (const gate of GATES) {
        const el = idOf(gate.id);
        const present = await el
          .waitForDisplayed({ timeout: round === 0 ? settleMs : 400 })
          .then(() => true, () => false);
        if (!present) continue;

        if (!gate.passable) await gate.pass(); // throw ediyor
        await gate.pass();
        passed.push(gate.label);
        actedThisRound = true;

        await el
          .waitForDisplayed({ timeout: 10_000, reverse: true })
          .catch(() => {
            throw new Error(`${gate.label} kapanmadı (${gate.id}) — geçiş adımı çalışmadı.`);
          });
      }

      if (!actedThisRound) return passed;
    }

    throw new Error(
      `Kapılar ${maxRounds} turda yatışmadı. Geçilenler: ${passed.join(' → ') || '(yok)'}`
    );
  },
};
