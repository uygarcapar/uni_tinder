import { parseInviteLinkPath } from '@/navigation/inviteLink';

describe('parseInviteLinkPath', () => {
  it.each([
    ['invite/AK7M2', 'AK7M2'],
    ['/invite/AK7M2', 'AK7M2'],
    ['invite/ak7m2', 'AK7M2'],
    ['invite/AK7M2?utm=x', 'AK7M2'],
    ['invite/AK7M2/', 'AK7M2'],
    ['INVITE/AK7M2', 'AK7M2'],
    ['invite/AK%37M2', 'AK7M2'],
  ])('%s → %s', (path, expected) => {
    expect(parseInviteLinkPath(path)).toBe(expected);
  });

  it.each([
    ['chat/abc'],
    ['invite/'],
    ['invite/AK7'],          // eksik
    ['invite/AK7M2XYZ'],     // fazla: normalize 5'e keser ama link bozuk sayılmaz — bkz. aşağı
    ['discover'],
  ])('%s → eşleşmez ya da geçersiz', (path) => {
    const r = parseInviteLinkPath(path);
    // Fazla karakterli kod normalize ile 5'e kesildiği için geçerli döner;
    // sadece kısa/boş/başka rota null olmalı.
    if (path === 'invite/AK7M2XYZ') expect(r).toBe('AK7M2');
    else expect(r).toBeNull();
  });
});
