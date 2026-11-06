/**
 * Runs before hydration so the correct theme is applied on first paint -
 * without this, the page would flash light before React mounts and reads
 * the persisted preference.
 */
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var stored = localStorage.getItem('bata-pos-cashier-theme');
    // The cashier terminal defaults to the premium dark design (per the Dark
    // Mode Showcase reference) unless the cashier has explicitly chosen light.
    var theme = stored === 'dark' || stored === 'light' ? stored : 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export function ThemeInitScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />;
}
