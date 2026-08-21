const en = {
  common: {
    ok: 'OK',
    cancel: 'Cancel',
    done: 'Done',
    cropperTitle: 'Edit Photo',
    cropperChoose: 'Choose',
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
    privacy: {
      title: 'Privacy',
      subtitle: 'You have full control over your data.',
    },
    downloadData: 'Download My Data',
    blockedUsers: 'Blocked Users',
    changePassword: 'Change Password',
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
      pasteButton: 'Paste',
      verifyButton: 'Verify',
      backButton: 'Go Back',
      validation: {
        codeRequired: 'Please enter the 6-digit code',
        clipboardEmpty: 'No 6-digit code found on the clipboard',
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
    step14: {
      title: 'Your Lifestyle',
      description: 'Optional information. Improves profile matches.',
      smokingLabel: 'Smoking',
      zodiacLabel: 'Zodiac Sign',
      relationshipIntentLabel: 'What You Are Looking For',
      relationshipIntentError: 'An error occurred while loading relationship intents',
      smokingError: 'An error occurred while loading smoking statuses',
      zodiacError: 'An error occurred while loading zodiac signs',
      skipButton: 'Skip',
    },
    // Step16 comes BEFORE photos (15) — the number reflects when the screen
    // was added, not its position in the flow (see RegisterProgressBar).
    step16: {
      title: 'Your Habits and Beliefs',
      description: 'Optional information. You can change both later from your profile.',
      alcoholLabel: 'Drinking',
      religiousViewLabel: 'Religious Views',
      alcoholError: 'An error occurred while loading drinking options',
      religiousViewError: 'An error occurred while loading religious views',
      skipButton: 'Skip',
    },
    step15: {
      title: 'Your Photos',
      titleWithCount: 'Your Photos {{count}}/6',
      description:
        'Drag photos on top of each other to reorder them. The first photo is your main profile photo.',
      maxPhotosError: 'You can add up to 6 photos',
      cropperTitle: 'Edit Photo',
      cropperChoose: 'Choose',
      cropCancelled: 'Cropping of this photo was cancelled.',
      pickerCancelled: 'Gallery selection cancelled:',
      submitButton: 'Complete Profile',
      submitError: 'Registration could not be completed. Please try again.',
      mainPhotoLabel: 'Main photo',
      pickMainTitle: 'Pick your main photo',
      pickMainHint: 'Tap the photo you want as your main photo.',
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
      superLikeCooldownTitle: 'Super Likes used up',
      superLikeCooldownMessage: 'Your quota refills when the 7-day cycle ends — {{time}}.',
      superLikeExhaustedTitle: 'You are out of Super Likes',
      superLikeExhaustedMessage: 'Free membership includes a single Super Like and it does not renew on its own.',
    },
    premium: {
      badge: 'PREMIUM MEMBER',
      feature1: 'Unlimited Likes',
      feature2: 'See Who Likes You',
      feature3: 'Rewind',
      feature4: 'Ad-Free Experience',
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
        desc: 'Set the maximum distance for users you want to match with. Drag the circle with your finger to adjust.',
        // Free accounts cap lower (50 km) and the slider stops there. The strip
        // explains why; tapping it opens the paywall.
        freeCap: 'Free accounts can go up to {{km}} km. Premium raises it to {{premiumKm}} km.',
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
    // NOTE: the `radiusExpanded` strip was REMOVED (backend contract
    // 2026-08-17). The backend still widens the radius silently when
    // candidates run thin, but no longer reports it (`wasRadiusExpanded` is
    // always false) — product decided the expansion stays invisible.
    // Empty-deck reasons — sent by the backend as `emptyReason` /
    // `emptyReasonCode` (UT-6xxx); mapping lives in responseCodes.ts. Reasons
    // whose action is `dismiss` (allCandidatesSeen) have no button label.
    empty: {
      noCandidatesInRadius: {
        title: 'Nobody to show near you right now',
        action: 'Widen distance',
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
    viewButton: 'See who likes you',
    // Missed matches: people who liked you but you passed on. The list is open
    // to everyone; recovering costs a daily quota.
    tabMissed: 'Missed',
    emptyMissed: 'You have not missed anyone.',
    // The window length comes from the backend — see the Turkish file.
    emptyMissedSubtitle:
      'If you pass on someone who liked you, they stay here for a while so you can take it back.',
    emptyMissedSubtitleDays:
      'If you pass on someone who liked you, they stay here for {{days}} days so you can take it back.',
    recoverButton: 'Recover',
    // Deliberately not pluralized — see the Turkish file for why.
    recoverQuota: 'Recoveries left today: {{count}}',
    // No "-1 means unlimited" branch here — premium is capped too (5/day).
    recoverQuotaWithLimit: 'Recoveries left today: {{count}}/{{limit}}',
    recoverQuotaEmpty: 'You are out of recoveries for today.',
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
    // SuperLike card under the hero. The card is half the screen wide, so the
    // subtitles have to stay short — a long line will not fit on one row.
    // subtitleUnknown is deliberately number-free: when the balance is unknown
    // (stats missing / premium activation pending) we show the value prop
    // instead of a made-up count.
    superLikeCard: {
      title: 'Get Superlikes',
      subtitleCount: '{{count}} left',
      subtitleEmpty: 'None left',
      subtitleUnknown: 'Stand out',
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
    },
    photos: {
      title: 'Photo',
      addTitle: 'Add Photo',
      addMessage: 'Where would you like to add the photo from?',
      sourceCamera: 'Camera',
      sourceGallery: 'Gallery',
      uploadError: 'Photo could not be uploaded, please try again.',
      setMain: 'Set as Main Photo',
      delete: 'Delete',
      setMainError: 'Main photo could not be changed.',
      deleteError: 'Photo could not be deleted.',
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
      mainHint: 'You need to be alone in your main photo.',
      otherHint: 'Your other photos can include friends, scenery or your hobbies.',
      replace: 'Replace',
      chooseAnotherMain: 'Set another photo as main',
      // Making a hidden photo the main one leaves the profile card blank.
      setMainBlockedTitle: 'This photo isn\'t live yet',
      setMainBlockedMessage:
        'You can only set a photo that is live as your main photo.',
      reorderMainBlockedTitle: 'The first photo must be live',
      reorderMainBlockedMessage:
        'The first photo becomes your main photo. If you move a photo that isn\'t live to the first slot, your profile card will look empty.',
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
        showPremiumBadge: 'Show my premium badge',
        showPremiumBadgeHint: 'Turning this off keeps all your premium features.',
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
    features: {
      unlimited: 'Unlimited Likes',
      seeLikes: 'See Who Likes You',
      rewind: 'Rewind',
      noAds: 'Ad-Free Experience',
    },
    periods: {
      weeklyShort: 'Weekly',
      monthlyShort: 'Monthly',
      yearlyShort: 'Yearly',
      weeklyPer: 'week',
      monthlyPer: 'month',
      yearlyPer: 'year',
    },
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
      subscribe: '{{price}} / {{period}} — Subscribe',
      buy: 'Buy',
      restore: 'Restore Purchases',
      trialDisclaimer: 'Try free for {{days}} days, then {{price}}/{{period}}, renewed automatically.',
      appStoreDisclaimer: 'Lit Plus subscription is automatically renewed through the App Store. Your account will be charged from your App Store account after purchase confirmation.',
    },
  },
  superLikePurchase: {
    title: 'Get Super Likes',
    description: 'Super likes get 3x more matches. Pick your pack and stand out.',
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
