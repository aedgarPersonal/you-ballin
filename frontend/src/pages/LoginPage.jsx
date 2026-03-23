/**
 * Login Page
 * ==========
 * Supports email/password, magic link, and Google OAuth.
 *
 * TEACHING NOTE:
 *   This page demonstrates three authentication strategies in one UI.
 *   The active tab determines which form is shown. All three methods
 *   ultimately call authStore.login() with the token and user data.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { loginUser, requestMagicLink } from "../api/auth";
import useAuthStore from "../stores/authStore";

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
      toast.success("Welcome back!");
      navigate("/");
    } catch (err) {
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
      toast.success("Check your email for a login link!");
    } catch (err) {
      toast.error("Failed to send magic link");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-court-50 to-orange-100 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <span className="text-6xl">🏀</span>
          <h1 className="text-3xl font-bold text-gray-900 mt-4">You Ballin</h1>
          <p className="text-gray-600 mt-2">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="card">
          {/* Tabs */}
          <div className="flex border-b border-gray-200 mb-6">
            <button
              onClick={() => setTab("password")}
              className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "password"
                  ? "border-court-500 text-court-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Email & Password
            </button>
            <button
              onClick={() => setTab("magic")}
              className={`flex-1 pb-3 text-sm font-medium border-b-2 transition-colors ${
                tab === "magic"
                  ? "border-court-500 text-court-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              Magic Link
            </button>
          </div>

          {/* Email/Password Form */}
          {tab === "password" && (
            <form onSubmit={handlePasswordLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          {/* Magic Link Form */}
          {tab === "magic" && (
            <form onSubmit={handleMagicLink} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="Enter your email for a login link"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending..." : "Send Magic Link"}
              </button>
              <p className="text-xs text-gray-500 text-center">
                We'll email you a one-time login link. No password needed!
              </p>
            </form>
          )}

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200"></div>
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          {/* Google Sign In */}
          <button className="w-full flex items-center justify-center gap-3 border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Continue with Google
          </button>

          {/* Register link */}
          <p className="text-center text-sm text-gray-600 mt-6">
            Don't have an account?{" "}
            <Link to="/register" className="text-court-600 hover:text-court-700 font-medium">
              Register
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
