/**
 * Jest mock: expo-sqlite native modül — jest'te yok, import anında patlar.
 *
 * Map tabanlı sahte bir depo YAZMIYORUZ: bu katmanın yeni hata sınıfı SQL'in
 * kendisi (UPSERT'lerdeki local-wins CASE'leri, kısmi unique index, keyset
 * sayfalama). Sahte depo hepsini sessizce geçirirdi. Bunun yerine better-sqlite3
 * bağlanıyor — prod kodu DEĞİŞMEDEN GERÇEK SQLite koşuyor.
 *
 * Neden better-sqlite3, node:sqlite değil: CI Node 20'ye sabit (.github/workflows),
 * node:sqlite 22+ istiyor.
 *
 * "Dosya" semantiği: handle'lar ada göre bir registry'de tutuluyor. closeSync()
 * yalnız sarmalayıcıyı kapatır (veri durur, tıpkı gerçek dosyada olduğu gibi);
 * veriyi ancak deleteDatabaseSync() siler. Migration'ların yeniden-açılışta
 * idempotent olduğunu doğrulayabilmek için bu ayrım şart.
 */
import Database from 'better-sqlite3';
import type { Database as DatabaseHandle } from 'better-sqlite3';

const files = new Map<string, DatabaseHandle>();

type BindParams = unknown[] | Record<string, unknown> | undefined;

/** expo-sqlite'ın normalizeParams'ı ile aynı davranış: boolean → 0/1, undefined → null. */
function toPositional(params: BindParams): unknown[] {
  if (params == null) return [];
  const list = Array.isArray(params) ? params : Object.values(params);
  return list.map((value) => {
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value ?? null;
  });
}

class SQLiteDatabaseMock {
  private closed = false;

  constructor(
    public readonly databaseName: string,
    private readonly handle: DatabaseHandle,
  ) {}

  private assertOpen() {
    if (this.closed) throw new Error(`database "${this.databaseName}" is closed`);
  }

  execSync(source: string): void {
    this.assertOpen();
    this.handle.exec(source);
  }

  runSync(source: string, params?: BindParams) {
    this.assertOpen();
    const result = this.handle.prepare(source).run(...toPositional(params));
    return {
      lastInsertRowId: Number(result.lastInsertRowid),
      changes: result.changes,
    };
  }

  getAllSync<T>(source: string, params?: BindParams): T[] {
    this.assertOpen();
    return this.handle.prepare(source).all(...toPositional(params)) as T[];
  }

  getFirstSync<T>(source: string, params?: BindParams): T | null {
    this.assertOpen();
    return (this.handle.prepare(source).get(...toPositional(params)) as T) ?? null;
  }

  withTransactionSync(task: () => void): void {
    this.assertOpen();
    this.handle.transaction(task)();
  }

  closeSync(): void {
    this.closed = true;
  }
}

export type SQLiteDatabase = SQLiteDatabaseMock;

export function openDatabaseSync(databaseName: string): SQLiteDatabaseMock {
  let handle = files.get(databaseName);
  if (!handle) {
    handle = new Database(':memory:');
    files.set(databaseName, handle);
  }
  return new SQLiteDatabaseMock(databaseName, handle);
}

export function deleteDatabaseSync(databaseName: string): void {
  const handle = files.get(databaseName);
  if (!handle) throw new Error(`database "${databaseName}" does not exist`);
  handle.close();
  files.delete(databaseName);
}

/** Yalnız test içindir — suite'ler arası "disk"i temizler. */
export function __resetAllDatabases(): void {
  for (const handle of files.values()) handle.close();
  files.clear();
}
