const en = {
  common: {
    ok: 'OK',
    cancel: 'Cancel',
    done: 'Done',
    cropper: {
      title: 'Edit Photo',
      save: 'Save',
      reset: 'Reset',
      progress: '{{index}} / {{total}}',
      failed: 'The photo could not be processed, please try again.',
    },
    crashTitle: 'Something went wrong',
    crashSubtitle:
      'An unexpected error occurred. Trying again usually fixes it; if it keeps happening, close and reopen the app.',
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
    // Description for the root list (categories) — same voice as section blurbs.
    subtitle: 'Manage your account, notifications and how the app looks.',
    // `heading`: the title shown ABOVE the blurb on a category page. NOT a copy
    // of `title` — that one already sits in the header; this one names what is
    // on the page (rows / pills). The blurbs were made concrete so they no
    // longer just restate the heading.
    theme: {
      title: 'Theme',
      heading: 'Appearance',
      subtitle: 'Follow the system, or lock light or dark.',
      system: 'System',
      light: 'Light',
      dark: 'Dark',
    },
    language: {
      title: 'Language',
      heading: 'App language',
      subtitle: 'Follow the system, or lock Turkish or English.',
      system: 'System',
    },
    messaging: {
      title: 'Messaging',
      heading: 'Chats and notifications',
      subtitle: 'Read receipts, push behavior and what a notification shows.',
    },
    readReceipts: {
      title: 'Read Receipts',
      subtitle: 'Let your partner know when you read messages',
    },
    muteOnline: {
      title: 'Mute Notifications While Online',
      subtitle: "Don't receive push notifications while the app is open",
    },
    messagePreview: {
      title: 'Show Message in Notification',
      subtitle:
        "The message content shows on your lock screen. Turn it off and you'll only see who wrote.",
    },
    photoModerationAlerts: {
      title: 'Photo Notifications',
      subtitle:
        "Photo decisions and appeal results. We'll still tell you if your profile drops out of discovery.",
    },
    privacy: {
      title: 'Privacy',
      heading: 'Your data and blocks',
      subtitle: 'Download a copy of your data, manage who you blocked.',
    },
    downloadData: 'Download My Data',
    privacyPolicy: 'Privacy & KVKK Text',
    // Photo verification's two SEPARATE explicit consents. Titles and bodies
    // come from `profile.selfie.consent.*` so the text has a single source.
    selfieConsent: {
      note: 'Photo verification relies on these two permissions. You do not have to give them and you can switch them off at any time: if you do, your verification badge is removed and you cannot verify again; your account, profile and matches are unaffected.',
      // Neither is enough on its own: /start requires both.
      pairHint: 'Both permissions must be on before verification can be used.',
      error: "We couldn't save your choice, please try again.",
    },
    blockedUsers: 'Blocked Users',
    changePassword: 'Change Password',
    changeEmail: 'Change Email',
    account: {
      title: 'Account',
      heading: 'Account and session',
      subtitle: 'You can deactivate your account or delete it permanently.',
    },
    deleteAccount: 'Delete Account',
    deactivateAccount: 'Deactivate Account',
    // Map attribution in the settings footer. Only the prefix is translated —
    // "© Mapbox" and "© OpenStreetMap" are brand names, left as-is.
    mapAttribution: 'Map data',
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
    alertTitle: 'Permanently delete your account',
    alertMsg:
      'Your profile, matches and all messages are deleted immediately. This cannot be undone.\n\nIf you just need a break, you can deactivate your account instead.',
    cancel: 'Cancel',
    confirm: 'Delete Permanently',
    passwordLabel: 'Your password',
    passwordPlaceholder: 'Enter your password',
    passwordHint: 'Enter your password to confirm.',
    passwordRequired: 'Enter your password.',
    passwordWrong: 'Incorrect password.',
    deleting: 'Deleting…',
    successTitle: 'Account deleted',
    successMsg: 'Your data has been removed. Thanks for giving us a try.',
  },
  deactivateAccount: {
    alertTitle: 'Deactivate your account',
    alertMsg:
      'Your profile is hidden from everyone and you stop receiving notifications. Your data stays — logging back in reactivates your account.',
    cancel: 'Cancel',
    confirm: 'Deactivate',
    successTitle: 'Account deactivated',
    successMsg: 'Log back in any time to return.',
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
          'We may suspend your account temporarily or close it permanently if you break these rules. You can also delete your account permanently from inside the app at any time; deletion happens immediately and cannot be undone, which is why we ask for your password to confirm. If you just want a break, you can deactivate your account instead: your data stays put and your account resumes where it left off when you log in again.',
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
    // Disclosure text — VERSION 1.0 (single source is lit-landing's
    // src/data/privacy-policy.ts; copied from there into the backend's
    // wwwroot/legal and into this file — the three must not drift). Sections 4
    // and 5 are photo verification's two EXPLICIT CONSENTS, given separately
    // Disclosure text — VERSION 1.0 (single source is lit-landing's
    // src/data/privacy-policy.ts; copied from there into the backend's
    // wwwroot/legal and into this file — the three must not drift). Sections 4
    // and 5 are photo verification's two EXPLICIT CONSENTS. The text is read
    // here, but the consents are NOT collected here — they are given as two
    // separate switches under Settings > Privacy (see `settings.selfieConsent`).
    // If the section count changes, update
    // `DOCS.privacy.sectionCount` in LegalSheet and `PRIVACY_SECTIONS` in
    // KVKKConsentScreen together; both have to know the same number.
    // Rendered through PolicyMarkdown → `**bold**` and `- bullets` work.
    kvkkConsent: {
      title: 'Privacy & KVKK',
      description:
        'This text explains, under Law No. 6698 on the Protection of Personal Data (KVKK), for which purposes and on which legal basis your personal data is processed when you use lit, who it is shared with, and how long it is kept. We ask you to read and accept it before continuing.',
      acceptText: 'I have read, understood, and accept the privacy policy and KVKK disclosure text.',
      acceptButton: 'Accept & Continue',
      titleRequired: 'Consent Required',
      messageRequired: 'You must accept the text to continue.',
      errorSave: 'Consent could not be saved, please try again.',


      sectionTitle1: 'Data Controller',
      section1Content: `
        For the personal data processed through the lit application, the data controller is Uygar Çapar, the natural person who publishes the application.

        E-mail: info@4ourstack.com
      `,

      sectionTitle2: 'Personal Data We Process',
      section2Content: `
        **Account and identity data.** Your name, date of birth, gender, university e-mail address, phone number if provided, your password (stored in an irreversibly hashed form), your e-mail verification status and the delivery records of verification codes.

        **Education data.** The name and e-mail domain of your university, your department, your year, and whether you chose to show your university on your profile.

        **Profile data.** Your display name, your bio, the answers you give to profile prompts, your height, your hobbies and interests, the languages you speak, pet information and the photos you upload.

        **Match preferences.** The genders you are interested in, your age range, your distance preference and your profile visibility settings.

        **Location data.** If you grant the location permission on your device, your coordinates and the city/district derived from them. The location shown to other users is blurred: a fixed offset is applied to your coordinates and the distance is rounded into bands. Your raw coordinates are never sent to other users.

        **Usage data.** The profiles you like or pass, your matches, the profiles shown to you, your daily entitlement usage and your in-app activity times.

        **Communication content.** The messages you exchange with people you match with (text and any media you share), message reactions and the notes you write on a profile.

        **Device and technical data.** Your device identifier (token) so we can send notifications, your platform and app version, your IP address, client information, and error and crash records.

        **Subscription data.** Your premium subscription status and purchase history. Your card and payment details are processed by the App Store or Google Play; that information is not passed to us and is not stored by us.

        **Safety and moderation data.** Reports you make or that are made about you, blocks, photo moderation results, your appeals, and suspension or account closure records.

        **Consent records.** Which version of this text you accepted and when, along with the IP address and device information at the moment of consent. This record is kept as proof of your consent.
      `,

      sectionTitle3: 'Special Categories of Personal Data',
      section3Content: `
        Because lit is a dating application, special categories of personal data within the meaning of Article 6 of KVKK may be processed in two places:

        **Data relating to sexual orientation.** Your match preferences may reveal information about your sexual life.

        **Biometric data.** If you choose to use photo verification, the face in the frames you capture is automatically compared with the face in your profile photo to check whether they belong to the same person. The scope and duration of this processing, and the conditions of your consent, are explained separately in sections 4 and 5 below.

        This data is processed only with your explicit consent. You may withdraw your consent at any time; in that case the related feature (match suggestions or photo verification) will not work.
      `,

      sectionTitle4: 'Photo Verification — Explicit Consent for Your Biometric Data',
      section4Content: `
        lit has an **optional** photo verification feature: the frames captured while you perform two small movements in front of your camera are automatically compared with the main photo on your profile. There is a single purpose — to show that the photo on the profile really belongs to you, making it harder to open fake profiles with someone else's photos.

        That comparison requires processing your facial data, which is a **special category of personal data** within the meaning of Article 6 of KVKK. Such data may only be processed **with your explicit consent** (art. 6/2-a); no other legal basis (legitimate interest, performance of a contract, etc.) is relied upon.

        **Data processed.** The live camera frames captured during verification, your current main photo as the other side of the comparison, and the outcome of the operation (verified / not verified, its date, and the technical reason if it failed).

        **The frames are not stored.** The captured frames are processed only at the moment of comparison, in the server's temporary memory, and are deleted as soon as the operation ends; they are not written to disk, not uploaded to cloud storage and not backed up. No permanent **biometric template (face print) is extracted from your face or stored** — meaning no biometric record capable of recognising you later is created. The only thing kept is the outcome itself; these technical records are deleted after 90 days.

        **Not used for any other purpose.** This data is not used for identity verification, advertising, profiling, the matching algorithm or training artificial intelligence models; it is not shared with other users or with third parties.

        **This consent is entirely optional.** If you do not give it, or withdraw it later, your account is not closed, your profile is not hidden, and your matches and messages are unaffected; you simply cannot obtain the verification badge. You may give this consent together with this text while creating your account, and withdraw it or give it again at any time from Settings > Privacy in the app. When you withdraw it, your verification badge is removed and you can no longer verify; there is no biometric data to delete, because none was stored in the first place.

        **The badge means something limited.** Verification reasonably shows that the person using the app is the person in the profile photo; it is not an identity check. It is not proof of your name, your age or your student status. That is why the badge says "photo verified", not "identity verified".
      `,

      sectionTitle5: 'Photo Verification — Explicit Consent for Transfer Abroad',
      section5Content: `
        The image processing service that performs the comparison above does not run in Türkiye, but on servers located in the United States (Amazon Web Services Rekognition, US us-east-1 region). Sending the frames there is a **transfer abroad** within the meaning of Article 9 of KVKK, and it requires a separate **explicit consent**. For this reason, using photo verification requires both the biometric data consent in section 4 and this consent; if either is missing, verification is never started.

        **Only the two sides of the comparison are transferred:** the frames captured at that moment and your current main photo. Your name, e-mail address, user id, university, department, age, location, messages, matches and the other photos on your profile are not sent. The service performing the comparison does not know who the images belong to; it only answers the question "how similar are these two faces".

        **The transfer is momentary and is not stored on the other side.** The images are sent only at the moment of comparison, over an encrypted connection (TLS); as soon as the operation ends they leave both our server's memory and the processing on the other side. The transfer happens only when you use the feature, once per attempt.

        **To put the risk plainly:** once your data leaves Türkiye, the protection of Turkish law does not apply directly. The authorities of the country where the data is located may request access under their own law, and such a request may not match the safeguards KVKK requires. We limit this risk by minimising the data transferred (only two images, without identity information), keeping the transfer momentary and using an encrypted connection.

        **This consent is also entirely optional** and, like the consent in section 4, can be withdrawn at any time from Settings > Privacy. Once withdrawn there is no data left to transfer; your account and profile are unaffected.
      `,

      sectionTitle6: 'Purposes of Processing',
      section6Content: `
        Your personal data is processed to create your account and verify your student status, publish your profile, suggest suitable profiles and establish matches, let you message the people you match with, send notifications, manage premium subscriptions, keep the application secure and prevent misuse (fake profiles, harassment, fraud, inappropriate content), provide you with support, improve the application, and fulfil our legal obligations.
      `,

      sectionTitle7: 'Legal Bases',
      section7Content: `
        Your data is processed on the grounds that it is directly related to the conclusion and performance of a contract (KVKK art. 5/2-c), the fulfilment of our legal obligation (art. 5/2-ç), the establishment and protection of a right (art. 5/2-e), and our legitimate interest provided that it does not harm your fundamental rights and freedoms (art. 5/2-f).

        Special categories of personal data (art. 6/2-a) and non-essential notification and analytics processing rely on your explicit consent. Transfers abroad are made under appropriate safeguards (standard contract) within the scope of Article 9 of KVKK. The only exception is photo verification: the transfer there relies not on a standard contract but on the explicit consent described in section 5, and does not happen at all without it.
      `,

      sectionTitle8: 'Transfers and Transfers Abroad',
      section8Content: `
        Your data is transferred to the following service providers, only to the extent required to provide the service:

        - **Cloud infrastructure and storage:** your photos and the data files you export are held in cloud storage.
        - **Photo moderation:** the photos you upload are sent to an image processing service to detect inappropriate content.
        - **Face comparison (photo verification):** only if you choose to use this feature and have given the explicit consents in sections 4 and 5, the frames captured at that moment and your main photo are sent to an image processing service for comparison.
        - **Notification infrastructure:** notifications are delivered to your device through Google Firebase Cloud Messaging. For message notifications, the title and the first part of the message pass through this infrastructure; the content is not stored there.
        - **Subscription management:** your premium subscription status is shared with a subscription verification service.
        - **Product analytics and error records:** the services we use to improve the application and fix crashes are hosted in the European Union region.
        - **E-mail delivery:** verification codes and informational e-mails are sent through our own e-mail server.
        - **Artificial intelligence services:** the answers you give to profile prompts are converted into a numerical representation so we can suggest people with similar interests; the notes you write on a profile are checked for content before they are sent. For these operations the relevant text is passed to the provider and processed solely to produce the result.

        Some of these providers have servers outside Türkiye. Transfers abroad are made under standard contracts signed with the relevant providers and notified to the Authority, in accordance with Article 9 of KVKK.

        In addition, transfers may be made to the extent required by legislation upon the request of legally authorised public institutions and organisations.
      `,

      sectionTitle9: 'Moderation and Automated Systems',
      section9Content: `
        The profiles shown to you are ordered by an automated score. This ordering is only a suggestion; it does not produce a decision that has legal consequences for you or significantly affects you. You can see an explanation of how match suggestions are formed inside the application.

        The photos you upload are reviewed automatically for compliance with the community rules. If one of your photos is rejected automatically, you may appeal and ask for the decision to be reviewed by a person.

        When a report is made about a user, our moderation team may view the reported content and, for message reports, a portion of the relevant conversation in order to assess the report. This access is limited to reviewing the report, is logged, and is not used for any other purpose. Apart from this, your messages are not read by anyone.
      `,

      sectionTitle10: 'Retention Periods',
      section10Content: `
        - **Account and profile data:** for as long as your account is open.
        - **Messages:** 2 years. Messages older than this are deleted automatically.
        - **Read notifications:** 30 days.
        - **Device notification identifiers:** deleted if unused for 90 days.
        - **Photos rejected in moderation:** 30 days so that you can appeal, then deleted.
        - **Photo verification records:** the outcome of the attempt, its date and, if it failed, the technical reason, for 90 days. The frames captured during verification are never stored (see section 4).
        - **If you delete your account:** your account and your data are deleted **immediately and irreversibly**; there is no waiting period and no way to take the request back. Your profile, photos, matches and messages are deleted. Only these two records are kept:
          - An irreversible hash of your e-mail address, the deletion date and whether the account was banned at the moment of deletion. This record exists to prevent a banned account from being deleted and re-created; it does not give your e-mail address back and is not used for any other purpose.
          - Subscription and payment records. These cannot be deleted because of retention obligations under financial legislation; they are kept with their link to your identity severed (anonymised) and no longer show that they belonged to you.
        - **If you deactivate your account:** your data stays as it is, your profile is not visible to other users and you do not appear in Discover. When you log in again, your account resumes where it left off. Deactivation is not a deletion request and has no time limit.
        - **Records subject to a statutory retention obligation:** for the periods required by the relevant legislation (10 years for commercial books and documents).
      `,

      sectionTitle11: 'Your Rights',
      section11Content: `
        Under Article 11 of KVKK you have the right to learn whether your personal data is processed, to request information if it has been processed, to learn the purpose of processing and whether it is used accordingly, to know the third parties to whom your data is transferred at home or abroad, to request its correction if it is incomplete or incorrectly processed, to request its erasure or destruction, to request that correction and erasure operations be notified to the third parties to whom the data was transferred, to object to a result against you arising from analysis solely by automated systems, and to claim compensation if you suffer damage due to unlawful processing.

        You can exercise some of these rights directly inside the application: you can correct your profile information from settings, request a copy of your data, deactivate your account temporarily, or delete it permanently. Deletion happens immediately and cannot be undone, which is why we ask for your password to confirm.
      `,

      sectionTitle12: 'Applications',
      section12Content: `
        You can send requests concerning your rights to info@4ourstack.com from the e-mail address registered on your account, in accordance with the procedures set out in the Communiqué on the Procedures and Principles of Application to the Data Controller. Your application is concluded within 30 days at the latest.

        If your application is rejected, if you find our response insufficient, or if no response is given within the period, you may file a complaint with the Personal Data Protection Board within 30 days of learning the response and in any case within 60 days of the application date (KVKK art. 14).
      `,

      sectionTitle13: 'Data Security',
      section13Content: `
        Your password is stored irreversibly and cannot be seen by us. All communication between the application and our servers goes over an encrypted connection. Your location data is shown to other users in blurred form. Access to data is limited to the people who need it for their duties, and moderation actions are logged.
      `,

      sectionTitle14: 'Age Limit',
      section14Content: `
        lit is only for university students who are at least 18 years old. Use of the application by people under 18 is prohibited; if detected, the account is closed and the related data is deleted.
      `,

      sectionTitle15: 'Changes to This Text',
      section15Content: `
        This text may be updated in line with changes to the application and to legislation. When the version of the text changes, your consent is requested again inside the application; which version you accepted and when is recorded. The current version is always published on this page.
      `,
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
    // ── Invite code step (RegisterReferralScreen) ─────────────────────────
    // The step is OPTIONAL: "Continue" works with an empty field and "Skip" is
    // prominent. The inviter's NAME is deliberately never shown.
    referral: {
      title: 'Did someone invite you?',
      subtitle: 'Enter your invite code if you have one. You can skip this step.',
      // OtpInput fills the boxes character by character, so the sample code
      // doubles as a format hint (5 characters, uppercase).
      placeholder: 'AK7M2',
      checking: 'Checking your code...',
      // Sonuç toast'ta: title + message (bkz. RegisterReferralScreen).
      validTitle: 'Invite code accepted',
      valid: 'You get 1 free note once you finish signing up.',
      invalidTitle: 'Code not found',
      invalid: 'We could not find this code — it may be a typo.',
      paste: 'Paste',
      skip: 'Skip',
      continue: 'Continue',
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
      // Validation copy. dobSchema resolves these AT VALIDATION TIME — resolving
      // at module scope would freeze whatever language the app booted in.
      invalidDate: 'Enter a valid date of birth.',
      tooYoung: 'You must be over 18 to use the app.',
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
      // Ön kayıt hediyesi kayıt İSTEĞİNİN içinde uygulanıyor ve kullanıcıya
      // bunu söyleyen başka bir yüzey yok (cevapta premium alanı yok, realtime
      // event bastırılmış). Bu üç satır olmazsa hediye sessiz kalıyor.
      // Bitiş tarihi BİLEREK geçilmiyor — bu ekranın işi hediyeyi duyurmak,
      // süreyi Profil > Üyelik kartı anlatıyor.
      premiumGiftTitle: 'Your premium gift is ready 🎉',
      premiumGiftMessage:
        'Because you pre-registered, your premium gift is now active — every premium feature is yours.',
      premiumGiftCta: 'Nice',
    },
  },
  chat: {
    messages: {
      title: 'Messages',
      tabAll: 'All',
      tabUnread: 'Unread',
      tabClosed: 'Closed',
      // Section heading above the search bar — same pattern as `likes.header*`.
      headerAll: 'Chats',
      headerUnread: 'Unread',
      headerClosed: 'Closed chats',
      // One-line subtitle under the big title (same job as `likes.desc*`).
      // ⚠️ Must fit ONE line: the box has a fixed height and `overflow: hidden`
      // (see MessagesScreen TITLE_BLOCK_HEIGHT).
      descAll: 'Your chats with everyone you matched.',
      descUnread: 'Chats still waiting for your reply.',
      descClosed: 'Chats whose match has ended.',
      // Pill next to the title — opens the premium sheet, free users only.
      unlimitedAction: 'Chat unlimited',
      noUnread: 'No unread messages.',
      noClosed: 'No closed chats.',
      empty: 'No messages yet.',
      findMatch: 'Find a match',
      typing: 'typing…',
      // Prefix for unsent composer text ("Draft: hello").
      draft: 'Draft:',
      closedChat: 'Chat closed',
      // Badge next to the name in the conversation list: this chat still counts
      // free messages (neither side is premium).
      limitedQuota: 'Limited',
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
      // Shown only to the side that closed the chat; the other side never had a
      // restore window, so it must not be told one "expired" (see `closed`).
      restoreExpired: 'This chat has ended. The restore window has expired.',
      closed: 'This chat has ended.',
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
      retrySend: 'Resend',
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
      send: 'Send',
      voice: 'Voice message',
    },
    voice: {
      cancel: 'Delete recording',
      pause: 'Pause',
      resume: 'Resume',
      holdHint: 'Hold the mic to record a voice message',
      maxDuration: 'Voice messages can be up to 1 minute',
      permissionTitle: 'Microphone is off',
      permissionBody: 'Allow microphone access in Settings to send voice messages.',
      failed: 'Could not start recording',
      sendFailed: 'Voice message could not be sent',
      tooLarge: 'Recording is too large, try a shorter one',
      badFormat: 'Recording format is not supported, try again',
    },
    emoji: {
      open: 'Emoji',
      showKeyboard: 'Keyboard',
      backspace: 'Delete',
      noRecent: 'Emojis you use will show up here.',
      categories: {
        recent: 'Frequently used',
        smileys: 'Smileys & people',
        animals: 'Animals & nature',
        food: 'Food & drink',
        activity: 'Activity',
        travel: 'Travel & places',
        objects: 'Objects',
        symbols: 'Symbols',
        flags: 'Flags',
      },
    },
    replyPreview: {
      deletedSender: 'Deleted',
      deletedMessage: 'This message was deleted',
    },
    deleteMessage: {
      error: 'Deletion failed.',
    },
    send: {
      failed: 'Message could not be sent.',
    },
    // Backend chat error codes (UT-67xx). Keys are the codes themselves: text
    // is bound to the code, never to the backend `message` (see responseCodes.ts).
    codes: {
      'UT-6701': "You don't have access to this chat.",
      'UT-6702': "You can't send messages in this chat.",
      'UT-6703': 'You can only edit your own messages.',
      'UT-6704': 'You can only delete your own messages.',
      'UT-6710': "Your message can't be empty.",
      'UT-6711': 'Messages can be at most 2000 characters.',
      'UT-6712': "The message you're replying to isn't in this chat or was deleted.",
      'UT-6713': 'Chat not found.',
      'UT-6720': 'Message not found.',
      'UT-6721': "System messages can't be edited.",
      'UT-6722': "A deleted message can't be edited.",
      'UT-6723': 'The 15-minute editing window has closed.',
      'UT-6724': 'Only text messages can be edited.',
      'UT-6725': "System messages can't be deleted.",
      'UT-6730': 'An emoji must be 1-16 characters.',
      'UT-6731': "You can't react to a system message.",
      'UT-6740': 'This chat has been closed.',
      'UT-6741': 'Refreshing the chat…',
      'UT-6742': 'Your search must be at least 2 characters.',
      'UT-6743': 'Only the person who unmatched can restore this chat.',
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
      superLikeCooldownTitle: 'Superlikes used up',
      // The period can't be hardcoded: since 2026-08-22 the Super Like cycle is
      // tier-based (7/30/365 days). "7-day cycle" was a wrong promise for
      // monthly and yearly subscribers; the real figure is `{{time}}`.
      superLikeCooldownMessage: 'Your quota refills when your billing cycle renews — {{time}}.',
      superLikeExhaustedTitle: 'You are out of Superlikes',
      superLikeExhaustedMessage: 'Free membership includes a single Superlike and it does not renew on its own.',
      // Sent confirmation — same shape as the note one (note.sentTitle/sentMessage).
      // The nameless variant is required: a card's displayName can come back
      // empty, which produced a sentence starting with a blank.
      superLikeSentTitle: 'Superlike sent',
      superLikeSentMessage: '{{name}} will see you highlighted in their likes.',
      superLikeSentMessageNoName: 'They will see you highlighted in their likes.',
      // Daily like quota: running-low warning (thresholds live in
      // DiscoverScreen) and exhaustion. The cap is never spelled out — it comes
      // from server config and changes without a FE release; the copy only
      // states what is LEFT ({{count}}) and the time to renewal ({{time}}).
      quotaLowTitle: 'Running low on likes',
      quotaLowMessage: '{{count}} likes left.',
      quotaLowMessageWithTime: '{{count}} likes left, they renew in {{time}}.',
      quotaExhaustedTitle: 'You are out of likes',
      // With no known countdown (missing field / sentinel) we promise nothing —
      // same split as the Super Like copy above.
      quotaExhaustedMessage: 'You can not send likes until your quota renews. Go Premium for unlimited likes.',
      quotaExhaustedMessageWithTime: 'Your likes renew in {{time}}. Go Premium to like without waiting.',
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
      // Big title at the top of the page. Subscribers see the page name
      // instead of a sales line — there is nothing left to sell there.
      pageTitle: 'Get Lit Plus',
      pageTitlePremium: "You're a Lit Plus+ member",
      description: 'Speed up your matches with Lit Plus, see who likes you, and discover more!',
      // Same split as the title: subscribers get a sentence about what they
      // already have, not a pitch for something they have already bought.
      descriptionPremium: 'Every plus feature is unlocked. Your subscription status is on the card below.',
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
        // One string, does NOT change with the switch state — see tr.ts.
        // No longer rendered next to the switch — the title row shows only a
        // grey info icon. This is the title of the sheet that icon opens.
        label: 'Dealbreaker',
        // Sheet body: says what BOTH switch states do. The cost of turning it
        // on (an empty deck) is stated, not hidden.
        info: 'When this is on, nobody outside this filter is ever shown to you — if matching people run out, your Discover screen goes empty. When it is off, the filter stays a preference: it relaxes on its own once your deck empties, so you keep seeing people.',
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
        // Checked-row labels in the filter — written in the other person's
        // voice ("I'm looking for long-term"), same approach as the register
        // step14 sentences. Missing key → `short`, then backend display
        // (see FilterModal → intentRowLabel).
        sentences: {
          LongTerm: "I'm looking for long-term",
          ShortTerm: "I'm looking for short-term",
          LongTermOpenToShort: "I'm looking for long-term but open to short",
          ShortTermOpenToLong: "I'm looking for short-term but open to long",
          StillFiguringOut: 'Still figuring it out',
        },
        // Short labels, keyed by enumName. Missing key → backend display.
        // NOTE: this map is now used only on the Discover CARD (see SwipeCard),
        // where a "relationship" suffix is appended ("Long-term" → "Long-term
        // relationship"). Don't turn these into sentences — the suffix breaks;
        // filter rows use `sentences` above.
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
        description: 'Choose who can see you in Discover.',
        // Three options, one choice: the backend allows only one rule at a time.
        modeEveryone: 'Everyone can see me',
        visibleOnlyLabel: 'Only these universities can see me',
        hiddenFromLabel: 'These universities cannot see me',
        selectedUniversities: 'Selected universities',
        selectUniversities: 'Select universities',
        exclusiveNote: 'Only one of the two lists can be active. Picking in one clears the other; if both are empty, everyone can see you.',
        // 🔴 `overlapWarning` REMOVED: a domain can no longer be on both lists
        // (single-mode rule), so the warning has nothing to warn about.
        //
        // This one describes a real effect: the rule is a hard filter, you drop
        // out of those decks entirely.
        reachWarning: 'With this on, fewer people can see you — so you may get fewer matches.',
        // Switching modes clears the other list — there is no undo, the user
        // would have to build the list again from scratch.
        modeChangeTitle: 'Your selection will be cleared',
        // NOT `count`: that triggers i18next pluralization and the
        // suffix-less key would not resolve.
        modeChangeMessage: 'The {{total}} universities in "{{list}}" will be removed.',
        // ── Invite reward ───────────────────────────────────────────────
        // The visibility filter is no longer Premium-only: 3 invites unlock a
        // 30-day grant too (see features/profile/referralView.ts).
        grantNote: 'Invite reward · {{days}} days left',
        inviteCta: 'Invite 3 friends, get 30 days free',
        premiumExpiryNote: 'This rule stops when your Premium ends — the universities on the list can see you again.',
        // For a user whose Premium HAS ended: the future-tense note would be
        // misleading, the rule is already inactive. The record is kept, so we
        // do not say it was deleted either.
        premiumInactiveNote: 'This rule is not being applied right now because your Premium ended. Your setting is saved and comes back automatically when you renew.',
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
        title: "You've seen everyone available, come back later",
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
    // Section heading above the pill row — present on every tab.
    // Purchase pill beside the section heading — shared by the super like and
    // note tabs. The missed tab dropped out on 2026-08-31: what it sells is a
    // subscription now, not a pack, so its pill uses `viewLikersAction`.
    howToGetAction: 'How to get',
    // The "All" tab's big title deliberately differs from its pill ('All') —
    // 'Likes' is the name of the like tab alone; see the Turkish file.
    headerAll: 'All incoming',
    headerLike: 'Likes',
    headerSuperLike: 'Super likes',
    headerNote: 'Notes',
    // Big title for the missed tab — it used to be the balance itself
    // ("Recoveries left: 3/5"); the balance moved into the description line
    // (see descMissed*). Same wording as the pill (tabMissed) on purpose.
    headerMissed: 'Missed',
    infoDescription:
      'Everyone who liked or super liked you shows up here. Use the buttons next to a card to pass, or like them back to match instantly.',
    // See tr.ts for why this replaced the dismissible info card.
    descAll: 'Everyone who liked you collects here.',
    descLike: 'People who sent you a regular like are listed here.',
    descSuperLike: 'Cards from people who super liked you arrive unblurred.',
    descNote: 'People who wrote a note on your photo or prompt answer.',
    descMissed: 'People you passed on who had liked you stay here for a while.',
    descMissedDays:
      'People you passed on who had liked you stay here for {{days}} days.',
    startSwipingButton: 'Start swiping',
    // Accessibility labels for the round buttons beside each card.
    passButton: 'Pass',
    likeButton: 'Like',
    // Pill above the name row — see the Turkish file for why it is super-like
    // only; the badge beside it sits next to the sentence, it does not replace it.
    superLikePill: 'Sent you a Superlike',
    emptySuperLike: 'No super likes yet.',
    emptySuperLikeSubtitle: 'When someone super likes you, they will appear here.',
    emptyLike: 'No likes yet.',
    emptyLikeSubtitle: 'New likes will be listed here as they come in.',
    emptyAll: 'No one has liked you yet.',
    emptyAllSubtitle: 'As you improve your profile, the number of people who like you will increase.',
    emptyNote: 'No notes yet.',
    emptyNoteSubtitle:
      'When someone writes a note on your photo or prompt answer, their card shows up here.',
    // Premium pill next to the title on the All / Likes tabs. This used to be
    // a sticky button over the list ("See who likes you", `viewButton`); the
    // button is gone and the label shrank to fit inline — the title already
    // says whose likes these are.
    viewLikersAction: 'See likers',
    // Missed matches: people who liked you but you passed on. The list is open
    // to everyone BUT the cards are blurred for free users (same rule as the
    // like cards); recovering is a Premium perk as of 2026-08-31.
    tabMissed: 'Missed',
    emptyMissed: 'You have not missed anyone.',
    // The window length comes from the backend — see the Turkish file.
    emptyMissedSubtitle:
      'If you pass on someone who liked you, they stay here for a while so you can take it back.',
    emptyMissedSubtitleDays:
      'If you pass on someone who liked you, they stay here for {{days}} days so you can take it back.',
    recoverButton: 'Recover',
    // Appended to the tab's description sentence (see tabDescriptionFor), hence
    // the trailing period.
    //
    // ⚠️ Drawn for SUBSCRIBERS ONLY. Free users get no counter, deliberately:
    // recovery left the quota/credit economy on 2026-08-31 and became a Premium
    // perk, so there is nothing left to earn or renew — "0 left" would imply a
    // counter that does not exist. Free users get the offer from the pill next
    // to the heading instead (viewLikersAction).
    recoverUnlimited: 'Recoveries are unlimited.',
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
    // No title copy — the modal's heading is the brand word itself ("lit",
    // drawn in Duckie), not a translated sentence. See MatchModal.
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
  // ── Referral programme ──────────────────────────────────────────────────
  // The card and the sheet share these keys: two different day counts or two
  // different reward names on one screen is the fastest way to lose trust.
  referral: {
    // Shown at the end of registration when `LoginResponseDto.referralApplied`.
    welcomeGift: 'Invite code applied — 1 free note is in your account.',
    copied: 'Invite code copied.',
    // The message carries the code AND the download address; in phase 2 the
    // address becomes the /invite/:code universal link (shared/constants/links.ts).
    shareMessage: 'Join Lit and enter my code when you sign up: {{code}}\n{{url}}',
    reward: {
      // `amount` is DAYS for VisibilityFilter and CREDITS for the other two —
      // the unit lives in the text, callers do not carry it.
      visibilityFilter: 'Visibility filter · {{amount}} days',
      superLike: '{{amount}} super likes',
      note: '{{amount}} notes',
    },
    card: {
      label: 'Your invite code',
      copy: 'Copy',
      share: 'Share',
      // NOT `count`: that triggers i18next pluralization.
      progress: '{{progress}} / {{needed}} friends joined',
      nextReward: 'Next reward: {{reward}}',
      // The ladder is over (`nextTier: null`) — tier 4+ is still a product call.
      comingSoon: 'New rewards coming soon',
      disabled: 'Your invite code is unavailable right now.',
      visibilityActive: 'Visibility filter · {{days}} days left',
      visibilityPaused: 'Resumes for {{days}} days when your Premium ends',
    },
    sheet: {
      title: 'Your invites',
      description: 'One reward for every 3 friends. Your code never changes.',
      inviteesTitle: 'Joined',
      inviteesEmpty: 'Nobody has joined with your code yet.',
      rewardsTitle: 'Rewards earned',
      rewardsEmpty: 'No rewards yet.',
      statusQualified: 'Counted',
      // A rejected invite is NOT hidden, so "I invited three people and got
      // nothing" never becomes a silent complaint.
      statusRejected: 'Not counted',
    },
  },
  profile: {
    tabTitle: 'Profile',
    // Header tab strip that replaced the logo (profile page ↔ plus page).
    tabs: {
      profile: 'Profile',
      // "Plus+" — the product's own spelling (see the plus card and
      // `discover.premium.pageTitlePremium`), not a stray "+".
      plus: 'Plus+',
    },
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
    // NOTE: the leftmost premium-only card (PlusCard) has no translatable
    // copy — just the "plus+" wordmark (brand spelling, drawn in Duckie) and a
    // chevron into the plus page.
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
      // Main-photo face rules — returned synchronously as 400 + code. Each one
      // points at "pick another photo", never "try again": the rule is
      // permanent, retrying hits the same wall.
      'UT-6301':
        'You need to be alone in your main photo. Your other photos can include friends.',
      'UT-6302':
        "We couldn't see a clear face in your main photo. Pick a shot where your face is visible and well lit.",
      'UT-6307':
        "If you delete this, the next photo becomes your main one — but your face isn't clearly visible there. Move a photo where your face shows to the front first, then delete this one.",
      'UT-6303': 'You can add at most {{max}} photos. Delete one first.',
      'UT-6304':
        'You need at least {{min}} photos. Add a new one before deleting this.',
      'UT-6305': 'There is already an appeal for this photo.',
      'UT-6306': "We can't check photos right now. Please try again shortly.",
    },
    // ── Selfie verification ─────────────────────────────────────────────────
    // 🔴 COPY RULE: this flow verifies PHOTOS, not IDENTITY. Never write
    // "Identity verified" / "verified person" / "real person" — a determined
    // attacker can pass by holding up a video of the target, so the copy must
    // not promise more than the product delivers.
    //
    // Server-provided strings are absent here on purpose: the challenge
    // `instruction` and the failure `message` already arrive localized via
    // Accept-Language. These keys are only the unknown-code / network fallback.
    selfie: {
      badge: {
        label: 'Photos verified',
      },
      row: {
        idle: {
          title: 'Verify your photos',
          subtitle: 'Show that the photos on your profile are really you.',
        },
        verified: {
          title: 'Your photos are verified',
          subtitle: 'The verification badge is showing on your profile.',
        },
        reset: {
          title: 'Your verification was reset',
          subtitle:
            'Your main photo changed, so the badge was removed. Tap to verify again.',
        },
      },
      intro: {
        title: 'Verify your photos',
        description:
          "You'll make two short movements with your front camera. We take a single frame for each one and compare it with your main photo.",
        bullet1: 'We pick the movements, and they change every time.',
        bullet2: 'Only two frames are sent — nothing is recorded.',
        bullet3: 'Fit your face in the frame, find good light, and be alone in the shot.',
        // These two are a prep checklist: every `face_occluded` /
        // `face_mismatch` discovered three frames into the camera step burns
        // an attempt (one of the 5 per hour).
        bullet4: 'Take off any mask, hat or sunglasses, and keep your hair off your face.',
        bullet5: 'Looking like your main photo makes the comparison easier.',
        privacyNote:
          "Verification shows your photos are really you; it is not an identity check. Apart from the badge, it gives you no priority in discovery.",
        startButton: 'Start verification',
        goToPhotos: 'Go to my photos',
        goToPrivacySettings: 'Go to privacy settings',
      },
      // Single source for the verification permission texts. The two rows in
      // Settings > Privacy render these (see SettingsScreen privacyRows); that
      // screen is where consent is given and withdrawn. The long form lives in
      // sections 4 and 5 of the disclosure text.
      consent: {
        BiometricVerification: {
          title: 'Processing your face data',
          note: 'The face data in the frames captured during verification is processed to compare them with your main photo. Under Turkish data protection law this is special-category personal data, and processing it requires your explicit consent.',
        },
        DataTransferAbroad: {
          title: 'Transfer abroad',
          note: 'The comparison runs on a server located abroad (in the United States), so your face data has to be transferred out of the country. That transfer requires your explicit consent.',
        },
      },
      camera: {
        // Screen-reader label for the dot indicator — never rendered as text
        // (see the dot row in SelfieCameraStep).
        stepCounter: '{{index}} / {{total}}',
        hint: 'Fit your face in the frame and be alone in the shot.',
        // Second line, chosen by movement kind (see selfieChallengeHintKey).
        // 🔴 "Don't overdo it" applies to POSE only: the backend's expression
        // check never returns `challenge_too_much`, so suggesting restraint there
        // would push users into `challenge_too_weak`.
        hintPose: "Make it clear but don't overdo it — a gentle movement is enough.",
        hintExpression: 'Make it clear enough for the camera to see.',
        // Review step copy (see SelfieCameraStep: capture → review → confirm).
        reviewHint: 'Is your face clear and the movement obvious? If not, retake it.',
        capture: 'Take photo',
        // The review pair: confirm on the LEFT, retake on the RIGHT.
        confirm: 'Confirm',
        retake: 'Retake',
        captureError: "We couldn't take the frame. Try again.",
        permissionMessage:
          'We need camera access so you can verify your photos.',
        grantPermission: 'Allow camera',
      },
      result: {
        successTitle: 'Your photos are verified!',
        successBody: 'The verification badge now shows on your profile.',
        failedAtStep: 'We got stuck on step {{step}}.',
        retry: 'Try again',
        close: 'Not now',
      },
      // Failure reasons. None of these are framed as errors — retrying is a
      // normal part of the flow (the request returns 200 + isSuccess:true).
      reason: {
        challenge_not_met: "We couldn't detect the movement. Let's try once more.",
        // 🔴 These three mirror the backend resx (SelfieFailure_*) word for word.
        // Design limit: they never leak the DIRECTION of the movement or the
        // NUMERIC threshold ("you turned left, not right", "20 more degrees" are
        // forbidden) — that would let an attacker calibrate by trial and error.
        // "A bit more pronounced" is safe: the user already knows the prompt.
        challenge_too_weak:
          'Almost there — could you make the movement a bit more pronounced?',
        challenge_wrong_move:
          "We didn't see the movement. Mind reading the prompt and trying again?",
        challenge_too_much: 'That was a bit much — a gentler movement is enough.',
        no_face: "We couldn't see your face. Make sure it's clear and well lit.",
        multiple_faces: 'There is more than one person in the frame. You need to be alone.',
        face_occluded: 'Your face looks covered. Remove a mask, hat or glasses and try again.',
        low_quality: 'The frame came out blurry. Try again somewhere brighter.',
        face_mismatch:
          "The frames didn't match your main photo. Try again; if it keeps happening, take another look at your main photo.",
        attempt_expired: 'Time ran out. Starting over.',
        // 🔴 OUR fault — never phrase this as something the user did wrong.
        analysis_failed:
          "Something went wrong on our end and we couldn't finish the check. Try again shortly.",
        // 🔴 NEVER reuse the `no_face` copy here. They point at different
        // places: `no_face` is about the frame you just captured, this one is
        // about your MAIN PHOTO. Same copy would send the user to fix the wrong
        // thing. That is also why `canRetry` is false — retrying without
        // changing the photo fails identically and burns an hourly attempt.
        reference_photo_no_face:
          "We can't see your face in your main photo. Set a photo where your face is clearly visible as your main photo, then try again.",
        fallback: "We couldn't finish the verification. Try again.",
      },
      reasonTitle: {
        challenge_not_met: "We couldn't detect the movement",
        // FE-only (the backend has no titles) — must keep the same tone as the
        // body, otherwise the pair contradicts itself.
        challenge_too_weak: 'Almost there',
        challenge_wrong_move: "We didn't see the movement",
        challenge_too_much: 'That was a bit much',
        no_face: "We couldn't see your face",
        multiple_faces: 'More than one person in the frame',
        face_occluded: 'Your face looks covered',
        low_quality: 'The frame is not clear enough',
        face_mismatch: "It didn't match your photo",
        attempt_expired: 'Time ran out',
        analysis_failed: 'Something went wrong on our end',
        reference_photo_no_face: "We can't see your face in your main photo",
        fallback: 'Verification not completed',
      },
      codes: {
        // Consent is collected during sign-up together with the disclosure
        // text; anyone landing here either left those boxes unticked or
        // withdrew the consent later. The text names the ONE place the
        // decision can be changed.
        'UT-6501Title': 'Photo verification consent required',
        'UT-6501':
          'We do not see your explicit consent for photo verification. You can give it — or withdraw it — under Settings > Privacy.',
        'UT-6502':
          'You need an approved main photo before verifying. Add your main photo first.',
        'UT-6502Title': 'You need a main photo first',
        'UT-6503': 'Your photos are already verified.',
        // ⚠️ The remaining time is deliberately withheld — do not show a countdown.
        'UT-6504': "You've tried too many times. Wait a bit and try again.",
        'UT-6505': 'Verification is not available right now.',
        'UT-6506': 'This verification session is no longer valid. You need to start over.',
        'UT-6507': "We couldn't finish the verification. Try again.",
      },
      errors: {
        generic: "We couldn't start the verification. Try again.",
      },
      // Changing the main photo DROPS the badge (security: otherwise "verify,
      // then swap in someone else's photo" would show their photo as verified).
      // Side photos are not affected.
      mainPhotoWarning: {
        title: 'Your verification badge will be removed',
        message:
          'If you change your main photo, the verification badge is removed and you will need to verify again. Continue?',
        confirm: 'Continue',
      },
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
      /**
       * Same row, but the profile is STILL in discovery — only that one photo is
       * held back. Saying "you're not in discovery" here would be plainly wrong.
       */
      reviewBodyVisible: "It'll show on your card once approved.",
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
        showOnlineStatus: "Show when I'm online",
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
      // Body line of the plan card on the plus page (see subscriptionCardNote).
      // Separate from the `*Description` copy above: these never repeat the
      // state WORD ('Active' / 'Trial' …) — the pill on the card's name row
      // says that. Keep them to two lines; PLAN_CARD_HEIGHT budgets for that.
      cardNoteActive: 'Every plus feature is unlocked on your account, and your subscription renews on its own at the end of each period.',
      cardNoteTrial: 'Every plus feature is unlocked during the trial. Cancel before it ends and you are not charged.',
      // When cancelled, the card's bottom line is replaced by the store button,
      // so this is the only place the date appears (see subscriptionCardNote).
      cardNoteCancelledDate: 'Everything stays unlocked until {{date}}, then plus turns off.',
      cardNoteCancelled: 'Everything stays unlocked until the period ends, then plus turns off.',
      cardNoteBillingIssue: "We couldn't take your last payment. Your access is still on for now, but your payment method needs updating.",
      cardNotePending: 'Your purchase went through. Features unlock as soon as the store confirmation reaches us.',
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
      // Hint under the cover photo, where the expand chevron used to be.
      // Lowercase on purpose: it is a quiet aside, not a button label.
      expandHint: 'swipe up to see details',
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
      // Sticky şeritteki cam butonun VoiceOver etiketi — buton yalnız ok
      // taşıyor, görünür bir adı yok.
      backToTop: 'Back to top',
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
    // Fired when the user's OWN purchase completes (as the paywall closes).
    // Separate from the admin copy above: the user did this themselves, so the
    // tone is a welcome rather than an announcement.
    purchasedTitle: 'Lit Plus is yours!',
    purchasedMessage: 'Every premium feature is unlocked. Enjoy!',
    // NOTE: the paywall feature list now lives under
    // `discover.premium.benefits` — one source shared with the upsell card.
    periods: {
      weeklyShort: 'Weekly',
      monthlyShort: 'Monthly',
      yearlyShort: 'Yearly',
      lifetimeShort: 'Lifetime',
      weeklyPer: 'week',
      monthlyPer: 'month',
      yearlyPer: 'year',
    },
    // Plan card description line. PURCHASABLE card only: for subscribers the
    // body is written by the subscription state (`profile.subscription.cardNote*`).
    // `/plans` returns no copy (displayName / highlight / sortOrder only), so
    // the wording lives here.
    planDesc: {
      weekly: 'Best for a short try — cancel any time.',
      monthly: 'Renews monthly, no long commitment.',
      yearly: 'Lowest weekly cost — pay once, stay Plus all year.',
    },
    // Red discount pill at the bottom-left of the card. The percentage is
    // computed outside i18n (computeSavings) against the weekly plan. Keep it
    // SHORT — it shares a strip with the action badge. (Was the full sentence
    // 'Save 20% vs. monthly.' on the card's description line.)
    discount: '{{percent}}% off',
    // Badge on the period strip: the plan that saves the most. The badge is
    // NARROW (it sits next to the label) — keep it to a word or two.
    bestValue: 'Best',
    errors: {
      packageNotFound: 'Package not found.',
      // Shown when the RevenueCat identity is still anonymous/foreign, in which
      // case the purchase is never started (see isPurchaseIdentityReady). No
      // technical detail — just the one fix that works: restart, which re-runs
      // the identity repair. The consumable sheet reuses these two keys, hence
      // no product name in the copy.
      identityTitle: 'Purchase could not start',
      identityMessage: 'We could not match your account with the store. Please close and reopen the app, then try again.',
      purchaseTitle: 'Purchase Error',
      operationFailed: 'Operation could not be completed.',
      restoreNotFoundTitle: 'Not Found',
      restoreNoSubscription: 'No active subscription found.',
      restoreFailed: 'Restore failed.',
    },
    cta: {
      freeTrial: 'Try Free for {{days}} Days',
      freeTrialBadge: 'First {{days}} days free',
      // Action badge at the bottom-right of the plan card. Keep it SHORT — the
      // card already states price and period; the badge only says what the tap
      // does. (Was 'Subscribe for {{price}}/{{period}}' on the big CTA below,
      // which has since been removed.)
      subscribe: 'Subscribe',
      restore: 'Restore Purchases',
      trialDisclaimer: 'Try free for {{days}} days, then {{price}}/{{period}}, renewed automatically.',
      appStoreDisclaimer: 'Lit Plus subscription is automatically renewed through the App Store. Your account will be charged from your App Store account after purchase confirmation.',
    },
  },
  superLikePurchase: {
    title: 'Buy Superlikes',
    description:
      'Super likes get 3x more matches. They see your card unblurred at the top of their likes — even on a free account. Super likes never expire, so use them whenever you want.',
    packLabel: '{{count}}x Superlike',
    cta: 'Buy',
    ctaWithPrice: 'Buy · {{price}}',
    unavailableMessage: "Packs couldn't be loaded right now. Check your connection and try again in a moment.",
    successTitle: 'Your Superlikes are ready',
    successMessage: '{{count}} Superlikes were added to your account.',
    syncedTitle: 'Your balance is up to date',
    syncedMessage: 'This purchase had already been credited to your account.',
    pendingTitle: 'Purchase received',
    pendingMessage: 'Your Superlikes will show up in your balance within a few minutes.',
    errorTitle: "Purchase couldn't be completed",
    disclaimer: 'Super likes are added to your account instantly upon purchase and never expire. Payments are charged to your App Store account. Purchases are non-refundable.',
  },
  // `recoveryPurchase` REMOVED (2026-08-31): the recovery packs were deleted
  // and recovery became a Premium perk. The offer for free users is Lit Plus.
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
    // Note box on the like card, when it runs past three lines (see LikesScreen).
    seeMore: 'See more',
    seeLess: 'See less',
    // Grey header of the note box — from the RECEIVER's side, past tense
    // (`replyingToPhoto` is the sender-side counterpart in the composer).
    // No "this": the target's preview sits right next to the line, so the
    // demonstrative read as pointing at something that wasn't there.
    leftNoteOnPhoto: 'Left a note on your photo',
    leftNoteOnPrompt: 'Left a note on your answer',
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
    title: 'Buy Notes',
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
    // Backend moderation error codes (UT-68xx). UT-6804 reuses
    // `report.alreadyReported` — same sentence, one source.
    // UT-6805 (empty user id) is deliberately absent: client bug, generic text.
    codes: {
      'UT-6801': "You can't block your own account.",
      'UT-6802': "You can't report your own account.",
      'UT-6803': "We couldn't find that user.",
    },
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
    // The menu behind the three dots on a like card's header strip (see
    // ProfileOptionsSheet). Separate from chat.options.*: there a match exists
    // and the "Unmatch / Restore" rows fill that section; here there is no
    // match yet, so only the safety actions remain.
    options: {
      title: 'Profile Options',
      sectionSafety: 'Safety',
      sectionSafetyDescription:
        "Reporting and blocking are permanent: this person won't show up again and you will never match.",
      report: 'Report',
      block: 'Block User',
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
