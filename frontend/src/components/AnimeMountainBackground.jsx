import "../styles/login.css";

function AnimeMountainBackground() {
  return (
    <div className="anime-bg" aria-hidden="true">
      {/* Night Sky & Moonlight */}
      <div className="anime-sky" />
      <div className="anime-moon" />
      <div className="anime-stars" />

      {/* Subtle Drifting Clouds */}
      <div className="anime-cloud anime-cloud-1" />
      <div className="anime-cloud anime-cloud-2" />

      {/* Layered Anime-Inspired Blue & Purple Mountains + Forest + Mountain House */}
      <svg
        className="anime-mountains-svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="xMidYMax slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="mtFar" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#3b2d7a" stopOpacity="0.85" />
            <stop offset="100%" stopColor="#161b4d" stopOpacity="0.95" />
          </linearGradient>
          <linearGradient id="mtMid" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#26286e" stopOpacity="0.92" />
            <stop offset="100%" stopColor="#0e163d" stopOpacity="0.98" />
          </linearGradient>
          <linearGradient id="mtNear" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#16214e" />
            <stop offset="100%" stopColor="#070d24" />
          </linearGradient>
          <linearGradient id="mistGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0" />
            <stop offset="50%" stopColor="#6366f1" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.45" />
          </linearGradient>
        </defs>

        {/* Far Purple Mountain Range */}
        <path
          d="M0,620 L180,430 L340,540 L560,360 L780,520 L980,380 L1210,510 L1440,390 L1440,900 L0,900 Z"
          fill="url(#mtFar)"
        />

        {/* Atmospheric Mist */}
        <rect x="0" y="450" width="1440" height="220" fill="url(#mistGrad)" />

        {/* Mid Royal-Blue Mountain Range */}
        <path
          d="M0,690 L140,560 L310,640 L490,480 L690,620 L890,490 L1120,630 L1320,510 L1440,580 L1440,900 L0,900 Z"
          fill="url(#mtMid)"
        />

        {/* Near Dark Navy Ridge */}
        <path
          d="M0,760 Q240,680 480,740 T960,730 T1440,760 L1440,900 L0,900 Z"
          fill="url(#mtNear)"
        />

        {/* Small Forest Pine Silhouettes (Left & Right) */}
        <g fill="#080f29">
          <polygon points="90,745 108,685 126,745" />
          <polygon points="122,748 144,672 166,748" />
          <polygon points="158,750 175,695 192,750" />
          <polygon points="210,752 225,705 240,752" />
          <polygon points="1210,752 1228,690 1246,752" />
          <polygon points="1245,748 1268,668 1291,748" />
          <polygon points="1285,750 1304,688 1323,750" />
          <polygon points="1330,755 1346,705 1362,755" />
        </g>

        {/* Cozy Illuminated Mountain House on Ridge */}
        <g transform="translate(1045, 672)">
          {/* Warm glow behind house */}
          <ellipse cx="42" cy="44" rx="54" ry="26" fill="#6366f1" opacity="0.22" />
          {/* House body */}
          <rect x="14" y="28" width="56" height="36" rx="2" fill="#0f172a" stroke="#3b82f6" strokeWidth="1" strokeOpacity="0.4" />
          {/* Pitched anime roof */}
          <polygon points="4,30 42,4 80,30" fill="#1e1b4b" stroke="#818cf8" strokeWidth="1.2" strokeOpacity="0.6" />
          {/* Chimney */}
          <rect x="56" y="10" width="8" height="14" fill="#1e1b4b" />
          {/* Warm Glowing Windows */}
          <rect x="24" y="38" width="12" height="12" rx="2" fill="#fbbf24" opacity="0.92" />
          <rect x="48" y="38" width="12" height="12" rx="2" fill="#fbbf24" opacity="0.88" />
          {/* Door */}
          <rect x="37" y="48" width="10" height="16" rx="1" fill="#312e81" />
        </g>
      </svg>

      {/* Subtle Floating Fireflies / Particles */}
      <div className="anime-particles">
        {Array.from({ length: 16 }).map((_, i) => (
          <span key={i} className={`anime-particle p-${(i % 4) + 1}`} />
        ))}
      </div>

      <div className="anime-bg-vignette" />
    </div>
  );
}

export default AnimeMountainBackground;
