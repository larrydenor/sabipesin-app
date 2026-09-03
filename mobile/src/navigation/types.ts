// Typed route params for the native stack. `OtpEntry` needs the phone the user
// entered on the previous screen so it can call /auth/otp/verify with it.
export type AuthStackParamList = {
  PhoneEntry: undefined;
  OtpEntry: { phone: string };
};

export type AppStackParamList = {
  Home: undefined;
};
