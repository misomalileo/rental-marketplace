const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;
const User = require("../models/User");

passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "/api/auth/google/callback"
  },
  async (accessToken, refreshToken, profile, done) => {
    try {
      let user = await User.findOne({ googleId: profile.id });
      if (!user) {
        const email = profile.emails[0].value;
        user = await User.findOne({ email });
        if (user) {
          // Existing user with same email – link Google account and mark email as verified
          user.googleId = profile.id;
          user.authProvider = "google";
          user.isEmailVerified = true;        // ← CRITICAL FIX
          user.emailVerificationToken = undefined; // remove any pending token
          await user.save();
        } else {
          // New user – create with email already verified by Google
          user = new User({
            name: profile.displayName,
            email: email,
            googleId: profile.id,
            authProvider: "google",
            isEmailVerified: true,             // ← CRITICAL FIX
            verified: false,
            phone: "",
            role: "free"                       // default role, can be upgraded later
          });
          await user.save();
        }
      } else {
        // User already exists with Google ID – ensure email is marked verified (safety)
        if (!user.isEmailVerified) {
          user.isEmailVerified = true;
          user.emailVerificationToken = undefined;
          await user.save();
        }
      }
      return done(null, user);
    } catch (err) {
      return done(err, null);
    }
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (err) {
    done(err, null);
  }
});