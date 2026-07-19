export function isYouTubeExtractionDisabled(): boolean {
  const explicitlyDisabled = process.env.DISABLE_YOUTUBE_EXTRACTION === 'true' || process.env.NEXT_PUBLIC_DISABLE_YOUTUBE_EXTRACTION === 'true';
  const explicitlyAllowed = process.env.ALLOW_YOUTUBE_EXTRACTION === 'true';

  if (explicitlyDisabled) {
    return true;
  }

  if (explicitlyAllowed) {
    return false;
  }

  return Boolean(process.env.VERCEL);
}

export function getYouTubeRestrictionMessage(): string {
  return 'YouTube extraction is disabled in this deployment because YouTube blocks automated requests and this app cannot bypass their anti-bot protections. Please use an authorized backend or a supported source.';
}
