import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Junto Select — Encuentros privados para solteros en Madrid";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          background: "#fdfbfa",
        }}
      >
        <div
          style={{
            fontSize: 20,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: "#6b6360",
            marginBottom: 28,
          }}
        >
          Elegant encounters in Madrid
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 76,
            fontWeight: 300,
            letterSpacing: 10,
            textTransform: "uppercase",
            color: "#262220",
          }}
        >
          Junto
          <span style={{ color: "#9b7f7a", marginLeft: 24 }}>Select</span>
        </div>
        <div style={{ width: 64, height: 2, background: "#ad918e", marginTop: 36 }} />
        <div
          style={{
            fontSize: 24,
            fontStyle: "italic",
            color: "#6b6360",
            marginTop: 36,
          }}
        >
          Encuentros con estilo en Madrid
        </div>
      </div>
    ),
    { ...size },
  );
}
