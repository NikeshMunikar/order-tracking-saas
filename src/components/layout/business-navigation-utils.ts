export function closeMenuOnEscape(
  key: string,
  close: () => void,
  focusTrigger: () => void,
): boolean {
  if (key !== "Escape") {
    return false;
  }

  close();
  focusTrigger();
  return true;
}

export function shouldCloseMenuOnPathnameChange(
  previousPathname: string,
  pathname: string,
): boolean {
  return previousPathname !== pathname;
}
