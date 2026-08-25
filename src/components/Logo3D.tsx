import { lazy, Suspense } from "react";
import type { Logo3DProps } from "./Logo3DCanvas";

// The three.js implementation (~600 KB) is loaded on demand instead of being
// bundled into the shared chunk every page pulled in. Logo3D renders on nearly
// every screen (sidebar, protected-route loader, login/signup hero), so
// deferring three.js until after first paint — behind a static, color-matched
// fallback that holds the exact same footprint — cuts the initial download
// substantially with no visual regression beyond a brief pop-in.
//
// `import type` above is erased at build time, so importing the props type here
// does NOT pull three.js into this wrapper's chunk.
const Logo3DCanvas = lazy(() =>
  import("./Logo3DCanvas").then((m) => ({ default: m.Logo3DCanvas }))
);

const ASPECT = 420 / 340;

/** Static, dependency-free stand-in shown while the 3D chunk loads. Matches the
 *  3D shield's cyan palette and footprint so the swap-in is seamless. */
function LogoFallback({ size = 160, showWordmark = false, taglineColor, wordmarkFontSize, className }: Logo3DProps) {
  const wordmarkSize = wordmarkFontSize ?? Math.round(size * 0.1);
  return (
    <div className={["logo3d", className].filter(Boolean).join(" ")}>
      <div className="logo3d__stage" style={{ width: Math.round(size * ASPECT), height: size }} aria-hidden="true">
        <svg height={Math.round(size * 0.94)} viewBox="0 0 168 190" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M84 6 154 34 154 96 C154 140 122 172 84 184 C46 172 14 140 14 96 L14 34 Z" fill="#0a63e8" />
          <path d="M84 16 145 40 145 95 C145 133 117 161 84 172 C51 161 23 133 23 95 L23 40 Z" fill="#00c2e0" />
          <path d="M60 96 L78 114 L112 74" stroke="#ff5a3c" strokeWidth="11" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </svg>
      </div>
      {showWordmark && (
        <>
          <div className="logo3d__wordmark" style={{ fontSize: wordmarkSize }}>
            <span className="lg-lingua">Lingua</span>
            <span className="lg-guard">Guard</span>
          </div>
          <div className="logo3d__tagline" style={{ fontSize: Math.round(wordmarkSize * 0.382), ...(taglineColor ? { color: taglineColor } : {}) }}>
            LANGUAGE, PROTECTED
          </div>
        </>
      )}
    </div>
  );
}

export function Logo3D(props: Logo3DProps) {
  return (
    <Suspense fallback={<LogoFallback {...props} />}>
      <Logo3DCanvas {...props} />
    </Suspense>
  );
}
