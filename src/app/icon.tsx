import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/**
 * Temporary generated favicon (a "J" monogram) standing in for the real
 * Junto Select logo mark, which could not be retrieved as a file in this
 * environment. Replace with the real mark once supplied — see ASSETS.md.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#ad918e",
          borderRadius: 6,
          color: "#fdfbfa",
          fontSize: 20,
          fontWeight: 400,
        }}
      >
        J
      </div>
    ),
    { ...size },
  );
}
