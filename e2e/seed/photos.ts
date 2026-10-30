import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIXTURES } from '../support/env';

export interface FixturePhoto {
  name: string;
  buffer: Buffer;
}

function load(name: string): FixturePhoto {
  const path = resolve(FIXTURES, name);
  if (!existsSync(path)) {
    throw new Error(
      `Fixture yok: ${path}\n  Üretmek için: npm run e2e:fixtures`
    );
  }
  return { name, buffer: readFileSync(path) };
}

/**
 * Bot fotoğrafları. Slot'a göre DÖNÜŞÜMLÜ seçiliyor ki her botun kartı ekran
 * görüntüsünde gözle ayırt edilebilsin (her kare farklı renk + büyük numara).
 *
 * ⚠️ Kayıt min 2 fotoğraf istiyor (formSchemas.ts:311) — `count` 2'nin altına
 * düşemez.
 */
export function botPhotos(slot: number, count = 2): FixturePhoto[] {
  if (count < 2) throw new Error('Kayıt en az 2 fotoğraf istiyor');
  const out: FixturePhoto[] = [];
  for (let i = 0; i < count; i += 1) {
    out.push(load(`bot-${((slot + i) % 6) + 1}.jpg`));
  }
  return out;
}

/** Kampüs anı / tek kareli yüklemeler için. */
export function singlePhoto(slot: number): FixturePhoto {
  return load(`bot-${(slot % 6) + 1}.jpg`);
}
