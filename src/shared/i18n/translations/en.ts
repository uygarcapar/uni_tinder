const en = {
  common: {
    ok: 'OK',
    cancel: 'Cancel',
    done: 'Done',
    cropper: {
      title: 'Edit Photo',
      choose: 'Choose',
      reset: 'Reset',
      progress: '{{index}} / {{total}}',
      hint: 'Drag to reposition, pinch to zoom',
      failed: 'The photo could not be processed, please try again.',
    },
    crashTitle: 'Something went wrong',
    crashMessage: 'An unexpected error occurred. Tap the button to try again.',
    crashRetry: 'Try Again',
    offline: 'No internet connection',
    back: 'Back',
    save: 'Save',
    error: 'Error',
    info: 'Info',
    no: 'No',
    yes: 'Yes',
    continueButton: 'Continue',
    notifications: 'Notifications',
    menu: 'Menu',
    close: 'Close',
    notFound: "'{{query}}' not found",
    limitReached: 'Limit Reached',
  },
  settings: {
    title: 'Settings',
    theme: {
      title: 'Theme',
      subtitle: 'Choose how the app looks.',
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },
    language: {
      title: 'Language',
      subtitle: 'Choose the language the app is shown in.',
      system: 'System',
    },
    messaging: {
      title: 'Messaging',
      subtitle: 'Control chat and notification behavior.',
    },
    readReceipts: {
      title: 'Read Receipts',
      subtitle: 'Let your partner know when you read messages',
    },
    muteOnline: {
      title: 'Mute Notifications While Online',
      subtitle: "Don't receive push notifications while the app is open",
    },
    photoModerationAlerts: {
      title: 'Photo Notifications',
      subtitle:
        "Photo decisions and appeal results. We'll still tell you if your profile drops out of discovery.",
    },
    privacy: {
      title: 'Privacy',
      subtitle: 'You have full control over your data.',
    },
    downloadData: 'Download My Data',
    blockedUsers: 'Blocked Users',
    changePassword: 'Change Password',
    changeEmail: 'Change Email',
    account: {
      title: 'Account',
      subtitle: 'If you delete your account, you can return within 30 days.',
    },
    deleteAccount: 'Delete Account',
  },
  errors: {
    generic: 'Error',
    prefUpdate: 'Preference could not be updated.',
    dataNotReady: 'Data could not be prepared, please try again.',
    dataStillPreparing:
      'Your data is still being prepared. You will get a notification when it is ready.',
    dataLinkMissing:
      'Your data is ready but no download link came through. Try again from your notifications.',
    dataLinkFailed: 'The download link could not be opened.',
    requestFailed: 'Request could not be sent.',
    operationFailed: 'Operation could not be completed.',
  },
  deleteAccount: {
    alertTitle: 'Delete Account',
    alertMsg:
      'Your account will be suspended for 30 days. You can log in and return during this time. After 30 days, it will be permanently deleted.',
    cancel: 'Cancel',
    confirm: 'Continue',
    successTitle: 'Account Deletion Initiated',
    successMsg:
      'Your account will be deleted within 30 days. You can cancel by logging in during this time.',
    successMsgDated:
      'Your account will be permanently deleted on {{date}} ({{days}} days left). You can cancel by logging in during this time.',
    bannerTitle: 'Your account is scheduled for deletion',
    bannerDated: 'It will be permanently deleted on {{date}}.',
    bannerDatedWithDays: 'It will be permanently deleted on {{date}} ({{days}} days left).',
    bannerUndo: 'Undo',
  },
  auth: {
    session: {
      closedTitle: 'Session Ended',
      closedMessage: 'Your account was accessed from another device.',
      // Session close with no reason from the server — deliberately does NOT
      // claim another device signed in; we don't know that, and guessing scares
      // users into thinking their account was taken over.
      endedTitle: 'Session Ended',
      endedMessage: 'Your session was ended for security reasons. Please sign in again.',
      // Refresh token hit its 30-day lifetime (UT-1014). Routine — deliberately
      // avoids "security" wording so users don't assume a breach.
      expiredTitle: 'Your session expired',
      expiredMessage: "You haven't signed in for a while, so your session ended. Please sign in again.",
      // Signed out on this or another device (UT-1016).
      loggedOutTitle: 'You were signed out',
      loggedOutMessage: 'This account was signed out. Please sign in again to continue.',
      reverifyTitle: 'Email verification required',
      reverifyMessage: 'You need to verify your email address again to continue. Please sign in once more.',
      passwordChangedTitle: 'Your password was changed',
      passwordChangedMessage: 'All sessions were closed for your security. Sign in again with your new password.',
      // The device that CHANGED the address never sees this (ChangeEmail shows
      // its own message) — this is for the user's other devices.
      emailChangedTitle: 'Your email address changed',
      emailChangedMessage: 'All sessions were closed for your security. Sign in again with your new address.',
    },
    // Ban / suspension / deletion screen. The body text comes from the backend
    // (`message`); these fallbacks are only used when that body is empty.
    accountBlocked: {
      title: {
        banned: 'Your Account Was Closed',
        suspended: 'Your Account Is Suspended',
        account_deleted: 'Account Pending Deletion',
      },
      fallback: {
        banned: 'Your account was permanently closed for violating our rules.',
        suspended: 'Your account is temporarily suspended. You can sign in again once it expires.',
        account_deleted: 'Your account is being deleted. You can stop the process by contacting support before the deadline.',
      },
      suspensionEnds: 'Suspension ends: {{date}}',
      deletionDate: 'Permanent deletion: {{date}}',
      contactSupport: 'Contact Support',
      backToLogin: 'Back to sign in',
      supportSubject: 'Account appeal ({{code}})',
    },
    welcome: {
      signupButton: 'Create Account',
      loginButton: 'I Already Have an Account',
      termsAccept: 'By continuing, you agree to our <1>Terms of Service</1> and <2>Privacy Policy</2>.',
      termsLink: 'Terms of Service',
      privacyLink: 'Privacy Policy',
    },
    // Read-only legal documents (LegalSheet). Privacy SECTIONS are not
    // duplicated here — `auth.kvkkConsent.section*` is the single source; only
    // the read-only header/description lives here.
    legal: {
      privacy: {
        title: 'Privacy & KVKK',
        description: 'A summary of how we handle your data and what your rights are.',
      },
      terms: {
        title: 'Terms of Service',
        description: 'The rules that apply while you use Lit. Creating an account means you accept these terms.',
        sectionTitle1: 'Who Can Use Lit',
        section1Content:
          'Lit is only for people who are at least 18 years old and have a student e-mail address at a supported university. Each person may hold one account; you may not transfer, sell or share it. If your student verification stops being valid, your access may be restricted.',
        sectionTitle2: 'Your Account and Its Security',
        section2Content:
          'You are responsible for keeping the information on your profile accurate and up to date. Never share your password — everything done from your account is attributed to you. If you believe someone else has accessed your account, change your password and contact support.',
        sectionTitle3: 'Community Rules',
        section3Content:
          'Harassment, threats, hate speech, sexual or nude content, content involving minors, fake profiles, using someone else\'s photos, spam, advertising and commercial use, requests for money and any attempt at fraud are prohibited. We may remove content and close accounts that break these rules.',
        sectionTitle4: 'Content You Share',
        section4Content:
          'The photos you upload and the text you write remain yours. You grant us a limited permission to display them so we can run the service; that permission exists only for providing the service and ends when you delete the content or close your account. Photos may go through moderation to check they follow the rules.',
        sectionTitle5: 'Premium and Purchases',
        section5Content:
          'Premium subscriptions are sold through the App Store or Google Play and renew automatically at the end of each period unless you cancel. You manage and cancel subscriptions in your store account settings. One-off packs such as SuperLikes are consumed as you use them and are non-refundable; unused entitlements end when your account is closed. Refund requests follow the rules of the relevant store.',
        sectionTitle6: 'Suspension and Account Closure',
        section6Content:
          'We may suspend your account temporarily or close it permanently if you break these rules. You can also delete your account from inside the app at any time; you may reverse the request within 30 days, after which your data is permanently deleted.',
        sectionTitle7: 'Limits of Our Responsibility',
        section7Content:
          'Lit is a platform that makes meeting people easier; we do not guarantee the identity, statements or behaviour of other users. Be careful when you meet someone and put your own safety first. The service is provided "as is" and may be interrupted for maintenance, updates or technical reasons.',
        sectionTitle8: 'Changes and Contact',
        section8Content:
          'We may update these terms from time to time. We announce significant changes in the app, and continuing to use Lit after an update means you accept the new terms. For questions, reach us at destek@lit.com.',
      },
    },
    login: {
      title: 'Log In.',
      description: 'Use your e-mail and password to log in.',
      emailLabel: 'E-Mail',
      emailPlaceholder: 'example@university.edu.tr',
      passwordLabel: 'Password',
      passwordPlaceholder: '••••••••',
      forgotPassword: 'Forgot your password?',
      submitButton: 'Log In',
    },
    forgotPassword: {
      title: 'Reset your password.',
      description: "Enter your account's e-mail address and we'll send you a 6-digit reset code.",
      emailLabel: 'E-Mail',
      emailPlaceholder: 'example@university.edu.tr',
      // The backend returns the same response for unregistered addresses too;
      // the wording deliberately preserves that ambiguity.
      infoText: 'If the address is registered, the code arrives within a few minutes.',
      submitButton: 'Send Code',
      errors: {
        sendFailed: 'Code could not be sent',
        network: 'Connection error, try again',
      },
      code: {
        title: 'Enter the reset code.',
        description: ' Enter the 6-digit code sent to',
        resendSuccess: 'Code sent successfully!',
        resendButton: 'Resend',
        resendCountdown: 'Resend ({{countdown}}s)',
        pasteButton: 'Paste',
        backButton: 'Go Back',
        validation: {
          codeRequired: 'Please enter the 6-digit code',
          clipboardEmpty: 'No 6-digit code found on the clipboard',
        },
      },
      reset: {
        title: 'Set your new password.',
        description: 'Your new password must be at least 8 characters and include an uppercase letter, a number and a special character.',
        passwordLabel: 'New Password *',
        passwordPlaceholder: 'At least 8 characters',
        confirmLabel: 'Confirm New Password *',
        confirmPlaceholder: 'Re-enter your password',
        submitButton: 'Update Password',
        successTitle: 'Password updated',
        successMessage: 'You can now log in with your new password.',
        retryCodeButton: 'Re-enter the code',
        errors: {
          failed: 'Password could not be updated, try again',
          network: 'Connection error, try again',
        },
      },
    },
    // Shared copy for the password endpoints. Error lines are resolved from the
    // backend's `code` field (see passwordErrors.ts): the server only writes
    // Turkish, so for known codes these strings win.
    password: {
      rules: {
        length: 'At least 8 characters',
        uppercase: 'At least 1 uppercase letter',
        lowercase: 'At least 1 lowercase letter',
        digit: 'At least 1 number',
        special: 'At least 1 special character',
      },
      errors: {
        currentPasswordWrong: 'That password is incorrect, please try again.',
        codeInvalid: 'That code is wrong or has expired. Request a new one.',
        codeBurned: 'You entered the code incorrectly too many times. It has been cancelled for your security — request a new one.',
        policy: 'Your new password does not meet the password rules.',
        sameAsCurrent: 'Your new password must be different from your current one.',
        rateLimited: 'Too many attempts. Try again in {{seconds}} seconds.',
        sessionLost: 'Your session has expired. Please sign in again.',
        generic: 'That did not go through, please try again.',
      },
      change: {
        title: 'Change your password.',
        description: 'For your security, let us verify your current password first.',
        currentLabel: 'Current Password',
        currentPlaceholder: 'Enter your current password',
        codeTitle: 'Enter the confirmation code.',
        codeDescription: 'We sent a 6-digit code to {{email}}. Enter it along with your new password.',
        newLabel: 'New Password',
        newPlaceholder: 'At least 8 characters',
        confirmLabel: 'Confirm New Password',
        confirmPlaceholder: 'Re-enter your new password',
        submitButton: 'Update Password',
        expiresIn: 'Code expires in {{time}}',
        expired: 'Your code has expired',
        resendButton: 'Resend',
        resendCountdown: 'Resend ({{countdown}}s)',
        resendSuccess: 'New code sent',
        attemptsLeft: '{{count}} attempts left',
        successTitle: 'Password updated',
        successMessage: 'Your sessions on other devices were closed.',
        validation: {
          currentRequired: 'Please enter your current password.',
          codeRequired: 'Please enter the 6-digit code.',
        },
        forgotCurrent: {
          link: "I don't remember my current password",
          title: 'Reset your password',
          message:
            'We will email you a reset code. After resetting your password you will need to sign in again for security.',
        },
      },
      reset: {
        successTitle: 'Password reset',
        successMessage: 'Your session was closed for security. Sign in with your new password.',
      },
    },
    // Email change. Code / attempts / resend strings are SHARED from
    // `password.change` (same contract: 15 min TTL, 5 attempts, 60 s lock);
    // only the flow-specific ones live here.
    email: {
      errors: {
        inUse: 'This email address is already used by another account.',
        sameAsCurrent: 'This is already your current email address.',
        unsupportedDomain:
          "This address doesn't belong to a supported university. Use your university email address.",
      },
      change: {
        title: 'Change your email address.',
        description: "You're currently using {{email}}.",
        descriptionNoEmail: "Let's verify your current password first.",
        newLabel: 'New Email',
        newPlaceholder: 'new@university.edu.tr',
        // Both consequences stated UP FRONT: the user should know they'll be
        // signed out and that their university (and discovery pool) may change
        // before requesting a code.
        notice:
          "The confirmation code is sent to your NEW address. Once it changes you'll be signed out for security and sign back in with the new address. Switching to a different university's address also changes your discovery pool.",
        codeTitle: 'Enter the confirmation code.',
        codeDescription: 'We sent a 6-digit code to {{email}}. Enter it below.',
        submitButton: 'Update Email',
        successTitle: 'Your email address was updated',
        successMessage: 'Your address is now {{email}}. You need to sign in again for security.',
        successWithUniversity:
          "Your address is now {{email}}. You're now a {{university}} student and your discovery was updated accordingly. You need to sign in again for security.",
        validation: {
          emailRequired: 'Please enter your new email address.',
          emailInvalid: 'Enter a valid email address.',
        },
      },
    },
    kvkkConsent: {
      title: 'Privacy & KVKK',
      description: 'Before continuing to use the app, we ask you to read and agree to the following text.',
      acceptText: 'I have read, understood, and accept the privacy policy and KVKK disclosure text.',
      acceptButton: 'Accept & Continue',
      titleRequired: 'Consent Required',
      messageRequired: 'You must accept the text to continue.',
      errorSave: 'Consent could not be saved, please try again.',
      sectionTitle1: 'Protection of Personal Data (KVKK)',
      section1Content:
        'Within the scope of the Law No. 6698 on the Protection of Personal Data, your personal data is processed by our company as the data controller. Personal data collected through this application is used solely for service provision purposes and shared with third parties within the framework of the law.',
      sectionTitle2: 'Processed Data',
      section2Content:
        'Data such as your name, email, date of birth, gender, university information, location, and profile photos are processed. This data is used to provide you with personalized services.',
      sectionTitle3: 'Your Rights',
      section3Content:
        "Under Article 11 of KVKK, you have the right to learn whether your personal data is processed, request information about it if so, learn the purpose of processing and whether it is used accordingly, know third parties to whom your data is transferred domestically or abroad, and request correction of incomplete or incorrectly processed data.",
      sectionTitle4: 'Cookies and Analytics',
      section4Content:
        'Analytics tools are used to improve the application experience. Data collected through these tools is processed to enhance the user experience.',
      sectionTitle5: 'Data Retention',
      section5Content:
        'Your data is retained as long as your account is active. If you delete your account, your data will be permanently deleted from our systems within 30 days.',
      sectionTitle6: 'Contact',
      section6Content:
        'For questions about our privacy policy or your personal data, you can reach us at support@lit.com.',
    },
    step1: {
      title: 'University E-Mail',
      description: 'Your university email helps us verify that you are a student.',
      emailPlaceholder: 'edu.tr',
      infoText: 'Only academic email addresses are accepted. Example: mert@university.edu.tr',
      errors: {
        accountExistsTitle: 'Account Exists',
        accountExists: 'An account already exists for this email, please log in.',
        loginAction: 'Log In',
        invalidDomain: 'Only university email addresses are accepted.',
        unsupportedUniversity: "We don't support your university yet. Please get in touch with us.",
        sendFailed: 'Could not send the code',
        network: 'Connection error, please try again',
      },
    },
    step2: {
      title: 'Verify your E-Mail.',
      description: ' Enter the 6-digit code sent to',
      descriptionPending: ' A code was previously sent to your address. Check your email.',
      resendSuccess: 'Code sent successfully!',
      resendPending: 'We just sent the code — try again in {{seconds}}s.',
      resendButton: 'Resend',
      resendCountdown: 'Resend ({{countdown}}s)',
      verifyButton: 'Verify',
      backButton: 'Go Back',
      validation: {
        codeRequired: 'Please enter the 6-digit code',
      },
    },
    step3: {
      title: 'Create your password.',
      passwordLabel: 'Password *',
      passwordPlaceholder: 'At least 8 characters',
      confirmLabel: 'Confirm Password *',
      confirmPlaceholder: 'Re-enter your password',
      confirmCancel: {
        title: 'Leave Registration',
        message: 'Are you sure you want to leave the registration process?',
      },
    },
    step5: {
      title: "Let's get to know you.",
      description: 'Tell us a little about yourself. Fill in the fields to help us get to know you.',
      nameLabel: 'First Name *',
      namePlaceholder: 'Your name',
    },
    step6: {
      title: 'Enter your age.',
      description: 'Your date of birth helps us find the right matches for you.',
      dayLabel: 'Day',
      dayPlaceholder: 'dd',
      monthLabel: 'Month',
      monthPlaceholder: 'mm',
      yearLabel: 'Year',
      yearPlaceholder: 'yyyy',
    },
    step7: {
      title: 'Your Gender',
      description: 'Choose the option that best describes you.',
      detailedSelect: 'Detailed Selection',
      primaryOption: '{{category}} only',
      infoText: 'Detailed gender options help you choose the identity that best describes you.',
    },
    step8: {
      title: 'Your Education.',
      description: 'Select your class and department.',
      departmentLabel: 'Department *',
      departmentPlaceholder: 'Select Department',
      classLabel: 'Class *',
      class0: 'Prep',
      class1: '1st Year',
      class2: '2nd Year',
      class3: '3rd Year',
      class4: '4th Year',
      class5: '5th Year',
      class6: '6th Year',
    },
    step9: {
      title: 'Your Location',
      description: 'We need your location to show your city and the people near you.',
      allowButton: 'Allow Location Access',
      retryButton: 'Try Again',
      privacyNote: 'Your exact address is never shared — only your city and district appear on your profile.',
      deniedTitle: 'Location permission required',
      deniedDescription: 'We need your location to find matches. Enable location access in Settings and come back.',
      openSettings: 'Open Settings',
    },
    step10: {
      title: 'Interests',
      description: 'Who would you like to match with? You can select multiple.',
      male: 'Male',
      female: 'Female',
      nonBinary: 'Non-Binary',
      infoText: 'You can refine your selections by filtering from your profile.',
    },
    step12: {
      title: 'Your Height.',
      description: 'Enter your height. You can adjust by dragging.',
      heightLabel: 'Height (cm) *',
    },
    step13: {
      title: 'Hobbies',
      titleWithCount: 'Hobbies {{count}}/10',
      description: 'Select your interests. This helps you match with people who share common ground.',
      loadError: 'An error occurred while loading hobbies',
    },
    step17: {
      title: 'Tell us about you.',
      description: 'Answer at least one prompt. This is the most-read part of your card — add up to three if you like.',
    },
    step14: {
      // Ekran tek soruya indiği için başlık da o soru: bölüm başlığı
      // (relationshipIntentLabel) artık YALNIZ profil düzenlemede kullanılıyor.
      title: 'What are you looking for?',
      // Adım ZORUNLU (atlanamaz) — açıklama da "isteğe bağlı" demiyor.
      description: 'This one is on your card and matches you with people who want the same thing.',
      requiredError: 'Pick what you are looking for to continue.',
      // Seçenek metinleri backend'den DEĞİL buradan: uç kısa etiket dönüyor
      // ("Long term"), ekranda ise birinci ağızdan cümle isteniyor. Anahtar
      // enumName; haritada olmayan yeni bir değer gelirse `defaultValue` ile
      // backend etiketine düşülüyor (bkz. RegisterStep14Screen).
      intents: {
        LongTerm: 'I prefer a long-term relationship',
        ShortTerm: 'I prefer something short-term',
        LongTermOpenToShort: 'I prefer long-term, but I am open to short-term',
        ShortTermOpenToLong: 'I prefer short-term, but I am open to long-term',
        StillFiguringOut: 'I am still figuring it out',
      },
      // Smoking and zodiac MOVED to step16 (habits/beliefs) — this step only
      // asks what you are looking for. Bölüm başlığı ve "Atla" anahtarları da
      // düştü: ekranın başlığı sorunun kendisi ve adım artık atlanamıyor.
      relationshipIntentError: 'An error occurred while loading relationship intents',
    },
    // Step16 comes BEFORE photos (15) — the number reflects when the screen
    // was added, not its position in the flow (see RegisterProgressBar).
    step16: {
      title: 'Your Habits and Beliefs',
      description: 'Optional information. You can change all of these later from your profile.',
      smokingLabel: 'Smoking',
      alcoholLabel: 'Drinking',
      zodiacLabel: 'Zodiac Sign',
      religiousViewLabel: 'Religious Views',
      // Smoking/drinking options are shown as first-person sentences instead of
      // the backend's short label — same approach as step14's intents. Keyed by
      // enumName, with `defaultValue` falling back to the backend label.
      // TWO SEPARATE MAPS: both enums have a `None` value.
      smoking: {
        None: 'I do not smoke',
        Smoker: 'I am a smoker',
        Occasional: 'I smoke occasionally',
      },
      alcohol: {
        None: 'I do not drink',
        Socially: 'I drink socially',
        Regularly: 'I drink regularly',
      },
      smokingError: 'An error occurred while loading smoking statuses',
      alcoholError: 'An error occurred while loading drinking options',
      zodiacError: 'An error occurred while loading zodiac signs',
      religiousViewError: 'An error occurred while loading religious views',
      skipButton: 'Skip',
    },
    step15: {
      title: 'Your Photos',
      titleWithCount: 'Your Photos {{count}}/6',
      // "Yalnız olma" kuralı yalnızca ana fotoğrafa uygulanıyor; cümlenin ikinci
      // yarısı olmazsa kullanıcı grup fotoğraflarını hiç yüklemiyor.
      description:
        'Drag photos on top of each other to reorder them. The first photo is your main profile photo — you need to be alone in it, but not in the others.',
      maxPhotosError: 'You can add up to 6 photos',
      submitButton: 'Complete Profile',
      submitError: 'Registration could not be completed. Please try again.',
      pickMainTitle: 'Pick your main photo',
      pickMainHint: 'Tap the photo you want as your main photo.',
      tryAgain: 'Try Again',
      // Gönderim sonrası kararlar karta bağlanıyor; dokunma ipucu olmazsa
      // kullanıcı soluk fotoğrafın sebebini nereden okuyacağını bilmiyor.
      moderationHint:
        "Dimmed photos couldn't be published. Tap one to see why.",
      // Hepsi incelemedeyken kullanıcının yapabileceği bir şey yok: yeni
      // fotoğraf da aynı kuyruğa girer, tek doğru davranış beklemek.
      photosUnderReviewTitle: 'Your photos are being reviewed',
      photosUnderReviewMessage:
        "{{count}} of your photos are still being reviewed. Try again in a few minutes to finish signing up — you don't need to upload them again.",
      photosMissingTitle: 'Some photos are missing',
      photosMissing:
        'Your phone cleared its temporary files, so some of your photos are gone. Add them again to continue.',
      sessionExpiredTitle: 'Verification expired',
      sessionExpired:
        'Your email verification has expired. Verify the same email again and everything you entered will be kept.',
    },
  },
  chat: {
    messages: {
      title: 'Messages',
      tabAll: 'All',
      tabUnread: 'Unread',
      tabClosed: 'Closed',
      noUnread: 'No unread messages.',
      noClosed: 'No closed chats.',
      empty: 'No messages yet.',
      findMatch: 'Find a match',
      typing: 'typing…',
      // Prefix for unsent composer text ("Draft: hello").
      draft: 'Draft:',
      closedChat: 'Chat closed',
      newMessages: '{{n}} new messages',
      startConversation: 'Start a conversation 👋',
      mediaPhoto: 'Photo',
      mediaVoice: 'Voice message',
      mediaVideo: 'Video',
      today: 'Today',
      yesterday: 'Yesterday',
      notFound: "'{{query}}' not found",
    },
    // The restore window length lives in BACKEND config — never hardcode "24
    // hours" here; the remaining time is derived from the `restorableUntil`
    // timestamp and printed as {{time}} (see features/chat/restoreWindow.ts).
    unmatch: {
      restoreTitle: 'Restore match',
      restoreMessage: 'This chat was closed. You can restore it within {{time}}.',
      // When the window timestamp is not available (list DTO omits it / app
      // relaunched): offer the attempt without promising a duration.
      restoreMessageUnknown: 'This chat was closed. You can try to restore it.',
      restoreUnavailable: 'This match is permanently closed — there is no restore window.',
      restoreWindowHint: '{{time}} left to restore.',
      restoreButton: 'Restore',
      restoreError: 'Could not restore',
      restoreExpiredMessage: 'The restore window may have expired.',
      restoreFailed: 'Operation failed.',
      title: 'Remove match',
      message:
        'Close the chat with {{partnerName}}. Your messages are kept, and you can match again later.',
      confirmMessage:
        'The chat closes but your messages are kept, and you can match again later. If this person is bothering you, block them instead.',
      confirmButton: 'Remove',
      error: 'Could not remove match.',
      removedTitle: 'Match removed',
      removedRestorable: 'You can undo this within {{time}}.',
      removedPermanent: 'This match is now permanently closed.',
      windowHours: '{{h}} hours',
      windowMinutes: '{{m}} minutes',
    },
    // Rematch: when the same pair matches again the old chat is still there,
    // but its messages stay HIDDEN until this gate is opened.
    hiddenHistory: {
      title: 'You matched before',
      action: 'Show the old chat',
      tooOld: 'This chat history is too old to be shown.',
      error: 'Could not open the old chat. Please try again.',
    },
    options: {
      title: 'Chat Settings',
      sectionChat: 'Chat',
      sectionChatDescription: 'Quick actions for this chat.',
      unmatch: 'Remove Match',
      restore: 'Restore Match',
      restoreExpired: 'This chat has ended. The restore window has expired.',
      sectionSafety: 'Safety',
      sectionSafetyDescription:
        'Reporting and blocking are permanent: you will never match again and the old chat stays closed.',
      report: 'Report',
      block: 'Block User',
    },
    system: {
      matchCreated: "You have a new match! 🎉 Send the first message.",
      conversationDeleted: 'This chat has ended.',
      rematched: 'You matched again! You had talked here before.',
    },
    quota: {
      title: 'Message allowance',
      message: 'You have {{remaining}} messages left.',
      exhausted: 'Message allowance used up',
      exhaustedMessage: 'You have reached the message limit in this chat. Go Premium to message without limits.',
    },
    defaultUserName: 'User',
    bubble: {
      edited: '(edited)',
      deleted: 'This message was deleted.',
      tapToRetry: 'Tap to resend',
    },
    actions: {
      reply: 'Reply',
      copy: 'Copy',
      deleteForMe: 'Delete for me',
      deleteForEveryone: 'Delete for everyone',
    },
    input: {
      placeholder: 'Message...',
      closed: 'This chat is closed',
      quotaReached: 'Out of messages — go Premium',
    },
    replyPreview: {
      deletedSender: 'Deleted',
      deletedMessage: 'This message was deleted',
    },
    deleteMessage: {
      error: 'Deletion failed.',
    },
    restore: {
      error: 'Could not restore',
    },
    block: {
      title: 'Blocked',
      message: 'This person will no longer be able to contact you.',
      error: 'Blocking failed.',
      confirmTitle: 'Block user',
      confirmMessage:
        'They will not be able to message you and their profile will be hidden from you. Your match closes PERMANENTLY: you will never match again and the old chat can never be reopened.',
      confirmButton: 'Block',
    },
    emptyState: {
      activeTitle: 'Start chatting with {{partnerName}}',
      closedTitle: 'This chat is closed',
      closedDescription: 'You can view past messages.',
      // One-tap opener suggestions shown as pills in an empty chat.
      suggestion1: 'Hey',
      suggestion2: 'How’s it going?',
      suggestion3: 'Love your profile',
      suggestion4: 'What did you get up to today?',
    },
    media: {
      photo: 'Photo',
      voice: 'Voice message',
      video: 'Video',
      newMessage: 'New message',
    },
    tabTitle: 'Messages',
  },
  discover: {
    tabTitle: 'Discover',
    swipe: {
      resetNow: 'Can reset now',
      resetDays: 'Resets in {{d}}d',
      resetHoursMinutes: 'Resets in {{h}}h {{m}}m',
      resetMinutes: 'Resets in {{m}}m',
      resetSeconds: 'Resets in {{sec}}s',
      // Bare duration variants of the above: no verb, because they get embedded
      // into patterns like "Renews in {{time}}".
      durationDays: '{{d}}d',
      durationHoursMinutes: '{{h}}h {{m}}m',
      durationMinutes: '{{m}}m',
      durationSeconds: '{{sec}}s',
      superLikeCooldownTitle: 'Super Likes used up',
      // The period can't be hardcoded: since 2026-08-22 the Super Like cycle is
      // tier-based (7/30/365 days). "7-day cycle" was a wrong promise for
      // monthly and yearly subscribers; the real figure is `{{time}}`.
      superLikeCooldownMessage: 'Your quota refills when your billing cycle renews — {{time}}.',
      superLikeExhaustedTitle: 'You are out of Super Likes',
      superLikeExhaustedMessage: 'Free membership includes a single Super Like and it does not renew on its own.',
    },
    premium: {
      badge: 'PREMIUM MEMBER',
      // Comparison table rows. Order — and which four surface in the upsell
      // card — live in `premiumBenefits.ts`; this is only the copy.
      // No numbers here: every quota comes from server config (see that file).
      benefits: {
        unlimitedLikes: 'Unlimited likes',
        seeLikes: 'See who likes you, unblurred',
        unlimitedMessages: 'Unlimited messaging',
        unlimitedUndo: 'Unlimited rewinds',
        superLikes: 'Super Likes that renew',
        advancedFilters: 'Advanced filters',
        widerDistance: 'Wider distance range',
        missedMatchRecovery: 'More missed-match recoveries',
        discoveryPriority: 'Priority in discovery',
        premiumBadge: 'Premium badge on your profile',
      },
      // Shown when the info icon on a paywall row is tapped. The row title is
      // short enough for the table; the "what is this" answer lives here.
      benefitDetails: {
        unlimitedLikes:
          'Free membership caps how many likes you can send each day — once you hit it, the deck stops until tomorrow. Plus removes the daily cap entirely.',
        seeLikes:
          'On a free membership the likes list comes in blurred: you know someone liked you, but not who. Plus unblurs it so you can see them and match right away.',
        unlimitedMessages:
          'Chats where both sides are free have a message cap, and the conversation stops once you reach it. If either side has Plus, that chat becomes unlimited.',
        unlimitedUndo:
          'Brings back a profile you passed by mistake. Rewind is completely off on a free membership; with Plus you can use it as often as you like.',
        superLikes:
          'A Super Like delivers your like up front — it shows unblurred on their list and they get a notification. Free membership includes a single one that never renews; with Plus it refills every billing cycle.',
        advancedFilters:
          'University, department, class year, height, star sign, languages, habits and more: choose exactly who shows up in your deck. These filters are locked on a free membership.',
        widerDistance:
          'Your maximum distance is capped by membership. Plus pushes the slider much further out, bringing in profiles from neighbouring cities.',
        missedMatchRecovery:
          'Brings back someone you passed who had actually liked you — a second chance at a match you missed. Plus gives you noticeably more recoveries per day.',
        discoveryPriority:
          'Your profile is placed higher in other people\'s decks. You get seen sooner, which means more likes coming in.',
        premiumBadge:
          'The Plus flame appears on your card and profile. You can hide it from Settings — turning the badge off does not affect any of your premium features.',
      },
      // Rest of the list in the upsell card. The card body already opens the
      // paywall, so this line is not a separate tap target.
      benefitsMore: '+{{n}} more features',
      standardPlan: 'Free',
      featuresLabel: 'Features',
      planName: 'lit plus',
      description: 'Speed up your matches with Lit Plus, see who likes you, and discover more!',
      pricing: '{{price}} / month',
      pricingPrefix: 'Plans starting from ',
      pricingSuffix: '',
      cta: 'View Plans',
    },
    stats: {
      swipesLabel: 'Swipe Limit',
      unlimitedDaily: 'No daily limit',
      superLikesLabel: 'Super Likes',
    },
    filters: {
      saveError: 'Filters could not be saved',
      title: 'Filters',
      apply: 'Apply',
      reset: 'Reset',
      maxDistance: {
        title: 'Maximum Distance',
        // Distance is now a HARD filter: profiles outside this range are never
        // shown. The copy says so outright — otherwise a user who picks a
        // narrow radius reads the empty deck as a bug.
        desc: 'Profiles beyond this distance are not shown. Drag the circle to adjust.',
        // Free accounts cap lower and the slider stops there. The numbers are
        // NOT hard-coded; they come from the limits in force. NOT a separate
        // strip: it is appended to the section description, so keep it to one
        // short sentence.
        freeCap: 'Free accounts cap at {{km}} km, Lit Plus at {{premiumKm}} km.',
      },
      // The persistent "no distance limit" switch (2026-08-22). NOT premium —
      // free accounts can turn it on, so the copy must not imply otherwise.
      //
      // One sentence only. There used to be a second one ("The closest ones
      // still come first") explaining that ranking is unchanged; dropped on
      // purpose — keep the description a single line.
      ignoreDistance: {
        title: 'No distance limit',
        description: "You'll see profiles from anywhere.",
      },
      interestedIn: {
        title: 'Interested In',
        description: 'Choose who you want to match with.',
        men: 'Men',
        women: 'Women',
        nonBinary: 'Non-Binary',
        required: 'Pick at least one option.',
      },
      city: {
        title: 'City',
        description: 'See users from a specific city.',
      },
      university: {
        title: 'University',
        description: 'Only see people from the universities you pick. You can choose up to 3.',
        select: 'Select university',
      },
      premiumFilters: {
        title: 'Premium Filters',
        description: 'Narrow down who you are looking for. Turn on a filter\'s switch and it will not relax even when candidates run out.',
        // Premium filters are not deleted when the subscription lapses, just not
        // applied — say so, otherwise it reads as "my filters are gone".
        paused: 'Your Premium filters are paused. Your selections are kept but not applied to the deck — go Premium again and they pick up where they left off.',
      },
      dealbreaker: {
        on: 'Never show people who do not match this filter',
        off: 'Show people outside this filter when candidates run out',
      },
      enumLoading: 'Loading options…',
      enumUnavailable: 'List could not be loaded right now.',
      height: {
        title: 'Height',
        description: 'Pick the height range you are looking for; either end can stay open.',
        atLeast: '{{cm}} cm and above',
        atMost: '{{cm}} cm and below',
        between: '{{min}} – {{max}} cm',
        any: 'Any',
        clear: 'Clear',
      },
      yearOfStudy: {
        title: 'Year of Study',
        description: 'Only see people in the years you pick.',
        prep: 'Prep',
        year: 'Year {{year}}',
      },
      zodiac: {
        title: 'Zodiac',
        description: 'Only see people with the signs you pick.',
      },
      smoking: {
        title: 'Smoking',
        description: 'Only see people with the smoking habits you pick.',
      },
      alcohol: {
        title: 'Alcohol',
        // Warning lives in the description (same pattern as height): the field
        // is optional on profiles, so this filter narrows the deck a lot.
        description: 'Only see people with the drinking habits you pick. While this filter is on, profiles that have not set this are hidden.',
      },
      language: {
        title: 'Languages spoken',
        description: 'See people who speak at least one of the languages you pick.',
        select: 'Select language',
        // Not `count`: that triggers i18next plural resolution.
        selected: '{{selected}} selected',
        pickerTitle: 'Languages spoken',
        // OR semantics — not "speaks all of them". Second sentence is the same
        // warning as alcohol/smoking: the field is optional on profiles.
        orNote: 'One is enough, they do not have to speak all of them. While this filter is on, profiles that have not set their languages are hidden.',
      },
      religion: {
        title: 'Religious views',
        description: 'Only see people with the religious views you pick.',
        // This filter cuts deeper than the others: the field is optional and
        // people who picked "Prefer not to say" drop out too. The second
        // sentence points at the way out — with the switch off it self-relaxes.
        hiddenNote: 'While this filter is on, profiles that have not set their religious views — and those who picked "Prefer not to say" — are hidden. Leave the switch off and the filter relaxes automatically when candidates run out.',
      },
      pets: {
        title: 'Pets',
        description: 'Should the other person have a pet?',
        any: 'Any',
        has: 'Has a pet',
        hasNot: 'No pets',
        specific: 'Specific types',
        // OR semantics — not "has all of them".
        orNote: 'Profiles with at least one of the types you pick are shown.',
      },
      preferredHobbies: {
        title: 'Hobbies I look for',
        description: 'People with these hobbies get boosted in Discover. Others stay in your deck; you can leave this empty.',
        selected: '{{selected}}/{{max}} selected',
        clear: 'Clear',
        limitTitle: 'Limit Reached',
        limitMsg: 'You can select up to {{max}} hobbies.',
        loading: 'Loading hobbies…',
        unavailable: 'Hobby list could not be loaded right now.',
      },
      relationshipIntents: {
        title: 'Intentions I look for',
        description: 'People with these intentions are shown first in Discover. Others stay in your deck; you can leave this empty.',
        // Short pill labels, keyed by enumName. Missing key → backend display.
        short: {
          LongTerm: 'Long-term',
          ShortTerm: 'Short-term',
          LongTermOpenToShort: 'Long-term, open to short',
          ShortTermOpenToLong: 'Short-term, open to long',
          StillFiguringOut: 'Still figuring it out',
        },
        loading: 'Loading relationship intents…',
        unavailable: 'Relationship intent list could not be loaded right now.',
      },
      visibility: {
        title: 'Visibility',
        description: 'Choose who can see you in Discover. Unlike the filters above, these lists change other people\'s decks, not yours.',
        visibleOnlyLabel: 'Only these universities can see me',
        hiddenFromLabel: 'These universities cannot see me',
        selectUniversities: 'Select universities',
        overlapWarning: 'A university on both lists will not see you — blocking takes priority.',
        premiumExpiryNote: 'These rules stop when your Premium ends — universities you blocked will start seeing you again.',
      },
    },
    rewind: {
      error: 'Could not rewind',
    },
    cityPicker: {
      title: 'Select City',
      search: 'Search city',
    },
    universityPicker: {
      preferredTitle: 'Select University',
      visibleOnlyTitle: 'Who Can See Me',
      hiddenFromTitle: 'Who Cannot See Me',
      search: 'Search university',
      limitMsg: 'You can pick up to {{max}} universities.',
    },
    // Failure path for the empty-deck "Remove distance limit" button. The
    // success path is silent: the switch flips, the deck fills, and the user
    // can see it — a toast on top of that would just be noise. (The old
    // one-shot expansion did toast; that flow is gone.)
    distanceLimit: {
      error: "Couldn't remove the distance limit. Please try again.",
    },
    // Empty-deck reasons — sent by the backend as `emptyReason` /
    // `emptyReasonCode` (UT-6xxx); mapping lives in responseCodes.ts. Reasons
    // whose action is `dismiss` (allCandidatesSeen) have no button label.
    empty: {
      // Distance is a hard filter now, so this reason shows up far more often.
      // The button flips the persistent switch (it does NOT open the filter
      // screen); it is not drawn when the switch is already on — we fall back
      // to filtersTooStrict.action there (see DiscoverScreen emptyCopy). The
      // `action` label is reused by the other reasons too: while the limit is
      // on, the offer shows up on every empty deck.
      noCandidatesInRadius: {
        title: 'Nobody to show nearby right now',
        action: 'Remove distance limit',
      },
      // The backend sent no reason (or the FE doesn't know the code) but the
      // deck is empty. Neutral copy that CLAIMS NOTHING about the cause; the
      // distance offer rides along with it.
      unknown: {
        title: 'Nobody to show right now',
      },
      allCandidatesSeen: {
        title: "You've seen everyone available",
      },
      filtersTooStrict: {
        title: 'Your filters are too narrow',
        action: 'Edit filters',
      },
      profileIncomplete: {
        title: 'Complete your profile first',
        action: 'Go to profile',
      },
      accountRestricted: {
        title: 'Your account is temporarily restricted',
        action: 'Contact support',
      },
      // NOTE: "your profile is hidden" is NOT an empty-deck message. Cards are
      // drawn; only interactions are locked and the visibility gate
      // (ProfileHiddenGate) explains why.
      poolWarming: {
        title: 'Getting your deck ready',
        action: 'Try again',
      },
      swipeLimitReached: {
        title: "You're out of swipes for today",
        action: 'See Premium',
      },
      supportSubject: 'Discover issue ({{code}})',
    },
  },
  likes: {
    title: 'Likes',
    tabTitle: 'Likes',
    tabAll: 'All',
    tabLike: 'Like',
    tabSuperLike: 'Superlike',
    // Notes get their own tab — see the Turkish file for why they are excluded
    // from the "Like" tab.
    tabNote: 'Notes',
    infoDescription:
      'Everyone who liked or super liked you shows up here. Use the buttons next to a card to pass, or like them back to match instantly.',
    startSwipingButton: 'Start swiping',
    // Accessibility labels for the round buttons beside each card.
    passButton: 'Pass',
    likeButton: 'Like',
    emptySuperLike: 'No super likes yet.',
    emptySuperLikeSubtitle: 'When someone super likes you, they will appear here.',
    emptyLike: 'No likes yet.',
    emptyLikeSubtitle: 'New likes will be listed here as they come in.',
    emptyAll: 'No one has liked you yet.',
    emptyAllSubtitle: 'As you improve your profile, the number of people who like you will increase.',
    emptyNote: 'No notes yet.',
    emptyNoteSubtitle:
      'When someone writes a note on your photo or prompt answer, their card shows up here.',
    viewButton: 'See who likes you',
    // Missed matches: people who liked you but you passed on. The list is open
    // to everyone; recovering spends a balance (tier quota + purchased credits).
    tabMissed: 'Missed',
    emptyMissed: 'You have not missed anyone.',
    // The window length comes from the backend — see the Turkish file.
    emptyMissedSubtitle:
      'If you pass on someone who liked you, they stay here for a while so you can take it back.',
    emptyMissedSubtitleDays:
      'If you pass on someone who liked you, they stay here for {{days}} days so you can take it back.',
    // Info card copy for this tab — same card and same dismiss flag, only the
    // text switches. See the Turkish file for why this tab needs its own.
    infoMissedDescription:
      'People who liked you but you passed on stay here for a while. Recovering turns your pass into a like and you match instantly — each one spends a recovery.',
    infoMissedDescriptionDays:
      'People who liked you but you passed on stay here for {{days}} days. Recovering turns your pass into a like and you match instantly — each one spends a recovery.',
    recoverButton: 'Recover',
    // Deliberately not pluralized — see the Turkish file for why.
    //
    // ⚠️ Balance semantics since 2026-08-22 — "today" would be wrong: free
    // users only have purchased credits (never renewed), subscribers get a
    // tier quota that renews with the billing cycle.
    recoverBalance: 'Recoveries left: {{count}}',
    // Denominator is `cap + purchased credits` (see recoveryQuota.ts). Not used
    // when the balance exceeds it (tier downgrade) — it would read "5/2".
    recoverBalanceWithTotal: 'Recoveries left: {{count}}/{{total}}',
    recoverBalanceEmpty: 'You are out of recoveries.',
    recoverSuccessTitle: 'Match recovered 💞',
    recoverSuccessMessage: 'They already liked you — the chat will open shortly.',
    recoverFailed: 'Could not recover.',
  },
  notifications: {
    empty: 'No notifications yet.',
    emptySubtitle: 'Your matches and messages will show up here.',
    // Shown instead of the server text when a like notification's name/photo is
    // hidden from a non-premium user.
    hiddenLike: {
      title: 'Someone liked you.',
      body: 'Get Lit Plus to see who it is.',
    },
    sections: {
      today: 'Today',
      last7Days: 'Last 7 days',
      last30Days: 'Last 30 days',
      older: 'Older',
    },
  },
  match: {
    title: "It's Lit!",
    subtitle: 'You matched with {{name}}. Send the first message.',
    sendMessage: 'Send Message',
    back: 'Go Back',
  },
  // Toast shown when you pass on someone who had already liked you.
  missedMatch: {
    title: 'You missed a match',
    body: '{{name}} had liked you.',
    bodyNoName: 'You passed on someone who liked you.',
  },
  profile: {
    tabTitle: 'Profile',
    loadError: 'Profile refresh error:',
    loadFailed: {
      title: "Couldn't load your profile",
      subtitle: 'Your connection looks slow or dropped. Check it and try again.',
      retry: 'Try again',
    },
    completion: {
      title: 'Profile Completion',
      photos: 'Photos',
      photosDescription: 'By adding more photos, you can make your profile stand out and help other users get to know you better.',
      hobbies: 'Hobbies',
      hobbiesDescription: 'Add up to 10 hobbies to match more easily with people you have things in common with.',
      prompts: 'Prompts',
      promptsDescription: 'Answer up to three prompts to introduce yourself. This is the most-read section of your card.',
      // Bio was removed in favour of `prompts`. Keys stay through the transition
      // phase because shipped versions still read them (see ProfileState.bio).
      bio: 'Bio',
      bioDescription: 'Stand out by briefly introducing yourself. An interesting bio increases your chances of matching.',
      smoking: 'Smoking',
      smokingDescription: 'Find people most suited to you by specifying your lifestyle.',
      zodiac: 'Zodiac Sign',
      zodiacDescription: 'Add your zodiac sign and discover astrological compatibility and potential matches.',
      relationshipIntent: 'What You Are Looking For',
      relationshipIntentDescription: 'By specifying what you are looking for, meet people with the same expectations as you.',
      completeButton: 'Complete',
    },
    // Prompts — the "sentence starter + answer" section that replaced bio.
    // Prompt texts are NOT here: they come from the catalog
    // (`/api/common/prompts`) and are resolved server-side in the viewer's
    // language on cards.
    prompts: {
      title: 'Prompts',
      description: 'Pick and answer up to 3 prompts. Your card shows the prompt and your answer together.',
      addSlot: 'Add a prompt',
      changePrompt: 'Change prompt',
      remove: 'Remove',
      answerPlaceholder: 'Write your answer...',
      editAnswer: 'Edit',
      finishAnswer: 'Done',
      pickerTitle: 'Pick a prompt',
      pickerEmpty: 'No other prompts available right now.',
      catalogEmpty: 'Prompts are not ready yet. Try again shortly.',
      // Removing the last answer is blocked: an empty list reaches the server as
      // "leave unchanged" (multipart cannot represent an empty collection), so
      // the deletion would silently vanish.
      lastOneKept: 'Keep at least one answer. You can change the prompt instead of removing it.',
      requiredForRegister: 'Answer at least one prompt to continue.',
      errors: {
        'UT-2201': 'You can answer between 1 and 3 prompts.',
        'UT-2202': 'This prompt is no longer available. Pick another one from the list.',
        'UT-2203': 'You already picked this prompt.',
        'UT-2204': "Don't forget to write your answer.",
        'UT-2205': 'Your answer is too long, shorten it a little.',
        'UT-2206': "This answer doesn't follow our community guidelines. Try writing something different.",
        generic: 'One of your answers could not be saved. Check it and try again.',
      },
    },
    // Shop row under the hero: SuperLike and Note cards SIDE BY SIDE, each half
    // the row — subtitles have to stay short, a long line will not fit on one
    // row (the subtitle is numberOfLines:1). subtitleUnknown is deliberately
    // number-free: when the balance is unknown (stats missing / premium
    // activation pending) we show the value prop instead of a made-up count.
    superLikeCard: {
      title: 'Get Superlikes',
      subtitleCount: '{{count}} left',
      subtitleEmpty: 'None left',
      subtitleUnknown: 'Stand out',
    },
    noteCard: {
      title: 'Get Notes',
      subtitleCount: '{{count}} left',
      subtitleEmpty: 'None left',
      subtitleUnknown: 'Like with words',
    },
    account: {
      title: 'Account',
    },
    logout: {
      button: 'Log Out',
      title: 'Log Out',
      message: 'Are you sure you want to log out of your account?',
      confirmButton: 'Log Out',
    },
    permissions: {
      title: 'Permission Required',
      galleryMessage: 'Gallery permission is required to add photos.',
      cameraMessage: 'Camera permission is required to take photos.',
      openSettings: 'Settings',
    },
    photos: {
      title: 'Photo',
      addTitle: 'Add Photo',
      addMessage: 'Where would you like to add the photo from?',
      sourceCamera: 'Camera',
      sourceGallery: 'Gallery',
      uploadError: 'Photo could not be uploaded, please try again.',
      setMain: 'Set as Main Photo',
      edit: 'Adjust Crop',
      delete: 'Delete',
      setMainError: 'Main photo could not be changed.',
      deleteError: 'Photo could not be deleted.',
      editError: 'Photo could not be edited, please try again.',
      limitTitle: 'Photo Limit',
      limitMessage: 'You can add up to {{max}} photos. Delete one before adding another.',
      minTitle: 'Last Photos',
      minMessage: 'Your profile must keep at least {{min}} photos. Add a new one before deleting this.',
    },
    // Photo moderation. Text is ALWAYS derived from reasonCode — the backend's
    // reasonText is a hardcoded Turkish string and may change; never key off it.
    photoModeration: {
      status: {
        Approved: 'Live',
        Rejected: 'Not live',
        Review: 'Under review',
        Pending: 'Checking',
      },
      reason: {
        main_photo_multiple_faces:
          'There is more than one person in your main photo. You need to be alone in your main photo — your other photos can include your friends.',
        main_photo_no_face:
          'We can\'t see your face in your main photo. Please pick a photo where your face is clearly visible.',
        explicit_content:
          'This photo doesn\'t meet our community guidelines. Please try a different photo.',
        violence:
          'This photo can\'t be published because it contains violent content. Please try a different photo.',
        hate_symbols:
          'This photo contains a symbol that doesn\'t meet our community guidelines. Please try a different photo.',
        // face_mismatch and face_compare_unavailable show the SAME neutral text
        // to the user (one means "looks like someone else", the other "we
        // couldn't compare") but stay separate codes for support and analytics.
        face_mismatch: 'We\'re reviewing this photo. It will appear on your profile shortly.',
        face_compare_unavailable:
          'We\'re reviewing this photo. It will appear on your profile shortly.',
        under_review: 'We\'re reviewing this photo. It will appear on your profile shortly.',
        provider_error: 'We\'re checking this photo. It will appear on your profile shortly.',
        fallback: {
          Approved: 'This photo is live.',
          Rejected: 'This photo can\'t be published. Please try a different photo.',
          Review: 'We\'re reviewing this photo. It will appear on your profile shortly.',
          Pending: 'We\'re checking this photo. It will appear on your profile shortly.',
        },
      },
      title: {
        main_photo_multiple_faces: 'You need to be alone in your main photo',
        main_photo_no_face: 'Your face must be visible in your main photo',
        fallback: {
          Approved: 'Photo is live',
          Rejected: 'Photo couldn\'t be published',
          Review: 'Your photo is under review',
          Pending: 'Your photo is being checked',
        },
      },
      summary: {
        titleRejected: 'Some of your photos couldn\'t be published',
        titlePending: 'Your photos are under review',
        rejected:
          '{{count}} of your photos couldn\'t be published because they don\'t meet our community guidelines. You can add different photos instead.',
        pending:
          '{{count}} of your photos are under review. They\'ll appear on your profile automatically once approved — no need to upload them again.',
      },
      replace: 'Replace',
      chooseAnotherMain: 'Set another photo as main',
      // Appeal — the button is drawn ONLY when the server's isAppealable is true.
      appeal: 'Appeal',
      appealSentTitle: 'We got your appeal',
      appealSentMessage:
        "We'll review your photo again and send you the result as a notification.",
      appealError: "We couldn't send your appeal. Please try again later.",
      appealPendingTitle: 'Your appeal is being reviewed',
      appealPendingMessage:
        "Your appeal for this photo is under review. We'll notify you once there's a decision.",
      removeWarningTitle: 'You would lose your appeal',
      removeWarningMessage:
        'If you remove this photo you also lose the right to appeal it. Remove it anyway?',
      // Making a hidden photo the main one leaves the profile card blank.
      setMainBlockedTitle: 'This photo isn\'t live yet',
      setMainBlockedMessage:
        'You can only set a photo that is live as your main photo.',
      reorderMainBlockedTitle: 'The first photo must be live',
      reorderMainBlockedMessage:
        'The first photo becomes your main photo. If you move a photo that isn\'t live to the first slot, your profile card will look empty.',
    },
    // UT codes scoped to the photo/profile flows. An unknown code falls back to
    // the caller's own generic text — this table is allowed to be incomplete.
    // Keys use the NEW (UT-63xx) numbers; the transition-window UT-62xx codes
    // map onto the same keys (see PHOTO_CODE_I18N).
    photoCodes: {
      'UT-6303': 'You can add at most {{max}} photos. Delete one first.',
      'UT-6304':
        'You need at least {{min}} photos. Add a new one before deleting this.',
      'UT-6305': 'There is already an appeal for this photo.',
      'UT-6306': "We can't check photos right now. Please try again shortly.",
    },
    // Status strip in the edit modal, below the photo grid. Copy is
    // DELIBERATELY SHORT — one line each — and the count always leads, since
    // that's the first thing you look for. No plural suffixes (`_one`/`_other`),
    // same as photoModeration.summary.
    visibilityBanner: {
      reviewTitle: '{{count}} of your photos are being reviewed',
      /** Countless variant, used when the photo list never arrived. */
      reviewTitleAny: 'Your photos are being reviewed',
      // Does NOT say "swiping is off": swiping and liking stay on; only
      // appearing in other people's decks is paused.
      reviewBody: "You're not in discovery until it's done.",
      photosTitle: '{{visible}}/{{required}} of your photos are live',
      photosBody: 'Not enough to appear in discovery.',
      // Rejection is a SEPARATE row from review: there is something to do here,
      // and it can happen while the profile is still in discovery. Which photo
      // and why lives in the grid badges; the strip only carries the count.
      rejectedTitle: "{{count}} of your photos couldn't be published",
      rejectedBody: "They don't meet our guidelines — add another instead.",
      addPhoto: 'Add photo',
    },
    // Informational sheet shown when the profile drops out of the discovery
    // pool. It blocks nothing, so the copy must not imply a block either.
    visibilityGate: {
      HiddenInsufficientPhotos: {
        title: "Your profile isn't visible right now",
        message:
          'You need at least {{required}} live photos to appear in discovery. You currently have {{visible}}. In the meantime you can keep swiping, liking and chatting.',
      },
      HiddenUnderReview: {
        title: 'Your profile is under review',
        message:
          "While your photos are being reviewed your profile doesn't appear in discovery; it comes back automatically once the review is done. In the meantime you can keep swiping, liking and chatting.",
      },
      Suspended: {
        title: 'Your account is suspended',
        message:
          "Your profile doesn't appear in discovery because your account is currently suspended. If you think this is a mistake, you can contact our support team.",
      },
      fallback: {
        title: "Your profile isn't visible right now",
        message:
          "Your profile isn't in the discovery pool. Updating your photos can make it visible again.",
      },
      // `matchesKept` KALDIRILDI: kapıda ayrıca "eşleşmelerin güvende" satırı
      // gösterilmiyor.
      addPhoto: 'Add Photo',
    },
    edit: {
      button: 'Edit Profile',
      title: 'Edit Profile',
      previewButton: 'How do people see me?',
      bioPlaceholder: 'Tell us about yourself...',
      selectLanguage: 'Select Language',
      loading: 'Loading...',
      languagesSelected: '{{count}} languages selected',
      limitTitle: 'Limit Reached',
      limitHobbies: 'You can select up to 10 hobbies.',
      limitLanguages: 'You can select up to 15 languages.',
      limitPets: 'You can select up to 8 pets.',
      missingInfoTitle: 'Missing Information',
      updateError: 'Profile could not be updated, please try again.',
      // 403: the profile was never completed. This app has no separate
      // "complete profile" flow (the account is created and completed in one
      // register-and-complete call), so the copy points at support rather than
      // at steps the user cannot reach — that would only deepen the dead end.
      profileIncompleteTitle: 'Your profile is incomplete',
      profileIncompleteError: "Your account's profile record looks incomplete, so changes can't be saved. We need to fix this for you.",
      contactSupport: 'Contact Support',
      supportSubject: 'Incomplete profile — cannot save edits',
      validationError: 'One of the values is invalid. Check your name and year of study.',
      // 429: the `photo` rate limit, SHARED with photo uploads.
      rateLimitError: 'Too many changes sent. Wait a moment and try again.',
      nameTitle: 'Name',
      nameDesc: 'The name shown on your card and in messages. Changing it updates it everywhere.',
      namePlaceholder: 'Your name',
      nameRequired: 'Name cannot be empty.',
      yearOfStudyTitle: 'Year of Study',
      yearOfStudyDesc: 'Pick the year you are in. Prep counts too.',
      bioTitle: 'Bio',
      bioDesc: "Write a short bio to introduce yourself. Share what you're up to.",
      photosTitle: 'Photos',
      photosHint: 'Long-press and drag to reorder. Your first photo becomes your main photo — you need to be alone in it, but your other photos can include your friends.',
      smokingTitle: 'Smoking',
      smokingDesc: 'Select your smoking status.',
      alcoholTitle: 'Drinking',
      // The warning is deliberate: leaving this empty hides you from anyone
      // using the alcohol filter (same backend semantics as smoking).
      alcoholDesc: 'Select your drinking habits. If you leave this empty, people using the alcohol filter will not see you.',
      religiousViewTitle: 'Religious Views',
      religiousViewDesc: 'Share your religious views if you want. Tap the selected option again to remove it.',
      zodiacTitle: 'Zodiac Sign',
      zodiacDesc: 'Select your zodiac sign.',
      relationshipIntentTitle: 'What You Are Looking For',
      relationshipIntentDesc: 'Pick what you are after. Tap the selected option again to remove it.',
      hobbiesTitle: 'Hobbies ({{count}} selected)',
      hobbiesHint: 'Tap a category, then pick hobbies inside. Max 10.',
      genderTitle: 'Gender',
      genderDesc: 'Choose your own gender. Tap a category to pick a more specific option.',
      selectCity: 'Select City',
      locationTitle: 'Location',
      locationDesc: 'Your location updates automatically each time you open the app.',
      locationPending: 'Location not determined yet',
      languagesTitle: 'Spoken Languages ({{count}} selected)',
      languagesDesc: 'Select the languages you speak (up to 15).',
      petsTitle: 'Pets ({{count}} selected)',
      petsDesc: 'Select the animals you live with (up to 8).',
      visibility: {
        title: 'Visibility',
        description: 'You decide which information on your profile is visible to others.',
        showUniversity: 'Show my university',
        showOnApp: 'Show me on the app',
        showAge: 'Show my age',
        showLocation: 'Show my location',
        showPremiumBadge: 'Show my premium badge',
      },
    },
    subscription: {
      manageButton: 'Manage Subscription',
      renewalLabel: 'Renewal',
      manageAlt: 'Manage Subscription',
      activeDescription: 'Your membership is active. You have access to unlimited likes, seeing who liked you, and more.',
      status: 'Active',
      // Subscription state machine — mirrors backend /status.status.
      // Access stays ON for Cancelled and BillingIssue; only badge + CTA change.
      trialBadge: 'Trial',
      trialEndsLabel: 'Ends',
      trialDescription: "You're on a free trial. Your first payment will be charged on {{date}}.",
      trialDescriptionNoDate: "You're on a free trial. Your subscription starts automatically when it ends.",
      cancelledBadge: 'Cancelled',
      cancelledDescription: 'Your subscription is cancelled. All features stay unlocked until {{date}}.',
      cancelledDescriptionNoDate: 'Your subscription is cancelled. All features stay unlocked until the end of the period.',
      resubscribeButton: 'Resume Subscription',
      billingIssueBadge: 'Payment issue',
      billingIssueDescription: "We couldn't take your last payment. You keep access until {{date}} — please update your payment method.",
      billingIssueDescriptionNoDate: "We couldn't take your last payment. Update your payment method to keep your access.",
      fixPaymentButton: 'Update Payment Method',
      pendingBadge: 'Activating',
      pendingDescription: 'Your purchase went through. It can take a few minutes for the store confirmation to reach us.',
      retryButton: 'Refresh',
    },
    settings: {
      button: 'Settings',
    },
    card: {
      smoking: 'Smoking Status',
      zodiac: 'Zodiac Sign',
      pets: 'Pets',
      // Lifestyle pill. Backend sends `height` as a number with no `*Display`
      // sibling — the unit is "cm" in both languages, set tight against the
      // number ("180cm") so the narrow pill reads as one token.
      heightCm: '{{cm}}cm',
      petsYes: 'Has pets',
      petsNo: 'No pets',
      bio: 'Bio',
      prep: 'Prep',
      grade: 'Year {{year}}',
      premium: 'Premium',
      knowMeAs: "This is how you'll know me:",
      myIntent: "What I'm looking for:",
      // Appended to the intent label: "Long-term" → "Long-term relationship".
      intentSuffix: 'relationship',
      myInterests: 'My interests are:',
      myLifestyle: 'My lifestyle is:',
      sameUniversity: 'Same University',
      location: 'Location',
      distanceAway: '{{km}} km away',
      distanceNear: 'Less than 1 km',
      reportAccount: 'Report this account',
      blockAccount: 'Block this account',
      activeToday: 'Active today',
      newMember: 'New here',
    },
    languages: {
      title: 'Select Language',
      search: 'Search language',
      notFound: "'{{search}}' not found",
    },
  },
  purchase: {
    // Hub `SubscriptionChanged` toasts — admin actions only; store-driven
    // changes are already expected by the user.
    revokedTitle: 'Your premium subscription has ended',
    revokedMessage: 'Premium features are now off. If you did not expect this, please contact support.',
    grantedTitle: 'Premium is now active',
    grantedMessage: 'Your premium features are unlocked. Enjoy!',
    // NOTE: the paywall feature list now lives under
    // `discover.premium.benefits` — one source shared with the upsell card.
    periods: {
      weeklyShort: 'Weekly',
      monthlyShort: 'Monthly',
      yearlyShort: 'Yearly',
      weeklyPer: 'week',
      monthlyPer: 'month',
      yearlyPer: 'year',
    },
    // Plan card description line. `/plans` returns no copy (displayName /
    // highlight / sortOrder only), so the wording lives here.
    planDesc: {
      weekly: 'Best for a short try — cancel any time.',
      monthly: 'Renews monthly, no long commitment.',
      yearly: 'Lowest weekly cost — pay once, stay Plus all year.',
    },
    // Percentage is computed outside i18n (computeSavings) against monthly.
    savings: 'Save {{percent}}% vs. monthly.',
    errors: {
      packageNotFound: 'Package not found.',
      purchaseTitle: 'Purchase Error',
      operationFailed: 'Operation could not be completed.',
      restoreNotFoundTitle: 'Not Found',
      restoreNoSubscription: 'No active subscription found.',
      restoreFailed: 'Restore failed.',
    },
    cta: {
      alreadyPremium: 'Account Already Lit Plus',
      freeTrial: 'Try Free for {{days}} Days',
      freeTrialBadge: 'First {{days}} days free',
      subscribe: 'Subscribe for {{price}}/{{period}}',
      buy: 'Buy',
      restore: 'Restore Purchases',
      trialDisclaimer: 'Try free for {{days}} days, then {{price}}/{{period}}, renewed automatically.',
      appStoreDisclaimer: 'Lit Plus subscription is automatically renewed through the App Store. Your account will be charged from your App Store account after purchase confirmation.',
    },
  },
  superLikePurchase: {
    title: 'Get Super Likes',
    description:
      'Super likes get 3x more matches. They see your card unblurred at the top of their likes — even on a free account. Super likes never expire, so use them whenever you want.',
    packLabel: '{{count}}x Superlike',
    cta: 'Buy',
    ctaWithPrice: 'Buy · {{price}}',
    unavailableMessage: "Packs couldn't be loaded right now. Check your connection and try again in a moment.",
    successTitle: 'Your super likes are ready',
    successMessage: '{{count}} super likes were added to your account.',
    syncedTitle: 'Your balance is up to date',
    syncedMessage: 'This purchase had already been credited to your account.',
    pendingTitle: 'Purchase received',
    pendingMessage: 'Your super likes will show up in your balance within a few minutes.',
    errorTitle: "Purchase couldn't be completed",
    disclaimer: 'Super likes are added to your account instantly upon purchase and never expire. Payments are charged to your App Store account. Purchases are non-refundable.',
  },
  // Missed-match recovery packs. Same sheet as superLikePurchase, different
  // product: since 2026-08-22 free users have no renewing quota at all, so this
  // is the only way for them to recover a match without subscribing.
  recoveryPurchase: {
    title: 'Get Recoveries',
    description: 'Take back a pass on someone who already liked you. Every recovery is a guaranteed match.',
    packLabel: '{{count}}x Recovery',
    cta: 'Buy',
    ctaWithPrice: 'Buy · {{price}}',
    unavailableMessage: "Packs couldn't be loaded right now. Check your connection and try again in a moment.",
    successTitle: 'Your recoveries are ready',
    successMessage: '{{count}} recoveries were added to your account.',
    syncedTitle: 'Your balance is up to date',
    syncedMessage: 'This purchase had already been credited to your account.',
    pendingTitle: 'Purchase received',
    pendingMessage: 'Your recoveries will show up in your balance within a few minutes.',
    errorTitle: "Purchase couldn't be completed",
    // Only shown to non-subscribers — see RecoveryPurchaseModal.
    premiumUpsell: 'Lit Plus includes recoveries too',
    disclaimer: 'Recoveries are added to your account instantly upon purchase and never expire. Payments are charged to your App Store account. Purchases are non-refundable.',
  },
  // A note is a comment attached to a SPECIFIC piece of the card (photo or
  // prompt). Separate consumable: its balance is independent of the daily like
  // quota and can only be purchased.
  note: {
    boxLabel: 'Send a note',
    boxPlaceholder: 'Write a note…',
    composerTitle: 'Send a note',
    composerTitleNamed: 'Note to {{name}}',
    placeholder: 'Say what caught your eye…',
    replyingToPhoto: 'Replying to this photo',
    send: 'Send',
    remaining: '{{count}} notes left',
    targetMainPhoto: 'Main photo',
    targetPhoto: 'Photo {{index}}',
    targetPrompt: 'Prompt answer',
    sentTitle: 'Note sent',
    sentMessage: '{{name}} will see your note in their likes.',
    failedTitle: "Note couldn't be sent",
    codes: {
      generic: "Note couldn't be sent. Try again in a moment.",
      'UT-6401': 'You have no notes left.',
      'UT-6402': "Your note can't be empty or exceed the character limit.",
      'UT-6403': 'That content is no longer on the profile. Refresh the card and try again.',
      'UT-6404': "You've already decided on this person.",
      'UT-6405': 'This profile is no longer available.',
      'UT-6406': "This note couldn't be sent. Try writing something different.",
      'UT-6407': "You've sent too many notes just now. Try again in a bit.",
    },
  },
  // Note packs. Same shell as superLikePurchase; notes have NO renewing quota,
  // packs are the only way to get them.
  notePurchase: {
    title: 'Get Notes',
    description:
      'A note is a like you write on one of their photos or prompt answers. They see your card unblurred in their likes — along with your line and the content you wrote it on. Notes never expire, so use them whenever you want.',
    packLabel: '{{count}}x Note',
    cta: 'Buy',
    ctaWithPrice: '{{price}} · Buy',
    unavailableMessage: 'Packs could not be loaded right now. Check your connection and try again shortly.',
    successTitle: 'Your notes are ready',
    successMessage: '{{count}} notes added to your account.',
    syncedTitle: 'Your balance is up to date',
    syncedMessage: 'This purchase had already been applied to your account.',
    pendingTitle: 'Purchase received',
    pendingMessage: 'Your notes will appear in your account within a few minutes.',
    errorTitle: 'Purchase could not be completed',
    disclaimer: 'Notes are added to your account instantly when the purchase completes and never expire. Payments are charged to your App Store account; purchases are non-refundable.',
  },
  moderation: {
    report: {
      title: 'Report User',
      reasonLabel: 'Reason for report',
      reasonDescription: 'Pick the closest reason so our team can review it properly.',
      // Enum labels — keys are moderationService.ReportReason values.
      reasons: {
        Spam: 'Spam / Advertising',
        Harassment: 'Harassment / Insults',
        InappropriateContent: 'Explicit content',
        FakeProfile: 'Fake profile',
        Underage: 'Underage',
        Scam: 'Scam',
        Other: 'Other',
      },
      detailLabel: 'Detail (optional)',
      detailDescription: 'A couple of sentences about what happened speeds up the review.',
      detailPlaceholder: 'Briefly describe the incident…',
      characterCount: '{{count}}/1000',
      blockSectionTitle: 'Blocking',
      submit: 'Report',
      disclaimer: 'Reports are reviewed by our team. Intentionally false reports may result in your account being restricted.',
      successTitle: 'Report received',
      successMessage: 'Our team will review it as soon as possible. Staying safe is important.',
      successBlockedMessage:
        'Our team will review it as soon as possible. We blocked this person — you will never match again.',
      alreadyReported: 'You have already reported this user in the last 24 hours.',
      error: 'Report could not be sent.',
      // Reporting no longer forces a block: the box is checked by default and
      // can be unchecked ("I want to report but keep the conversation").
      alsoBlock: 'Block this person',
      alsoBlockHint:
        'Blocking is permanent: you will never match again and the old chat can never be reopened.',
      blockFailed:
        'Your report was received but the block could not be completed. Do you want to try again?',
      blockRetry: 'Try blocking',
      blockRetryFailed:
        'Blocking failed again. You can retry from Settings → Blocked Users.',
    },
    block: {
      confirmTitle: 'Block this account',
      confirmMessage:
        "This person won't show up for you again and can't message you. Blocking is permanent: you will never match.",
      confirmButton: 'Block',
      successTitle: 'Blocked',
      successMessage: "You won't see this person again.",
      error: 'Blocking failed.',
    },
    blocked: {
      title: 'Blocked Users',
      empty: "You haven't blocked anyone",
      emptySubtitle: 'People you block will appear here.',
      unblock: 'Unblock',
      unblockConfirmTitle: 'Unblock',
      unblockConfirmMessage: 'Are you sure you want to unblock {{name}}? They may show up again and can message you.',
      unblockConfirm: 'Unblock',
      unblockError: 'Could not unblock.',
      loadError: 'Blocked users could not be loaded.',
      blockedAt: 'Blocked on {{date}}',
    },
  },
  // Force / soft update gate. The body text normally comes from the backend
  // (already localized via Accept-Language); `fallback.*` is only used when it
  // arrives empty.
  appUpdate: {
    title: {
      soft: 'Update available',
      force: 'Update required',
      maintenance: 'Quick maintenance',
    },
    fallback: {
      soft: "There's a new version of Lit with improvements and fixes.",
      force: 'This version is no longer supported. Update the app to continue.',
      maintenance: "We're doing a short maintenance. Please try again in a few minutes.",
    },
    update: 'Update',
    later: 'Later',
    retry: 'Try again',
  },
} as const;

export default en;
