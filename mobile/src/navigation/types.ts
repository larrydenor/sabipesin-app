// Typed route params for the native stack. `OtpEntry` needs the phone the user
// entered on the previous screen so it can call /auth/otp/verify with it.
export type AuthStackParamList = {
  PhoneEntry: undefined;
  OtpEntry: { phone: string };
};

// ProfileSetup is shown after sign-in when the user has no profile yet (a 404
// from GET /profile/me). Once a profile exists, the app stack starts on Home.
export type AppStackParamList = {
  ProfileSetup: undefined;
  Home: undefined;
};
