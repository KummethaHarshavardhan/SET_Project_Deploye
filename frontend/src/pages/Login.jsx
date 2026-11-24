import { useState, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  FaEnvelope,
  FaLock,
  FaEye,
  FaEyeSlash,
  FaWallet,
  FaPlay,
} from "react-icons/fa";
import { loginUser } from "../services/authService";
import { useToast } from "../context/ToastContext";
import AnimeMountainBackground from "../components/AnimeMountainBackground";
import VideoIntro from "../components/VideoIntro";
import "../styles/login.css";

function Login() {
  const navigate = useNavigate();
  const toast = useToast();

  const [showIntro, setShowIntro] = useState(() => {
    return !sessionStorage.getItem("set_video_intro_seen");
  });

  const [formData, setFormData] = useState(() => ({
    email: localStorage.getItem("set_remembered_email") || "",
    password: "",
  }));

  const [rememberMe, setRememberMe] = useState(
    () => Boolean(localStorage.getItem("set_remembered_email"))
  );
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleIntroComplete = useCallback(() => {
    setShowIntro(false);
  }, []);

  const handleReplayIntro = () => {
    sessionStorage.removeItem("set_video_intro_seen");
    setShowIntro(true);
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    if (error) setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);
      await loginUser(formData);
      if (rememberMe) {
        localStorage.setItem("set_remembered_email", formData.email);
      } else {
        localStorage.removeItem("set_remembered_email");
      }
      toast.success("Welcome back! Logged in successfully.");
      navigate("/dashboard");
    } catch (err) {
      const message =
        err?.response?.data?.message ||
        err?.message ||
        (typeof err === "string" ? err : "") ||
        "Invalid email or password";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">
      {showIntro && <VideoIntro onComplete={handleIntroComplete} />}

      <AnimeMountainBackground />

      <div className="auth-glass-card">
        <div className="auth-brand-header">
          <span className="auth-brand-icon">
            <FaWallet />
          </span>
          <span className="auth-brand-name">Smart Expense Tracker</span>
        </div>

        <h2>Welcome Back</h2>
        <p className="auth-subtitle">
          Sign in to continue tracking your finances with AI.
        </p>

        {error && <p className="error-text">{error}</p>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <label>Email Address</label>
            <div className="input-box">
              <FaEnvelope className="input-icon" />
              <input
                type="email"
                name="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                autoComplete="email"
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label>Password</label>
            <div className="input-box">
              <FaLock className="input-icon" />
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                autoComplete="current-password"
                required
              />
              <span
                className="password-toggle"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </span>
            </div>
          </div>

          <div className="auth-options-row">
            <label className="remember-label">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
              />
              <span>Remember Me</span>
            </label>

            <Link to="/forgot-password" className="forgot-link">
              Forgot Password?
            </Link>
          </div>

          <button className="btn" disabled={loading}>
            {loading ? (
              <span className="btn-spinner-wrap">
                <span className="btn-spinner" />
                Logging in...
              </span>
            ) : (
              "Login"
            )}
          </button>
        </form>

        <p className="auth-link">
          Don't have an account? <Link to="/register">Create Account</Link>
        </p>

        <button
          type="button"
          className="replay-intro-btn"
          onClick={handleReplayIntro}
        >
          <FaPlay />
          <span>Replay Intro</span>
        </button>
      </div>
    </div>
  );
}

export default Login;
