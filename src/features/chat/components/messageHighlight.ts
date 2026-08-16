import { useEffect, useState } from "react";

/**
 * Yanıt kartına dokunup hedef mesaja atlayınca o balonu kısa süre vurgulayan
 * minik dışsal store.
 *
 * NEDEN React state / prop DEĞİL: "hangi mesaj vurgulu" bilgisini ChatScreen
 * state'inde tutmak renderItem'ın kimliğini değiştirir → LegendList TÜM görünür
 * satırları yakma ve söndürme için iki kez yeniden render eder. Bu mimaride
 * kaçınılan render churn tam olarak budur (bkz. ChatMessageList başlığı).
 * Buradaki abonelikte ise dinleyici JS'te dolaşılır ama setState yalnız durumu
 * GERÇEKTEN değişen balonda (eskisi + yenisi) render tetikler.
 */

// Vurgunun toplam ömrü: yak + bekle + söndür.
export const HIGHLIGHT_DURATION = 500;
// scrollToIndex ANIMATED çalışıyor — vurgu hemen başlarsa hedef daha yoldayken
// yarısı bitmiş oluyor. Bu gecikme kadar bekleyip balon yerine otururken yakar.
const HIGHLIGHT_START_DELAY = 220;

let currentId: string | null = null;
const listeners = new Set<(id: string | null) => void>();
let startTimer: ReturnType<typeof setTimeout> | null = null;
let endTimer: ReturnType<typeof setTimeout> | null = null;

function emit(id: string | null) {
  currentId = id;
  listeners.forEach((listener) => listener(id));
}

/** Hedef balonu (gecikmeli olarak) HIGHLIGHT_DURATION boyunca vurgular. */
export function highlightMessage(id: string) {
  if (startTimer) clearTimeout(startTimer);
  if (endTimer) clearTimeout(endTimer);
  startTimer = null;
  endTimer = null;
  // Arka arkaya dokunuşta önceki vurgu anında bitsin — iki balon aynı anda
  // yanık kalmasın.
  if (currentId) emit(null);
  startTimer = setTimeout(() => {
    startTimer = null;
    emit(id);
    endTimer = setTimeout(() => {
      endTimer = null;
      emit(null);
    }, HIGHLIGHT_DURATION);
  }, HIGHLIGHT_START_DELAY);
}

/**
 * Balon bu id vurguluyken true döner. recycleItems açık olduğu için abonelik
 * id değişiminde tazelenir (container başka mesaja geçtiğinde vurgu sızmasın).
 */
export function useMessageHighlight(id: string) {
  const [on, setOn] = useState(() => currentId === id);
  useEffect(() => {
    setOn(currentId === id);
    const listener = (next: string | null) => setOn(next === id);
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, [id]);
  return on;
}
