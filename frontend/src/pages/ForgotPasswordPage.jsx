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
    <div className="min-h-screen flex items-center justify-center px-4 relative bg-gradient-to-br from-gray-900 via-gray-800 to-court-900">
      {/* Decorative background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-court-500/10 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-court-600/10 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <Logo size="lg" className="[&_span]:text-white [&_span]:from-court-300 [&_span]:via-court-400 [&_span]:to-court-500" />
          <p className="text-gray-400 mt-3">Reset your password</p>
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
