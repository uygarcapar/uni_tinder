# Keşif'te Şikayet Sonrası Kart Düşmesi — Uygulama Planı

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keşif'te şikayet başarıyla kaydedilince kart koşulsuz desteden düşer; şikayet edilenlerin sunucuda keşif adaylarından elenmesi için backend istek dokümanı yazılır.

**Architecture:** Tek satırlık koşul değişikliği — DiscoverScreen'deki ReportModal `onSuccess` callback'i `result?.blocked` şartını bırakıp `reportTarget` doluysa mevcut `dropProfileFromDeck` mekanizmasını çağırır. Backend tarafı kod değil doküman: repo kökündeki `backend_*.md` üslubunda talep yazısı.

**Tech Stack:** React Native (Expo), Jest (node 24 ŞART — node 20'de SIGSEGV).

**Spec:** `docs/superpowers/specs/2026-11-02-discover-report-drop-design.md`

## Global Constraints

- Commit mesajları Türkçe, repo'daki mevcut `tip(alan): açıklama` kalıbında; gövdede/trailer'da Claude atfı YOK.
- Jest `PATH="/opt/homebrew/opt/node@24/bin:$PATH"` ile koşulur.
- Şikayet engellemeye dönüşmez: `alsoBlock` gönderim gövdesi ve ReportModal davranışı DEĞİŞMEZ; yalnız DiscoverScreen'in başarı tepkisi değişir.

## Review Focus

- **Engelleme düşmüş şikayet (`blocked:false` + retry Alert'i):** kullanıcı "Tamam" ya da "tekrar dene" seçsin, her iki yolda da `onSuccess` çağrılır → kart düşmeli. (ReportModal sözleşmesi mevcut testlerde; DiscoverScreen tarafı Task 1'in manuel doğrulamasında.)
- **Şikayet edilen kart top kart değilken:** `dropProfileFromDeck` zaten guard'a yazıp indeksi oynatmıyor — davranış değişmemeli, yeni test gerekmez.
- **Deste son kartında şikayet:** `resetCardExpandState` + boş durum yolu `dropProfileFromDeck` içinde; değişiklik bu yolu aynen kullanır.
- **UT-6804 "zaten şikayet etmişsin":** catch dalı, `onSuccess` çağrılmaz → kart kalır. Spec'te bilinçli kapsam dışı; davranış değişikliği yok.
- **Ağ hatası / moderasyon reddi:** `onSuccess` çağrılmaz, kart kalır, sheet açık kalmaz (mevcut ReportModal hata yolu) — değişmez.

---

### Task 1: DiscoverScreen — şikayet başarısında koşulsuz düşürme

**Files:**
- Modify: `src/features/discover/screens/DiscoverScreen.tsx:3507-3515` (ReportModal `onSuccess`) ve `:2892-2894` (ilgili yorum)

**Interfaces:**
- Consumes: `dropProfileFromDeck(userId: string)` (aynı dosya, ~2705) — guard penceresi + WhoLikedMe temizliği + deste ilerletme.
- Produces: yok (davranış değişikliği).

Not — yeni unit test YOK, gerekçesi: DiscoverScreen jest'te mount edilemeyen 3500 satırlık ekran; değişen davranışın iki yapıtaşı zaten test altında (`ReportModal` onSuccess sözleşmesi `tests/shared/components/ReportModal*.test.tsx`'te, deste ilerletme mantığı discover modül testlerinde). Değişiklik tek koşul; doğrulama tip kontrolü + mevcut süitler.

- [ ] **Step 1: `onSuccess`'i güncelle**

`DiscoverScreen.tsx:3511-3514`:

```tsx
onSuccess={() => {
  // Şikayet edilen kart destede kalmasın — engelleme işaretli olsun olmasın.
  // Sunucu tarafı eleme talebi: backend_discover_report_exclusion_2026-11-02.md
  if (reportTarget) dropProfileFromDeck(reportTarget);
}}
```

`result` parametresi artık okunmuyor; kaldır. 2892-2894'teki blok yorumundaki
"blocked gelirse kartı da düşürüyoruz" cümlesini yeni davranışa göre düzelt
(şikayet başarısı = düşürme).

- [ ] **Step 2: Tip kontrolü**

Run: `npx tsc --noEmit`
Expected: hata yok (mevcut baseline'a yeni hata eklenmemiş).

- [ ] **Step 3: İlgili süitleri koştur**

Run: `PATH="/opt/homebrew/opt/node@24/bin:$PATH" npx jest tests/shared/components/ReportModal tests/features/discover -i`
Expected: tümü PASS.

- [ ] **Step 4: Commit**

```bash
git add src/features/discover/screens/DiscoverScreen.tsx
git commit -m "fix(discover): sikayet edilen kart engelleme isaretli olmasa da desteden dusuyor"
```

### Task 2: Backend istek dokümanı — şikayet edilenlerin keşiften elenmesi

**Files:**
- Create: `backend_discover_report_exclusion_2026-11-02.md`

**Interfaces:**
- Consumes: Task 1'in davranışı (dokümanın "istemci durumu" bölümü ona atıf yapar).
- Produces: yok (doküman).

- [ ] **Step 1: Dokümanı yaz**

Repo'daki `backend_*.md` üslubunda (başlık + Durum banner'ı → gözlem → talep → kurallar → istemci durumu), Türkçe. İçermesi gerekenler:

- **Durum:** BEKLİYOR; istemci tarafı (koşulsuz kart düşürme) 2026-11-02'de yapıldı, guard penceresi yalnız oturum içi koruyor.
- **Gözlem:** `POST /api/moderation/report` `alsoBlock:false` ile kaydedilen şikayette hedef, sonraki keşif aday çekişlerinde geri gelebiliyor; UT-6804 mükerrer şikayeti zaten tanıdığına göre sunucu şikayet ilişkisini tutuyor.
- **Talep 1:** Kullanıcının **aktif şikayeti olduğu** hedefler keşif adaylarından elensin (engellemeden bağımsız, kalıcı).
- **Talep 2:** Aynı eleme WhoLikedMe listesine de uygulansın (istemci rozeti `dropProfileFromDeck`'te anlık temizliyor ama sonraki fetch geri getirir).
- **Kurallar:** eleme tek yönlü (şikayet EDEN görmesin; edilenin destesi değişmez — "şikayet edildim" sızıntısı olmasın); mod ayrımı yok; sohbet/mevcut eşleşme ETKİLENMEZ (v1.5 kararı); şikayet moderasyonca reddedilirse elemenin kalkıp kalkmayacağı backend'in kararına bırakılır, iki yönde de istemci değişikliği gerektirmez.
- **İstemci durumu:** FE değişikliğinin özeti + `swipedAtRef` guard'ının neden yeterli olmadığı (bellek içi, oturumla sınırlı).

- [ ] **Step 2: Commit**

```bash
git add backend_discover_report_exclusion_2026-11-02.md
git commit -m "docs(backend): sikayet edilenlerin kesif adaylarindan elenmesi talebi"
```
