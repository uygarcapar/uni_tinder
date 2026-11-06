import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";
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
 * ModeSetupSheet'te. Burada sürükleme/sıralama YOK — statik ızgara; tam
 * ızgara (B yaklaşımı) bilinçli elendi, bkz. tasarım dokümanı.
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

const TILE = 72;
const RADIUS = 12;

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

  return (
    <View style={{ gap: 12 }}>
      <Text
        style={{
          fontSize: 15,
          fontWeight: "600",
          color: colors.text,
        }}
      >
        {t("discover.mode.photos.title")}
      </Text>

      {canUseExisting ? (
        <Pressable
          onPress={toggleExisting}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: value.kind === "existing" }}
          style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
        >
          <RegisterOptionCheckbox selected={value.kind === "existing"} />
          <Text style={{ fontSize: 15, color: colors.text, flex: 1 }}>
            {t("discover.mode.photos.useExisting", { mode: sourceModeLabel })}
          </Text>
        </Pressable>
      ) : null}

      {value.kind === "existing" ? (
        // Salt-okunur önizleme şeridi — devralınacak kareler. Izgara değil:
        // burada düzenlenecek bir şey yok, yalnız "bunlar gelecek" bilgisi.
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {sourcePhotos.map((p) => (
            <Image
              key={p.photoId}
              testID={`setup-photo-preview-${p.photoId}`}
              source={p.photoImageUrl ? { uri: p.photoImageUrl } : undefined}
              style={{
                width: TILE,
                height: (TILE * 4) / 3,
                borderRadius: RADIUS,
                backgroundColor: colors.surface2,
              }}
              contentFit="cover"
            />
          ))}
        </View>
      ) : (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {newPhotos.map((p, i) => (
            <View key={p.uri} style={{ position: "relative" }}>
              <Image
                source={{ uri: p.uri }}
                style={{
                  width: TILE,
                  height: (TILE * 4) / 3,
                  borderRadius: RADIUS,
                  backgroundColor: colors.surface2,
                }}
                contentFit="cover"
              />
              {i === 0 ? (
                <View
                  testID="setup-photo-main-0"
                  style={{
                    position: "absolute",
                    left: 4,
                    bottom: 4,
                    borderRadius: 6,
                    paddingHorizontal: 5,
                    paddingVertical: 1,
                    backgroundColor: colors.inverseSurface,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: "700",
                      color: colors.onInverseSurface,
                    }}
                  >
                    {t("discover.mode.photos.mainBadge")}
                  </Text>
                </View>
              ) : null}
              <Pressable
                testID={`setup-photo-remove-${i}`}
                accessibilityLabel={t("discover.mode.photos.remove")}
                onPress={() => removeAt(i)}
                hitSlop={8}
                style={{
                  position: "absolute",
                  right: -6,
                  top: -6,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.inverseSurface,
                }}
              >
                <X size={13} color={colors.onInverseSurface} strokeWidth={2.5} />
              </Pressable>
            </View>
          ))}
          {newPhotos.length < MAX_PROFILE_PHOTOS ? (
            <Pressable
              testID="setup-photo-add"
              accessibilityLabel={t("discover.mode.photos.addTile")}
              onPress={() => setSourceSheetVisible(true)}
              style={{
                width: TILE,
                height: (TILE * 4) / 3,
                borderRadius: RADIUS,
                borderWidth: 1,
                borderStyle: "dashed",
                borderColor: colors.hairlineStrong,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Plus size={22} color={colors.textMuted} strokeWidth={1.8} />
            </Pressable>
          ) : null}
        </View>
      )}

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
