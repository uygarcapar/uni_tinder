const tr = {
  common: {
    ok: 'Tamam',
    cancel: 'İptal',
    done: 'Bitti',
    cropperTitle: 'Fotoğrafı Düzenle',
    cropperChoose: 'Seç',
    crashTitle: 'Bir şeyler ters gitti',
    crashMessage: 'Beklenmeyen bir hata oluştu. Tekrar denemek için butona dokun.',
    crashRetry: 'Tekrar Dene',
    offline: 'İnternet bağlantısı yok',
    back: 'Geri',
    save: 'Kaydet',
    error: 'Hata',
    info: 'Bilgi',
    no: 'Hayır',
    yes: 'Evet',
    continueButton: 'Devam Et',
    notifications: 'Bildirimler',
    menu: 'Menü',
    notFound: "'{{query}}' bulunamadı",
    limitReached: 'Sınır Aşıldı',
  },
  settings: {
    title: 'Ayarlar',
    theme: {
      title: 'Tema',
      subtitle: 'Uygulamanın görünümünü seç.',
      system: 'Sistem',
      light: 'Açık',
      dark: 'Koyu',
    },
    language: {
      title: 'Dil',
      subtitle: 'Uygulamanın gösterileceği dili seç.',
      system: 'Sistem',
    },
    messaging: {
      title: 'Mesajlaşma',
      subtitle: 'Sohbet ve bildirim davranışını kontrol et.',
    },
    readReceipts: {
      title: 'Okundu Bilgisi',
      subtitle: 'Mesajları okuduğunda partner görsün',
    },
    muteOnline: {
      title: "Online'ken Bildirim Susturma",
      subtitle: 'Uygulama açıkken push bildirimi alma',
    },
    privacy: {
      title: 'Gizlilik',
      subtitle: 'Verilerin üzerinde tam kontrol sende.',
    },
    downloadData: 'Verilerimi İndir',
    blockedUsers: 'Engellenenler',
    changePassword: 'Şifre Değiştir',
    account: {
      title: 'Hesap',
      subtitle: 'Hesabını silersen 30 gün içinde geri dönebilirsin.',
    },
    deleteAccount: 'Hesabı Sil',
  },
  errors: {
    generic: 'Hata',
    prefUpdate: 'Tercih güncellenemedi.',
    dataNotReady: 'Veri hazırlanamadı, tekrar dene.',
    requestFailed: 'İstek gönderilemedi.',
    operationFailed: 'İşlem gerçekleştirilemedi.',
  },
  deleteAccount: {
    alertTitle: 'Hesabı Sil',
    alertMsg:
      'Hesabın 30 gün boyunca askıya alınır. Bu süre içinde giriş yaparak geri dönebilirsin. 30 gün sonra kalıcı olarak silinir.',
    cancel: 'İptal',
    confirm: 'Devam Et',
    successTitle: 'Hesap Silme Başlatıldı',
    successMsg:
      'Hesabın 30 gün içinde silinecek. Bu süre içinde giriş yaparak iptal edebilirsin.',
    successMsgDated:
      'Hesabın {{date}} tarihinde kalıcı olarak silinecek ({{days}} gün kaldı). Bu süre içinde giriş yaparak iptal edebilirsin.',
    bannerTitle: 'Hesabın silinmek üzere',
    bannerDated: '{{date}} tarihinde kalıcı olarak silinecek.',
    bannerDatedWithDays: '{{date}} tarihinde kalıcı olarak silinecek ({{days}} gün kaldı).',
    bannerUndo: 'İptal Et',
  },
  auth: {
    session: {
      closedTitle: 'Oturumun kapatıldı',
      closedMessage: 'Hesabına başka bir cihazdan giriş yapıldı.',
      // Gerekçesi bilinmeyen oturum kapanışı. "Başka cihazdan giriş" DEMEZ:
      // sunucu gerekçe göndermediğinde sebebi bilmiyoruz ve kullanıcıyı boş
      // yere hesabı ele geçirilmiş sanmaya itmemeliyiz.
      endedTitle: 'Oturumun kapatıldı',
      endedMessage: 'Güvenlik için oturumun sonlandırıldı. Tekrar giriş yap.',
      // Refresh token'ın 30 günü doldu (UT-1014). Sıradan bir olay, "güvenlik"
      // dili KULLANILMIYOR — kullanıcı hesabı ele geçirilmiş sanmasın.
      expiredTitle: 'Oturumunun süresi doldu',
      expiredMessage: 'Uzun süre giriş yapmadığın için oturumun kapandı. Tekrar giriş yap.',
      // Bu ya da başka bir cihazda çıkış yapılmış (UT-1016).
      loggedOutTitle: 'Oturumun kapatılmış',
      loggedOutMessage: 'Bu hesaptan çıkış yapılmış. Devam etmek için tekrar giriş yap.',
      reverifyTitle: 'E-posta doğrulaması gerekli',
      reverifyMessage: 'Devam etmek için e-posta adresini yeniden doğrulaman gerekiyor. Tekrar giriş yap.',
      passwordChangedTitle: 'Şifren değiştirildi',
      passwordChangedMessage: 'Güvenliğin için tüm oturumlar kapatıldı. Yeni şifrenle tekrar giriş yap.',
    },
    // Ban / askı / silme ekranı. Gövde metni backend'den (`message`) gelir —
    // buradaki fallback'ler yalnız gövde boş dönerse kullanılır.
    accountBlocked: {
      title: {
        banned: 'Hesabın Kapatıldı',
        suspended: 'Hesabın Askıda',
        account_deleted: 'Hesap Silme Sürecinde',
      },
      fallback: {
        banned: 'Hesabın kurallarımızı ihlal ettiği için kalıcı olarak kapatıldı.',
        suspended: 'Hesabın geçici olarak askıya alındı. Süre dolduğunda tekrar giriş yapabilirsin.',
        account_deleted: 'Hesabın silinme sürecinde. Bu süre içinde destek ekibiyle iletişime geçerek işlemi durdurabilirsin.',
      },
      suspensionEnds: 'Askı bitişi: {{date}}',
      deletionDate: 'Kalıcı silinme: {{date}}',
      contactSupport: "Destek'e Yaz",
      backToLogin: 'Giriş ekranına dön',
      supportSubject: 'Hesap itirazı ({{code}})',
    },
    welcome: {
      signupButton: 'Hesap Oluştur',
      loginButton: 'Zaten Hesabım Var',
      termsAccept: 'Devam ederek <1>Kullanım Koşulları</1> ve <2>Gizlilik Politikası</2>\'nı kabul etmiş olursun.',
      termsLink: 'Kullanım Koşulları',
      privacyLink: 'Gizlilik Politikası',
    },
    login: {
      title: 'Giriş Yap.',
      description: 'Giriş yapmak için E-Mail ve şifreni kullan.',
      emailLabel: 'E-Mail',
      emailPlaceholder: 'ornek@universite.edu.tr',
      passwordLabel: 'Şifre',
      passwordPlaceholder: '••••••••',
      forgotPassword: 'Şifreni mi unuttun?',
      submitButton: 'Giriş Yap',
    },
    forgotPassword: {
      title: 'Şifreni sıfırla.',
      description: 'Hesabının e-mail adresini gir, sana 6 haneli bir sıfırlama kodu gönderelim.',
      emailLabel: 'E-Mail',
      emailPlaceholder: 'ornek@universite.edu.tr',
      // Backend kayıtlı olmayan adres için de aynı yanıtı döndürüyor; metin
      // bu belirsizliği koruyacak şekilde yazıldı.
      infoText: 'Adres sistemde kayıtlıysa kod birkaç dakika içinde ulaşır.',
      submitButton: 'Kodu Gönder',
      errors: {
        sendFailed: 'Kod gönderilemedi',
        network: 'Bağlantı hatası, tekrar dene',
      },
      code: {
        title: 'Sıfırlama kodunu gir.',
        description: ' adresine gönderilen 6 haneli kodu gir',
        resendSuccess: 'Kod başarıyla gönderildi!',
        resendButton: 'Tekrar Gönder',
        resendCountdown: 'Tekrar gönder ({{countdown}}s)',
        pasteButton: 'Yapıştır',
        backButton: 'Geri Dön',
        validation: {
          codeRequired: 'Lütfen 6 haneli kodu girin',
          clipboardEmpty: 'Panoda 6 haneli bir kod bulunamadı',
        },
      },
      reset: {
        title: 'Yeni şifreni belirle.',
        description: 'Yeni şifren en az 8 karakter olmalı; bir büyük harf, bir rakam ve bir özel karakter içermeli.',
        passwordLabel: 'Yeni Şifre *',
        passwordPlaceholder: 'En az 8 karakter',
        confirmLabel: 'Yeni Şifre Tekrar *',
        confirmPlaceholder: 'Şifreni tekrar gir',
        submitButton: 'Şifreyi Güncelle',
        successTitle: 'Şifren güncellendi',
        successMessage: 'Yeni şifrenle giriş yapabilirsin.',
        retryCodeButton: 'Kodu tekrar gir',
        errors: {
          failed: 'Şifre güncellenemedi, tekrar dene',
          network: 'Bağlantı hatası, tekrar dene',
        },
      },
    },
    // Şifre uçlarının ORTAK metinleri. Hata satırları backend'in `code`
    // alanından çözülüyor (bkz. passwordErrors.ts): backend metinleri yalnız
    // Türkçe, uygulama iki dilli — bilinen kodlarda buradaki karşılık kazanır.
    password: {
      rules: {
        length: 'En az 8 karakter',
        uppercase: 'En az 1 büyük harf',
        lowercase: 'En az 1 küçük harf',
        digit: 'En az 1 rakam',
        special: 'En az 1 özel karakter',
      },
      errors: {
        currentPasswordWrong: 'Girdiğin şifre yanlış, lütfen tekrar dene.',
        codeInvalid: 'Girdiğin kod hatalı veya süresi dolmuş olabilir. Yeni bir kod iste.',
        codeBurned: 'Kodu çok kez hatalı girdin. Güvenliğin için bu kod iptal edildi, yeni bir kod iste.',
        policy: 'Yeni şifren şifre kurallarını karşılamıyor.',
        sameAsCurrent: 'Yeni şifren mevcut şifrenden farklı olmalı.',
        rateLimited: 'Çok fazla deneme yaptın. {{seconds}} saniye sonra tekrar dene.',
        sessionLost: 'Oturumun sona erdi. Lütfen tekrar giriş yap.',
        generic: 'İşlem tamamlanamadı, tekrar dene.',
      },
      change: {
        title: 'Şifreni değiştir.',
        description: 'Güvenliğin için önce mevcut şifreni doğrulayalım.',
        currentLabel: 'Mevcut Şifre',
        currentPlaceholder: 'Mevcut şifreni gir',
        codeTitle: 'Onay kodunu gir.',
        codeDescription: '{{email}} adresine 6 haneli bir kod gönderdik. Kodu ve yeni şifreni gir.',
        newLabel: 'Yeni Şifre',
        newPlaceholder: 'En az 8 karakter',
        confirmLabel: 'Yeni Şifre Tekrar',
        confirmPlaceholder: 'Yeni şifreni tekrar gir',
        submitButton: 'Şifreyi Güncelle',
        expiresIn: 'Kodun geçerlilik süresi {{time}}',
        expired: 'Kodun süresi doldu',
        resendButton: 'Tekrar gönder',
        resendCountdown: 'Tekrar gönder ({{countdown}}s)',
        resendSuccess: 'Yeni kod gönderildi',
        attemptsLeft: '{{count}} deneme hakkın kaldı',
        successTitle: 'Şifren güncellendi',
        successMessage: 'Diğer cihazlardaki oturumların kapatıldı.',
        validation: {
          currentRequired: 'Lütfen mevcut şifreni gir.',
          codeRequired: 'Lütfen 6 haneli kodu gir.',
        },
        forgotCurrent: {
          link: 'Mevcut şifremi hatırlamıyorum',
          title: 'Şifreni sıfırla',
          message:
            'E-posta adresine bir sıfırlama kodu göndereceğiz. Şifreni sıfırladıktan sonra güvenlik için tekrar giriş yapman gerekecek.',
        },
      },
      reset: {
        successTitle: 'Şifren sıfırlandı',
        successMessage: 'Güvenliğin için oturumun kapatıldı. Yeni şifrenle giriş yap.',
      },
    },
    kvkkConsent: {
      title: 'Gizlilik & KVKK',
      description: 'Uygulamayı kullanmaya devam etmeden önce aşağıdaki metni okumanı ve onaylamanı istiyoruz.',
      acceptText: 'Gizlilik politikasını ve KVKK aydınlatma metnini okudum, anladım ve kabul ediyorum.',
      acceptButton: 'Kabul Et ve Devam Et',
      titleRequired: 'Onay Gerekli',
      messageRequired: 'Devam etmek için metni onaylamalısın.',
      errorSave: 'Onay kaydedilemedi, tekrar dene.',
      sectionTitle1: 'Kişisel Verilerin Korunması (KVKK)',
      section1Content:
        '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında, kişisel verileriniz veri sorumlusu sıfatıyla şirketimiz tarafından işlenmektedir. Bu uygulama aracılığıyla toplanan kişisel verileriniz, yalnızca hizmet sunumu amacıyla kullanılmakta ve üçüncü taraflarla yasalar çerçevesinde paylaşılmaktadır.',
      sectionTitle2: 'İşlenen Veriler',
      section2Content:
        'Ad, e-posta, doğum tarihi, cinsiyet, üniversite bilgisi, konum ve profil fotoğrafları gibi verileriniz işlenmektedir. Bu veriler, size özelleştirilmiş hizmet sunmak amacıyla kullanılmaktadır.',
      sectionTitle3: 'Haklarınız',
      section3Content:
        "KVKK'nın 11. maddesi kapsamında; kişisel verilerinizin işlenip işlenmediğini öğrenme, işlenmişse buna ilişkin bilgi talep etme, işlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme, yurt içinde veya yurt dışında kişisel verilerin aktarıldığı üçüncü kişileri bilme, kişisel verilerin eksik veya yanlış işlenmiş olması hâlinde bunların düzeltilmesini isteme haklarına sahipsiniz.",
      sectionTitle4: 'Çerezler ve Analitik',
      section4Content:
        'Uygulama deneyimini iyileştirmek amacıyla analitik araçlar kullanılmaktadır. Bu araçlar aracılığıyla toplanan veriler, kullanıcı deneyimini geliştirmek için işlenmektedir.',
      sectionTitle5: 'Veri Saklama',
      section5Content:
        'Verileriniz hesabınız aktif olduğu sürece saklanır. Hesabınızı silmeniz durumunda verileriniz 30 gün içinde sistemlerimizden kalıcı olarak silinir.',
      sectionTitle6: 'İletişim',
      section6Content:
        'Gizlilik politikamız veya kişisel verileriniz hakkında sorularınız için destek@lit.com adresinden bize ulaşabilirsiniz.',
    },
    step1: {
      title: 'Üniversite E-Maili',
      description: 'Üniversite e-mail adresin, öğrenci olduğunu doğrulamamıza yardımcı olur.',
      emailPlaceholder: 'edu.tr',
      infoText: 'Sadece akademik e-mail adresleri kabul edilir. Örnek: mert@university.edu.tr',
      errors: {
        accountExistsTitle: 'Hesap Mevcut',
        accountExists: 'Bu maile ait bir hesap var, lütfen giriş yapın.',
        loginAction: 'Giriş Yap',
        invalidDomain: 'Sadece üniversite e-postası kabul edilir.',
        unsupportedUniversity: 'Üniversiteni henüz desteklemiyoruz. Lütfen bizimle iletişime geç.',
        sendFailed: 'Kod gönderilemedi',
        network: 'Bağlantı hatası, tekrar dene',
      },
    },
    step2: {
      title: 'E-Mail\'ini doğrula.',
      description: ' adresine gönderilen 6 haneli kodu girin',
      descriptionPending: ' adresine daha önce kod gönderildi. Mailinizi kontrol edin.',
      resendSuccess: 'Kod başarıyla gönderildi!',
      resendPending: 'Kodu az önce gönderdik, {{seconds}} sn sonra tekrar dene.',
      resendButton: 'Tekrar Gönder',
      resendCountdown: 'Tekrar gönder ({{countdown}}s)',
      pasteButton: 'Yapıştır',
      verifyButton: 'Doğrula',
      backButton: 'Geri Dön',
      validation: {
        codeRequired: 'Lütfen 6 haneli kodu girin',
        clipboardEmpty: 'Panoda 6 haneli bir kod bulunamadı',
      },
    },
    step3: {
      title: 'Şifreni oluştur.',
      passwordLabel: 'Şifre *',
      passwordPlaceholder: 'En az 8 karakter',
      confirmLabel: 'Şifre Tekrar *',
      confirmPlaceholder: 'Şifrenizi tekrar girin',
      confirmCancel: {
        title: 'Kaydı Bırak',
        message: 'Kayıt işlemini yarıda bırakmak istediğinden emin misin?',
      },
    },
    step5: {
      title: 'Seni tanıyalım.',
      description: 'Bize biraz kendinden bahset. Seni tanımamıza yardımcı olmak için kutucukları doldur.',
      nameLabel: 'Ad *',
      namePlaceholder: 'Adın',
    },
    step6: {
      title: 'Yaşını gir.',
      description: 'Doğum tarihin, doğru eşleşmeler bulmamıza yardımcı olur.',
      dayLabel: 'Gün',
      dayPlaceholder: 'gg',
      monthLabel: 'Ay',
      monthPlaceholder: 'aa',
      yearLabel: 'Yıl',
      yearPlaceholder: 'yyyy',
    },
    step7: {
      title: 'Cinsiyetin',
      description: 'Kendini en iyi tanımlayan seçeneği seç.',
      detailedSelect: 'Detaylı Seç',
      // Alt cinsiyet listesindeki ilk (primary) seçenek kategoriyle aynı adı
      // taşıyor — "Erkek" pill'inin altında yine "Erkek" görünmesin diye.
      primaryOption: 'Sadece {{category}}',
      infoText: 'Detaylı cinsiyet seçenekleri, seni en iyi tanımlayan kimliği seçmene yardımcı olur.',
    },
    step8: {
      title: 'Eğitim Bilgilerin.',
      description: 'Sınıfını ve bölümünü seç.',
      departmentLabel: 'Bölüm *',
      departmentPlaceholder: 'Bölüm Seçiniz',
      classLabel: 'Sınıf *',
      class0: 'Hazırlık',
      class1: '1. Sınıf',
      class2: '2. Sınıf',
      class3: '3. Sınıf',
      class4: '4. Sınıf',
      class5: '5. Sınıf',
      class6: '6. Sınıf',
    },
    step9: {
      title: 'Konumun',
      description: 'Şehrini ve yakınındaki kişileri gösterebilmemiz için konumuna ihtiyacımız var.',
      allowButton: 'Konumuma İzin Ver',
      retryButton: 'Tekrar Dene',
      privacyNote: 'Tam adresin kimseyle paylaşılmaz — profilinde yalnızca şehir ve ilçen görünür.',
      deniedTitle: 'Konum izni gerekli',
      deniedDescription: 'Eşleşme için konumuna ihtiyacımız var. Ayarlar\'dan konum iznini açıp geri dönebilirsin.',
      openSettings: 'Ayarlar\'a Git',
    },
    step10: {
      title: 'İlgi Alanın',
      description: 'Kiminle eşleşmek istersin? Birden fazla seçebilirsin.',
      male: 'Erkek',
      female: 'Kadın',
      nonBinary: 'Non-Binary',
      infoText: 'Seçimlerini profilinden filtreleyerek detaylandırabilirsin.',
    },
    step12: {
      title: 'Boyun.',
      description: 'Boyunu gir. Sürükleyerek ayarlayabilirsin.',
      heightLabel: 'Boy (cm) *',
    },
    step13: {
      title: 'Hobiler',
      titleWithCount: 'Hobiler {{count}}/10',
      description: 'İlgi alanlarını seç. Seninle ortak noktası olan kişilerle eşleşmeni sağlar.',
      loadError: 'Hobiler yüklenirken bir hata oluştu',
    },
    step14: {
      title: 'Yaşam Tarzın',
      description: 'İsteğe bağlı bilgiler. Profil eşleşmelerini iyileştirir.',
      smokingLabel: 'Sigara Kullanımı',
      zodiacLabel: 'Burç',
      relationshipIntentLabel: 'İlişki Niyetin',
      relationshipIntentError: 'İlişki niyetleri yüklenirken bir hata oluştu',
      smokingError: 'Sigara durumları yüklenirken bir hata oluştu',
      zodiacError: 'Burçlar yüklenirken bir hata oluştu',
      skipButton: 'Atla',
    },
    // Step16 fotoğraflardan (15) ÖNCE geliyor — numarası akış sırasını
    // değil, ekranın eklenme sırasını gösteriyor (bkz. RegisterProgressBar).
    step16: {
      title: 'Alışkanlıkların ve İnancın',
      description: 'İsteğe bağlı bilgiler. İkisini de sonradan profilinden değiştirebilirsin.',
      alcoholLabel: 'Alkol Kullanımı',
      religiousViewLabel: 'Dini Görüşün',
      alcoholError: 'Alkol kullanım seçenekleri yüklenirken bir hata oluştu',
      religiousViewError: 'Dini görüş seçenekleri yüklenirken bir hata oluştu',
      skipButton: 'Atla',
    },
    step15: {
      title: 'Fotoğrafların',
      titleWithCount: 'Fotoğrafların {{count}}/6',
      description:
        'Sıralamayı değiştirmek için fotoğrafları birbirinin üzerine sürükle. İlk sıradaki ana profil fotoğrafındır.',
      maxPhotosError: 'En fazla 6 fotoğraf ekleyebilirsiniz',
      cropperTitle: 'Fotoğrafı Düzenle',
      cropperChoose: 'Seç',
      cropCancelled: 'Bu fotoğrafın kırpılması iptal edildi.',
      pickerCancelled: 'Galeri seçimi iptal edildi:',
      submitButton: 'Profili Tamamla',
      submitError: 'Kayıt tamamlanamadı. Lütfen tekrar dene.',
      mainPhotoLabel: 'Ana fotoğraf',
      pickMainTitle: 'Ana fotoğrafını seç',
      pickMainHint: 'Ana yapmak istediğin fotoğrafa dokun.',
      photosMissingTitle: 'Bazı fotoğraflar bulunamadı',
      photosMissing:
        'Telefonun geçici dosyaları temizlediği için bazı fotoğrafların silinmiş. Devam etmek için yeniden ekleyebilirsin.',
      sessionExpiredTitle: 'Doğrulama süresi doldu',
      sessionExpired:
        'E-posta doğrulamanın süresi dolmuş. Aynı e-postayı tekrar doğrularsan girdiğin bilgiler korunur.',
    },
  },
  chat: {
    messages: {
      title: 'Mesajlar',
      tabAll: 'Tümü',
      tabUnread: 'Okunmamış',
      tabClosed: 'Kapalı',
      noUnread: 'Okunmamış mesajın yok.',
      noClosed: 'Kapalı sohbetin yok.',
      empty: 'Henüz mesajın yok.',
      findMatch: 'Eşleşme bul',
      typing: 'yazıyor…',
      // Gönderilmemiş composer metninin önüne gelen etiket ("Taslak: merhaba").
      draft: 'Taslak:',
      closedChat: 'Sohbet kapatıldı',
      newMessages: '{{n}} yeni mesaj',
      startConversation: 'Konuşmaya başla 👋',
      mediaPhoto: 'Fotoğraf',
      mediaVoice: 'Sesli mesaj',
      mediaVideo: 'Video',
      today: 'Bugün',
      yesterday: 'Dün',
      notFound: "'{{query}}' bulunamadı",
    },
    // Geri alma penceresinin uzunluğu BACKEND config'inden geliyor — metinlerde
    // "24 saat" HARDCODE EDİLMEZ, süre `restorableUntil` damgasından hesaplanıp
    // {{time}} olarak basılır (bkz. features/chat/restoreWindow.ts).
    unmatch: {
      restoreTitle: 'Eşleşmeyi geri al',
      restoreMessage: 'Bu sohbet kapatıldı. {{time}} içinde geri alabilirsin.',
      // Pencere damgası elimizde yokken (liste DTO'su taşımıyor / uygulama yeniden
      // açıldı): süre vaat etmeden denemeyi sunuyoruz.
      restoreMessageUnknown: 'Bu sohbet kapatıldı. Geri almayı deneyebilirsin.',
      restoreUnavailable: 'Bu eşleşme kalıcı olarak kapandı — geri alma penceresi yok.',
      restoreWindowHint: 'Geri almak için {{time}} kaldı.',
      restoreButton: 'Geri Al',
      restoreError: 'Geri alınamadı',
      restoreExpiredMessage: 'Geri alma süresi dolmuş olabilir.',
      restoreFailed: 'İşlem başarısız.',
      title: 'Eşleşmeyi kaldır',
      message:
        '{{partnerName}} ile sohbeti kapat. Mesajların silinmez; bir süre sonra tekrar eşleşebilirsiniz.',
      confirmMessage:
        'Sohbet kapanır, mesajların silinmez. Bir süre sonra tekrar eşleşebilirsiniz. Bu kişi seni rahatsız ediyorsa engellemeyi seç.',
      confirmButton: 'Kaldır',
      error: 'Eşleşme kaldırılamadı.',
      removedTitle: 'Eşleşme kaldırıldı',
      removedRestorable: '{{time}} içinde geri alabilirsin.',
      removedPermanent: 'Bu eşleşme kalıcı olarak kapandı.',
      windowHours: '{{h}} saat',
      windowMinutes: '{{m}} dakika',
    },
    // Rematch: aynı çift tekrar eşleşince eski sohbet yerinde durur ama
    // mesajlar GİZLİDİR — bu kapıya basılmadan geçmişten iz sızmaz.
    hiddenHistory: {
      title: 'Daha önce eşleşmiştiniz',
      action: 'Eski sohbeti göster',
      tooOld: 'Bu sohbet geçmişi görüntülenemeyecek kadar eski.',
      error: 'Eski sohbet açılamadı. Lütfen tekrar dene.',
    },
    options: {
      title: 'Sohbet Ayarları',
      sectionChat: 'Sohbet',
      sectionChatDescription: 'Bu sohbete özel hızlı eylemler.',
      unmatch: 'Eşleşmeyi Kaldır',
      restore: 'Eşleşmeyi Geri Al',
      restoreExpired: 'Bu sohbet sonlandırıldı. Geri alma süresi doldu.',
      sectionSafety: 'Güvenlik',
      sectionSafetyDescription:
        'Şikayet ve engelleme kalıcıdır: bir daha eşleşmezsiniz, eski sohbet açılmaz.',
      report: 'Şikayet Et',
      block: 'Kullanıcıyı Engelle',
    },
    system: {
      matchCreated: 'Yeni bir eşleşmen var! 🎉 İlk mesajı sen at.',
      conversationDeleted: 'Bu sohbet sonlandırıldı.',
      rematched: 'Tekrar eşleştiniz! Daha önce burada konuşmuştunuz.',
    },
    quota: {
      title: 'Mesaj hakkı',
      message: '{{remaining}} mesaj hakkın var.',
      exhausted: 'Mesaj hakkın bitti',
      exhaustedMessage: "Bu sohbette mesaj sınırına ulaştın. Premium'a geç, sınırsız mesajlaş.",
    },
    defaultUserName: 'Kullanıcı',
    bubble: {
      edited: '(düzenlendi)',
      deleted: 'Bu mesaj silindi.',
      tapToRetry: 'Tekrar göndermek için dokun',
    },
    actions: {
      reply: 'Yanıtla',
      copy: 'Kopyala',
      deleteForMe: 'Sadece benden sil',
      deleteForEveryone: 'Herkes için sil',
    },
    input: {
      placeholder: 'Mesaj...',
      closed: 'Bu sohbet kapatıldı',
      quotaReached: "Mesaj hakkın bitti — Premium'a geç",
    },
    replyPreview: {
      deletedSender: 'Silinmiş',
      deletedMessage: 'Bu mesaj silindi',
    },
    deleteMessage: {
      error: 'Silme başarısız.',
    },
    restore: {
      error: 'Geri alınamadı',
    },
    block: {
      title: 'Engellendi',
      message: 'Bu kişi seninle bir daha iletişim kuramayacak.',
      error: 'Engelleme başarısız.',
      confirmTitle: 'Kullanıcıyı engelle',
      confirmMessage:
        'Bu kişi sana mesaj atamayacak ve profili sana gösterilmeyecek. Eşleşmeniz KALICI olarak kapanır: bir daha eşleşmezsiniz, eski sohbet bir daha açılmaz.',
      confirmButton: 'Engelle',
    },
    emptyState: {
      activeTitle: '{{partnerName}} ile sohbete başla',
      closedTitle: 'Bu sohbet kapalı',
      closedDescription: 'Geçmiş mesajları görüntüleyebilirsin.',
      // Boş sohbette tek dokunuşla gönderilen açılış önerileri (pill).
      suggestion1: 'Selam',
      suggestion2: 'Nasıl gidiyor?',
      suggestion3: 'Profilin çok iyi',
      suggestion4: 'Bugün ne yaptın?',
    },
    media: {
      photo: 'Fotoğraf',
      voice: 'Sesli mesaj',
      video: 'Video',
      newMessage: 'Yeni mesaj',
    },
    tabTitle: 'Mesajlar',
  },
  discover: {
    tabTitle: 'Keşfet',
    swipe: {
      resetNow: 'Şu anda yenilenebilir',
      resetDays: '{{d}} gün sonra yenilenir',
      resetHoursMinutes: '{{h}} sa {{m}} dk sonra yenilenir',
      resetMinutes: '{{m}} dk sonra yenilenir',
      resetSeconds: '{{sec}} sn sonra yenilenir',
      superLikeCooldownTitle: 'Süper Beğeni hakkın doldu',
      superLikeCooldownMessage: '7 günlük döngü dolduğunda hakların yenilenecek — {{time}}.',
      superLikeExhaustedTitle: 'Süper Beğeni hakkın bitti',
      superLikeExhaustedMessage: 'Ücretsiz üyelikte Süper Beğeni tek seferliktir, kendiliğinden yenilenmez.',
    },
    premium: {
      badge: 'PREMIUM ÜYE',
      feature1: 'Sınırsız Beğeni',
      feature2: 'Seni Beğenenleri Gör',
      feature3: 'Geri Alma (Rewind)',
      feature4: 'Reklamsız Deneyim',
      standardPlan: 'Free',
      featuresLabel: 'Özellikler',
      planName: 'lit plus',
      description: 'Lit Plus ile eşleşmelerini hızlandır, seni beğenenleri gör ve daha fazlasını keşfet!',
      pricing: '{{price}} / Ay',
      pricingPrefix: '',
      pricingSuffix: "'dan başlayan planlar",
      cta: 'Planları İncele',
    },
    stats: {
      swipesLabel: 'Swipe Hakkı',
      unlimitedDaily: 'Günlük limit yok',
      superLikesLabel: 'Süper Beğeni',
    },
    filters: {
      saveError: 'Filtreler kaydedilemedi',
      title: 'Filtreler',
      apply: 'Uygula',
      reset: 'Sıfırla',
      maxDistance: {
        title: 'Maksimum Mesafe',
        desc: 'Eşleşmek istediğin kullanıcıların maksimum uzaklığını belirle. Daireyi parmağınla sürükleyerek ayarlayabilirsin.',
        // Free hesabın tavanı düşük (50 km); slider orada duruyor. Şerit sebebi
        // söylüyor, dokunuş paywall'ı açıyor.
        freeCap: 'Ücretsiz hesapta en fazla {{km}} km seçebilirsin. Premium ile {{premiumKm}} km\'ye kadar çıkar.',
      },
      interestedIn: {
        title: 'İlgi Alanı',
        description: 'Kiminle eşleşmek istediğini seç.',
        men: 'Erkek',
        women: 'Kadın',
        nonBinary: 'Non-Binary',
        required: 'En az bir seçenek seçmelisin.',
      },
      city: {
        title: 'Şehir',
        description: 'Belirli bir şehirden kullanıcıları gör.',
      },
      university: {
        title: 'Üniversite',
        description: 'Yalnızca seçtiğin üniversitelerden kişileri gör. En fazla 3 üniversite seçebilirsin.',
        select: 'Üniversite seç',
      },
      premiumFilters: {
        title: 'Premium Filtreler',
        description: 'Aradığın kişiyi daralt. Bir filtrenin anahtarını açarsan aday tükense bile o filtre gevşemez.',
        // Premium bitince filtreler silinmiyor, yalnız uygulanmıyor — şerit bunu
        // söylüyor ki kullanıcı "filtrelerim uçmuş" sanmasın.
        paused: 'Premium filtrelerin duraklatıldı. Seçimlerin duruyor ama desteye uygulanmıyor — Premium\'a dönersen kaldığı yerden devam eder.',
      },
      dealbreaker: {
        on: 'Bu filtreye uymayanları hiç gösterme',
        off: 'Kişiler tükenirse bu filtre dışındakileri de göster',
      },
      enumLoading: 'Seçenekler yükleniyor…',
      enumUnavailable: 'Liste şu an yüklenemedi.',
      height: {
        title: 'Boy',
        description: 'Aradığın boy aralığını seç; iki ucu da serbest bırakabilirsin.',
        atLeast: '{{cm}} cm ve üzeri',
        atMost: '{{cm}} cm ve altı',
        between: '{{min}} – {{max}} cm',
        any: 'Farketmez',
        clear: 'Temizle',
      },
      yearOfStudy: {
        title: 'Sınıf',
        description: 'Yalnızca seçtiğin sınıflardaki kişileri gör.',
        prep: 'Hazırlık',
        year: '{{year}}. sınıf',
      },
      zodiac: {
        title: 'Burç',
        description: 'Yalnızca seçtiğin burçlardaki kişileri gör.',
      },
      smoking: {
        title: 'Sigara',
        description: 'Yalnızca seçtiğin sigara alışkanlığına sahip kişileri gör.',
      },
      alcohol: {
        title: 'Alkol',
        // Uyarı açıklamaya gömülü (boy filtresindeki desen): alan profilde
        // zorunlu olmadığı için filtre açıkken deste beklenenden çok daralıyor.
        description: 'Yalnızca seçtiğin alkol tercihine sahip kişileri gör. Filtre açıkken bu tercihi belirtmemiş profiller gösterilmez.',
      },
      language: {
        title: 'Konuştuğu diller',
        description: 'Seçtiğin dillerden en az birini konuşan kişileri gör.',
        select: 'Dil seç',
        // `count` DEĞİL: i18next'te çoğul çözümlemesini tetikler.
        selected: '{{selected}} dil seçildi',
        pickerTitle: 'Konuştuğu diller',
        // OR semantiği — "hepsini birden konuşsun" DEĞİL. İkinci cümle
        // alkol/sigaradaki uyarının aynısı: alan profilde zorunlu değil.
        orNote: 'En az biri yeterli, hepsini birden konuşması gerekmez. Filtre açıkken dilini belirtmemiş profiller gösterilmez.',
      },
      religion: {
        title: 'Dini görüş',
        description: 'Yalnızca seçtiğin dini görüşe sahip kişileri gör.',
        // Eleme oranı bu filtrede diğerlerinden yüksek: alan profilde zorunlu
        // değil ve "Belirtmek istemiyorum" seçenler de düşüyor. İkinci cümle
        // çıkışı gösteriyor — anahtar kapalıyken filtre kendiliğinden gevşer.
        hiddenNote: 'Bu filtre açıkken dini görüşünü belirtmemiş ve "Belirtmek istemiyorum" seçmiş profiller gösterilmez. Anahtarı kapalı bırakırsan kişiler tükendiğinde filtre otomatik gevşer.',
      },
      pets: {
        title: 'Evcil Hayvan',
        description: 'Karşındaki kişinin evcil hayvanı olsun mu?',
        any: 'Farketmez',
        has: 'Evcil hayvanı var',
        hasNot: 'Evcil hayvanı yok',
        specific: 'Belirli türler',
        // OR semantiği — "hepsine birden sahip" DEĞİL.
        orNote: 'Seçtiğin türlerden en az birine sahip olan profiller gösterilir.',
      },
      preferredHobbies: {
        title: 'Karşımda görmek istediğim hobiler',
        description: 'Bu hobilere sahip kişiler keşfette öne çıkar. Diğerleri listenden çıkmaz; boş bırakabilirsin.',
        selected: '{{selected}}/{{max}} seçildi',
        clear: 'Temizle',
        limitTitle: 'Sınır Aşıldı',
        limitMsg: 'En fazla {{max}} hobi seçebilirsin.',
        loading: 'Hobiler yükleniyor…',
        unavailable: 'Hobi listesi şu an yüklenemedi.',
      },
      relationshipIntents: {
        title: 'Karşımda görmek istediğim niyetler',
        description: 'Bu niyetlere sahip kişiler keşifte önce gösterilir. Diğerleri listenden çıkmaz; boş bırakabilirsin.',
        // enumName ile anahtarlanmış kısa pill etiketleri. Anahtar yoksa
        // backend display'i kullanılır.
        short: {
          LongTerm: 'Uzun süreli',
          ShortTerm: 'Kısa süreli',
          LongTermOpenToShort: 'Uzun süreli, kısaya açık',
          ShortTermOpenToLong: 'Kısa süreli, uzuna açık',
        },
        loading: 'İlişki niyetleri yükleniyor…',
        unavailable: 'İlişki niyeti listesi şu an yüklenemedi.',
      },
      visibility: {
        title: 'Görünürlük',
        description: 'Keşfette seni kimlerin görebileceğini seç. Yukarıdaki filtrelerden farklı olarak bu listeler senin değil, karşı tarafın destesini etkiler.',
        visibleOnlyLabel: 'Beni sadece şu üniversiteler görsün',
        hiddenFromLabel: 'Beni şu üniversiteler görmesin',
        selectUniversities: 'Üniversite seç',
        overlapWarning: 'İki listede birden olan üniversite seni göremez — engelleme önceliklidir.',
        premiumExpiryNote: 'Premium\'un bittiğinde bu kurallar durur; engellediğin üniversiteler seni yeniden görmeye başlar.',
      },
    },
    rewind: {
      error: 'Geri alınamadı',
    },
    cityPicker: {
      title: 'Şehir Seç',
      search: 'Şehir ara',
    },
    universityPicker: {
      preferredTitle: 'Üniversite Seç',
      visibleOnlyTitle: 'Beni Görebilecekler',
      hiddenFromTitle: 'Beni Göremeyecekler',
      search: 'Üniversite ara',
      limitMsg: 'En fazla {{max}} üniversite seçebilirsin.',
    },
    // NOT: `radiusExpanded` şeridi KALDIRILDI (backend sözleşmesi 2026-08-17).
    // Backend aday tükendiğinde yarıçapı hâlâ sessizce genişletiyor ama artık
    // bunu bildirmiyor (`wasRadiusExpanded` her zaman false); ürün kararı
    // genişletmenin kullanıcıya gösterilmemesi yönünde.
    // Boş deste sebepleri — backend `emptyReason` / `emptyReasonCode`
    // (UT-6xxx) ile geliyor, eşleme responseCodes.ts'te. `dismiss` aksiyonlu
    // sebeplerin (allCandidatesSeen) buton etiketi yok.
    empty: {
      noCandidatesInRadius: {
        title: 'Yakınında şu an gösterecek kimse yok',
        action: 'Mesafeyi genişlet',
      },
      allCandidatesSeen: {
        title: 'Görebileceklerinin hepsini gördün',
      },
      filtersTooStrict: {
        title: 'Filtrelerin çok dar',
        action: 'Filtreleri düzenle',
      },
      profileIncomplete: {
        title: 'Önce profilini tamamla',
        action: 'Profile git',
      },
      accountRestricted: {
        title: 'Hesabın geçici olarak kısıtlı',
        action: "Destek'e yaz",
      },
      poolWarming: {
        title: 'Aday havuzu hazırlanıyor',
        action: 'Tekrar dene',
      },
      swipeLimitReached: {
        title: 'Günlük swipe hakkın doldu',
        action: "Premium'u incele",
      },
      supportSubject: 'Keşfet sorunu ({{code}})',
    },
  },
  likes: {
    title: 'Beğeniler',
    tabTitle: 'Beğeniler',
    tabAll: 'Tümü',
    tabLike: 'Beğeni',
    tabSuperLike: 'Superlike',
    infoDescription:
      'Seni beğenen ve süper beğenen kişiler burada toplanır. Kartın sağındaki butonlarla geçebilir ya da beğenip anında eşleşebilirsin.',
    startSwipingButton: 'Kaydırmaya başla',
    // Kartın sağındaki yuvarlak butonların ekran okuyucu etiketleri.
    passButton: 'Geç',
    likeButton: 'Beğen',
    emptySuperLike: 'Henüz süper beğeni yok.',
    emptySuperLikeSubtitle: 'Seni süper beğenen birileri olduğunda burada görünecek.',
    emptyLike: 'Henüz beğeni yok.',
    emptyLikeSubtitle: 'Yeni beğeniler geldikçe burada listelenecek.',
    emptyAll: 'Henüz seni beğenen kimse yok.',
    emptyAllSubtitle: 'Profilini geliştirdikçe seni beğenenlerin sayısı artar.',
    viewButton: 'Seni beğenenleri gör',
    // Kaçırılan eşleşmeler: seni beğenmiş ama senin pas geçtiğin kişiler.
    // Liste herkese açık, kurtarma günlük kotaya bağlı.
    tabMissed: 'Kaçırdıkların',
    emptyMissed: 'Kaçırdığın kimse yok.',
    // Pencere uzunluğu backend'den geliyor (`/Stats` → missedMatchLookbackDays).
    // Değer henüz gelmediyse (eski sürüm / ilk yükleme) sayısız varyant
    // kullanılıyor — gömülü bir "30 gün" değiştiği gün yalan söylerdi.
    emptyMissedSubtitle:
      'Seni beğenmiş birini pas geçersen bir süre burada durur, geri alabilirsin.',
    emptyMissedSubtitleDays:
      'Seni beğenmiş birini pas geçersen {{days}} gün boyunca burada durur, geri alabilirsin.',
    recoverButton: 'Kurtar',
    // Çoğul eki (`_one`/`_other`) BİLEREK kullanılmıyor: projede başka hiçbir
    // anahtar çoğullamıyor, yani Intl.PluralRules yolu hiç denenmemiş. Sayıyı
    // sonda tutan bu kalıp her adette doğru okunuyor.
    recoverQuota: 'Bugün kalan kurtarma hakkın: {{count}}',
    // Tavan biliniyorsa oranlı gösterim. `-1` dalı YOK: bu kotada "sınırsız"
    // diye bir durum yok, premium de 5/gün ile sınırlı.
    recoverQuotaWithLimit: 'Bugün kalan kurtarma hakkın: {{count}}/{{limit}}',
    recoverQuotaEmpty: 'Bugünlük kurtarma hakkın doldu.',
    recoverSuccessTitle: 'Eşleşme kurtarıldı 💞',
    recoverSuccessMessage: 'Zaten seni beğenmişti — sohbet birazdan açılacak.',
    recoverFailed: 'Kurtarılamadı.',
  },
  notifications: {
    empty: 'Henüz bildirim yok.',
    emptySubtitle: 'Eşleşme ve mesajların burada görünecek.',
    // Premium olmayan kullanıcıda beğeni bildiriminin adı/fotoğrafı gizlenince
    // sunucudan gelen metnin yerine bunlar basılıyor.
    hiddenLike: {
      title: 'Birisi seni beğendi.',
      body: 'Kim olduğunu görmek için Lit Plus edin.',
    },
    sections: {
      today: 'Bugün',
      last7Days: 'Son 7 gün',
      last30Days: 'Son 30 gün',
      older: 'Daha eski',
    },
  },
  match: {
    title: "It's Lit!",
    subtitle: '{{name}} ile eşleştin. İlk mesajı sen at.',
    sendMessage: 'Mesaj Gönder',
    back: 'Geri Dön',
  },
  // Seni beğenmiş birini geçince üstten düşen toast.
  missedMatch: {
    title: 'Bir eşleşmeyi kaçırdın',
    body: '{{name}} seni beğenmişti.',
    bodyNoName: 'Seni beğenmiş birini geçtin.',
  },
  profile: {
    tabTitle: 'Profil',
    loadError: 'Profil yenileme hatası:',
    // Profil çekimi düştüğünde (yavaş ağ / 30 sn timeout) boş profil yerine
    // gösterilen hata durumu.
    loadFailed: {
      title: 'Profilin yüklenemedi',
      subtitle: 'Bağlantın yavaş ya da kopmuş görünüyor. Kontrol edip tekrar dene.',
      retry: 'Tekrar dene',
    },
    completion: {
      title: 'Profil Tamamlama',
      photos: 'Fotoğraflar',
      photosDescription: 'Daha fazla fotoğraf ekleyerek profilini öne çıkarabilir ve diğer kullanıcıların seni daha iyi tanımasını sağlayabilirsin.',
      hobbies: 'Hobiler',
      hobbiesDescription: 'En fazla 10 hobi ekleyerek ortak noktaların olan insanlarla daha kolay eşleş.',
      bio: 'Biyografi',
      bioDescription: 'Kendinden kısaca bahsederek dikkat çek. İlgi çekici bir biyografi eşleşme şansını artırır.',
      smoking: 'Sigara Kullanımı',
      smokingDescription: 'Yaşam tarzını belirterek sana en uygun kişileri bul.',
      zodiac: 'Burç',
      zodiacDescription: 'Burcunu ekle, astroloji uyumunu ve potansiyel eşleşmeleri keşfet.',
      relationshipIntent: 'İlişki Niyetin',
      relationshipIntentDescription: 'Ne aradığını belirterek, seninle aynı beklentilere sahip kişilerle tanış.',
      completeButton: 'Tamamla',
    },
    // Hero'nun altındaki SuperLike kartı. Kart ekranın yarısı kadar — alt satır
    // metinleri kısa tutulmak ZORUNDA, uzun cümle tek satıra sığmıyor.
    // subtitleUnknown bilerek sayısız: bakiyeyi bilmediğimiz durumda (stats
    // gelmedi / premium aktivasyonu sürüyor) uydurma sayı yerine ürünün değer
    // önerisi yazılır.
    superLikeCard: {
      title: 'Superlike Al',
      subtitleCount: '{{count}} hakkın kaldı',
      subtitleEmpty: 'Hakkın bitti',
      subtitleUnknown: 'Öne çık',
    },
    account: {
      title: 'Hesap',
    },
    logout: {
      button: 'Çıkış Yap',
      title: 'Çıkış Yap',
      message: 'Hesabından çıkmak istediğine emin misin?',
      confirmButton: 'Çıkış Yap',
    },
    permissions: {
      title: 'İzin Gerekli',
      galleryMessage: 'Fotoğraf eklemek için galeri iznine ihtiyaç var.',
      cameraMessage: 'Fotoğraf çekmek için kamera iznine ihtiyaç var.',
    },
    photos: {
      title: 'Fotoğraf',
      addTitle: 'Fotoğraf Ekle',
      addMessage: 'Fotoğrafı nereden eklemek istersin?',
      sourceCamera: 'Kamera',
      sourceGallery: 'Galeri',
      uploadError: 'Fotoğraf yüklenemedi, tekrar dene.',
      setMain: 'Ana Fotoğraf Yap',
      delete: 'Sil',
      setMainError: 'Ana fotoğraf değiştirilemedi.',
      deleteError: 'Fotoğraf silinemedi.',
      limitTitle: 'Fotoğraf Sınırı',
      limitMessage: 'En fazla {{max}} fotoğraf ekleyebilirsin. Yeni bir tane eklemek için önce birini sil.',
      minTitle: 'Son Fotoğraflar',
      minMessage: 'Profilinde en az {{min}} fotoğraf kalmalı. Silmek için önce yeni bir fotoğraf ekle.',
    },
    // Fotoğraf moderasyonu. Metinler HER ZAMAN reasonCode'dan üretilir —
    // backend'in reasonText'i Türkçe sabit ve değişebilir, ona bağlanma.
    photoModeration: {
      status: {
        Approved: 'Yayında',
        Rejected: 'Yayında değil',
        Review: 'İnceleniyor',
        Pending: 'Kontrol ediliyor',
      },
      reason: {
        main_photo_multiple_faces:
          'Ana fotoğrafında birden fazla kişi var. Ana fotoğrafta yalnız olmalısın — diğer fotoğraflarında arkadaşlarınla olabilirsin.',
        main_photo_no_face:
          'Ana fotoğrafında yüzün görünmüyor. Yüzünün net göründüğü bir fotoğraf seç.',
        explicit_content:
          'Bu fotoğraf topluluk kurallarımıza uymuyor. Lütfen başka bir fotoğraf dene.',
        violence:
          'Bu fotoğraf şiddet içerdiği için yayınlanamıyor. Lütfen başka bir fotoğraf dene.',
        hate_symbols:
          'Bu fotoğraf topluluk kurallarımıza uymayan bir sembol içeriyor. Lütfen başka bir fotoğraf dene.',
        // face_mismatch ve face_compare_unavailable kullanıcıya AYNI nötr metni
        // gösterir (ilki "başka biri gibi görünüyor", ikincisi "karşılaştıramadık")
        // ama destek/analitik tarafında ayırt edilebilsin diye kodları ayrı.
        face_mismatch: 'Bu fotoğrafı inceliyoruz. Kısa süre içinde profilinde görünecek.',
        face_compare_unavailable:
          'Bu fotoğrafı inceliyoruz. Kısa süre içinde profilinde görünecek.',
        under_review: 'Bu fotoğrafı inceliyoruz. Kısa süre içinde profilinde görünecek.',
        provider_error: 'Bu fotoğrafı kontrol ediyoruz. Birazdan profilinde görünecek.',
        fallback: {
          Approved: 'Bu fotoğraf yayında.',
          Rejected: 'Bu fotoğraf yayınlanamıyor. Lütfen başka bir fotoğraf dene.',
          Review: 'Bu fotoğrafı inceliyoruz. Kısa süre içinde profilinde görünecek.',
          Pending: 'Bu fotoğrafı kontrol ediyoruz. Birazdan profilinde görünecek.',
        },
      },
      title: {
        main_photo_multiple_faces: 'Ana fotoğrafta yalnız olmalısın',
        main_photo_no_face: 'Ana fotoğrafta yüzün görünmeli',
        fallback: {
          Approved: 'Fotoğraf yayında',
          Rejected: 'Fotoğraf yayınlanamadı',
          Review: 'Fotoğrafın inceleniyor',
          Pending: 'Fotoğrafın kontrol ediliyor',
        },
      },
      summary: {
        titleRejected: 'Bazı fotoğrafların yayınlanamadı',
        titlePending: 'Fotoğrafların inceleniyor',
        rejected:
          '{{count}} fotoğrafın topluluk kurallarımıza uymadığı için yayınlanamadı. Yerine başka bir fotoğraf ekleyebilirsin.',
        pending:
          '{{count}} fotoğrafın inceleniyor. Onaylandığında profilinde kendiliğinden görünecek — yeniden yüklemene gerek yok.',
      },
      mainHint: 'Ana fotoğrafta yalnız olmalısın.',
      otherHint: 'Diğer fotoğraflarında arkadaşların, manzara ya da hobilerin olabilir.',
      replace: 'Değiştir',
      chooseAnotherMain: 'Başka fotoğrafı ana yap',
      // Gizli bir fotoğraf ana fotoğraf yapılırsa profil kartı boş görünür.
      setMainBlockedTitle: 'Bu fotoğraf henüz yayında değil',
      setMainBlockedMessage:
        'Ana fotoğraf olarak yalnızca yayında olan bir fotoğrafı seçebilirsin.',
      reorderMainBlockedTitle: 'İlk sıradaki fotoğraf yayında olmalı',
      reorderMainBlockedMessage:
        'İlk sıradaki fotoğraf ana fotoğrafın olur. Yayında olmayan bir fotoğrafı ilk sıraya alırsan profil kartın boş görünür.',
    },
    edit: {
      button: 'Profili Düzenle',
      title: 'Profili Düzenle',
      previewButton: 'İnsanlar beni nasıl görüyor?',
      bioPlaceholder: 'Bize kendinden bahset...',
      selectLanguage: 'Dil Seç',
      loading: 'Yükleniyor...',
      languagesSelected: '{{count}} dil seçildi',
      limitTitle: 'Sınır Aşıldı',
      limitHobbies: 'En fazla 10 hobi seçebilirsin.',
      limitLanguages: 'En fazla 15 dil seçebilirsin.',
      limitPets: 'En fazla 8 hayvan seçebilirsin.',
      missingInfoTitle: 'Eksik Bilgi',
      updateError: 'Profil güncellenemedi, tekrar dene.',
      bioTitle: 'Biyografi',
      bioDesc: 'Kendini tanıtabileceğin kısa bir biyografi yazabilirsin. Neler yaptığından bahset.',
      photosTitle: 'Fotoğraflar',
      photosHint: 'Sıralamak için basılı tut ve sürükle. İlk fotoğrafın ana fotoğrafın olur — ana fotoğrafta yalnız olmalısın, diğerlerinde arkadaşlarınla olabilirsin.',
      smokingTitle: 'Sigara Kullanımı',
      smokingDesc: 'Sigara kullanım durumunu seç.',
      alcoholTitle: 'Alkol Kullanımı',
      // Uyarı bilinçli: bu alanı boş bırakan kullanıcı, alkol filtresi kullanan
      // kişilerin destesinde hiç çıkmıyor (backend semantiği sigarayla aynı).
      alcoholDesc: 'Alkol kullanım durumunu seç. Boş bırakırsan alkol filtresi kullanan kişilerin karşısına çıkmazsın.',
      religiousViewTitle: 'Dini Görüş',
      religiousViewDesc: 'İstersen dini görüşünü paylaş. Seçili seçeneğe tekrar dokunarak kaldırabilirsin.',
      zodiacTitle: 'Burç',
      zodiacDesc: 'Burç seçimini yap.',
      relationshipIntentTitle: 'İlişki Niyetin',
      relationshipIntentDesc: 'Ne aradığını seç. Seçili seçeneğe tekrar dokunarak kaldırabilirsin.',
      hobbiesTitle: 'Hobiler ({{count}} seçildi)',
      hobbiesHint: 'Kategoriye dokun, içindeki hobilerden seç. En fazla 10.',
      genderTitle: 'Cinsiyet',
      genderDesc: 'Kendi cinsiyetini seç. Kategoriye dokunup detaylı seçim yapabilirsin.',
      selectCity: 'Şehir Seç',
      locationTitle: 'Konum',
      locationDesc: 'Konumun uygulamayı her açtığında otomatik güncellenir.',
      locationPending: 'Konum henüz belirlenmedi',
      languagesTitle: 'Konuşulan Diller ({{count}} seçildi)',
      languagesDesc: 'Konuştuğun dilleri seç (en fazla 15).',
      petsTitle: 'Evcil Hayvanlar ({{count}} seçildi)',
      petsDesc: 'Birlikte yaşadığın hayvanları seç (en fazla 8).',
      visibility: {
        title: 'Görünürlük',
        description: 'Profilinde hangi bilgilerin başkalarına gösterileceğini sen belirle.',
        showUniversity: 'Üniversitemi göster',
        showOnApp: 'Beni uygulamada göster',
        showAge: 'Yaşımı göster',
        showPremiumBadge: 'Premium rozetimi göster',
        showPremiumBadgeHint: 'Kapatsan da premium özelliklerin aynen devam eder.',
      },
    },
    subscription: {
      manageButton: 'Aboneliği Yönet',
      renewalLabel: 'Yenileme',
      manageAlt: 'Aboneliği Yönet',
      activeDescription: 'Üyeliğin aktif. Sınırsız beğeni, seni beğenenleri görme ve daha fazlasına erişimin var.',
      status: 'Aktif',
      // Abonelik durum makinesi — backend /status.status alanına karşılık gelir.
      // Cancelled ve BillingIssue'da erişim AÇIK kalır, sadece uyarı + CTA değişir.
      trialBadge: 'Deneme',
      trialEndsLabel: 'Bitiş',
      trialDescription: 'Deneme sürecindesin. {{date}} tarihinde ilk ödemen alınacak.',
      trialDescriptionNoDate: 'Deneme sürecindesin. Süre bitiminde abonelik otomatik başlar.',
      cancelledBadge: 'İptal edildi',
      cancelledDescription: 'Aboneliğin iptal edildi. {{date}} tarihine kadar tüm özellikler açık kalacak.',
      cancelledDescriptionNoDate: 'Aboneliğin iptal edildi. Dönem sonuna kadar tüm özellikler açık kalacak.',
      resubscribeButton: 'Aboneliği Sürdür',
      billingIssueBadge: 'Ödeme sorunu',
      billingIssueDescription: 'Son ödemen alınamadı. {{date}} tarihine kadar erişimin devam ediyor, ödeme yöntemini güncelle.',
      billingIssueDescriptionNoDate: 'Son ödemen alınamadı. Erişimini kaybetmemek için ödeme yöntemini güncelle.',
      fixPaymentButton: 'Ödeme Yöntemini Güncelle',
      pendingBadge: 'Aktivasyon sürüyor',
      pendingDescription: 'Satın alman alındı. Mağaza onayının bize ulaşması birkaç dakika sürebilir.',
      retryButton: 'Yenile',
    },
    settings: {
      button: 'Ayarlar',
    },
    card: {
      smoking: 'Sigara Kullanımı',
      zodiac: 'Burç',
      pets: 'Evcil Hayvan',
      // Yaşam tarzı pili. Backend `height`i sayı gönderiyor, `*Display`
      // karşılığı yok — birim iki dilde de "cm". Birim sayıya BİTİŞİK
      // ("180cm"): pill dar, araya boşluk girince rakamla birim iki ayrı
      // parça gibi okunuyordu.
      heightCm: '{{cm}}cm',
      petsYes: 'Evcil hayvan var',
      petsNo: 'Evcil hayvan yok',
      bio: 'Biyografi',
      prep: 'Hazırlık',
      grade: '{{year}}. Sınıf',
      premium: 'Premium',
      knowMeAs: 'Beni bu şekilde tanırsın:',
      myIntent: 'Burada ne arıyorum:',
      // Niyet etiketinin sonuna eklenir: "Uzun süreli" → "Uzun süreli ilişki".
      intentSuffix: 'ilişki',
      myInterests: 'İlgi alanlarım:',
      myLifestyle: 'Yaşam tarzım:',
      sameUniversity: 'Aynı Üniversite',
      location: 'Konum',
      // Konum satırının sağındaki pill. Mesafe yaklaşık: backend'in verdiği km
      // yuvarlanır, 1 km altı ayrı metinle verilir ("2.5 km uzakta" gibi bir
      // hassasiyet iddiası olmasın).
      distanceAway: '{{km}} km uzakta',
      distanceNear: '1 km\'den yakın',
      reportAccount: 'Bu hesabı şikayet et',
      blockAccount: 'Bu hesabı blokla',
      // "Çevrimiçi" BİLEREK yok: alan (isOnlineToday) 24 saatlik penceredir,
      // anlık presence değil — bkz. PotentialMatch.isOnlineToday.
      activeToday: 'Bugün aktif',
      newMember: 'Burada yeni',
    },
    languages: {
      title: 'Dil Seç',
      search: 'Dil ara',
      notFound: "'{{search}}' bulunamadı",
    },
  },
  purchase: {
    // Hub `SubscriptionChanged` toast'ları. YALNIZ admin işlemleri için: mağaza
    // kaynaklı değişimi (satın alma, süre bitişi) kullanıcı zaten biliyor.
    // "Ne oldu" kadar "ne yapmalı"yı da söylüyorlar — gerekçesiz kapanan bir
    // premium, destek kanalına "hesabım hacklendi" olarak dönüyor.
    revokedTitle: 'Premium aboneliğin sonlandırıldı',
    revokedMessage: 'Premium özelliklerin kapatıldı. Beklemediğin bir durumsa destek ekibiyle iletişime geç.',
    grantedTitle: 'Premium hesabına tanımlandı',
    grantedMessage: 'Premium özelliklerin şu andan itibaren açık. İyi eğlenceler!',
    features: {
      unlimited: 'Sınırsız Beğeni',
      seeLikes: 'Seni Beğenenleri Gör',
      rewind: 'Geri Alma (Rewind)',
      noAds: 'Reklamsız Deneyim',
    },
    periods: {
      weeklyShort: 'Haftalık',
      monthlyShort: 'Aylık',
      yearlyShort: 'Yıllık',
      weeklyPer: 'hafta',
      monthlyPer: 'ay',
      yearlyPer: 'yıl',
    },
    errors: {
      packageNotFound: 'Paket bulunamadı.',
      purchaseTitle: 'Satın Alma Hatası',
      operationFailed: 'İşlem gerçekleştirilemedi.',
      restoreNotFoundTitle: 'Bulunamadı',
      restoreNoSubscription: 'Aktif bir abonelik bulunamadı.',
      restoreFailed: 'Geri yükleme başarısız.',
    },
    cta: {
      alreadyPremium: 'Hesap Zaten Lit Plus',
      freeTrial: '{{days}} Gün Ücretsiz Dene',
      freeTrialBadge: 'İlk {{days}} gün ücretsiz',
      subscribe: '{{price}} / {{period}} — Abone Ol',
      buy: 'Satın Al',
      restore: 'Satın alımları geri yükle',
      trialDisclaimer: 'İlk {{days}} gün ücretsiz kullanabilirsin, ardından {{price}}/{{period}} olarak otomatik yenilenir.',
      appStoreDisclaimer: 'Lit Plus aboneliği, App Store üzerinden otomatik olarak yenilenen bir aboneliktir. Aboneliğiniz, satın alma işleminin onaylanmasından sonra App Store hesabınızdan ücretlendirilir.',
    },
  },
  superLikePurchase: {
    title: 'Süper Beğeni Al',
    description: 'Süper beğeniler 3x daha fazla eşleşme sağlar. Paketini seç ve fark yarat.',
    packLabel: '{{count}}x Superlike',
    cta: 'Satın Al',
    ctaWithPrice: '{{price}} · Satın Al',
    unavailableMessage: 'Paketler şu anda yüklenemedi. Bağlantını kontrol edip biraz sonra tekrar dene.',
    successTitle: 'Süper beğenilerin hazır',
    successMessage: '{{count}} süper beğeni hesabına eklendi.',
    syncedTitle: 'Bakiyen güncel',
    syncedMessage: 'Bu satın alma zaten hesabına işlenmişti.',
    pendingTitle: 'Satın alman alındı',
    pendingMessage: 'Süper beğenilerin birkaç dakika içinde hesabına yansıyacak.',
    errorTitle: 'Satın alma tamamlanamadı',
    disclaimer: 'Süper beğeniler satın alma tamamlandığında hesabına anında eklenir ve süresi dolmaz. Ödemeler App Store hesabından tahsil edilir, satın alma sonrası iade yapılmaz.',
  },
  moderation: {
    report: {
      title: 'Kullanıcıyı Şikayet Et',
      reasonLabel: 'Şikayet sebebi',
      reasonDescription: 'Ekibimizin doğru değerlendirebilmesi için en yakın sebebi seç.',
      // Enum etiketleri — anahtarlar moderationService.ReportReason değerleri.
      reasons: {
        Spam: 'Spam / Reklam',
        Harassment: 'Taciz / Hakaret',
        InappropriateContent: 'Müstehcen içerik',
        FakeProfile: 'Sahte profil',
        Underage: 'Yaş altı',
        Scam: 'Dolandırıcılık',
        Other: 'Diğer',
      },
      detailLabel: 'Detay (opsiyonel)',
      detailDescription: 'Olayı birkaç cümleyle anlatırsan inceleme hızlanır.',
      detailPlaceholder: 'Olayı kısaca anlat…',
      characterCount: '{{count}}/1000',
      blockSectionTitle: 'Engelleme',
      submit: 'Şikayet Et',
      disclaimer: 'Şikayetler ekibimiz tarafından incelenir. Kasıtlı yanlış şikayetler hesabının kısıtlanmasına neden olabilir.',
      successTitle: 'Şikayet alındı',
      successMessage: 'Ekibimiz en kısa sürede inceleyecek. Güvende kalman önemli.',
      successBlockedMessage:
        'Ekibimiz en kısa sürede inceleyecek. Bu kişiyi engelledik — bir daha eşleşmezsiniz.',
      alreadyReported: 'Bu kullanıcıyı son 24 saatte zaten şikayet ettin.',
      error: 'Şikayet gönderilemedi.',
      // Şikayet artık zorunlu engelleme yapmıyor: kutu işaretli gelir, kullanıcı
      // kaldırabilir ("bildirmek istiyorum ama iletişimi kesmek istemiyorum").
      alsoBlock: 'Bu kişiyi engelle',
      alsoBlockHint:
        'Engelleme kalıcıdır: bir daha eşleşmezsiniz ve eski sohbet bir daha açılmaz.',
      blockFailed:
        'Şikayetin alındı ama engelleme tamamlanamadı. Tekrar denemek ister misin?',
      blockRetry: 'Engellemeyi dene',
      blockRetryFailed:
        'Engelleme yine başarısız oldu. Ayarlar → Engellenenler üzerinden tekrar deneyebilirsin.',
    },
    // Profil kartındaki "Bu hesabı blokla" akışı. chat.block.* ile ayrı
    // tutuluyor: oradaki metin açıkça sohbet/eşleşme dilinde konuşuyor, burada
    // henüz bir eşleşme olmayabilir (keşif ya da beğeni kartı).
    block: {
      confirmTitle: 'Bu hesabı blokla',
      confirmMessage:
        'Bu kişi bir daha karşına çıkmaz ve sana mesaj atamaz. Engelleme kalıcıdır: bir daha eşleşmezsiniz.',
      confirmButton: 'Blokla',
      successTitle: 'Engellendi',
      successMessage: 'Bu kişi bir daha karşına çıkmayacak.',
      error: 'Engelleme başarısız.',
    },
    blocked: {
      title: 'Engellenenler',
      empty: 'Kimseyi engellemedin',
      emptySubtitle: 'Engellediğin kişiler burada görünür.',
      unblock: 'Kaldır',
      unblockConfirmTitle: 'Engeli kaldır',
      unblockConfirmMessage: "{{name}} adlı kişinin engelini kaldırmak istediğine emin misin? Tekrar karşına çıkabilir ve sana mesaj atabilir.",
      unblockConfirm: 'Engeli Kaldır',
      unblockError: 'Engel kaldırılamadı.',
      loadError: 'Engellenenler listesi yüklenemedi.',
      blockedAt: '{{date}} tarihinde engellendi',
    },
  },
  // Zorunlu / önerilen güncelleme kapısı. Gövde metni normalde backend'den
  // gelir (Accept-Language'e göre çözülmüş); `fallback.*` yalnız boş geldiğinde
  // kullanılır.
  appUpdate: {
    title: {
      soft: 'Güncelleme mevcut',
      force: 'Güncelleme gerekli',
      maintenance: 'Kısa bir bakım',
    },
    fallback: {
      soft: "Lit'in yeni sürümü hazır — iyileştirmeler ve hata düzeltmeleri var.",
      force: 'Bu sürüm artık desteklenmiyor. Devam etmek için uygulamayı güncelle.',
      maintenance: 'Kısa bir bakım yapıyoruz. Birkaç dakika sonra tekrar dene.',
    },
    update: 'Güncelle',
    later: 'Sonra',
    retry: 'Tekrar dene',
  },
} as const;

export default tr;
