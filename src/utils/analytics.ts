declare global {
  interface Window {
    dataLayer: unknown[][];
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
const GA4_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/;

export const initializeAnalytics = (): void => {
  if (!GA_MEASUREMENT_ID) return;
  if (!GA4_MEASUREMENT_ID_PATTERN.test(GA_MEASUREMENT_ID)) return;

  const existingScript = document.querySelector(
    `script[data-ga4-id="${GA_MEASUREMENT_ID}"]`
  );
  if (existingScript) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_MEASUREMENT_ID)}`;
  script.dataset.ga4Id = GA_MEASUREMENT_ID;
  document.head.appendChild(script);

  window.dataLayer = window.dataLayer || [];
  const pushGtagEvent = (...args: unknown[]): void => {
    window.dataLayer.push(args);
  };
  pushGtagEvent("js", new Date());
  pushGtagEvent("config", GA_MEASUREMENT_ID);
};
