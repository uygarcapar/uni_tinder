import api from "@/shared/services/api";

// Statik referans verisi (şehirler, hobiler, burçlar, diller… — oturum boyunca
// değişmeyen enum listeleri) için endpoint-bazlı in-flight + kalıcı cache.
// Aynı endpoint'i farklı ekranlar/subsystem'ler (ör. Discover filtresi react-query
// ile, ProfileScreen batch ile) çekince cold-boot'ta duplike oluyordu (cities ×2).
// staticGet aynı endpoint için tek bir promise paylaştırır → tek network isteği.
// api.get'in ham cevabını ({isSuccess, result}) olduğu gibi cache'ler; hem `safe()`
// wrapper'ı hem react-query queryFn aynı şekli tüketir.
const cache = new Map<string, Promise<any>>();

export function staticGet(endpoint: string): Promise<any> {
  const hit = cache.get(endpoint);
  if (hit) return hit;
  const p = api.get(endpoint).catch((e) => {
    // Hata cache'lenmesin — sonraki çağrı tekrar denesin.
    cache.delete(endpoint);
    throw e;
  });
  cache.set(endpoint, p);
  return p;
}

// Gerekirse (ör. dil değişimi Accept-Language'ı etkiliyorsa) elle temizle.
export function bustStaticCache(endpoint?: string) {
  if (endpoint) cache.delete(endpoint);
  else cache.clear();
}
