export function isYouTubeExtractionDisabled(): boolean {
  const explicitlyDisabled = process.env.DISABLE_YOUTUBE_EXTRACTION === 'true' || process.env.NEXT_PUBLIC_DISABLE_YOUTUBE_EXTRACTION === 'true';
  const explicitlyAllowed = process.env.ALLOW_YOUTUBE_EXTRACTION === 'true' || process.env.NEXT_PUBLIC_ALLOW_YOUTUBE_EXTRACTION === 'true';

  if (explicitlyDisabled) {
    return true;
  }

  if (explicitlyAllowed) {
    return false;
  }

  return Boolean(process.env.VERCEL);
}

export function getYouTubeRestrictionMessage(): string {
  return 'YouTube extraction is disabled in this deployment. Set ALLOW_YOUTUBE_EXTRACTION=true only in a trusted environment with a compliant backend, or use a supported source.';
}
