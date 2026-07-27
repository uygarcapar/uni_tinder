/**
 * Jest mock: react-native-mmkv v4 Nitro Module'dür — jest ortamında native
 * modül yok, import anında patlar. v4 API'si: `createMMKV(config)` instance
 * döner (MMKV artık yalnız tip). In-memory Map testler için yeterli.
 */
class MMKVMock {
  private map = new Map<string, string | number | boolean>();

  set(key: string, value: string | number | boolean) {
    this.map.set(key, value);
  }
  getString(key: string): string | undefined {
    const v = this.map.get(key);
    return typeof v === 'string' ? v : undefined;
  }
  getNumber(key: string): number | undefined {
    const v = this.map.get(key);
    return typeof v === 'number' ? v : undefined;
  }
  getBoolean(key: string): boolean | undefined {
    const v = this.map.get(key);
    return typeof v === 'boolean' ? v : undefined;
  }
  contains(key: string): boolean {
    return this.map.has(key);
  }
  remove(key: string): boolean {
    return this.map.delete(key);
  }
  getAllKeys(): string[] {
    return [...this.map.keys()];
  }
  clearAll() {
    this.map.clear();
  }
  encrypt(_key: string, _type?: string) {}
  recrypt(_key: string | undefined) {}
}

export type MMKV = MMKVMock;

export function createMMKV(_config?: {
  id?: string;
  path?: string;
  encryptionKey?: string;
}): MMKVMock {
  return new MMKVMock();
}

export function existsMMKV(_id: string): boolean {
  return false;
}

export function deleteMMKV(_id: string): void {}
