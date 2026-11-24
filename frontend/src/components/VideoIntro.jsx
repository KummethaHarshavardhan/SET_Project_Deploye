import { useEffect, useRef, useState } from "react";
import { FaPlay } from "react-icons/fa";
import "../styles/animeIntro.css";

const INTRO_VIDEO_SRC = "/assets/smart-expense-intro.mp4";

function VideoIntro({ onComplete }) {
  const videoRef = useRef(null);
  const [fadingOut, setFadingOut] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  const finishIntro = () => {
    setFadingOut(true);
    sessionStorage.setItem("set_video_intro_seen", "true");
    setTimeout(() => {
      onComplete();
    }, 450);
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        setAutoplayBlocked(true);
      });
    }
  }, []);

  const handleManualPlay = () => {
    const video = videoRef.current;
    if (!video) return;
    setAutoplayBlocked(false);
    video.play().catch(() => {
      finishIntro();
    });
  };

  return (
    <div
      className={`video-intro-overlay ${fadingOut ? "fading-out" : ""}`}
      role="region"
      aria-label="Smart Expense Tracker Intro Video"
    >
      <video
        ref={videoRef}
        className="video-intro-element"
        src={INTRO_VIDEO_SRC}
        autoPlay
        muted
        playsInline
        preload="auto"
        onEnded={finishIntro}
        onError={finishIntro}
      />

      {autoplayBlocked && (
        <button
          type="button"
          className="video-intro-play-btn"
          onClick={handleManualPlay}
        >
          <FaPlay />
          <span>Play Intro</span>
        </button>
      )}

      <button type="button" className="anime-skip-btn" onClick={finishIntro}>
        Skip Intro →
      </button>
    </div>
  );
}

export default VideoIntro;
