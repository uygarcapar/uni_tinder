const tr = {
  common: {
    ok: 'Tamam',
    cancel: 'İptal',
    done: 'Bitti',
    cropper: {
      title: 'Fotoğrafı Düzenle',
      choose: 'Seç',
      reset: 'Sıfırla',
      progress: '{{index}} / {{total}}',
      hint: 'Kaydırarak ve iki parmakla yakınlaştırarak çerçeveyi ayarla',
      failed: 'Fotoğraf işlenemedi, tekrar dene.',
    },
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
    close: 'Kapat',
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
      title: 'Çevrimiçi İken Bildirimleri Sustur',
      subtitle: 'Uygulama açıkken push bildirimi alma',
    },
    photoModerationAlerts: {
      title: 'Fotoğraf Bildirimleri',
      subtitle:
        'Fotoğraf kararları ve itiraz sonuçları. Profilin keşiften düşerse yine haber veririz.',
    },
    privacy: {
      title: 'Gizlilik',
      subtitle: 'Verilerin üzerinde tam kontrol sende.',
    },
    downloadData: 'Verilerimi İndir',
    blockedUsers: 'Engellenenler',
    changePassword: 'Şifre Değiştir',
    changeEmail: 'E-posta Değiştir',
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
    dataStillPreparing:
      'Verilerin hâlâ hazırlanıyor. Hazır olduğunda bildirimlerine düşecek.',
    dataLinkMissing:
      'Verilerin hazır ama indirme bağlantısı gelmedi. Bildirimlerinden tekrar dene.',
    dataLinkFailed: 'İndirme bağlantısı açılamadı.',
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
      // Adresi DEĞİŞTİREN cihaz bu metni görmüyor (kendi mesajını ChangeEmail
      // ekranı basıyor) — burası kullanıcının diğer cihazları.
      emailChangedTitle: 'E-posta adresin değişti',
      emailChangedMessage: 'Güvenliğin için tüm oturumlar kapatıldı. Yeni adresinle tekrar giriş yap.',
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
    // Salt okunur hukuki metinler (LegalSheet). Gizlilik BÖLÜMLERİ burada
    // tekrarlanmaz — `auth.kvkkConsent.section*` tek kaynak, burada sadece
    // salt okunur görünümün başlığı/açıklaması var.
    legal: {
      privacy: {
        title: 'Gizlilik & KVKK',
        description: 'Verilerini nasıl işlediğimizi ve haklarını burada özetledik.',
      },
      terms: {
        title: 'Kullanım Koşulları',
        description: "Lit'i kullanırken geçerli olan kurallar. Hesap oluşturduğunda bu koşulları kabul etmiş olursun.",
        sectionTitle1: 'Kimler Kullanabilir',
        section1Content:
          'Lit yalnızca 18 yaşını doldurmuş ve desteklenen bir üniversitenin öğrenci e-posta adresine sahip kişiler içindir. Her kişi tek hesap açabilir; hesabını başkasına devredemez, sattıramaz veya paylaştıramaz. Öğrenci doğrulaman geçersiz hâle gelirse hesabına erişimin kısıtlanabilir.',
        sectionTitle2: 'Hesabın ve Güvenliği',
        section2Content:
          'Profilinde verdiğin bilgilerin doğru ve güncel olmasından sen sorumlusun. Şifreni kimseyle paylaşma; hesabından yapılan tüm işlemler sana aittir. Hesabına izinsiz erişildiğini düşünüyorsan şifreni değiştir ve destek ekibine haber ver.',
        sectionTitle3: 'Topluluk Kuralları',
        section3Content:
          'Taciz, tehdit, nefret söylemi, cinsel içerikli veya çıplaklık içeren paylaşımlar, reşit olmayan kişilere ait içerik, sahte profiller, başkasına ait fotoğraf kullanımı, spam, reklam ve ticari kullanım, para talebi veya dolandırıcılık girişimi yasaktır. Bu kuralları ihlal eden içerikleri kaldırma ve hesabı kapatma hakkımız saklıdır.',
        sectionTitle4: 'Paylaştığın İçerik',
        section4Content:
          'Yüklediğin fotoğraflar ve yazdığın metinler sana aittir. Bu içerikleri uygulamada gösterebilmemiz için bize sınırlı bir kullanım izni vermiş olursun; bu izin yalnızca hizmeti sunmak içindir ve içeriği sildiğinde ya da hesabını kapattığında sona erer. Fotoğraflar kurallara uygunluk açısından moderasyondan geçebilir.',
        sectionTitle5: 'Premium ve Satın Alımlar',
        section5Content:
          'Premium abonelikler App Store veya Google Play üzerinden satılır; iptal etmediğin sürece dönem sonunda otomatik yenilenir. Aboneliği yönetme ve iptal etme işlemleri mağaza hesabının ayarlarından yapılır. SuperLike gibi tek seferlik paketler kullanıldıkça tükenir ve iade edilmez; kullanılmayan haklar hesabın kapanmasıyla sona erer. İade talepleri ilgili mağazanın kurallarına tabidir.',
        sectionTitle6: 'Askıya Alma ve Hesap Kapatma',
        section6Content:
          'Kuralların ihlali hâlinde hesabını geçici olarak askıya alabilir veya kalıcı olarak kapatabiliriz. Sen de dilediğin an uygulama içinden hesabını silebilirsin; silme talebinden sonra 30 gün içinde geri dönebilir, bu süre dolduğunda verilerin kalıcı olarak silinir.',
        sectionTitle7: 'Sorumluluğun Sınırı',
        section7Content:
          "Lit yalnızca tanışmayı kolaylaştıran bir platformdur; kullanıcıların kimliğini, beyanlarını veya davranışlarını garanti etmez. Tanıştığın kişilerle buluşurken dikkatli ol ve kendi güvenliğini önceliklendir. Hizmet 'olduğu gibi' sunulur; bakım, güncelleme veya teknik nedenlerle kesintiler yaşanabilir.",
        sectionTitle8: 'Değişiklikler ve İletişim',
        section8Content:
          'Bu koşulları zaman zaman güncelleyebiliriz. Önemli değişiklikleri uygulama üzerinden duyururuz; güncellemeden sonra Lit\'i kullanmaya devam etmen yeni koşulları kabul ettiğin anlamına gelir. Sorularınız için destek@lit.com adresinden bize ulaşabilirsiniz.',
      },
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
    // E-posta değiştirme. Kod/deneme/tekrar-gönder metinleri `password.change`
    // altından PAYLAŞILIYOR (aynı sözleşme: 15 dk ömür, 5 deneme, 60 sn kilit);
    // burada yalnızca akışa özgü olanlar var.
    email: {
      errors: {
        inUse: 'Bu e-posta adresi başka bir hesapta kullanılıyor.',
        sameAsCurrent: 'Bu zaten mevcut e-posta adresin.',
        unsupportedDomain:
          'Bu adres desteklenen bir üniversiteye ait değil. Üniversite e-posta adresini kullan.',
      },
      change: {
        title: 'E-posta adresini değiştir.',
        description: 'Şu an {{email}} adresini kullanıyorsun.',
        descriptionNoEmail: 'Güvenliğin için önce mevcut şifreni doğrulayalım.',
        newLabel: 'Yeni E-posta',
        newPlaceholder: 'yeni@universite.edu.tr',
        // İki sonucu da ÖNCEDEN söylüyoruz: kullanıcı çıkış yapacağını ve
        // üniversitesinin (dolayısıyla keşif havuzunun) değişebileceğini
        // kodu istemeden bilmeli.
        notice:
          'Onay kodu YENİ adresine gönderilir. Adresin değiştiğinde güvenlik için çıkış yapılır ve yeni adresinle tekrar giriş yaparsın. Farklı bir üniversitenin adresine geçersen keşif havuzun da değişir.',
        codeTitle: 'Onay kodunu gir.',
        codeDescription: '{{email}} adresine 6 haneli bir kod gönderdik. Kodu gir.',
        submitButton: 'E-postayı Güncelle',
        successTitle: 'E-posta adresin güncellendi',
        successMessage: 'Adresin {{email}} olarak güncellendi. Güvenliğin için tekrar giriş yapman gerekiyor.',
        successWithUniversity:
          'Adresin {{email}} olarak güncellendi. Artık {{university}} öğrencisisin, keşfin buna göre güncellendi. Güvenliğin için tekrar giriş yapman gerekiyor.',
        validation: {
          emailRequired: 'Lütfen yeni e-posta adresini gir.',
          emailInvalid: 'Geçerli bir e-posta adresi gir.',
        },
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
      verifyButton: 'Doğrula',
      backButton: 'Geri Dön',
      validation: {
        codeRequired: 'Lütfen 6 haneli kodu girin',
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
    step17: {
      title: 'Kendini anlat.',
      description: 'En az bir soruyu cevapla. Kartında en çok okunan bölüm burası — istersen üçe kadar çıkabilirsin.',
    },
    step14: {
      // Ekran tek soruya indiği için başlık da o soru.
      title: 'Ne Arıyorsun?',
      // Adım ZORUNLU (atlanamaz) — açıklama da "isteğe bağlı" demiyor.
      description: 'Bu bilgi kartında görünür ve seninle aynı şeyi arayan kişilerle eşleşmeni sağlar.',
      requiredError: 'Devam etmek için ne aradığını seç.',
      // Seçenek metinleri backend'den DEĞİL buradan: uç kısa etiket dönüyor
      // ("Uzun süreli"), ekranda ise birinci ağızdan cümle isteniyor. Anahtar
      // enumName; haritada olmayan yeni bir değer gelirse `defaultValue` ile
      // backend etiketine düşülüyor (bkz. RegisterStep14Screen).
      intents: {
        LongTerm: 'Uzun süreli bir ilişki tercih ederim',
        ShortTerm: 'Kısa süreli bir şey tercih ederim',
        LongTermOpenToShort: 'Uzun süreli tercih ederim ama kısaya da açığım',
        ShortTermOpenToLong: 'Kısa süreli tercih ederim ama uzuna da açığım',
        StillFiguringOut: 'Henüz karar vermedim',
      },
      // Sigara ve burç bu adımdan ÇIKTI, step16'ya (alışkanlıklar/inanç)
      // taşındı — bu ekranda yalnız ilişki niyeti var. Bölüm başlığı ve "Atla"
      // anahtarları da düştü: başlık sorunun kendisi, adım artık atlanamıyor.
      relationshipIntentError: 'İlişki niyetleri yüklenirken bir hata oluştu',
    },
    // Step16 fotoğraflardan (15) ÖNCE geliyor — numarası akış sırasını
    // değil, ekranın eklenme sırasını gösteriyor (bkz. RegisterProgressBar).
    step16: {
      title: 'Alışkanlıkların ve İnancın',
      description: 'İsteğe bağlı bilgiler. Hepsini sonradan profilinden değiştirebilirsin.',
      smokingLabel: 'Sigara Kullanımı',
      alcoholLabel: 'Alkol Kullanımı',
      zodiacLabel: 'Burç',
      religiousViewLabel: 'Dini Görüşün',
      // Sigara ve alkol seçenekleri backend'in kısa etiketi ("Kullanıyorum")
      // yerine birinci ağızdan cümle olarak gösteriliyor (step14'teki ilişki
      // niyetiyle aynı yaklaşım). Anahtar enumName; haritada olmayan yeni bir
      // değer gelirse `defaultValue` ile backend etiketine düşülüyor.
      // İKİ HARİTA AYRI: iki enum'da da `None` var, tek sözlükte çakışırdı.
      smoking: {
        None: 'Sigara içmiyorum',
        Smoker: 'Sigara içiyorum',
        Occasional: 'Arada sırada içiyorum',
      },
      alcohol: {
        None: 'Alkol kullanmıyorum',
        Socially: 'Sosyal içiciyim',
        Regularly: 'Düzenli olarak içiyorum',
      },
      smokingError: 'Sigara durumları yüklenirken bir hata oluştu',
      alcoholError: 'Alkol kullanım seçenekleri yüklenirken bir hata oluştu',
      zodiacError: 'Burçlar yüklenirken bir hata oluştu',
      religiousViewError: 'Dini görüş seçenekleri yüklenirken bir hata oluştu',
      skipButton: 'Atla',
    },
    step15: {
      title: 'Fotoğrafların',
      titleWithCount: 'Fotoğrafların {{count}}/6',
      // "Yalnız olma" kuralı yalnızca ana fotoğrafa uygulanıyor; cümlenin ikinci
      // yarısı olmazsa kullanıcı grup fotoğraflarını hiç yüklemiyor.
      description:
        'Sıralamayı değiştirmek için fotoğrafları birbirinin üzerine sürükle. İlk sıradaki ana profil fotoğrafın — ana fotoğrafta yalnız olmalısın, diğerlerinde şart değil.',
      maxPhotosError: 'En fazla 6 fotoğraf ekleyebilirsiniz',
      submitButton: 'Profili Tamamla',
      submitError: 'Kayıt tamamlanamadı. Lütfen tekrar dene.',
      pickMainTitle: 'Ana fotoğrafını seç',
      pickMainHint: 'Ana yapmak istediğin fotoğrafa dokun.',
      tryAgain: 'Tekrar Dene',
      // Gönderim sonrası kararlar karta bağlanıyor; dokunma ipucu olmazsa
      // kullanıcı soluk fotoğrafın sebebini nereden okuyacağını bilmiyor.
      moderationHint:
        'Soluk görünen fotoğraflar yayınlanamadı. Sebebini görmek için üstüne dokun.',
      // Hepsi incelemedeyken kullanıcının yapabileceği bir şey yok: yeni
      // fotoğraf da aynı kuyruğa girer, tek doğru davranış beklemek.
      photosUnderReviewTitle: 'Fotoğrafların inceleniyor',
      photosUnderReviewMessage:
        '{{count}} fotoğrafın hâlâ inceleniyor. Kaydını tamamlamak için birkaç dakika sonra tekrar dene — yeniden fotoğraf yüklemene gerek yok.',
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
      // Yukarıdakilerin ÇIPLAK süre karşılıkları: fiil taşımazlar, çünkü
      // "{{time}} sonra yenilenir" gibi kalıpların içine gömülüyorlar.
      durationDays: '{{d}} gün',
      durationHoursMinutes: '{{h}} sa {{m}} dk',
      durationMinutes: '{{m}} dk',
      durationSeconds: '{{sec}} sn',
      superLikeCooldownTitle: 'Süper Beğeni hakkın doldu',
      // Süre GÖMÜLEMEZ: SuperLike döngüsü 2026-08-22'den beri tier'a bağlı
      // (haftalık 7, aylık 30, yıllık 365 gün). "7 günlük döngü" yazmak aylık
      // ve yıllık abonelere yanlış vaat oluyordu; gerçek süre `{{time}}`.
      superLikeCooldownMessage: 'Abonelik döngün yenilendiğinde hakların da yenilenecek — {{time}}.',
      superLikeExhaustedTitle: 'Süper Beğeni hakkın bitti',
      superLikeExhaustedMessage: 'Ücretsiz üyelikte Süper Beğeni tek seferliktir, kendiliğinden yenilenmez.',
    },
    premium: {
      badge: 'PREMIUM ÜYE',
      // Karşılaştırma tablosunun satırları. Sıra ve hangisinin upsell kartına
      // çıktığı `premiumBenefits.ts`te — buradaki sözlük yalnız metin.
      // Sayı YAZILMIYOR: kotalar sunucu config'inden geliyor (bkz. o dosya).
      benefits: {
        unlimitedLikes: 'Sınırsız beğeni',
        seeLikes: 'Seni beğenenleri net gör',
        unlimitedMessages: 'Sınırsız mesajlaşma',
        unlimitedUndo: 'Sınırsız geri alma',
        superLikes: 'Yenilenen Süper Beğeni hakkı',
        advancedFilters: 'Gelişmiş filtreler',
        widerDistance: 'Daha geniş mesafe aralığı',
        missedMatchRecovery: 'Daha fazla eşleşme kurtarma',
        discoveryPriority: 'Keşfette öncelik',
        premiumBadge: 'Profilinde premium rozeti',
      },
      // Paywall'da her satırın info ikonuna basınca açılan açıklama.
      // Başlık tabloya sığacak kadar kısa, "bu ne işe yarıyor" cevabı burada.
      benefitDetails: {
        unlimitedLikes:
          'Ücretsiz üyelikte günlük beğeni hakkın sınırlıdır — dolduğunda deste durur ve ertesi günü beklersin. Plus ile günlük sınır tamamen kalkar.',
        seeLikes:
          'Seni beğenenler listesi ücretsiz üyelikte bulanık gelir: birinin seni beğendiğini bilirsin ama kim olduğunu göremezsin. Plus ile liste netleşir, beğenenleri görüp doğrudan eşleşebilirsin.',
        unlimitedMessages:
          'İki tarafı da ücretsiz olan sohbetlerde mesaj sayısı sınırlıdır ve sınıra gelince yazışma durur. Taraflardan birinin Plus olması o sohbeti sınırsız yapar.',
        unlimitedUndo:
          'Yanlışlıkla geçtiğin profili destenin başına geri getirir. Geri alma ücretsiz üyelikte tamamen kapalıdır; Plus ile istediğin kadar kullanırsın.',
        superLikes:
          'Süper Beğeni, beğenini karşı tarafa öne çıkararak iletir — listesinde net görünür ve bildirim alır. Ücretsiz üyelikte tek seferliktir, kendiliğinden yenilenmez; Plus ile her abonelik döngüsünde yeniden dolar.',
        advancedFilters:
          'Üniversite, bölüm, sınıf, boy, burç, konuşulan diller, alışkanlıklar ve daha fazlası: kimlerin karşına çıkacağını ayrıntılı seçersin. Bu filtreler ücretsiz üyelikte kapalıdır.',
        widerDistance:
          'Mesafe filtresinin üst sınırı üyeliğe bağlı. Plus ile menzili çok daha uzağa çekip komşu şehirlerdeki profilleri de destene katabilirsin.',
        missedMatchRecovery:
          'Geçtiğin ama aslında seni beğenmiş olan birini geri getirir — kaçırdığın eşleşmeye ikinci bir şans. Plus ile günlük kurtarma hakkın belirgin şekilde artar.',
        discoveryPriority:
          'Profilin diğer kullanıcıların destesinde daha üst sıralarda gösterilir. Aynı kişilere daha erken görünür, daha çok beğeni alırsın.',
        premiumBadge:
          'Kartında ve profilinde Plus alevi görünür. İstersen Ayarlar\'dan gizleyebilirsin — rozeti kapatmak premium haklarının hiçbirini etkilemez.',
      },
      // Upsell kartında listenin devamı. Kartın gövdesi zaten paywall'ı açıyor,
      // bu satır ayrı bir dokunma hedefi değil.
      benefitsMore: '+{{n}} özellik daha',
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
        // Mesafe artık KATI filtre: bu aralığın dışındaki profiller hiç
        // gösterilmiyor. Metin bunu açıkça söylüyor, yoksa dar seçen kullanıcı
        // boş desteyi hata sanıyor.
        desc: 'Bu mesafenin dışındaki profiller gösterilmez. Ayarlamak için daireyi sürükle.',
        // Free hesabın tavanı düşük; slider orada duruyor. Sayılar SABİT DEĞİL,
        // o an geçerli sınırlardan geliyor. Ayrı şerit DEĞİL: bölüm
        // açıklamasının sonuna ekleniyor, o yüzden tek cümlelik ve kısa.
        freeCap: 'Ücretsiz hesapta sınır {{km}} km, Lit Plus ile {{premiumKm}} km.',
      },
      // Kalıcı "mesafe sınırı olmasın" anahtarı (2026-08-22). PREMIUM DEĞİL —
      // free kullanıcı da açabiliyor, metinde premium ima edilmemeli.
      //
      // Açıklama TEK CÜMLE. Önceden ikinci bir cümle vardı ("En yakındakiler
      // yine önce gelir" — sıralamanın değişmediğini söylüyordu); bilinçli
      // kaldırıldı, açıklama tek satır kalsın.
      ignoreDistance: {
        title: 'Mesafe sınırı olmasın',
        description: 'Türkiye\'nin her yerinden profil görürsün.',
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
          StillFiguringOut: 'Henüz karar vermedim',
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
    // Boş destedeki "Mesafe Sınırını Kaldır" butonunun HATA yolu. Başarı yolu
    // sessiz: anahtar açılıyor, deste doluyor — kullanıcı sonucu zaten
    // görüyor, üstüne toast göstermek gürültü olurdu (eski tek seferlik
    // genişletmede toast vardı; o akış kaldırıldı).
    distanceLimit: {
      error: 'Mesafe sınırı kaldırılamadı. Lütfen tekrar dene.',
    },
    // Boş deste sebepleri — backend `emptyReason` / `emptyReasonCode`
    // (UT-6xxx) ile geliyor, eşleme responseCodes.ts'te. `dismiss` aksiyonlu
    // sebeplerin (allCandidatesSeen) buton etiketi yok.
    empty: {
      // Mesafe katı filtre olduğundan bu sebep artık ÇOK daha sık görülüyor.
      // Buton kalıcı anahtarı AÇIYOR (filtre ekranını açmıyor); anahtar zaten
      // açıkken çizilmez, o durumda filtersTooStrict.action'a düşülür
      // (bkz. DiscoverScreen emptyCopy). `action` etiketi diğer sebeplerde de
      // yeniden kullanılıyor: sınır açıkken teklif her boş destede çıkıyor.
      noCandidatesInRadius: {
        title: 'Yakınında şu an gösterecek kimse yok',
        action: 'Mesafe sınırını kaldır',
      },
      // Backend sebep göndermedi / FE kodu tanımıyor ama deste boş. Sebebe
      // bağlı bir şey İDDİA ETMEYEN nötr metin; yanına mesafe teklifi biniyor.
      unknown: {
        title: 'Şu an gösterecek kimse yok',
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
      // NOT: "profilin görünmüyor" durumu boş-deste metni DEĞİL. Kartlar
      // çiziliyor, yalnız etkileşim kilitli ve sebebi görünürlük kapısı
      // (ProfileHiddenGate) anlatıyor.
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
    // Not gönderenler kendi sekmesinde: not bir beğeninin üstüne binen ayrı
    // ürün, "Beğeni" sekmesinde de görünseydi aynı kart iki yerde çıkardı.
    tabNote: 'Notlar',
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
    emptyNote: 'Henüz not yok.',
    emptyNoteSubtitle:
      'Biri fotoğrafına ya da soru cevabına not yazdığında kartı burada görünecek.',
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
    // Açıklama kartının bu sekmedeki metni. Kart AYNI kart (aynı kapatma
    // bayrağı) — yalnız metin sekmeye göre değişiyor; kaçırdıkların sekmesi
    // beğeni listesinden farklı bir mekanik (pas → beğeni + hak harcama).
    infoMissedDescription:
      'Seni beğenmiş ama pas geçtiğin kişiler bir süre burada durur. Kurtardığında pasın beğeniye döner ve anında eşleşirsiniz; her kurtarma hakkından bir tane düşer.',
    infoMissedDescriptionDays:
      'Seni beğenmiş ama pas geçtiğin kişiler {{days}} gün burada durur. Kurtardığında pasın beğeniye döner ve anında eşleşirsiniz; her kurtarma hakkından bir tane düşer.',
    recoverButton: 'Kurtar',
    // Çoğul eki (`_one`/`_other`) BİLEREK kullanılmıyor: projede başka hiçbir
    // anahtar çoğullamıyor, yani Intl.PluralRules yolu hiç denenmemiş. Sayıyı
    // sonda tutan bu kalıp her adette doğru okunuyor.
    //
    // ⚠️ Metin 2026-08-22'de GÜNLÜK semantiğinden BAKİYE semantiğine geçti:
    // "bugün kalan" artık yanlış — free'de hak yalnız satın alınan krediden
    // geliyor (yenilenmiyor), premium'da tier kotası abonelik döngüsüyle
    // yenileniyor. Gün kavramı kalmadı.
    recoverBalance: 'Kurtarma hakkın: {{count}}',
    // Payda `tavan + satın alınan kredi` (bkz. recoveryQuota.ts). Bakiye
    // paydayı aşıyorsa (tier düşüşü) bu varyant KULLANILMAZ — "5/2" yazardı.
    recoverBalanceWithTotal: 'Kurtarma hakkın: {{count}}/{{total}}',
    recoverBalanceEmpty: 'Kurtarma hakkın kalmadı.',
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
    title: 'Biriyle Eşleştin!',
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
      prompts: 'Sorular',
      promptsDescription: 'Üç soruya kadar cevap vererek kendini anlat. Kartında en çok okunan bölüm burası.',
      // Bio kaldırıldı, yerini `prompts` aldı. Anahtarlar geçiş fazı boyunca
      // duruyor: sahadaki eski sürümler hâlâ okuyor (bkz. ProfileState.bio).
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
    // Prompt'lar — bio'nun yerini alan "cümle başlangıcı + cevap" bölümü.
    // Soru metinleri BURADA DEĞİL: katalogdan (`/api/common/prompts`) çift dilli
    // geliyor ve kartta izleyicinin diline göre sunucuda çözülüyor.
    prompts: {
      title: 'Sorular',
      description: 'En fazla 3 soru seçip cevapla. Kartında soru ve cevabın birlikte görünür.',
      addSlot: 'Soru ekle',
      changePrompt: 'Soruyu değiştir',
      remove: 'Kaldır',
      answerPlaceholder: 'Cevabını yaz...',
      // Cevap düzenleme pili: kapalıyken "Düzenle", açıkken "Bitir" (basınca
      // taslak kaydedilir — yazarken kaydedilmiyor).
      editAnswer: 'Düzenle',
      finishAnswer: 'Bitir',
      pickerTitle: 'Bir soru seç',
      pickerEmpty: 'Şu an seçilebilecek başka soru yok.',
      catalogEmpty: 'Sorular henüz hazır değil. Biraz sonra tekrar dene.',
      // Son cevabın silinmesi engelleniyor: boş liste sunucuya "dokunma" olarak
      // gidiyor (multipart'ta boş liste temsil edilemiyor), yani silme sessizce
      // kaybolurdu.
      lastOneKept: 'En az bir cevabın kalmalı. Silmek yerine soruyu değiştirebilirsin.',
      requiredForRegister: 'Devam etmek için en az bir soruyu cevapla.',
      errors: {
        'UT-2201': 'En az 1, en fazla 3 soru cevaplayabilirsin.',
        'UT-2202': 'Bu soru artık kullanılamıyor. Listeden başka bir soru seç.',
        'UT-2203': 'Bu soruyu zaten seçtin.',
        'UT-2204': 'Cevabını yazmayı unutma.',
        'UT-2205': 'Cevabın çok uzun, biraz kısalt.',
        'UT-2206': 'Bu cevap topluluk kurallarımıza uymuyor. Farklı bir şey yazmayı dene.',
        generic: 'Cevaplarından biri kaydedilemedi. Kontrol edip tekrar dene.',
      },
    },
    // Hero'nun altındaki mağaza şeridi: SuperLike ve Not kartları YAN YANA,
    // her biri şeridin yarısı — metinler kısa tutulmak ZORUNDA, uzun cümle tek
    // satıra sığmıyor (alt satır numberOfLines:1). subtitleUnknown bilerek
    // sayısız: bakiyeyi bilmediğimiz durumda (stats gelmedi / premium
    // aktivasyonu sürüyor) uydurma sayı yerine ürünün değer önerisi yazılır.
    superLikeCard: {
      title: 'Superlike Al',
      subtitleCount: '{{count}} hakkın kaldı',
      subtitleEmpty: 'Hakkın bitti',
      subtitleUnknown: 'Öne çık',
    },
    noteCard: {
      title: 'Not Al',
      subtitleCount: '{{count}} notun kaldı',
      subtitleEmpty: 'Notun bitti',
      subtitleUnknown: 'Yazarak beğen',
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
      openSettings: 'Ayarlar',
    },
    photos: {
      title: 'Fotoğraf',
      addTitle: 'Fotoğraf Ekle',
      addMessage: 'Fotoğrafı nereden eklemek istersin?',
      sourceCamera: 'Kamera',
      sourceGallery: 'Galeri',
      uploadError: 'Fotoğraf yüklenemedi, tekrar dene.',
      setMain: 'Ana Fotoğraf Yap',
      edit: 'Çerçeveyi Düzenle',
      delete: 'Sil',
      setMainError: 'Ana fotoğraf değiştirilemedi.',
      deleteError: 'Fotoğraf silinemedi.',
      editError: 'Fotoğraf düzenlenemedi, tekrar dene.',
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
      replace: 'Değiştir',
      chooseAnotherMain: 'Başka fotoğrafı ana yap',
      // İtiraz — buton YALNIZCA sunucunun isAppealable'ı true iken çizilir.
      appeal: 'İtiraz Et',
      appealSentTitle: 'İtirazın alındı',
      appealSentMessage:
        'Fotoğrafını tekrar değerlendireceğiz. Sonucu bildirim olarak göndereceğiz.',
      appealError: 'İtirazın gönderilemedi. Lütfen daha sonra tekrar dene.',
      // İtiraz beklemedeyken foto için hiçbir eylem gösterilmiyor (rehber §10).
      appealPendingTitle: 'İtirazın inceleniyor',
      appealPendingMessage:
        'Bu fotoğraf için itirazın değerlendirmede. Karar çıkınca bildirim göndereceğiz.',
      // Silme onayı: itiraz hakkı olan fotoğrafı silmek o hakkı da götürüyor.
      removeWarningTitle: 'İtiraz hakkın kalkar',
      removeWarningMessage:
        'Bu fotoğrafı kaldırırsan itiraz etme hakkın da kalkar. Yine de kaldırmak istiyor musun?',
      // Gizli bir fotoğraf ana fotoğraf yapılırsa profil kartı boş görünür.
      setMainBlockedTitle: 'Bu fotoğraf henüz yayında değil',
      setMainBlockedMessage:
        'Ana fotoğraf olarak yalnızca yayında olan bir fotoğrafı seçebilirsin.',
      reorderMainBlockedTitle: 'İlk sıradaki fotoğraf yayında olmalı',
      reorderMainBlockedMessage:
        'İlk sıradaki fotoğraf ana fotoğrafın olur. Yayında olmayan bir fotoğrafı ilk sıraya alırsan profil kartın boş görünür.',
    },
    // Foto/profil akışına özel UT kodları. Bilinmeyen kod gelirse çağıran taraf
    // kendi jenerik metnine düşer — bu tablo eksik kalabilir, sorun değil.
    // Anahtarlar YENİ (UT-63xx) numaralarda; geçiş penceresindeki eski UT-62xx
    // kodları aynı anahtara bağlanıyor (bkz. PHOTO_CODE_I18N).
    photoCodes: {
      'UT-6303': 'En fazla {{max}} fotoğraf ekleyebilirsin. Önce birini sil.',
      'UT-6304':
        'En az {{min}} fotoğrafın olmalı. Silmeden önce yeni bir fotoğraf ekle.',
      'UT-6305': 'Bu fotoğraf için zaten bir itiraz var.',
      'UT-6306':
        'Fotoğraf kontrolü şu an yapılamıyor. Lütfen birazdan tekrar dene.',
    },
    // Düzenleme modalındaki görünürlük şeridi (foto grid'inin altında). Sheet
    // bir an, bu bir durum: "keşifte değilim" cümlesini ve sunucudan gelen
    // sayıları taşıyan tek yer.
    // Metinler KASITLI KISA: şerit foto grid'inin dibinde, tek satır. Sayı hep
    // cümlenin başında — kullanıcının ilk aradığı şey "kaç tanesi".
    visibilityBanner: {
      reviewTitle: '{{count}} fotoğrafın inceleniyor',
      /** Sayı bilinmiyorken (foto listesi gelmemiş) kullanılan sayısız kalıp. */
      reviewTitleAny: 'Fotoğrafların inceleniyor',
      // "kaydırma kapalı" DEMİYOR: kaydırma/beğeni açık, kapalı olan sadece
      // BAŞKALARININ destesinde görünmek.
      reviewBody: 'Bitene kadar keşifte görünmüyorsun.',
      photosTitle: '{{visible}}/{{required}} fotoğrafın yayında',
      photosBody: 'Keşifte görünmek için yeterli değil.',
      // Red, incelemeden AYRI bir satır: burada yapılacak bir iş var ve profil
      // keşifte görünürken de olabiliyor. Hangi fotoğraf, neden — grid'deki
      // rozetlerde; şerit yalnız sayıyı söylüyor.
      rejectedTitle: '{{count}} fotoğrafın yayınlanamadı',
      rejectedBody: 'Kurallarımıza uymadı, yerine başkasını ekle.',
      addPhoto: 'Fotoğraf ekle',
    },
    // Profil keşif havuzundan düştüğünde açılan BİLGİLENDİRME sheet'i —
    // hiçbir işlemi engellemiyor, metinler de engel ima ETMEMELİ.
    visibilityGate: {
      HiddenInsufficientPhotos: {
        title: 'Profilin şu an görünmüyor',
        message:
          'Keşifte görünmek için en az {{required}} yayında fotoğrafın olmalı. Şu an {{visible}} tane var. Bu sırada kaydırmaya, beğenmeye ve mesajlaşmaya devam edebilirsin.',
      },
      HiddenUnderReview: {
        title: 'Profilin inceleniyor',
        message:
          'Fotoğrafların incelenirken profilin keşifte görünmüyor; inceleme bitince kendiliğinden geri gelecek. Bu sırada kaydırmaya, beğenmeye ve mesajlaşmaya devam edebilirsin.',
      },
      Suspended: {
        title: 'Hesabın askıya alındı',
        message:
          'Hesabın şu an askıda olduğu için profilin keşifte görünmüyor. Bunun yanlış olduğunu düşünüyorsan destek ekibimize yazabilirsin.',
      },
      fallback: {
        title: 'Profilin şu an görünmüyor',
        message:
          'Profilin keşif havuzunda değil. Fotoğraflarını güncelleyerek tekrar görünür olabilirsin.',
      },
      // `matchesKept` KALDIRILDI: kapıda ayrıca "eşleşmelerin güvende" satırı
      // gösterilmiyor.
      addPhoto: 'Fotoğraf Ekle',
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
      // 403: profil hiç tamamlanmamış. Bu uygulamada ayrı bir "profili tamamla"
      // akışı YOK (hesap register-and-complete ile tek çağrıda açılıyor), o
      // yüzden metin kullanıcıyı adımlara değil desteğe yönlendiriyor —
      // gidemeyeceği bir yeri işaret etmek çıkmazı derinleştirirdi.
      profileIncompleteTitle: 'Profilin tamamlanmamış',
      profileIncompleteError: 'Hesabının profil kaydı eksik görünüyor, bu yüzden değişiklik kaydedilemiyor. Bunu senin adına düzeltmemiz gerekiyor.',
      contactSupport: 'Destek\'e Yaz',
      supportSubject: 'Profil tamamlanmamış — düzenleme kaydedilemiyor',
      validationError: 'Girdiğin bilgilerden biri geçersiz. İsim ve sınıf alanlarını kontrol et.',
      // 429: `photo` rate limit'i, fotoğraf yüklemeyle ORTAK kota.
      rateLimitError: 'Çok fazla değişiklik gönderdin. Biraz bekleyip tekrar dene.',
      nameTitle: 'İsim',
      nameDesc: 'Kartında ve mesajlarda görünen isim. Değiştirdiğinde her yerde güncellenir.',
      namePlaceholder: 'İsmin',
      nameRequired: 'İsim boş bırakılamaz.',
      yearOfStudyTitle: 'Sınıf',
      yearOfStudyDesc: 'Kaçıncı sınıfta olduğunu seç. Hazırlık da bir seçenek.',
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
        showLocation: 'Konumumu göster',
        showPremiumBadge: 'Premium rozetimi göster',
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
    // NOT: paywall'daki özellik listesi artık `discover.premium.benefits`
    // altında — upsell kartıyla tek kaynaktan besleniyor.
    periods: {
      weeklyShort: 'Haftalık',
      monthlyShort: 'Aylık',
      yearlyShort: 'Yıllık',
      weeklyPer: 'hafta',
      monthlyPer: 'ay',
      yearlyPer: 'yıl',
    },
    // Plan kartındaki açıklama satırı. Backend `/plans` metin DÖNMÜYOR (yalnız
    // displayName/highlight/sortOrder), o yüzden copy burada duruyor.
    planDesc: {
      weekly: 'Kısa denemek için ideal; istediğin an iptal edebilirsin.',
      monthly: 'Aylık yenilenir, uzun taahhüt yok.',
      yearly: 'En düşük haftalık maliyet; bir kez öde, yıl boyu Plus kal.',
    },
    // Yüzde i18n dışında hesaplanıyor (computeSavings) — aylık plan taban.
    savings: 'Aylığa göre %{{percent}} tasarruf.',
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
      subscribe: '{{price}}/{{period}} için Abone Ol',
      buy: 'Satın Al',
      restore: 'Satın alımları geri yükle',
      trialDisclaimer: 'İlk {{days}} gün ücretsiz kullanabilirsin, ardından {{price}}/{{period}} olarak otomatik yenilenir.',
      appStoreDisclaimer: 'Lit Plus aboneliği, App Store üzerinden otomatik olarak yenilenen bir aboneliktir. Aboneliğiniz, satın alma işleminin onaylanmasından sonra App Store hesabınızdan ücretlendirilir.',
    },
  },
  superLikePurchase: {
    title: 'Süper Beğeni Al',
    description:
      'Süper beğeniler 3x daha fazla eşleşme sağlar. Karşı taraf kartını beğenilerinin en üstünde, bulanıklaşmadan görür — üstelik ücretsiz üyeyse bile. Hakların süresiz, istediğin zaman kullanırsın.',
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
  // Kaçırılan eşleşme kurtarma paketleri. Kabuk superLikePurchase ile aynı,
  // ürün farklı: 2026-08-22'den beri free kullanıcının yenilenen kotası HİÇ
  // yok, yani abonelik dışında kurtarmanın tek yolu bu paketler.
  recoveryPurchase: {
    title: 'Kurtarma Hakkı Al',
    description: 'Seni zaten beğenmiş birine verdiğin pası geri al. Her kurtarma garanti eşleşme demek.',
    packLabel: '{{count}}x Kurtarma',
    cta: 'Satın Al',
    ctaWithPrice: '{{price}} · Satın Al',
    unavailableMessage: 'Paketler şu anda yüklenemedi. Bağlantını kontrol edip biraz sonra tekrar dene.',
    successTitle: 'Kurtarma hakkın hazır',
    successMessage: '{{count}} kurtarma hakkı hesabına eklendi.',
    syncedTitle: 'Bakiyen güncel',
    syncedMessage: 'Bu satın alma zaten hesabına işlenmişti.',
    pendingTitle: 'Satın alman alındı',
    pendingMessage: 'Kurtarma hakların birkaç dakika içinde hesabına yansıyacak.',
    errorTitle: 'Satın alma tamamlanamadı',
    // Yalnız abone OLMAYAN kullanıcıya gösterilir — bkz. RecoveryPurchaseModal.
    premiumUpsell: 'Lit Plus kurtarma hakkı da veriyor',
    disclaimer: 'Kurtarma hakları satın alma tamamlandığında hesabına anında eklenir ve süresi dolmaz. Ödemeler App Store hesabından tahsil edilir, satın alma sonrası iade yapılmaz.',
  },
  // Not = kartın belirli bir içeriğine (foto / prompt) yazılan yorumlu beğeni.
  // Ayrı bir consumable: kotası günlük like kotasından bağımsız, satın alınır.
  note: {
    boxLabel: 'Not gönder',
    boxPlaceholder: 'Bir not yaz…',
    composerTitle: 'Not gönder',
    composerTitleNamed: '{{name}} kişisine not',
    placeholder: 'Dikkatini çeken şeyi yaz…',
    replyingToPhoto: 'Bu fotoğrafa yanıt veriyorsun',
    send: 'Gönder',
    remaining: '{{count}} not hakkın kaldı',
    targetMainPhoto: 'Ana fotoğraf',
    targetPhoto: '{{index}}. fotoğraf',
    targetPrompt: 'Soru cevabı',
    sentTitle: 'Notun gönderildi',
    sentMessage: '{{name}} notunu beğenilerinde görecek.',
    failedTitle: 'Not gönderilemedi',
    codes: {
      generic: 'Not gönderilemedi. Biraz sonra tekrar dene.',
      'UT-6401': 'Not hakkın kalmadı.',
      'UT-6402': 'Notun boş olamaz ve karakter sınırını aşamaz.',
      'UT-6403': 'Bu içerik artık profilde değil. Kartı yenileyip tekrar dene.',
      'UT-6404': 'Bu kişiye zaten karar vermiştin.',
      'UT-6405': 'Bu profile artık ulaşılamıyor.',
      'UT-6406': 'Bu not gönderilemedi. Farklı bir şey yazmayı dene.',
      'UT-6407': 'Kısa sürede çok fazla not gönderdin. Biraz sonra tekrar dene.',
    },
  },
  // Not paketleri. Kabuk superLikePurchase ile aynı; notun kotası HİÇ yok,
  // tek edinme yolu bu paketler.
  notePurchase: {
    title: 'Not Hakkı Al',
    description:
      'Not, bir fotoğrafına ya da soru cevabına yazdığın beğeni. Karşı taraf kartını beğenilerinde bulanıklaşmadan görür — yazdığın cümle ve hangi içeriğe yazdığın da yanında. Hakların süresiz, istediğin zaman kullanırsın.',
    packLabel: '{{count}}x Not',
    cta: 'Satın Al',
    ctaWithPrice: '{{price}} · Satın Al',
    unavailableMessage: 'Paketler şu anda yüklenemedi. Bağlantını kontrol edip biraz sonra tekrar dene.',
    successTitle: 'Not hakkın hazır',
    successMessage: '{{count}} not hakkı hesabına eklendi.',
    syncedTitle: 'Bakiyen güncel',
    syncedMessage: 'Bu satın alma zaten hesabına işlenmişti.',
    pendingTitle: 'Satın alman alındı',
    pendingMessage: 'Not hakların birkaç dakika içinde hesabına yansıyacak.',
    errorTitle: 'Satın alma tamamlanamadı',
    disclaimer: 'Not hakları satın alma tamamlandığında hesabına anında eklenir ve süresi dolmaz. Ödemeler App Store hesabından tahsil edilir, satın alma sonrası iade yapılmaz.',
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
