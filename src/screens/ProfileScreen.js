import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  TextInput,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  StatusBar,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useDispatch, useSelector } from "react-redux";
import { logout } from "../store/slices/authSlice";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/api";
import profileService from "../services/profileService";
import api from "../services/api";
import SwipeCard from "../components/SwipeCard";
import {
  LogOut,
  Trash2,
  Eye,
  ChevronRight,
  Pencil,
  Check,
  X,
  Plus,
  Crown,
  User,
  GraduationCap,
  Heart,
  Sparkles,
  Cigarette,
  Target,
  BookOpen,
  MapPin,
} from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { BlurView } from "expo-blur";

const { width, height } = Dimensions.get("window");

// ─── Küçük yardımcılar ────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, onEdit }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon size={14} color="#9CA3AF" strokeWidth={1.5} />
        <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
          {label}
        </Text>
      </View>
      {onEdit && (
        <TouchableOpacity
          onPress={onEdit}
          style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Pencil size={18} color="#9CA3AF" strokeWidth={1.5} />
        </TouchableOpacity>
      )}
    </View>
  );
}

function CardBox({ children, style }) {
  return (
    <View style={[{ backgroundColor: "#1E1E1E", borderRadius: 20, padding: 16, marginTop: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)" }, style]}>
      {children}
    </View>
  );
}

// ─── Edit Modal sarmalayıcı ───────────────────────────────────────────────────

function EditModal({ visible, title, onClose, onSave, saving, children }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "#121212" }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingTop: 56, paddingBottom: 16, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.08)" }}>
          <TouchableOpacity onPress={onClose}>
            <X size={22} color="#9CA3AF" strokeWidth={2} />
          </TouchableOpacity>
          <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>{title}</Text>
          <TouchableOpacity onPress={onSave} disabled={saving}>
            {saving
              ? <ActivityIndicator size={18} color="#fff" />
              : <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Kaydet</Text>
            }
          </TouchableOpacity>
        </View>
        {children}
      </View>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════

export default function ProfileScreen() {
  const dispatch = useDispatch();
  const { user, token } = useSelector((state) => state.auth);

  // ── Profil verisi ──────────────────────────────────────────────────────────
  const [myProfile, setMyProfile] = useState(null);
  const [hobbyMap, setHobbyMap] = useState({});       // { id → name }
  const [hobbyGroups, setHobbyGroups] = useState([]); // [{ category, hobbies:[{id,name}] }]
  const [smokingOptions, setSmokingOptions] = useState([]);
  const [zodiacOptions, setZodiacOptions] = useState([]);
  const [usagePurposeOptions, setUsagePurposeOptions] = useState([]);

  // ── Genel UI ───────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [password, setPassword] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);

  // ── Bio düzenleme ──────────────────────────────────────────────────────────
  const [editingBio, setEditingBio] = useState(false);
  const [bioText, setBioText] = useState("");
  const [savingBio, setSavingBio] = useState(false);

  // ── Hobi düzenleme ────────────────────────────────────────────────────────
  const [editHobbiesVisible, setEditHobbiesVisible] = useState(false);
  const [draftHobbies, setDraftHobbies] = useState([]); // string[]
  const [savingHobbies, setSavingHobbies] = useState(false);

  // ── Fotoğraf yönetimi ─────────────────────────────────────────────────────
  const [savingPhoto, setSavingPhoto] = useState(false);

  // ── Yaşam tarzı düzenleme ─────────────────────────────────────────────────
  const [editLifestyleVisible, setEditLifestyleVisible] = useState(false);
  const [draftSmoking, setDraftSmoking] = useState(null);       // { id, name }
  const [draftZodiac, setDraftZodiac] = useState(null);
  const [draftUsagePurpose, setDraftUsagePurpose] = useState(null);
  const [savingLifestyle, setSavingLifestyle] = useState(false);

  // ── Veri yükleme ───────────────────────────────────────────────────────────
  const loadProfile = useCallback(async () => {
    try {
      const [profile, hobbiesRes, smokingRes, zodiacRes, usageRes] = await Promise.all([
        profileService.getMyProfile(),
        api.get(API_ENDPOINTS.GET_HOBBIES).catch(() => null),
        api.get(API_ENDPOINTS.GET_SMOKING_STATUSES).catch(() => null),
        api.get(API_ENDPOINTS.GET_ZODIACS).catch(() => null),
        api.get(API_ENDPOINTS.GET_USAGE_PURPOSES).catch(() => null),
      ]);

      setMyProfile(profile);
      setBioText(profile?.bio || "");

      // Hobi map ve gruplar
      if (hobbiesRes?.result) {
        const groups = Array.isArray(hobbiesRes.result) ? hobbiesRes.result : [];
        const map = {};
        groups.forEach((g) => (g.hobbies || []).forEach((h) => { map[h.id] = h.name; }));
        setHobbyMap(map);
        setHobbyGroups(groups);
      }

      if (smokingRes?.result) setSmokingOptions(smokingRes.result);
      if (zodiacRes?.result)  setZodiacOptions(zodiacRes.result);
      if (usageRes?.result)   setUsagePurposeOptions(usageRes.result);
    } catch (e) {
      console.error("Profile load error:", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { loadProfile(); }, [loadProfile]);
  const onRefresh = useCallback(() => { setRefreshing(true); loadProfile(); }, [loadProfile]);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const resolveHobbies = (raw) => {
    if (!raw?.length) return [];
    return raw.map((h) => {
      if (typeof h === "string" && isNaN(Number(h))) return h;
      return hobbyMap[Number(h)] || String(h);
    });
  };

  const buildPreviewProfile = () => {
    if (!myProfile) return null;
    const photos = (myProfile.photosList || [])
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map((p) => p.photoImageUrl)
      .filter(Boolean);
    return {
      userId: user?.userId,
      displayName: myProfile.displayName || user?.displayName,
      age: myProfile.user?.age || user?.age,
      photos,
      isPremium: myProfile.isPremium,
      universityName: myProfile.user?.universityName || user?.universityName,
      showUniversity: myProfile.showMyUniversity !== false,
      departmentDisplay: myProfile.departmentDisplay || String(myProfile.department ?? ""),
      yearOfStudy: myProfile.yearOfStudy,
      yearOfStudyDisplay: myProfile.yearOfStudyDisplay,
      bio: bioText || myProfile.bio,
      hobbies: resolveHobbies(myProfile.hobbies),
      smokingStatusDisplay: myProfile.smokingStatusDisplay,
      zodiacSignDisplay: myProfile.zodiacSignDisplay,
      usagePurposeDisplay: myProfile.usagePurposeDisplay,
      cityDisplay: myProfile.cityDisplay,
      districtDisplay: myProfile.districtDisplay,
      distance: null,
    };
  };

  // ── Bio ────────────────────────────────────────────────────────────────────
  const handleSaveBio = async () => {
    if (savingBio) return;
    setSavingBio(true);
    try {
      await profileService.updateProfile({ Bio: bioText });
      setMyProfile((p) => ({ ...p, bio: bioText }));
      setEditingBio(false);
    } catch {
      Alert.alert("Hata", "Bio güncellenemedi, tekrar dene.");
    } finally {
      setSavingBio(false);
    }
  };

  // ── Hobiler ────────────────────────────────────────────────────────────────
  const openHobbiesEdit = () => {
    // Raw IDs'leri draft'a yükle (integer array)
    const rawIds = (myProfile?.hobbies || []).map((h) => Number(h));
    setDraftHobbies(rawIds);
    setEditHobbiesVisible(true);
  };

  const toggleHobby = (id) => {
    setDraftHobbies((prev) =>
      prev.includes(id) ? prev.filter((h) => h !== id) : [...prev, id]
    );
  };

  const handleSaveHobbies = async () => {
    setSavingHobbies(true);
    try {
      // Boş liste = "kaldır" intent'i. Aksi halde profileService null/boş array'i
      // FormData'ya hiç eklemediği için backend update'i atlar.
      const payload = draftHobbies.length > 0
        ? { Hobbies: draftHobbies }
        : { ClearHobbies: true };
      await profileService.updateProfile(payload);
      setMyProfile((p) => ({ ...p, hobbies: draftHobbies }));
      setEditHobbiesVisible(false);
    } catch (e) {
      console.error("Hobi kayıt hatası:", JSON.stringify(e?.response?.data || e?.message || e));
      Alert.alert("Hata", "Hobiler güncellenemedi, tekrar dene.");
    } finally {
      setSavingHobbies(false);
    }
  };

  // ── Yaşam tarzı ────────────────────────────────────────────────────────────
  const openLifestyleEdit = () => {
    // Mevcut seçimleri draft'a yükle
    setDraftSmoking(
      smokingOptions.find((o) => o.id === myProfile?.smokingStatus) || null
    );
    setDraftZodiac(
      zodiacOptions.find((o) => o.id === myProfile?.zodiacSign) || null
    );
    setDraftUsagePurpose(
      usagePurposeOptions.find((o) => o.id === myProfile?.usagePurpose) || null
    );
    setEditLifestyleVisible(true);
  };

  const handleSaveLifestyle = async () => {
    setSavingLifestyle(true);
    try {
      // Bir alan için draft null'sa kullanıcı seçimi kaldırmış demektir. Backend
      // null/eksik alanı "değişmedi" olarak yorumlar, bu yüzden mevcut profilde
      // bir değer varsa explicit Clear* flag'i ile silme intent'i iletiyoruz.
      const updates = {};

      if (draftSmoking != null) updates.SmokingStatus = draftSmoking.id;
      else if (myProfile?.smokingStatus != null) updates.ClearSmokingStatus = true;

      if (draftZodiac != null) updates.ZodiacSign = draftZodiac.id;
      else if (myProfile?.zodiacSign != null) updates.ClearZodiacSign = true;

      if (draftUsagePurpose != null) updates.UsagePurpose = draftUsagePurpose.id;
      else if (myProfile?.usagePurpose != null) updates.ClearUsagePurpose = true;

      // Hiçbir değişiklik yoksa boşa istek gönderme
      if (Object.keys(updates).length === 0) {
        setEditLifestyleVisible(false);
        return;
      }

      await profileService.updateProfile(updates);

      setMyProfile((p) => ({
        ...p,
        smokingStatus: draftSmoking?.id,
        smokingStatusDisplay: draftSmoking?.name,
        zodiacSign: draftZodiac?.id,
        zodiacSignDisplay: draftZodiac?.name,
        usagePurpose: draftUsagePurpose?.id,
        usagePurposeDisplay: draftUsagePurpose?.name,
      }));
      setEditLifestyleVisible(false);
    } catch (e) {
      console.error("Yaşam tarzı kayıt hatası:", JSON.stringify(e?.response?.data || e?.message || e));
      Alert.alert("Hata", "Bilgiler güncellenemedi, tekrar dene.");
    } finally {
      setSavingLifestyle(false);
    }
  };

  // ── Fotoğraf aksiyonları ───────────────────────────────────────────────────
  const refreshPhotos = async () => {
    try {
      const profile = await profileService.getMyProfile();
      setMyProfile(profile);
      setBioText(profile?.bio || "");
    } catch (e) {
      console.error("Profil yenileme hatası:", e?.message);
    }
  };

  const handleAddPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("İzin Gerekli", "Fotoğraf eklemek için galeri iznine ihtiyaç var.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [3, 4],
      quality: 0.85,
    });
    if (result.canceled) return;

    const asset = result.assets[0];
    const file = {
      uri: asset.uri,
      type: asset.mimeType || "image/jpeg",
      name: asset.fileName || `photo_${Date.now()}.jpg`,
    };

    setSavingPhoto(true);
    try {
      await profileService.updateProfile({ NewPhotos: [file] });
      await refreshPhotos();
    } catch (e) {
      console.error("Fotoğraf yükleme hatası:", e?.response?.data || e?.message);
      Alert.alert("Hata", "Fotoğraf yüklenemedi, tekrar dene.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handlePhotoPress = (photo) => {
    const isMain = photo.isMainPhoto;
    const options = [];
    if (!isMain) options.push({ text: "Ana Fotoğraf Yap", onPress: () => handleSetMainPhoto(photo.photoId) });
    options.push({ text: "Sil", style: "destructive", onPress: () => handleDeletePhoto(photo.photoId) });
    options.push({ text: "İptal", style: "cancel" });
    Alert.alert("Fotoğraf", "", options);
  };

  const handleSetMainPhoto = async (photoId) => {
    setSavingPhoto(true);
    try {
      await profileService.updateProfile({ NewMainPhotoId: photoId });
      await refreshPhotos();
    } catch (e) {
      console.error("Ana fotoğraf hatası:", e?.response?.data || e?.message);
      Alert.alert("Hata", "Ana fotoğraf değiştirilemedi.");
    } finally {
      setSavingPhoto(false);
    }
  };

  const handleDeletePhoto = async (photoId) => {
    setSavingPhoto(true);
    try {
      await profileService.updateProfile({ PhotoIdsToDelete: [photoId] });
      await refreshPhotos();
    } catch (e) {
      console.error("Fotoğraf silme hatası:", e?.response?.data || e?.message);
      Alert.alert("Hata", "Fotoğraf silinemedi.");
    } finally {
      setSavingPhoto(false);
    }
  };

  // ── Hesap aksiyonları ──────────────────────────────────────────────────────
  const handleLogout = () =>
    Alert.alert("Çıkış Yap", "Hesabından çıkmak istediğine emin misin?", [
      { text: "İptal", style: "cancel" },
      { text: "Çıkış Yap", style: "destructive", onPress: () => dispatch(logout()) },
    ]);

  const confirmDelete = () =>
    Alert.alert("Hesabı Sil", "Bu işlem geri alınamaz. Emin misin?", [
      { text: "İptal", style: "cancel" },
      { text: "Devam Et", style: "destructive", onPress: () => setShowDeleteModal(true) },
    ]);

  const handleDeleteAccount = async () => {
    if (!password.trim()) return Alert.alert("Hata", "Lütfen şifrenizi girin");
    setDeleteLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.DELETE_ACCOUNT}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ userId: user?.userId, password }),
      });
      const data = await response.json();
      if (response.ok && data.isSuccess) {
        Alert.alert("Başarılı", "Hesabınız silindi", [
          { text: "Tamam", onPress: () => { setShowDeleteModal(false); setPassword(""); dispatch(logout()); } },
        ]);
      } else {
        Alert.alert("Hata", data.message || "Hesap silinemedi");
      }
    } catch {
      Alert.alert("Hata", "Bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      setDeleteLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const mainPhoto =
    myProfile?.photosList?.find((p) => p.isMainPhoto)?.photoImageUrl ||
    myProfile?.photosList?.[0]?.photoImageUrl ||
    myProfile?.profileImageUrl;

  const completionPct = myProfile?.profileCompletionPercentage ?? myProfile?.profileCompletionScore ?? 0;

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#121212", alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#fff" />
      </View>
    );
  }

  const resolvedHobbies = resolveHobbies(myProfile?.hobbies);
  const previewProfile = buildPreviewProfile();

  return (
    <View style={{ flex: 1, backgroundColor: "#121212" }}>
      <StatusBar barStyle="light-content" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#fff" />}
      >
        {/* ── Hero fotoğraf ── */}
        <View>
          {mainPhoto
            ? <Image source={{ uri: mainPhoto }} style={{ width, height: 360 }} resizeMode="cover" />
            : <View style={{ width, height: 360, backgroundColor: "#1E1E1E", alignItems: "center", justifyContent: "center" }}>
                <User size={72} color="#374151" strokeWidth={1} />
              </View>
          }
          <LinearGradient colors={["transparent", "#121212"]} style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 180 }} />
          {completionPct > 0 && (
            <View style={{ position: "absolute", top: 52, right: 16 }}>
              <BlurView intensity={70} tint="dark" style={{ borderRadius: 14, overflow: "hidden" }}>
                <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
                  <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>%{completionPct} Tamamlandı</Text>
                </View>
              </BlurView>
            </View>
          )}
          <View style={{ position: "absolute", bottom: 16, left: 24 }}>
            <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800" }}>
              {myProfile?.displayName || `${user?.firstName ?? ""} ${user?.lastName ?? ""}`.trim()}
            </Text>
            {(myProfile?.user?.age || user?.age) &&
              <Text style={{ color: "#D1D5DB", fontSize: 16, marginTop: 2 }}>
                {myProfile?.user?.age || user?.age} yaşında
              </Text>
            }
          </View>
        </View>

        <View style={{ paddingHorizontal: 16, paddingBottom: 64 }}>

          {/* ── Fotoğraflar ── */}
          {(() => {
            const CELL_GAP = 8;
            const CELL_SIZE = (width - 32 - CELL_GAP * 2) / 3;
            const sortedPhotos = [...(myProfile?.photosList || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
            const slots = Array.from({ length: 6 }, (_, i) => sortedPhotos[i] || null);
            return (
              <View style={{ marginTop: 16 }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                  <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>
                    Fotoğraflar
                  </Text>
                  {savingPhoto && <ActivityIndicator size="small" color="#9CA3AF" />}
                </View>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: CELL_GAP }}>
                  {slots.map((photo, i) => (
                    <View key={i} style={{ width: CELL_SIZE, height: CELL_SIZE * 1.3, borderRadius: 16, overflow: "hidden" }}>
                      {photo ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => handlePhotoPress(photo)}
                          style={{ flex: 1 }}
                          disabled={savingPhoto}
                        >
                          <Image source={{ uri: photo.photoImageUrl }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
                          {photo.isMainPhoto && (
                            <View style={{ position: "absolute", top: 6, left: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, padding: 4 }}>
                              <Crown size={12} color="#FBBF24" strokeWidth={2} />
                            </View>
                          )}
                          <View style={{ position: "absolute", top: 6, right: 6, backgroundColor: "rgba(0,0,0,0.55)", borderRadius: 999, padding: 4 }}>
                            <X size={12} color="#fff" strokeWidth={2.5} />
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={handleAddPhoto}
                          disabled={savingPhoto}
                          style={{ flex: 1, backgroundColor: "#1E1E1E", borderWidth: 1.5, borderColor: "rgba(255,255,255,0.1)", borderRadius: 16, borderStyle: "dashed", alignItems: "center", justifyContent: "center" }}
                        >
                          <Plus size={24} color="#374151" strokeWidth={1.5} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ))}
                </View>
              </View>
            );
          })()}

          {/* ── Kartımı Önizle ── */}
          <TouchableOpacity activeOpacity={0.82} onPress={() => setPreviewVisible(true)} style={{ marginTop: 16, marginBottom: 4 }}>
            <LinearGradient colors={["#1a1a2e", "#16213e", "#0f3460"]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ borderRadius: 20, overflow: "hidden" }}>
              <View style={{ padding: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <View style={{ backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 999, padding: 8 }}>
                    <Eye size={22} color="#fff" strokeWidth={1.5} />
                  </View>
                  <View>
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 15 }}>Kartımı Önizle</Text>
                    <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 2 }}>Diğerleri seni nasıl görüyor?</Text>
                  </View>
                </View>
                <ChevronRight size={20} color="#6B7280" strokeWidth={1.5} />
              </View>
            </LinearGradient>
          </TouchableOpacity>

          {/* ── Bio ── */}
          <CardBox>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <BookOpen size={14} color="#9CA3AF" strokeWidth={1.5} />
                <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>Biyografi</Text>
              </View>
              {!editingBio
                ? <TouchableOpacity
                    onPress={() => setEditingBio(true)}
                    style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                  >
                    <Pencil size={18} color="#9CA3AF" strokeWidth={1.5} />
                  </TouchableOpacity>
                : <View style={{ flexDirection: "row" }}>
                    <TouchableOpacity
                      onPress={() => { setEditingBio(false); setBioText(myProfile?.bio || ""); }}
                      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                    >
                      <X size={20} color="#EF4444" strokeWidth={2} />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={handleSaveBio}
                      disabled={savingBio}
                      style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}
                    >
                      {savingBio
                        ? <ActivityIndicator size={18} color="#22C55E" />
                        : <Check size={20} color="#22C55E" strokeWidth={2} />
                      }
                    </TouchableOpacity>
                  </View>
              }
            </View>
            {editingBio
              ? <TextInput value={bioText} onChangeText={setBioText} multiline maxLength={500} placeholder="Kendini anlat..." placeholderTextColor="#374151" style={{ color: "#fff", fontSize: 14, lineHeight: 22, minHeight: 80, textAlignVertical: "top" }} autoFocus />
              : <Text style={{ color: bioText ? "#fff" : "#4B5563", fontSize: 14, lineHeight: 22, fontStyle: bioText ? "normal" : "italic" }}>
                  {bioText || "Henüz bir biyografi eklenmemiş. Düzenlemek için kaleme dokun."}
                </Text>
            }
          </CardBox>

          {/* ── Eğitim ── */}
          {(myProfile?.departmentDisplay || myProfile?.department != null) && (
            <CardBox>
              <SectionHeader icon={GraduationCap} label="Eğitim" />
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 14 }}>
                {myProfile.user?.universityName || user?.universityName}
              </Text>
              {(myProfile.departmentDisplay || myProfile.department) &&
                <Text style={{ color: "#9CA3AF", fontSize: 13, marginTop: 3 }}>
                  {myProfile.departmentDisplay || String(myProfile.department)}
                </Text>
              }
              {myProfile.yearOfStudy != null &&
                <Text style={{ color: "#6B7280", fontSize: 13, marginTop: 2 }}>
                  {myProfile.yearOfStudy === 0 ? "Hazırlık" : `${myProfile.yearOfStudy}. Sınıf`}
                </Text>
              }
            </CardBox>
          )}

          {/* ── Konum ── */}
          {(myProfile?.cityDisplay || myProfile?.districtDisplay) && (
            <CardBox>
              <SectionHeader icon={MapPin} label="Konum" />
              <Text style={{ color: "#fff", fontSize: 14 }}>
                {[myProfile.districtDisplay, myProfile.cityDisplay].filter(Boolean).join(", ")}
              </Text>
            </CardBox>
          )}

          {/* ── Hobiler ── */}
          <CardBox>
            <SectionHeader icon={Heart} label="Hobiler" onEdit={openHobbiesEdit} />
            {resolvedHobbies.length > 0
              ? <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                  {resolvedHobbies.map((h, i) => (
                    <View key={i} style={{ backgroundColor: "#2A2A2A", borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.07)" }}>
                      <Text style={{ color: "#E5E7EB", fontSize: 12 }}>{h}</Text>
                    </View>
                  ))}
                </View>
              : <Text style={{ color: "#4B5563", fontSize: 14, fontStyle: "italic" }}>Hobi eklenmemiş. Düzenlemek için kaleme dokun.</Text>
            }
          </CardBox>

          {/* ── Yaşam tarzı ── */}
          <CardBox>
            <SectionHeader icon={Sparkles} label="Yaşam Tarzı" onEdit={openLifestyleEdit} />
            {myProfile?.smokingStatusDisplay &&
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Cigarette size={14} color="#6B7280" strokeWidth={1.5} />
                <Text style={{ color: "#D1D5DB", fontSize: 13 }}>{myProfile.smokingStatusDisplay}</Text>
              </View>
            }
            {myProfile?.zodiacSignDisplay &&
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 }}>
                <Sparkles size={14} color="#6B7280" strokeWidth={1.5} />
                <Text style={{ color: "#D1D5DB", fontSize: 13 }}>{myProfile.zodiacSignDisplay} Burcu</Text>
              </View>
            }
            {myProfile?.usagePurposeDisplay &&
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Target size={14} color="#6B7280" strokeWidth={1.5} />
                <Text style={{ color: "#D1D5DB", fontSize: 13 }}>{myProfile.usagePurposeDisplay}</Text>
              </View>
            }
            {!myProfile?.smokingStatusDisplay && !myProfile?.zodiacSignDisplay && !myProfile?.usagePurposeDisplay &&
              <Text style={{ color: "#4B5563", fontSize: 14, fontStyle: "italic" }}>Bilgi eklenmemiş. Düzenlemek için kaleme dokun.</Text>
            }
          </CardBox>

          {/* ── Hesap ── */}
          <View style={{ marginTop: 24 }}>
            <TouchableOpacity onPress={handleLogout} style={{ backgroundColor: "#1E1E1E", borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10, borderWidth: 0.5, borderColor: "rgba(255,255,255,0.06)" }}>
              <LogOut size={20} color="#F87171" strokeWidth={1.5} />
              <Text style={{ color: "#F87171", fontWeight: "600", fontSize: 15 }}>Çıkış Yap</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmDelete} style={{ backgroundColor: "#1E1E1E", borderRadius: 20, padding: 16, flexDirection: "row", alignItems: "center", gap: 12, borderWidth: 0.5, borderColor: "rgba(127,29,29,0.4)" }}>
              <Trash2 size={20} color="#7F1D1D" strokeWidth={1.5} />
              <Text style={{ color: "#7F1D1D", fontWeight: "600", fontSize: 15 }}>Hesabı Sil</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>

      {/* ══ HOBİ DÜZENLEME MODALI ══ */}
      <EditModal
        visible={editHobbiesVisible}
        title="Hobilerini Düzenle"
        onClose={() => setEditHobbiesVisible(false)}
        onSave={handleSaveHobbies}
        saving={savingHobbies}
      >
        <Text style={{ color: "#6B7280", fontSize: 13, textAlign: "center", marginTop: 8, marginBottom: 4 }}>
          {draftHobbies.length} hobi seçildi
        </Text>
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          {hobbyGroups.map((group, gi) => (
            <View key={gi} style={{ marginTop: 24 }}>
              <Text style={{ color: "#6B7280", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 12 }}>
                {group.category}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {(group.hobbies || []).map((h, hi) => {
                  const selected = draftHobbies.includes(h.id);
                  return (
                    <TouchableOpacity
                      key={hi}
                      onPress={() => toggleHobby(h.id)}
                      style={{
                        borderRadius: 999,
                        paddingHorizontal: 14,
                        paddingVertical: 8,
                        borderWidth: 1,
                        backgroundColor: selected ? "#fff" : "transparent",
                        borderColor: selected ? "#fff" : "rgba(255,255,255,0.2)",
                      }}
                    >
                      <Text style={{ color: selected ? "#000" : "#D1D5DB", fontSize: 13, fontWeight: selected ? "600" : "400" }}>
                        {h.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}
        </ScrollView>
      </EditModal>

      {/* ══ YAŞAM TARZI DÜZENLEME MODALI ══ */}
      <EditModal
        visible={editLifestyleVisible}
        title="Yaşam Tarzını Düzenle"
        onClose={() => setEditLifestyleVisible(false)}
        onSave={handleSaveLifestyle}
        saving={savingLifestyle}
      >
        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}>
          {/* Sigara */}
          {smokingOptions.length > 0 && (
            <View style={{ marginTop: 24 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <Cigarette size={14} color="#9CA3AF" strokeWidth={1.5} />
                <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>Sigara</Text>
              </View>
              {smokingOptions.map((opt) => {
                const selected = draftSmoking?.id === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => setDraftSmoking(selected ? null : opt)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)" }}
                  >
                    <Text style={{ color: selected ? "#fff" : "#9CA3AF", fontSize: 15, fontWeight: selected ? "600" : "400" }}>{opt.name}</Text>
                    {selected && <Check size={18} color="#fff" strokeWidth={2.5} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* Burç */}
          {zodiacOptions.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <Sparkles size={14} color="#9CA3AF" strokeWidth={1.5} />
                <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>Burç</Text>
              </View>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {zodiacOptions.map((opt) => {
                  const selected = draftZodiac?.id === opt.id;
                  return (
                    <TouchableOpacity
                      key={opt.id}
                      onPress={() => setDraftZodiac(selected ? null : opt)}
                      style={{ borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8, borderWidth: 1, backgroundColor: selected ? "#fff" : "transparent", borderColor: selected ? "#fff" : "rgba(255,255,255,0.2)" }}
                    >
                      <Text style={{ color: selected ? "#000" : "#D1D5DB", fontSize: 13, fontWeight: selected ? "600" : "400" }}>{opt.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          )}

          {/* Kullanım amacı */}
          {usagePurposeOptions.length > 0 && (
            <View style={{ marginTop: 28 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 }}>
                <Target size={14} color="#9CA3AF" strokeWidth={1.5} />
                <Text style={{ color: "#9CA3AF", fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase" }}>Kullanım Amacı</Text>
              </View>
              {usagePurposeOptions.map((opt) => {
                const selected = draftUsagePurpose?.id === opt.id;
                return (
                  <TouchableOpacity
                    key={opt.id}
                    onPress={() => setDraftUsagePurpose(selected ? null : opt)}
                    style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 14, borderBottomWidth: 0.5, borderBottomColor: "rgba(255,255,255,0.06)" }}
                  >
                    <Text style={{ color: selected ? "#fff" : "#9CA3AF", fontSize: 15, fontWeight: selected ? "600" : "400" }}>{opt.name}</Text>
                    {selected && <Check size={18} color="#fff" strokeWidth={2.5} />}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </EditModal>

      {/* ══ PREVİEW MODALI ══ */}
      <Modal visible={previewVisible} animationType="slide" onRequestClose={() => setPreviewVisible(false)}>
        <View style={{ flex: 1, backgroundColor: "#121212" }}>
          <View style={{ position: "absolute", top: 52, right: 16, zIndex: 100 }}>
            <TouchableOpacity onPress={() => setPreviewVisible(false)} style={{ backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 999, padding: 9 }}>
              <X size={20} color="#fff" strokeWidth={2} />
            </TouchableOpacity>
          </View>
          {previewProfile
            ? <SwipeCard profile={previewProfile} hideActions />
            : <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color="#fff" /></View>
          }
        </View>
      </Modal>

      {/* ══ HESAP SİL MODALI ══ */}
      <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
        <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.65)", justifyContent: "center", alignItems: "center", paddingHorizontal: 24 }}>
          <View style={{ backgroundColor: "#1E1E1E", borderRadius: 28, padding: 24, width: "100%" }}>
            <Text style={{ color: "#fff", fontSize: 22, fontWeight: "800", marginBottom: 6 }}>Hesabı Sil</Text>
            <Text style={{ color: "#9CA3AF", fontSize: 14, marginBottom: 20, lineHeight: 20 }}>
              Hesabınızı kalıcı olarak silmek için şifrenizi girin.
            </Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: "#374151", borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 16, color: "#fff", marginBottom: 20 }}
              placeholder="Şifreniz"
              placeholderTextColor="#4B5563"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              editable={!deleteLoading}
            />
            <View style={{ flexDirection: "row", gap: 10 }}>
              <TouchableOpacity
                onPress={() => { setShowDeleteModal(false); setPassword(""); }}
                style={{ flex: 1, backgroundColor: "#2A2A2A", borderRadius: 16, paddingVertical: 14, alignItems: "center" }}
                disabled={deleteLoading}
              >
                <Text style={{ color: "#fff", fontWeight: "700" }}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDeleteAccount}
                style={{ flex: 1, backgroundColor: "#DC2626", borderRadius: 16, paddingVertical: 14, alignItems: "center" }}
                disabled={deleteLoading}
              >
                {deleteLoading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: "#fff", fontWeight: "700" }}>Sil</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}
