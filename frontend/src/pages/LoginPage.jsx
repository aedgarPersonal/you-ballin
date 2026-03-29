/**
 * Login Page
 * ==========
 * Supports email/password, magic link, and Google OAuth.
 * Retro arcade "Press Start" themed.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { loginUser, requestMagicLink } from "../api/auth";
import useAuthStore from "../stores/authStore";
import Logo from "../components/layout/Logo";
import { playCoinInsert, playError } from "../utils/retroSounds";

export default function LoginPage() {
  const [tab, setTab] = useState("password"); // password | magic
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handlePasswordLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await loginUser({ email, password });
      login(data.access_token, data.user);
      playCoinInsert();
      toast.success("Welcome back!");
      navigate("/");
    } catch (err) {
      playError();
      toast.error(err.response?.data?.detail || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  const handleMagicLink = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await requestMagicLink(email);
      playCoinInsert();
      toast.success("Check your email for a login link!");
    } catch (err) {
      playError();
      toast.error("Failed to send magic link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative bg-gradient-to-br from-gray-950 via-arcade-900 to-gray-900">
      {/* Scanline overlay */}
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{
          backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)",
        }}
      />

      {/* Decorative background glow */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-court-500/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-arcade-500/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <Logo size="lg" className="[&_span]:text-white [&_span]:from-court-300 [&_span]:via-court-400 [&_span]:to-arcade-400" />
          <p className="font-retro text-[8px] text-arcade-400 mt-4 animate-pulse tracking-wider">
            PRESS START
          </p>
        </div>

        {/* Card */}
        <div className="card bg-gray-900/90 dark:bg-gray-900/90 backdrop-blur-md border-arcade-800/50">
          {/* Tabs */}
          <div className="flex border-b border-gray-700 mb-6">
            <button
              onClick={() => setTab("password")}
              className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "password"
                  ? "border-court-500 text-court-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              Email & Password
            </button>
            <button
              onClick={() => setTab("magic")}
              className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "magic"
                  ? "border-court-500 text-court-400"
                  : "border-transparent text-gray-500 hover:text-gray-300"
              }`}
            >
              Magic Link
            </button>
          </div>

          {/* Email/Password Form */}
          {tab === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500"
                  required
                />
              </div>
              <div className="flex justify-end">
                <Link to="/forgot-password" className="text-sm text-arcade-400 hover:text-arcade-300">
                  Forgot Password?
                </Link>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Loading..." : "INSERT COIN"}
              </button>
            </form>
          )}

          {/* Magic Link Form */}
          {tab === "magic" && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500"
                  placeholder="Enter your email for a login link"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending..." : "SEND MAGIC LINK"}
              </button>
              <p className="text-xs text-gray-500 text-center">
                We'll email you a one-time login link. No password needed!
              </p>
            </form>
          )}

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-700"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-gray-900 text-gray-500">or</span>
            </div>
          </div>

          {/* Google Sign In */}
          <button className="w-full flex items-center justify-center gap-3 border border-gray-600 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-300 hover:bg-gray-800 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Register link */}
          <p className="text-center text-sm text-gray-500 mt-6">
            New player?{" "}
            <Link to="/register" className="text-court-400 hover:text-court-300 font-medium">
              Join the Game
            </Link>
          </p>
        </div>

        {/* Retro footer */}
        <p className="text-center font-retro text-[6px] text-gray-600 mt-6 tracking-wider">
          &copy; 1987 DOUBLE DRIBBLE
        </p>
      </div>
    </div>
  );
}
