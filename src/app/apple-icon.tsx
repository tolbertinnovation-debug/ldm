import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#1d5531" }}>
        <svg width="150" height="150" viewBox="0 0 40 40">
          <path d="M20 30V18" stroke="#fdd68a" strokeWidth="2.6" strokeLinecap="round" />
          <path d="M20 21c0-5 3.5-8.5 9-8.5 0 5.2-3.6 8.5-9 8.5Z" fill="#7dbd90" />
          <path d="M20 24c0-4.4-3-7.4-7.8-7.4 0 4.5 3.1 7.4 7.8 7.4Z" fill="#aed8b9" />
          <path d="M9 31.5c3.6-1.6 7.2-2.4 11-2.4s7.4.8 11 2.4" stroke="#f9a224" strokeWidth="2.4" strokeLinecap="round" fill="none" />
        </svg>
      </div>
    ),
    size,
  );
}
