// Typed route params for the native stack. `OtpEntry` needs the phone the user
// entered on the previous screen so it can call /auth/otp/verify with it.
export type AuthStackParamList = {
  PhoneEntry: undefined;
  OtpEntry: { phone: string };
};

// Onboarding order after sign-in: ProfileSetup → PhotoUpload → Home. The entry
// point is chosen from GET /profile/me — no profile (404) starts on ProfileSetup;
// a profile with no photos starts on PhotoUpload (a photoless profile can't be
// shown in discovery); an existing profile with photos goes straight to Home.
export type AppStackParamList = {
  ProfileSetup: undefined;
  PhotoUpload: undefined;
  Home: undefined;
};
