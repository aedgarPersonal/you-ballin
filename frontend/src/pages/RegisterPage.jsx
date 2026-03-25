/**
 * Registration Page
 * =================
 * New player registration form.
 */

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { registerUser } from "../api/auth";
import useAuthStore from "../stores/authStore";
import AvatarPicker, { AvatarBadge } from "../components/AvatarPicker";
import { getPlayerById, getRandomPlayerId } from "../data/legacyPlayers";

export default function RegisterPage() {
  const [form, setForm] = useState({
    email: "",
    username: "",
    password: "",
    confirmPassword: "",
    full_name: "",
    phone: "",
  });
  const [avatarId, setAvatarId] = useState("bensimmons");
  const [showAvatarPicker, setShowAvatarPicker] = useState(false);
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const navigate = useNavigate();

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      toast.error("Passwords don't match");
      return;
    }
    setLoading(true);
    try {
      const { data } = await registerUser({
        email: form.email,
        username: form.username,
        password: form.password,
        full_name: form.full_name,
        phone: form.phone || null,
        avatar_url: avatarId || null,
      });
      login(data.access_token, data.user);
      toast.success("Registration submitted! An admin will review your request.");
      navigate("/");
    } catch (err) {
      toast.error(err.response?.data?.detail || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-court-50 to-orange-100 dark:from-gray-900 dark:to-gray-800 px-4 py-8">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img src="/logo.png" alt="You Ballin" className="h-24 mx-auto rounded-lg" />
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mt-4">Join the Game</h1>
          <p className="text-gray-600 dark:text-gray-400 mt-2">Register for pickup basketball</p>
        </div>

        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Avatar Picker */}
            <div className="text-center">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Choose Your Legend</label>
              <button
                type="button"
                onClick={() => setShowAvatarPicker(true)}
                className="mx-auto block"
              >
                {avatarId ? (
                  <div className="flex flex-col items-center">
                    <AvatarBadge avatarId={avatarId} size="lg" />
                    <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">{getPlayerById(avatarId)?.name}</span>
                    <span className="text-xs text-court-600 mt-0.5">Click to change</span>
                  </div>
                ) : (
                  <div className="w-20 h-20 mx-auto rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:border-court-400 hover:text-court-500 transition-colors">
                    <span className="text-sm text-center leading-tight">Pick a<br/>legend</span>
                  </div>
                )}
              </button>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Full Name</label>
              <input name="full_name" value={form.full_name} onChange={handleChange} className="input" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Username</label>
              <input name="username" value={form.username} onChange={handleChange} className="input" required minLength={3} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Email</label>
              <input name="email" type="email" value={form.email} onChange={handleChange} className="input" required />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Phone (optional)</label>
              <input name="phone" type="tel" value={form.phone} onChange={handleChange} className="input" placeholder="For SMS notifications" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Password</label>
              <input name="password" type="password" value={form.password} onChange={handleChange} className="input" required minLength={8} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Confirm Password</label>
              <input name="confirmPassword" type="password" value={form.confirmPassword} onChange={handleChange} className="input" required />
            </div>
            <button type="submit" disabled={loading} className="btn-primary w-full">
              {loading ? "Registering..." : "Register"}
            </button>
          </form>

          <p className="text-xs text-gray-500 dark:text-gray-400 text-center mt-4">
            Your registration will be reviewed by an admin before you can join games.
          </p>

          <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-4">
            Already have an account?{" "}
            <Link to="/login" className="text-court-600 hover:text-court-700 font-medium">Sign In</Link>
          </p>
        </div>

        {showAvatarPicker && (
          <AvatarPicker
            value={avatarId}
            onChange={setAvatarId}
            onClose={() => setShowAvatarPicker(false)}
          />
        )}
      </div>
    </div>
  );
}
