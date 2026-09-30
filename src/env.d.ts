/// <reference types="astro/client" />
/// <reference types="@cloudflare/workers-types" />

type D1DatabaseEnv = {
  DB: D1Database;
  vendly?: D1Database;
  fogon?: D1Database;
};

type Runtime = import('@astrojs/cloudflare').Runtime<D1DatabaseEnv>;

declare namespace App {
  interface Locals extends Runtime {}
}
