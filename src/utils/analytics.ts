declare global {
  interface Window {
    dataLayer: unknown[];
  }
}

const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

export const initializeAnalytics = (): void => {
  if (!GA_MEASUREMENT_ID) return;

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
  const gtag = (...args: unknown[]): void => {
    window.dataLayer.push(args);
  };
  gtag("js", new Date());
  gtag("config", GA_MEASUREMENT_ID);
};
