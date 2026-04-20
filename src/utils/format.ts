export function truncate(text: string, maxLength = 400): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function asYesNo(value: boolean): string {
  return value ? "yes" : "no";
}
