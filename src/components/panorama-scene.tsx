export const PANORAMA_WIDTH = 960
export const PANORAMA_HEIGHT = 300

/** A 960 x 300 panorama with a sun and birds placed so they cross the seams when it's split into slides. */
export function PanoramaScene() {
  return (
    <>
      <rect width="960" height="300" fill="#e9e2fb" />
      <circle cx="478" cy="118" r="52" fill="#f4b886" />
      <path d="M150 88 q8 -8 16 0 q8 -8 16 0" className="landing-bird" />
      <path d="M226 66 q7 -7 14 0 q7 -7 14 0" className="landing-bird" />
      <path
        d="M0 188 L80 142 L150 172 L232 112 L310 158 L384 124 L470 176 L548 132 L628 166 L716 104 L800 158 L872 128 L960 166 L960 300 L0 300 Z"
        fill="#c7b6f6"
      />
      <path
        d="M0 222 C90 192 150 204 236 184 C320 164 380 212 470 204 C560 196 620 162 712 188 C800 212 870 190 960 202 L960 300 L0 300 Z"
        fill="#9a7cec"
      />
      <path
        d="M0 252 C120 230 204 262 326 242 C446 222 528 258 648 246 C766 234 846 220 960 240 L960 300 L0 300 Z"
        fill="#6a48dc"
      />
      <path
        d="M0 282 C160 268 302 292 482 276 C662 260 802 288 960 274 L960 300 L0 300 Z"
        fill="#2d2166"
      />
    </>
  )
}
