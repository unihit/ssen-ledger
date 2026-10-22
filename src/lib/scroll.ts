export function navigateTo(top = true): void {
  if (top) {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
}
