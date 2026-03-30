/**
 * Reset Password Page
 * ===================
 * Allows users to set a new password using a token from a reset link.
 */

import { useState } from "react";
import { Link, useSearchParams, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { resetPassword } from "../api/auth";
import Logo from "../components/layout/Logo";

export default function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      await resetPassword(token, newPassword);
      setSuccess(true);
      toast.success("Password reset successfully!");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.detail || "Invalid or expired reset link.");
    } finally {
      setLoading(false);
    }
  };

  const shell = (children) => (
    <div className="min-h-screen flex items-center justify-center px-4 relative bg-gradient-to-br from-gray-950 via-arcade-900 to-gray-900">
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.3) 2px, rgba(0,0,0,0.3) 4px)" }} />
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-court-500/8 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-arcade-500/8 rounded-full blur-3xl" />
      </div>
      <div className="w-full max-w-md relative z-10">
        <div className="flex flex-col items-center mb-8"><Logo size="lg" /></div>
        <div className="rounded-xl bg-gradient-to-b from-court-400 to-court-600 p-[2px]">
          <div className="rounded-[10px] bg-gray-900/95 backdrop-blur-md p-6">{children}</div>
        </div>
        <p className="text-center font-retro text-[6px] text-gray-600 mt-6 tracking-wider">&copy; 1987 DOUBLE DRIBBLE</p>
      </div>
    </div>
  );

  if (!token) {
    return shell(
      <div className="text-center">
        <p className="text-red-400 mb-4">Invalid reset link. No token provided.</p>
        <Link to="/forgot-password" className="text-court-400 hover:text-court-300 font-medium text-sm">
          Request a new reset link
        </Link>
      </div>
    );
  }

  return shell(
    success ? (
      <div className="text-center space-y-4">
        <div className="text-green-400 text-4xl mb-2">&#10003;</div>
        <p className="text-gray-300 text-sm">Your password has been reset. Redirecting to login...</p>
      </div>
    ) : (
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-900/30 border border-red-800 rounded-lg p-3 text-sm text-red-400">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">New Password</label>
          <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)}
            className="input bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500"
            placeholder="At least 8 characters" required minLength={8} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-300 mb-1">Confirm Password</label>
          <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
            className="input bg-gray-800 border-gray-600 text-gray-100 placeholder-gray-500"
            placeholder="Re-enter your password" required minLength={8} />
        </div>
        <button type="submit" disabled={loading} className="btn-primary w-full">
          {loading ? "Resetting..." : "RESET PASSWORD"}
        </button>
        <p className="text-center text-sm text-gray-500 mt-4">
          <Link to="/login" className="text-court-400 hover:text-court-300 font-medium">Back to Login</Link>
        </p>
      </form>
    )
  );
}
