export function isAdRevenueV3Enabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function isExplicitlyEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}
