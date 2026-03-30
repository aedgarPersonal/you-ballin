/**
 * Forgot Password Page
 * ====================
 * Allows users to request a password reset link via email.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { forgotPassword } from "../api/auth";
import Logo from "../components/layout/Logo";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await forgotPassword(email);
    } catch {
      // Show success regardless to prevent email enumeration
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 relative bg-gradient-to-br from-gray-950 via-arcade-900 to-gray-900">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)" }} />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-court-500/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-arcade-500/8 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8">
          <Logo size="lg" />
        </div>

        <div className="rounded-xl bg-gradient-to-b from-court-400 to-court-600 p-[2px]">
          <div className="rounded-[10px] bg-gray-900/95 backdrop-blur-md p-6">
            {sent ? (
              <div className="text-center space-y-4">
                <div className="text-green-400 text-4xl mb-2">&#10003;</div>
                <p className="text-gray-300 text-sm">
                  If that email is registered, you'll receive a reset link shortly.
                </p>
                <Link to="/login" className="inline-block text-court-400 hover:text-court-300 font-medium text-sm">
                  Back to Login
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <p className="text-sm text-gray-400 mb-2">
                  Enter your email and we'll send you a reset link.
                </p>
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">Email</label>
                  <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                    className="input bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500"
                    placeholder="you@example.com" required />
                </div>
                <button type="submit" disabled={loading} className="btn-primary w-full">
                  {loading ? "Sending..." : "SEND RESET LINK"}
                </button>
                <p className="text-center text-sm text-gray-500 mt-4">
                  <Link to="/login" className="text-court-400 hover:text-court-300 font-medium">Back to Login</Link>
                </p>
              </form>
            )}
          </div>
        </div>
        <p className="text-center font-retro text-[6px] text-gray-600 mt-6 tracking-wider">&copy; 1987 DOUBLE DRIBBLE</p>
      </div>
    </div>
  );
}
