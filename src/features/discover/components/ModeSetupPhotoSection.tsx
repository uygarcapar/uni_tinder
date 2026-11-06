import React, { useCallback, useState } from "react";
import { Pressable, Text, TouchableOpacity, View } from "react-native";
import { Image } from "expo-image";
import { useTranslation } from "react-i18next";
import PhotoSourceSheet from "@/shared/components/PhotoSourceSheet";
import RegisterOptionCheckbox from "@/features/auth/components/RegisterOptionCheckbox";
import {
  captureAndCropPhoto,
  pickAndCropPhotos,
  type PickedPhoto,
} from "@/shared/utils/photoPicker";
import { MAX_PROFILE_PHOTOS } from "@/shared/constants/limits";
import { colors } from "@/shared/theme/colors";
import { Plus, X } from "@/shared/icons";
import SFIcon from "@/shared/components/SFIcon";
import {
  ITEM_HEIGHT,
  ITEM_WIDTH,
  PHOTO_GRID_COLUMNS,
  ROW_GAP,
  getPosition,
} from "@/features/profile/components/photoGridGeometry";

/**
 * Mod kurulumunun FOTOĞRAF bölümü — iki ALTERNATİF yol (karma yok; karma
 * düzenleme editörün işi):
 *
 *  • `existing` — kaynak modun (açılan modun TERSİ) fotoğrafları devralınır.
 *    Satır yalnız kaynakta ≥ 2 GÖRÜNÜR foto varken çizilir: sunucunun
 *    görünürlük eşiği mod başına 2 (`PhotoVisibility.MinimumVisiblePhotos`),
 *    daha azını devralmak yeni modu `HiddenInsufficientPhotos`a düşürürdü —
 *    bu da tasarımın anti-hedefi (görünürlük penceresi).
 *  • `new` — kurulumda çekilen/seçilen kareler. YEREL kalırlar (upload
 *    submit'te, kayıt akışı kalıbı); sıra = ekleme sırası, İLK kare ana.
 *
 * Bileşen veriye sahip değil (ProfilePhotoGrid'in kuralı): seçim
 * `value`/`onChange` ile çağıranda, min-2 doğrulaması ve gönderim
 * ModeSetupSheet'te. Burada sürükleme/sıralama YOK — ama karo boyu, aralıklar
 * ve karo görünümü editördeki ProfilePhotoGrid'le BİREBİR (geometri
 * `photoGridGeometry`den): iki yüzey aynı ızgarayı göstermeli.
 *
 * ⚠️ PhotoSourceSheet gorhom tabanlı ve bu bölüm AppModal'ın İÇİNDE yaşıyor
 * (provider modal'ın içinde, bkz. AppModal doc'u) — `stackBehavior="push"`
 * sheet'i modalın üstüne katmanlar. Cihaz doğrulaması Task 8'de.
 */
export type SetupPhotoChoice =
  | { kind: "existing" }
  | { kind: "new"; photos: PickedPhoto[] };

/** Görünürlük eşiği — sunucu sabitinin FE aynası (Global Constraints). */
export const SETUP_MIN_PHOTOS = 2;

type SourcePhoto = { photoId: string; photoImageUrl: string | null };

type Props = {
  /** Kaynak modun GÖRÜNÜR fotoğrafları, sıralı (çağıran süzüyor). */
  sourcePhotos: SourcePhoto[];
  /** "Flört" | "Arkadaş" — seçenek satırının etiketi için. */
  sourceModeLabel: string;
  value: SetupPhotoChoice;
  onChange: (next: SetupPhotoChoice) => void;
};

export default function ModeSetupPhotoSection({
  sourcePhotos,
  sourceModeLabel,
  value,
  onChange,
}: Props) {
  const { t } = useTranslation();
  const [sourceSheetVisible, setSourceSheetVisible] = useState(false);

  const canUseExisting = sourcePhotos.length >= SETUP_MIN_PHOTOS;
  const newPhotos = value.kind === "new" ? value.photos : [];

  const toggleExisting = useCallback(() => {
    onChange(
      value.kind === "existing"
        ? { kind: "new", photos: [] }
        : { kind: "existing" },
    );
  }, [onChange, value.kind]);

  const appendPhotos = useCallback(
    (added: PickedPhoto[]) => {
      if (added.length === 0) return;
      const room = MAX_PROFILE_PHOTOS - newPhotos.length;
      onChange({ kind: "new", photos: [...newPhotos, ...added.slice(0, room)] });
    },
    [newPhotos, onChange],
  );

  const addFromGallery = useCallback(async () => {
    // Kalan slot kadar iste — picker fazlasını zaten seçtirmesin.
    let picked: PickedPhoto[];
    try {
      picked = await pickAndCropPhotos(MAX_PROFILE_PHOTOS - newPhotos.length);
    } catch {
      return; // iptal/izin — sessiz, kayıt akışıyla aynı taraf
    }
    appendPhotos(picked);
  }, [appendPhotos, newPhotos.length]);

  const addFromCamera = useCallback(async () => {
    let shot: PickedPhoto | null;
    try {
      shot = await captureAndCropPhoto();
    } catch {
      return;
    }
    if (shot) appendPhotos([shot]);
  }, [appendPhotos]);

  const removeAt = useCallback(
    (index: number) => {
      onChange({
        kind: "new",
        photos: newPhotos.filter((_, i) => i !== index),
      });
    },
    [newPhotos, onChange],
  );

  // Kurulumda düzenlenecek bir şey yoksa (devralma) yalnız önizleme karoları;
  // yeni-kare yolunda karolar + tavan dolmadıysa ekle karosu.
  const tileCount =
    value.kind === "existing"
      ? sourcePhotos.length
      : newPhotos.length + (newPhotos.length < MAX_PROFILE_PHOTOS ? 1 : 0);

  return (
    <View>
      {/* Diğer bölüm başlıklarıyla AYNI ölçü (ModeSetupSheet `Section`: 20/600). */}
      <Text style={{ fontSize: 20, fontWeight: "600", color: colors.text }}>
        {t("discover.mode.photos.title")}
      </Text>
      {/* Açıklama — diğer bölümlerin (ModeSetupSheet `Section`) ölçüsünde. */}
      <Text
        style={{
          color: colors.textSecondary,
          fontSize: 14,
          lineHeight: 20,
          marginTop: 6,
        }}
      >
        {t("discover.mode.photos.description")}
      </Text>

      {/* Editördeki seçenek satırıyla (EditProfileForm → OptionListItem
          `checkbox`) AYNI düzen: metin solda 16/500, seçili değilken gri;
          kutu sağda. Diğer bölümlerin satırları da bu kalıpta. */}
      {canUseExisting ? (
        <Pressable
          onPress={toggleExisting}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value.kind === "existing" }}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingVertical: 18,
          }}
        >
          <Text
            style={{
              color:
                value.kind === "existing" ? colors.text : colors.textSecondary,
              fontSize: 16,
              lineHeight: 22,
              fontWeight: "500",
              flex: 1,
              paddingRight: 12,
            }}
          >
            {t("discover.mode.photos.useExisting", { mode: sourceModeLabel })}
          </Text>
          <RegisterOptionCheckbox selected={value.kind === "existing"} />
        </Pressable>
      ) : null}

      {/* Izgara editördekiyle (ProfilePhotoGrid) AYNI geometri: karo boyu,
          sütun/satır aralığı ve konum `photoGridGeometry`den. Sürükleme yok —
          kurulumda sıra = ekleme sırası (bkz. dosya başı). Üst pay 16: karoların
          silme düğmesi 8pt yukarı taşıyor. */}
      <View
        style={{
          position: "relative",
          width: "100%",
          height: gridHeight(tileCount),
          // Seçenek satırı varsa onun 18'lik alt payı zaten boşluk veriyor;
          // 8 = silme düğmesinin yukarı taşma payı.
          marginTop: canUseExisting ? 8 : 16,
        }}
      >
        {value.kind === "existing"
          ? sourcePhotos.map((p, i) => (
              <GridSlot key={p.photoId} index={i}>
                <PhotoTile
                  testID={`setup-photo-preview-${p.photoId}`}
                  uri={p.photoImageUrl}
                />
              </GridSlot>
            ))
          : newPhotos.map((p, i) => (
              <GridSlot key={p.uri} index={i}>
                <PhotoTile uri={p.uri} main={i === 0} mainLabel={t("discover.mode.photos.mainBadge")} />
                <TouchableOpacity
                  testID={`setup-photo-remove-${i}`}
                  accessibilityLabel={t("discover.mode.photos.remove")}
                  activeOpacity={1}
                  onPress={() => removeAt(i)}
                  style={{
                    position: "absolute",
                    top: -8,
                    right: -8,
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 50,
                    backgroundColor: colors.surface,
                  }}
                >
                  <View pointerEvents="none">
                    <SFIcon
                      name="xmark"
                      fallback={X}
                      size={16}
                      strokeWidth={3}
                      color={colors.textSecondary}
                      weight="bold"
                    />
                  </View>
                </TouchableOpacity>
              </GridSlot>
            ))}

        {value.kind === "new" && newPhotos.length < MAX_PROFILE_PHOTOS ? (
          <GridSlot index={newPhotos.length}>
            <TouchableOpacity
              testID="setup-photo-add"
              accessibilityLabel={t("discover.mode.photos.addTile")}
              activeOpacity={1}
              onPress={() => setSourceSheetVisible(true)}
              style={{
                width: "100%",
                height: "100%",
                borderRadius: 28,
                borderCurve: "continuous",
                overflow: "hidden",
                backgroundColor: colors.surface,
                borderWidth: 0.5,
                borderColor: colors.hairline,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <View pointerEvents="none">
                <SFIcon
                  name="plus"
                  fallback={Plus}
                  size={40}
                  strokeWidth={2}
                  color={colors.textMuted}
                  weight="semibold"
                />
              </View>
            </TouchableOpacity>
          </GridSlot>
        ) : null}
      </View>

      <PhotoSourceSheet
        visible={sourceSheetVisible}
        onClose={() => setSourceSheetVisible(false)}
        onCamera={addFromCamera}
        onGallery={addFromGallery}
        stackBehavior="push"
      />
    </View>
  );
}

/** Karo sayısına göre ızgara yüksekliği — satır sayısı × karo + satır araları. */
function gridHeight(count: number): number {
  if (count <= 0) return 0;
  const rows = Math.ceil(count / PHOTO_GRID_COLUMNS);
  return rows * ITEM_HEIGHT + (rows - 1) * ROW_GAP;
}

/** Bir slotun mutlak kutusu — konum editörün `getPosition`ından. */
function GridSlot({ index, children }: { index: number; children: React.ReactNode }) {
  const pos = getPosition(index);
  return (
    <View
      style={{
        position: "absolute",
        left: pos.x,
        top: pos.y,
        width: ITEM_WIDTH,
        height: ITEM_HEIGHT,
      }}
    >
      {children}
    </View>
  );
}

/** Editörün `PhotoItem` çerçevesiyle aynı: 20 yarıçap, ince kenar, surface zemin. */
function PhotoTile({
  uri,
  main = false,
  mainLabel,
  testID,
}: {
  uri: string | null;
  main?: boolean;
  mainLabel?: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={{
        width: "100%",
        height: "100%",
        borderRadius: 20,
        borderCurve: "continuous",
        overflow: "hidden",
        backgroundColor: colors.surface,
        borderWidth: 0.5,
        borderColor: colors.hairline,
      }}
    >
      <Image
        source={uri ? { uri } : undefined}
        style={{ width: "100%", height: "100%" }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
      />
      {main ? (
        <View
          testID="setup-photo-main-0"
          style={{
            position: "absolute",
            left: 8,
            bottom: 8,
            borderRadius: 8,
            paddingHorizontal: 7,
            paddingVertical: 2,
            backgroundColor: colors.inverseSurface,
          }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: "700",
              color: colors.onInverseSurface,
            }}
          >
            {mainLabel}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
