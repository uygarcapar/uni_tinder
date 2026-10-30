/**
 * Maymun koşu boyları.
 *
 * KISA — PR/nightly'de koşuyor, ~8 dk. Amaç "bugün bir şey kırıldı mı".
 * UZUN — haftalık, ~60 dk. Amaç kuyruk: bellek sızıntısı, sıraya bağlı
 *        bozulma, ancak yüzlerce eylem sonra ortaya çıkan kapanmayan modal.
 *
 * `E2E_MONKEY_ACTIONS` ile ezilebiliyor (tekrar üretme sırasında koşuyu
 * kısaltmak için).
 */
const override = Number(process.env.E2E_MONKEY_ACTIONS);

export const ACTION_COUNT_SHORT = Number.isFinite(override) && override > 0 ? override : 150;
export const ACTION_COUNT_LONG = Number.isFinite(override) && override > 0 ? override : 1_200;
