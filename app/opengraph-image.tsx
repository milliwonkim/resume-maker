import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = '이력서 빌더 — AI로 완성하는 나만의 이력서';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OGImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        justifyContent: 'flex-end',
        padding: '72px 80px',
        background: '#0a0a0f',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Gradient orb top-right */}
      <div
        style={{
          position: 'absolute',
          top: -120,
          right: -80,
          width: 600,
          height: 600,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(99,102,241,0.35) 0%, rgba(99,102,241,0.08) 55%, transparent 75%)',
        }}
      />
      {/* Subtle grid */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)',
          backgroundSize: '60px 60px',
        }}
      />

      {/* Logo mark */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          marginBottom: 48,
        }}
      >
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 14,
            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 16,
            fontSize: 26,
            fontWeight: 700,
            color: '#fff',
          }}
        >
          R
        </div>
        <span
          style={{
            fontSize: 22,
            fontWeight: 600,
            color: 'rgba(255,255,255,0.5)',
            letterSpacing: '0.05em',
            textTransform: 'uppercase',
          }}
        >
          ResumeAI
        </span>
      </div>

      {/* Headline */}
      <div
        style={{
          fontSize: 68,
          fontWeight: 800,
          lineHeight: 1.05,
          color: '#ffffff',
          letterSpacing: '-0.03em',
          marginBottom: 24,
          maxWidth: 800,
        }}
      >
        AI로 완성하는
        <br />
        <span
          style={{
            background: 'linear-gradient(90deg, #818cf8 0%, #c084fc 100%)',
            backgroundClip: 'text',
            color: 'transparent',
          }}
        >
          나만의 이력서
        </span>
      </div>

      {/* Subtext */}
      <p
        style={{
          fontSize: 22,
          color: 'rgba(255,255,255,0.45)',
          fontWeight: 400,
          margin: 0,
          letterSpacing: '0.01em',
        }}
      >
        경력 · 기술 · 프로젝트를 한 곳에서 — 완성까지 5분
      </p>
    </div>,
    { ...size }
  );
}
