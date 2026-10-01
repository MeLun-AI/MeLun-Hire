/* ------------------------------------------------------------------ */
/*  MeLunLogo — the single canonical MeLun brand logo.                 */
/*                                                                     */
/*  Renders the supplied MeLun PNG asset pack (public/assets/images/   */
/*  logos). The artwork is never redrawn, recoloured, traced, skewed,  */
/*  stretched or rotated — this component only selects and displays    */
/*  the correct supplied file for the background it sits on.           */
/*                                                                     */
/*    01. Primary logo ...... <MeLunLogo variant="primary" />          */
/*    02. Wordmark .......... <MeLunLogo wordmarkOnly />               */
/*    03. Icon / brand mark . <MeLunMark />                            */
/*    04. Variations ........ primary | onDark | auto |                */
/*                            monochromeBlack | monochromeWhite        */
/* ------------------------------------------------------------------ */

/* ---- 08. Colour palette (brand reference; kept for API parity) ----- */
export const MELUN_COLORS = {
  melonGreen: '#22C55E',
  leafGreen: '#84CC16',
  melonOrange: '#FB923C',
  softPeach: '#FED7AA',
  navy: '#0F172A',
} as const;

/* ---- 04. Logo variations ------------------------------------------ */
export type MeLunLogoVariant =
  | 'primary' /* full colour — light backgrounds */
  | 'onDark' /* on-dark — navy / dark surfaces */
  | 'auto' /* follows the app theme (.theme-light) */
  | 'monochromeBlack'
  | 'monochromeWhite';

/** 07. Smallest size (px) at which the full lockup stays readable. */
export const MELUN_LOGO_MIN_SIZE = 20;

/* ---- Supplied PNG assets (public/assets/images/logos) -------------- */
const LOGOS = {
  primary: '/assets/images/logos/primary/melun-primary.png',
  fullColor: '/assets/images/logos/variants/melun-full-color.png',
  onDark: '/assets/images/logos/variants/melun-on-dark.png',
  black: '/assets/images/logos/variants/melun-black.png',
  white: '/assets/images/logos/variants/melun-white.png',
  wordmark: '/assets/images/logos/wordmark/melun-wordmark.png',
  iconLight: '/assets/images/logos/icon/melun-icon-light.png',
  iconDark: '/assets/images/logos/icon/melun-icon-dark.png',
  iconMono: '/assets/images/logos/icon/melun-icon-monochrome.png',
} as const;

const MARK_GAP_RATIO = 0.2; /* 06. clear space before the tagline */
const SUBTITLE_RATIO = 0.27;

/** The supplied file to show on a light surface and on a dark surface. */
interface SourcePair {
  light: string;
  dark: string;
}

/**
 * Resolve a variation to the supplied asset(s). `auto` returns two files so
 * the artwork can follow the app theme; every other variation is fixed.
 */
function sourcesFor(variant: MeLunLogoVariant, kind: 'lockup' | 'mark'): SourcePair {
  if (kind === 'lockup') {
    switch (variant) {
      case 'primary':
        return { light: LOGOS.primary, dark: LOGOS.primary };
      case 'onDark':
        return { light: LOGOS.onDark, dark: LOGOS.onDark };
      case 'monochromeBlack':
        return { light: LOGOS.black, dark: LOGOS.black };
      case 'monochromeWhite':
        return { light: LOGOS.white, dark: LOGOS.white };
      default:
        return { light: LOGOS.fullColor, dark: LOGOS.onDark };
    }
  }
  switch (variant) {
    case 'onDark':
      return { light: LOGOS.iconDark, dark: LOGOS.iconDark };
    case 'monochromeBlack':
    case 'monochromeWhite':
      return { light: LOGOS.iconMono, dark: LOGOS.iconMono };
    case 'primary':
      return { light: LOGOS.iconLight, dark: LOGOS.iconLight };
    default:
      return { light: LOGOS.iconLight, dark: LOGOS.iconDark };
  }
}

/** One supplied logo file at the requested height, never stretched. */
function LogoImage({ src, height, className = '' }: { src: string; height: number; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      aria-hidden
      draggable={false}
      className={className}
      style={{ height, width: 'auto', objectFit: 'contain' }}
    />
  );
}

/** The supplied file(s) for one variation, swapped by theme when they differ. */
function LogoGlyph({ source, height }: { source: SourcePair; height: number }) {
  if (source.light === source.dark) return <LogoImage src={source.dark} height={height} />;
  return (
    <>
      <LogoImage src={source.dark} height={height} className="melun-logo-on-dark" />
      <LogoImage src={source.light} height={height} className="melun-logo-on-light" />
    </>
  );
}

/* ================================================================== */
/*  03. Icon / Brand Mark — standalone mark for icon-only spaces.       */
/* ================================================================== */

export function MeLunMark({
  size = 32,
  variant = 'primary',
  className = '',
  title,
}: {
  /** Height of the mark in px. */
  size?: number;
  variant?: MeLunLogoVariant;
  className?: string;
  /** Accessible name. Omit for purely decorative marks. */
  title?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center ${className}`}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <LogoGlyph source={sourcesFor(variant, 'mark')} height={size} />
    </span>
  );
}

/* ================================================================== */
/*  01. Primary logo  +  02. Wordmark                                   */
/* ================================================================== */

export default function MeLunLogo({
  size = 36,
  variant = 'primary',
  showWordmark = true,
  wordmarkOnly = false,
  subtitle = '',
  wordmarkVisibility = 'sm',
  className = '',
}: {
  /** Height of the logo in px. */
  size?: number;
  variant?: MeLunLogoVariant;
  /** Full lockup (mark + wordmark); `false` shows the icon mark only. */
  showWordmark?: boolean;
  /** Show the supplied text-only wordmark — compact areas. */
  wordmarkOnly?: boolean;
  /** Optional tagline rendered next to the logo ('' hides it). */
  subtitle?: string;
  /** 'sm' / 'lg' swap the full lockup for the icon mark on smaller screens. */
  wordmarkVisibility?: 'sm' | 'lg' | 'always';
  className?: string;
}) {
  /* 02. Wordmark — compact text-only branding. */
  if (wordmarkOnly) {
    return (
      <span className={`inline-flex min-w-0 items-center ${className}`}>
        <LogoImage src={LOGOS.wordmark} height={size} />
      </span>
    );
  }

  const hasSubtitle = subtitle.trim().length > 0;
  const subtitleFontSize = Math.max(9, Math.min(11, Math.round(size * SUBTITLE_RATIO)));
  const mark = sourcesFor(variant, 'mark');
  const lockup = sourcesFor(variant, 'lockup');
  const iconClass =
    wordmarkVisibility === 'sm' ? 'sm:hidden' : wordmarkVisibility === 'lg' ? 'lg:hidden' : 'hidden';
  const lockupClass =
    wordmarkVisibility === 'sm'
      ? 'hidden sm:block'
      : wordmarkVisibility === 'lg'
        ? 'hidden lg:block'
        : 'block';

  return (
    <span
      className={`flex min-w-0 items-center ${className}`}
      style={{ gap: Math.round(size * MARK_GAP_RATIO) }}
    >
      {showWordmark ? (
        <>
          {/* Icon mark — shown where the full lockup does not fit. */}
          <span className={`${iconClass} shrink-0`}>
            <LogoGlyph source={mark} height={size} />
          </span>
          {/* Full lockup — the primary website / header logo. */}
          <span className={`${lockupClass} shrink-0`}>
            <LogoGlyph source={lockup} height={size} />
          </span>
        </>
      ) : (
        <LogoGlyph source={mark} height={size} />
      )}

      {hasSubtitle && (
        <span
          className="whitespace-nowrap text-gray-500 tracking-wider"
          style={{ fontSize: subtitleFontSize }}
        >
          {subtitle}
        </span>
      )}
    </span>
  );
}

