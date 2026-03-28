/**
 * Forgot Password Page
 * ====================
 * Allows users to request a password reset link via email.
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import { forgotPassword } from "../api/auth";

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
    <div
      className="min-h-screen flex items-center justify-center px-4 relative"
      style={{
        backgroundImage: "url(/logo.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
      }}
    >
      {/* Dark overlay for readability */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mt-4 drop-shadow-lg">You Ballin</h1>
          <p className="text-gray-200 mt-2 drop-shadow">Reset your password</p>
        </div>

        {/* Card */}
        <div className="card bg-white/95 dark:bg-gray-800/95 backdrop-blur-md">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="text-green-500 text-4xl mb-2">&#10003;</div>
              <p className="text-gray-700 dark:text-gray-300">
                If that email is registered, you'll receive a reset link shortly.
              </p>
              <Link
                to="/login"
                className="inline-block text-court-600 hover:text-court-700 font-medium text-sm"
              >
                Back to Login
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Enter your email address and we'll send you a link to reset your password.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="you@example.com"
                  required
                />
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending..." : "Send Reset Link"}
              </button>
              <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
                <Link to="/login" className="text-court-600 hover:text-court-700 font-medium">
                  Back to Login
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
