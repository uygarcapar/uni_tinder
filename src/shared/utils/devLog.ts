/**
 * Dev-only logger: no-op in production builds.
 * Use instead of console.log so release bundles stay quiet.
 */
export const devLog = (...args: unknown[]) => {
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(...args);
  }
};
