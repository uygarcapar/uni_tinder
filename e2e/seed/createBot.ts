/**
 * Karşı-kullanıcı (bot) üretimi — SAF HTTP, UI yok.
 *
 * Zincir üç istekte bitiyor:
 *   1. POST /api/auth/send-verification   → CODE_SENT | CODE_PENDING
 *   2. POST /api/auth/verify-email        → emailVerifiedToken  (kod: DEV bypass)
 *   3. POST /api/auth/register-and-complete  → TEK ATOMİK multipart, FOTOĞRAF DAHİL
 *   4. POST /api/user/Login               → bot token'ı (beğeni/gönderi + TEMİZLİK)
 *
 * ⚠️ `/api/profile/CompleteProfile` KULLANILMIYOR: o, zaten var olan bir
 * hesabın profilini tamamlıyor ve Bearer token istiyor. `register-and-complete`
 * tek istekte hesabı da profili de fotoğrafları da kuruyor, token gerektirmiyor.
 *
 * ⚠️ FOTOĞRAF PRESIGNED S3 DEĞİL — multipart DOSYA PARÇASI (`Photos`, tekrarlı,
 * min 2). Presigned yol yalnız iki yerde: kampüs anı ve sesli mesaj.
 */
import FormData from 'form-data';
import { API_ENDPOINTS } from '@/shared/constants/api';
import { FREE_MAX_DISTANCE_KM, MAX_PROFILE_PROMPTS } from '@/shared/constants/limits';
import { DEV_OTP, E2E_LAT, E2E_LON } from '../support/env';
import { post, postForm, type ResponseDto } from './client';
import { loadCatalogs } from './catalog';
import { displayNameFor, freshEmail, installationIdFor, passwordFor } from './emails';
import { botPhotos } from './photos';
import type { RegMode } from '../flows/types';

export interface BotSpec {
  readonly seed: number;
  readonly slot: number;
  readonly mode: RegMode;
  /** Varsayılan: simülatörle AYNI nokta (mesafe filtresi katı). */
  readonly lat?: number;
  readonly lon?: number;
  readonly photoCount?: 2 | 3;
  readonly role?: BotRole;
}

/** Botun koşudaki işi — rapor ve seçim için. */
export type BotRole = 'liker' | 'neutral' | 'feed' | 'campus';

export interface Bot {
  readonly spec: BotSpec;
  readonly email: string;
  readonly password: string;
  readonly displayName: string;
  readonly role: BotRole;
  readonly token: string;
  readonly userId: string;
}

function pick<T>(list: readonly T[], index: number): T {
  const item = list[index % list.length];
  if (!item) throw new Error('Boş listeden seçim yapılamaz');
  return item;
}

/** 20-28 yaş arası, seed'den türeyen deterministik doğum tarihi. */
function dobFor(seed: number, slot: number): string {
  const age = 20 + ((seed + slot) % 9);
  const month = ((seed + slot) % 12) + 1;
  const day = ((seed * 7 + slot) % 27) + 1;
  const year = new Date().getUTCFullYear() - age;
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0)).toISOString();
}

export async function createBot(spec: BotSpec): Promise<Bot> {
  const catalogs = await loadCatalogs(spec.mode);
  const email = freshEmail(spec.seed, spec.slot);
  const password = passwordFor(spec.seed, spec.slot);
  const displayName = displayNameFor(spec.seed, spec.slot);
  const lat = spec.lat ?? E2E_LAT;
  const lon = spec.lon ?? E2E_LON;

  // 1) Kod gönder — DEV bypass sayesinde mail kutusu okumak GEREKMİYOR.
  const sv = await post<{ status?: string }>(API_ENDPOINTS.SEND_VERIFICATION, { email });
  const status = sv.result?.status;
  if (status !== 'CODE_SENT' && status !== 'CODE_PENDING' && status !== 'PRE_VERIFIED') {
    throw new Error(
      `send-verification beklenmeyen durum: ${status}\n` +
        `  ACCOUNT_EXISTS ise önceki koşunun temizliği koşmamış:\n` +
        `    npm run e2e:seed -- --purge`
    );
  }

  // 2) Doğrula → emailVerifiedToken
  const ve = await post<{ emailVerifiedToken?: string }>(
    API_ENDPOINTS.VERIFY_EMAIL_REGISTRATION,
    { email, code: DEV_OTP }
  );
  const emailVerifiedToken = ve.result?.emailVerifiedToken;
  if (!emailVerifiedToken) {
    throw new Error(
      `emailVerifiedToken alınamadı. DEV kod bypass'ı (${DEV_OTP}) bu ortamda açık mı?`
    );
  }

  // 3) TEK ATOMİK multipart. Alan listesi profileSlice.ts:288-375 ile BİREBİR.
  const form = new FormData();
  const put = (key: string, value: unknown): void => {
    if (value === null || value === undefined || value === '') return;
    form.append(key, String(value));
  };

  put('EmailVerifiedToken', emailVerifiedToken);
  put('Email', email);
  put('FirstName', displayName);
  put('DisplayName', displayName);
  put('Gender', pick(catalogs.genders, spec.slot).enumName);
  put('DateOfBirth', dobFor(spec.seed, spec.slot));
  put('Password', password);
  // Davet freni: bot başına benzersiz olmak zorunda.
  put('InstallationId', installationIdFor(spec.seed, spec.slot));

  put('Height', 165 + ((spec.seed + spec.slot) % 25));
  put('Department', pick(catalogs.departments, spec.slot).enumName);
  put('YearOfStudy', (spec.slot % 5) + 1);
  // 8 ondalık — ürünün kendi biçimi.
  put('Latitude', lat.toFixed(8));
  put('Longitude', lon.toFixed(8));
  put('Mode', spec.mode);

  // InterestedIn YALNIZ Flört'te gidiyor: Arkadaş'ta o adım akışta yok ve boş
  // dizi sunucuda "zorunlu alan boş" hatası üretiyor.
  if (spec.mode !== 'Friends') {
    for (const entry of catalogs.interestedIn) form.append('InterestedIn', entry.enumName);
  }
  for (const hobby of catalogs.hobbies.slice(0, 3)) form.append('Hobbies', hobby.enumName);

  // ⚠️ `Prompts[i].PromptKey` — `PromptId` DEĞİL (promptPayload.ts:44).
  catalogs.prompts.slice(0, MAX_PROFILE_PROMPTS).forEach((prompt, i) => {
    form.append(`Prompts[${i}].PromptKey`, prompt.enumName);
    form.append(`Prompts[${i}].Answer`, `${displayName} · e2e tohum cevabı ${i + 1}`);
  });

  // Niyet alanları MODA GÖRE ayrışıyor, ASLA ikisi birden gitmiyor.
  if (spec.mode === 'Friends') {
    form.append('FriendshipIntents', pick(catalogs.friendshipIntents, spec.slot).enumName);
  } else {
    put('RelationshipIntent', pick(catalogs.relationshipIntents, spec.slot).enumName);
  }

  // Kayıtta mesafe sorulmuyor; yeni hesap free tavanıyla başlıyor.
  put('MaxDistance', FREE_MAX_DISTANCE_KM);
  for (const flag of ['ShowMyUniversity', 'ShowMeOnApp', 'ShowDistance', 'ShowAge']) {
    put(flag, true);
  }

  for (const photo of botPhotos(spec.slot, spec.photoCount ?? 2)) {
    form.append('Photos', photo.buffer, { filename: photo.name, contentType: 'image/jpeg' });
  }
  put('MainPhotoIndex', 0);

  await postForm(API_ENDPOINTS.REGISTER_AND_COMPLETE, form);

  // 4) Giriş — token hem tohumlama hem TEMİZLİK için gerekiyor.
  const login = await post<{ accessToken?: string; user?: { id?: string } }>(
    API_ENDPOINTS.LOGIN,
    { email, password }
  );
  const token = login.result?.accessToken;
  const userId = login.result?.user?.id;
  if (!token || !userId) {
    throw new Error(`Bot girişi token/userId döndürmedi: ${JSON.stringify(login).slice(0, 300)}`);
  }

  return {
    spec,
    email,
    password,
    displayName,
    role: spec.role ?? 'neutral',
    token,
    userId: String(userId),
  };
}

/** UI kullanıcısının id'sini al — botla AYNI yol (UI'dan okumaya çalışma). */
export async function loginAs(email: string, password: string): Promise<{ token: string; userId: string }> {
  const res: ResponseDto<{ accessToken?: string; user?: { id?: string } }> = await post(
    API_ENDPOINTS.LOGIN,
    { email, password }
  );
  const token = res.result?.accessToken;
  const userId = res.result?.user?.id;
  if (!token || !userId) throw new Error(`Giriş token/userId döndürmedi: ${email}`);
  return { token, userId: String(userId) };
}
