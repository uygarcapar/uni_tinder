/**
 * Tohumlayıcının HTTP istemcisi.
 *
 * ÜRÜNÜN `api.ts`İ KULLANILMIYOR ve bu bilinçli: o instance token kapısı,
 * 401 refresh rotasyonu, 429 retry ve MMKV'li token deposu taşıyor — hepsi
 * CİHAZ durumuna bağlı. Tohumlayıcı Node'da koşuyor, kendi token'ını elinde
 * tutuyor ve hiçbir yan etki istemiyor.
 *
 * UÇ ADRESLERİ ise ürünün tek kaynağından geliyor (`API_ENDPOINTS`) — string
 * kopyalamak, backend bir yolu değiştirdiğinde sessizce 404 almak demekti.
 */
import type FormData from 'form-data';
import { API_BASE_URL } from '../support/env';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | undefined,
    readonly body: unknown
  ) {
    super(message);
  }
}

/** Backend'in ortak sarmalı. Bazı uçlar düz gövde döndürüyor. */
export interface ResponseDto<T = unknown> {
  isSuccess?: boolean;
  message?: string;
  code?: string;
  result?: T;
}

const TIMEOUT_MS = 30_000;

function headers(token?: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    Accept: 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function parse(res: Response, path: string): Promise<unknown> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    // Düz metin — hata mesajında olduğu gibi gösterilecek.
  }
  const dto = body as ResponseDto | null;

  // ⚠️ Bu backend'de HTTP 200 + `isSuccess:false` YAYGIN. Yalnız `res.ok`a
  // bakmak, "başarılı" sanılan bir tohumlamayla devam etmek demek.
  const failed = !res.ok || dto?.isSuccess === false;
  if (failed) {
    throw new ApiError(
      `${path} → HTTP ${res.status}${dto?.code ? ` ${dto.code}` : ''}` +
        `${dto?.message ? `: ${dto.message}` : ''}`,
      res.status,
      dto?.code,
      body
    );
  }
  return body;
}

export async function post<T = unknown>(
  path: string,
  payload: unknown,
  token?: string
): Promise<ResponseDto<T>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return (await parse(res, path)) as ResponseDto<T>;
}

export async function getJson<T = unknown>(path: string, token?: string): Promise<ResponseDto<T>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
    headers: headers(token),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  return (await parse(res, path)) as ResponseDto<T>;
}

export async function postForm<T = unknown>(
  path: string,
  form: FormData,
  token?: string
): Promise<ResponseDto<T>> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'POST',
    // form-data kendi boundary'sini header'a koyuyor — elle Content-Type
    // yazmak boundary'yi düşürür ve sunucu gövdeyi hiç ayrıştıramaz.
    headers: headers(token, form.getHeaders()),
    body: form.getBuffer(),
    signal: AbortSignal.timeout(120_000),
  });
  return (await parse(res, path)) as ResponseDto<T>;
}

/**
 * Gövdeli DELETE — `/api/privacy/account` şifreyi GÖVDEDE istiyor.
 * 204 döndüğü için gövde ayrıştırılmıyor.
 */
export async function del(path: string, payload: unknown, token?: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: 'DELETE',
    headers: headers(token, { 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new ApiError(`${path} → HTTP ${res.status}`, res.status, undefined, await res.text());
  }
}

/** Presigned S3'e ham PUT — Authorization GÖNDERİLMİYOR (imza yeterli). */
export async function rawPut(url: string, body: Buffer, contentType: string): Promise<void> {
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: new Uint8Array(body),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    throw new ApiError(`S3 PUT → HTTP ${res.status}`, res.status, undefined, await res.text());
  }
}

/** ResponseDto sarmalı değişken: bazı uçlar düz dizi döndürüyor. */
export function unwrapList(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  const result = (payload as ResponseDto)?.result;
  if (Array.isArray(result)) return result;
  const items = (result as { items?: unknown })?.items;
  return Array.isArray(items) ? items : [];
}
